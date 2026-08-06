import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJobCreateHref } from './build-job-create-href';

test('buildJobCreateHref returns bare path when no params', () => {
  assert.equal(buildJobCreateHref(), '/jobs/new');
});

test('buildJobCreateHref encodes customer, property, mobile, and source', () => {
  const href = buildJobCreateHref({
    customerId: 'cust-1',
    propertyId: 'prop-2',
    siteContactMobile: '+27825551234',
    from: 'dispatch-intelligence',
  });
  assert.equal(
    href,
    '/jobs/new?customerId=cust-1&propertyId=prop-2&siteContactMobile=%2B27825551234&from=dispatch-intelligence',
  );
});

test('buildJobCreateHref skips nullish fields', () => {
  assert.equal(
    buildJobCreateHref({ customerId: 'cust-1', propertyId: null, siteContactMobile: undefined }),
    '/jobs/new?customerId=cust-1',
  );
});
