#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, '.tmp-check-migrations.mjs');
fs.writeFileSync(
  scriptPath,
  `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const count = await sql\`select count(*)::int as n from drizzle.__drizzle_migrations\`;
const all = await sql\`select id, created_at from drizzle.__drizzle_migrations order by id asc\`;
console.log(JSON.stringify({ count: count[0].n, ids: all.map(r => r.id) }, null, 2));
await sql.end();
`,
);
const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
console.log(raw);
fs.rmSync(scriptPath, { force: true });
