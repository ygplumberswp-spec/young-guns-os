import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNTANT_BLOCKED_ROUTE_PREFIXES,
  DISPATCHER_ALLOWED_HREFS,
  DISPATCHER_BLOCKED_ROUTE_PREFIXES,
  isExperienceAllowedHref,
  isPathInAllowedHrefSet,
  OWNER_ONLY_ROUTE_PREFIXES,
} from './role-experience.js';

function isBlocked(prefixes: string[], path: string): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

describe('technician route protection', () => {
  it('blocks technicians from operational owner modules', () => {
    for (const prefix of ['/jobs', '/communications', '/documents', '/dispatch']) {
      assert.equal(isBlocked(OWNER_ONLY_ROUTE_PREFIXES, prefix), true, `expected ${prefix}`);
    }
  });
});

describe('dispatcher and accountant route boundaries', () => {
  it('blocks dispatcher from receivables outside allowed href set', () => {
    assert.equal(isExperienceAllowedHref('dispatcher', '/finance/receivables'), false);
    assert.equal(isExperienceAllowedHref('dispatcher', '/finance/invoices'), true);
    assert.equal(isExperienceAllowedHref('dispatcher', '/finance/invoices/abc'), true);
  });

  it('allows accountant receivables via allowed href set', () => {
    assert.equal(isExperienceAllowedHref('accountant', '/finance/receivables'), true);
  });

  it('matches nested paths under allowed hrefs', () => {
    assert.equal(isPathInAllowedHrefSet('/finance/quotes/1', DISPATCHER_ALLOWED_HREFS), true);
    assert.equal(isPathInAllowedHrefSet('/finance/receivables', DISPATCHER_ALLOWED_HREFS), false);
  });

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
