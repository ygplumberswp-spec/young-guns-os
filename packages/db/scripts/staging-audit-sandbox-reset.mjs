#!/usr/bin/env node
/**
 * Reset TITAN Audit Sandbox tenant data (staging only).
 * Deletes the sandbox company row cascade via explicit cleanup of labelled records.
 *
 * Requires STAGING_CONFIRM_RESET=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const SLUG = 'titan-audit-sandbox';
const AUDIT_EMAILS = [
  'audit.owner@titan-staging.test',
  'audit.dispatcher@titan-staging.test',
  'audit.technician@titan-staging.test',
  'audit.client@titan-staging.test',
];

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  if (process.env.STAGING_CONFIRM_RESET !== '1') {
    console.error('Refusing reset without STAGING_CONFIRM_RESET=1');
    process.exit(2);
  }

  const env = loadEnv(envPath);
  if (!env.DATABASE_URL || env.APP_ENV !== 'staging') {
    console.error('Staging DATABASE_URL required');
    process.exit(2);
  }
  if (env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
    console.error('Production ref refused');
    process.exit(3);
  }

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const company = await sql`select id from companies where slug = ${SLUG} limit 1`;
    const companyId = company[0]?.id;
    if (!companyId) {
      console.log(JSON.stringify({ reset: 'noop', reason: 'sandbox not found' }));
      return;
    }

    await sql`delete from portal_users where company_id = ${companyId}`;
    await sql`delete from users where company_id = ${companyId}`;
    await sql`delete from companies where id = ${companyId}`;
    await sql`delete from users where email = any(${AUDIT_EMAILS})`;
    await sql`delete from portal_users where email = any(${AUDIT_EMAILS})`;

    console.log(JSON.stringify({ reset: 'ok', companyId }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
