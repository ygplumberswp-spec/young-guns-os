import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENTERPRISE_MODULE_LINKS } from './enterprise-modules.js';
import { CLIENT_PORTAL_NAV_ITEMS, OWNER_STAFF_NAV_ITEMS } from './role-experience.js';

describe('nav honesty (UX-K)', () => {
  it('UX-050 — does not duplicate Finance href onto Quotes', () => {
    const financeLabeled = OWNER_STAFF_NAV_ITEMS.filter((item) => item.label === 'Finance');
    assert.equal(financeLabeled.length, 0, 'legacy Finance=Quotes label must be removed');

    const quoteHrefs = OWNER_STAFF_NAV_ITEMS.filter((item) => item.href === '/finance/quotes');
    assert.equal(quoteHrefs.length, 1);
    assert.equal(quoteHrefs[0]?.label, 'Quotes');

    const financeLabels = new Set(
      OWNER_STAFF_NAV_ITEMS.filter((item) => item.href.startsWith('/finance/')).map((i) => i.label),
    );
    assert.deepEqual([...financeLabels].sort(), ['Invoices', 'Payments', 'Quotes']);
  });

  it('UX-052 — Live Dispatch is a first-class staff nav item', () => {
    const item = OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/mobile-platform/dispatcher');
    assert.ok(item);
    assert.equal(item?.label, 'Live Dispatch');
    assert.ok(item?.experiences?.includes('dispatcher'));
  });

  it('UX-048 — enterprise modules index remains catalogued but hidden from primary nav', () => {
    const item = OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/enterprise-modules');
    assert.ok(item);
    assert.equal(item?.label, 'Enterprise modules');
    assert.equal(item?.navHidden, true);
    assert.ok(ENTERPRISE_MODULE_LINKS.length >= 10);
    assert.ok(ENTERPRISE_MODULE_LINKS.every((link) => link.href.startsWith('/')));
  });

  it('UX-H1 — premium enterprise nav renames are applied', () => {
    assert.equal(
      OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/aura/agents')?.label,
      'AURA Team',
    );
    assert.equal(
      OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/aura')?.label,
      'AURA Executive Chat',
    );
    assert.equal(
      OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/automation')?.label,
      'Automation Command Centre',
    );
    assert.equal(
      OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/mission-control')?.label,
      'Company Health',
    );
    assert.equal(
      OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/settings/team')?.label,
      'Team & Access',
    );
    assert.equal(
      OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/settings')?.label,
      'Settings',
    );
  });

  it('Phase 4 — global search is a first-class owner nav item', () => {
    const item = OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/global-search');
    assert.ok(item);
    assert.equal(item?.label, 'Search');
  });

  it('Phase 4 — client portal nav does not duplicate finance or jobs hrefs', () => {
    const financeItems = CLIENT_PORTAL_NAV_ITEMS.filter((item) => item.href === '/my/finance');
    assert.equal(financeItems.length, 1);
    assert.equal(financeItems[0]?.label, 'Invoices & payments');

    const jobsItems = CLIENT_PORTAL_NAV_ITEMS.filter((item) => item.href === '/my/jobs');
    assert.equal(jobsItems.length, 1);
    assert.equal(jobsItems[0]?.label, 'My Jobs');
  });
});
