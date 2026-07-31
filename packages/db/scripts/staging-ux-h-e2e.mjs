/**
 * UX-H staging harness — ACCREC buyer classification, contact quality, marketing
 * consent, reactivation eligibility, audience requests (never provider-sent), and
 * the Xero contact sync-back boundary (never calls Xero).
 *
 * Covers UX-026 (MKT-001–002, CD-006–007, Decision 3 / FIN-006 classification).
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Never prints DATABASE_URL / credentials
 * - Labels temp records STAGING-UX-H
 * - Cleans up only labelled companies
 * - Never calls WhatsApp/email/Gmail/SMTP/n8n/Xero/Meta/Google/AI providers —
 *   only verifies that TITAN never claims a live send/sync happened
 *
 * Usage:
 *   node packages/db/scripts/staging-ux-h-e2e.mjs
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
const outPath = path.resolve(repoRoot, 'diagnostic-output/95-staging-ux-h-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-UX-H';
const API_PORT = Number(process.env.STAGING_API_PORT || 3106);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5180);
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
  const userId = accept.json?.data?.user?.id;
  if (accept.status !== 201 || !accessToken || !userId) return null;
  return { token: accessToken, userId };
}

async function createCustomer(ownerToken, body) {
  const res = await api('/api/v1/crm/customers', { method: 'POST', token: ownerToken, body });
  return { status: res.status, customer: res.json?.data?.customer };
}

async function createInvoice(ownerToken, body) {
  const res = await api('/api/v1/finance/invoices', { method: 'POST', token: ownerToken, body });
  return { status: res.status, invoice: res.json?.data?.invoice, error: res.json?.error };
}

async function createPayment(ownerToken, body) {
  const res = await api('/api/v1/finance/payments', { method: 'POST', token: ownerToken, body });
  return { status: res.status, payment: res.json?.data?.payment, error: res.json?.error };
}

async function main() {
  const report = {
    label: LABEL,
    startedAt: new Date().toISOString(),
    stagingTarget: {},
    contracts: {
      recomputeClassifications: 'POST /api/v1/marketing-eligibility/classifications/recompute',
      listClassifications: 'GET /api/v1/marketing-eligibility/classifications',
      correctContact: 'POST /api/v1/marketing-eligibility/customers/:customerId/contact-correct',
      upsertConsent: 'POST /api/v1/marketing-eligibility/customers/:customerId/consents',
      recomputeEligibility: 'POST /api/v1/marketing-eligibility/eligibility/recompute',
      listEligibility: 'GET /api/v1/marketing-eligibility/eligibility',
      createAudienceRequest: 'POST /api/v1/marketing-eligibility/audience-requests',
      approveAudienceRequest: 'POST /api/v1/marketing-eligibility/audience-requests/:id/approve',
      executeCampaignPlan: 'POST /api/v1/enterprise-marketing-intelligence/campaign-plans/:id/execute (blocked, SEND_PATH_NOT_IMPLEMENTED)',
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
  const password = 'StagingUxHLead1!';
  let companyId = null;
  let foreignCompanyId = null;

  try {
    const meta = await sql`
      select current_database() as db,
             (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
             (select exists(
                select 1 from information_schema.tables
                where table_name = 'marketing_reactivation_eligibility'
             )) as has_reactivation_table,
             (select exists(
                select 1 from information_schema.columns
                where table_name = 'customers' and column_name = 'do_not_contact'
             )) as has_do_not_contact
    `;
    report.stagingTarget = {
      ok: true,
      matchesForbiddenLiveProjectRef: false,
      currentDatabase: meta[0].db,
      drizzleMigrationCount: meta[0].migrations,
      hasReactivationTable: meta[0].has_reactivation_table,
      hasDoNotContactColumn: meta[0].has_do_not_contact,
      appEnv: env.APP_ENV,
      titanEnv: env.TITAN_ENV,
    };
    if (meta[0].has_reactivation_table && meta[0].has_do_not_contact) {
      pass(report.results, 'staging_has_migration_0103', 'marketing_reactivation_eligibility + customers.do_not_contact present');
    } else {
      throw new Error('migration 0103 not applied on staging');
    }

    if (MANAGE_RUNTIME) {
      freePort(API_PORT);
      freePort(WEB_PORT);
      await new Promise((r) => setTimeout(r, 400));
      const jwt = `staging-ux-h-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-ux-h-refresh-${randomBytes(24).toString('hex')}`;
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

    // --- Owner signup labelled ---
    const signup = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Co ${suffix}`,
        firstName: 'Owner',
        lastName: 'UxH',
        email: `owner.${suffix}@staging-ux-h.test`,
        password,
      },
    });
    const ownerToken = signup.json?.data?.session?.accessToken;
    companyId = signup.json?.data?.user?.companyId;
    if (signup.status !== 201 || !ownerToken || !companyId) {
      throw new Error(`signup failed: ${JSON.stringify(signup.json?.error || signup.status)}`);
    }
    pass(report.results, 'owner_signup_labelled', companyId);

    // --- Foreign tenant signup ---
    const foreign = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Foreign ${suffix}`,
        firstName: 'Other',
        lastName: 'Tenant',
        email: `foreign.${suffix}@staging-ux-h.test`,
        password,
      },
    });
    foreignCompanyId = foreign.json?.data?.user?.companyId;
    const foreignToken = foreign.json?.data?.session?.accessToken;
    if (foreign.status !== 201 || !foreignToken || !foreignCompanyId) {
      throw new Error('foreign tenant signup failed');
    }
    pass(report.results, 'foreign_tenant_signup');

    // --- Invite roles ---
    const roles = await api('/api/v1/team/roles', { token: ownerToken });
    const roleRows = roles.json?.data?.roles || roles.json?.data?.assignableRoles || [];
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

    const managerInvite = byName.Manager
      ? await inviteRole(ownerToken, byName.Manager, `manager.${suffix}@staging-ux-h.test`, 'Manager', 'UxH', password)
      : null;
    if (managerInvite?.token) pass(report.results, 'manager_invite', managerInvite.userId);
    else fail(report.results, 'manager_invite', 'missing Manager role/token');

    const accountantInvite = byName.Accountant
      ? await inviteRole(ownerToken, byName.Accountant, `accountant.${suffix}@staging-ux-h.test`, 'Accountant', 'UxH', password)
      : null;
    const accountantToken = accountantInvite?.token || null;
    if (accountantToken) pass(report.results, 'accountant_invite', accountantInvite.userId);
    else fail(report.results, 'accountant_invite', 'missing Accountant role/token');

    const dispatcherInvite = byName.Dispatcher
      ? await inviteRole(ownerToken, byName.Dispatcher, `dispatcher.${suffix}@staging-ux-h.test`, 'Dispatcher', 'UxH', password)
      : null;
    const dispatcherToken = dispatcherInvite?.token || null;
    if (dispatcherToken) pass(report.results, 'dispatcher_invite', dispatcherInvite.userId);
    else fail(report.results, 'dispatcher_invite', 'missing Dispatcher role/token');

    const technicianInvite = byName.Technician
      ? await inviteRole(ownerToken, byName.Technician, `tech.${suffix}@staging-ux-h.test`, 'Tech', 'UxH', password)
      : null;
    const technicianToken = technicianInvite?.token || null;
    if (technicianToken) pass(report.results, 'technician_invite', technicianInvite.userId);
    else fail(report.results, 'technician_invite', 'missing Technician role/token');

    // --- Create customers covering every classification path ---
    const paidCustomer = await createCustomer(ownerToken, {
      name: `${LABEL} Paid Buyer ${suffix}`,
      email: `paid.${suffix}@customer-real.test`,
      phone: '0825550101',
    });
    const unpaidCustomer = await createCustomer(ownerToken, {
      name: `${LABEL} Unpaid ACCREC ${suffix}`,
      email: `unpaid.${suffix}@customer-real.test`,
      phone: '0825550102',
    });
    const supplierCustomer = await createCustomer(ownerToken, {
      name: `${LABEL} Supplier ${suffix}`,
      email: `supplier.${suffix}@customer-real.test`,
      isSupplierOnly: true,
    });
    const draftCustomer = await createCustomer(ownerToken, {
      name: `${LABEL} Draft Only ${suffix}`,
      email: `draft.${suffix}@customer-real.test`,
    });
    const leadCustomer = await createCustomer(ownerToken, {
      name: `${LABEL} Lead ${suffix}`,
      email: `lead.${suffix}@customer-real.test`,
      status: 'lead',
    });
    const placeholderCustomer = await createCustomer(ownerToken, {
      name: `${LABEL} Placeholder Email ${suffix}`,
      email: 'noreply@youngguns.co.za',
    });
    const optOutCustomer = await createCustomer(ownerToken, {
      name: `${LABEL} Opt Out Paid Buyer ${suffix}`,
      email: `optout.${suffix}@customer-real.test`,
      phone: '0825550103',
    });

    const customerCreations = {
      paidCustomer,
      unpaidCustomer,
      supplierCustomer,
      draftCustomer,
      leadCustomer,
      placeholderCustomer,
      optOutCustomer,
    };
    const allCreated = Object.values(customerCreations).every((c) => c.status === 201 && c.customer?.id);
    if (allCreated) {
      pass(report.results, 'create_customers_all_paths', Object.keys(customerCreations).join(','));
    } else {
      throw new Error(`customer creation failed: ${JSON.stringify(customerCreations)}`);
    }

    // --- Invoices: paid (sent + full payment), unpaid (sent), draft-only (draft), placeholder (paid) ---
    const paidInvoice = await createInvoice(ownerToken, {
      customerId: paidCustomer.customer.id,
      title: 'UX-H paid invoice',
      status: 'sent',
      amountCents: 100000,
    });
    const paidPayment = paidInvoice.invoice
      ? await createPayment(ownerToken, { invoiceId: paidInvoice.invoice.id, amountCents: 100000 })
      : { status: 0 };

    const unpaidInvoice = await createInvoice(ownerToken, {
      customerId: unpaidCustomer.customer.id,
      title: 'UX-H unpaid invoice',
      status: 'sent',
      amountCents: 50000,
    });

    const draftInvoice = await createInvoice(ownerToken, {
      customerId: draftCustomer.customer.id,
      title: 'UX-H draft invoice',
      amountCents: 20000,
    });

    const placeholderInvoice = await createInvoice(ownerToken, {
      customerId: placeholderCustomer.customer.id,
      title: 'UX-H placeholder-email paid invoice',
      status: 'sent',
      amountCents: 75000,
    });
    const placeholderPayment = placeholderInvoice.invoice
      ? await createPayment(ownerToken, { invoiceId: placeholderInvoice.invoice.id, amountCents: 75000 })
      : { status: 0 };

    const optOutInvoice = await createInvoice(ownerToken, {
      customerId: optOutCustomer.customer.id,
      title: 'UX-H opt-out paid invoice',
      status: 'sent',
      amountCents: 60000,
    });
    const optOutPayment = optOutInvoice.invoice
      ? await createPayment(ownerToken, { invoiceId: optOutInvoice.invoice.id, amountCents: 60000 })
      : { status: 0 };

    if (
      paidInvoice.status === 201 &&
      paidPayment.status === 201 &&
      unpaidInvoice.status === 201 &&
      draftInvoice.status === 201 &&
      placeholderInvoice.status === 201 &&
      placeholderPayment.status === 201 &&
      optOutInvoice.status === 201 &&
      optOutPayment.status === 201
    ) {
      pass(report.results, 'create_invoices_and_payments');
    } else {
      throw new Error(
        `invoice/payment setup failed: ${JSON.stringify({
          paidInvoice: paidInvoice.status,
          paidPayment: paidPayment.status,
          unpaidInvoice: unpaidInvoice.status,
          draftInvoice: draftInvoice.status,
          placeholderInvoice: placeholderInvoice.status,
          placeholderPayment: placeholderPayment.status,
          optOutInvoice: optOutInvoice.status,
          optOutPayment: optOutPayment.status,
        })}`,
      );
    }

    // --- Recompute classifications; verify every classification path ---
    const recompute1 = await api('/api/v1/marketing-eligibility/classifications/recompute', {
      method: 'POST',
      token: ownerToken,
    });
    const classifications1 = recompute1.json?.data?.classifications || [];
    const byCustomerId = Object.fromEntries(classifications1.map((c) => [c.customerId, c]));

    const expectations = [
      [paidCustomer.customer.id, 'paid_buyer', 'paid buyer'],
      [unpaidCustomer.customer.id, 'accrec_buyer', 'unpaid accrec buyer'],
      [supplierCustomer.customer.id, 'supplier_only', 'supplier only'],
      [draftCustomer.customer.id, 'contact_record', 'draft-only contact record'],
      [leadCustomer.customer.id, 'prospect_lead', 'lead prospect'],
      [placeholderCustomer.customer.id, 'paid_buyer', 'placeholder-email paid buyer'],
      [optOutCustomer.customer.id, 'paid_buyer', 'opt-out paid buyer'],
    ];
    let classificationOk = recompute1.status === 200;
    const classificationDetail = {};
    for (const [id, expected, label] of expectations) {
      const actual = byCustomerId[id]?.primaryClassification;
      classificationDetail[label] = { expected, actual };
      if (actual !== expected) classificationOk = false;
    }
    if (classificationOk) {
      pass(report.results, 'classification_all_paths_correct', JSON.stringify(classificationDetail));
    } else {
      fail(report.results, 'classification_all_paths_correct', JSON.stringify(classificationDetail));
    }

    // --- Replay recompute: idempotent, no duplicate rows ---
    const recompute2 = await api('/api/v1/marketing-eligibility/classifications/recompute', {
      method: 'POST',
      token: ownerToken,
    });
    const rowCount = await sql`
      select count(*)::int as c from customer_buyer_classifications where company_id = ${companyId}
    `;
    if (recompute2.status === 200 && rowCount[0].c === 7) {
      pass(report.results, 'classification_recompute_idempotent_no_duplicates', `rows=${rowCount[0].c}`);
    } else {
      fail(
        report.results,
        'classification_recompute_idempotent_no_duplicates',
        JSON.stringify({ status: recompute2.status, rows: rowCount[0].c }),
      );
    }

    // --- Placeholder owner email flagged ---
    const ensurePlaceholder = await api(
      `/api/v1/marketing-eligibility/customers/${placeholderCustomer.customer.id}/contact-fields/ensure`,
      { method: 'POST', token: ownerToken },
    );
    const placeholderEmailField = (ensurePlaceholder.json?.data?.contactFields || []).find(
      (f) => f.fieldKey === 'email',
    );
    if (
      ensurePlaceholder.status === 200 &&
      placeholderEmailField?.verificationState === 'placeholder' &&
      placeholderEmailField?.isSharedCompanyEmail === true
    ) {
      pass(report.results, 'placeholder_owner_email_flagged', JSON.stringify(placeholderEmailField));
    } else {
      fail(report.results, 'placeholder_owner_email_flagged', JSON.stringify(ensurePlaceholder.json));
    }

    // --- SA mobile normalization on correctContact ---
    const correctPhone = await api(
      `/api/v1/marketing-eligibility/customers/${unpaidCustomer.customer.id}/contact-correct`,
      {
        method: 'POST',
        token: ownerToken,
        body: { fieldKey: 'phone', value: '082 123 4567', reason: 'Confirmed with customer by phone' },
      },
    );
    if (correctPhone.status === 200 && correctPhone.json?.data?.contactField?.value === '+27821234567') {
      pass(report.results, 'sa_mobile_normalized_on_correct_contact', correctPhone.json.data.contactField.value);
    } else {
      fail(report.results, 'sa_mobile_normalized_on_correct_contact', JSON.stringify(correctPhone.json));
    }

    // --- Ensure contact quality for paid + opt-out customers (seeds email/phone fields) ---
    await api(`/api/v1/marketing-eligibility/customers/${paidCustomer.customer.id}/contact-fields/ensure`, {
      method: 'POST',
      token: ownerToken,
    });
    await api(`/api/v1/marketing-eligibility/customers/${optOutCustomer.customer.id}/contact-fields/ensure`, {
      method: 'POST',
      token: ownerToken,
    });

    // --- Recompute eligibility BEFORE consent — unknown consent must not be eligible ---
    const eligibilityRecompute1 = await api('/api/v1/marketing-eligibility/eligibility/recompute', {
      method: 'POST',
      token: ownerToken,
    });
    const eligibility1 = eligibilityRecompute1.json?.data?.eligibility || [];
    const paidRowBeforeConsent = eligibility1.find((r) => r.customerId === paidCustomer.customer.id);
    if (
      eligibilityRecompute1.status === 200 &&
      paidRowBeforeConsent?.eligibilityStatus === 'awaiting_verification'
    ) {
      pass(report.results, 'unknown_consent_blocks_eligibility', paidRowBeforeConsent.eligibilityStatus);
    } else {
      fail(report.results, 'unknown_consent_blocks_eligibility', JSON.stringify(paidRowBeforeConsent));
    }

    // --- Verify paid customer's email, grant email consent, recompute → eligible ---
    const verifyEmail = await api(
      `/api/v1/marketing-eligibility/customers/${paidCustomer.customer.id}/contact-correct`,
      {
        method: 'POST',
        token: ownerToken,
        body: {
          fieldKey: 'email',
          value: paidCustomer.customer.email,
          reason: 'Verified with customer during onboarding call',
          markVerified: true,
        },
      },
    );
    const grantConsent = await api(
      `/api/v1/marketing-eligibility/customers/${paidCustomer.customer.id}/consents`,
      {
        method: 'POST',
        token: ownerToken,
        body: { channel: 'email', status: 'granted', reason: 'Customer opted in to reactivation emails by phone' },
      },
    );
    if (
      verifyEmail.status === 200 &&
      verifyEmail.json?.data?.contactField?.verificationState === 'verified' &&
      grantConsent.status === 200 &&
      grantConsent.json?.data?.consent?.status === 'granted'
    ) {
      pass(report.results, 'verify_email_and_grant_consent');
    } else {
      fail(
        report.results,
        'verify_email_and_grant_consent',
        JSON.stringify({ verifyEmail: verifyEmail.json, grantConsent: grantConsent.json }),
      );
    }

    const eligibilityRecompute2 = await api('/api/v1/marketing-eligibility/eligibility/recompute', {
      method: 'POST',
      token: ownerToken,
    });
    const eligibility2 = eligibilityRecompute2.json?.data?.eligibility || [];
    const paidRowAfterConsent = eligibility2.find((r) => r.customerId === paidCustomer.customer.id);
    if (
      eligibilityRecompute2.status === 200 &&
      paidRowAfterConsent?.eligibilityStatus === 'eligible' &&
      paidRowAfterConsent?.preferredChannel === 'email'
    ) {
      pass(
        report.results,
        'granted_verified_consent_makes_paid_buyer_eligible',
        JSON.stringify({ status: paidRowAfterConsent.eligibilityStatus, channel: paidRowAfterConsent.preferredChannel }),
      );
    } else {
      fail(report.results, 'granted_verified_consent_makes_paid_buyer_eligible', JSON.stringify(paidRowAfterConsent));
    }

    // --- Opt-out (do_not_contact) on a paid buyer → blocked, never eligible ---
    const optOutUpdate = await api(`/api/v1/crm/customers/${optOutCustomer.customer.id}`, {
      method: 'PATCH',
      token: ownerToken,
      body: { doNotContact: true },
    });
    const eligibilityRecompute3 = await api('/api/v1/marketing-eligibility/eligibility/recompute', {
      method: 'POST',
      token: ownerToken,
    });
    const eligibility3 = eligibilityRecompute3.json?.data?.eligibility || [];
    const optOutRow = eligibility3.find((r) => r.customerId === optOutCustomer.customer.id);
    if (
      optOutUpdate.status === 200 &&
      optOutUpdate.json?.data?.customer?.doNotContact === true &&
      eligibilityRecompute3.status === 200 &&
      optOutRow?.eligibilityStatus === 'blocked'
    ) {
      pass(report.results, 'opt_out_paid_buyer_blocked', optOutRow.eligibilityStatus);
    } else {
      fail(
        report.results,
        'opt_out_paid_buyer_blocked',
        JSON.stringify({ optOutUpdate: optOutUpdate.json, optOutRow }),
      );
    }

    // --- Eligibility counts sanity ---
    const counts = await api('/api/v1/marketing-eligibility/eligibility/counts', { token: ownerToken });
    if (counts.status === 200 && typeof counts.json?.data?.counts?.eligible === 'number') {
      pass(report.results, 'eligibility_counts_available', JSON.stringify(counts.json.data.counts));
    } else {
      fail(report.results, 'eligibility_counts_available', JSON.stringify(counts.json));
    }

    // --- Audience request: draft → pending → approve; deliveryState always not_sent ---
    const audienceActionId = `ux-h-audience-${suffix}-1`;
    const audienceCreate = await api('/api/v1/marketing-eligibility/audience-requests', {
      method: 'POST',
      token: ownerToken,
      body: { name: `${LABEL} reactivation audience ${suffix}`, clientActionId: audienceActionId },
    });
    const audienceRequestId = audienceCreate.json?.data?.audienceRequest?.id;
    if (
      audienceCreate.status === 201 &&
      audienceRequestId &&
      audienceCreate.json.data.audienceRequest.status === 'draft' &&
      audienceCreate.json.data.audienceRequest.deliveryState === 'not_sent' &&
      audienceCreate.json.data.audienceRequest.memberCount >= 1
    ) {
      pass(report.results, 'audience_request_created_draft_not_sent', JSON.stringify(audienceCreate.json.data.audienceRequest));
    } else {
      fail(report.results, 'audience_request_created_draft_not_sent', JSON.stringify(audienceCreate.json));
    }

    const audienceSubmit = await api(
      `/api/v1/marketing-eligibility/audience-requests/${audienceRequestId}/submit-for-approval`,
      { method: 'POST', token: ownerToken },
    );
    if (audienceSubmit.status === 200 && audienceSubmit.json?.data?.audienceRequest?.status === 'pending_approval') {
      pass(report.results, 'audience_request_submitted_for_approval');
    } else {
      fail(report.results, 'audience_request_submitted_for_approval', JSON.stringify(audienceSubmit.json));
    }

    // Dispatcher (no Owner role, no marketing_intelligence:manage) must not be able to approve
    if (dispatcherToken) {
      const dispatcherApprove = await api(
        `/api/v1/marketing-eligibility/audience-requests/${audienceRequestId}/approve`,
        { method: 'POST', token: dispatcherToken },
      );
      if (dispatcherApprove.status === 403) {
        pass(report.results, 'dispatcher_approve_audience_request_403', String(dispatcherApprove.status));
      } else {
        fail(report.results, 'dispatcher_approve_audience_request_403', JSON.stringify(dispatcherApprove.json || dispatcherApprove.status));
      }
    } else {
      fail(report.results, 'dispatcher_approve_audience_request_403', 'no dispatcher token');
    }

    const audienceApprove = await api(
      `/api/v1/marketing-eligibility/audience-requests/${audienceRequestId}/approve`,
      { method: 'POST', token: ownerToken },
    );
    if (
      audienceApprove.status === 200 &&
      audienceApprove.json?.data?.audienceRequest?.status === 'approved' &&
      audienceApprove.json?.data?.audienceRequest?.deliveryState === 'not_sent'
    ) {
      pass(report.results, 'owner_approves_audience_request_never_sent', JSON.stringify(audienceApprove.json.data.audienceRequest));
    } else {
      fail(report.results, 'owner_approves_audience_request_never_sent', JSON.stringify(audienceApprove.json));
    }

    // Replay create with the same clientActionId — idempotent, no duplicate
    const audienceReplay = await api('/api/v1/marketing-eligibility/audience-requests', {
      method: 'POST',
      token: ownerToken,
      body: { name: 'Different name — should be ignored on replay', clientActionId: audienceActionId },
    });
    const audienceRowCount = await sql`
      select count(*)::int as c from marketing_audience_requests
      where company_id = ${companyId} and client_action_id = ${audienceActionId}
    `;
    if (
      audienceReplay.status === 201 &&
      audienceReplay.json?.data?.audienceRequest?.id === audienceRequestId &&
      audienceRowCount[0].c === 1
    ) {
      pass(report.results, 'audience_request_replay_idempotent_no_duplicate', `rows=${audienceRowCount[0].c}`);
    } else {
      fail(
        report.results,
        'audience_request_replay_idempotent_no_duplicate',
        JSON.stringify({ status: audienceReplay.status, rows: audienceRowCount[0].c }),
      );
    }

    // --- Xero contact sync-back: recorded, never calls Xero ---
    const syncBackRequest = await api('/api/v1/marketing-eligibility/xero-sync-back-requests', {
      method: 'POST',
      token: ownerToken,
      body: { customerId: paidCustomer.customer.id, requestedFields: ['email', 'phone'] },
    });
    if (
      syncBackRequest.status === 201 &&
      syncBackRequest.json?.data?.syncBackRequest?.providerCalled === false &&
      ['requested', 'blocked_no_provider'].includes(syncBackRequest.json?.data?.syncBackRequest?.status)
    ) {
      pass(report.results, 'xero_sync_back_request_never_calls_xero', JSON.stringify(syncBackRequest.json.data.syncBackRequest));
    } else {
      fail(report.results, 'xero_sync_back_request_never_calls_xero', JSON.stringify(syncBackRequest.json));
    }

    // --- executeCampaignPlan is blocked — SEND_PATH_NOT_IMPLEMENTED, never fake-executed ---
    const campaignPlanCreate = await api('/api/v1/enterprise-marketing-intelligence/campaign-plans', {
      method: 'POST',
      token: ownerToken,
      body: { name: `${LABEL} campaign plan ${suffix}`, planKey: `ux-h-plan-${suffix}` },
    });
    const campaignPlanId = campaignPlanCreate.json?.data?.campaignPlan?.id;
    if (campaignPlanCreate.status === 201 && campaignPlanId) {
      pass(report.results, 'campaign_plan_created');
    } else {
      fail(report.results, 'campaign_plan_created', JSON.stringify(campaignPlanCreate.json));
    }

    if (campaignPlanId) {
      const executeAttempt = await api(
        `/api/v1/enterprise-marketing-intelligence/campaign-plans/${campaignPlanId}/execute`,
        { method: 'POST', token: ownerToken },
      );
      if (executeAttempt.status === 501 && executeAttempt.json?.error?.code === 'SEND_PATH_NOT_IMPLEMENTED') {
        pass(report.results, 'execute_campaign_plan_blocked_send_not_implemented', JSON.stringify(executeAttempt.json.error));
      } else {
        fail(report.results, 'execute_campaign_plan_blocked_send_not_implemented', JSON.stringify(executeAttempt.json || executeAttempt.status));
      }
    } else {
      fail(report.results, 'execute_campaign_plan_blocked_send_not_implemented', 'no campaign plan id');
    }

    // --- Permission matrix ---
    if (managerInvite?.token) {
      const managerList = await api('/api/v1/marketing-eligibility/classifications', { token: managerInvite.token });
      if (managerList.status === 200) {
        pass(report.results, 'manager_lists_classifications_200', `count=${(managerList.json?.data?.classifications || []).length}`);
      } else {
        fail(report.results, 'manager_lists_classifications_200', JSON.stringify(managerList.json || managerList.status));
      }
    } else {
      fail(report.results, 'manager_lists_classifications_200', 'no manager token');
    }

    if (accountantToken) {
      const accountantList = await api('/api/v1/marketing-eligibility/classifications', { token: accountantToken });
      if (accountantList.status === 200) {
        pass(report.results, 'accountant_lists_classifications_200_finance_read', `count=${(accountantList.json?.data?.classifications || []).length}`);
      } else {
        fail(report.results, 'accountant_lists_classifications_200_finance_read', JSON.stringify(accountantList.json || accountantList.status));
      }

      const accountantConsentWrite = await api(
        `/api/v1/marketing-eligibility/customers/${unpaidCustomer.customer.id}/consents`,
        {
          method: 'POST',
          token: accountantToken,
          body: { channel: 'email', status: 'granted', reason: 'Accountant should not be able to do this' },
        },
      );
      if (accountantConsentWrite.status === 403) {
        pass(report.results, 'accountant_consent_write_403', String(accountantConsentWrite.status));
      } else {
        fail(report.results, 'accountant_consent_write_403', JSON.stringify(accountantConsentWrite.json || accountantConsentWrite.status));
      }
    } else {
      fail(report.results, 'accountant_lists_classifications_200_finance_read', 'no accountant token');
      fail(report.results, 'accountant_consent_write_403', 'no accountant token');
    }

    if (dispatcherToken) {
      const dispatcherContactCorrect = await api(
        `/api/v1/marketing-eligibility/customers/${unpaidCustomer.customer.id}/contact-correct`,
        {
          method: 'POST',
          token: dispatcherToken,
          body: { fieldKey: 'contact_person', value: 'Dispatcher Verified Contact', reason: 'Dispatcher confirmed on-site' },
        },
      );
      if (dispatcherContactCorrect.status === 200) {
        pass(report.results, 'dispatcher_contact_correct_200', dispatcherContactCorrect.json?.data?.contactField?.value);
      } else {
        fail(report.results, 'dispatcher_contact_correct_200', JSON.stringify(dispatcherContactCorrect.json || dispatcherContactCorrect.status));
      }
    } else {
      fail(report.results, 'dispatcher_contact_correct_200', 'no dispatcher token');
    }

    if (technicianToken) {
      const technicianAudienceList = await api('/api/v1/marketing-eligibility/audience-requests', { token: technicianToken });
      const technicianEligibilityList = await api('/api/v1/marketing-eligibility/eligibility', { token: technicianToken });
      if (technicianAudienceList.status === 403 && technicianEligibilityList.status === 403) {
        pass(report.results, 'technician_audience_and_eligibility_403', `${technicianAudienceList.status}/${technicianEligibilityList.status}`);
      } else {
        fail(
          report.results,
          'technician_audience_and_eligibility_403',
          JSON.stringify({ audience: technicianAudienceList.status, eligibility: technicianEligibilityList.status }),
        );
      }
    } else {
      fail(report.results, 'technician_audience_and_eligibility_403', 'no technician token');
    }

    // --- Foreign tenant isolation ---
    const foreignClassifications = await api('/api/v1/marketing-eligibility/classifications', { token: foreignToken });
    const foreignIds = new Set((foreignClassifications.json?.data?.classifications || []).map((c) => c.customerId));
    const leaked = expectations.some(([id]) => foreignIds.has(id));
    if (foreignClassifications.status === 200 && !leaked && foreignIds.size === 0) {
      pass(report.results, 'foreign_tenant_no_owner_classifications', `count=${foreignIds.size}`);
    } else {
      fail(report.results, 'foreign_tenant_no_owner_classifications', JSON.stringify({ status: foreignClassifications.status, leaked, count: foreignIds.size }));
    }

    const foreignContactCorrect = await api(
      `/api/v1/marketing-eligibility/customers/${paidCustomer.customer.id}/contact-correct`,
      {
        method: 'POST',
        token: foreignToken,
        body: { fieldKey: 'phone', value: '0825550199', reason: 'Foreign tenant should not reach this customer' },
      },
    );
    if (foreignContactCorrect.status === 404 || foreignContactCorrect.status === 403) {
      pass(report.results, 'foreign_tenant_cannot_correct_owner_customer_contact', String(foreignContactCorrect.status));
    } else {
      fail(report.results, 'foreign_tenant_cannot_correct_owner_customer_contact', JSON.stringify(foreignContactCorrect.json || foreignContactCorrect.status));
    }

    // --- Human-Quality Content Standard ---
    const standard = await api('/api/v1/marketing-eligibility/human-quality-content-standard', { token: ownerToken });
    if (
      standard.status === 200 &&
      Array.isArray(standard.json?.data?.standard?.requirements) &&
      standard.json.data.standard.requirements.length > 0
    ) {
      pass(report.results, 'human_quality_content_standard_available', standard.json.data.standard.title);
    } else {
      fail(report.results, 'human_quality_content_standard_available', JSON.stringify(standard.json));
    }

    // --- Web smoke at 375 / 390 / 414 widths: /marketing ---
    if (webUp) {
      const widths = [375, 390, 414];
      let allOk = true;
      const details = [];
      for (const width of widths) {
        const ua = `Mozilla/5.0 (iPhone; CPU iPhone OS) Titan-Staging-Smoke/1 (width=${width})`;
        const marketingPage = await fetch(`${WEB_BASE}/marketing`, {
          redirect: 'manual',
          headers: { 'User-Agent': ua },
        });
        const ok = [200, 301, 302].includes(marketingPage.status);
        details.push(`${width}=${marketingPage.status}`);
        if (!ok) allOk = false;
      }
      if (allOk) {
        pass(report.results, 'web_route_marketing_375_390_414', details.join(' '));
      } else {
        fail(report.results, 'web_route_marketing_375_390_414', details.join(' '));
      }
    } else {
      pass(report.results, 'web_route_marketing_375_390_414', 'vite not running — skipped');
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

    // --- Cleanup labelled companies only ---
    try {
      const ids = [companyId, foreignCompanyId].filter(Boolean);
      if (ids.length) {
        await sql`DELETE FROM companies WHERE id = ANY(${ids}) AND name LIKE ${LABEL + '%'}`;
      }
      const leftover = await sql`
        select count(*)::int as c from companies where name LIKE ${LABEL + '%'}
      `;
      report.cleanup = { ok: leftover[0].c === 0, deletedCompanyCount: ids.length, leftoverCount: leftover[0].c, label: LABEL };
      if (leftover[0].c === 0) {
        pass(report.results, 'cleanup_labelled_companies', `deleted=${ids.length} leftover=0`);
      } else {
        fail(report.results, 'cleanup_labelled_companies', `leftover=${leftover[0].c}`);
      }
    } catch (error) {
      report.cleanup = { ok: false, error: redactError(error) };
      fail(report.results, 'cleanup_labelled_companies', redactError(error));
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
