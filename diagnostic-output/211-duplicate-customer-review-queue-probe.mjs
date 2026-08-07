/**
 * Read-only staging probe — duplicate customer records (name similarity, e.g. keanu).
 * Queues suspects for review — no auto-merge.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/211-duplicate-customer-review-queue.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) return process.env.STAGING_DATABASE_URL || null;
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!match) return null;
  const url = match[1].trim().replace(/^["']|["']$/g, '');
  if (url.includes(FORBIDDEN) || !url.includes(STAGING_REF)) return null;
  return url;
}

function normalizeName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function main() {
  const report = {
    label: '211-duplicate-customer-review-queue',
    generatedAt: new Date().toISOString(),
    action: 'queue_for_review_no_auto_merge',
    duplicateGroups: [],
    keanuMatches: [],
  };

  const url = loadStagingDatabaseUrl();
  if (!url) {
    report.notes = ['No staging DATABASE_URL'];
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    return;
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`
      SELECT c.id, c.company_id, c.name, c.email, c.created_at,
             m.xero_contact_id, m.sync_status
      FROM customers c
      LEFT JOIN xero_customer_mappings m ON m.customer_id = c.id
      ORDER BY c.company_id, lower(c.name)
    `;

    const byCompanyAndName = new Map();
    for (const row of rows) {
      const key = `${row.company_id}::${normalizeName(row.name)}`;
      const group = byCompanyAndName.get(key) ?? [];
      group.push({
        id: row.id,
        name: row.name,
        email: row.email ? '[REDACTED]' : null,
        xeroContactId: row.xero_contact_id,
        syncStatus: row.sync_status,
        createdAt: row.created_at,
      });
      byCompanyAndName.set(key, group);
    }

    for (const [key, group] of byCompanyAndName.entries()) {
      if (group.length < 2) continue;
      report.duplicateGroups.push({
        key,
        count: group.length,
        records: group,
        reviewStatus: 'queued',
      });
    }

    report.keanuMatches = rows
      .filter((row) => /keanu/i.test(String(row.name ?? '')))
      .map((row) => ({
        id: row.id,
        name: row.name,
        xeroContactId: row.xero_contact_id,
        reviewStatus: 'queued',
      }));
  } finally {
    await sql.end();
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath} — ${report.duplicateGroups.length} duplicate groups, ${report.keanuMatches.length} keanu matches`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
