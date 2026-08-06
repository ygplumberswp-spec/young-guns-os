/** Reports whether migration 0174's fb_* tables are present in staging. Read-only. */
import fs from 'node:fs';
import path from 'node:path';
import postgres from '../packages/db/node_modules/postgres/src/index.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const raw = fs.readFileSync(path.join(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
const url = raw.match(/^DATABASE_URL=(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
if (!url) throw new Error('no DATABASE_URL in .env.staging.local');

const sql = postgres(url, { max: 1, ssl: 'require' });
const tables = await sql`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name like 'fb\_%' order by 1
`;
console.log(`fb_* tables present: ${tables.length}`);
for (const row of tables) console.log(' -', row.table_name);

const apply = process.argv.includes('--apply');
if (tables.length === 0 && apply) {
  const file = path.join(repoRoot, 'packages/db/drizzle/0174_facebook_business_integration.sql');
  const body = fs.readFileSync(file, 'utf8');
  // Only ever runs CREATE statements guarded by IF NOT EXISTS, so it cannot
  // touch or lock the tables the Xero historical import is writing.
  const statements = body
    .split('--> statement-breakpoint')
    .map((entry) => entry.trim())
    .filter(Boolean);
  // `ON DELETE CASCADE` inside a CREATE is fine; a leading DROP/ALTER/DELETE is not.
  for (const statement of statements) {
    const leading = statement.replace(/^(--.*\n|\s)*/, '').slice(0, 40).toUpperCase();
    if (/^(DROP|TRUNCATE|DELETE|UPDATE|ALTER TABLE)/.test(leading)) {
      throw new Error(`refusing to apply: destructive statement "${leading.slice(0, 30)}"`);
    }
  }
  for (const statement of statements) await sql.unsafe(statement);
  const after = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'fb\_%' order by 1
  `;
  console.log(`applied 0174 — fb_* tables now: ${after.length}`);
  for (const row of after) console.log(' -', row.table_name);
}

await sql.end();
