#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, '.tmp-check-tables.mjs');
fs.writeFileSync(
  scriptPath,
  `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const tables = await sql\`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name like 'department_routine%'
  order by table_name\`;
const migrations = await sql\`
  select id, hash, created_at from drizzle.__drizzle_migrations
  order by created_at desc limit 5\`;
console.log(JSON.stringify({ tables, recentMigrations: migrations }, null, 2));
await sql.end();
`,
);
const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
console.log(raw);
fs.rmSync(scriptPath, { force: true });
