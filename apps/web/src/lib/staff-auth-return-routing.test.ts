import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getStaffHomePath } from '@titan/auth/browser';
import { toAppAbsoluteHref } from './nested-routing.js';
import {
  appendStaffAuthReturnQuery,
  clearStaffAuthReturnPath,
  consumeStaffAuthReturnPath,
  normalizeStaffAuthReturnPath,
  resolveStaffPostLoginPath,
  STAFF_AUTH_RETURN_QUERY,
} from './staff-auth-return-routing.js';
import { PLAIN_LOGIN_PATH } from './session-expiry-routing.js';

const ownerUser = {
  id: 'user-1',
  companyId: 'company-1',
  companyName: 'Acme',
  email: 'owner@example.com',
  firstName: 'Owner',
  lastName: 'User',
  roleId: 'role-1',
  roleName: 'Company Owner',
  permissions: ['*'],
};

describe('staff auth return routing', () => {
  it('accepts protected app paths and rejects auth loops', () => {
    assert.equal(normalizeStaffAuthReturnPath('/integrations/xero'), '/integrations/xero');
    assert.equal(normalizeStaffAuthReturnPath('/integrations/xero?xero=connected'), '/integrations/xero?xero=connected');
    assert.equal(normalizeStaffAuthReturnPath('/auth/login'), null);
    assert.equal(normalizeStaffAuthReturnPath('https://evil.test/phish'), null);
  });

  it('appends returnTo to login paths', () => {
    const path = appendStaffAuthReturnQuery(PLAIN_LOGIN_PATH, '/integrations/xero');
    assert.match(path, new RegExp(`${STAFF_AUTH_RETURN_QUERY}=`));
    assert.match(path, /integrations%2Fxero|integrations\/xero/);
  });

  it('resolves post-login destination from explicit return path', () => {
    assert.equal(
      resolveStaffPostLoginPath(ownerUser, '/integrations/xero'),
      '/integrations/xero',
    );
  });

  it('falls back to role home when return path is absent', () => {
    assert.equal(
      resolveStaffPostLoginPath(ownerUser, null),
      getStaffHomePath({ roleName: ownerUser.roleName, permissions: ownerUser.permissions }),
    );
  });

  it('lands Company Owner on TITAN Dashboard (/) when no intentional returnTo', () => {
    assert.equal(resolveStaffPostLoginPath(ownerUser, null), '/');
  });

  it('honours intentional OAuth / deep-link returnTo after login', () => {
    assert.equal(
      resolveStaffPostLoginPath(ownerUser, '/integrations/xero?xero=connected'),
      '/integrations/xero?xero=connected',
    );
  });

  it('exposes app-absolute login redirect with returnTo', () => {
    const href = toAppAbsoluteHref(
      appendStaffAuthReturnQuery(PLAIN_LOGIN_PATH, '/integrations/xero'),
    );
    assert.equal(href.startsWith('~/'), true);
    assert.match(href, /returnTo=/);
  });

  it('clears stored return path after consume', () => {
    const storage = new Map<string, string>();
    const original = globalThis.sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    try {
      appendStaffAuthReturnQuery(PLAIN_LOGIN_PATH, '/integrations');
      assert.equal(consumeStaffAuthReturnPath(), '/integrations');
      assert.equal(consumeStaffAuthReturnPath(), null);
    } finally {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: original,
      });
    }
  });

  it('clearStaffAuthReturnPath drops remembered deep links without consuming a value', () => {
    const storage = new Map<string, string>();
    const original = globalThis.sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    try {
      appendStaffAuthReturnQuery(PLAIN_LOGIN_PATH, '/leads');
      clearStaffAuthReturnPath();
      assert.equal(consumeStaffAuthReturnPath(), null);
      assert.equal(resolveStaffPostLoginPath(ownerUser, null), '/');
    } finally {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: original,
      });
    }
  });
});
