import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('JPE-003 migration 0186 job financial linkage', () => {
  it('creates linkage audit and rejection tables without altering xero tables', () => {
    const sql = readFileSync(
      join(root, 'packages/db/drizzle/0186_job_financial_linkage.sql'),
      'utf8',
    );
    assert.ok(sql.includes('job_financial_linkage_audits'));
    assert.ok(sql.includes('job_financial_linkage_rejections'));
    assert.doesNotMatch(sql, /xero/i);
    assert.doesNotMatch(sql, /ALTER TABLE invoices/);
    assert.doesNotMatch(sql, /ALTER TABLE quotes/);
  });
});
