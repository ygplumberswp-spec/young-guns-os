import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceivableAgingSummary,
  classifyAgingBucket,
  invoiceBalanceDueCents,
  resolveFinanceFreshness,
  resolveFinanceSourceSystem,
} from './finance-report-source-policy.js';

test('invoice balance due excludes cancelled', () => {
  assert.equal(
    invoiceBalanceDueCents({
      status: 'cancelled',
      totalCents: 10000,
      amountCents: 10000,
      amountPaidCents: 0,
    }),
    0,
  );
});

test('part-paid invoice uses remaining balance', () => {
  assert.equal(
    invoiceBalanceDueCents({
      status: 'partial',
      totalCents: 10000,
      amountCents: 10000,
      amountPaidCents: 4000,
    }),
    6000,
  );
});

test('aging bucket current for future due date', () => {
  const asOf = new Date('2026-08-05T12:00:00.000Z');
  const result = classifyAgingBucket({
    balanceDueCents: 5000,
    status: 'sent',
    dueDate: '2026-09-01',
    asOf,
  });
  assert.equal(result.bucket, 'current');
  assert.equal(result.daysOverdue, 0);
});

test('missing due date goes to unavailable bucket', () => {
  const result = classifyAgingBucket({
    balanceDueCents: 5000,
    status: 'sent',
    dueDate: null,
    asOf: new Date('2026-08-05'),
  });
  assert.equal(result.bucket, 'due_date_unavailable');
});

test('91+ days overdue bucket', () => {
  const result = classifyAgingBucket({
    balanceDueCents: 5000,
    status: 'overdue',
    dueDate: '2026-01-01',
    asOf: new Date('2026-08-05'),
  });
  assert.equal(result.bucket, 'days_91_plus');
});

test('finance source system detects mixed records', () => {
  assert.equal(
    resolveFinanceSourceSystem([
      { sourceProvider: 'xero' },
      { sourceProvider: null },
    ]),
    'mixed',
  );
});

test('never synced freshness when no sync timestamp', () => {
  assert.equal(resolveFinanceFreshness(null), 'never_synced');
});

test('aging summary sums bucket balances', () => {
  const summary = buildReceivableAgingSummary([
    {
      publicNumber: 'INV-1',
      customerName: 'A',
      invoiceDate: '2026-01-01',
      dueDate: '2026-02-01',
      originalTotalCents: 10000,
      amountPaidCents: 0,
      balanceDueCents: 10000,
      status: 'overdue',
      daysOverdue: 90,
      agingBucket: 'days_61_90',
      lastPaymentDate: null,
      flags: [],
    },
  ]);
  const bucket = summary.find((b) => b.bucket === 'days_61_90');
  assert.equal(bucket?.invoiceCount, 1);
  assert.equal(bucket?.balanceDueCents, 10000);
});
