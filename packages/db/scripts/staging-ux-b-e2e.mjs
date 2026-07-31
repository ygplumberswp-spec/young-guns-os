/**
 * Isolated staging UX-B execution harness (migration 0096: crew / vehicle / variations /
 * material lines / documentation / completion gate) covering technician workflow and
 * office-side crew + variation authorization.
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Never prints DATABASE_URL / hostnames / credentials
 * - Does not read or modify apps/api/.env
 * - Labels all temp records with STAGING-UX-B-0096
 * - Cleans up only labelled companies (cascade delete)
 *
 * Usage:
 *   node packages/db/scripts/staging-ux-b-e2e.mjs
 *   STAGING_API_BASE=http://127.0.0.1:3100 node packages/db/scripts/staging-ux-b-e2e.mjs
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
const outPath = path.resolve(repoRoot, 'diagnostic-output/33-staging-ux-b-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-UX-B-0096';
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

/** Invite + accept a Technician-role staff user. Returns { userId, token } or null on failure. */
async function inviteTechnician(results, ownerToken, techRoleId, email, firstName, lastName, password) {
  const invite = await api('/api/v1/team/invites', {
    method: 'POST',
    token: ownerToken,
    body: { email, roleId: techRoleId },
  });
  const inviteUrl = invite.json?.data?.inviteUrl;
  const tokenMatch = typeof inviteUrl === 'string' ? inviteUrl.match(/token=([^&]+)/) : null;
  if (invite.status !== 201 || !tokenMatch) {
    fail(results, `technician_invite_${firstName}`, JSON.stringify(invite.json?.error || invite.status));
    return null;
  }
  const accept = await api('/api/v1/auth/accept-invite', {
    method: 'POST',
    body: { token: tokenMatch[1], firstName, lastName, password },
  });
  const accessToken = accept.json?.data?.session?.accessToken;
  const userId = accept.json?.data?.user?.id;
  if (accept.status !== 201 || !accessToken || !userId) {
    fail(results, `technician_invite_accept_${firstName}`, JSON.stringify(accept.json?.error || accept.status));
    return null;
  }
  pass(results, `technician_invite_accept_${firstName}`, userId);
  return { userId, token: accessToken };
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
  const suffix = randomBytes(3).toString('hex');
  const ownerEmail = `owner.${suffix}@staging-ux-b.test`;
  const password = 'StagingUxB1!';
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
      const jwt = `staging-ux-b-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-ux-b-refresh-${randomBytes(24).toString('hex')}`;
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
        JOB_EVIDENCE_STORAGE_PATH: path.join(repoRoot, 'diagnostic-output', 'job-evidence-ux-b'),
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

    // --- 1. Owner signup + create customer/property/job ---
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

    const job = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        propertyId,
        jobType: 'Leak detection',
        description: `${LABEL} crew execution job`,
        priority: 'high',
        preferredAppointmentAt: new Date(Date.now() + 86400000).toISOString(),
        siteContact: {
          name: 'Site Alpha',
          mobile: '0821230001',
          email: 'noreply@youngguns.co.za',
        },
        accessInstructions: `${LABEL} gate code 1234`,
      },
    });
    const jobId = job.json?.data?.job?.id;
    if (job.status === 201 && jobId) {
      pass(report.results, 'create_job', job.json.data.job.jobNumber);
    } else {
      fail(report.results, 'create_job', JSON.stringify(job.json?.error || job.status));
      throw new Error('job creation failed');
    }

    // Canonical Technician role id (needed for invites)
    const rolesRes = await api('/api/v1/team/roles', { token: ownerToken });
    const techRole = (rolesRes.json?.data?.roles || []).find((r) => r.name === 'Technician');
    if (!techRole?.id) {
      fail(report.results, 'technician_role_lookup', JSON.stringify(rolesRes.json?.error || rolesRes.status));
      throw new Error('Technician role missing');
    }
    pass(report.results, 'technician_role_lookup', techRole.id);

    // --- 2. Create 3 crew technicians + 1 unassigned technician via team invite/accept ---
    const techA = await inviteTechnician(
      report.results,
      ownerToken,
      techRole.id,
      `tech-a.${suffix}@staging-ux-b.test`,
      'TechA',
      'Crew',
      password,
    );
    const techB = await inviteTechnician(
      report.results,
      ownerToken,
      techRole.id,
      `tech-b.${suffix}@staging-ux-b.test`,
      'TechB',
      'Crew',
      password,
    );
    const techC = await inviteTechnician(
      report.results,
      ownerToken,
      techRole.id,
      `tech-c.${suffix}@staging-ux-b.test`,
      'TechC',
      'Crew',
      password,
    );
    const techD = await inviteTechnician(
      report.results,
      ownerToken,
      techRole.id,
      `tech-d.${suffix}@staging-ux-b.test`,
      'TechD',
      'Unassigned',
      password,
    );
    if (!techA || !techB || !techC || !techD) {
      throw new Error('technician provisioning incomplete');
    }

    // --- 3. Create a vehicle via fleet API ---
    const vehicle = await api('/api/v1/fleet/vehicles', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Van ${suffix}`,
        make: 'Toyota',
        model: 'Hiace',
        year: 2022,
        licensePlate: `UXB${suffix}`.toUpperCase(),
        status: 'available',
        notes: LABEL,
      },
    });
    const vehicleId = vehicle.json?.data?.vehicle?.id;
    if (vehicle.status === 201 && vehicleId) {
      pass(report.results, 'create_vehicle_fleet_api', vehicleId);
    } else {
      fail(report.results, 'create_vehicle_fleet_api', JSON.stringify(vehicle.json?.error || vehicle.status));
      throw new Error('vehicle creation failed');
    }

    // --- 4. PUT /api/v1/jobs/:id/crew with 3 members + vehicleId + primaryUserId ---
    const crewAssign = await api(`/api/v1/jobs/${jobId}/crew`, {
      method: 'PUT',
      token: ownerToken,
      body: {
        members: [
          { userId: techA.userId, crewRole: 'crew_leader', isPrimary: true },
          { userId: techB.userId, crewRole: 'qualified' },
          { userId: techC.userId, crewRole: 'assistant' },
        ],
        vehicleId,
        primaryUserId: techA.userId,
      },
    });
    const crewList = crewAssign.json?.data?.crew || [];
    if (
      crewAssign.status === 200 &&
      crewList.length === 3 &&
      crewAssign.json?.data?.vehicle?.vehicleId === vehicleId
    ) {
      pass(report.results, 'assign_crew', `members=${crewList.length}`);
    } else {
      fail(report.results, 'assign_crew', JSON.stringify(crewAssign.json?.error || crewAssign.status));
    }

    // --- 6. Unassigned technician (techD) denied on workspace + transition ---
    const unassignedWorkspace = await api(`/api/v1/mobile/technician/workforce/jobs/${jobId}`, {
      token: techD.token,
    });
    if (unassignedWorkspace.status === 403) {
      pass(report.results, 'unassigned_tech_workspace_denied');
    } else {
      fail(report.results, 'unassigned_tech_workspace_denied', unassignedWorkspace.status);
    }

    const unassignedTransition = await api(`/api/v1/mobile/technician/jobs/${jobId}/transition`, {
      method: 'POST',
      token: techD.token,
      body: { action: 'accept' },
    });
    if (unassignedTransition.status === 403) {
      pass(report.results, 'unassigned_tech_transition_denied');
    } else {
      fail(report.results, 'unassigned_tech_transition_denied', unassignedTransition.status);
    }

    // --- 5. Assigned tech (techA) transitions accept -> en_route -> arrive -> start_work ---
    const acceptActionId = `ux-b-accept-${suffix}`;
    const t1 = await api(`/api/v1/mobile/technician/jobs/${jobId}/transition`, {
      method: 'POST',
      token: techA.token,
      body: { action: 'accept', clientActionId: acceptActionId },
    });
    if (t1.status === 200 && t1.json?.data?.job?.executionPhase === 'accepted') {
      pass(report.results, 'assigned_tech_transition_accept');
    } else {
      fail(report.results, 'assigned_tech_transition_accept', JSON.stringify(t1.json?.error || t1.status));
    }

    const t2 = await api(`/api/v1/mobile/technician/jobs/${jobId}/transition`, {
      method: 'POST',
      token: techA.token,
      body: { action: 'en_route' },
    });
    if (t2.status === 200 && t2.json?.data?.job?.executionPhase === 'en_route') {
      pass(report.results, 'assigned_tech_transition_en_route');
    } else {
      fail(report.results, 'assigned_tech_transition_en_route', JSON.stringify(t2.json?.error || t2.status));
    }

    const t3 = await api(`/api/v1/mobile/technician/jobs/${jobId}/transition`, {
      method: 'POST',
      token: techA.token,
      body: { action: 'arrive' },
    });
    if (t3.status === 200 && t3.json?.data?.job?.executionPhase === 'on_site') {
      pass(report.results, 'assigned_tech_transition_arrive');
    } else {
      fail(report.results, 'assigned_tech_transition_arrive', JSON.stringify(t3.json?.error || t3.status));
    }

    const t4 = await api(`/api/v1/mobile/technician/jobs/${jobId}/transition`, {
      method: 'POST',
      token: techA.token,
      body: { action: 'start_work' },
    });
    if (t4.status === 200 && t4.json?.data?.job?.executionPhase === 'in_progress') {
      pass(report.results, 'assigned_tech_transition_start_work');
    } else {
      fail(report.results, 'assigned_tech_transition_start_work', JSON.stringify(t4.json?.error || t4.status));
    }

    // --- 12. Completion gate blocks incomplete job (before labour/materials/photos) ---
    const gatedPayloadBase = {
      workPerformedSummary: `${LABEL} inspected and repaired leaking joint`,
      checklist: {
        ppe_confirmed: true,
        site_safe_to_work: true,
        customer_briefed: true,
        work_area_cleaned: true,
      },
      siteCondition: 'Dry, accessible, no hazards',
      customerRepName: 'Jane Customer',
      signatureUnavailableReason: 'Customer unavailable to sign - remote job',
      cocRequired: 'not_required',
      technicianDeclaration: true,
      safetyNotes: LABEL,
    };
    const earlyComplete = await api(`/api/v1/mobile/technician/jobs/${jobId}/complete-gated`, {
      method: 'POST',
      token: techA.token,
      body: gatedPayloadBase,
    });
    if (earlyComplete.status === 400 && earlyComplete.json?.error?.code === 'COMPLETION_GATE_FAILED') {
      pass(report.results, 'completion_gate_blocks_incomplete', earlyComplete.json.error.message);
    } else {
      fail(report.results, 'completion_gate_blocks_incomplete', JSON.stringify(earlyComplete.json || earlyComplete.status));
    }

    // --- 11. Invalid pause without reason blocked ---
    const badPause = await api(`/api/v1/mobile/technician/jobs/${jobId}/transition`, {
      method: 'POST',
      token: techA.token,
      body: { action: 'pause' },
    });
    if (badPause.status === 400 && /reason/i.test(badPause.json?.error?.message || '')) {
      pass(report.results, 'pause_without_reason_blocked');
    } else {
      fail(report.results, 'pause_without_reason_blocked', JSON.stringify(badPause.json || badPause.status));
    }

    // --- 11. Duplicate clientActionId does not double-transition ---
    const dupAccept = await api(`/api/v1/mobile/technician/jobs/${jobId}/transition`, {
      method: 'POST',
      token: techA.token,
      body: { action: 'accept', clientActionId: acceptActionId },
    });
    if (dupAccept.status === 200 && dupAccept.json?.data?.job?.executionPhase === 'in_progress') {
      pass(report.results, 'duplicate_client_action_id_no_double_transition');
    } else {
      fail(
        report.results,
        'duplicate_client_action_id_no_double_transition',
        JSON.stringify(dupAccept.json || dupAccept.status),
      );
    }

    // --- 7. Individual labour: createMobile time entries for two crew members ---
    const timeA = await api('/api/v1/mobile/technician/workforce/time', {
      method: 'POST',
      token: techA.token,
      body: { entryType: 'job_time', jobId, durationMinutes: 45, notes: LABEL },
    });
    if (timeA.status === 201 && timeA.json?.data?.entry?.id) {
      pass(report.results, 'labour_time_entry_tech_a');
    } else {
      fail(report.results, 'labour_time_entry_tech_a', JSON.stringify(timeA.json?.error || timeA.status));
    }

    const timeB = await api('/api/v1/mobile/technician/workforce/time', {
      method: 'POST',
      token: techB.token,
      body: { entryType: 'job_time', jobId, durationMinutes: 30, notes: LABEL },
    });
    if (timeB.status === 201 && timeB.json?.data?.entry?.id) {
      pass(report.results, 'labour_time_entry_tech_b');
    } else {
      fail(report.results, 'labour_time_entry_tech_b', JSON.stringify(timeB.json?.error || timeB.status));
    }

    // --- 8. Materials: POST material-lines ---
    const materialLine = await api(`/api/v1/mobile/technician/jobs/${jobId}/material-lines`, {
      method: 'POST',
      token: techA.token,
      body: {
        description: `${LABEL} Copper pipe 15mm`,
        quantity: 2,
        unit: 'm',
        materialSource: 'vehicle_stock',
        notes: LABEL,
      },
    });
    if (materialLine.status === 201 && materialLine.json?.data?.materialLine?.id) {
      pass(report.results, 'materials_material_line');
    } else {
      fail(report.results, 'materials_material_line', JSON.stringify(materialLine.json?.error || materialLine.status));
    }

    // --- 9. Photos: binary upload before/after (UX-B closure — storage_key required for gate) ---
    const TINY_PNG_B64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const beforePhoto = await api(`/api/v1/mobile/technician/workforce/jobs/${jobId}/documentation/upload`, {
      method: 'POST',
      token: techA.token,
      body: {
        documentationType: 'photo',
        title: `${LABEL} Before photo`,
        mimeType: 'image/png',
        dataBase64: TINY_PNG_B64,
        fileName: 'before.png',
        evidencePhase: 'before',
        metadata: { phase: 'before' },
        clientActionId: `ux-b-before-${suffix}`,
      },
    });
    if (beforePhoto.status === 201 && beforePhoto.json?.data?.documentation?.hasBinary) {
      pass(report.results, 'photo_documentation_before');
    } else {
      fail(report.results, 'photo_documentation_before', JSON.stringify(beforePhoto.json?.error || beforePhoto.status));
    }

    const afterPhoto = await api(`/api/v1/mobile/technician/workforce/jobs/${jobId}/documentation/upload`, {
      method: 'POST',
      token: techA.token,
      body: {
        documentationType: 'photo',
        title: `${LABEL} After photo`,
        mimeType: 'image/png',
        dataBase64: TINY_PNG_B64,
        fileName: 'after.png',
        evidencePhase: 'after',
        metadata: { phase: 'after' },
        clientActionId: `ux-b-after-${suffix}`,
      },
    });
    if (afterPhoto.status === 201 && afterPhoto.json?.data?.documentation?.hasBinary) {
      pass(report.results, 'photo_documentation_after');
    } else {
      fail(report.results, 'photo_documentation_after', JSON.stringify(afterPhoto.json?.error || afterPhoto.status));
    }

    // --- 10. Variation: create pending ---
    const variation = await api(`/api/v1/mobile/technician/jobs/${jobId}/variations`, {
      method: 'POST',
      token: techA.token,
      body: {
        title: `${LABEL} Extra pipe run required`,
        siteCondition: 'Corroded pipe found behind wall',
        explanation: 'Additional 3m copper pipe needed to reroute around corrosion',
        labourEffect: '+1 hour',
        materialEffect: '+3m copper pipe',
      },
    });
    const variationId = variation.json?.data?.variation?.id;
    if (variation.status === 201 && variationId && variation.json.data.variation.status === 'pending') {
      pass(report.results, 'variation_create_pending', variationId);
    } else {
      fail(report.results, 'variation_create_pending', JSON.stringify(variation.json?.error || variation.status));
      throw new Error('variation creation failed');
    }

    // --- 10. Completion blocked while variation pending (everything else now satisfied) ---
    const blockedByVariation = await api(`/api/v1/mobile/technician/jobs/${jobId}/complete-gated`, {
      method: 'POST',
      token: techA.token,
      body: gatedPayloadBase,
    });
    if (
      blockedByVariation.status === 400 &&
      blockedByVariation.json?.error?.code === 'COMPLETION_GATE_FAILED' &&
      /pending_variations/.test(blockedByVariation.json?.error?.message || '')
    ) {
      pass(report.results, 'completion_blocked_while_variation_pending');
    } else {
      fail(
        report.results,
        'completion_blocked_while_variation_pending',
        JSON.stringify(blockedByVariation.json || blockedByVariation.status),
      );
    }

    // --- 13. Owner GET /jobs/:id/execution sees crew/phase/variations ---
    const execSummary = await api(`/api/v1/jobs/${jobId}/execution`, { token: ownerToken });
    const summary = execSummary.json?.data?.summary;
    if (
      execSummary.status === 200 &&
      summary?.crew?.length === 3 &&
      summary?.vehicle?.vehicleId === vehicleId &&
      summary?.executionPhase === 'in_progress' &&
      summary?.pendingVariations?.length === 1
    ) {
      pass(report.results, 'owner_execution_summary_crew_phase_variations');
    } else {
      fail(
        report.results,
        'owner_execution_summary_crew_phase_variations',
        JSON.stringify({ status: execSummary.status, summary }),
      );
    }

    // --- Authorize variation as owner, then continue ---
    const authorize = await api(`/api/v1/jobs/${jobId}/variations/${variationId}/authorize`, {
      method: 'POST',
      token: ownerToken,
      body: { status: 'approved', notes: `${LABEL} approved by owner` },
    });
    if (authorize.status === 200 && authorize.json?.data?.variation?.status === 'approved') {
      pass(report.results, 'variation_authorize_owner');
    } else {
      fail(report.results, 'variation_authorize_owner', JSON.stringify(authorize.json?.error || authorize.status));
    }

    // --- 12. Completion gate: complete-gated succeeds and creates snapshot ---
    const completeSuccess = await api(`/api/v1/mobile/technician/jobs/${jobId}/complete-gated`, {
      method: 'POST',
      token: techA.token,
      body: gatedPayloadBase,
    });
    if (completeSuccess.status === 200 && completeSuccess.json?.data?.job?.executionPhase === 'completed') {
      const snapshotRows = await sql`
        select count(*)::int as n from job_completion_snapshots where job_id = ${jobId}::uuid
      `;
      if (snapshotRows[0].n >= 1) {
        pass(report.results, 'completion_gated_success_snapshot');
      } else {
        fail(report.results, 'completion_gated_success_snapshot', 'no snapshot row found');
      }
    } else {
      fail(
        report.results,
        'completion_gated_success_snapshot',
        JSON.stringify(completeSuccess.json || completeSuccess.status),
      );
    }

    // --- 14. Technician cannot see finance endpoints ---
    const financeDenied = await api('/api/v1/finance/stats', { token: techA.token });
    if (financeDenied.status === 403) {
      pass(report.results, 'technician_denied_finance');
    } else {
      fail(report.results, 'technician_denied_finance', financeDenied.status);
    }

    // --- 15. Insert minimal legacy job via SQL; GET readable ---
    const legacyIns = await sql`
      insert into jobs (company_id, customer_id, title, description, status)
      values (${companyId}::uuid, ${customerId}::uuid, ${LABEL + ' Legacy Job'}, 'legacy row', 'new')
      returning id
    `;
    const legacyId = legacyIns[0].id;
    const legacyGet = await api(`/api/v1/jobs/${legacyId}`, { token: ownerToken });
    if (legacyGet.status === 200 && legacyGet.json?.data?.job?.id === legacyId) {
      pass(report.results, 'legacy_job_sql_insert_readable');
    } else {
      fail(report.results, 'legacy_job_sql_insert_readable', legacyGet.status);
    }

    // --- Web proxy health smoke (no provider calls) ---
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
    // --- 16. Cleanup only labelled staging temp company (cascade) ---
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
        output: 'diagnostic-output/33-staging-ux-b-e2e.json',
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
