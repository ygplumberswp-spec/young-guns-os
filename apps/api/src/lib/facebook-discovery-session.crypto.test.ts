import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  issueFacebookPageDiscoverySessionToken,
  parseFacebookPageDiscoverySessionToken,
} from './facebook-discovery-session.crypto.js';

const KEY = 'test-encryption-key-not-used-in-production';

describe('facebook discovery session crypto (J-6.7F11)', () => {
  it('round-trips encrypted discovery session without exposing tokens in token string structure', () => {
    const issued = issueFacebookPageDiscoverySessionToken({
      encryptionKey: KEY,
      payload: {
        companyId: 'company-1',
        userId: 'user-1',
        issuedAt: '2026-08-06T06:00:00.000Z',
        expiresAt: '2026-08-06T06:15:00.000Z',
        configuredAppId: 'app-1',
        tokenAppId: 'app-1',
        tokenValid: true,
        rows: [
          {
            id: '394603137072407',
            name: 'Young Guns Plumbing - Cape Town',
            accessToken: 'secret-page-token',
            category: null,
            source: 'me_accounts',
          },
        ],
      },
    });

    assert.equal(issued.token.includes('secret-page-token'), false);
    const parsed = parseFacebookPageDiscoverySessionToken(issued.token, KEY);
    assert.equal(parsed.rows[0]?.accessToken, 'secret-page-token');
  });
});
