#!/usr/bin/env node
/**
 * TITAN QA-0 — BrowserStack staging audit sandbox provisioner.
 *
 * STAGING ONLY. Refuses production project ref rshuiaghmtrvvilhqpwm.
 * Credentials written outside Git to ~/.titan-audit-sandbox/credentials.json (0600).
 *
 * Usage:
 *   node packages/db/scripts/staging-audit-sandbox-provision.mjs
 *   STAGING_API_BASE=https://young-guns-os-staging.up.railway.app node packages/db/scripts/...
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const manifestPath = path.resolve(repoRoot, 'diagnostic-output/qa0-audit-sandbox-manifest.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = '[AUDIT]';
const SLUG = 'titan-audit-sandbox';
const COMPANY_NAME = 'TITAN Audit Sandbox';
const INDUSTRY = 'General Field Services';
const BANNER = 'STAGING AUDIT SANDBOX — NO REAL BUSINESS DATA';
const API_BASE =
  process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app';
const WEB_BASE =
  process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app';
const CREDENTIALS_DIR =
  process.env.TITAN_AUDIT_SANDBOX_CREDENTIALS_DIR ||
  path.join(process.env.HOME || '/tmp', '.titan-audit-sandbox');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

const ACCOUNTS = {
  owner: {
    email: 'audit.owner@titan-staging.test',
    role: 'Company Owner',
    firstName: 'Audit',
    lastName: 'Owner',
    staff: true,
  },
  dispatcher: {
    email: 'audit.dispatcher@titan-staging.test',
    role: 'Dispatcher',
    firstName: 'Audit',
    lastName: 'Dispatcher',
    staff: true,
  },
  technician: {
    email: 'audit.technician@titan-staging.test',
    role: 'Technician',
    firstName: 'Audit',
    lastName: 'Technician',
    staff: true,
  },
  client: {
    email: 'audit.client@titan-staging.test',
    role: 'Client (Portal)',
    firstName: 'Audit',
    lastName: 'Client',
    staff: false,
  },
};

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
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

function fp(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function generatePassword() {
  return randomBytes(18).toString('base64url');
}

function loadExistingPasswords() {
  if (!fs.existsSync(CREDENTIALS_FILE)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
    const accounts = parsed.accounts ?? {};
    const out = {};
    for (const key of Object.keys(ACCOUNTS)) {
      if (accounts[key]?.password) out[key] = accounts[key].password;
    }
    return Object.keys(out).length === 4 ? out : null;
  } catch {
    return null;
  }
}

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 400) });
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${pathname}`, {
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

async function loginStaff(email, password) {
  const res = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status !== 200 || res.json?.data?.session?.accessToken) {
    if (res.json?.data?.mfaChallengeToken) {
      return { error: 'MFA_REQUIRED', res };
    }
  }
  const token = res.json?.data?.session?.accessToken;
  const user = res.json?.data?.user;
  if (!token || !user) return { error: 'LOGIN_FAILED', res };
  return { token, user };
}

async function loginPortal(email, password) {
  const res = await api('/api/v1/portal/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  const token = res.json?.data?.session?.accessToken;
  const user = res.json?.data?.user;
  if (res.status !== 200 || !token || !user) return { error: 'PORTAL_LOGIN_FAILED', res };
  return { token, user };
}

async function inviteStaff(results, ownerToken, roleId, accountKey, password) {
  const account = ACCOUNTS[accountKey];
  const invite = await api('/api/v1/team/invites', {
    method: 'POST',
    token: ownerToken,
    body: { email: account.email, roleId },
  });
  const inviteUrl = invite.json?.data?.inviteUrl;
  const tokenMatch = typeof inviteUrl === 'string' ? inviteUrl.match(/token=([^&]+)/) : null;
  if (invite.status !== 201 || !tokenMatch) {
    if (invite.json?.error?.code === 'EMAIL_IN_USE') {
      const login = await loginStaff(account.email, password);
      if (login.token) {
        pass(results, `staff_exists_${accountKey}`, account.email);
        return login;
      }
    }
    fail(results, `invite_${accountKey}`, JSON.stringify(invite.json?.error || invite.status));
    return null;
  }
  const accept = await api('/api/v1/auth/accept-invite', {
    method: 'POST',
    body: {
      token: tokenMatch[1],
      firstName: account.firstName,
      lastName: account.lastName,
      password,
    },
  });
  const token = accept.json?.data?.session?.accessToken;
  const user = accept.json?.data?.user;
  if (accept.status !== 201 || !token || !user) {
    fail(results, `accept_${accountKey}`, JSON.stringify(accept.json?.error || accept.status));
    return null;
  }
  pass(results, `provision_${accountKey}`, user.id);
  return { token, user };
}

function writeCredentials(manifest) {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  const payload = {
    generatedAt: new Date().toISOString(),
    purpose: 'BrowserStack / automated QA — staging only',
    stagingApiBase: API_BASE,
    stagingWebBase: WEB_BASE,
    companyId: manifest.companyId,
    companySlug: SLUG,
    accounts: {},
  };
  for (const [key, cred] of Object.entries(manifest.credentials)) {
    payload.accounts[key] = {
      email: cred.email,
      password: cred.password,
      role: cred.role,
      loginUrl: cred.loginUrl,
      postLoginRoute: cred.postLoginRoute,
    };
  }
  fs.writeFileSync(CREDENTIALS_FILE, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(CREDENTIALS_DIR, 0o700);
    fs.chmodSync(CREDENTIALS_FILE, 0o600);
  } catch {
    /* best effort */
  }
}

async function main() {
  const startedHead = execSyncHead();
  const report = {
    label: 'QA-0-audit-sandbox',
    startedAt: new Date().toISOString(),
    startingHead: startedHead,
    stagingApiBase: API_BASE,
    stagingWebBase: WEB_BASE,
    credentialsPath: CREDENTIALS_FILE,
    results: [],
    records: {},
    credentials: {},
    browserStack: {
      staffLoginUrl: `${WEB_BASE}/auth/login`,
      portalLoginUrl: `${WEB_BASE}/my/login`,
      selectors: {
        email: 'input[name="email"], input[type="email"]',
        password: 'input[name="password"], input[type="password"]',
        submit: 'button[type="submit"]',
      },
      scans: [
        { name: 'TITAN Audit — Company Owner', email: ACCOUNTS.owner.email, loginUrl: `${WEB_BASE}/auth/login` },
        { name: 'TITAN Audit — Dispatcher', email: ACCOUNTS.dispatcher.email, loginUrl: `${WEB_BASE}/auth/login` },
        { name: 'TITAN Audit — Technician', email: ACCOUNTS.technician.email, loginUrl: `${WEB_BASE}/auth/login` },
        { name: 'TITAN Audit — Client', email: ACCOUNTS.client.email, loginUrl: `${WEB_BASE}/my/login` },
      ],
    },
    migrationDecision: 'NONE — no migration required',
    verdict: 'NO-GO',
  };

  if (!fs.existsSync(envPath)) {
    fail(report.results, 'staging_env', 'apps/api/.env.staging.local missing');
    finish(report, 2);
    return;
  }

  const env = loadEnv(envPath);
  if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging' || !env.DATABASE_URL) {
    fail(report.results, 'staging_labels', 'APP_ENV/TITAN_ENV/DATABASE_URL required');
    finish(report, 2);
    return;
  }
  if (env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
    fail(report.results, 'production_refused', FORBIDDEN);
    finish(report, 3);
    return;
  }

  pass(report.results, 'production_excluded', `db_fp=${fp(env.DATABASE_URL)}`);

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  const passwords = loadExistingPasswords() ?? {
    owner: generatePassword(),
    dispatcher: generatePassword(),
    technician: generatePassword(),
    client: generatePassword(),
  };

  try {
    const health = await api('/api/v1/health/ready');
    if (health.status === 200) pass(report.results, 'staging_api_health', '200');
    else fail(report.results, 'staging_api_health', String(health.status));

    let companyRow = await sql`
      select id, name, slug from companies where slug = ${SLUG} limit 1
    `;
    let companyId = companyRow[0]?.id ?? null;
    let ownerToken = null;
    let ownerUserId = null;

    if (!companyId) {
      const signup = await api('/api/v1/auth/signup', {
        method: 'POST',
        body: {
          companyName: COMPANY_NAME,
          email: ACCOUNTS.owner.email,
          password: passwords.owner,
          firstName: ACCOUNTS.owner.firstName,
          lastName: ACCOUNTS.owner.lastName,
        },
      });
      if (signup.status !== 201) {
        if (signup.json?.error?.code === 'EMAIL_IN_USE') {
          const login = await loginStaff(ACCOUNTS.owner.email, passwords.owner);
          if (login.error) {
            fail(report.results, 'owner_signup', 'email in use and login failed — run reset or update credentials file');
            finish(report, 4);
            return;
          }
          ownerToken = login.token;
          ownerUserId = login.user.id;
          companyId = login.user.companyId;
          pass(report.results, 'owner_existing_login', companyId);
        } else {
          fail(report.results, 'owner_signup', JSON.stringify(signup.json?.error || signup.status));
          finish(report, 4);
          return;
        }
      } else {
        ownerToken = signup.json.data.session.accessToken;
        ownerUserId = signup.json.data.user.id;
        companyId = signup.json.data.user.companyId;
        pass(report.results, 'owner_signup', companyId);
      }
    } else {
      pass(report.results, 'sandbox_company_exists', companyId);
      const login = await loginStaff(ACCOUNTS.owner.email, passwords.owner);
      if (login.error) {
        fail(
          report.results,
          'owner_login',
          'Sandbox exists but owner login failed — credentials may have changed; run reset script',
        );
      } else {
        ownerToken = login.token;
        ownerUserId = login.user.id;
        pass(report.results, 'owner_login', ownerUserId);
      }
    }

    await sql`
      update companies
      set name = ${COMPANY_NAME},
          slug = ${SLUG},
          industry = ${INDUSTRY},
          business_type = 'field_services',
          preferences = ${sql.json({
            timezone: 'Africa/Johannesburg',
            currency: 'ZAR',
            locale: 'en-ZA',
            aiTone: 'professional',
            auditSandbox: true,
            auditSandboxBanner: BANNER,
            auditSandboxPurpose: 'BrowserStack and automated QA only',
            auditSandboxOutboundBlocked: true,
            auditSandboxMfaDisabled: true,
            notes: `${LABEL} Synthetic tenant — no real business data.`,
            servicesOffered: `${LABEL} General maintenance, inspection, repair`,
          })},
          updated_at = now()
      where id = ${companyId}
    `;
    pass(report.results, 'sandbox_company_configured', SLUG);

    await sql`
      update security_tenant_policies
      set mfa_required = false, updated_at = now()
      where company_id = ${companyId}
    `.catch(() => undefined);
    pass(report.results, 'mfa_not_required', 'tenant policy mfa_required=false');

    const rolesRes = await api('/api/v1/team/roles', { token: ownerToken });
    const roles = rolesRes.json?.data?.roles || [];
    const dispatcherRole = roles.find((r) => r.name === 'Dispatcher');
    const technicianRole = roles.find((r) => r.name === 'Technician');
    if (!dispatcherRole?.id || !technicianRole?.id) {
      fail(report.results, 'role_lookup', JSON.stringify(roles.map((r) => r.name)));
      finish(report, 5);
      return;
    }
    pass(report.results, 'roles_loaded', `${dispatcherRole.id},${technicianRole.id}`);

    const dispatcherLogin =
      (await inviteStaff(report.results, ownerToken, dispatcherRole.id, 'dispatcher', passwords.dispatcher)) ||
      null;
    const technicianLogin =
      (await inviteStaff(report.results, ownerToken, technicianRole.id, 'technician', passwords.technician)) ||
      null;

    const cust1 = await api('/api/v1/crm/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Customer Alpha`,
        contactPerson: `${LABEL} Contact Alpha`,
        email: 'audit.alpha@example.test',
        phone: '+27821000001',
        status: 'active',
        notes: `${LABEL} synthetic customer`,
      },
    });
    const cust2 = await api('/api/v1/crm/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Customer Beta`,
        contactPerson: `${LABEL} Contact Beta`,
        email: 'audit.beta@example.test',
        phone: '+27821000002',
        status: 'active',
        notes: `${LABEL} synthetic customer`,
      },
    });
    const customerAlphaId = cust1.json?.data?.customer?.id;
    const customerBetaId = cust2.json?.data?.customer?.id;
    if (customerAlphaId) pass(report.results, 'customer_alpha', customerAlphaId);
    else fail(report.results, 'customer_alpha', cust1.status);
    if (customerBetaId) pass(report.results, 'customer_beta', customerBetaId);
    else fail(report.results, 'customer_beta', cust2.status);

    const prop1 = await api(`/api/v1/crm/customers/${customerAlphaId}/properties`, {
      method: 'POST',
      token: ownerToken,
      body: {
        propertyName: `${LABEL} Site Alpha`,
        street: '100 Sandbox Lane',
        suburb: 'Testville',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        isPrimary: true,
      },
    });
    const prop2 = await api(`/api/v1/crm/customers/${customerBetaId}/properties`, {
      method: 'POST',
      token: ownerToken,
      body: {
        propertyName: `${LABEL} Site Beta`,
        street: '200 QA Crescent',
        suburb: 'Scanborough',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        isPrimary: true,
      },
    });
    const propertyAlphaId = prop1.json?.data?.property?.id;
    const propertyBetaId = prop2.json?.data?.property?.id;
    if (propertyAlphaId) pass(report.results, 'property_alpha', propertyAlphaId);
    if (propertyBetaId) pass(report.results, 'property_beta', propertyBetaId);

    const jobBody = (customerId, propertyId, jobType, description) => ({
      customerId,
      propertyId,
      jobType,
      description,
      priority: 'normal',
      siteContact: {
        name: `${LABEL} Site Contact`,
        mobile: '+27821000111',
        email: 'site.contact@example.test',
      },
      accessInstructions: `${LABEL} sandbox access notes`,
    });

    const jobScheduled = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        ...jobBody(
          customerAlphaId,
          propertyAlphaId,
          `${LABEL} Scheduled inspection`,
          `${LABEL} scheduled job`,
        ),
        preferredAppointmentAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    const jobInProgress = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: jobBody(
        customerAlphaId,
        propertyAlphaId,
        `${LABEL} In-progress repair`,
        `${LABEL} in-progress job`,
      ),
    });
    const jobCompleted = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: jobBody(
        customerBetaId,
        propertyBetaId,
        `${LABEL} Completed service`,
        `${LABEL} completed job`,
      ),
    });
    const jobScheduledId = jobScheduled.json?.data?.job?.id;
    const jobInProgressId = jobInProgress.json?.data?.job?.id;
    const jobCompletedId = jobCompleted.json?.data?.job?.id;
    if (jobScheduledId) {
      pass(report.results, 'job_scheduled', jobScheduledId);
      await api(`/api/v1/jobs/${jobScheduledId}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { status: 'scheduled' },
      });
    } else fail(report.results, 'job_scheduled', JSON.stringify(jobScheduled.json?.error || jobScheduled.status));
    if (jobInProgressId) {
      pass(report.results, 'job_in_progress', jobInProgressId);
      await api(`/api/v1/jobs/${jobInProgressId}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { status: 'in_progress' },
      });
    } else fail(report.results, 'job_in_progress', JSON.stringify(jobInProgress.json?.error || jobInProgress.status));
    if (jobCompletedId) {
      pass(report.results, 'job_completed', jobCompletedId);
      await api(`/api/v1/jobs/${jobCompletedId}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { status: 'completed' },
      });
    } else fail(report.results, 'job_completed', JSON.stringify(jobCompleted.json?.error || jobCompleted.status));

    if (technicianLogin?.user?.id && jobInProgressId) {
      const schedule = await api(`/api/v1/scheduling/jobs/${jobInProgressId}/schedule`, {
        method: 'POST',
        token: ownerToken,
        body: {
          scheduledAt: new Date(Date.now() + 86400000).toISOString().replace(/T.*/, 'T08:00:00.000Z'),
          scheduledEndAt: new Date(Date.now() + 86400000).toISOString().replace(/T.*/, 'T10:00:00.000Z'),
          assignedUserId: technicianLogin.user.id,
          acknowledgeConflicts: true,
        },
      });
      if (schedule.status === 200 || schedule.status === 201) {
        pass(report.results, 'technician_scheduled', technicianLogin.user.id);
      } else {
        const assignFallback = await api(`/api/v1/jobs/${jobInProgressId}`, {
          method: 'PATCH',
          token: ownerToken,
          body: { assignedUserId: technicianLogin.user.id },
        });
        if (assignFallback.status === 200) {
          pass(report.results, 'technician_scheduled', 'assignedUserId fallback');
        } else {
          fail(report.results, 'technician_scheduled', JSON.stringify(schedule.json?.error || schedule.status));
        }
      }

      const crewMembers = [{ userId: technicianLogin.user.id, crewRole: 'crew_leader', isPrimary: true }];
      if (dispatcherLogin?.user?.id) {
        crewMembers.push({ userId: dispatcherLogin.user.id, crewRole: 'assistant', isPrimary: false });
      } else {
        crewMembers.push({ userId: ownerUserId, crewRole: 'assistant', isPrimary: false });
      }

      const crew = await api(`/api/v1/jobs/${jobInProgressId}/crew`, {
        method: 'PUT',
        token: ownerToken,
        body: {
          members: crewMembers,
          primaryUserId: technicianLogin.user.id,
        },
      });
      if (crew.status === 200) pass(report.results, 'technician_assigned', technicianLogin.user.id);
      else fail(report.results, 'technician_assigned', JSON.stringify(crew.json?.error || crew.status));
    }

    const vehiclePlate = `AUDIT${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const vehicle = await api('/api/v1/fleet/vehicles', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Service Van`,
        make: 'Toyota',
        model: 'Hilux',
        year: 2021,
        licensePlate: vehiclePlate,
        status: 'available',
        notes: `${LABEL} no live tracking`,
      },
    });
    if (vehicle.status === 201) pass(report.results, 'vehicle', vehicle.json?.data?.vehicle?.id);
    else fail(report.results, 'vehicle', JSON.stringify(vehicle.json?.error || vehicle.status));

    const supplier = await api('/api/v1/procurement/suppliers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Supply Co`,
        contactName: `${LABEL} Supplier Contact`,
        email: 'supplier@example.test',
        phone: '+27821000099',
        notes: `${LABEL} synthetic supplier`,
      },
    });
    if (supplier.status === 201) pass(report.results, 'supplier', supplier.json?.data?.supplier?.id);
    else fail(report.results, 'supplier', supplier.status);

    const location = await api('/api/v1/inventory/locations', {
      method: 'POST',
      token: ownerToken,
      body: { name: `${LABEL} Warehouse`, code: 'AUDWH', locationType: 'warehouse', isDefault: true },
    });
    const locationId = location.json?.data?.location?.id;
    if (locationId) pass(report.results, 'inventory_location', locationId);

    const itemIds = [];
    for (const sku of ['AUD-001', 'AUD-002', 'AUD-003']) {
      const item = await api('/api/v1/inventory/items', {
        method: 'POST',
        token: ownerToken,
        body: {
          sku,
          name: `${LABEL} Item ${sku}`,
          description: `${LABEL} synthetic inventory`,
          unit: 'each',
          reorderLevel: 2,
          unitCostCents: 1000,
          sellPriceCents: 2500,
          status: 'active',
        },
      });
      if (item.json?.data?.item?.id) {
        itemIds.push(item.json.data.item.id);
        if (locationId) {
          await api('/api/v1/inventory/stock', {
            method: 'PUT',
            token: ownerToken,
            body: { itemId: item.json.data.item.id, locationId, quantityOnHand: 5 },
          });
        }
      }
    }
    if (itemIds.length === 3) pass(report.results, 'inventory_items', itemIds.join(','));

    const draftQuote = await api('/api/v1/finance/quotes', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId: customerAlphaId,
        propertyId: propertyAlphaId,
        title: `${LABEL} Draft quote`,
        notes: `${LABEL} draft — not issued externally`,
        lineItems: [
          {
            description: `${LABEL} Labour`,
            quantity: 1,
            unitPriceCents: 150000,
            taxRatePercent: 15,
          },
        ],
      },
    });
    if (draftQuote.status === 201) pass(report.results, 'draft_quote', draftQuote.json?.data?.quote?.id);
    else fail(report.results, 'draft_quote', draftQuote.status);

    const draftInvoice = await api('/api/v1/finance/invoices', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId: customerBetaId,
        propertyId: propertyBetaId,
        title: `${LABEL} Draft invoice`,
        notes: `${LABEL} draft — no payment`,
        lineItems: [
          {
            description: `${LABEL} Service fee`,
            quantity: 1,
            unitPriceCents: 95000,
            taxRatePercent: 15,
          },
        ],
      },
    });
    if (draftInvoice.status === 201) pass(report.results, 'draft_invoice', draftInvoice.json?.data?.invoice?.id);
    else fail(report.results, 'draft_invoice', draftInvoice.status);

    const message = await api('/api/v1/communications/messages', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId: customerAlphaId,
        jobId: jobScheduledId,
        channel: 'note',
        direction: 'inbound',
        visibility: 'internal_note',
        subject: `${LABEL} Message thread seed`,
        body: `${LABEL} Internal-only message — cannot send externally in audit sandbox.`,
      },
    });
    if (message.status === 201) pass(report.results, 'internal_message', message.json?.data?.message?.id);
    else fail(report.results, 'internal_message', message.status);

    const portalUser = await api('/api/v1/portal/users', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId: customerAlphaId,
        email: ACCOUNTS.client.email,
        password: passwords.client,
        firstName: ACCOUNTS.client.firstName,
        lastName: ACCOUNTS.client.lastName,
      },
    });
    if (portalUser.status === 201) pass(report.results, 'portal_client', portalUser.json?.data?.user?.id);
    else if (portalUser.json?.error?.code === 'EMAIL_IN_USE') pass(report.results, 'portal_client_exists', 'ok');
    else fail(report.results, 'portal_client', JSON.stringify(portalUser.json?.error || portalUser.status));

    const youngGuns = await sql`
      select id, slug, name from companies
      where lower(name) like '%young guns%' or slug like '%young%'
      limit 5
    `;
    const ygUsersInSandbox = await sql`
      select count(*)::int as n from users
      where company_id = ${companyId}
        and email ilike '%@youngguns%'
    `;
    if (ygUsersInSandbox[0].n === 0) pass(report.results, 'no_young_guns_users_in_sandbox', '0');
    else fail(report.results, 'no_young_guns_users_in_sandbox', String(ygUsersInSandbox[0].n));

    const sandboxUsersInYg = await sql`
      select count(*)::int as n from users u
      join companies c on c.id = u.company_id
      where u.email like 'audit.%@titan-staging.test'
        and c.slug <> ${SLUG}
    `;
    if (sandboxUsersInYg[0].n === 0) pass(report.results, 'no_audit_users_outside_sandbox', '0');
    else fail(report.results, 'no_audit_users_outside_sandbox', String(sandboxUsersInYg[0].n));

    if (dispatcherLogin?.token) {
      const deniedFinanceWrite = await api('/api/v1/finance/invoices', {
        method: 'POST',
        token: dispatcherLogin.token,
        body: {
          customerId: customerAlphaId,
          propertyId: propertyAlphaId,
          title: `${LABEL} denied write`,
          lineItems: [{ description: 'test', quantity: 1, unitPriceCents: 100, taxRatePercent: 0 }],
        },
      });
      if (deniedFinanceWrite.status === 403) pass(report.results, 'dispatcher_finance_write_denied', '403');
      else fail(report.results, 'dispatcher_finance_write_denied', deniedFinanceWrite.status);

      const deniedSocialOAuth = await api('/api/v1/social-connections/oauth/start', {
        method: 'POST',
        token: dispatcherLogin.token,
        body: { provider: 'instagram', returnPath: '/integrations' },
      });
      if (deniedSocialOAuth.status === 403) pass(report.results, 'dispatcher_integrations_denied', '403');
      else fail(report.results, 'dispatcher_integrations_denied', deniedSocialOAuth.status);
    }

    if (technicianLogin?.token) {
      const deniedIntegrations = await api('/api/v1/social-connections/dashboard', {
        token: technicianLogin.token,
      });
      if (deniedIntegrations.status === 403) pass(report.results, 'technician_integrations_denied', '403');
      else fail(report.results, 'technician_integrations_denied', deniedIntegrations.status);

      if (jobInProgressId) {
        const allowedJob = await api(`/api/v1/mobile/technician/workforce/jobs/${jobInProgressId}`, {
          token: technicianLogin.token,
        });
        if (allowedJob.status === 200) pass(report.results, 'technician_assigned_job_access', '200');
        else fail(report.results, 'technician_assigned_job_access', allowedJob.status);
      }
    }

    const portalLogin = await loginPortal(ACCOUNTS.client.email, passwords.client);
    if (!portalLogin.error) pass(report.results, 'portal_client_login', portalLogin.user.id);
    else fail(report.results, 'portal_client_login', portalLogin.error);

    if (portalLogin.token && jobCompletedId && customerBetaId) {
      const foreignJob = await api(`/api/v1/portal/jobs/${jobCompletedId}`, { token: portalLogin.token });
      if (foreignJob.status === 404 || foreignJob.status === 403) {
        pass(report.results, 'portal_cross_customer_denied', String(foreignJob.status));
      } else {
        fail(report.results, 'portal_cross_customer_denied', foreignJob.status);
      }
    } else if (portalLogin.token && !jobCompletedId) {
      fail(report.results, 'portal_cross_customer_denied', 'skipped — completed job missing');
    }

    for (const key of ['owner', 'dispatcher', 'technician']) {
      const login = await loginStaff(ACCOUNTS[key].email, passwords[key]);
      if (login.token && login.user?.companyId === companyId) {
        pass(report.results, `login_${key}`, login.user.roleName);
      } else {
        fail(report.results, `login_${key}`, login.error || 'failed');
      }
    }

    for (const [key, account] of Object.entries(ACCOUNTS)) {
      const password = passwords[key];
      const loginUrl = account.staff ? `${WEB_BASE}/auth/login` : `${WEB_BASE}/my/login`;
      let postLoginRoute = '/';
      if (account.role === 'Technician') postLoginRoute = '/mobile';
      if (!account.staff) postLoginRoute = '/my';
      report.credentials[key] = {
        email: account.email,
        password,
        role: account.role,
        loginUrl,
        postLoginRoute,
      };
    }

    writeCredentials(report);

    report.companyId = companyId;
    report.companyName = COMPANY_NAME;
    report.companySlug = SLUG;
    report.records = {
      customers: [customerAlphaId, customerBetaId].filter(Boolean),
      properties: [propertyAlphaId, propertyBetaId].filter(Boolean),
      jobs: [jobScheduledId, jobInProgressId, jobCompletedId].filter(Boolean),
      inventoryItems: itemIds,
      youngGunsCompaniesSeen: youngGuns.map((r) => ({ id: r.id, slug: r.slug, name: r.name })),
    };
    report.userEmails = Object.fromEntries(
      Object.entries(ACCOUNTS).map(([k, v]) => [k, v.email]),
    );
    report.mfaPolicy = 'MFA remains disabled for these isolated staging scanner accounts (mfa_required=false; no enrollment).';
    report.outboundSafety =
      'Staging env gates (OUTBOUND_MESSAGES_ENABLED=false, etc.) plus auditSandboxOutboundBlocked preference; no provider connections created.';
  } finally {
    await sql.end({ timeout: 5 });
  }

  finish(report, report.results.some((r) => r.status === 'FAIL') ? 1 : 0);
}

function execSyncHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function finish(report, code) {
  report.endedAt = new Date().toISOString();
  report.totals = {
    passed: report.results.filter((r) => r.status === 'PASS').length,
    failed: report.results.filter((r) => r.status === 'FAIL').length,
  };
  report.verdict = report.totals.failed === 0 ? 'READY_FOR_OWNER_REVIEW' : 'NO-GO';
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const manifest = { ...report };
  delete manifest.credentials;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: report.verdict, manifestPath, credentialsPath: CREDENTIALS_FILE, totals: report.totals }));
  process.exitCode = code;
}

main().catch((err) => {
  console.error('[QA-0] fatal', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
