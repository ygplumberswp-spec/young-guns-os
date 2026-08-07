/**
 * 212 — schema/database drift audit. READ-ONLY.
 * Compares every column the Drizzle schema declares against what staging actually has,
 * after the full 0171 migration chain. Any column reported here breaks queries at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../packages/db/src/schema/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const url = fs
  .readFileSync(path.resolve(repoRoot, 'apps/api/.env.staging.local'), 'utf8')
  .match(/^DATABASE_URL=(.+)$/m)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
if (url.includes('rshuiaghmtrvvilhqpwm') || !url.includes('cpkuwtaipjxeipvbssvn')) {
  console.error('BLOCKED: not staging');
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });
const out = { label: '212-schema-vs-database-drift', generatedAt: new Date().toISOString() };

try {
  const dbCols = await sql`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`;
  const dbMap = new Map();
  for (const r of dbCols) {
    if (!dbMap.has(r.table_name)) dbMap.set(r.table_name, new Set());
    dbMap.get(r.table_name).add(r.column_name);
  }

  const missingTables = [];
  const missingColumns = [];
  let tablesChecked = 0;

  for (const value of Object.values(schema)) {
    let cfg;
    try {
      cfg = getTableConfig(value);
    } catch {
      continue;
    }
    if (!cfg?.name) continue;
    tablesChecked += 1;
    const actual = dbMap.get(cfg.name);
    if (!actual) {
      missingTables.push(cfg.name);
      continue;
    }
    for (const col of cfg.columns) {
      if (!actual.has(col.name)) {
        missingColumns.push(`${cfg.name}.${col.name}`);
      }
    }
  }

  out.tablesChecked = tablesChecked;
  out.missingTables = [...new Set(missingTables)].sort();
  out.missingColumns = [...new Set(missingColumns)].sort();
  out.missingTableCount = out.missingTables.length;
  out.missingColumnCount = out.missingColumns.length;
  out.clean = out.missingTableCount === 0 && out.missingColumnCount === 0;
} catch (e) {
  out.error = String(e.message || e);
  out.stack = String(e.stack || '').split('\n').slice(0, 5);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(
  path.resolve(repoRoot, 'diagnostic-output/212-schema-vs-database-drift.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
