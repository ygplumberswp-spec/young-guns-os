import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateJobTitle, JOB_TYPE_OPTIONS } from '@titan/shared';

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
});
