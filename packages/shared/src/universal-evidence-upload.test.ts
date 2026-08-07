import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_UPLOAD_HARD_BATCH_CEILING,
  EVIDENCE_UPLOAD_RECOMMENDED_BATCH_SIZE,
  defaultClientVisibleForCategory,
  evidenceUploadProgressLabel,
  isAttachmentVisibleToClient,
  isInternalEvidenceCategory,
  mapPhaseToAttachmentCategory,
  validateEvidenceUploadFile,
} from './universal-evidence-upload.js';

describe('universal evidence upload', () => {
  it('never defaults internal slips/receipts to client-visible', () => {
    assert.equal(defaultClientVisibleForCategory('supplier_slip'), false);
    assert.equal(defaultClientVisibleForCategory('receipt'), false);
    assert.equal(isInternalEvidenceCategory('supplier_slip'), true);
    assert.equal(isInternalEvidenceCategory('before_photo'), false);
    assert.equal(isAttachmentVisibleToClient({ clientVisible: false }), false);
    assert.equal(isAttachmentVisibleToClient({ clientVisible: null }), false);
    assert.equal(isAttachmentVisibleToClient({ clientVisible: true }), true);
  });

  it('allows large gallery batches (50+)', () => {
    assert.ok(EVIDENCE_UPLOAD_RECOMMENDED_BATCH_SIZE >= 50);
    assert.ok(EVIDENCE_UPLOAD_HARD_BATCH_CEILING >= 50);
  });

  it('validates approved image/PDF types and sizes', () => {
    assert.equal(validateEvidenceUploadFile({ mimeType: 'image/jpeg', sizeBytes: 1024 }).ok, true);
    assert.equal(validateEvidenceUploadFile({ mimeType: 'application/pdf', sizeBytes: 2048 }).ok, true);
    assert.equal(validateEvidenceUploadFile({ mimeType: 'application/zip', sizeBytes: 1024 }).ok, false);
  });

  it('maps evidence phases and formats progress labels', () => {
    assert.equal(mapPhaseToAttachmentCategory('before'), 'before_photo');
    assert.equal(mapPhaseToAttachmentCategory('document'), 'other_job_evidence');
    assert.match(
      evidenceUploadProgressLabel({ completed: 3, total: 50, currentFileName: 'a.jpg' }),
      /3\/50/,
    );
    assert.match(
      evidenceUploadProgressLabel({ completed: 1, total: 2, status: 'pending_sync' }),
      /PENDING SYNC/,
    );
  });
});
