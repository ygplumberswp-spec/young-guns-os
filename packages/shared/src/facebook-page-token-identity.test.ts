import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertClientPageIdInMetaDiscovery,
  assertFacebookPageIdentityAgreement,
  sanitizeFacebookPageIdentityAgreement,
} from './facebook-page-token-identity.js';

describe('facebook page token identity (J-6.7F10)', () => {
  it('requires /me/accounts and Page-token /me ids to match', () => {
    const ok = assertFacebookPageIdentityAgreement({
      accountsPageId: '394603137072407',
      accountsPageName: 'Young Guns Plumbing - Cape Town',
      tokenMePageId: '394603137072407',
      tokenMePageName: 'Young Guns Plumbing - Cape Town',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.agreement.idsMatch, true);
  });

  it('rejects token/Page id mismatch', () => {
    const result = assertFacebookPageIdentityAgreement({
      accountsPageId: '394603137072407',
      accountsPageName: 'Young Guns Plumbing - Cape Town',
      tokenMePageId: '61564442420962',
      tokenMePageName: 'Young Guns Plumbing – Cape Town',
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /does not match the Page-token identity id/);
  });

  it('rejects arbitrary client Page id not in Meta discovery', () => {
    const result = assertClientPageIdInMetaDiscovery({
      clientPageId: '61564442420962',
      listedPageIds: ['394603137072407'],
    });
    assert.equal(result.allowed, false);
  });

  it('sanitized agreement masks ids and omits tokens', () => {
    const sanitized = sanitizeFacebookPageIdentityAgreement({
      accountsPageId: '394603137072407',
      accountsPageName: 'Young Guns Plumbing - Cape Town',
      tokenMePageId: '394603137072407',
      tokenMePageName: 'Young Guns Plumbing - Cape Town',
      idsMatch: true,
      namesMatch: true,
    });
    assert.equal(sanitized.accountsPageIdMasked, '···072407');
    assert.equal(JSON.stringify(sanitized).includes('access_token'), false);
  });
});
