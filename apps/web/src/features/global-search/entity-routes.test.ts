import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveGlobalSearchEntityHref } from './entity-routes';

describe('global search entity routes', () => {
  it('maps core operational entities to detail routes', () => {
    assert.equal(resolveGlobalSearchEntityHref('customer', 'cust-1'), '/crm/cust-1');
    assert.equal(resolveGlobalSearchEntityHref('lead', 'lead-1'), '/leads/lead-1');
    assert.equal(resolveGlobalSearchEntityHref('job', 'job-1'), '/jobs/job-1');
    assert.equal(resolveGlobalSearchEntityHref('quote', 'quote-1'), '/finance/quotes/quote-1');
    assert.equal(resolveGlobalSearchEntityHref('invoice', 'inv-1'), '/finance/invoices/inv-1');
    assert.equal(resolveGlobalSearchEntityHref('payment', 'pay-1'), '/finance/payments/pay-1');
  });

  it('returns null for unsupported entity types', () => {
    assert.equal(resolveGlobalSearchEntityHref('other', 'x-1'), null);
  });
});
