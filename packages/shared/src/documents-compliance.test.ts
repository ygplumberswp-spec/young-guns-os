import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLIANCE_WORKSPACE_QUEUE_OPTIONS,
  isCocLikeDocument,
  jobTypeSuggestsCocRequired,
} from './documents-compliance.js';

test('isCocLikeDocument classifies COC filenames', () => {
  assert.equal(isCocLikeDocument('Electrical COC', 'coc-final.pdf'), true);
  assert.equal(isCocLikeDocument('Job photo', 'before.jpg'), false);
});

test('jobTypeSuggestsCocRequired flags gas and electrical work', () => {
  assert.equal(jobTypeSuggestsCocRequired('Gas geyser install'), true);
  assert.equal(jobTypeSuggestsCocRequired('Blocked drain'), false);
});

test('COMPLIANCE_WORKSPACE_QUEUE_OPTIONS covers Phase 11 queues', () => {
  assert.equal(COMPLIANCE_WORKSPACE_QUEUE_OPTIONS.length, 11);
});
