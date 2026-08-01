import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mobileHrefMatchesLocation,
  toAppAbsoluteHref,
  toMobileNestedHref,
} from './nested-routing.js';

describe('nested routing helpers', () => {
  it('escapes nest bases for app-absolute navigation', () => {
    assert.equal(toAppAbsoluteHref('/auth/login'), '~/auth/login');
    assert.equal(toAppAbsoluteHref('/'), '~/');
  });

  it('converts absolute mobile hrefs to nest-relative paths', () => {
    assert.equal(toMobileNestedHref('/mobile'), '/');
    assert.equal(toMobileNestedHref('/mobile/jobs'), '/jobs');
    assert.equal(toMobileNestedHref('/mobile/jobs/abc-123'), '/jobs/abc-123');
    assert.equal(mobileHrefMatchesLocation('/mobile/jobs', '/jobs'), true);
  });
});
