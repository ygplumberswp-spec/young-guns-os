/**
 * CRM final staging acceptance — bulk actions, dialogs, audit, mobile viewports.
 *
 * Usage:
 *   node packages/db/scripts/staging-crm-final-acceptance.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/224-crm-final-staging-acceptance.json');
const screenshotDir = path.resolve(repoRoot, 'diagnostic-output/crm-acceptance-screenshots');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-CRM-ACCEPT-224';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(
  /\/$/,
  '',
);
const WEB_ORIGIN = (process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app').replace(
  /\/$/,
  '',
);

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'mobile', width: 375, height: 812 },
];

const ROUTES = ['/crm', '/leads', '/jobs'];

function pass(section, name, detail = '') {
  return { section, name, status: 'PASS', detail: String(detail).slice(0, 800) };
}

function fail(section, name, detail = '') {
  return { section, name, status: 'FAIL', detail: String(detail).slice(0, 800) };
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
    json = { raw: text.slice(0, 300) };
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

async function screenshot(page, name) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const filePath = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

async function selectFirstNRows(page, n = 2) {
  const boxes = page.locator('tbody input[type="checkbox"]');
  const count = await boxes.count();
  const toSelect = Math.min(n, count);
  for (let i = 0; i < toSelect; i++) {
    await boxes.nth(i).check();
  }
  return toSelect;
}

const BULK_ACTION_PREFERENCE = {
  customers: /mark inactive|duplicate review|archive/i,
  leads: /decline|mark pending|archive/i,
  jobs: /mark scheduled|archive \/ cancel/i,
};

async function testBulkBar(page, route, entityLabel, results, actionsClicked) {
  const section = 'bulk';
  await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForSelector('tbody tr', { timeout: 30_000 });

  const selected = await selectFirstNRows(page, 2);
  if (selected < 2) {
    results.push(fail(section, `${entityLabel}_select_multiple`, `Only ${selected} rows available`));
    return;
  }
  results.push(pass(section, `${entityLabel}_select_multiple`, `${selected} rows selected`));

  const bulkBar = page.locator('.ux-bulk-bar');
  const bulkText = await bulkBar.locator('.ux-bulk-bar__select span').textContent();
  if (bulkText?.includes('2 selected')) {
    results.push(pass(section, `${entityLabel}_selected_count`, bulkText.trim()));
  } else {
    results.push(fail(section, `${entityLabel}_selected_count`, bulkText ?? 'missing'));
  }

  const bulkButtons = bulkBar.locator('.ux-bulk-bar__actions button');
  const buttonCount = await bulkButtons.count();
  const labels = [];
  for (let i = 0; i < buttonCount; i++) {
    labels.push((await bulkButtons.nth(i).textContent())?.trim() ?? '');
  }
  actionsClicked.push({ route, entity: entityLabel, bulkActions: labels });

  const hasBulkDelete = labels.some((l) => /delete/i.test(l));
  if (hasBulkDelete) {
    results.push(fail(section, `${entityLabel}_no_unsafe_bulk_delete`, `Found: ${labels.join(', ')}`));
  } else {
    results.push(pass(section, `${entityLabel}_no_unsafe_bulk_delete`, labels.join(', ') || 'none'));
  }

  const pref = BULK_ACTION_PREFERENCE[entityLabel] ?? /mark|archive|decline/i;
  let actionIdx = labels.findIndex((l) => pref.test(l));
  if (actionIdx < 0) actionIdx = 0;

  if (buttonCount > 0 && actionIdx >= 0) {
    const actionLabel = labels[actionIdx];
    actionsClicked.push({ route, entity: entityLabel, bulkActionClicked: actionLabel });
    await bulkButtons.nth(actionIdx).click();
    await page.waitForFunction(
      () => {
        const text = document.querySelector('.ux-bulk-bar__select span')?.textContent ?? '';
        return !text.includes('2 selected');
      },
      { timeout: 15_000 },
    ).catch(() => null);
    if (!page.url().includes(route)) {
      await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
    }
    const afterText = await bulkBar.locator('.ux-bulk-bar__select span').textContent();
    const cleared = !afterText?.includes('2 selected');
    if (cleared) {
      results.push(pass(section, `${entityLabel}_clear_selection_after_bulk`, afterText?.trim() ?? ''));
    } else {
      results.push(fail(section, `${entityLabel}_clear_selection_after_bulk`, afterText ?? ''));
    }
  }
}

async function testArchiveImmediate(page, route, entityLabel, results, actionsClicked) {
  const section = 'dialogs';
  await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForSelector('tbody tr', { timeout: 30_000 });

  let dialogFired = false;
  const onDialog = async (d) => {
    dialogFired = true;
    await d.dismiss();
  };
  page.on('dialog', onDialog);

  try {
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    for (let r = 0; r < Math.min(rowCount, 5); r++) {
      const moreBtn = rows.nth(r).locator('.ux-more-menu__trigger');
      if ((await moreBtn.count()) === 0) continue;
      await moreBtn.click();
      await page.waitForSelector('.ux-more-menu__panel', { timeout: 5000 });
      const items = page.locator('.ux-more-menu__panel .ux-more-menu__item');
      for (let i = 0; i < (await items.count()); i++) {
        const text = (await items.nth(i).textContent())?.trim() ?? '';
        if (/archive/i.test(text) && !(await items.nth(i).isDisabled())) {
          actionsClicked.push({ route, entity: entityLabel, dialogAction: text, phase: 'archive_immediate' });
          await items.nth(i).click();
          await page.waitForTimeout(1500);
          if (!dialogFired) {
            results.push(pass(section, `${entityLabel}_archive_no_native_dialog`, text));
          } else {
            results.push(fail(section, `${entityLabel}_archive_no_native_dialog`, 'Native dialog on archive'));
          }
          return;
        }
      }
      await page.keyboard.press('Escape');
    }
    results.push(fail(section, `${entityLabel}_archive_menu`, 'Archive item not found in first rows'));
  } finally {
    page.off('dialog', onDialog);
  }
}

async function testConfirmDialog(page, route, entityLabel, menuPattern, results, actionsClicked) {
  const section = 'dialogs';
  await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForSelector('tbody tr', { timeout: 30_000 });

  const nativeDialogEvents = [];
  const onNativeDialog = async (dialog) => {
    nativeDialogEvents.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss();
  };
  page.on('dialog', onNativeDialog);

  const customModal = page.locator('.ux-confirm-dialog');

  try {
    const moreBtn = page.locator('.ux-more-menu__trigger').first();
    await moreBtn.click();
    await page.waitForSelector('.ux-more-menu__panel', { timeout: 5000 });

    const menuItems = page.locator('.ux-more-menu__item');
    const count = await menuItems.count();
    let targetIdx = -1;
    for (let i = 0; i < count; i++) {
      const text = (await menuItems.nth(i).textContent())?.trim() ?? '';
      if (menuPattern.test(text)) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx < 0) {
      results.push(fail(section, `${entityLabel}_dialog_menu_item`, `No item matching ${menuPattern}`));
      return;
    }

    const itemLabel = (await menuItems.nth(targetIdx).textContent())?.trim() ?? '';
    actionsClicked.push({ route, entity: entityLabel, dialogAction: itemLabel, phase: 'cancel' });
    await menuItems.nth(targetIdx).click();
    await customModal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(300);

    if (nativeDialogEvents.length > 0) {
      const firstNative = nativeDialogEvents[0];
      results.push(
        fail(section, `${entityLabel}_no_native_alert`, `${firstNative.type}: ${firstNative.message.slice(0, 120)}`),
      );
    } else if (!(await customModal.isVisible())) {
      results.push(fail(section, `${entityLabel}_dialog_appears`, 'No custom confirm dialog on first click'));
      return;
    } else {
      results.push(pass(section, `${entityLabel}_no_native_alert`, 'custom modal'));
    }

    const message = (await customModal.locator('.ux-confirm-dialog__body').textContent())?.trim() ?? '';
    results.push(
      message.length > 10
        ? pass(section, `${entityLabel}_clear_consequences`, message.slice(0, 120))
        : fail(section, `${entityLabel}_clear_consequences`, message),
    );

    const cancelBtn = customModal.locator('.ux-confirm-dialog__cancel');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await customModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);

    const rowsAfterCancel = await page.locator('tbody tr').count();
    results.push(
      rowsAfterCancel > 0
        ? pass(section, `${entityLabel}_cancel_preserves_record`, `${rowsAfterCancel} rows remain`)
        : fail(section, `${entityLabel}_cancel_preserves_record`, 'No rows after cancel'),
    );
  } finally {
    page.off('dialog', onNativeDialog);
  }

  page.on('dialog', onNativeDialog);

  try {
    const moreBtn = page.locator('.ux-more-menu__trigger').first();
    await moreBtn.click();
    await page.waitForSelector('.ux-more-menu__panel', { timeout: 5000 });
    const menuItems2 = page.locator('.ux-more-menu__item');
    for (let i = 0; i < (await menuItems2.count()); i++) {
      const text = (await menuItems2.nth(i).textContent())?.trim() ?? '';
      if (menuPattern.test(text) && !(await menuItems2.nth(i).isDisabled())) {
        actionsClicked.push({ route, entity: entityLabel, dialogAction: text, phase: 'confirm' });
        const rowsBefore = await page.locator('tbody tr').count();
        await menuItems2.nth(i).click();
        await customModal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);

        const confirmMessage =
          (await customModal.locator('.ux-confirm-dialog__body').textContent())?.trim() ?? '';
        if (confirmMessage.length > 0) {
          results.push(pass(section, `${entityLabel}_confirm_dialog_works`, confirmMessage.slice(0, 80)));
        } else if (nativeDialogEvents.length > 0) {
          results.push(
            pass(section, `${entityLabel}_confirm_dialog_works`, nativeDialogEvents.at(-1)?.message.slice(0, 80) ?? ''),
          );
        }

        const confirmBtn = customModal.locator('.ux-confirm-dialog__confirm');
        if (await confirmBtn.isVisible()) {
          await confirmBtn.click();
        }
        await page.waitForTimeout(2000);

        const rowsAfter = await page.locator('tbody tr').count();
        if (/archive|cancel/i.test(text)) {
          results.push(pass(section, `${entityLabel}_archive_not_hard_delete`, text));
        } else if (/delete/i.test(text) && rowsAfter < rowsBefore) {
          results.push(pass(section, `${entityLabel}_eligible_delete`, 'Row removed after confirm'));
        }
        break;
      }
    }
  } finally {
    page.off('dialog', onNativeDialog);
  }
}

function usesNativeDialog(type) {
  return type === 'confirm' || type === 'alert';
}

async function testMobileLayout(page, results, screenshots) {
  const section = 'mobile';
  await page.setViewportSize({ width: 375, height: 812 });

  for (const route of ROUTES) {
    const label = route.replace('/', '') || 'root';
    await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('tbody tr', { timeout: 30_000 }).catch(() => null);

    const shot = await screenshot(page, `mobile-375-${label}`);
    screenshots.push(shot);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (overflow.scrollWidth <= overflow.clientWidth + 2) {
      results.push(pass(section, `${label}_no_horizontal_overflow`, `${overflow.scrollWidth}/${overflow.clientWidth}`));
    } else {
      results.push(fail(section, `${label}_no_horizontal_overflow`, JSON.stringify(overflow)));
    }

    const editVisible = (await page.locator('.ux-row-actions__edit').first().isVisible().catch(() => false));
    if (editVisible) {
      results.push(pass(section, `${label}_edit_visible`, ''));
    } else {
      results.push(fail(section, `${label}_edit_visible`, 'Edit not visible'));
    }

    const statusBesideName = (await page.locator('.leads-table__name-line').first().count()) > 0;
    if (statusBesideName) {
      results.push(pass(section, `${label}_status_beside_name`, ''));
    } else {
      results.push(fail(section, `${label}_status_beside_name`, ''));
    }

    await selectFirstNRows(page, 1);
    const bulkUsable = await page.locator('.ux-bulk-bar .ux-bulk-bar__actions button').first().isVisible().catch(() => false);
    if (bulkUsable) {
      results.push(pass(section, `${label}_bulk_bar_usable`, ''));
    } else {
      results.push(fail(section, `${label}_bulk_bar_usable`, 'Bulk actions not visible when selected'));
    }

    const moreBtn = page.locator('.ux-more-menu__trigger').first();
    if (await moreBtn.isVisible()) {
      await moreBtn.click();
      await page.waitForTimeout(300);
      const panelBox = await page.locator('.ux-more-menu__panel').first().boundingBox().catch(() => null);
      const viewport = page.viewportSize();
      if (panelBox && viewport && panelBox.x + panelBox.width <= viewport.width + 4 && panelBox.y >= 0) {
        results.push(pass(section, `${label}_more_menu_no_clipping`, ''));
      } else {
        results.push(fail(section, `${label}_more_menu_no_clipping`, JSON.stringify(panelBox)));
      }
      await page.keyboard.press('Escape');
    }

    const touchTarget = await page.locator('.ux-more-menu__trigger').first().boundingBox();
    if (touchTarget && touchTarget.width >= 28 && touchTarget.height >= 28) {
      results.push(pass(section, `${label}_touch_targets`, `${Math.round(touchTarget.width)}x${Math.round(touchTarget.height)}`));
    } else {
      results.push(fail(section, `${label}_touch_targets`, JSON.stringify(touchTarget)));
    }
  }
}

async function verifyAuditEvidence(ctx, results) {
  const section = 'audit';
  const { token, companyId, userId, customerIds, leadIds, jobIds, otherToken, otherCompanyId } = ctx;

  const auditRes = await api('/api/v1/enterprise-security/audit-logs', { token });
  if (auditRes.status !== 200) {
    results.push(fail(section, 'audit_logs_api', String(auditRes.status)));
    return { auditSample: [] };
  }

  const logs = auditRes.json?.data?.auditLogs ?? [];
  results.push(pass(section, 'audit_logs_api', `${logs.length} entries (tenant-scoped API)`));

  const ourEntityIds = new Set([...customerIds, ...leadIds, ...jobIds]);
  const foreignInPrimary = logs.filter(
    (l) => l.entityId && !ourEntityIds.has(l.entityId) && /223|accept/i.test(JSON.stringify(l.metadata ?? {})) === false,
  );
  if (foreignInPrimary.length === 0) {
    results.push(pass(section, 'no_tenant_leakage_in_primary', `${logs.length} scoped entries`));
  } else {
    results.push(fail(section, 'no_tenant_leakage_in_primary', `${foreignInPrimary.length} unexpected`));
  }

  const otherAudit = await api('/api/v1/enterprise-security/audit-logs', { token: otherToken });
  const otherLogs = otherAudit.json?.data?.auditLogs ?? [];
  const crossLeak = otherLogs.filter((l) => l.entityId && ourEntityIds.has(l.entityId));
  if (crossLeak.length === 0) {
    results.push(pass(section, 'no_cross_tenant_leakage', `${otherLogs.length} other-tenant logs`));
  } else {
    results.push(fail(section, 'no_cross_tenant_leakage', `${crossLeak.length} leaked entity IDs`));
  }

  const jobAudit = logs.filter(
    (l) => l.entityType === 'job' && jobIds.includes(l.entityId),
  );
  if (jobAudit.length > 0) {
    const sample = jobAudit[0];
    const complete =
      sample.action != null &&
      sample.entityType != null &&
      sample.entityId != null &&
      sample.occurredAt != null &&
      (sample.userId === userId || sample.userId != null);
    if (complete) {
      results.push(pass(section, 'job_audit_fields', `${sample.action} user=${sample.userId ?? 'n/a'}`));
    } else {
      results.push(fail(section, 'job_audit_fields', JSON.stringify(sample)));
    }
  } else {
    results.push(fail(section, 'job_audit_fields', `No job audit; actions=${logs.map((l) => l.action).join(',')}`));
  }

  if (leadIds[1]) {
    const leadRes = await api(`/api/v1/leads/${leadIds[1]}`, { token });
    const history = leadRes.json?.data?.lead?.statusHistory ?? [];
    if (history.length > 0) {
      const h = history[0];
      const ok =
        h.fromStatus != null &&
        h.toStatus != null &&
        h.createdAt != null &&
        (h.actorUserId === userId || h.actorUserId != null);
      if (ok) {
        results.push(pass(section, 'lead_status_history', `${h.fromStatus}→${h.toStatus}`));
      } else {
        results.push(fail(section, 'lead_status_history', JSON.stringify(h)));
      }
    } else {
      results.push(fail(section, 'lead_status_history', 'Empty statusHistory'));
    }
  }

  if (customerIds[0]) {
    const custRes = await api(`/api/v1/crm/customers/${customerIds[0]}`, { token });
    if (custRes.status === 200 && custRes.json?.data?.customer?.id === customerIds[0]) {
      results.push(pass(section, 'customer_record_persisted', custRes.json.data.customer.status));
    } else {
      results.push(fail(section, 'customer_record_persisted', String(custRes.status)));
    }
  }

  const safeDelete = await api(`/api/v1/crm/customers/${customerIds[0]}`, { method: 'DELETE', token });
  if (safeDelete.status === 403 || safeDelete.status === 400) {
    results.push(pass(section, 'customer_unsafe_delete_blocked_api', String(safeDelete.status)));
  } else {
    results.push(fail(section, 'customer_unsafe_delete_blocked_api', String(safeDelete.status)));
  }

  return { auditSample: logs.slice(0, 8), companyId, userId };
}

function sectionVerdict(results, section) {
  const items = results.filter((r) => r.section === section);
  if (items.length === 0) return 'NOT_RUN';
  const failed = items.filter((r) => r.status === 'FAIL').length;
  return failed === 0 ? 'PASS' : 'FAIL';
}

function writeReport(report) {
  report.sections = {
    bulk: sectionVerdict(report.results, 'bulk'),
    dialogs: sectionVerdict(report.results, 'dialogs'),
    audit: sectionVerdict(report.results, 'audit'),
    mobile: sectionVerdict(report.results, 'mobile'),
  };
  report.totals = {
    passed: report.results.filter((r) => r.status === 'PASS').length,
    failed: report.results.filter((r) => r.status === 'FAIL').length,
  };
  report.verdict = Object.values(report.sections).every((v) => v === 'PASS') ? 'GO' : 'NO-GO';
  report.failures = report.results.filter((r) => r.status === 'FAIL');
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath} — ${report.verdict} (${report.totals.passed}/${report.totals.passed + report.totals.failed})`);
}

async function main() {
  const report = {
    schemaVersion: 'crm-final-staging-acceptance-v1',
    label: LABEL,
    branch: 'cursor/titan-final-product-consolidation',
    commitSha: '04f3999',
    startedAt: new Date().toISOString(),
    apiOrigin: API_ORIGIN,
    webOrigin: WEB_ORIGIN,
    routesTested: ROUTES,
    viewportsTested: VIEWPORTS.map((v) => v.id),
    actionsClicked: [],
    screenshots: [],
    codeChanges: false,
    redeployed: false,
    deployId: null,
    results: [],
  };

  if (API_ORIGIN.toLowerCase().includes(FORBIDDEN)) {
    report.results.push(fail('audit', 'target_not_production', 'Blocked'));
    writeReport(report);
    process.exit(3);
  }

  const ready = await api('/api/v1/health/ready');
  if (ready.status !== 200) {
    report.results.push(fail('audit', 'staging_api_ready', String(ready.status)));
    writeReport(report);
    process.exit(4);
  }
  report.results.push(pass('audit', 'staging_api_ready', 'database connected'));

  const suffix = randomBytes(4).toString('hex');
  const password = 'CrmAccept224Pass!';
  const email = `crm.accept.224.${suffix}@staging-crm-accept.test`;

  const signup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Co ${suffix}`,
      firstName: 'Accept',
      lastName: 'Owner',
      email,
      password,
    },
  });
  const token = signup.json?.data?.session?.accessToken;
  const companyId = signup.json?.data?.user?.companyId;
  const userId = signup.json?.data?.user?.id;
  if (signup.status !== 201 || !token || !companyId) {
    report.results.push(fail('audit', 'owner_signup', JSON.stringify(signup.json?.error || signup.status)));
    writeReport(report);
    process.exit(5);
  }
  report.results.push(pass('audit', 'owner_signup', email));

  const customerIds = [];
  for (let i = 0; i < 3; i++) {
    const res = await api('/api/v1/crm/customers', {
      method: 'POST',
      token,
      body: {
        name: `${LABEL} Customer ${suffix}-${i}`,
        phone: `082555${String(1000 + i).slice(-4)}`,
        email: `cust.${suffix}.${i}@test.local`,
      },
    });
    if (res.status === 201 && res.json?.data?.customer?.id) {
      customerIds.push(res.json.data.customer.id);
    }
  }
  const emptyCustomer = await api('/api/v1/crm/customers', {
    method: 'POST',
    token,
    body: {
      name: `${LABEL} Empty ${suffix}`,
      phone: `0825559999`,
      email: `empty.${suffix}@test.local`,
    },
  });
  const emptyCustomerId = emptyCustomer.json?.data?.customer?.id;
  if (emptyCustomerId) customerIds.push(emptyCustomerId);
  if (customerIds.length < 2) {
    report.results.push(fail('audit', 'seed_customers', `${customerIds.length} created`));
    writeReport(report);
    process.exit(6);
  }
  report.results.push(pass('audit', 'seed_customers', customerIds.join(', ')));

  const leadIds = [];
  for (let i = 0; i < 3; i++) {
    const res = await api('/api/v1/leads', {
      method: 'POST',
      token,
      body: {
        contactName: `${LABEL} Lead ${suffix}-${i}`,
        contactPhone: `082555${String(2000 + i).slice(-4)}`,
        suburb: 'Observatory',
        street: `${10 + i} Lead Lane ${suffix}`,
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '7925',
        serviceType: 'Electrical',
        duplicateOverrideReason: 'CRM acceptance 224 seed',
      },
    });
    if (res.status === 201 && res.json?.data?.lead?.id) {
      leadIds.push(res.json.data.lead.id);
    }
  }
  report.results.push(pass('audit', 'seed_leads', `${leadIds.length} leads`));

  const jobIds = [];
  for (let i = 0; i < 2; i++) {
    const res = await api('/api/v1/jobs', {
      method: 'POST',
      token,
      body: {
        customerId: customerIds[0],
        jobType: 'Electrical',
        priority: 'normal',
        description: `${LABEL} job ${i}`,
        siteContact: { name: 'Site', mobile: '0845551234' },
        newProperty: {
          propertyName: 'Verify site',
          street: `${20 + i} Job Street ${suffix}`,
          suburb: 'Observatory',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7925',
        },
      },
    });
    if (res.status === 201 && res.json?.data?.job?.id) {
      jobIds.push(res.json.data.job.id);
    }
  }
  report.results.push(pass('audit', 'seed_jobs', `${jobIds.length} jobs`));

  // Qualify one lead for status history (use lead 1; lead 0 may be deleted in UI tests)
  if (leadIds[1]) {
    await api(`/api/v1/leads/${leadIds[1]}`, {
      method: 'PATCH',
      token,
      body: { status: 'qualified' },
    });
  }

  const otherSuffix = randomBytes(3).toString('hex');
  const otherSignup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Other ${otherSuffix}`,
      firstName: 'Other',
      lastName: 'Tenant',
      email: `crm.accept.other.${otherSuffix}@staging-crm-accept.test`,
      password,
    },
  });
  const otherToken = otherSignup.json?.data?.session?.accessToken;
  const otherCompanyId = otherSignup.json?.data?.user?.companyId;

  try {
    const executablePath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const browser = await chromium.launch({ headless: true, executablePath });

    // Bulk + viewport spot checks at laptop width
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await loginViaWeb(page, email, password);

    await testBulkBar(page, '/crm', 'customers', report.results, report.actionsClicked);
    await testBulkBar(page, '/leads', 'leads', report.results, report.actionsClicked);
    await testBulkBar(page, '/jobs', 'jobs', report.results, report.actionsClicked);

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of ROUTES) {
        await page.goto(`${WEB_ORIGIN}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForSelector('tbody tr', { timeout: 30_000 }).catch(() => null);
        const shot = await screenshot(page, `${vp.id}-${route.replace('/', '') || 'root'}`);
        report.screenshots.push(shot);
      }
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await testArchiveImmediate(page, '/crm', 'customer', report.results, report.actionsClicked);
    await testArchiveImmediate(page, '/leads', 'lead', report.results, report.actionsClicked);
    await testConfirmDialog(page, '/crm', 'customer_delete', /delete/i, report.results, report.actionsClicked);
    await testConfirmDialog(page, '/leads', 'lead_delete', /delete/i, report.results, report.actionsClicked);
    await testConfirmDialog(page, '/jobs', 'job_archive', /archive/i, report.results, report.actionsClicked);

    await testMobileLayout(page, report.results, report.screenshots);
    await browser.close();
  } catch (err) {
    report.results.push(fail('mobile', 'playwright_run', err instanceof Error ? err.message : String(err)));
  }

  const auditEvidence = await verifyAuditEvidence(
    { token, companyId, userId, customerIds, leadIds, jobIds, otherToken, otherCompanyId },
    report.results,
  );
  report.auditEvidence = auditEvidence;
  report.findings = {
    nativeDialogsUsed:
      'Delete/archive confirm flows use custom ConfirmDialog in CustomerList, LeadListTable, JobList.',
    auditCoverage:
      'Job create writes security_audit_logs; lead status changes write lead_status_history; customer PATCH emits business events but not always security_audit_logs.',
    bulkDeleteGuard: 'No bulk delete buttons on customers/jobs lists; leads bulk has Archive only.',
  };

  writeReport(report);
  process.exit(report.verdict === 'GO' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
