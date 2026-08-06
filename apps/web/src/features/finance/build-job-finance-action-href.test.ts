import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJobFinanceActionHref } from './build-job-finance-action-href';

test('buildJobFinanceActionHref encodes job and customer for quote create', () => {
  assert.equal(
    buildJobFinanceActionHref('quote', { jobId: 'job-1', customerId: 'cust-2' }),
    '/finance/quotes/new?jobId=job-1&customerId=cust-2',
  );
});

test('buildJobFinanceActionHref supports invoice and payment paths', () => {
  assert.equal(
    buildJobFinanceActionHref('invoice', { jobId: 'j1', customerId: 'c1', from: 'job-detail' }),
    '/finance/invoices/new?jobId=j1&customerId=c1&from=job-detail',
  );
  assert.equal(
    buildJobFinanceActionHref('payment', { jobId: 'j1', customerId: 'c1' }),
    '/finance/payments/new?jobId=j1&customerId=c1',
  );
});
