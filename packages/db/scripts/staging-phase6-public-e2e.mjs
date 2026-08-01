/**
 * Phase 6 staging E2E — office crew assignment + schedule calendar labels
 *
 * Targets public Railway staging API only (no local postgres required).
 * Refuses production Supabase ref in any configured URL.
 *
 * Usage:
 *   STAGING_API_BASE=https://young-guns-os-staging.up.railway.app \
 *     node packages/db/scripts/staging-phase6-public-e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/141-staging-phase6-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-P6';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(
  /\/$/,
  '',
);

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 500) });
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_ORIGIN}${pathname}`, {
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

async function inviteTechnician(ownerToken, techRoleId, email, firstName, lastName, password) {
  const invite = await api('/api/v1/team/invites', {
    method: 'POST',
    token: ownerToken,
    body: { email, roleId: techRoleId },
  });
  const inviteUrl = invite.json?.data?.inviteUrl;
  const tokenMatch = typeof inviteUrl === 'string' ? inviteUrl.match(/token=([^&]+)/) : null;
  if (invite.status !== 201 || !tokenMatch) {
    return { ok: false, detail: JSON.stringify(invite.json?.error || invite.status) };
  }
  const accept = await api('/api/v1/auth/accept-invite', {
    method: 'POST',
    body: {
      token: decodeURIComponent(tokenMatch[1]),
      firstName,
      lastName,
      password,
    },
  });
  const userId = accept.json?.data?.user?.id;
  const accessToken = accept.json?.data?.session?.accessToken;
  if (accept.status !== 201 || !userId || !accessToken) {
    return { ok: false, detail: JSON.stringify(accept.json?.error || accept.status) };
  }
  return { ok: true, userId, accessToken };
}

async function main() {
  const report = {
    label: LABEL,
    phase: 6,
    startedAt: new Date().toISOString(),
    apiOrigin: API_ORIGIN,
    forbiddenRefChecked: true,
    productionRefTouched: false,
    results: [],
    totals: { passed: 0, failed: 0 },
    verdict: 'NO-GO',
  };

  if (API_ORIGIN.toLowerCase().includes(FORBIDDEN)) {
    fail(report.results, 'target_not_production', 'API origin must not be production');
    report.verdict = 'BLOCKED_PRODUCTION';
    writeReport(report);
    process.exit(3);
  }

  const ready = await api('/api/v1/health/ready');
  if (ready.status !== 200 || ready.json?.data?.database !== 'connected') {
    fail(report.results, 'staging_api_ready', JSON.stringify(ready.json || ready.status));
    writeReport(report);
    process.exit(4);
  }
  pass(report.results, 'staging_api_ready', 'database=connected');

  const suffix = randomBytes(4).toString('hex');
  const password = 'StagingPhase6Pass1!';

  const signup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Crew Co ${suffix}`,
      firstName: 'Dispatch',
      lastName: 'Owner',
      email: `phase6.owner.${suffix}@staging-p6.test`,
      password,
    },
  });
  const ownerToken = signup.json?.data?.session?.accessToken;
  const ownerUserId = signup.json?.data?.user?.id;
  if (signup.status !== 201 || !ownerToken || !ownerUserId) {
    fail(report.results, 'owner_signup', JSON.stringify(signup.json?.error || signup.status));
    writeReport(report);
    process.exit(5);
  }
  pass(report.results, 'owner_signup', ownerUserId);

  const rolesRes = await api('/api/v1/team/roles', { token: ownerToken });
  const techRole = (rolesRes.json?.data?.roles ?? []).find((r) => r.name === 'Technician');
  if (!techRole?.id) {
    fail(report.results, 'technician_role_lookup', JSON.stringify(rolesRes.json?.error || rolesRes.status));
    writeReport(report);
    process.exit(6);
  }
  pass(report.results, 'technician_role_lookup', techRole.id);

  const techA = await inviteTechnician(
    ownerToken,
    techRole.id,
    `phase6.tech.a.${suffix}@staging-p6.test`,
    'Tech',
    'Alpha',
    password,
  );
  const techB = await inviteTechnician(
    ownerToken,
    techRole.id,
    `phase6.tech.b.${suffix}@staging-p6.test`,
    'Tech',
    'Bravo',
    password,
  );
  if (!techA.ok || !techB.ok) {
    fail(report.results, 'technician_provision', techA.detail || techB.detail);
    writeReport(report);
    process.exit(7);
  }
  pass(report.results, 'technician_provision', `${techA.userId},${techB.userId}`);

  const mobile = '0825559876';
  const street = '45 Main Road';
  const suburb = 'Claremont';
  const city = 'Cape Town';
  const province = 'Western Cape';
  const postalCode = '7708';

  const lead = await api('/api/v1/leads', {
    method: 'POST',
    token: ownerToken,
    body: {
      contactName: 'Keanu Staging Crew Test',
      contactPhone: mobile,
      contactEmail: `lead.${suffix}@staging-p6.test`,
      street,
      suburb,
      city,
      province,
      postalCode,
      source: 'staging-phase6',
      notes: `${LABEL} crew assignment E2E`,
      accessInstructions: 'Ring bell on arrival',
    },
  });
  const leadId = lead.json?.data?.lead?.id;
  if (lead.status !== 201 || !leadId) {
    fail(report.results, 'lead_create', JSON.stringify(lead.json?.error || lead.status));
    writeReport(report);
    process.exit(8);
  }
  pass(report.results, 'lead_create', leadId);

  const convert = await api(`/api/v1/leads/${leadId}/convert`, {
    method: 'POST',
    token: ownerToken,
    body: {
      clientActionId: `phase6-convert-${suffix}`,
      customerMode: 'new',
      propertyMode: 'new',
      createJob: true,
      property: {
        propertyName: 'Site',
        street,
        suburb,
        city,
        province,
        postalCode,
        isPrimary: true,
      },
      job: {
        jobType: 'Blocked drain',
        description: 'Phase 6 staging crew assignment chain',
        priority: 'normal',
        siteContactName: 'Keanu Staging Crew Test',
        siteContactMobile: mobile,
        accessInstructions: 'Ring bell on arrival',
      },
      duplicateResolution: 'create_new',
    },
  });
  const jobId = convert.json?.data?.conversion?.jobId;
  const jobNumber = convert.json?.data?.conversion?.jobNumber;
  if ((convert.status !== 201 && convert.status !== 200) || !jobId) {
    fail(report.results, 'job_create', JSON.stringify(convert.json?.error || convert.status));
    writeReport(report);
    process.exit(8);
  }
  pass(report.results, 'job_create', jobNumber || jobId);

  const scheduleAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const scheduleEnd = new Date(Date.now() + 2 * 86_400_000 + 2 * 3_600_000).toISOString();
  const schedule = await api(`/api/v1/scheduling/jobs/${jobId}/schedule`, {
    method: 'POST',
    token: ownerToken,
    body: {
      scheduledAt: scheduleAt,
      scheduledEndAt: scheduleEnd,
      assignedUserId: techA.userId,
    },
  });
  if (schedule.status !== 201 && schedule.status !== 200) {
    fail(report.results, 'job_schedule', JSON.stringify(schedule.json?.error || schedule.status));
  } else {
    pass(report.results, 'job_schedule', scheduleAt);
  }

  const assignCrew = await api(`/api/v1/jobs/${jobId}/crew`, {
    method: 'PUT',
    token: ownerToken,
    body: {
      members: [
        { userId: techA.userId, crewRole: 'crew_leader', isPrimary: true },
        { userId: techB.userId, crewRole: 'assistant', isPrimary: false },
      ],
      primaryUserId: techA.userId,
    },
  });
  if (assignCrew.status !== 200) {
    fail(report.results, 'crew_assign', JSON.stringify(assignCrew.json?.error || assignCrew.status));
  } else {
    pass(report.results, 'crew_assign', String(assignCrew.json?.data?.crew?.length ?? 0));
  }

  const crewRead = await api(`/api/v1/jobs/${jobId}/crew`, { token: ownerToken });
  const crewRows = crewRead.json?.data?.crew ?? [];
  const primary = crewRows.find((m) => m.isPrimary);
  if (crewRead.status === 200 && crewRows.length >= 2 && primary?.userId === techA.userId) {
    pass(report.results, 'crew_readback', `${crewRows.length} members`);
  } else {
    fail(report.results, 'crew_readback', JSON.stringify(crewRead.json?.error || crewRead.status));
  }

  const weekStart = new Date(scheduleAt);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const calendar = await api(
    `/api/v1/scheduling/calendar?from=${encodeURIComponent(weekStart.toISOString())}&to=${encodeURIComponent(weekEnd.toISOString())}`,
    { token: ownerToken },
  );
  const events = calendar.json?.data?.calendar?.events ?? calendar.json?.data?.events ?? [];
  const hit = events.find((e) => e.id === jobId);
  if (calendar.status === 200 && hit?.jobNumber && (hit.crewLabel || hit.assignedUserName)) {
    pass(
      report.results,
      'calendar_crew_label',
      hit.crewLabel || hit.assignedUserName || 'assigned',
    );
  } else {
    fail(
      report.results,
      'calendar_crew_label',
      calendar.status === 200 ? 'event missing crew label' : String(calendar.status),
    );
  }

  if (hit?.siteContactMobile?.includes('+') || hit?.siteContactMobile?.includes('27')) {
    pass(report.results, 'calendar_site_contact_mobile', hit.siteContactMobile);
  } else {
    fail(report.results, 'calendar_site_contact_mobile', hit?.siteContactMobile || 'missing');
  }

  const foreignSignup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Foreign ${suffix}`,
      firstName: 'Other',
      lastName: 'Tenant',
      email: `foreign.${suffix}@staging-p6.test`,
      password,
    },
  });
  const foreignToken = foreignSignup.json?.data?.session?.accessToken;
  if (foreignToken) {
    const denied = await api(`/api/v1/jobs/${jobId}/crew`, { token: foreignToken });
    if (denied.status === 403 || denied.status === 404) {
      pass(report.results, 'cross_tenant_crew_denied', String(denied.status));
    } else {
      fail(report.results, 'cross_tenant_crew_denied', String(denied.status));
    }
  } else {
    fail(report.results, 'cross_tenant_crew_denied', 'foreign signup failed');
  }

  report.totals.passed = report.results.filter((r) => r.status === 'PASS').length;
  report.totals.failed = report.results.filter((r) => r.status === 'FAIL').length;
  report.verdict = report.totals.failed === 0 ? 'GO' : 'NO-GO';
  report.completedAt = new Date().toISOString();
  report.job = { jobId, jobNumber };

  writeReport(report);
  console.log(
    JSON.stringify({ verdict: report.verdict, passed: report.totals.passed, failed: report.totals.failed }, null, 2),
  );
  process.exit(report.totals.failed === 0 ? 0 : 8);
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
}

await main();
