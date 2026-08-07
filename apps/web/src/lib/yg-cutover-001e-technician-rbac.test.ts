/**
 * YG-CUTOVER-001E — Technician Field Mobile RBAC + data-truth contracts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TECHNICIAN_ROLE_NAME } from '@titan/auth/browser';
import {
  TECHNICIAN_NAV_ITEMS,
  buildTechnicianFieldGreeting,
  countTechnicianActiveAssignedJobs,
  technicianFieldCopyLeaksFinance,
} from '@titan/shared';
import { evaluateOwnerStaffDirectUrl } from './role-forbidden-direct-url.js';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), 'utf8');
}

const technician = {
  roleName: TECHNICIAN_ROLE_NAME,
  permissions: ['mobile:read', 'mobile:write', 'jobs:read', 'jobs:write'],
};

describe('YG-CUTOVER-001E Technician mobile RBAC + data truth', () => {
  it('nav keeps field execution surfaces, Messages≠Notifications, and drops Performance', () => {
    const hrefs = TECHNICIAN_NAV_ITEMS.map((item) => item.href);
    const labels = TECHNICIAN_NAV_ITEMS.map((item) => item.label);
    assert.ok(hrefs.includes('/mobile'));
    assert.ok(hrefs.includes('/mobile/jobs'));
    assert.ok(hrefs.includes('/mobile/route'));
    assert.ok(hrefs.includes('/mobile/inventory'));
    assert.ok(hrefs.includes('/mobile/time'));
    assert.ok(hrefs.includes('/mobile/messages'));
    assert.ok(hrefs.includes('/mobile/notifications'));
    assert.equal(hrefs.includes('/mobile/performance'), false);
    assert.equal(labels.includes('Performance'), false);
    assert.ok(labels.includes('Messages'));
    assert.ok(labels.includes('Notifications'));
    assert.ok(labels.includes('Parts Used'));
    assert.ok(labels.includes('Navigation'));
    // Messages must not point at the notifications path
    const messagesItem = TECHNICIAN_NAV_ITEMS.find((item) => item.label === 'Messages');
    assert.equal(messagesItem?.href, '/mobile/messages');
    const notificationsItem = TECHNICIAN_NAV_ITEMS.find((item) => item.label === 'Notifications');
    assert.equal(notificationsItem?.href, '/mobile/notifications');
  });

  it('dashboard greeting and panels do not surface invoices or company inventory alerts', () => {
    const dash = read('pages/mobile/MobileDashboardPage.tsx');
    assert.match(dash, /countTechnicianActiveAssignedJobs/);
    assert.match(dash, /Parts Used/);
    assert.doesNotMatch(dash, /Inventory Alerts/);
    assert.doesNotMatch(dash, /unpaid/i);

    const inventory = read('pages/mobile/MobileInventoryPage.tsx');
    assert.match(inventory, /Parts Used/);
    assert.doesNotMatch(inventory, /Low Stock Alerts/);
    assert.match(inventory, /Company stock alerts are not shown/);
  });

  it('keeps greeting/jobs/route on the same active-assigned count universe', () => {
    const jobs = [
      { status: 'scheduled' },
      { status: 'in_progress' },
      { status: 'completed' },
    ];
    const active = countTechnicianActiveAssignedJobs(jobs);
    assert.equal(active, 2);
    const greeting = buildTechnicianFieldGreeting({ activeAssignedJobCount: active });
    assert.match(greeting.message, /2 assigned jobs/);
    assert.equal(technicianFieldCopyLeaksFinance(greeting.message), false);
    assert.equal(
      technicianFieldCopyLeaksFinance('You have 1 job today, 3 unpaid invoices.'),
      true,
    );
  });

  it('blocks technician direct URLs to communications hub and owner modules', () => {
    for (const path of [
      '/communications-hub',
      '/crm',
      '/finance/invoices',
      '/inventory',
      '/analytics',
      '/aura',
      '/settings',
    ]) {
      assert.equal(evaluateOwnerStaffDirectUrl(technician, path).allowed, false, path);
    }
    assert.equal(evaluateOwnerStaffDirectUrl(technician, '/mobile/jobs').allowed, true);
  });
});
