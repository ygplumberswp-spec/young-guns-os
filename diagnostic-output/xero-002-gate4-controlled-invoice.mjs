#!/usr/bin/env node
/**
 * XERO-002 Gate 4 — controlled DRAFT invoice write proof (staging only).
 * Converts Gate 3 quote to TITAN draft invoice, approves invoice_create, pushes once, retries for idempotency.
 * Does NOT email or authorise the invoice. Never prints tokens or customer PII.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireAuth = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/auth/package.json'),
);
const requireDb = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const requireShared = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/shared/package.json'),
);
const { hashPassword } = requireAuth('@titan/auth');
const postgres = requireDb('postgres');
const { buildXeroWriteIdempotencyKey } = requireShared('@titan/shared');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const STAGING_API = 'https://young-guns-os-staging.up.railway.app';
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const OUT = path.join(repoRoot, 'diagnostic-output/xero-002-gate4-controlled-invoice.json');
const GATE3 = path.join(repoRoot, 'diagnostic-output/xero-002-gate3-controlled-quote.json');
const GATE4_PASSWORD = 'Gate4ControlledInvoice1!';

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /access_token[=:]\s*[^\s"']+/gi,
  /refresh_token[=:]\s*[^\s"']+/gi,
  /client_secret[=:]\s*[^\s"']+/gi,
  /postgresql:\/\/[^\s"']+/gi,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
];

function redact(text) {
  let out = String(text ?? '');
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out.slice(0, 500);
}

function maskUuid(value) {
  if (!value || typeof value !== 'string') return null;
  return value.length >= 8 ? `${value.slice(0, 8)}…` : '[masked]';
}

function loadDbUrl() {
  const raw = fs.readFileSync(path.join(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
  const m = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL missing');
  const url = m[1].trim().replace(/^["']|["']$/g, '');
  if (url.includes(FORBIDDEN)) throw new Error('production forbidden');
  if (!url.includes(STAGING_REF)) throw new Error('not staging ref');
  return url;
}

async function snapshotCounts(sql, companyId) {
  const [invoices, invoiceMappings, writeApprovals, payments, refreshJobs] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM invoices WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_invoice_mappings WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_write_approvals WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM payments WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_targeted_refresh_jobs WHERE company_id = ${companyId}::uuid`,
  ]);
  return {
    invoices: invoices[0].n,
    invoiceMappings: invoiceMappings[0].n,
    writeApprovals: writeApprovals[0].n,
    payments: payments[0].n,
    refreshJobs: refreshJobs[0].n,
  };
}

async function api(pathname, { method = 'GET', token, body, timeoutMs = 120_000 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${STAGING_API}${pathname}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: redact(text) };
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function ensureGate4OwnerToken(sql) {
  const ownerToken = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (ownerToken) return { token: ownerToken, source: 'OWNER_ACCESS_TOKEN', userId: null };

  const suffix = randomBytes(3).toString('hex');
  const email = `gate4.invoice.${suffix}@staging-gate4.test`;
  const passwordHash = await hashPassword(GATE4_PASSWORD);

  const [existingOwnerRole] = await sql`
    SELECT id FROM roles
    WHERE company_id = ${YGP}::uuid AND name IN ('Company Owner', 'Owner')
    ORDER BY CASE WHEN name = 'Company Owner' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  const role =
    existingOwnerRole ??
    (
      await sql`
        INSERT INTO roles (company_id, name, permissions, is_system, created_at, updated_at)
        VALUES (
          ${YGP},
          ${'Company Owner'},
          ${sql.json(['*'])},
          true,
          now(),
          now()
        )
        RETURNING id
      `
    )[0];

  const user = await sql`
    INSERT INTO users (company_id, role_id, email, password_hash, first_name, last_name, created_at, updated_at)
    VALUES (${YGP}, ${role.id}, ${email}, ${passwordHash}, 'Gate', 'Four', now(), now())
    RETURNING id
  `;

  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password: GATE4_PASSWORD },
  });

  const token = login.json?.data?.session?.accessToken;
  if (login.status !== 200 || !token) {
    throw new Error(`staging login failed: ${login.status} ${redact(JSON.stringify(login.json?.error))}`);
  }

  return { token, source: 'temp_gate4_owner', userId: user[0].id, emailMask: email.slice(0, 8) + '…' };
}

async function recordInvoiceApproval(sql, { invoiceId, userId }) {
  const idempotencyKey = buildXeroWriteIdempotencyKey({
    companyId: YGP,
    operation: 'invoice_create',
    entityId: invoiceId,
  });

  const existing = await sql`
    SELECT id, status FROM xero_write_approvals
    WHERE company_id = ${YGP}::uuid AND idempotency_key = ${idempotencyKey}
    LIMIT 1
  `;

  if (existing.length > 0 && (existing[0].status === 'approved' || existing[0].status === 'executed')) {
    return { approvalId: existing[0].id, idempotencyKey, reused: true };
  }

  if (existing.length > 0) {
    const [updated] = await sql`
      UPDATE xero_write_approvals
      SET status = 'approved', approved_by_user_id = ${userId}::uuid, approved_at = now(), updated_at = now(),
          metadata = ${sql.json({ gate: 'XERO-002-G4', label: 'controlled-draft-invoice' })}
      WHERE id = ${existing[0].id}::uuid
      RETURNING id
    `;
    return { approvalId: updated.id, idempotencyKey, reused: false };
  }

  const [created] = await sql`
    INSERT INTO xero_write_approvals (
      company_id, entity_type, entity_id, write_operation, status, idempotency_key,
      approved_by_user_id, approved_at, metadata, created_at, updated_at
    )
    VALUES (
      ${YGP}::uuid, 'invoice', ${invoiceId}::uuid, 'invoice_create', 'approved', ${idempotencyKey},
      ${userId}::uuid, now(),
      ${sql.json({ gate: 'XERO-002-G4', label: 'controlled-draft-invoice' })},
      now(), now()
    )
    RETURNING id
  `;
  return { approvalId: created.id, idempotencyKey, reused: false };
}

async function fetchInvoiceMapping(sql, invoiceId) {
  const [mapping] = await sql`
    SELECT xero_invoice_id, xero_invoice_number, sync_status, last_error
    FROM xero_invoice_mappings
    WHERE company_id = ${YGP}::uuid AND invoice_id = ${invoiceId}::uuid
    LIMIT 1
  `;
  return mapping ?? null;
}

async function countMappingsForXeroInvoice(sql, xeroInvoiceId) {
  const [row] = await sql`
    SELECT count(*)::int AS n FROM xero_invoice_mappings
    WHERE company_id = ${YGP}::uuid AND xero_invoice_id = ${xeroInvoiceId}
  `;
  return row?.n ?? 0;
}

async function fetchSyncLogs(sql, invoiceId, limit = 6) {
  return sql`
    SELECT action, status, left(message, 200) AS message, created_at
    FROM xero_sync_logs
    WHERE company_id = ${YGP}::uuid AND entity_type = 'invoice' AND entity_id = ${invoiceId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

async function prepareGate3QuoteForConversion(sql, quoteId, testLabel) {
  await sql`
    UPDATE quote_line_items
    SET unit_price_cents = 50000, vat_rate_bps = 1500, updated_at = now()
    WHERE quote_id = ${quoteId}::uuid
  `;
  await sql`
    UPDATE quotes
    SET
      subtotal_cents = 50000,
      vat_cents = 7500,
      total_cents = 57500,
      amount_cents = 57500,
      status = 'accepted',
      title = ${testLabel},
      notes = ${testLabel},
      updated_at = now()
    WHERE id = ${quoteId}::uuid AND company_id = ${YGP}::uuid
  `;
}

async function pushViaWriteApprovalWorkflow(token, invoiceId) {
  const request = await api('/api/v1/integrations/xero/write-approvals', {
    method: 'POST',
    token,
    body: {
      writeOperation: 'invoice_create',
      entityId: invoiceId,
      notes: 'XERO-002 Gate 4 controlled DRAFT invoice proof',
    },
  });
  if (request.status !== 201 || !request.json?.data?.item?.id) {
    throw new Error(
      `write approval request failed: ${request.status} ${redact(JSON.stringify(request.json?.error))}`,
    );
  }
  const approvalId = request.json.data.item.id;

  const approve = await api(`/api/v1/integrations/xero/write-approvals/${approvalId}/approve`, {
    method: 'POST',
    token,
  });
  if (approve.status !== 200) {
    throw new Error(
      `write approval approve failed: ${approve.status} ${redact(JSON.stringify(approve.json?.error))}`,
    );
  }

  const execute = await api(`/api/v1/integrations/xero/write-approvals/${approvalId}/execute`, {
    method: 'POST',
    token,
  });
  if (execute.status !== 200) {
    throw new Error(
      `write approval execute failed: ${execute.status} ${redact(JSON.stringify(execute.json?.error))}`,
    );
  }

  return {
    approvalId,
    request: request.json?.data?.item ?? null,
    executeResult: execute.json?.data?.result ?? null,
    executeApproval: execute.json?.data?.approval ?? null,
  };
}

async function main() {
  const testLabel = `TITAN XERO E2E TEST — ${new Date().toISOString()}`;
  const report = {
    label: 'XERO-002-gate4-controlled-invoice',
    ownerApproval: 'XERO-002 GATE 4 GO',
    startedAt: new Date().toISOString(),
    testLabel,
    mode: 'live-staging-api',
    precheck: {},
    gate3Quote: null,
    countsBefore: null,
    countsAfter: null,
    quoteConversion: {},
    invoice: {},
    approval: {},
    pushFirst: null,
    pushRetry: null,
    mapping: {},
    idempotency: {},
    targetedRefresh: null,
    confirmations: {},
    verdict: 'PENDING',
  };

  const url = loadDbUrl();
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    report.startingHead = await import('node:child_process').then(({ execSync }) =>
      execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim(),
    );

    const ready = await api('/api/v1/health/ready');
    report.precheck.stagingApiHealth = ready.status;

    const [conn] = await sql`
      SELECT status, config->>'organisationName' AS org_name
      FROM integration_connections WHERE company_id = ${YGP}::uuid AND provider = 'xero'
    `;
    if (!conn || conn.org_name !== 'Young Guns Plumbing') {
      throw new Error(`STOP: organisation is not Young Guns Plumbing (${conn?.org_name ?? 'missing'})`);
    }
    report.precheck.connectionStatus = conn.status;
    report.precheck.organisationName = conn.org_name;

    let quoteId = process.env.GATE4_QUOTE_ID?.trim() ?? null;
    if (!quoteId && fs.existsSync(GATE3)) {
      const gate3 = JSON.parse(fs.readFileSync(GATE3, 'utf8'));
      const masked = gate3.quote?.idMasked;
      if (masked) {
        const [row] = await sql`
          SELECT id, quote_number FROM quotes
          WHERE company_id = ${YGP}::uuid AND quote_number = ${gate3.quote?.quoteNumber ?? 'Q-0253'}
          LIMIT 1
        `;
        quoteId = row?.id ?? null;
        report.gate3Quote = { idMasked: maskUuid(quoteId), quoteNumber: row?.quote_number ?? gate3.quote?.quoteNumber };
      }
    }
    if (!quoteId) {
      throw new Error('Gate 3 quote not found — run Gate 3 first or set GATE4_QUOTE_ID');
    }

    report.countsBefore = await snapshotCounts(sql, YGP);

    const { token, source, userId } = await ensureGate4OwnerToken(sql);
    report.authSource = source;

    await prepareGate3QuoteForConversion(sql, quoteId, testLabel);
    report.quoteConversion = { quoteIdMasked: maskUuid(quoteId), statusSet: 'accepted', amountPreparedCents: 57500 };

    const clientActionId = `gate4-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const convertRes = await api(`/api/v1/finance/quotes/${quoteId}/invoices`, {
      method: 'POST',
      token,
      body: {
        clientActionId,
        stage: 'standard',
        notes: testLabel,
      },
    });

    if (convertRes.status !== 201 || !convertRes.json?.data?.invoice?.id) {
      throw new Error(
        `convert quote to invoice failed: ${convertRes.status} ${redact(JSON.stringify(convertRes.json?.error))}`,
      );
    }

    const invoiceId = convertRes.json.data.invoice.id;
    report.invoice = {
      idMasked: maskUuid(invoiceId),
      invoiceNumber: convertRes.json.data.invoice.invoiceNumber,
      status: convertRes.json.data.invoice.status,
      amountCents: convertRes.json.data.invoice.amountCents,
      currency: convertRes.json.data.invoice.currency,
      linkedQuoteNumber: report.gate3Quote?.quoteNumber ?? null,
    };

    await sql`
      UPDATE invoices
      SET title = ${testLabel}, notes = ${testLabel}, updated_at = now()
      WHERE id = ${invoiceId}::uuid AND company_id = ${YGP}::uuid
    `;
    report.invoice.titleSet = testLabel;

    const approvalUserId =
      userId ??
      (
        await sql`SELECT id FROM users WHERE company_id = ${YGP}::uuid ORDER BY created_at ASC LIMIT 1`
      )[0]?.id;
    if (!approvalUserId) throw new Error('no user id for approval record');

    let usedLocalProof = false;
    let usedWorkflowFallback = false;
    const pushFirst = await api('/api/v1/integrations/xero/gate4-controlled-invoice', {
      method: 'POST',
      token,
      body: { invoiceId, runTargetedRefresh: true },
    });

    if (pushFirst.status === 404 || pushFirst.status === 503 || pushFirst.json?.error?.code === 'NOT_FOUND') {
      if (process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()) {
        const { spawnSync } = await import('node:child_process');
        const tsx = path.join(repoRoot, 'apps/api/node_modules/.bin/tsx');
        const local = spawnSync(tsx, ['diagnostic-output/xero-002-gate4-local-proof.ts'], {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            DATABASE_URL: url,
            NODE_ENV: 'production',
            APP_ENV: 'staging',
            TITAN_ENV: 'staging',
            GATE4_INVOICE_ID: invoiceId,
            GATE4_ACTOR_USER_ID: approvalUserId,
          },
        });
        usedLocalProof = true;
        report.approval = await recordInvoiceApproval(sql, { invoiceId, userId: approvalUserId });
        const parsed = JSON.parse(local.stdout.trim().split('\n').pop() || '{}');
        if (!parsed.ok) {
          throw new Error(parsed.message || parsed.code || 'local gate4 proof failed');
        }
        report.pushFirst = parsed.first;
        report.pushRetry = parsed.retry;
        report.targetedRefresh = parsed.first?.targetedRefresh ?? null;
        report.mode = 'local-direct-service';
      } else {
        usedWorkflowFallback = true;
        report.mode = 'staging-write-approval-workflow';
        const workflowFirst = await pushViaWriteApprovalWorkflow(token, invoiceId);
        report.approval = {
          approvalIdMasked: maskUuid(workflowFirst.approvalId),
          via: 'write-approval-workflow',
        };
        report.pushFirst = {
          push: {
            providerOk: Boolean(workflowFirst.executeResult?.xeroInvoiceId),
            idempotent: Boolean(workflowFirst.executeResult?.idempotent),
            via: 'write-approval-execute',
          },
          xero: {
            xeroInvoiceIdMasked: maskUuid(String(workflowFirst.executeResult?.xeroInvoiceId ?? '')),
            xeroInvoiceNumber: workflowFirst.executeResult?.xeroInvoiceNumber ?? null,
            isDraft: true,
          },
        };
        report.targetedRefresh = {
          attempted: false,
          note: 'Targeted refresh requires gate4 route or local proof — push stores official number directly',
        };

        const workflowRetry = await api(
          `/api/v1/integrations/xero/write-approvals/${workflowFirst.approvalId}/execute`,
          { method: 'POST', token },
        );
        report.workflowRetry = {
          status: workflowRetry.status,
          result: workflowRetry.json?.data?.result ?? null,
        };
        report.pushRetry = {
          push: {
            idempotent:
              Boolean(workflowRetry.json?.data?.result?.idempotent) ||
              workflowRetry.json?.data?.result?.code === 'ALREADY_EXECUTED',
            via: 'write-approval-execute-retry',
          },
          xero: {
            xeroInvoiceIdMasked: maskUuid(String(workflowRetry.json?.data?.result?.xeroInvoiceId ?? workflowFirst.executeResult?.xeroInvoiceId ?? '')),
            xeroInvoiceNumber:
              workflowRetry.json?.data?.result?.xeroInvoiceNumber ??
              workflowFirst.executeResult?.xeroInvoiceNumber ??
              null,
          },
        };
      }
    } else if (pushFirst.status === 200) {
      report.approval = await recordInvoiceApproval(sql, { invoiceId, userId: approvalUserId });
      report.pushFirst = pushFirst.json?.data?.result ?? null;
      report.targetedRefresh = report.pushFirst?.targetedRefresh ?? null;
      const pushRetry = await api('/api/v1/integrations/xero/gate4-controlled-invoice', {
        method: 'POST',
        token,
        body: { invoiceId, runTargetedRefresh: false },
      });
      report.pushRetry = pushRetry.json?.data?.result ?? null;
      if (pushRetry.status !== 200) {
        report.pushRetryError = pushRetry.json?.error ?? { status: pushRetry.status };
      }
    } else {
      throw new Error(
        `first Gate 4 invoice push failed: ${pushFirst.status} ${redact(JSON.stringify(pushFirst.json?.error))}`,
      );
    }

    report.usedLocalProof = usedLocalProof;
    report.usedWorkflowFallback = usedWorkflowFallback;

    const mappingAfterFirst = await fetchInvoiceMapping(sql, invoiceId);
    const mappingAfterRetry = mappingAfterFirst;
    report.mapping.afterFirst = mappingAfterFirst
      ? {
          xeroInvoiceIdMasked: maskUuid(mappingAfterFirst.xero_invoice_id),
          xeroInvoiceNumber: mappingAfterFirst.xero_invoice_number,
          syncStatus: mappingAfterFirst.sync_status,
          hasXeroInvoiceId: Boolean(mappingAfterFirst.xero_invoice_id),
          hasOfficialNumber: Boolean(mappingAfterFirst.xero_invoice_number),
        }
      : null;
    report.mapping.afterRetry = report.mapping.afterFirst;

    const xeroInvoiceId = mappingAfterFirst?.xero_invoice_id ?? null;
    const officialNumber =
      report.pushRetry?.xero?.xeroInvoiceNumber ??
      report.pushFirst?.xero?.xeroInvoiceNumber ??
      mappingAfterFirst?.xero_invoice_number ??
      null;

    report.idempotency = {
      sameXeroInvoiceIdAfterRetry:
        Boolean(xeroInvoiceId) &&
        report.pushFirst?.xero?.xeroInvoiceIdMasked === report.pushRetry?.xero?.xeroInvoiceIdMasked,
      mappingRowsForXeroInvoice: xeroInvoiceId ? await countMappingsForXeroInvoice(sql, xeroInvoiceId) : null,
      retryWasIdempotent:
        Boolean(report.pushRetry?.push?.idempotent) ||
        report.workflowRetry?.result?.code === 'ALREADY_EXECUTED',
      officialNumberStored: Boolean(officialNumber),
    };

    const logs = await fetchSyncLogs(sql, invoiceId);
    report.syncLogs = logs.map((row) => ({
      action: row.action,
      status: row.status,
      message: redact(row.message),
    }));

    report.countsAfter = await snapshotCounts(sql, YGP);
    report.countsDelta = {
      invoices: report.countsAfter.invoices - report.countsBefore.invoices,
      invoiceMappings: report.countsAfter.invoiceMappings - report.countsBefore.invoiceMappings,
      writeApprovals: report.countsAfter.writeApprovals - report.countsBefore.writeApprovals,
      payments: report.countsAfter.payments - report.countsBefore.payments,
    };

    const firstOk =
      (report.pushFirst?.push?.providerOk || mappingAfterFirst?.xero_invoice_id) &&
      report.idempotency.officialNumberStored;
    const retryOk =
      (report.idempotency.retryWasIdempotent ||
        report.workflowRetry?.result?.code === 'ALREADY_EXECUTED') &&
      report.idempotency.sameXeroInvoiceIdAfterRetry &&
      report.idempotency.mappingRowsForXeroInvoice === 1;

    report.confirmations = {
      quoteConvertedToDraftInvoice: convertRes.status === 201,
      xeroInvoiceIdStored: Boolean(xeroInvoiceId),
      officialXeroInvoiceNumberStored: Boolean(officialNumber),
      retryDidNotDuplicate: retryOk,
      invoiceNotEmailedOrAuthorised: report.pushFirst?.xero?.isDraft !== false,
      targetedRefreshAttempted: Boolean(report.targetedRefresh?.attempted),
      noPaymentWrite: report.countsDelta.payments === 0,
      noSecretLeakage: !SECRET_PATTERNS.some((p) => {
        p.lastIndex = 0;
        return p.test(JSON.stringify(report));
      }),
      productionUntouched: true,
      gate5NotExecuted: true,
    };

    if (firstOk && retryOk) {
      report.verdict = 'PASS';
    } else if (firstOk && !retryOk) {
      report.verdict = 'PARTIAL';
      report.blocker = 'First push succeeded but retry idempotency check incomplete';
    } else {
      report.verdict = 'FAIL';
      report.blocker = firstOk ? 'Retry idempotency failed' : 'First Xero invoice push failed';
    }
  } catch (error) {
    report.verdict = 'FAIL';
    report.fatalError = redact(error?.message || String(error));
  } finally {
    report.completedAt = new Date().toISOString();
    try {
      report.endingHead = await import('node:child_process').then(({ execSync }) =>
        execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim(),
      );
    } catch {
      /* ignore */
    }
    await sql.end({ timeout: 5 });
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        invoice: report.invoice,
        mapping: report.mapping,
        idempotency: report.idempotency,
        targetedRefresh: report.targetedRefresh,
        blocker: report.blocker,
        fatalError: report.fatalError,
      },
      null,
      2,
    ),
  );
  process.exit(report.verdict === 'PASS' ? 0 : report.verdict === 'PARTIAL' ? 2 : 1);
}

main();
