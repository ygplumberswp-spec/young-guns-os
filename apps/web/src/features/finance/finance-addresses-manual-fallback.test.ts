import test from 'node:test';
import assert from 'node:assert/strict';
import { addressesToApiPayload } from './finance-editor-utils.js';

test('manual address text survives API payload when Maps is unavailable', () => {
  const payload = addressesToApiPayload({
    billingAddress: '12 Main Rd, Observatory, Cape Town',
    siteAddress: '12 Main Rd, Observatory, Cape Town',
    postalAddress: 'PO Box 1, Cape Town',
  });
  assert.equal(payload.billingAddress, '12 Main Rd, Observatory, Cape Town');
  assert.equal(payload.siteAddress, '12 Main Rd, Observatory, Cape Town');
  assert.equal(payload.postalAddress, 'PO Box 1, Cape Town');
});

test('blank address fields persist as null snapshots', () => {
  const payload = addressesToApiPayload({
    billingAddress: '  ',
    siteAddress: '',
    postalAddress: '\n',
  });
  assert.equal(payload.billingAddress, null);
  assert.equal(payload.siteAddress, null);
  assert.equal(payload.postalAddress, null);
});
