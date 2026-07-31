/**
 * Remove STAGING-* labelled synthetic companies from the staging database only.
 *
 * Usage:
 *   node packages/db/scripts/staging-cleanup.mjs
 *   STAGING_CLEANUP_PREFIX=STAGING-CTRL node packages/db/scripts/staging-cleanup.mjs
 *
 * Never targets production (refuses rshuiaghmtrvvilhqpwm).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const PREFIX = process.env.STAGING_CLEANUP_PREFIX || 'STAGING-';

function loadEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[s.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadEnv(envPath);
if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging') {
  console.error(JSON.stringify({ ok: false, reason: 'APP_ENV/TITAN_ENV must be staging' }));
  process.exit(2);
}
if (!env.DATABASE_URL || env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
  console.error(JSON.stringify({ ok: false, reason: 'refuses production/forbidden database' }));
  process.exit(3);
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  const rows = await sql`
    delete from companies
    where name like ${PREFIX + '%'}
    returning id, name
  `;
  console.log(
    JSON.stringify(
      {
        ok: true,
        prefix: PREFIX,
        deleted: rows.length,
        names: rows.map((r) => r.name).slice(0, 50),
        note: 'Storage objects under diagnostic-output/staging-ctrl-storage-* are local harness paths; delete those directories separately if present. DB backup does not include storage objects.',
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
