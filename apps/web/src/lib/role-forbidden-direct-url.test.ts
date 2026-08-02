import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNTANT_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  DISPATCHER_ROLE_NAME,
  TECHNICIAN_ROLE_NAME,
} from '@titan/auth/browser';
import {
  evaluateOwnerStaffDirectUrl,
  evaluateTechnicianDirectUrl,
  isAccountantBlockedPath,
  isDispatcherBlockedPath,
  isOwnerOnlyPath,
  isTechnicianAllowedPath,
} from './role-forbidden-direct-url.js';

const technician = {
  roleName: TECHNICIAN_ROLE_NAME,
  permissions: ['mobile:read', 'mobile:write', 'jobs:read', 'jobs:write'],
};

const accountant = {
  roleName: ACCOUNTANT_ROLE_NAME,
  permissions: ['finance:read', 'finance:write', 'customers:read'],
};

const dispatcher = {
  roleName: DISPATCHER_ROLE_NAME,
  permissions: ['customers:read', 'jobs:read', 'dispatch:read'],
};

const companyOwner = {
  roleName: COMPANY_OWNER_ROLE_NAME,
  permissions: ['*'],
};

describe('role-forbidden direct URL path prefixes', () => {
  it('treats owner-only prefixes and nested paths as blocked for technicians', () => {
    for (const path of ['/crm', '/finance/invoices', '/scheduling', '/aura/agents']) {
      assert.equal(isOwnerOnlyPath(path), true, path);
    }
    assert.equal(isOwnerOnlyPath('/mobile/jobs'), false);
  });

  it('allows technician mobile and auth prefixes only', () => {
    for (const path of ['/mobile', '/mobile/jobs', '/auth/login']) {
      assert.equal(isTechnicianAllowedPath(path), true, path);
    }
    assert.equal(isTechnicianAllowedPath('/crm'), false);
  });

  it('blocks dispatcher from platform admin and owner AI prefixes', () => {
    for (const path of ['/aura', '/saas-management', '/integrations', '/analytics']) {
      assert.equal(isDispatcherBlockedPath(path), true, path);
    }
    assert.equal(isDispatcherBlockedPath('/jobs'), false);
  });

  it('blocks accountant from dispatch, staff manage and owner AI prefixes', () => {
    for (const path of ['/scheduling', '/aura', '/settings/team', '/fleet', '/leads']) {
      assert.equal(isAccountantBlockedPath(path), true, path);
    }
    assert.equal(isAccountantBlockedPath('/finance/invoices'), false);
  });
});

describe('evaluateOwnerStaffDirectUrl (forbidden direct URL browser contract)', () => {
  it('redirects technician away from owner dashboard and guessed owner modules', () => {
    for (const path of ['/', '/finance/invoices', '/crm/customers', '/scheduling']) {
      const decision = evaluateOwnerStaffDirectUrl(technician, path);
      assert.equal(decision.allowed, false);
      if (!decision.allowed) {
        assert.equal(decision.redirectPath, '/mobile');
      }
    }
  });

  it('allows technician owner-staff guard to pass through mobile paths (TechnicianRoute owns /mobile)', () => {
    assert.equal(evaluateOwnerStaffDirectUrl(technician, '/mobile/jobs').allowed, true);
  });

  it('redirects accountant away from scheduling URL guesses to finance home', () => {
    const decision = evaluateOwnerStaffDirectUrl(accountant, '/scheduling');
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.redirectPath, '/finance/invoices');
    }
  });

  it('allows accountant finance modules via direct URL', () => {
    assert.equal(evaluateOwnerStaffDirectUrl(accountant, '/finance/invoices').allowed, true);
    assert.equal(evaluateOwnerStaffDirectUrl(accountant, '/finance/payments').allowed, true);
  });

  it('redirects dispatcher away from owner AI and platform admin URL guesses', () => {
    for (const path of ['/aura', '/saas-management', '/integrations']) {
      const decision = evaluateOwnerStaffDirectUrl(dispatcher, path);
      assert.equal(decision.allowed, false);
      if (!decision.allowed) {
        assert.equal(decision.redirectPath, '/');
      }
    }
  });

  it('allows dispatcher operational modules via direct URL', () => {
    for (const path of ['/', '/jobs', '/scheduling', '/crm', '/finance/invoices']) {
      assert.equal(evaluateOwnerStaffDirectUrl(dispatcher, path).allowed, true, path);
    }
  });

  it('redirects dispatcher away from executive finance URL guesses', () => {
    for (const path of ['/finance/receivables', '/finance/payables', '/finance/cashflow']) {
      const decision = evaluateOwnerStaffDirectUrl(dispatcher, path);
      assert.equal(decision.allowed, false, path);
      if (!decision.allowed) {
        assert.equal(decision.redirectPath, '/');
      }
    }
  });

  it('allows company owner direct URL access to owner modules', () => {
    for (const path of ['/', '/crm', '/finance/invoices', '/aura', '/settings/team']) {
      assert.equal(evaluateOwnerStaffDirectUrl(companyOwner, path).allowed, true, path);
    }
  });
});

describe('evaluateTechnicianDirectUrl (mobile URL guess contract)', () => {
  it('allows technician direct access to mobile routes', () => {
    for (const path of ['/mobile', '/mobile/jobs', '/mobile/sync']) {
      assert.equal(evaluateTechnicianDirectUrl(technician, path).allowed, true, path);
    }
  });

  it('redirects accountant away from mobile URL guesses', () => {
    const decision = evaluateTechnicianDirectUrl(accountant, '/mobile/jobs');
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.redirectPath, '/');
    }
  });

  it('allows company owner to open mobile routes for support', () => {
    assert.equal(evaluateTechnicianDirectUrl(companyOwner, '/mobile/jobs').allowed, true);
  });
});
