import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDraftKey,
  draftContinueHref,
  isPurchaseOrderDraft,
  sanitizeDraftPayload,
  selectSafeCustomerDraftRestore,
} from './drafts.js';

describe('buildDraftKey', () => {
  it('dedupes by user, type, and record id', () => {
    const key = buildDraftKey({
      userId: 'user-1',
      recordType: 'quote',
      recordId: 'rec-1',
    });
    assert.equal(key, 'user-1:quote:rec-1');
  });

  it('uses new for records without id', () => {
    assert.equal(buildDraftKey({ userId: 'u', recordType: 'job', recordId: null }), 'u:job:new');
  });

  it('isolates types and users', () => {
    const a = buildDraftKey({ userId: 'a', recordType: 'invoice' });
    const b = buildDraftKey({ userId: 'b', recordType: 'invoice' });
    const c = buildDraftKey({ userId: 'a', recordType: 'quote' });
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });
});

describe('draftContinueHref / PO / marketing', () => {
  it('routes marketing drafts to marketing intelligence', () => {
    assert.equal(
      draftContinueHref({ recordType: 'marketing', recordId: null, id: 'd1', title: 'Audience' }),
      '/marketing-intelligence?tab=reactivation&draftId=d1',
    );
  });

  it('routes purchase-order other drafts to PO create', () => {
    assert.equal(
      isPurchaseOrderDraft({
        recordType: 'other',
        title: 'PO draft: Acme',
        payload: { draftKind: 'purchase_order' },
      }),
      true,
    );
    assert.equal(
      draftContinueHref({
        recordType: 'other',
        recordId: null,
        id: 'd2',
        title: 'PO draft: Acme',
        payload: { draftKind: 'purchase_order' },
      }),
      '/procurement/purchase-orders/new?draftId=d2',
    );
  });
});

describe('sanitizeDraftPayload', () => {
  it('strips secrets and binary blobs', () => {
    const clean = sanitizeDraftPayload({
      title: 'Doc',
      apiKey: 'secret',
      xeroClientSecret: 'nope',
      fileBase64: 'AAAA',
      nested: { accessToken: 'tok', notes: 'ok' },
    });
    assert.equal(clean.title, 'Doc');
    assert.equal('apiKey' in clean, false);
    assert.equal('xeroClientSecret' in clean, false);
    assert.equal('fileBase64' in clean, false);
    assert.deepEqual(clean.nested, { notes: 'ok' });
  });
});

describe('selectSafeCustomerDraftRestore', () => {
  it('does not silently overwrite verified email/phone', () => {
    const result = selectSafeCustomerDraftRestore({
      draft: { name: 'New', email: 'draft@example.com', phone: '0821111111', notes: 'n' },
      current: {
        name: 'Old',
        email: 'verified@example.com',
        phone: '0822222222',
        status: 'active',
        notes: null,
      },
      verifiedEmail: true,
      verifiedPhone: true,
    });
    assert.equal(result.name, 'New');
    assert.equal(result.notes, 'n');
    assert.equal(result.email, undefined);
    assert.equal(result.phone, undefined);
    assert.deepEqual(result.skippedVerified, ['email', 'phone']);
  });

  it('allows contact restore when not verified', () => {
    const result = selectSafeCustomerDraftRestore({
      draft: { email: 'draft@example.com' },
      current: { name: 'A', email: null, phone: null, status: 'active', notes: null },
      verifiedEmail: false,
    });
    assert.equal(result.email, 'draft@example.com');
    assert.deepEqual(result.skippedVerified, []);
  });
});
