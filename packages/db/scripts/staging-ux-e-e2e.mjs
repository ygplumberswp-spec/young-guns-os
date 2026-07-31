/**
 * UX-E staging harness — quote-to-cash: quotes, versioning, portal acceptance,
 * invoicing (Xero-pending numbering), payments/receipts, profit visibility ACL.
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Never prints DATABASE_URL / credentials
 * - Labels temp records STAGING-UX-E
 * - Cleans up only labelled companies
 *
 * Usage:
 *   node packages/db/scripts/staging-ux-e-e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const outPath = path.resolve(repoRoot, 'diagnostic-output/82-staging-ux-e-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-UX-E';
const API_PORT = Number(process.env.STAGING_API_PORT || 3103);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5177);
const API_BASE = process.env.STAGING_API_BASE || `http://127.0.0.1:${API_PORT}`;
const WEB_BASE = process.env.STAGING_WEB_BASE || `http://127.0.0.1:${WEB_PORT}`;
const MANAGE_RUNTIME = process.env.STAGING_MANAGE_RUNTIME !== '0';
const VITE_BIN = path.join(repoRoot, 'apps/web/node_modules/.bin/vite');
const TSX_BIN = path.join(repoRoot, 'apps/api/node_modules/.bin/tsx');

function loadEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[s.slice(0, i).trim()] = v;
  }
  return out;
}

function redactError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .slice(0, 400);
}

async function waitFor(url, { timeoutMs = 120_000, expectStatus = 200 } = {}) {
  const started = Date.now();
  let last = 'not-started';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      last = String(res.status);
      if (res.status === expectStatus) return;
    } catch (e) {
      last = redactError(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url} (last=${last})`);
}

function freePort(port) {
  try {
    const out = execSync(`lsof -nP -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    for (const pid of out.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* nothing listening */
  }
}

function startProcess(command, args, env, cwd) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  const onChunk = (chunk) => {
    buf += chunk.toString();
    if (buf.length > 8000) buf = buf.slice(-4000);
  };
  child.stdout.on('data', onChunk);
  child.stderr.on('data', onChunk);
  child.getSafeTail = () =>
    buf.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]').slice(-1500);
  return child;
}

async function api(pathname, { method = 'GET', token, body, base = API_BASE } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 400) });
}

async function inviteRole(ownerToken, roleId, email, firstName, lastName, password) {
  const invite = await api('/api/v1/team/invites', {
    method: 'POST',
    token: ownerToken,
    body: { email, roleId },
  });
  const inviteUrl = invite.json?.data?.inviteUrl;
  const tokenMatch = typeof inviteUrl === 'string' ? inviteUrl.match(/token=([^&]+)/) : null;
  if (invite.status !== 201 || !tokenMatch) return null;
  const accept = await api('/api/v1/auth/accept-invite', {
    method: 'POST',
    body: { token: tokenMatch[1], firstName, lastName, password },
  });
  const accessToken = accept.json?.data?.session?.accessToken;
  if (accept.status !== 201 || !accessToken) return null;
  return accessToken;
}

async function main() {
  const report = {
    label: LABEL,
    startedAt: new Date().toISOString(),
    stagingTarget: {},
    contracts: {
      createQuote: 'POST /api/v1/finance/quotes (lineItems w/ unitCostCents, clientActionId)',
      quoteDetail: 'GET /api/v1/finance/quotes/:id (includeProfit for owner/accountant/manager)',
      issueQuote: 'POST /api/v1/finance/quotes/:id/issue',
      versionQuote: 'POST /api/v1/finance/quotes/:id/versions',
      portalAccept: 'POST /api/v1/portal/quotes/:quoteId/accept',
      invoiceFromQuote: 'POST /api/v1/finance/quotes/:id/invoices',
      payment: 'POST /api/v1/finance/payments',
      jobFinanceSummary: 'GET /api/v1/finance/jobs/:jobId/finance-summary',
    },
    results: [],
    cleanup: null,
    totals: { passed: 0, failed: 0 },
    verdict: 'NO-GO',
  };

  if (!fs.existsSync(envPath)) {
    report.stagingTarget = { ok: false, reason: 'staging env file missing' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const env = loadEnv(envPath);
  if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging' || !env.DATABASE_URL) {
    report.stagingTarget = { ok: false, reason: 'staging labels/url missing' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  if (env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
    report.stagingTarget = { ok: false, reason: 'forbidden live project ref' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(3);
  }

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  let apiProc = null;
  let webProc = null;
  let webUp = false;
  const suffix = randomBytes(3).toString('hex');
  const password = 'StagingUxELead1!';
  let companyId = null;
  let foreignCompanyId = null;

  try {
    const meta = await sql`
      select current_database() as db,
             (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
             (select exists(
                select 1 from information_schema.tables
                where table_name='quote_line_items'
             )) as has_quote_line_items,
             (select exists(
                select 1 from information_schema.tables
                where table_name='quote_acceptances'
             )) as has_quote_acceptances
    `;
    report.stagingTarget = {
      ok: true,
      matchesForbiddenLiveProjectRef: false,
      currentDatabase: meta[0].db,
      drizzleMigrationCount: meta[0].migrations,
      hasQuoteLineItems: meta[0].has_quote_line_items,
      hasQuoteAcceptances: meta[0].has_quote_acceptances,
      appEnv: env.APP_ENV,
      titanEnv: env.TITAN_ENV,
    };
    if (meta[0].has_quote_line_items && meta[0].has_quote_acceptances) {
      pass(report.results, 'staging_target_and_migration_0100_present');
    } else {
      throw new Error('migration 0100 not applied on staging (quote_line_items / quote_acceptances missing)');
    }

    if (MANAGE_RUNTIME) {
      freePort(API_PORT);
      freePort(WEB_PORT);
      await new Promise((r) => setTimeout(r, 400));
      const jwt = `staging-ux-e-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-ux-e-refresh-${randomBytes(24).toString('hex')}`;
      const childEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        HOST: '127.0.0.1',
        APP_URL: WEB_BASE,
        API_PUBLIC_URL: API_BASE,
        DATABASE_URL: env.DATABASE_URL,
        JWT_SECRET: jwt,
        JWT_REFRESH_SECRET: jwtRefresh,
        SEED_DEV: 'false',
        APP_ENV: 'staging',
        TITAN_ENV: 'staging',
        DOTENV_CONFIG_PATH: '',
      };
      if (!fs.existsSync(TSX_BIN)) {
        throw new Error(`tsx binary missing at ${TSX_BIN}`);
      }
      apiProc = startProcess(TSX_BIN, ['src/index.ts'], childEnv, path.join(repoRoot, 'apps/api'));
      await waitFor(`${API_BASE}/api/v1/health/ready`);
      pass(report.results, 'isolated_api_started', `api:${API_PORT}`);

      if (fs.existsSync(VITE_BIN)) {
        webProc = startProcess(
          VITE_BIN,
          ['--host', '127.0.0.1', '--port', String(WEB_PORT)],
          {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            VITE_DEV_PORT: String(WEB_PORT),
            VITE_API_PROXY_TARGET: API_BASE,
          },
          path.join(repoRoot, 'apps/web'),
        );
        try {
          await waitFor(WEB_BASE, { expectStatus: 200 });
          webUp = true;
          pass(report.results, 'isolated_web_started', `web:${WEB_PORT}`);
        } catch (e) {
          fail(report.results, 'isolated_web_started', redactError(e));
        }
      } else {
        fail(report.results, 'isolated_web_started', `vite binary missing at ${VITE_BIN} — skipping web checks`);
      }
    }

    // --- Owner + foreign tenant signup ---
    const signup = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Co ${suffix}`,
        firstName: 'Owner',
        lastName: 'UxE',
        email: `owner.${suffix}@staging-ux-e.test`,
        password,
      },
    });
    const ownerToken = signup.json?.data?.session?.accessToken;
    companyId = signup.json?.data?.user?.companyId;
    if (signup.status !== 201 || !ownerToken || !companyId) {
      throw new Error(`signup failed: ${JSON.stringify(signup.json?.error || signup.status)}`);
    }
    pass(report.results, 'owner_signup_labelled_company');

    const foreign = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Foreign ${suffix}`,
        firstName: 'Other',
        lastName: 'Tenant',
        email: `foreign.${suffix}@staging-ux-e.test`,
        password,
      },
    });
    foreignCompanyId = foreign.json?.data?.user?.companyId;
    const foreignToken = foreign.json?.data?.session?.accessToken;
    if (foreign.status !== 201 || !foreignToken || !foreignCompanyId) {
      throw new Error('foreign tenant signup failed');
    }
    pass(report.results, 'foreign_tenant_signup');

    const roles = await api('/api/v1/team/roles', { token: ownerToken });
    const roleRows = roles.json?.data?.roles || roles.json?.data?.assignableRoles || [];
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

    const techToken = byName.Technician
      ? await inviteRole(
          ownerToken,
          byName.Technician,
          `tech.${suffix}@staging-ux-e.test`,
          'Tech',
          'UxE',
          password,
        )
      : null;
    if (techToken) pass(report.results, 'technician_invite');
    else fail(report.results, 'technician_invite', 'missing Technician role/token');

    // --- Customer + job ---
    const customerRes = await api('/api/v1/crm/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Customer ${suffix}`,
        email: `client.${suffix}@customer-real.test`,
        phone: '0825550111',
      },
    });
    const customerId = customerRes.json?.data?.customer?.id;
    if (customerRes.status === 201 && customerId) {
      pass(report.results, 'create_customer', customerId);
    } else {
      throw new Error(`create_customer failed: ${JSON.stringify(customerRes.json?.error || customerRes.status)}`);
    }

    const jobRes = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        address: {
          street: '12 Lower Main Rd',
          suburb: 'Observatory',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7925',
        },
        siteContact: { name: 'Ada Client', mobile: '0825550111' },
        jobType: 'Blocked drain',
        description: 'Kitchen sink blocked — UX-E finance flow',
        priority: 'normal',
      },
    });
    const jobId = jobRes.json?.data?.job?.id;
    if (jobRes.status === 201 && jobId) {
      pass(report.results, 'create_job', jobId);
    } else {
      throw new Error(`create_job failed: ${JSON.stringify(jobRes.json?.error || jobRes.status)}`);
    }

    // --- Create quote v1 (generous margin: unitCost well below unitPrice) ---
    const v1ActionId = `ux-e-quote-${suffix}-v1`;
    const createQuote = await api('/api/v1/finance/quotes', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        jobId,
        title: 'Blocked drain repair',
        clientActionId: v1ActionId,
        lineItems: [
          {
            description: 'Drain jetting and repair',
            quantity: 1,
            unitPriceCents: 150000,
            unitCostCents: 50000,
            vatRateBps: 1500,
            category: 'labour',
          },
        ],
      },
    });
    const quoteV1 = createQuote.json?.data?.quote;
    if (createQuote.status === 201 && quoteV1?.id) {
      pass(report.results, 'create_quote_with_line_items', quoteV1.id);
    } else {
      throw new Error(`create_quote failed: ${JSON.stringify(createQuote.json?.error || createQuote.status)}`);
    }

    // --- Quote detail includes profit for owner ---
    const quoteDetail = await api(`/api/v1/finance/quotes/${quoteV1.id}`, { token: ownerToken });
    const profit = quoteDetail.json?.data?.quote?.profit;
    if (quoteDetail.status === 200 && profit && typeof profit.estimatedCostCents === 'number' && typeof profit.marginBps === 'number') {
      pass(report.results, 'quote_detail_includes_profit_for_owner', JSON.stringify(profit));
    } else {
      fail(report.results, 'quote_detail_includes_profit_for_owner', JSON.stringify(quoteDetail.json || quoteDetail.status));
    }

    // --- Issue quote v1 ---
    const issueV1 = await api(`/api/v1/finance/quotes/${quoteV1.id}/issue`, {
      method: 'POST',
      token: ownerToken,
    });
    const issuedQuote = issueV1.json?.data?.quote;
    if (issueV1.status === 200 && issuedQuote?.status === 'sent' && issuedQuote?.isImmutable === true) {
      pass(report.results, 'issue_quote_sets_sent_and_immutable');
    } else {
      fail(report.results, 'issue_quote_sets_sent_and_immutable', JSON.stringify(issueV1.json?.error || issueV1.json || issueV1.status));
    }

    // --- PATCH issued quote should be rejected (immutable) ---
    const patchIssued = await api(`/api/v1/finance/quotes/${quoteV1.id}`, {
      method: 'PATCH',
      token: ownerToken,
      body: { title: 'Should not be allowed' },
    });
    if (patchIssued.status === 400) {
      pass(report.results, 'patch_issued_quote_rejected_immutable');
    } else {
      fail(report.results, 'patch_issued_quote_rejected_immutable', String(patchIssued.status));
    }

    // --- Create version v2 (new clientActionId); v1 becomes superseded ---
    const v2ActionId = `ux-e-quote-${suffix}-v2`;
    const versionRes = await api(`/api/v1/finance/quotes/${quoteV1.id}/versions`, {
      method: 'POST',
      token: ownerToken,
      body: { clientActionId: v2ActionId, reason: 'Client requested revised scope' },
    });
    const quoteV2 = versionRes.json?.data?.quote;
    if (versionRes.status === 201 && quoteV2?.id && quoteV2.versionNumber === 2) {
      pass(report.results, 'create_quote_version_bumps_version_number', quoteV2.id);
    } else {
      fail(report.results, 'create_quote_version_bumps_version_number', JSON.stringify(versionRes.json?.error || versionRes.json || versionRes.status));
    }

    const v1AfterVersion = await api(`/api/v1/finance/quotes/${quoteV1.id}`, { token: ownerToken });
    if (v1AfterVersion.json?.data?.quote?.status === 'superseded') {
      pass(report.results, 'old_version_marked_superseded');
    } else {
      fail(report.results, 'old_version_marked_superseded', JSON.stringify(v1AfterVersion.json?.data?.quote?.status));
    }

    // --- Issue v2 ---
    const issueV2 = await api(`/api/v1/finance/quotes/${quoteV2.id}/issue`, {
      method: 'POST',
      token: ownerToken,
    });
    const issuedV2 = issueV2.json?.data?.quote;
    if (issueV2.status === 200 && issuedV2?.status === 'sent' && issuedV2?.isImmutable === true) {
      pass(report.results, 'issue_quote_v2');
    } else {
      fail(report.results, 'issue_quote_v2', JSON.stringify(issueV2.json?.error || issueV2.json || issueV2.status));
    }

    // --- Create portal user for the customer, then log in ---
    const portalEmail = `client.${suffix}@staging-ux-e.test`;
    const portalPassword = 'StagingUxEPortal1!';
    const portalUserRes = await api('/api/v1/portal/users', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        email: portalEmail,
        password: portalPassword,
        firstName: 'Ada',
        lastName: 'Client',
        permissions: ['portal.dashboard:read', 'portal.jobs:read', 'portal.quotes:read', 'portal.invoices:read', 'portal.payments:read'],
      },
    });
    if (portalUserRes.status === 201 && portalUserRes.json?.data?.user?.id) {
      pass(report.results, 'portal_user_created');
    } else {
      throw new Error(`portal_user_created failed: ${JSON.stringify(portalUserRes.json?.error || portalUserRes.status)}`);
    }

    const portalLogin = await api('/api/v1/portal/auth/login', {
      method: 'POST',
      body: { email: portalEmail, password: portalPassword },
    });
    const portalToken = portalLogin.json?.data?.session?.accessToken;
    if (portalLogin.status === 200 && portalToken) {
      pass(report.results, 'portal_login');
    } else {
      throw new Error(`portal_login failed: ${JSON.stringify(portalLogin.json?.error || portalLogin.status)}`);
    }

    // --- Portal accept exact version (v2) with acknowledgements + clientActionId ---
    const acceptActionId = `ux-e-accept-${suffix}-1`;
    const acceptBody = {
      clientActionId: acceptActionId,
      accepterName: 'Ada Client',
      acknowledgeScope: true,
      acknowledgeExclusions: true,
      acknowledgePrice: true,
      acknowledgeVat: true,
      acknowledgePaymentTerms: true,
      acknowledgeValidity: true,
    };
    const acceptRes = await api(`/api/v1/portal/quotes/${quoteV2.id}/accept`, {
      method: 'POST',
      token: portalToken,
      body: acceptBody,
    });
    if (acceptRes.status === 201 && acceptRes.json?.data?.acceptance?.decision === 'accepted') {
      pass(report.results, 'portal_accept_exact_version');
    } else {
      fail(report.results, 'portal_accept_exact_version', JSON.stringify(acceptRes.json?.error || acceptRes.json || acceptRes.status));
    }

    // --- Replay same clientActionId → idempotentReplay ---
    const acceptReplay = await api(`/api/v1/portal/quotes/${quoteV2.id}/accept`, {
      method: 'POST',
      token: portalToken,
      body: acceptBody,
    });
    if (acceptReplay.status === 201 && acceptReplay.json?.data?.acceptance?.idempotentReplay === true) {
      pass(report.results, 'portal_accept_replay_idempotent');
    } else {
      fail(report.results, 'portal_accept_replay_idempotent', JSON.stringify(acceptReplay.json?.error || acceptReplay.json || acceptReplay.status));
    }

    // --- Accept again with a different clientActionId → must fail (already accepted) ---
    const acceptAgain = await api(`/api/v1/portal/quotes/${quoteV2.id}/accept`, {
      method: 'POST',
      token: portalToken,
      body: { ...acceptBody, clientActionId: `ux-e-accept-${suffix}-2` },
    });
    if (acceptAgain.status >= 400) {
      pass(report.results, 'duplicate_accept_different_action_id_rejected', String(acceptAgain.status));
    } else {
      fail(report.results, 'duplicate_accept_different_action_id_rejected', JSON.stringify(acceptAgain.json || acceptAgain.status));
    }

    // --- Expired/superseded quote (v1) cannot be accepted ---
    const acceptSuperseded = await api(`/api/v1/portal/quotes/${quoteV1.id}/accept`, {
      method: 'POST',
      token: portalToken,
      body: { ...acceptBody, clientActionId: `ux-e-accept-${suffix}-superseded` },
    });
    if (acceptSuperseded.status >= 400) {
      pass(report.results, 'superseded_quote_accept_rejected', String(acceptSuperseded.status));
    } else {
      fail(report.results, 'superseded_quote_accept_rejected', JSON.stringify(acceptSuperseded.json || acceptSuperseded.status));
    }

    // --- Create deposit invoice from accepted v2 ---
    const invoiceActionId = `ux-e-inv-${suffix}-1`;
    const invoiceFromQuote = await api(`/api/v1/finance/quotes/${quoteV2.id}/invoices`, {
      method: 'POST',
      token: ownerToken,
      body: { clientActionId: invoiceActionId, stage: 'deposit' },
    });
    const invoice = invoiceFromQuote.json?.data?.invoice;
    if (invoiceFromQuote.status === 201 && invoice?.id) {
      pass(report.results, 'create_invoice_from_accepted_quote_deposit', invoice.id);
    } else {
      throw new Error(`create_invoice_from_accepted_quote_deposit failed: ${JSON.stringify(invoiceFromQuote.json?.error || invoiceFromQuote.status)}`);
    }

    if (
      typeof invoice.displayInvoiceNumber === 'string' &&
      invoice.displayInvoiceNumber.startsWith('Pending Xero sync') &&
      invoice.xeroInvoiceNumber == null &&
      typeof invoice.internalNumber === 'string' &&
      invoice.internalNumber.startsWith('TITAN-INV-')
    ) {
      pass(report.results, 'invoice_numbering_pending_xero_shape', invoice.internalNumber);
    } else {
      fail(report.results, 'invoice_numbering_pending_xero_shape', JSON.stringify(invoice));
    }

    // --- Create payment with clientActionId; replay does not duplicate ---
    const paymentActionId = `ux-e-pay-${suffix}-1`;
    const paymentRes = await api('/api/v1/finance/payments', {
      method: 'POST',
      token: ownerToken,
      body: {
        invoiceId: invoice.id,
        amountCents: invoice.totalCents ?? invoice.amountCents,
        method: 'card',
        clientActionId: paymentActionId,
      },
    });
    const payment = paymentRes.json?.data?.payment;
    if (paymentRes.status === 201 && payment?.id) {
      pass(report.results, 'create_payment');
    } else {
      throw new Error(`create_payment failed: ${JSON.stringify(paymentRes.json?.error || paymentRes.status)}`);
    }

    const paymentReplay = await api('/api/v1/finance/payments', {
      method: 'POST',
      token: ownerToken,
      body: {
        invoiceId: invoice.id,
        amountCents: invoice.totalCents ?? invoice.amountCents,
        method: 'card',
        clientActionId: paymentActionId,
      },
    });
    const paymentAfterReplay = await sql`select count(*)::int as c from payments where id = ${payment.id}`;
    const allPaymentsForInvoice = await sql`select count(*)::int as c from payments where invoice_id = ${invoice.id}`;
    if (
      paymentReplay.status === 201 &&
      paymentReplay.json?.data?.payment?.id === payment.id &&
      allPaymentsForInvoice[0].c === 1
    ) {
      pass(report.results, 'payment_replay_does_not_duplicate');
    } else {
      fail(report.results, 'payment_replay_does_not_duplicate', JSON.stringify({ paymentReplay: paymentReplay.json, allPaymentsForInvoice }));
    }
    void paymentAfterReplay;

    const paymentDetail = await api(`/api/v1/finance/payments/${payment.id}`, { token: ownerToken });
    if (paymentDetail.status === 200 && paymentDetail.json?.data?.payment?.receipt?.receiptNumber) {
      pass(report.results, 'payment_detail_has_receipt', paymentDetail.json.data.payment.receipt.receiptNumber);
    } else {
      fail(report.results, 'payment_detail_has_receipt', JSON.stringify(paymentDetail.json || paymentDetail.status));
    }

    // --- Job finance-summary chips ---
    const financeSummary = await api(`/api/v1/finance/jobs/${jobId}/finance-summary`, { token: ownerToken });
    const chips = financeSummary.json?.data?.summary?.chips;
    if (financeSummary.status === 200 && Array.isArray(chips) && chips.length > 0) {
      pass(report.results, 'job_finance_summary_returns_chips', chips.map((c) => c.kind).join(','));
    } else {
      fail(report.results, 'job_finance_summary_returns_chips', JSON.stringify(financeSummary.json || financeSummary.status));
    }
    const profitChip = chips?.find((c) => c.kind === 'profit');
    if (profitChip) {
      pass(report.results, 'job_finance_summary_profit_chip_present_for_owner', JSON.stringify(profitChip));
    } else {
      fail(report.results, 'job_finance_summary_profit_chip_present_for_owner', 'no profit chip returned for owner');
    }

    // --- Technician denied on finance owner module (denyTechnician on entire /finance router) ---
    if (techToken) {
      const techQuoteDetail = await api(`/api/v1/finance/quotes/${quoteV2.id}`, { token: techToken });
      if (techQuoteDetail.status === 403) {
        pass(report.results, 'technician_finance_routes_denied');
      } else {
        fail(report.results, 'technician_finance_routes_denied', String(techQuoteDetail.status));
      }
    } else {
      fail(report.results, 'technician_finance_routes_denied', 'no technician token');
    }

    // --- Cross-tenant isolation: foreign tenant cannot read the quote ---
    const crossTenantQuote = await api(`/api/v1/finance/quotes/${quoteV2.id}`, { token: foreignToken });
    if (crossTenantQuote.status === 404 || crossTenantQuote.status === 403) {
      pass(report.results, 'cross_tenant_quote_denied', String(crossTenantQuote.status));
    } else {
      fail(report.results, 'cross_tenant_quote_denied', String(crossTenantQuote.status));
    }

    // --- Portal quote JSON must never leak internal profit fields ---
    const portalQuote = await api(`/api/v1/portal/quotes/${quoteV2.id}`, { token: portalToken });
    const portalQuoteRaw = JSON.stringify(portalQuote.json ?? {});
    const leakedFields = ['estimatedCostCents', 'unitCostCents', 'marginBps', 'profitFloorCents'].filter((f) =>
      portalQuoteRaw.includes(f),
    );
    if (portalQuote.status === 200 && leakedFields.length === 0) {
      pass(report.results, 'portal_quote_json_excludes_profit_fields');
    } else {
      fail(report.results, 'portal_quote_json_excludes_profit_fields', JSON.stringify({ status: portalQuote.status, leakedFields }));
    }

    // --- Web routes (only if vite is up) ---
    if (webUp) {
      const financeQuotesPage = await fetch(`${WEB_BASE}/finance/quotes`, { redirect: 'manual' });
      if ([200, 301, 302].includes(financeQuotesPage.status)) {
        pass(report.results, 'web_route_finance_quotes', String(financeQuotesPage.status));
      } else {
        fail(report.results, 'web_route_finance_quotes', String(financeQuotesPage.status));
      }

      const myQuotesPage = await fetch(`${WEB_BASE}/my/quotes`, { redirect: 'manual' });
      if ([200, 301, 302].includes(myQuotesPage.status)) {
        pass(report.results, 'web_route_my_quotes', String(myQuotesPage.status));
      } else {
        fail(report.results, 'web_route_my_quotes', String(myQuotesPage.status));
      }
    } else {
      pass(report.results, 'web_route_checks_skipped', 'vite not running — no web binary or startup failed');
    }
  } catch (error) {
    fail(report.results, 'harness_error', redactError(error));
    if (apiProc?.getSafeTail) {
      report.apiTail = apiProc.getSafeTail();
    }
  } finally {
    if (apiProc) {
      try {
        apiProc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    if (webProc) {
      try {
        webProc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }

    try {
      const ids = [companyId, foreignCompanyId].filter(Boolean);
      if (ids.length) {
        await sql`DELETE FROM companies WHERE id = ANY(${ids}) AND name LIKE ${LABEL + '%'}`;
        report.cleanup = { ok: true, deletedCompanyCount: ids.length, label: LABEL };
      } else {
        report.cleanup = { ok: true, deletedCompanyCount: 0, label: LABEL };
      }
    } catch (error) {
      report.cleanup = { ok: false, error: redactError(error) };
    }

    await sql.end({ timeout: 5 });
    report.finishedAt = new Date().toISOString();
    report.totals.passed = report.results.filter((r) => r.status === 'PASS').length;
    report.totals.failed = report.results.filter((r) => r.status === 'FAIL').length;
    report.verdict = report.totals.failed === 0 ? 'GO' : 'NO-GO';
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify(
        {
          verdict: report.verdict,
          passed: report.totals.passed,
          failed: report.totals.failed,
          outPath,
          cleanup: report.cleanup,
        },
        null,
        2,
      ),
    );
    process.exit(report.verdict === 'GO' ? 0 : 1);
  }
}

main();
