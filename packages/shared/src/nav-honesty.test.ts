import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NAV_LABELS } from './nav-labels.js';
import { ENTERPRISE_MODULE_LINKS } from './enterprise-modules.js';
import {
  CLIENT_PORTAL_NAV_ITEMS,
  NAV_MODULE_BY_HREF,
  NAV_MODULE_LABELS,
  NAV_MODULE_ORDER,
  NAV_MODULE_PRIMARY_HREF,
  OWNER_STAFF_NAV_ITEMS,
  isPrimaryNavHref,
  resolveNavModuleForHref,
  selectModuleToolItems,
  selectPrimaryNavItems,
  type NavModuleId,
} from './role-experience.js';

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
    assert.equal(item?.label, NAV_LABELS.liveDispatch);
    assert.ok(item?.experiences?.includes('dispatcher'));
  });

  it('UX-048 — enterprise modules index is platform-owner only', () => {
    const item = OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/enterprise-modules');
    assert.ok(item);
    assert.equal(item?.label, 'Enterprise Modules');
    assert.deepEqual(item?.experiences, ['platform_owner']);
    assert.ok(ENTERPRISE_MODULE_LINKS.length >= 10);
    assert.ok(ENTERPRISE_MODULE_LINKS.every((link) => link.href.startsWith('/')));
  });

  it('Phase 4 — global search is a first-class owner nav item', () => {
    const item = OWNER_STAFF_NAV_ITEMS.find((entry) => entry.href === '/global-search');
    assert.ok(item);
    assert.equal(item?.label, 'Search');
  });

  it('Phase E — canonical UX label renames are applied', () => {
    const byLabel = (label: string) => OWNER_STAFF_NAV_ITEMS.some((item) => item.label === label);
    assert.ok(byLabel(NAV_LABELS.auraTeam));
    assert.ok(byLabel(NAV_LABELS.companyHealth));
    assert.ok(byLabel(NAV_LABELS.automationCommandCentre));
    assert.ok(byLabel(NAV_LABELS.teamAndAccess));
    assert.ok(byLabel(NAV_LABELS.auraExecutiveChat));
    assert.equal(byLabel('AURA Capabilities'), false);
    assert.equal(byLabel('Mission Control'), false);
    assert.equal(byLabel('Users & Access'), false);
  });

  it('Phase 4 — client portal nav does not duplicate finance or jobs hrefs', () => {
    const financeItems = CLIENT_PORTAL_NAV_ITEMS.filter((item) => item.href === '/my/finance');
    assert.equal(financeItems.length, 1);
    assert.equal(financeItems[0]?.label, 'Invoices & Payments');

    const jobsItems = CLIENT_PORTAL_NAV_ITEMS.filter((item) => item.href === '/my/jobs');
    assert.equal(jobsItems.length, 1);
    assert.equal(jobsItems[0]?.label, 'My Jobs');
  });
});

describe('consolidated navigation (UX final pass)', () => {
  it('the sidebar is business modules, not every page', () => {
    const sidebar = selectPrimaryNavItems(OWNER_STAFF_NAV_ITEMS);
    assert.equal(sidebar.length, NAV_MODULE_ORDER.length);
    assert.ok(
      sidebar.length <= 20,
      `sidebar grew back to ${sidebar.length} entries — keep it to business modules`,
    );
    assert.ok(
      OWNER_STAFF_NAV_ITEMS.length > sidebar.length * 2,
      'the registry should still hold every page behind the modules',
    );
  });

  it('keeps the sidebar in module order with one landing page each', () => {
    const sidebar = selectPrimaryNavItems(OWNER_STAFF_NAV_ITEMS);
    assert.deepEqual(
      sidebar.map((item) => item.href),
      NAV_MODULE_ORDER.map((moduleId) => NAV_MODULE_PRIMARY_HREF[moduleId]),
    );
    const hrefs = sidebar.map((item) => item.href);
    assert.equal(new Set(hrefs).size, hrefs.length, 'no duplicate sidebar entries');
    const labels = sidebar.map((item) => item.label);
    assert.equal(new Set(labels).size, labels.length, 'no duplicate sidebar labels');
  });

  it('does not strand a single page — every nav item belongs to a module', () => {
    const orphans = OWNER_STAFF_NAV_ITEMS.filter((item) => !NAV_MODULE_BY_HREF[item.href]);
    assert.deepEqual(
      orphans.map((item) => item.href),
      [],
      'a page with no module would disappear from navigation entirely',
    );
  });

  it('reaches every non-sidebar page from inside its module', () => {
    const reachable = new Set<string>();
    for (const moduleId of NAV_MODULE_ORDER) {
      reachable.add(NAV_MODULE_PRIMARY_HREF[moduleId]);
      for (const tool of selectModuleToolItems(OWNER_STAFF_NAV_ITEMS, moduleId)) {
        reachable.add(tool.href);
      }
    }
    for (const item of OWNER_STAFF_NAV_ITEMS) {
      assert.ok(reachable.has(item.href), `${item.href} is not reachable from any module`);
    }
  });

  it('every module landing page is a real registry entry', () => {
    for (const moduleId of NAV_MODULE_ORDER) {
      const href = NAV_MODULE_PRIMARY_HREF[moduleId];
      assert.ok(
        OWNER_STAFF_NAV_ITEMS.some((item) => item.href === href),
        `${moduleId} points at ${href}, which is not in the nav registry`,
      );
      assert.ok(isPrimaryNavHref(href));
      assert.ok(NAV_MODULE_LABELS[moduleId]?.length > 0);
      assert.equal(NAV_MODULE_BY_HREF[href], moduleId);
    }
  });

  it('no longer puts Intelligence pages in the main sidebar', () => {
    const sidebar = selectPrimaryNavItems(OWNER_STAFF_NAV_ITEMS);
    for (const item of sidebar) {
      assert.ok(
        !item.href.includes('-intelligence'),
        `${item.href} is an intelligence page and belongs inside its module`,
      );
    }
    // They must still exist, just one level in.
    const intelligencePages = OWNER_STAFF_NAV_ITEMS.filter((item) =>
      item.href.includes('-intelligence'),
    );
    assert.ok(intelligencePages.length >= 15, 'intelligence pages must not be deleted');
  });

  it('consolidating the sidebar widens no permission', () => {
    // Moving an item out of the sidebar must not change who can open it.
    for (const item of OWNER_STAFF_NAV_ITEMS) {
      if (isPrimaryNavHref(item.href)) continue;
      assert.ok(
        item.permissions === undefined || item.permissions.length > 0,
        `${item.href} lost its permission list`,
      );
    }
    // Suppliers and Purchase Orders are the same module and were split out of
    // one entry, so they must carry identical permissions.
    const suppliers = OWNER_STAFF_NAV_ITEMS.find((i) => i.href === '/procurement/suppliers');
    const purchaseOrders = OWNER_STAFF_NAV_ITEMS.find((i) => i.href === '/procurement');
    assert.deepEqual(suppliers?.permissions, ['procurement:read', '*']);
    assert.deepEqual(purchaseOrders?.permissions, suppliers?.permissions);
    assert.equal(purchaseOrders?.label, 'Purchase Orders');
  });

  it('resolves a detail page back to its module', () => {
    const cases: Array<[string, NavModuleId | null]> = [
      ['/', 'dashboard'],
      ['/crm/some-customer', 'customers'],
      ['/finance/quotes/123', 'quotes'],
      ['/finance/invoices/123', 'invoices'],
      ['/procurement/purchase-orders/new', 'suppliers'],
      ['/aura/evolution', 'aura'],
      ['/security-monitoring', 'settings'],
      ['/nowhere-in-particular', null],
    ];
    for (const [href, expected] of cases) {
      assert.equal(resolveNavModuleForHref(href), expected, `${href} resolved to the wrong module`);
    }
  });

  it('never lists a module landing page as one of its own tools', () => {
    for (const moduleId of NAV_MODULE_ORDER) {
      const tools = selectModuleToolItems(OWNER_STAFF_NAV_ITEMS, moduleId);
      const primary = NAV_MODULE_PRIMARY_HREF[moduleId];
      assert.ok(!tools.some((tool) => tool.href === primary));
      const toolHrefs = tools.map((tool) => tool.href);
      assert.equal(new Set(toolHrefs).size, toolHrefs.length, `${moduleId} has duplicate tools`);
    }
  });

  it('shows a restricted role only the modules it may open', () => {
    // A staff member with jobs access only should see the Jobs module and no
    // finance, platform or settings landing pages.
    const jobsOnly = OWNER_STAFF_NAV_ITEMS.filter((item) =>
      item.permissions?.includes('jobs:read'),
    );
    const sidebar = selectPrimaryNavItems(jobsOnly);
    assert.ok(sidebar.some((item) => item.href === '/jobs'));
    assert.ok(!sidebar.some((item) => item.href === '/saas-management'));
    assert.ok(!sidebar.some((item) => item.href === '/settings/company'));
  });
});
