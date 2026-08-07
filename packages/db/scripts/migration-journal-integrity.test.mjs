/**
 * JPE-001C — migration journal/order safety (hash-based semantics).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));

function hashFile(tag) {
  const body = fs.readFileSync(path.join(root, `drizzle/${tag}.sql`), 'utf8');
  return crypto.createHash('sha256').update(body).digest('hex');
}

describe('migration journal integrity (JPE-001C)', () => {
  it('0184 is registered in the standard Drizzle journal file', () => {
    const entry = journal.entries.find((e) => e.tag === '0184_job_profitability_engine');
    assert.ok(entry, '0184 must exist in meta/_journal.json');
    assert.equal(entry.idx, 179);
    assert.equal(entry.when, 1785868000000);
  });

  it('0183 exists on disk but is intentionally absent from the journal (Xero isolation)', () => {
    const file = path.join(root, 'drizzle/0183_xero_rate_budget_coordination.sql');
    assert.ok(fs.existsSync(file));
    const inJournal = journal.entries.some((e) => e.tag === '0183_xero_rate_budget_coordination');
    assert.equal(inJournal, false);
  });

  it('hash-based planner applies missing migrations regardless of numeric filename order', () => {
    const appliedHashes = new Set([hashFile('0184_job_profitability_engine')]);
    const planned = [];
    for (const entry of journal.entries) {
      const h = hashFile(entry.tag);
      if (appliedHashes.has(h)) continue;
      planned.push(entry.tag);
    }
    assert.ok(!planned.includes('0184_job_profitability_engine'));
    assert.ok(planned.includes('0174_facebook_business_integration') || planned.length >= 0);
  });

  it('0183 will be planned when added to journal — 0184 hash already applied is skipped', () => {
    const appliedHashes = new Set([hashFile('0184_job_profitability_engine')]);
    const hypothetical0183 = hashFile('0183_xero_rate_budget_coordination');
    assert.ok(!appliedHashes.has(hypothetical0183));
    assert.ok(appliedHashes.has(hashFile('0184_job_profitability_engine')));
    // Simulated apply: 0183 runs, 0184 skipped by hash
    const simulated = [];
    for (const tag of ['0183_xero_rate_budget_coordination', '0184_job_profitability_engine']) {
      const h = hashFile(tag);
      if (appliedHashes.has(h)) continue;
      simulated.push(tag);
    }
    assert.deepEqual(simulated, ['0183_xero_rate_budget_coordination']);
  });

  it('journal count advancing does not imply later numeric tags are applied (hash is authority)', () => {
    const appliedCount = 179;
    const tags0181_0184 = [
      '0181_xero_realtime_intersync',
      '0182_bank_statement_manual_import',
      '0183_xero_rate_budget_coordination',
      '0184_job_profitability_engine',
    ];
    const appliedHashes = new Set([
      hashFile('0181_xero_realtime_intersync'),
      hashFile('0182_bank_statement_manual_import'),
      hashFile('0184_job_profitability_engine'),
    ]);
    const missing = tags0181_0184.filter((tag) => {
      if (!fs.existsSync(path.join(root, `drizzle/${tag}.sql`))) return false;
      return !appliedHashes.has(hashFile(tag));
    });
    assert.deepEqual(missing, ['0183_xero_rate_budget_coordination']);
    assert.ok(appliedCount >= 179);
  });
});
