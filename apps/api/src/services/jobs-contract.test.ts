import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatJobNumber,
  generateJobTitle,
  isPlaceholderEmail,
  isValidSaMobile,
  normalizeSaMobile,
  requireJobAddress,
} from '@titan/shared';

/**
 * Service-level contract assertions that do not require a live database.
 * Disposable migration + allocation coverage lives in packages/db/scripts/test-0095-*.
 */
describe('UX-A job create contract', () => {
  it('requires property/address before create can succeed', () => {
    assert.throws(() => requireJobAddress({ street: 'Only street' }), /required/i);
  });

  it('auto title does not use a free-text Title field', () => {
    const title = generateJobTitle({
      jobType: 'Leak detection',
      suburb: 'Observatory',
      customerOrSiteContactName: 'Site Agent',
    });
    assert.match(title, /^Leak detection — Observatory — Site Agent$/);
  });

  it('normalises site contact mobiles', () => {
    assert.equal(normalizeSaMobile('082 123 4567'), '+27821234567');
    assert.equal(isValidSaMobile('0821234567'), true);
  });

  it('detects placeholder emails for verification flags', () => {
    assert.equal(isPlaceholderEmail('noreply@youngguns.co.za'), true);
  });

  it('allocates padded job numbers', () => {
    assert.equal(formatJobNumber(7), 'JOB-000007');
  });
});
