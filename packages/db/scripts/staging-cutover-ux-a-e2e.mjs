/**
 * Isolated staging UX-A + RBAC cutover harness for migrations 0094/0095.
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Never prints DATABASE_URL / hostnames / credentials
 * - Does not read or modify apps/api/.env
 * - Labels all temp records with STAGING-CUTOVER-0094-0095
 *
 * Usage:
 *   node packages/db/scripts/staging-cutover-ux-a-e2e.mjs
 *   STAGING_API_BASE=http://127.0.0.1:3100 node packages/db/scripts/staging-cutover-ux-a-e2e.mjs
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
const outPath = path.resolve(repoRoot, 'diagnostic-output/30-staging-ux-a-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-CUTOVER-0094-0095';
const API_PORT = Number(process.env.STAGING_API_PORT || 3100);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5174);
const API_BASE = process.env.STAGING_API_BASE || `http://127.0.0.1:${API_PORT}`;
const WEB_BASE = process.env.STAGING_WEB_BASE || `http://127.0.0.1:${WEB_PORT}`;
const MANAGE_RUNTIME = process.env.STAGING_MANAGE_RUNTIME !== '0';

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

async function waitFor(url, { timeoutMs = 90_000, expectStatus = 200 } = {}) {
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
    const out = execSync(`lsof -nP -tiTCP:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
    }).trim();
    if (!out) return;
    for (const pid of out.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* nothing listening */
  }
}

function startProcess(command, args, env, cwd) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  const onChunk = (chunk) => {
    buf += chunk.toString();
    if (buf.length > 8000) buf = buf.slice(-4000);
  };
  child.stdout.on('data', onChunk);
  child.stderr.on('data', onChunk);
  child.getSafeTail = () =>
    buf
      .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]')
      .replace(FORBIDDEN, '[FORBIDDEN_REF]')
      .slice(-1500);
  return child;
}

async function api(pathname, { method = 'GET', token, body, cookie } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
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
  return { status: res.status, json, headers: res.headers };
}

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 300) });
}

async function main() {
  const report = {
    label: LABEL,
    startedAt: new Date().toISOString(),
    stagingTarget: {},
    runtime: { apiBase: API_BASE, webBase: WEB_BASE, managed: MANAGE_RUNTIME },
    results: [],
    cleanup: null,
    totals: { passed: 0, failed: 0 },
    verdict: 'NO-GO',
  };

  if (!fs.existsSync(envPath)) {
    report.stagingTarget = { ok: false, reason: 'staging env file missing' };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const env = loadEnv(envPath);
  if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging' || !env.DATABASE_URL) {
    report.stagingTarget = { ok: false, reason: 'staging labels/url missing' };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  if (env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
    report.stagingTarget = { ok: false, reason: 'forbidden live project ref' };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(3);
  }

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  let apiProc = null;
  let webProc = null;
  const suffix = randomBytes(3).toString('hex');
  const ownerEmail = `owner.${suffix}@staging-cutover.test`;
  const techEmail = `tech.${suffix}@staging-cutover.test`;
  const portalEmail = `client.${suffix}@staging-cutover.test`;
  const password = 'StagingCutover1!';
  let companyId = null;

  try {
    const meta = await sql`
      select current_database() as db,
             (select count(*)::int from information_schema.tables
               where table_schema='public' and table_type='BASE TABLE') as public_tables,
             (select count(*)::int from drizzle.__drizzle_migrations) as migrations
    `;
    report.stagingTarget = {
      ok: true,
      matchesForbiddenLiveProjectRef: false,
      currentDatabase: meta[0].db,
      publicBaseTableCount: meta[0].public_tables,
      drizzleMigrationCount: meta[0].migrations,
      appEnv: env.APP_ENV,
      titanEnv: env.TITAN_ENV,
    };

    if (MANAGE_RUNTIME) {
      freePort(API_PORT);
      freePort(WEB_PORT);
      await new Promise((r) => setTimeout(r, 500));
      const jwt = `staging-cutover-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-cutover-refresh-${randomBytes(24).toString('hex')}`;
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
        // Explicitly avoid loading apps/api/.env
        DOTENV_CONFIG_PATH: '',
      };
      apiProc = startProcess(
        'pnpm',
        ['exec', 'tsx', 'src/index.ts'],
        childEnv,
        path.join(repoRoot, 'apps/api'),
      );
      webProc = startProcess(
        'pnpm',
        ['exec', 'vite', '--host', '127.0.0.1', '--port', String(WEB_PORT)],
        {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          VITE_DEV_PORT: String(WEB_PORT),
          VITE_API_PROXY_TARGET: API_BASE,
        },
        path.join(repoRoot, 'apps/web'),
      );
      await waitFor(`${API_BASE}/api/v1/health/ready`);
      await waitFor(WEB_BASE, { expectStatus: 200 });
      if (apiProc.exitCode != null) {
        throw new Error(`staging API exited early: ${apiProc.getSafeTail()}`);
      }
      pass(report.results, 'isolated_runtime_started', `api:${API_PORT} web:${WEB_PORT}`);
    } else {
      await waitFor(`${API_BASE}/api/v1/health/ready`);
      pass(report.results, 'external_runtime_ready', API_BASE);
    }

    // --- Company Owner signup ---
    const signup = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Co ${suffix}`,
        email: ownerEmail,
        password,
        firstName: 'Staging',
        lastName: 'Owner',
      },
    });
    if (signup.status !== 201 || !signup.json?.data?.session?.accessToken) {
      fail(report.results, 'owner_signup', JSON.stringify(signup.json?.error || signup.status));
      throw new Error('signup failed');
    }
    const ownerToken = signup.json.data.session.accessToken;
    companyId = signup.json.data.user.companyId;
    const ownerRole = signup.json.data.user.roleName;
    if (ownerRole === 'Company Owner' || ownerRole === 'Owner') {
      pass(report.results, 'owner_signup_role', ownerRole);
    } else {
      fail(report.results, 'owner_signup_role', ownerRole);
    }

    // Canonical roles present
    const rolesRes = await api('/api/v1/team/roles', { token: ownerToken });
    const roleNames = (rolesRes.json?.data?.roles || []).map((r) => r.name).sort();
    const requiredRoles = [
      'Company Owner',
      'Technician',
      'Manager',
      'Dispatcher',
      'Accountant',
    ];
    const missing = requiredRoles.filter((r) => !roleNames.includes(r));
    if (missing.length === 0) pass(report.results, 'canonical_roles_seeded', roleNames.join(','));
    else fail(report.results, 'canonical_roles_seeded', `missing:${missing.join(',')}`);

    const techRole = (rolesRes.json?.data?.roles || []).find((r) => r.name === 'Technician');
    const assignable = rolesRes.json?.data?.manuallyAssignableRoles || [];
    const clientAssignable = assignable.some((r) => r.name === 'Client');
    if (!clientAssignable) pass(report.results, 'client_not_staff_assignable');
    else fail(report.results, 'client_not_staff_assignable', 'Client appeared in assignable roles');

    // Customer + existing property
    const cust = await api('/api/v1/crm/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Customer Alpha`,
        email: `alpha.${suffix}@example.com`,
        phone: '+27821230001',
        status: 'active',
        notes: LABEL,
      },
    });
    const customerId = cust.json?.data?.customer?.id;
    if (cust.status === 201 && customerId) pass(report.results, 'create_customer');
    else fail(report.results, 'create_customer', cust.status);

    const prop = await api(`/api/v1/crm/customers/${customerId}/properties`, {
      method: 'POST',
      token: ownerToken,
      body: {
        propertyName: `${LABEL} Property Main`,
        street: '12 Main Rd',
        suburb: 'Observatory',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '7925',
        unit: 'A1',
        isPrimary: true,
      },
    });
    const propertyId = prop.json?.data?.property?.id;
    if (prop.status === 201 && propertyId) pass(report.results, 'create_property');
    else fail(report.results, 'create_property', prop.status);

    // Job: existing customer + existing property
    const job1 = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        propertyId,
        jobType: 'Leak detection',
        description: `${LABEL} existing property job`,
        priority: 'high',
        preferredAppointmentAt: new Date(Date.now() + 86400000).toISOString(),
        siteContact: {
          name: 'Site Alpha',
          mobile: '0821230001',
          email: 'noreply@youngguns.co.za',
        },
        accessInstructions: 'Gate code 1234',
      },
    });
    const job1Body = job1.json?.data?.job;
    if (
      job1.status === 201 &&
      job1Body?.jobNumber?.startsWith('JOB-') &&
      job1Body?.title?.includes('Leak detection') &&
      job1Body?.siteContact?.emailIsPlaceholder === true
    ) {
      pass(
        report.results,
        'job_existing_property_auto_title_placeholder',
        `${job1Body.jobNumber} | ${job1Body.title}`,
      );
    } else {
      fail(
        report.results,
        'job_existing_property_auto_title_placeholder',
        JSON.stringify(job1.json?.error || { status: job1.status, title: job1Body?.title }),
      );
    }

    // Snapshot immutability: mutate customer, job snapshot stays
    await api(`/api/v1/crm/customers/${customerId}`, {
      method: 'PATCH',
      token: ownerToken,
      body: { name: `${LABEL} Customer Alpha RENAMED`, phone: '+27829999999' },
    });
    const job1Again = await api(`/api/v1/jobs/${job1Body.id}`, { token: ownerToken });
    const snapName = job1Again.json?.data?.job?.siteContact?.name;
    const snapCust = job1Again.json?.data?.job?.customerName;
    const snapMobile = job1Again.json?.data?.job?.siteContact?.mobile;
    if (
      snapName === 'Site Alpha' &&
      String(snapCust).includes('Alpha') &&
      !String(snapCust).includes('RENAMED') &&
      String(snapMobile).includes('821230001')
    ) {
      pass(report.results, 'immutable_snapshots');
    } else {
      fail(
        report.results,
        'immutable_snapshots',
        JSON.stringify({ snapName, snapCust, snapMobile }),
      );
    }

    // Explicit verified customer update only
    const beforePhone = (
      await api(`/api/v1/crm/customers/${customerId}`, { token: ownerToken })
    ).json?.data?.customer?.phone;
    const jobNoUpdate = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        propertyId,
        jobType: 'Inspection',
        description: `${LABEL} no verified update`,
        siteContact: {
          name: 'No Update Contact',
          mobile: '0821230002',
          email: 'real.contact@example.com',
        },
        updateVerifiedCustomerDetails: false,
      },
    });
    const afterNo = (
      await api(`/api/v1/crm/customers/${customerId}`, { token: ownerToken })
    ).json?.data?.customer?.phone;
    if (jobNoUpdate.status === 201 && afterNo === beforePhone) {
      pass(report.results, 'verified_update_off_no_customer_change');
    } else {
      fail(report.results, 'verified_update_off_no_customer_change', `${beforePhone}->${afterNo}`);
    }

    const jobYesUpdate = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        propertyId,
        jobType: 'Inspection',
        description: `${LABEL} verified update`,
        siteContact: {
          name: 'Verified Contact',
          mobile: '0821230003',
          email: 'verified.contact@example.com',
        },
        updateVerifiedCustomerDetails: true,
        updateVerifiedPropertyDetails: true,
        address: {
          street: '99 Verified St',
          suburb: 'Rondebosch',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7700',
          unit: 'B2',
        },
      },
    });
    const afterYes = (
      await api(`/api/v1/crm/customers/${customerId}`, { token: ownerToken })
    ).json?.data?.customer;
    const propAfter = (
      await api(`/api/v1/crm/customers/${customerId}/properties`, { token: ownerToken })
    ).json?.data?.properties?.find((p) => p.id === propertyId);
    if (
      jobYesUpdate.status === 201 &&
      String(afterYes?.phone).includes('821230003') &&
      propAfter?.street === '99 Verified St'
    ) {
      pass(report.results, 'verified_update_on_customer_and_property');
    } else {
      fail(
        report.results,
        'verified_update_on_customer_and_property',
        JSON.stringify({
          status: jobYesUpdate.status,
          phone: afterYes?.phone,
          street: propAfter?.street,
        }),
      );
    }

    // New property job
    const jobNewProp = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        jobType: 'Blocked drain',
        description: `${LABEL} new property job`,
        newProperty: {
          propertyName: `${LABEL} New Site`,
          street: '5 New Site Ave',
          suburb: 'Claremont',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7708',
        },
        siteContact: {
          name: 'New Site Contact',
          mobile: '0821230004',
          email: 'newsite@example.com',
        },
        preferredAppointmentAt: new Date(Date.now() + 172800000).toISOString(),
      },
    });
    if (jobNewProp.status === 201 && jobNewProp.json?.data?.job?.propertyId) {
      pass(
        report.results,
        'job_new_property',
        jobNewProp.json.data.job.jobNumber,
      );
    } else {
      fail(report.results, 'job_new_property', JSON.stringify(jobNewProp.json?.error || jobNewProp.status));
    }

    // SA mobile validation
    const badMobile = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        propertyId,
        jobType: 'Callout',
        description: `${LABEL} bad mobile`,
        siteContact: { name: 'Bad', mobile: '12345', email: 'bad@example.com' },
      },
    });
    if (badMobile.status === 400) pass(report.results, 'sa_mobile_validation_rejects');
    else fail(report.results, 'sa_mobile_validation_rejects', badMobile.status);

    const badEmail = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        propertyId,
        jobType: 'Callout',
        description: `${LABEL} bad email`,
        siteContact: { name: 'Bad', mobile: '0821230005', email: 'not-an-email' },
      },
    });
    if (badEmail.status === 400) pass(report.results, 'email_validation_rejects');
    else fail(report.results, 'email_validation_rejects', badEmail.status);

    // Invite technician + assign
    if (!techRole?.id) {
      fail(report.results, 'technician_invite', 'Technician role missing');
    } else {
      const invite = await api('/api/v1/team/invites', {
        method: 'POST',
        token: ownerToken,
        body: { email: techEmail, roleId: techRole.id },
      });
      const inviteUrl = invite.json?.data?.inviteUrl || '';
      const tokenMatch = inviteUrl.match(/token=([^&]+)/);
      if (invite.status === 201 && tokenMatch) {
        const accept = await api('/api/v1/auth/accept-invite', {
          method: 'POST',
          body: {
            token: tokenMatch[1],
            firstName: 'Staging',
            lastName: 'Tech',
            password,
          },
        });
        const techToken = accept.json?.data?.session?.accessToken;
        const techUserId = accept.json?.data?.user?.id;
        if (accept.status === 201 && techToken) {
          pass(report.results, 'technician_invite_accept');

          // Owner module denied
          const denied = await api('/api/v1/jobs', { token: techToken });
          if (denied.status === 403) pass(report.results, 'technician_denied_owner_jobs');
          else fail(report.results, 'technician_denied_owner_jobs', denied.status);

          // Assign job1 to tech
          const assigned = await api(`/api/v1/jobs/${job1Body.id}`, {
            method: 'PATCH',
            token: ownerToken,
            body: { assignedUserId: techUserId },
          });
          if (assigned.status === 200 && assigned.json?.data?.job?.assignedUserId === techUserId) {
            pass(report.results, 'appointment_and_technician_assignment', job1Body.jobNumber);
          } else {
            fail(
              report.results,
              'appointment_and_technician_assignment',
              JSON.stringify(assigned.json?.error || assigned.status),
            );
          }

          // Tech can see assigned via mobile technician surface
          const techJobs = await api('/api/v1/mobile/technician/jobs', { token: techToken });
          const listed = techJobs.json?.data?.jobs || [];
          const seesAssigned = listed.some((j) => j.id === job1Body.id);
          if (techJobs.status === 200 && seesAssigned) {
            pass(report.results, 'technician_sees_assigned_only_positive');
          } else {
            fail(
              report.results,
              'technician_sees_assigned_only_positive',
              `status=${techJobs.status} count=${listed.length}`,
            );
          }

          // Tech cannot open unassigned job workspace (if another job id)
          const otherId = jobNewProp.json?.data?.job?.id;
          if (otherId) {
            const unassigned = await api(
              `/api/v1/mobile/technician/workforce/jobs/${otherId}`,
              { token: techToken },
            );
            if (unassigned.status === 403 || unassigned.status === 404) {
              pass(
                report.results,
                'technician_blocked_unassigned_job_detail',
                String(unassigned.status),
              );
            } else {
              fail(report.results, 'technician_blocked_unassigned_job_detail', unassigned.status);
            }
          }
        } else {
          fail(report.results, 'technician_invite_accept', accept.status);
        }
      } else {
        fail(report.results, 'technician_invite', invite.status);
      }
    }

    // List / search (local SA format + E.164 both required for mobile)
    const listAll = await api('/api/v1/jobs', { token: ownerToken });
    const jobs = listAll.json?.data?.jobs || [];
    const job1Mobile = job1Body?.siteContact?.mobile || job1Body?.siteContactMobile || '';
    const byNumber = await api(`/api/v1/jobs?q=${encodeURIComponent(job1Body.jobNumber)}`, {
      token: ownerToken,
    });
    const byCustomer = await api(`/api/v1/jobs?q=${encodeURIComponent('Alpha')}`, {
      token: ownerToken,
    });
    const byAddress = await api(`/api/v1/jobs?q=${encodeURIComponent('Claremont')}`, {
      token: ownerToken,
    });
    const byMobileLocal = await api(`/api/v1/jobs?q=${encodeURIComponent('0821230001')}`, {
      token: ownerToken,
    });
    const byMobileE164 = await api(
      `/api/v1/jobs?q=${encodeURIComponent(job1Mobile || '+27821230001')}`,
      { token: ownerToken },
    );
    const mobileLocalHits = (byMobileLocal.json?.data?.jobs || []).length;
    const mobileE164Hits = (byMobileE164.json?.data?.jobs || []).length;
    if (
      listAll.status === 200 &&
      jobs.length >= 3 &&
      (byNumber.json?.data?.jobs || []).some((j) => j.id === job1Body.id) &&
      (byCustomer.json?.data?.jobs || []).length >= 1 &&
      (byAddress.json?.data?.jobs || []).length >= 1 &&
      mobileLocalHits >= 1 &&
      mobileE164Hits >= 1
    ) {
      pass(
        report.results,
        'list_detail_search',
        `jobs=${jobs.length}; mobileStored=${job1Mobile}; local=${mobileLocalHits}; e164=${mobileE164Hits}`,
      );
    } else {
      fail(
        report.results,
        'list_detail_search',
        JSON.stringify({
          total: jobs.length,
          job1Mobile,
          byNumber: (byNumber.json?.data?.jobs || []).length,
          byCustomer: (byCustomer.json?.data?.jobs || []).length,
          byAddress: (byAddress.json?.data?.jobs || []).length,
          mobileLocalHits,
          mobileE164Hits,
          listStatus: listAll.status,
          mobileLocalStatus: byMobileLocal.status,
        }),
      );
    }

    // Concurrent unique job numbers
    const concurrentPayloads = Array.from({ length: 5 }, (_, i) => ({
      customerId,
      propertyId,
      jobType: 'Concurrent',
      description: `${LABEL} concurrent ${i}`,
      siteContact: {
        name: `Concurrent ${i}`,
        mobile: `08212301${String(i).padStart(2, '0')}`,
        email: `concurrent${i}.${suffix}@example.com`,
      },
    }));
    const concurrent = await Promise.all(
      concurrentPayloads.map((body) =>
        api('/api/v1/jobs', { method: 'POST', token: ownerToken, body }),
      ),
    );
    const numbers = concurrent
      .filter((r) => r.status === 201)
      .map((r) => r.json.data.job.jobNumber);
    const unique = new Set(numbers);
    if (numbers.length === 5 && unique.size === 5) {
      pass(report.results, 'concurrent_unique_job_numbers', numbers.join(','));
    } else {
      fail(
        report.results,
        'concurrent_unique_job_numbers',
        `created=${numbers.length} unique=${unique.size}`,
      );
    }

    // Client / portal scope
    const portalCreate = await api('/api/v1/portal/users', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        email: portalEmail,
        password,
        firstName: 'Portal',
        lastName: 'Client',
      },
    });
    if (portalCreate.status === 201) {
      pass(report.results, 'portal_client_user_created');
      const portalLogin = await api('/api/v1/portal/auth/login', {
        method: 'POST',
        body: { email: portalEmail, password },
      });
      const portalToken = portalLogin.json?.data?.session?.accessToken;
      if (portalLogin.status === 200 && portalToken) {
        const portalJobs = await api('/api/v1/portal/jobs', { token: portalToken });
        const staffDenied = await api('/api/v1/jobs', { token: portalToken });
        if (portalJobs.status === 200 && staffDenied.status === 401) {
          pass(
            report.results,
            'client_portal_scope',
            `portalJobs=${(portalJobs.json?.data || []).length ?? 'ok'}; staffDenied=${staffDenied.status}`,
          );
        } else if (portalJobs.status === 200 && (staffDenied.status === 401 || staffDenied.status === 403)) {
          pass(report.results, 'client_portal_scope', `staffDenied=${staffDenied.status}`);
        } else {
          fail(
            report.results,
            'client_portal_scope',
            `portal=${portalJobs.status} staff=${staffDenied.status}`,
          );
        }
      } else {
        fail(report.results, 'client_portal_scope', `login=${portalLogin.status}`);
      }
    } else {
      fail(report.results, 'portal_client_user_created', portalCreate.status);
    }

    // Legacy minimal job compatibility (null job_number / snapshots)
    const legacyIns = await sql`
      insert into jobs (company_id, customer_id, title, description, status)
      values (${companyId}::uuid, ${customerId}::uuid, ${LABEL + ' Legacy Job'}, 'legacy row', 'new')
      returning id
    `;
    const legacyId = legacyIns[0].id;
    const legacyGet = await api(`/api/v1/jobs/${legacyId}`, { token: ownerToken });
    if (legacyGet.status === 200 && legacyGet.json?.data?.job?.id === legacyId) {
      pass(report.results, 'legacy_job_compatibility');
    } else {
      fail(report.results, 'legacy_job_compatibility', legacyGet.status);
    }

    // Web proxy smoke (no provider calls)
    try {
      const webRes = await fetch(WEB_BASE, { signal: AbortSignal.timeout(5000) });
      const proxied = await fetch(`${WEB_BASE}/api/v1/health/ready`, {
        signal: AbortSignal.timeout(5000),
      });
      if (webRes.status === 200 && proxied.status === 200) {
        pass(report.results, 'staging_web_proxy_health');
      } else {
        fail(report.results, 'staging_web_proxy_health', `${webRes.status}/${proxied.status}`);
      }
    } catch (e) {
      fail(report.results, 'staging_web_proxy_health', redactError(e));
    }
  } catch (e) {
    fail(report.results, 'harness_error', redactError(e));
  } finally {
    // Cleanup only labelled staging temp company (cascade)
    try {
      if (companyId) {
        const deleted = await sql`
          delete from companies
          where id = ${companyId}::uuid
            and name like ${LABEL + '%'}
          returning id
        `;
        // Also remove any stray labelled companies from failed partial runs
        const deletedExtra = await sql`
          delete from companies
          where name like ${LABEL + '%'}
          returning id
        `;
        const jobOrphans = await sql`
          select count(*)::int as n from jobs j
          join customers c on c.id = j.customer_id
          where c.notes = ${LABEL} or c.name like ${LABEL + '%'}
        `;
        report.cleanup = {
          deletedCompanyIds: deleted.length + deletedExtra.length,
          remainingLabelledJobRows: jobOrphans[0].n,
          strategy: 'delete companies where name like LABEL% (cascade)',
        };
        if (report.cleanup.remainingLabelledJobRows === 0) {
          pass(report.results, 'cleanup_temp_records');
        } else {
          fail(
            report.results,
            'cleanup_temp_records',
            `remaining=${report.cleanup.remainingLabelledJobRows}`,
          );
        }
      } else {
        report.cleanup = { deletedCompanyIds: 0, note: 'no company created' };
      }
    } catch (e) {
      report.cleanup = { error: redactError(e) };
      fail(report.results, 'cleanup_temp_records', redactError(e));
    }

    await sql.end({ timeout: 5 }).catch(() => {});
    if (apiProc) {
      apiProc.kill('SIGTERM');
    }
    if (webProc) {
      webProc.kill('SIGTERM');
    }
  }

  report.totals.passed = report.results.filter((r) => r.status === 'PASS').length;
  report.totals.failed = report.results.filter((r) => r.status === 'FAIL').length;
  report.finishedAt = new Date().toISOString();
  report.verdict = report.totals.failed === 0 ? 'GO' : 'NO-GO';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        passed: report.totals.passed,
        failed: report.totals.failed,
        output: 'diagnostic-output/30-staging-ux-a-e2e.json',
        cleanup: report.cleanup,
      },
      null,
      2,
    ),
  );
  process.exit(report.totals.failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ verdict: 'NO-GO', error: redactError(err) }));
  process.exit(1);
});
