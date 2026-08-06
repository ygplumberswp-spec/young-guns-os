import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDraftKey,
  permissionsForDraftType,
  sanitizeDraftPayload,
  selectSafeCustomerDraftRestore,
} from '@titan/shared';

describe('M4 ASV-001 draft autosave contracts', () => {
  it('scopes draft keys per user and record', () => {
    assert.equal(
      buildDraftKey({ userId: 'u1', recordType: 'customer', recordId: null }),
      'u1:customer:new',
    );
    assert.notEqual(
      buildDraftKey({ userId: 'u1', recordType: 'customer' }),
      buildDraftKey({ userId: 'u2', recordType: 'customer' }),
    );
  });

  it('never stores secrets or binary blobs in draft payloads', () => {
    const clean = sanitizeDraftPayload({
      notes: 'ok',
      apiKey: 'x',
      refresh_token: 'y',
      fileBase64: 'AAAA',
    });
    assert.deepEqual(clean, { notes: 'ok' });
  });

  it('blocks silent overwrite of verified customer contacts', () => {
    const result = selectSafeCustomerDraftRestore({
      draft: { email: 'new@example.com', phone: '0820000000', notes: 'n' },
      current: {
        name: 'A',
        email: 'old@example.com',
        phone: '0821111111',
        status: 'active',
        notes: null,
      },
      verifiedEmail: true,
      verifiedPhone: true,
    });
    assert.equal(result.email, undefined);
    assert.equal(result.phone, undefined);
    assert.equal(result.notes, 'n');
  });

  it('maps RBAC permission sets for M4 draft types', () => {
    assert.ok(permissionsForDraftType('customer').includes('customers:write'));
    assert.ok(permissionsForDraftType('document').includes('documents:write'));
    assert.ok(permissionsForDraftType('marketing').includes('marketing:write'));
    assert.ok(permissionsForDraftType('other').includes('procurement:write'));
  });
});
