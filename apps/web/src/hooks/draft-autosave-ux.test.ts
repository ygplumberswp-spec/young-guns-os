import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDraftKey,
  draftContinueHref,
  isPurchaseOrderDraft,
  sanitizeDraftPayload,
} from '@titan/shared';

describe('M4 ASV-001 web draft UX contracts', () => {
  it('continues PO drafts to procurement create', () => {
    const href = draftContinueHref({
      recordType: 'other',
      recordId: null,
      id: 'draft-1',
      title: 'PO draft: Supplier',
      payload: { draftKind: 'purchase_order' },
    });
    assert.equal(href, '/procurement/purchase-orders/new?draftId=draft-1');
    assert.equal(
      isPurchaseOrderDraft({
        recordType: 'other',
        title: 'PO draft: Supplier',
        payload: { draftKind: 'purchase_order' },
      }),
      true,
    );
  });

  it('continues marketing drafts without auto-publish paths', () => {
    const href = draftContinueHref({
      recordType: 'marketing',
      recordId: null,
      id: 'm1',
      title: 'Audience',
    });
    assert.match(href, /marketing-intelligence/);
    assert.doesNotMatch(href, /publish|send|approve/);
  });

  it('keeps draft keys user-scoped', () => {
    assert.equal(
      buildDraftKey({ userId: 'tech-1', recordType: 'document' }).startsWith('tech-1:'),
      true,
    );
  });

  it('fails loudly by stripping secrets instead of persisting them', () => {
    const payload = sanitizeDraftPayload({ title: 'Doc', xeroClientSecret: 'nope' });
    assert.equal(payload.title, 'Doc');
    assert.equal('xeroClientSecret' in payload, false);
  });
});
