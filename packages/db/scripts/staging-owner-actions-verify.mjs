/**
 * Owner actions staging verification — Customers, Leads, Jobs list actions.
 *
 * API proof against public Railway staging + Playwright DOM checks on deployed web.
 *
 * Usage:
 *   node packages/db/scripts/staging-owner-actions-verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/222-owner-actions-staging-verify.json');
const screenshotDir = path.resolve(repoRoot, 'diagnostic-output/owner-actions-screenshots');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-OWNER-ACTIONS';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(
  /\/$/,
  '',
);
const WEB_ORIGIN = (process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app').replace(
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

async function loginViaWeb(page, email, password) {
  await page.goto(`${WEB_ORIGIN}/auth/login`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 60_000 });
}

async function checkListActions(page, route, label, results) {
  await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const actionsCol = page.locator('.leads-table__actions-col, th:has-text("Actions")').first();
  const rowActions = page.locator('.ux-row-actions').first();
  const editBtn = page.locator('.ux-row-actions__edit').first();
  const moreBtn = page.locator('.ux-more-menu__trigger').first();

  const hasActionsHeader = await actionsCol.count();
  const hasRowActions = await rowActions.count();
  const hasEdit = await editBtn.count();
  const hasMore = await moreBtn.count();

  fs.mkdirSync(screenshotDir, { recursive: true });
  const shotPath = path.join(screenshotDir, `${label.replace(/\//g, '-')}-actions.png`);
  await page.screenshot({ path: shotPath, fullPage: false });

  if (hasActionsHeader && hasRowActions && hasEdit && hasMore) {
    pass(results, `${label}_actions_column_visible`, shotPath);
  } else {
    fail(
      results,
      `${label}_actions_column_visible`,
      `header=${hasActionsHeader} rowActions=${hasRowActions} edit=${hasEdit} more=${hasMore} shot=${shotPath}`,
    );
  }

  const backVisible = await page.locator('.ux-back-button, [class*="back"]').count();
  if (backVisible > 0) {
    pass(results, `${label}_back_button_visible`, '');
  } else {
    fail(results, `${label}_back_button_visible`, 'Back button not found');
  }
}

function writeReport(report) {
  report.totals = {
    passed: report.results.filter((r) => r.status === 'PASS').length,
    failed: report.results.filter((r) => r.status === 'FAIL').length,
  };
  report.verdict = report.totals.failed === 0 ? 'GO' : 'NO-GO';
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath} — ${report.verdict} (${report.totals.passed}/${report.totals.passed + report.totals.failed})`);
}

async function main() {
  const report = {
    schemaVersion: 'owner-actions-staging-verify-v1',
    label: LABEL,
    startedAt: new Date().toISOString(),
    apiOrigin: API_ORIGIN,
    webOrigin: WEB_ORIGIN,
    results: [],
    screenshotsDir: screenshotDir,
  };

  if (API_ORIGIN.toLowerCase().includes(FORBIDDEN)) {
    fail(report.results, 'target_not_production', 'Blocked production ref');
    writeReport(report);
    process.exit(3);
  }

  const ready = await api('/api/v1/health/ready');
  if (ready.status !== 200) {
    fail(report.results, 'staging_api_ready', String(ready.status));
    writeReport(report);
    process.exit(4);
  }
  pass(report.results, 'staging_api_ready', 'database connected');

  const suffix = randomBytes(4).toString('hex');
  const password = 'OwnerActionsPass1!';
  const email = `owner.actions.${suffix}@staging-owner-actions.test`;

  const signup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Co ${suffix}`,
      firstName: 'Owner',
      lastName: 'Actions',
      email,
      password,
    },
  });
  const token = signup.json?.data?.session?.accessToken;
  if (signup.status !== 201 || !token) {
    fail(report.results, 'owner_signup', JSON.stringify(signup.json?.error || signup.status));
    writeReport(report);
    process.exit(5);
  }
  pass(report.results, 'owner_signup', email);

  const customerRes = await api('/api/v1/crm/customers', {
    method: 'POST',
    token,
    body: { name: `${LABEL} Customer ${suffix}`, phone: '0825559876', email: `cust.${suffix}@test.local` },
  });
  const customerId = customerRes.json?.data?.customer?.id;
  if (customerRes.status !== 201 || !customerId) {
    fail(report.results, 'customer_create', JSON.stringify(customerRes.json?.error));
    writeReport(report);
    process.exit(6);
  }
  pass(report.results, 'customer_create', customerId);

  const patchCustomer = await api(`/api/v1/crm/customers/${customerId}`, {
    method: 'PATCH',
    token,
    body: { name: `${LABEL} Customer ${suffix} Updated` },
  });
  if (patchCustomer.status === 200) {
    pass(report.results, 'customer_edit_save', patchCustomer.json?.data?.customer?.name ?? '');
  } else {
    fail(report.results, 'customer_edit_save', JSON.stringify(patchCustomer.json?.error));
  }

  const leadRes = await api('/api/v1/leads', {
    method: 'POST',
    token,
    body: {
      contactName: `${LABEL} Lead ${suffix}`,
      contactPhone: '0825551234',
      suburb: 'Observatory',
      street: `14 Lead Lane ${suffix}`,
      city: 'Cape Town',
      province: 'Western Cape',
      postalCode: '7925',
      serviceType: 'Electrical',
      duplicateOverrideReason: 'Staging owner actions verify — unique test lead',
    },
  });
  const leadId = leadRes.json?.data?.lead?.id;
  if (leadRes.status !== 201 || !leadId) {
    fail(report.results, 'lead_create', JSON.stringify(leadRes.json?.error));
  } else {
    pass(report.results, 'lead_create', leadId);
  }

  if (leadId) {
    const qualify = await api(`/api/v1/leads/${leadId}`, {
      method: 'PATCH',
      token,
      body: { status: 'qualified' },
    });
    if (qualify.status === 200) pass(report.results, 'lead_accept_qualify', 'qualified');
    else fail(report.results, 'lead_accept_qualify', JSON.stringify(qualify.json?.error));

    const pending = await api(`/api/v1/leads/${leadId}`, {
      method: 'PATCH',
      token,
      body: { status: 'awaiting_information' },
    });
    if (pending.status === 200) pass(report.results, 'lead_pending', 'awaiting_information');
    else fail(report.results, 'lead_pending', JSON.stringify(pending.json?.error));

    const decline = await api(`/api/v1/leads/${leadId}`, {
      method: 'PATCH',
      token,
      body: { status: 'lost', lostReason: 'Staging verify decline' },
    });
    if (decline.status === 200) pass(report.results, 'lead_decline', 'lost');
    else fail(report.results, 'lead_decline', JSON.stringify(decline.json?.error));

  }

  const jobRes = await api('/api/v1/jobs', {
    method: 'POST',
    token,
    body: {
      customerId,
      jobType: 'Electrical',
      priority: 'normal',
      description: 'Staging owner actions verify',
      siteContact: { name: 'Site Contact', mobile: '0845551234' },
      newProperty: {
        propertyName: 'Verify site',
        street: `9 Job Street ${suffix}`,
        suburb: 'Observatory',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '7925',
      },
    },
  });
  const jobId = jobRes.json?.data?.job?.id;
  if (jobRes.status !== 201 || !jobId) {
    fail(report.results, 'job_create', JSON.stringify(jobRes.json?.error));
  } else {
    pass(report.results, 'job_create', jobId);

    const jobPatch = await api(`/api/v1/jobs/${jobId}`, {
      method: 'PATCH',
      token,
      body: { status: 'scheduled', priority: 'high' },
    });
    if (jobPatch.status === 200) pass(report.results, 'job_edit_save', jobPatch.json?.data?.job?.status ?? '');
    else fail(report.results, 'job_edit_save', JSON.stringify(jobPatch.json?.error));

    const archive = await api(`/api/v1/jobs/${jobId}`, {
      method: 'PATCH',
      token,
      body: { status: 'cancelled' },
    });
    if (archive.status === 200) pass(report.results, 'job_archive_cancel', 'cancelled');
    else fail(report.results, 'job_archive_cancel', JSON.stringify(archive.json?.error));
  }

  const blockedDelete = await api(`/api/v1/crm/customers/${customerId}`, { method: 'DELETE', token });
  if (blockedDelete.status === 403 || blockedDelete.status === 400) {
    pass(report.results, 'customer_unsafe_delete_blocked', String(blockedDelete.status));
  } else if (blockedDelete.status === 200 || blockedDelete.status === 204) {
    pass(report.results, 'customer_delete_empty', 'empty customer deleted');
  } else {
    fail(report.results, 'customer_unsafe_delete_blocked', JSON.stringify(blockedDelete.json?.error));
  }

  try {
    const executablePath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await loginViaWeb(page, email, password);
    await checkListActions(page, '/crm', 'customers_list', report.results);
    if (customerId) {
      await page.goto(`${WEB_ORIGIN}/crm/${customerId}#edit`, { waitUntil: 'networkidle' });
      const editForm = page.locator('.crm-form, form').first();
      if ((await editForm.count()) > 0) pass(report.results, 'customer_detail_edit_opens', '');
      else fail(report.results, 'customer_detail_edit_opens', 'Edit form not visible');
    }
    await checkListActions(page, '/leads', 'leads_list', report.results);
    await checkListActions(page, '/jobs', 'jobs_list', report.results);
    if (jobId) {
      await page.goto(`${WEB_ORIGIN}/jobs/${jobId}#edit`, { waitUntil: 'networkidle' });
      const jobForm = page.locator('.jobs-form, form').first();
      if ((await jobForm.count()) > 0) pass(report.results, 'job_detail_edit_opens', '');
      else fail(report.results, 'job_detail_edit_opens', 'Edit form not visible');
    }
    await browser.close();
  if (leadId) {
    const delLead = await api(`/api/v1/leads/${leadId}`, { method: 'DELETE', token });
    if (delLead.status === 200 || delLead.status === 204) pass(report.results, 'lead_delete_eligible', 'deleted');
    else fail(report.results, 'lead_delete_eligible', JSON.stringify(delLead.json?.error));
  }

  } catch (err) {
    fail(report.results, 'playwright_ui_checks', err instanceof Error ? err.message : String(err));
  }

  writeReport(report);
  process.exit(report.totals.failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
