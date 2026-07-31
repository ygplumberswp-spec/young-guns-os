import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateJobTitle, JOB_TYPE_OPTIONS } from '@titan/shared';
import {
  documentInputFromFile,
  JOB_DOCUMENT_ACCEPT,
  titleFromFileName,
} from './job-document-attach';

describe('responsive New Job form contract', () => {
  it('exposes Young Guns job types for the create form', () => {
    assert.ok(JOB_TYPE_OPTIONS.includes('Blocked drain'));
    assert.ok(JOB_TYPE_OPTIONS.includes('Emergency call-out'));
  });

  it('preview title matches operational handoff pattern', () => {
    const preview = generateJobTitle({
      jobType: 'Blocked drain',
      suburb: 'Sea Point',
      street: '1 Beach Rd',
      customerOrSiteContactName: 'Managing Agent',
    });
    assert.equal(preview, 'Blocked drain — Sea Point — Managing Agent');
  });

  it('accepts images and documents in the file picker', () => {
    assert.match(JOB_DOCUMENT_ACCEPT, /image\/\*/);
    assert.match(JOB_DOCUMENT_ACCEPT, /\.pdf/);
  });

  it('maps blocked-drain.jpg selection onto documents-system metadata', () => {
    const file = new File([Uint8Array.from([0xff, 0xd8, 0xff])], 'blocked-drain.jpg', {
      type: 'image/jpeg',
    });
    const doc = documentInputFromFile(file);
    assert.equal(doc.fileName, 'blocked-drain.jpg');
    assert.equal(doc.title, 'blocked drain');
    assert.equal(doc.fileType, 'image/jpeg');
    assert.equal(doc.fileSizeBytes, 3);
    assert.equal(titleFromFileName('blocked-drain.jpg'), 'blocked drain');
  });
});
