import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatJobNumber, generateJobTitle, requireJobAddress } from './job-contract.js';

describe('job contract helpers', () => {
  it('formats tenant job numbers', () => {
    assert.equal(formatJobNumber(1), 'JOB-000001');
    assert.equal(formatJobNumber(42), 'JOB-000042');
    assert.throws(() => formatJobNumber(0));
  });

  it('generates operational titles', () => {
    assert.equal(
      generateJobTitle({
        jobType: 'Blocked drain',
        suburb: 'Rondebosch',
        street: '12 Main Rd',
        customerOrSiteContactName: 'Thabo Dlamini',
      }),
      'Blocked drain — Rondebosch — Thabo Dlamini',
    );
  });

  it('requires complete address fields', () => {
    assert.throws(() => requireJobAddress({ street: '12 Main' }), /required/i);
    const address = requireJobAddress({
      street: '12 Main Rd',
      suburb: 'Rondebosch',
      city: 'Cape Town',
      province: 'Western Cape',
      postalCode: '7700',
      unit: '3',
    });
    assert.equal(address.unit, '3');
    assert.equal(address.suburb, 'Rondebosch');
  });

  it('supports managing-agent naming in title', () => {
    assert.equal(
      generateJobTitle({
        jobType: 'Geyser repair',
        suburb: 'Claremont',
        customerOrSiteContactName: 'Acme Body Corporate',
      }),
      'Geyser repair — Claremont — Acme Body Corporate',
    );
  });
});
