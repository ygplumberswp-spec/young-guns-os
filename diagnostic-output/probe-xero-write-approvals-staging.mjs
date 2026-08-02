#!/usr/bin/env node
/**
 * Probe staging DB for xero_write_approvals table + migration journal drift.
 * Read-only probe — no destructive changes.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, '.tmp-probe-xero-write-approvals.mjs');

fs.writeFileSync(
  scriptPath,
  `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

const tableExists = await sql\`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'xero_write_approvals'
  ) AS exists
\`;

const columns = await sql\`
  SELECT column_name, data_type, udt_name, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'xero_write_approvals'
  ORDER BY ordinal_position
\`;

const enumExists = await sql\`
  SELECT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'xero_write_approval_status'
  ) AS exists
\`;

const conflictCols = await sql\`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('xero_invoice_mappings','xero_customer_mappings','xero_payment_mappings')
    AND column_name = 'conflict_metadata'
  ORDER BY table_name
\`;

const journalCount = await sql\`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations\`;
const journalRows = await sql\`
  SELECT id, created_at, hash
  FROM drizzle.__drizzle_migrations
  ORDER BY id ASC
\`;

const invoiceMappingStatus = await sql\`
  SELECT sync_status, count(*)::int AS n
  FROM xero_invoice_mappings
  WHERE company_id = '095aef76-fef5-4139-af37-a42f2d7e2faf'::uuid
  GROUP BY sync_status
\`;

process.stdout.write(JSON.stringify({
  xero_write_approvals: {
    tableExists: tableExists[0]?.exists ?? false,
    columnCount: columns.length,
    columns: columns.map(c => ({ name: c.column_name, type: c.udt_name || c.data_type, nullable: c.is_nullable })),
  },
  xero_write_approval_status_enum: enumExists[0]?.exists ?? false,
  conflict_metadata_columns: conflictCols,
  journal: {
    count: journalCount[0]?.n ?? 0,
    entries: journalRows.map(r => ({ id: r.id, created_at: r.created_at, hash: r.hash?.slice?.(0, 16) })),
  },
  ygp_invoice_mappings: invoiceMappingStatus,
}, null, 2));

await sql.end();
`,
);

try {
  const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  console.log(raw);
} finally {
  fs.rmSync(scriptPath, { force: true });
}
