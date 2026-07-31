/**
 * Apply 0104_n8n_hybrid_orchestration to dedicated staging only.
 * Refuses live project ref. Records drizzle journal hash entry when missing.
 *
 * Usage:
 *   node --env-file=apps/api/.env.staging.local packages/db/scripts/apply-0104-staging.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migPath = path.join(__dirname, '../drizzle/0104_n8n_hybrid_orchestration.sql');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const TAG = '0104_n8n_hybrid_orchestration';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
if (databaseUrl.toLowerCase().includes(FORBIDDEN)) {
  console.error('Refusing forbidden live project');
  process.exit(3);
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
const outPath = path.resolve(
  __dirname,
  '../../../diagnostic-output/110-staging-apply-0104.json',
);

const report = { tag: TAG, applied: false, alreadyPresent: false, journalCount: null, ok: false };

try {
  const existing = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'n8n_connections'
    LIMIT 1
  `;
  if (existing.length) {
    report.alreadyPresent = true;
  } else {
    const migrationSql = fs.readFileSync(migPath, 'utf8');
    await sql.unsafe(migrationSql);
    report.applied = true;
  }

  // Ensure drizzle journal knows about 0104 (idempotent).
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  const hash = createHash('sha256').update(fs.readFileSync(migPath)).digest('hex');
  const found = await sql`SELECT id FROM drizzle.__drizzle_migrations WHERE hash = ${hash} LIMIT 1`;
  if (!found.length) {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${Date.now()})
    `;
  }
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
  report.journalCount = count;
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await sql.end({ timeout: 2 });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
