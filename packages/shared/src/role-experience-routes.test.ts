import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNTANT_ALLOWED_HREFS,
  ACCOUNTANT_BLOCKED_ROUTE_PREFIXES,
  DISPATCHER_ALLOWED_HREFS,
  DISPATCHER_BLOCKED_ROUTE_PREFIXES,
  NAV_MODULE_ORDER,
  OWNER_ONLY_ROUTE_PREFIXES,
  OWNER_STAFF_NAV_ITEMS,
  selectModuleToolItems,
  selectPrimaryNavItems,
} from './role-experience.js';

function isBlocked(prefixes: string[], path: string): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

describe('technician route protection', () => {
  it('blocks technicians from operational owner modules', () => {
    for (const prefix of [
      '/jobs',
      '/communications',
      '/documents',
      '/dispatch',
      '/technician-intelligence',
      '/workflow-automation',
    ]) {
      assert.equal(isBlocked(OWNER_ONLY_ROUTE_PREFIXES, prefix), true, `expected ${prefix}`);
    }
  });
});

describe('dispatcher and accountant route boundaries', () => {
  it('blocks dispatcher from AI, SaaS and integrations', () => {
    for (const path of ['/aura', '/saas-management', '/integrations', '/analytics']) {
      assert.equal(isBlocked(DISPATCHER_BLOCKED_ROUTE_PREFIXES, path), true, path);
    }
  });

  it('blocks accountant from dispatch, staff manage and Owner AI', () => {
    for (const path of ['/scheduling', '/aura', '/settings/team', '/fleet', '/leads']) {
      assert.equal(isBlocked(ACCOUNTANT_BLOCKED_ROUTE_PREFIXES, path), true, path);
    }
  });
});

describe('consolidated navigation per role', () => {
  function navFor(allowed: ReadonlySet<string>) {
    const items = OWNER_STAFF_NAV_ITEMS.filter((item) => allowed.has(item.href));
    const sidebar = selectPrimaryNavItems(items);
    const tools = NAV_MODULE_ORDER.flatMap((moduleId) => selectModuleToolItems(items, moduleId));
    return { items, sidebar, tools };
  }

  it('gives the dispatcher a consolidated sidebar with nothing out of reach', () => {
    const { items, sidebar, tools } = navFor(DISPATCHER_ALLOWED_HREFS);
    const reachable = new Set([...sidebar, ...tools].map((item) => item.href));
    for (const item of items) {
      assert.ok(reachable.has(item.href), `dispatcher cannot reach ${item.href}`);
    }
    assert.ok(sidebar.length > 0 && sidebar.length < items.length);
    assert.ok(sidebar.some((item) => item.href === '/scheduling'));
    // Live Dispatch moved inside Schedule rather than disappearing.
    assert.ok(tools.every((item) => !sidebar.includes(item)));
  });

  it('gives the accountant a consolidated sidebar with nothing out of reach', () => {
    const { items, sidebar, tools } = navFor(ACCOUNTANT_ALLOWED_HREFS);
    const reachable = new Set([...sidebar, ...tools].map((item) => item.href));
    for (const item of items) {
      assert.ok(reachable.has(item.href), `accountant cannot reach ${item.href}`);
    }
    for (const href of ['/finance/quotes', '/finance/invoices', '/finance/payments']) {
      assert.ok(sidebar.some((item) => item.href === href), `accountant lost ${href}`);
    }
    assert.equal(sidebar.some((item) => item.href === '/scheduling'), false);
  });

  it('keeps diagnostics and platform tooling out of the main sidebar', () => {
    const sidebar = selectPrimaryNavItems(OWNER_STAFF_NAV_ITEMS).map((item) => item.href);
    for (const href of [
      '/platform-health',
      '/release-center',
      '/saas-management',
      '/enterprise-modules',
      '/security-monitoring',
    ]) {
      assert.ok(!sidebar.includes(href), `${href} should sit inside Settings, not the sidebar`);
    }
    // Still reachable for the roles that are allowed to open them.
    const settingsTools = selectModuleToolItems(OWNER_STAFF_NAV_ITEMS, 'settings').map(
      (item) => item.href,
    );
    for (const href of ['/platform-health', '/release-center', '/saas-management']) {
      assert.ok(settingsTools.includes(href), `${href} must remain reachable`);
    }
  });
});
