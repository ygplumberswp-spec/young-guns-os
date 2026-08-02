import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditJobDocumentPack,
  canSendJobDocumentPack,
  inferPackItemTypeFromDocument,
  nextJobDocumentPackApprovalAction,
  portalAccessTypeForPackItem,
} from './job-document-pack.js';

test('job document pack approval workflow transitions', () => {
  assert.deepEqual(nextJobDocumentPackApprovalAction('draft'), {
    label: 'Submit For Internal Review',
    nextStatus: 'internal_review',
  });
  assert.deepEqual(nextJobDocumentPackApprovalAction('internal_review'), {
    label: 'Approve For Sending',
    nextStatus: 'approved_for_sending',
  });
  assert.equal(nextJobDocumentPackApprovalAction('approved_for_sending'), null);
});

test('canSendJobDocumentPack requires approved_for_sending', () => {
  assert.equal(canSendJobDocumentPack({ status: 'approved_for_sending' }), true);
  assert.equal(canSendJobDocumentPack({ status: 'draft' }), false);
  assert.equal(canSendJobDocumentPack({ status: 'sent' }), false);
});

test('canEditJobDocumentPack blocks sent and cancelled packs', () => {
  assert.equal(canEditJobDocumentPack({ status: 'draft' }), true);
  assert.equal(canEditJobDocumentPack({ status: 'sent' }), false);
  assert.equal(canEditJobDocumentPack({ status: 'cancelled' }), false);
});

test('inferPackItemTypeFromDocument classifies COC and invoice filenames', () => {
  assert.equal(
    inferPackItemTypeFromDocument({ title: 'Electrical COC', fileName: 'coc-final.pdf' }),
    'certificate',
  );
  assert.equal(
    inferPackItemTypeFromDocument({ title: 'Compliance report', fileName: 'report.pdf' }),
    'compliance_report',
  );
  assert.equal(
    inferPackItemTypeFromDocument({ title: 'Tax invoice', fileName: 'inv-001.pdf' }),
    'invoice',
  );
});

test('portalAccessTypeForPackItem maps item types to portal access types', () => {
  assert.equal(portalAccessTypeForPackItem('invoice'), 'invoice');
  assert.equal(portalAccessTypeForPackItem('certificate'), 'certificate');
  assert.equal(portalAccessTypeForPackItem('photo_evidence'), 'job_card');
});
