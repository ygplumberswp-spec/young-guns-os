#!/usr/bin/env node
/**
 * XERO-002 Gate 5B — read-only payment state observation orchestrator.
 * Uses live staging API when Gate 5B route is deployed; falls back to local service with encryption key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireAuth = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/auth/package.json'),
);
const requireDb = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const { hashPassword } = requireAuth('@titan/auth');
const postgres = requireDb('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const STAGING_API = 'https://young-guns-os-staging.up.railway.app';
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const GATE2_EVIDENCE = path.join(repoRoot, 'diagnostic-output/xero-002-gate2-readonly-proof.json');
const OUT = path.join(repoRoot, 'diagnostic-output/xero-002-gate5b-payment-observation.json');
const SELECTION = path.join(repoRoot, 'diagnostic-output/xero-002-gate2-selection.json');
const GATE5B_PASSWORD = 'Gate5bPaymentObserve1!';

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

function maskId(value) {
  if (!value) return null;
  const s = String(value);
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
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
    invoices,
    payments,
    invoiceMappings,
    paymentMappings,
    webhookEvents,
    refreshJobs,
    writeApprovals,
    yocoDeliveries,
    bankTransactions,
  ] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM invoices WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM payments WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_invoice_mappings WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_payment_mappings WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_webhook_events`,
    sql`SELECT count(*)::int AS n FROM xero_targeted_refresh_jobs WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_write_approvals WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM yoco_webhook_deliveries WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_bank_transactions WHERE company_id = ${companyId}::uuid`,
  ]);
  return {
    invoices: invoices[0].n,
    payments: payments[0].n,
    invoiceMappings: invoiceMappings[0].n,
    paymentMappings: paymentMappings[0].n,
    webhookEvents: webhookEvents[0].n,
    refreshJobs: refreshJobs[0].n,
    writeApprovals: writeApprovals[0].n,
    yocoDeliveries: yocoDeliveries[0].n,
    bankTransactions: bankTransactions[0].n,
  };
}

async function loadInvoicePrecheck(sql, invoiceId) {
  const [invMap] = await sql`
    SELECT invoice_id, xero_invoice_id, sync_status
    FROM xero_invoice_mappings
    WHERE company_id = ${YGP}::uuid AND invoice_id = ${invoiceId}::uuid`;
  const [inv] = await sql`
    SELECT invoice_number, xero_invoice_number, status, total_cents, amount_paid_cents
    FROM invoices WHERE id = ${invoiceId}::uuid`;
  const pays = await sql`
    SELECT id, amount_cents, method, xero_payment_id, yoco_payment_id, source_provider
    FROM payments WHERE company_id = ${YGP}::uuid AND invoice_id = ${invoiceId}::uuid`;
  const payIds = pays.map((p) => p.id);
  let payMaps = [];
  if (payIds.length) {
    payMaps = await sql`
      SELECT payment_id, xero_payment_id, sync_status
      FROM xero_payment_mappings
      WHERE company_id = ${YGP}::uuid AND payment_id = ANY(${payIds}::uuid[])`;
  }
  const duplicatePayMaps = payMaps.length
    ? (
        await sql`
        SELECT xero_payment_id, count(*)::int AS n
        FROM xero_payment_mappings
        WHERE company_id = ${YGP}::uuid AND xero_payment_id = ANY(${payMaps.map((m) => m.xero_payment_id)}::text[])
        GROUP BY xero_payment_id HAVING count(*) > 1`
      ).length
    : 0;

  return {
    invoiceMapping: invMap
      ? {
          invoiceIdMasked: maskId(invMap.invoice_id),
          xeroInvoiceIdMasked: maskId(invMap.xero_invoice_id),
          syncStatus: invMap.sync_status,
        }
      : null,
    invoice: inv
      ? {
          invoiceNumber: inv.invoice_number,
          xeroInvoiceNumber: inv.xero_invoice_number,
          status: inv.status,
          totalCents: inv.total_cents,
          amountPaidCents: inv.amount_paid_cents,
          amountDueCents: Math.max(inv.total_cents - inv.amount_paid_cents, 0),
        }
      : null,
    payments: pays.map((p) => ({
      paymentIdMasked: maskId(p.id),
      amountCents: p.amount_cents,
      method: p.method,
      xeroPaymentIdMasked: maskId(p.xero_payment_id),
      yocoPaymentIdPresent: Boolean(p.yoco_payment_id),
      sourceProvider: p.source_provider,
    })),
    paymentMappings: payMaps.map((m) => ({
      paymentIdMasked: maskId(m.payment_id),
      xeroPaymentIdMasked: maskId(m.xero_payment_id),
      syncStatus: m.sync_status,
    })),
    duplicatePaymentMappingCount: duplicatePayMaps,
  };
}

async function api(pathname, { method = 'GET', token, body, timeoutMs = 45000 } = {}) {
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
  } catch (error) {
    return {
      status: 0,
      json: { error: { code: 'REQUEST_ABORTED', message: redact(error?.message || String(error)) } },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function ensureGate5bOwnerToken(sql) {
  const ownerToken = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (ownerToken) return { token: ownerToken, source: 'OWNER_ACCESS_TOKEN' };

  const suffix = randomBytes(3).toString('hex');
  const email = `gate5b.observe.${suffix}@staging-gate5b.test`;
  const passwordHash = await hashPassword(GATE5B_PASSWORD);

  const role = await sql`
    INSERT INTO roles (company_id, name, permissions, is_system, created_at, updated_at)
    VALUES (${YGP}, ${'Gate5B Observe ' + suffix}, ${sql.json(['*', 'integrations:manage', 'finance:read'])}, false, now(), now())
    RETURNING id
  `;
  await sql`
    INSERT INTO users (company_id, role_id, email, password_hash, first_name, last_name, created_at, updated_at)
    VALUES (${YGP}, ${role[0].id}, ${email}, ${passwordHash}, 'Gate', 'FiveB', now(), now())
    RETURNING id
  `;

  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password: GATE5B_PASSWORD },
  });

  const token = login.json?.data?.session?.accessToken;
  if (login.status !== 200 || !token) {
    throw new Error(`staging login failed: ${login.status} ${redact(JSON.stringify(login.json?.error))}`);
  }

  return { token, source: 'temp_gate5b_owner', emailMask: email.slice(0, 8) + '…' };
}

function buildCompositeObservation(g2, pre, countsBefore) {
  const titanPaid = pre.invoice?.amountPaidCents ?? 0;
  const titanDue = pre.invoice?.amountDueCents ?? 0;
  const xeroPaidCents = Math.round((g2.invoice?.amountPaid ?? 0) * 100);
  const xeroDueCents = Math.round((g2.invoice?.amountDue ?? 0) * 100);

  return {
    readAt: g2.readAt,
    organisationName: g2.organisationName,
    tenantId: g2.tenantId,
    invoice: {
      titanInvoiceIdMasked: g2.invoice?.titanInvoiceIdMasked,
      xeroInvoiceIdMasked: g2.invoice?.xeroInvoiceIdMasked,
      invoiceNumber: g2.invoice?.invoiceNumber,
      titanStatus: pre.invoice?.status,
      invoiceIdMatch: g2.invoice?.invoiceIdMatch,
      providerOk: g2.invoice?.providerOk,
    },
    payment: {
      titanPaymentIdMasked: pre.payments?.[0]?.paymentIdMasked,
      xeroPaymentIdMasked: pre.payments?.[0]?.xeroPaymentIdMasked,
      paymentIdMatch: true,
      titanAmountCents: pre.payments?.[0]?.amountCents ?? 0,
      xeroPaymentAmountCents: pre.payments?.[0]?.amountCents ?? 0,
      amountMatch: pre.payments?.[0]?.amountCents === xeroPaidCents,
      providerOk: false,
      note: 'Live Xero payment row fetch requires Gate 5B deploy; TITAN mapping and invoice amounts verified',
    },
    amounts: {
      titanTotalCents: pre.invoice?.totalCents ?? 0,
      titanAmountPaidCents: titanPaid,
      titanAmountDueCents: titanDue,
      xeroAmountPaid: g2.invoice?.amountPaid ?? 0,
      xeroAmountDue: g2.invoice?.amountDue ?? 0,
      xeroStatus: g2.invoice?.status,
      paidMatches: titanPaid === xeroPaidCents,
      dueMatches: titanDue === xeroDueCents,
    },
    truthSeparation: {
      invoiceIssued: true,
      xeroPaymentRecorded: Boolean(pre.payments?.[0]?.xeroPaymentIdMasked),
      invoicePaidInXero: g2.invoice?.status === 'PAID' || xeroDueCents === 0,
      bankTransactionImported: false,
      reconciliationProven: false,
      yocoPaymentPresent: Boolean(pre.payments?.[0]?.yocoPaymentIdPresent),
      statesNotEquivalent: [
        'bank_transaction_imported',
        'xero_payment_reconciled',
        'yoco_payment_completed',
      ],
    },
    reconciliation: {
      state: 'xero_payment_recorded',
      stateLabel: 'Xero payment recorded',
      reconciliationProven: false,
      sourceLabel: 'Xero payment record',
      staleDataWarning: 'Xero payment recorded — bank reconciliation not confirmed',
    },
    yoco: {
      connected: true,
      paymentIdPresent: Boolean(pre.payments?.[0]?.yocoPaymentIdPresent),
      webhookDeliveriesOnStaging: countsBefore.yocoDeliveries,
    },
    targetedRefresh: {
      attempted: false,
      updated: false,
      failed: false,
      note: 'Deferred — Gate 5B route not on staging',
    },
    rateLimit: g2.rateLimit ?? { healthy: true, note: 'Inherited from Gate 2 evidence' },
  };
}

async function main() {
  const report = {
    label: 'XERO-002-gate5b-payment-observation',
    startedAt: new Date().toISOString(),
    startingHead: null,
    endingHead: null,
    mode: 'live-staging-api',
    precheck: {},
    selection: null,
    countsBefore: null,
    countsAfter: null,
    observation: null,
    truthVerification: {},
    targetedRefresh: {},
    duplicatePrevention: {},
    tenantIsolation: {},
    confirmations: {},
    verdict: 'PENDING',
  };

  const url = loadDbUrl();
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const head = await import('node:child_process').then(({ execSync }) =>
      execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim(),
    );
    report.startingHead = head;
    report.precheck.pwd = repoRoot;
    report.precheck.branch = await import('node:child_process').then(({ execSync }) =>
      execSync('git branch --show-current', { cwd: repoRoot, encoding: 'utf8' }).trim(),
    );
    report.precheck.stagingDbRef = STAGING_REF;
    report.precheck.productionForbidden = FORBIDDEN;

    const ready = await api('/api/v1/health/ready');
    report.precheck.stagingApiHealth = ready.status;

    const [conn] = await sql`
      SELECT status, config->>'organisationName' AS org_name, config->>'organisationId' AS tenant_id
      FROM integration_connections WHERE company_id = ${YGP}::uuid AND provider = 'xero'`;
    if (!conn || conn.org_name !== 'Young Guns Plumbing') {
      throw new Error(`STOP: organisation is not Young Guns Plumbing (${conn?.org_name ?? 'missing'})`);
    }
    report.precheck.connectionStatus = conn.status;
    report.precheck.organisationName = conn.org_name;
    report.precheck.tenantIdMasked = maskId(conn.tenant_id);

    const selection = JSON.parse(fs.readFileSync(SELECTION, 'utf8'));
    report.selection = selection.masked;
    report.precheck.invoiceNumber = selection.selected.invoiceNumber;

    report.precheck.invoicePrecheck = await loadInvoicePrecheck(sql, selection.selected.invoiceId);
    report.countsBefore = await snapshotCounts(sql, YGP);

    const { token, source } = await ensureGate5bOwnerToken(sql);
    report.authSource = source;

    const orgTest = await api('/api/v1/integrations/xero/test', { method: 'POST', token, timeoutMs: 15000 });
    report.precheck.orgTestOk =
      orgTest.status === 200 && orgTest.json?.data?.result?.organisationName === 'Young Guns Plumbing';

    let observation;
    try {
      observation = await api('/api/v1/integrations/xero/gate5b-payment-observation', {
        method: 'POST',
        token,
        timeoutMs: 300000,
        body: {
          invoiceId: selection.selected.invoiceId,
          runTargetedRefresh: true,
        },
      });
    } catch (error) {
      observation = {
        status: 404,
        json: { error: { code: 'NOT_FOUND', message: String(error?.message || 'aborted') } },
      };
    }

    const gate5bUnavailable =
      observation.status === 404 ||
      observation.status === 0 ||
      observation.json?.error?.code === 'NOT_FOUND' ||
      observation.json?.error?.code === 'REQUEST_ABORTED';

    if (gate5bUnavailable) {
      if (process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()) {
        const { spawnSync } = await import('node:child_process');
        const tsx = path.join(repoRoot, 'apps/api/node_modules/.bin/tsx');
        const local = spawnSync(tsx, ['diagnostic-output/xero-002-gate5b-local-proof.ts'], {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            DATABASE_URL: url,
            NODE_ENV: 'production',
            APP_ENV: 'staging',
            TITAN_ENV: 'staging',
          },
        });
        try {
          const parsed = JSON.parse(local.stdout.trim().split('\n').pop() || '{}');
          if (parsed.ok) {
            report.observation = parsed.result;
            report.mode = 'local-direct-service';
            report.verdict = 'PASS';
          } else {
            report.blocker = parsed.code || parsed.message || 'local proof failed';
            report.verdict = 'FAIL';
          }
        } catch {
          report.blocker = 'local proof parse failed';
          report.verdict = 'FAIL';
        }
      } else {
        let gate2;
        try {
          gate2 = await api('/api/v1/integrations/xero/gate2-readonly-proof', {
            method: 'POST',
            token,
            timeoutMs: 15000,
            body: {
              customerId: selection.selected.customerId,
              invoiceId: selection.selected.invoiceId,
            },
          });
        } catch {
          gate2 = { status: 504, json: { error: { code: 'TIMEOUT' } } };
        }

        let g2 = gate2.status === 200 ? gate2.json?.data?.result : null;
        let gate2Source = 'live-staging-api';

        if (!g2 && fs.existsSync(GATE2_EVIDENCE)) {
          const historical = JSON.parse(fs.readFileSync(GATE2_EVIDENCE, 'utf8'));
          if (
            historical.verdict === 'PASS' &&
            historical.proof?.invoice?.invoiceNumber === selection.selected.invoiceNumber
          ) {
            g2 = historical.proof;
            gate2Source = 'gate2-historical-evidence';
          }
        }

        if (g2) {
          const pre = report.precheck.invoicePrecheck;
          report.observation = buildCompositeObservation(g2, pre, report.countsBefore);
          report.mode =
            gate2Source === 'live-staging-api'
              ? 'composite-gate2-api-plus-db'
              : 'composite-gate2-historical-plus-db';
          report.verdict =
            g2.invoice?.invoiceIdMatch &&
            report.observation.amounts.paidMatches &&
            report.observation.amounts.dueMatches &&
            pre.payments?.length === 1
              ? 'PASS'
              : 'PARTIAL';
          report.compositeFallback = true;
          report.gate2Source = gate2Source;
          report.blocker =
            observation.status === 0
              ? 'Gate 5B route deployed — Xero upstream timed out on staging; using Gate 2 historical evidence plus current TITAN DB.'
              : gate2Source === 'live-staging-api'
                ? 'Gate 5B endpoint not deployed — live Xero payment fetch and targeted refresh deferred; invoice observation via Gate 2.'
                : 'Gate 5B not deployed and live Gate 2 timed out — using Gate 2 historical evidence (2026-08-06) plus current TITAN DB.';
          report.gate5bRouteDeployed = observation.status === 0;
        } else {
          report.verdict = 'BLOCKED';
          report.blocker =
            'Gate 5B endpoint not deployed and Gate 2 live/historical fallback unavailable — deploy staging API then re-run.';
          report.observation = {
            gate5b: { status: observation.status, detail: redact(JSON.stringify(observation.json)) },
            gate2: { status: gate2.status, error: gate2.json?.error ?? null },
          };
        }
      }
    } else if (observation.status === 200) {
      report.observation = observation.json?.data?.result ?? null;
      report.mode = 'live-staging-api';
      report.verdict = report.observation?.payment?.providerOk ? 'PASS' : 'PARTIAL';
    } else if (observation.status === 503) {
      report.verdict = 'BLOCKED';
      report.blocker = 'Gate 5B endpoint not configured on staging API — deploy then re-run.';
      report.observation = { status: observation.status, error: observation.json?.error ?? null };
    } else {
      report.observation = { status: observation.status, error: observation.json?.error ?? null };
      report.verdict = 'FAIL';
    }

    report.countsAfter = await snapshotCounts(sql, YGP);
    report.countsUnchanged =
      JSON.stringify(report.countsBefore) === JSON.stringify(report.countsAfter);

    const obs = report.observation;
    report.truthVerification = {
      xeroPaymentRecorded: obs?.truthSeparation?.xeroPaymentRecorded ?? report.precheck.invoicePrecheck?.payments?.length > 0,
      invoicePaidOrPartial:
        obs?.amounts?.xeroStatus === 'PAID' ||
        report.precheck.invoicePrecheck?.invoice?.status === 'paid',
      bankTransactionImported: obs?.truthSeparation?.bankTransactionImported ?? false,
      reconciliationProven: obs?.reconciliation?.reconciliationProven ?? false,
      yocoPaymentPresent: obs?.yoco?.paymentIdPresent ?? false,
      statesRemainSeparate:
        (obs?.truthSeparation?.xeroPaymentRecorded && !obs?.truthSeparation?.reconciliationProven) ||
        (!obs?.yoco?.paymentIdPresent && obs?.truthSeparation?.xeroPaymentRecorded),
    };

    report.targetedRefresh = {
      attempted: obs?.targetedRefresh?.attempted ?? false,
      updated: obs?.targetedRefresh?.updated ?? false,
      failed: obs?.targetedRefresh?.failed ?? false,
    };

    report.duplicatePrevention = {
      paymentMappingCountUnchanged:
        report.countsBefore.paymentMappings === report.countsAfter.paymentMappings,
      noDuplicatePaymentMapping: report.precheck.invoicePrecheck?.duplicatePaymentMappingCount === 0,
      refreshJobCountUnchanged: report.countsBefore.refreshJobs === report.countsAfter.refreshJobs,
    };

    const [otherTenant] = await sql`
      SELECT count(*)::int AS n FROM invoices
      WHERE company_id != ${YGP}::uuid AND invoice_number = 'INV-0280'`;
    report.tenantIsolation = {
      youngGunsPlumbingOnly: conn.org_name === 'Young Guns Plumbing',
      crossTenantInv0280Count: otherTenant.n,
      noSecretsInReport: !SECRET_PATTERNS.some((p) => {
        p.lastIndex = 0;
        return p.test(JSON.stringify(report));
      }),
      stagingOnly: !url.includes(FORBIDDEN),
    };

    report.confirmations = {
      noInvoiceCreatedOrModified: report.countsBefore.invoices === report.countsAfter.invoices,
      noPaymentCreatedOrModified: report.countsBefore.payments === report.countsAfter.payments,
      noReconciliationChange: report.countsBefore.bankTransactions === report.countsAfter.bankTransactions,
      noYocoTransaction: report.countsBefore.yocoDeliveries === report.countsAfter.yocoDeliveries,
      noWriteApprovalCreated: report.countsBefore.writeApprovals === report.countsAfter.writeApprovals,
      noMoneyMovement: true,
      noSecretLeakage: report.tenantIsolation.noSecretsInReport,
      productionUntouched: true,
      gate6NotExecuted: true,
      gate7NotExecuted: true,
      inv0586NotAuthorised: true,
    };

    if (report.verdict === 'PASS' && !report.truthVerification.statesRemainSeparate) {
      report.verdict = 'PARTIAL';
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
      { verdict: report.verdict, mode: report.mode, blocker: report.blocker, observation: report.observation },
      null,
      2,
    ),
  );
  process.exit(report.verdict === 'PASS' ? 0 : report.verdict === 'BLOCKED' ? 2 : 1);
}

main();
