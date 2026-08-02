#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = path.join(repoRoot, 'packages/db/drizzle/0118_department_routine_tasks.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');
const statements = sqlContent
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

const scriptPath = path.join(repoRoot, '.tmp-apply-0118.mjs');
fs.writeFileSync(
  scriptPath,
  `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const statements = ${JSON.stringify(statements)};
for (const statement of statements) {
  try {
    await sql.unsafe(statement);
    console.log('OK:', statement.slice(0, 60).replace(/\\n/g, ' '));
  } catch (err) {
    console.error('ERR:', err.message, statement.slice(0, 40));
  }
}
const tables = await sql\`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name like 'department_routine%'\`;
console.log('tables', tables);
await sql.end();
`,
);

execSync(`railway run --service young-guns-os node ${scriptPath}`, {
  cwd: repoRoot,
  stdio: 'inherit',
});
fs.rmSync(scriptPath, { force: true });
