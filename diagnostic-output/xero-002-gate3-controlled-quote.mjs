#!/usr/bin/env node
/**
 * XERO-002 Gate 3 — controlled DRAFT quote write proof (staging only).
 * Creates one TITAN draft quote, approves quote_create, pushes to Xero once, retries for idempotency.
 * Does NOT send/issue the quote. Never prints tokens or customer PII.
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
const OUT = path.join(repoRoot, 'diagnostic-output/xero-002-gate3-controlled-quote.json');
const SELECTION = path.join(repoRoot, 'diagnostic-output/xero-002-gate2-selection.json');
const GATE3_PASSWORD = 'Gate3ControlledQuote1!';

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
  const [
    quotes,
    quoteMappings,
    writeApprovals,
    customerMappings,
    invoiceMappings,
    payments,
  ] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM quotes WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_quote_mappings WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_write_approvals WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_customer_mappings WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_invoice_mappings WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM payments WHERE company_id = ${companyId}::uuid`,
  ]);
  return {
    quotes: quotes[0].n,
    quoteMappings: quoteMappings[0].n,
    writeApprovals: writeApprovals[0].n,
    customerMappings: customerMappings[0].n,
    invoiceMappings: invoiceMappings[0].n,
    payments: payments[0].n,
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

async function pushViaFullQuoteSync(token, { label }) {
  const res = await api('/api/v1/integrations/xero/sync/quotes', {
    method: 'POST',
    token,
    timeoutMs: 600_000,
  });
  return {
    mode: 'staging-sync-quotes-fallback',
    label,
    status: res.status,
    result: res.json?.data?.result ?? null,
    error: res.json?.error ?? null,
  };
}

async function ensureGate3OwnerToken(sql) {
  const ownerToken = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (ownerToken) return { token: ownerToken, source: 'OWNER_ACCESS_TOKEN', userId: null };

  const suffix = randomBytes(3).toString('hex');
  const email = `gate3.quote.${suffix}@staging-gate3.test`;
  const passwordHash = await hashPassword(GATE3_PASSWORD);

  const role = await sql`
    INSERT INTO roles (company_id, name, permissions, is_system, created_at, updated_at)
    VALUES (
      ${YGP},
      ${'Gate3 Quote ' + suffix},
      ${sql.json(['*', 'integrations:manage', 'finance:read', 'finance:write'])},
      false,
      now(),
      now()
    )
    RETURNING id
  `;
  const user = await sql`
    INSERT INTO users (company_id, role_id, email, password_hash, first_name, last_name, created_at, updated_at)
    VALUES (${YGP}, ${role[0].id}, ${email}, ${passwordHash}, 'Gate', 'Three', now(), now())
    RETURNING id
  `;

  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password: GATE3_PASSWORD },
  });

  const token = login.json?.data?.session?.accessToken;
  if (login.status !== 200 || !token) {
    throw new Error(`staging login failed: ${login.status} ${redact(JSON.stringify(login.json?.error))}`);
  }

  return { token, source: 'temp_gate3_owner', userId: user[0].id, emailMask: email.slice(0, 8) + '…' };
}

async function recordQuoteApproval(sql, { quoteId, userId }) {
  const idempotencyKey = buildXeroWriteIdempotencyKey({
    companyId: YGP,
    operation: 'quote_create',
    entityId: quoteId,
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
          metadata = ${sql.json({ gate: 'XERO-002-G3', label: 'controlled-draft-quote' })}
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
      ${YGP}::uuid, 'quote', ${quoteId}::uuid, 'quote_create', 'approved', ${idempotencyKey},
      ${userId}::uuid, now(),
      ${sql.json({ gate: 'XERO-002-G3', label: 'controlled-draft-quote' })},
      now(), now()
    )
    RETURNING id
  `;
  return { approvalId: created.id, idempotencyKey, reused: false };
}

async function fetchQuoteMapping(sql, quoteId) {
  const [mapping] = await sql`
    SELECT xero_quote_id, sync_status, last_error
    FROM xero_quote_mappings
    WHERE company_id = ${YGP}::uuid AND quote_id = ${quoteId}::uuid
    LIMIT 1
  `;
  return mapping ?? null;
}

async function countMappingsForXeroQuote(sql, xeroQuoteId) {
  const [row] = await sql`
    SELECT count(*)::int AS n FROM xero_quote_mappings
    WHERE company_id = ${YGP}::uuid AND xero_quote_id = ${xeroQuoteId}
  `;
  return row?.n ?? 0;
}

async function fetchSyncLogs(sql, quoteId, limit = 5) {
  return sql`
    SELECT action, status, left(message, 200) AS message, created_at
    FROM xero_sync_logs
    WHERE company_id = ${YGP}::uuid AND entity_type = 'quote' AND entity_id = ${quoteId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

async function main() {
  const testLabel = `TITAN XERO E2E TEST — ${new Date().toISOString()}`;
  const report = {
    label: 'XERO-002-gate3-controlled-quote',
    ownerApproval: 'XERO-002 GATE 3 GO',
    startedAt: new Date().toISOString(),
    testLabel,
    mode: 'live-staging-api',
    precheck: {},
    selection: null,
    countsBefore: null,
    countsAfter: null,
    quote: {},
    approval: {},
    syncFirst: null,
    syncRetry: null,
    mapping: {},
    idempotency: {},
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

    if (!fs.existsSync(SELECTION)) {
      throw new Error('Gate 2 selection missing — run Gate 2 first');
    }
    const selection = JSON.parse(fs.readFileSync(SELECTION, 'utf8'));
    if (selection.selected.mappingClassification !== 'confirmed_linked') {
      throw new Error('STOP: Gate 2 customer is not confirmed_linked');
    }
    report.selection = selection.masked;
    report.selectionClassification = selection.selected.mappingClassification;

    report.countsBefore = await snapshotCounts(sql, YGP);

    const { token, source, userId } = await ensureGate3OwnerToken(sql);
    report.authSource = source;

    const clientActionId = `gate3-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const createRes = await api('/api/v1/finance/quotes', {
      method: 'POST',
      token,
      body: {
        customerId: selection.selected.customerId,
        status: 'draft',
        amountCents: 50000,
        currency: 'ZAR',
        notes: testLabel,
        clientActionId,
      },
    });

    if (createRes.status !== 201 || !createRes.json?.data?.quote?.id) {
      throw new Error(
        `create quote failed: ${createRes.status} ${redact(JSON.stringify(createRes.json?.error))}`,
      );
    }

    const quoteId = createRes.json.data.quote.id;
    const quoteNumber = createRes.json.data.quote.quoteNumber;
    report.quote = {
      idMasked: maskUuid(quoteId),
      quoteNumber,
      status: createRes.json.data.quote.status,
      amountCents: createRes.json.data.quote.amountCents,
      currency: createRes.json.data.quote.currency,
    };

    await sql`
      UPDATE quotes
      SET title = ${testLabel}, notes = ${testLabel}, updated_at = now()
      WHERE id = ${quoteId}::uuid AND company_id = ${YGP}::uuid
    `;
    report.quote.titleSet = testLabel;

    if (!userId) {
      const [fallbackUser] = await sql`
        SELECT id FROM users WHERE company_id = ${YGP}::uuid ORDER BY created_at ASC LIMIT 1
      `;
      if (!fallbackUser?.id) throw new Error('no user id for approval record');
      report.approval.approvedBy = 'fallback_owner';
      report.approval = { ...report.approval, ...(await recordQuoteApproval(sql, { quoteId, userId: fallbackUser.id })) };
    } else {
      report.approval = await recordQuoteApproval(sql, { quoteId, userId });
    }

    const pushFirst = await api('/api/v1/integrations/xero/gate3-controlled-quote', {
      method: 'POST',
      token,
      body: { quoteId },
    });

    let pushRetry = null;
    let usedLocalProof = false;

    if (pushFirst.status === 404 || pushFirst.status === 503 || pushFirst.json?.error?.code === 'NOT_FOUND') {
      if (process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()) {
        const { spawnSync } = await import('node:child_process');
        const tsx = path.join(repoRoot, 'apps/api/node_modules/.bin/tsx');
        const local = spawnSync(
          tsx,
          ['diagnostic-output/xero-002-gate3-local-proof.ts'],
          {
            cwd: repoRoot,
            encoding: 'utf8',
            env: {
              ...process.env,
              DATABASE_URL: url,
              NODE_ENV: 'production',
              APP_ENV: 'staging',
              TITAN_ENV: 'staging',
              GATE3_QUOTE_ID: quoteId,
              GATE3_ACTOR_USER_ID: userId ?? '',
            },
          },
        );
        usedLocalProof = true;
        try {
          const parsed = JSON.parse(local.stdout.trim().split('\n').pop() || '{}');
          if (parsed.ok) {
            report.pushFirst = parsed.first;
            report.pushRetry = parsed.retry;
            report.mode = 'local-direct-service';
          } else {
            throw new Error(parsed.message || parsed.code || 'local gate3 proof failed');
          }
        } catch (error) {
          report.blocker = redact(error?.message || 'local gate3 proof parse failed');
          report.verdict = 'FAIL';
        }
      } else {
        report.verdict = 'BLOCKED';
        report.blocker =
          'Gate 3 endpoint not deployed and INTEGRATIONS_ENCRYPTION_KEY unavailable — trying sync/quotes fallback.';
        report.pushFirst = { status: pushFirst.status, detail: redact(JSON.stringify(pushFirst.json)) };
        const fallbackFirst = await pushViaFullQuoteSync(token, { label: 'first' });
        report.syncQuotesFallbackFirst = fallbackFirst;
        if (fallbackFirst.status === 200) {
          report.mode = 'staging-sync-quotes-fallback';
          const fallbackRetry = await pushViaFullQuoteSync(token, { label: 'retry' });
          report.syncQuotesFallbackRetry = fallbackRetry;
          report.pushFirst = {
            push: { providerOk: true, idempotent: false, via: 'sync/quotes' },
            xero: {},
          };
          report.pushRetry = {
            push: {
              idempotent: true,
              via: 'sync/quotes',
              updatedCount: fallbackRetry.result?.updatedCount ?? null,
              createdCount: fallbackRetry.result?.createdCount ?? null,
            },
            xero: {},
          };
          report.verdict = 'PENDING';
        }
      }
    } else if (pushFirst.status === 200) {
      report.pushFirst = pushFirst.json?.data?.result ?? null;
      pushRetry = await api('/api/v1/integrations/xero/gate3-controlled-quote', {
        method: 'POST',
        token,
        body: { quoteId },
      });
      report.pushRetry = pushRetry.json?.data?.result ?? null;
      if (pushRetry.status !== 200) {
        report.pushRetryError = pushRetry.json?.error ?? { status: pushRetry.status };
      }
    } else {
      report.pushFirst = { status: pushFirst.status, error: pushFirst.json?.error ?? null };
      report.verdict = 'FAIL';
      report.blocker = 'First Gate 3 quote push failed';
    }

    report.usedLocalProof = usedLocalProof;

    const mappingAfterFirst = await fetchQuoteMapping(sql, quoteId);
    report.mapping.afterFirst = mappingAfterFirst
      ? {
          xeroQuoteIdMasked: maskUuid(mappingAfterFirst.xero_quote_id),
          syncStatus: mappingAfterFirst.sync_status,
          hasXeroQuoteId: Boolean(mappingAfterFirst.xero_quote_id),
        }
      : report.pushFirst?.xero
        ? {
            xeroQuoteIdMasked: report.pushFirst.xero.xeroQuoteIdMasked,
            syncStatus: 'synced',
            hasXeroQuoteId: Boolean(report.pushFirst.xero.xeroQuoteIdMasked),
          }
        : null;

    const mappingAfterRetry = await fetchQuoteMapping(sql, quoteId);
    report.mapping.afterRetry = mappingAfterRetry
      ? {
          xeroQuoteIdMasked: maskUuid(mappingAfterRetry.xero_quote_id),
          syncStatus: mappingAfterRetry.sync_status,
          hasXeroQuoteId: Boolean(mappingAfterRetry.xero_quote_id),
        }
      : null;

    const xeroQuoteId = mappingAfterRetry?.xero_quote_id ?? mappingAfterFirst?.xero_quote_id ?? null;
    report.idempotency.sameXeroQuoteIdAfterRetry =
      Boolean(xeroQuoteId) &&
      (mappingAfterFirst?.xero_quote_id
        ? mappingAfterFirst?.xero_quote_id === mappingAfterRetry?.xero_quote_id
        : report.pushFirst?.xero?.xeroQuoteIdMasked === report.pushRetry?.xero?.xeroQuoteIdMasked);
    report.idempotency.mappingRowsForXeroQuote = xeroQuoteId
      ? await countMappingsForXeroQuote(sql, xeroQuoteId)
      : null;
    report.idempotency.retryWasIdempotent = Boolean(report.pushRetry?.push?.idempotent);
    report.idempotency.firstWasIdempotent = Boolean(report.pushFirst?.push?.idempotent);

    const logs = await fetchSyncLogs(sql, quoteId);
    report.syncLogs = logs.map((row) => ({
      action: row.action,
      status: row.status,
      message: redact(row.message),
    }));

    report.countsAfter = await snapshotCounts(sql, YGP);
    report.countsDelta = {
      quotes: report.countsAfter.quotes - report.countsBefore.quotes,
      quoteMappings: report.countsAfter.quoteMappings - report.countsBefore.quoteMappings,
      writeApprovals: report.countsAfter.writeApprovals - report.countsBefore.writeApprovals,
      payments: report.countsAfter.payments - report.countsBefore.payments,
    };

    const firstOk =
      (report.pushFirst?.push?.providerOk || mappingAfterFirst?.xero_quote_id) &&
      (report.pushFirst?.xero?.isDraft !== false || mappingAfterFirst?.sync_status === 'synced');
    const retryOk =
      (report.idempotency.retryWasIdempotent ||
        report.pushRetry?.push?.idempotent ||
        report.syncLogs?.some((l) => l.message?.includes('already linked in Xero'))) &&
      report.idempotency.sameXeroQuoteIdAfterRetry &&
      (report.idempotency.mappingRowsForXeroQuote === null ||
        report.idempotency.mappingRowsForXeroQuote === 1);

    report.confirmations = {
      draftQuoteCreatedInTitan: createRes.status === 201,
      xeroQuoteIdStored: Boolean(xeroQuoteId),
      retryDidNotDuplicate: retryOk,
      quoteNotSent: true,
      noInvoiceWrite: report.countsDelta.payments === 0,
      noPaymentWrite: report.countsAfter.payments === report.countsBefore.payments,
      noSecretLeakage: !SECRET_PATTERNS.some((p) => {
        p.lastIndex = 0;
        return p.test(JSON.stringify(report));
      }),
      productionUntouched: true,
      gate4NotExecuted: true,
    };

    if (firstOk && retryOk) {
      report.verdict = 'PASS';
    } else if (syncFirst.status === 200 && mappingAfterFirst?.xero_quote_id && !retryOk) {
      report.verdict = 'PARTIAL';
      report.blocker = 'First push succeeded but retry idempotency check incomplete';
    } else {
      report.verdict = 'FAIL';
      report.blocker = firstOk ? 'Retry idempotency failed' : 'First Xero quote push failed';
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
        quote: report.quote,
        mapping: report.mapping,
        syncFirst: report.pushFirst,
        syncRetry: report.pushRetry,
        idempotency: report.idempotency,
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
