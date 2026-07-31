import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterOwnerStaffNav } from './role-experience.js';

describe('filterOwnerStaffNav (UX-K)', () => {
  it('owner sees Quotes/Invoices/Payments without Finance duplicate, plus enterprise + dispatcher', () => {
    const items = filterOwnerStaffNav({
      roleName: 'Company Owner',
      permissions: ['*'],
    });
    const labels = items.map((item) => item.label);
    const hrefs = items.map((item) => item.href);

    assert.ok(labels.includes('Quotes'));
    assert.ok(labels.includes('Invoices'));
    assert.ok(labels.includes('Payments'));
    assert.equal(labels.includes('Finance'), false);
    assert.ok(hrefs.includes('/enterprise-modules'));
    assert.ok(hrefs.includes('/mobile-platform/dispatcher'));
    assert.equal(hrefs.filter((h) => h === '/finance/quotes').length, 1);
  });

  it('dispatcher sees Dispatcher console and does not see enterprise modules', () => {
    const items = filterOwnerStaffNav({
      roleName: 'Dispatcher',
      permissions: [
        'customers:read',
        'jobs:read',
        'dispatch:read',
        'dispatch:write',
        'leads:read',
        'finance:read',
        'communications:read',
        'documents:read',
        'mobile:read',
        'users:read',
      ],
    });
    const hrefs = items.map((item) => item.href);
    assert.ok(hrefs.includes('/mobile-platform/dispatcher'));
    assert.equal(hrefs.includes('/enterprise-modules'), false);
    assert.equal(
      items.some((item) => item.label === 'Finance' && item.href === '/finance/quotes'),
      false,
    );
  });

  it('accountant keeps finance children without Finance=Quotes alias or dispatcher console', () => {
    const items = filterOwnerStaffNav({
      roleName: 'Accountant',
      permissions: [
        'customers:read',
        'finance:read',
        'finance:write',
        'documents:read',
        'integrations:read',
        'analytics:read',
      ],
    });
    const hrefs = items.map((item) => item.href);
    assert.ok(hrefs.includes('/finance/quotes'));
    assert.ok(hrefs.includes('/finance/invoices'));
    assert.ok(hrefs.includes('/finance/payments'));
    assert.equal(hrefs.includes('/mobile-platform/dispatcher'), false);
    assert.equal(hrefs.includes('/enterprise-modules'), false);
  });

  it('technician receives no owner staff nav', () => {
    const items = filterOwnerStaffNav({
      roleName: 'Technician',
      permissions: ['mobile:read', 'jobs:read'],
    });
    assert.equal(items.length, 0);
  });
});
