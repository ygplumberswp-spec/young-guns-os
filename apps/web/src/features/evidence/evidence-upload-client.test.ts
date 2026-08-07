import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_UPLOAD_HARD_BATCH_CEILING,
} from '@titan/shared';
import {
  buildEvidenceUploadRequest,
  clampEvidenceBatch,
  normaliseEvidenceMimeType,
  validateEvidenceClientFile,
} from './evidence-upload-client.js';

describe('evidence upload client helpers', () => {
  it('allows gallery batches of 50+ and clamps only at hard ceiling', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }));
    assert.equal(clampEvidenceBatch(fifty).accepted.length, 50);
    assert.equal(clampEvidenceBatch(fifty).truncated, 0);

    const over = Array.from(
      { length: EVIDENCE_UPLOAD_HARD_BATCH_CEILING + 5 },
      (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }),
    );
    const clamped = clampEvidenceBatch(over);
    assert.equal(clamped.accepted.length, EVIDENCE_UPLOAD_HARD_BATCH_CEILING);
    assert.equal(clamped.truncated, 5);
  });

  it('builds upload payloads that never request client visibility', () => {
    const file = new File(['abc'], 'slip.pdf', { type: 'application/pdf' });
    const payload = buildEvidenceUploadRequest({
      file,
      dataBase64: 'YWJj',
      category: 'supplier_slip',
      clientActionId: 'evidence-test-1',
      uploadSource: 'file',
    });
    assert.equal(payload.clientVisible, false);
    assert.equal(payload.attachmentCategory, 'supplier_slip');
    assert.equal(payload.clientActionId, 'evidence-test-1');
    assert.equal(payload.metadata?.clientVisible, false);
  });

  it('validates mime types and normalises extensions', () => {
    const pdf = new File(['x'], 'a.pdf', { type: '' });
    assert.equal(normaliseEvidenceMimeType(pdf), 'application/pdf');
    assert.match(
      validateEvidenceClientFile(new File(['x'], 'a.zip', { type: 'application/zip' })) ?? '',
      /JPG|PNG|PDF/i,
    );
  });
});
