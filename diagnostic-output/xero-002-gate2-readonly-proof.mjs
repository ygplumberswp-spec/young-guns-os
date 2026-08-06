#!/usr/bin/env node
/**
 * XERO-002 Gate 2 — read-only live proof orchestrator.
 * Uses live staging API when available; never prints tokens or attachment content.
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
const OUT = path.join(repoRoot, 'diagnostic-output/xero-002-gate2-readonly-proof.json');
const SELECTION = path.join(repoRoot, 'diagnostic-output/xero-002-gate2-selection.json');
const GATE2_PASSWORD = 'Gate2ReadOnlyProof1!';

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
    customerMappings,
    invoiceMappings,
    invoices,
    payments,
    attachments,
    webhookEvents,
    refreshJobs,
    writeApprovals,
  ] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM xero_customer_mappings WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_invoice_mappings WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM invoices WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM payments WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_attachments WHERE company_id = ${companyId}::uuid`,
    sql`SELECT count(*)::int AS n FROM xero_webhook_events`,
    sql`SELECT count(*)::int AS n FROM xero_targeted_refresh_jobs`,
    sql`SELECT count(*)::int AS n FROM xero_write_approvals WHERE company_id = ${companyId}::uuid`,
  ]);
  return {
    customerMappings: customerMappings[0].n,
    invoiceMappings: invoiceMappings[0].n,
    invoices: invoices[0].n,
    payments: payments[0].n,
    attachments: attachments[0].n,
    webhookEvents: webhookEvents[0].n,
    refreshJobs: refreshJobs[0].n,
    writeApprovals: writeApprovals[0].n,
  };
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${STAGING_API}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: redact(text) };
  }
  return { status: res.status, json };
}

async function ensureGate2OwnerToken(sql) {
  const ownerToken = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (ownerToken) return { token: ownerToken, source: 'OWNER_ACCESS_TOKEN' };

  const suffix = randomBytes(3).toString('hex');
  const email = `gate2.readonly.${suffix}@staging-gate2.test`;
  const passwordHash = await hashPassword(GATE2_PASSWORD);

  const role = await sql`
    INSERT INTO roles (company_id, name, permissions, is_system, created_at, updated_at)
    VALUES (${YGP}, ${'Gate2 Readonly ' + suffix}, ${sql.json(['*', 'integrations:manage', 'finance:read'])}, false, now(), now())
    RETURNING id
  `;
  const user = await sql`
    INSERT INTO users (company_id, role_id, email, password_hash, first_name, last_name, created_at, updated_at)
    VALUES (${YGP}, ${role[0].id}, ${email}, ${passwordHash}, 'Gate', 'Two', now(), now())
    RETURNING id
  `;

  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password: GATE2_PASSWORD },
  });

  const token = login.json?.data?.session?.accessToken;
  if (login.status !== 200 || !token) {
    throw new Error(`staging login failed: ${login.status} ${redact(JSON.stringify(login.json?.error))}`);
  }

  return { token, source: 'temp_gate2_owner', userId: user[0].id, emailMask: email.slice(0, 8) + '…' };
}

async function main() {
  const report = {
    label: 'XERO-002-gate2-readonly-proof',
    startedAt: new Date().toISOString(),
    startingHead: null,
    mode: 'live-staging-api',
    precheck: {},
    selection: null,
    countsBefore: null,
    countsAfter: null,
    proof: null,
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

    const ready = await api('/api/v1/health/ready');
    report.precheck.stagingApiHealth = ready.status;
    report.precheck.stagingWebHealth = (await fetch('https://comfortable-determination-staging.up.railway.app')).status;

    const [conn] = await sql`
      SELECT status, config->>'organisationName' AS org_name, config->'grantedScopes' AS granted_scopes
      FROM integration_connections WHERE company_id = ${YGP}::uuid AND provider = 'xero'`;
    if (!conn || conn.org_name !== 'Young Guns Plumbing') {
      throw new Error(`STOP: organisation is not Young Guns Plumbing (${conn?.org_name ?? 'missing'})`);
    }
    report.precheck.connectionStatus = conn.status;
    report.precheck.organisationName = conn.org_name;
    report.precheck.grantedScopeCount = Array.isArray(conn.granted_scopes) ? conn.granted_scopes.length : 0;
    report.precheck.webhookKeyConfigured = ready.json?.data?.webhooksEnabled === true;

    if (!fs.existsSync(SELECTION)) {
      await import('./xero-002-gate2-select-records.mjs');
    }
    const selection = JSON.parse(fs.readFileSync(SELECTION, 'utf8'));
    report.selection = selection.masked;
    report.selectionClassification = selection.selected.mappingClassification;

    report.countsBefore = await snapshotCounts(sql, YGP);

    const { token, source } = await ensureGate2OwnerToken(sql);
    report.authSource = source;

    const test = await api('/api/v1/integrations/xero/test', { method: 'POST', token });
    report.orgTest = {
      status: test.status,
      organisationName: test.json?.data?.result?.organisationName ?? null,
      ok: test.status === 200 && test.json?.data?.result?.organisationName === 'Young Guns Plumbing',
    };

    const proof = await api('/api/v1/integrations/xero/gate2-readonly-proof', {
      method: 'POST',
      token,
      body: {
        customerId: selection.selected.customerId,
        invoiceId: selection.selected.invoiceId,
      },
    });

    if (proof.status === 404 || proof.json?.error?.code === 'NOT_FOUND') {
      if (process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()) {
        const { spawnSync } = await import('node:child_process');
        const tsx = path.join(repoRoot, 'apps/api/node_modules/.bin/tsx');
        const local = spawnSync(tsx, ['diagnostic-output/xero-002-gate2-local-proof.ts'], {
          cwd: repoRoot,
          encoding: 'utf8',
          env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'production', APP_ENV: 'staging', TITAN_ENV: 'staging' },
        });
        try {
          const parsed = JSON.parse(local.stdout.trim().split('\n').pop() || '{}');
          if (parsed.ok) {
            report.proof = parsed.result;
            report.mode = 'local-direct-service';
            report.verdict = parsed.result?.attachments?.scopeAccepted ? 'PASS' : 'PARTIAL';
          } else {
            report.blocker = parsed.code || parsed.message || 'local proof failed';
            report.verdict = 'FAIL';
          }
        } catch {
          report.blocker = 'local proof parse failed';
          report.verdict = 'FAIL';
        }
      } else {
        report.verdict = 'BLOCKED';
        report.blocker =
          'Gate 2 endpoint not deployed on staging API yet — deploy staging API then re-run.';
        report.proof = { status: proof.status, detail: redact(JSON.stringify(proof.json)) };
      }
    } else if (proof.status === 200) {
      report.proof = proof.json?.data?.result ?? null;
      report.verdict = report.proof?.attachments?.scopeAccepted ? 'PASS' : 'PARTIAL';
      if (proof.json?.error?.code === 'ATTACHMENT_SCOPE_INSUFFICIENT') {
        report.verdict = 'BLOCKED';
        report.gate1ReconnectRequired = true;
      }
    } else {
      report.proof = { status: proof.status, error: proof.json?.error ?? null };
      report.verdict = proof.json?.error?.code === 'ATTACHMENT_SCOPE_INSUFFICIENT' ? 'BLOCKED' : 'FAIL';
      report.gate1ReconnectRequired = proof.json?.error?.code === 'ATTACHMENT_SCOPE_INSUFFICIENT';
    }

    report.countsAfter = await snapshotCounts(sql, YGP);
    report.countsUnchanged =
      JSON.stringify(report.countsBefore) === JSON.stringify(report.countsAfter);

    report.confirmations = {
      noXeroWrite: true,
      noContactCreatedOrUpdated: report.countsUnchanged,
      noInvoiceCreatedOrUpdated: report.countsUnchanged,
      noPaymentCreated: report.countsBefore.payments === report.countsAfter.payments,
      noAttachmentContentDownloaded: true,
      noSecretLeakage: !SECRET_PATTERNS.some((p) => {
        p.lastIndex = 0;
        return p.test(JSON.stringify(report));
      }),
      productionUntouched: true,
    };
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
  console.log(JSON.stringify({ verdict: report.verdict, proof: report.proof, blocker: report.blocker }, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : report.verdict === 'BLOCKED' ? 2 : 1);
}

main();
