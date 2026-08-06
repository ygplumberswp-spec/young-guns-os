import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db');
const sql = fs.readFileSync(path.join(root, 'drizzle/0178_finance_title_free_legacy.sql'), 'utf8');

test('0178 migration keeps title NOT NULL with empty default', () => {
  assert.doesNotMatch(sql, /DROP\s+NOT\s+NULL/i);
  assert.match(sql, /SET\s+DEFAULT\s+''/i);
  assert.match(sql, /SET\s+NOT\s+NULL/i);
  assert.match(sql, /UPDATE\s+"quotes"\s+SET\s+"title"\s+=\s+''\s+WHERE/i);
  assert.match(sql, /UPDATE\s+"invoices"\s+SET\s+"title"\s+=\s+''\s+WHERE/i);
});
