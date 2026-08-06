import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertDiscoverySessionBinding,
  FACEBOOK_PAGE_DISCOVERY_SESSION_TTL_MS,
  resolveSelectableRowFromDiscoverySession,
} from './facebook-page-discovery-session.js';

const NOW = new Date('2026-08-06T06:00:00.000Z');

function payload(overrides: Partial<import('./facebook-page-discovery-session.js').FacebookPageDiscoverySessionPayload> = {}) {
  return {
    version: 1 as const,
    sessionId: 'sess-1',
    companyId: 'company-1',
    userId: 'user-1',
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + FACEBOOK_PAGE_DISCOVERY_SESSION_TTL_MS).toISOString(),
    configuredAppId: 'app-1',
    tokenAppId: 'app-1',
    tokenValid: true,
    rows: [
      {
        id: '394603137072407',
        name: 'Young Guns Plumbing - Cape Town',
        accessToken: 'page-token',
        category: null,
        source: 'me_accounts' as const,
      },
    ],
    ...overrides,
  };
}

describe('facebook page discovery session (J-6.7F11)', () => {
  it('binds session to company and user', () => {
    const bound = assertDiscoverySessionBinding({
      payload: payload(),
      companyId: 'company-1',
      userId: 'user-1',
      now: NOW,
    });
    assert.equal(bound.ok, true);

    const wrongCompany = assertDiscoverySessionBinding({
      payload: payload(),
      companyId: 'other-company',
      userId: 'user-1',
      now: NOW,
    });
    assert.equal(wrongCompany.ok, false);
  });

  it('rejects expired discovery session', () => {
    const result = assertDiscoverySessionBinding({
      payload: payload({ expiresAt: '2026-08-06T05:00:00.000Z' }),
      companyId: 'company-1',
      userId: 'user-1',
      now: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'Page selection expired. Choose Page again.');
  });

  it('resolves selectable row without Page-object verification', () => {
    const result = resolveSelectableRowFromDiscoverySession({
      payload: payload(),
      pageId: '394603137072407',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.row.name, 'Young Guns Plumbing - Cape Town');
      assert.equal(result.row.accessToken, 'page-token');
    }
  });

  it('rejects arbitrary Page ids not in session rows', () => {
    const result = resolveSelectableRowFromDiscoverySession({
      payload: payload(),
      pageId: '999999',
    });
    assert.equal(result.ok, false);
  });

  it('rejects rows missing Page access token', () => {
    const result = resolveSelectableRowFromDiscoverySession({
      payload: payload({
        rows: [
          {
            id: '111',
            name: 'No Token Page',
            accessToken: '',
            category: null,
            source: 'me_accounts',
          },
        ],
      }),
      pageId: '111',
    });
    assert.equal(result.ok, false);
  });
});
