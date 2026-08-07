/**
 * Phase 5 staging E2E — Lead → Customer → Property → Job
 *
 * Targets public Railway staging API only (no local postgres required).
 * Refuses production Supabase ref in any configured URL.
 *
 * Usage:
 *   STAGING_API_BASE=https://young-guns-os-staging.up.railway.app \
 *     node packages/db/scripts/staging-phase5-public-e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/140-staging-phase5-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING = 'cpkuwtaipjxeipvbssvn';
const LABEL = 'STAGING-P5';
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

async function main() {
  const report = {
    label: LABEL,
    phase: 5,
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
  const password = 'StagingPhase5Pass1!';
  const mobile = '0825551234';
  const street = '12 Lower Main Road';
  const suburb = 'Observatory';
  const city = 'Cape Town';
  const province = 'Western Cape';
  const postalCode = '7925';

  const signup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Young Guns ${suffix}`,
      firstName: 'Phase',
      lastName: 'Five',
      email: `phase5.${suffix}@staging-p5.test`,
      password,
    },
  });
  const ownerToken = signup.json?.data?.session?.accessToken;
  const companyId = signup.json?.data?.user?.companyId;
  if (signup.status !== 201 || !ownerToken) {
    fail(report.results, 'owner_signup', JSON.stringify(signup.json?.error || signup.status));
    writeReport(report);
    process.exit(5);
  }
  pass(report.results, 'owner_signup', companyId || '');

  const lead = await api('/api/v1/leads', {
    method: 'POST',
    token: ownerToken,
    body: {
      contactName: 'Keanu Staging Test',
      contactPhone: mobile,
      contactEmail: `lead.${suffix}@staging-p5.test`,
      street,
      suburb,
      city,
      province,
      postalCode,
      source: 'staging-phase5',
      notes: `${LABEL} E2E lead with real-format SA address`,
      accessInstructions: 'Gate code 1234 — call on arrival',
      preferredAppointmentAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  const leadId = lead.json?.data?.lead?.id;
  if (lead.status !== 201 || !leadId) {
    fail(report.results, 'lead_create', JSON.stringify(lead.json?.error || lead.status));
    writeReport(report);
    process.exit(6);
  }
  pass(report.results, 'lead_create', leadId);

  const actionId = `phase5-convert-${suffix}`;
  const convert = await api(`/api/v1/leads/${leadId}/convert`, {
    method: 'POST',
    token: ownerToken,
    body: {
      clientActionId: actionId,
      customerMode: 'new',
      propertyMode: 'new',
      createJob: true,
      property: {
        propertyName: 'Main residence',
        street,
        suburb,
        city,
        province,
        postalCode,
        isPrimary: true,
      },
      job: {
        jobType: 'Blocked drain',
        description: 'Kitchen sink blocked — Phase 5 staging E2E',
        priority: 'high',
        siteContactName: 'Keanu Staging Test',
        siteContactMobile: mobile,
        accessInstructions: 'Gate code 1234',
      },
      duplicateResolution: 'create_new',
    },
  });

  const conversion = convert.json?.data?.conversion;
  if (
    (convert.status !== 201 && convert.status !== 200) ||
    !conversion?.customerId ||
    !conversion?.propertyId ||
    !conversion?.jobId ||
    !conversion?.jobNumber?.startsWith('JOB-')
  ) {
    fail(report.results, 'lead_convert_chain', JSON.stringify(convert.json?.error || convert.status));
    writeReport(report);
    process.exit(7);
  }
  pass(report.results, 'lead_convert_chain', conversion.jobNumber);

  const customer = await api(`/api/v1/crm/customers/${conversion.customerId}`, {
    token: ownerToken,
  });
  if (customer.status !== 200 || !customer.json?.data?.customer?.name) {
    fail(report.results, 'customer_readable', String(customer.status));
  } else {
    pass(report.results, 'customer_readable', customer.json.data.customer.name);
  }

  const properties = await api(`/api/v1/crm/customers/${conversion.customerId}/properties`, {
    token: ownerToken,
  });
  const propertyRows = properties.json?.data?.properties || [];
  const propertyHit = propertyRows.find((p) => p.id === conversion.propertyId);
  if (!propertyHit?.addressDisplay || propertyHit.addressDisplay.includes('pending')) {
    fail(report.results, 'property_address_no_placeholder', propertyHit?.addressDisplay || 'missing');
  } else {
    pass(report.results, 'property_address_no_placeholder', propertyHit.addressDisplay);
  }

  const job = await api(`/api/v1/jobs/${conversion.jobId}`, { token: ownerToken });
  const jobRow = job.json?.data?.job;
  if (job.status !== 200 || !jobRow?.address?.display) {
    fail(report.results, 'job_snapshot_address', String(job.status));
  } else if (
    jobRow.address.display.toLowerCase().includes('pending') ||
    jobRow.address.display === 'Address pending'
  ) {
    fail(report.results, 'job_snapshot_no_placeholder', jobRow.address.display);
  } else {
    pass(report.results, 'job_snapshot_no_placeholder', jobRow.address.display);
  }

  if (jobRow?.siteContact?.mobile?.includes('27') || jobRow?.siteContact?.mobile?.includes('+')) {
    pass(report.results, 'site_contact_mobile_e164', jobRow.siteContact.mobile);
  } else {
    fail(report.results, 'site_contact_mobile_e164', jobRow?.siteContact?.mobile || 'missing');
  }

  const retry = await api(`/api/v1/leads/${leadId}/convert`, {
    method: 'POST',
    token: ownerToken,
    body: {
      clientActionId: actionId,
      customerMode: 'new',
      propertyMode: 'new',
      createJob: true,
      property: {
        propertyName: 'Main residence',
        street,
        suburb,
        city,
        province,
        postalCode,
        isPrimary: true,
      },
      job: {
        jobType: 'Blocked drain',
        description: 'Kitchen sink blocked — Phase 5 staging E2E',
        priority: 'high',
        siteContactName: 'Keanu Staging Test',
        siteContactMobile: mobile,
        accessInstructions: 'Gate code 1234',
      },
      duplicateResolution: 'create_new',
    },
  });
  if (retry.status === 200 && retry.json?.data?.conversion?.idempotentReplay === true) {
    pass(report.results, 'convert_idempotent');
  } else {
    fail(report.results, 'convert_idempotent', JSON.stringify(retry.json?.error || retry.status));
  }

  const accountantSignup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Foreign ${suffix}`,
      firstName: 'Other',
      lastName: 'Tenant',
      email: `foreign.${suffix}@staging-p5.test`,
      password,
    },
  });
  const foreignToken = accountantSignup.json?.data?.session?.accessToken;
  if (foreignToken) {
    const denied = await api(`/api/v1/jobs/${conversion.jobId}`, { token: foreignToken });
    if (denied.status === 403 || denied.status === 404) {
      pass(report.results, 'cross_tenant_job_denied', String(denied.status));
    } else {
      fail(report.results, 'cross_tenant_job_denied', String(denied.status));
    }
  } else {
    fail(report.results, 'cross_tenant_job_denied', 'foreign signup failed');
  }

  report.totals.passed = report.results.filter((r) => r.status === 'PASS').length;
  report.totals.failed = report.results.filter((r) => r.status === 'FAIL').length;
  report.verdict = report.totals.failed === 0 ? 'GO' : 'NO-GO';
  report.completedAt = new Date().toISOString();
  report.conversion = {
    customerId: conversion.customerId,
    propertyId: conversion.propertyId,
    jobId: conversion.jobId,
    jobNumber: conversion.jobNumber,
  };

  writeReport(report);
  console.log(JSON.stringify({ verdict: report.verdict, passed: report.totals.passed, failed: report.totals.failed }, null, 2));
  process.exit(report.totals.failed === 0 ? 0 : 8);
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
}

await main();
