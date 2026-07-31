import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAddressMapsDeepLink,
  formatMapsEtaCapabilityLabel,
  isSuburbInServiceArea,
  resolveCocApplicabilityForJobType,
  DEFAULT_YG_SERVICE_GEOGRAPHY,
} from './young-guns-ops.js';

describe('young-guns-ops (UX-I)', () => {
  it('builds address deep-links without inventing coordinates', () => {
    const link = buildAddressMapsDeepLink('12 Main Rd, Observatory, Cape Town');
    assert.ok(link?.includes('Observatory'));
    assert.equal(buildAddressMapsDeepLink('  '), null);
  });

  it('labels maps capability honestly', () => {
    assert.match(formatMapsEtaCapabilityLabel('not_implemented'), /NOT IMPLEMENTED/i);
    assert.match(formatMapsEtaCapabilityLabel('schedule_only'), /SCHEDULE ONLY/i);
  });

  it('resolves COC applicability for gas/geyser work', () => {
    assert.equal(resolveCocApplicabilityForJobType('Gas geyser install'), 'required_for_gas_work');
    assert.equal(resolveCocApplicabilityForJobType('Blocked drain'), 'may_apply');
  });

  it('matches Cape Town service suburbs', () => {
    assert.equal(isSuburbInServiceArea('Observatory', DEFAULT_YG_SERVICE_GEOGRAPHY), true);
    assert.equal(isSuburbInServiceArea('Sandton', DEFAULT_YG_SERVICE_GEOGRAPHY), false);
  });
});
