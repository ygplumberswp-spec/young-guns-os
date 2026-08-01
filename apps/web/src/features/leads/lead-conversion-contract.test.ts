import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLeadConversionProperty, leadHasConvertibleSiteAddress } from './utils';

describe('lead → job conversion address handoff', () => {
  it('requires real street and suburb before property/job create', () => {
    assert.equal(leadHasConvertibleSiteAddress({ street: null, suburb: 'Sea Point' }), false);
    assert.equal(leadHasConvertibleSiteAddress({ street: '1 Beach Rd', suburb: '' }), false);
    assert.equal(
      leadHasConvertibleSiteAddress({ street: '1 Beach Rd', suburb: 'Sea Point' }),
      true,
    );
  });

  it('maps lead site fields onto conversion property without placeholder inventing', () => {
    assert.equal(buildLeadConversionProperty({ street: null, suburb: null }), null);
    assert.deepEqual(
      buildLeadConversionProperty({
        street: '1 Beach Rd',
        suburb: 'Sea Point',
        city: null,
        province: null,
        postalCode: null,
        unit: 'Unit 2',
      }),
      {
        street: '1 Beach Rd',
        suburb: 'Sea Point',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '0000',
        unit: 'Unit 2',
      },
    );
  });
});
