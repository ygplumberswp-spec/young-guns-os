import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStatementRowFingerprint,
  detectColumnMapping,
  parseCsvContent,
  parseStatementAmountCents,
  parseStatementDate,
} from './bank-statement-csv.js';

const SYNTHETIC_CSV = `Date,Amount,Description,Reference
2026-01-15,1250.00,Invoice payment INV-100,INV-100
2026-01-16,-45.50,Bank fee,FEE-1
`;

test('bank statement CSV parser reads synthetic rows', () => {
  const parsed = parseCsvContent(SYNTHETIC_CSV);
  assert.deepEqual(parsed.headers, ['Date', 'Amount', 'Description', 'Reference']);
  assert.equal(parsed.rows.length, 2);
});

test('bank statement column mapping detects date and amount', () => {
  const parsed = parseCsvContent(SYNTHETIC_CSV);
  const mapping = detectColumnMapping(parsed.headers);
  assert.equal(mapping?.date, 'Date');
  assert.equal(mapping?.amount, 'Amount');
  assert.equal(mapping?.description, 'Description');
});

test('bank statement date and amount parsing', () => {
  assert.equal(parseStatementDate('2026-01-15'), '2026-01-15');
  assert.equal(parseStatementAmountCents('1250.00'), 125000);
  assert.equal(parseStatementAmountCents('(45.50)'), -4550);
});

test('bank statement row fingerprint is deterministic', () => {
  const a = buildStatementRowFingerprint({
    bankAccountCode: '090',
    transactionDate: '2026-01-15',
    amountCents: 125000,
    reference: 'INV-100',
    description: 'Invoice payment',
  });
  const b = buildStatementRowFingerprint({
    bankAccountCode: '090',
    transactionDate: '2026-01-15',
    amountCents: 125000,
    reference: 'INV-100',
    description: 'Invoice payment',
  });
  assert.equal(a, b);
});
