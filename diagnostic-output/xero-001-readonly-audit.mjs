#!/usr/bin/env node
/**
 * XERO-001 read-only staging audit — no OAuth, no refresh, no writes.
 * Output: diagnostic-output/xero-001-readonly-audit.json (sanitized)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'));
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const OUT = path.join(repoRoot, 'diagnostic-output/xero-001-readonly-audit.json');

function loadDbUrl() {
  const envPath = path.join(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) throw new Error('Missing apps/api/.env.staging.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL not found');
  const url = m[1].trim().replace(/^["']|["']$/g, '');
  if (url.includes(FORBIDDEN)) throw new Error('PRODUCTION DB FORBIDDEN');
  if (!url.includes(STAGING_REF)) throw new Error('Not staging ref cpkuwtaipjxeipvbssvn');
  return url;
}

function fp(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 12);
}

const out = {
  label: 'XERO-001-readonly-audit',
  generatedAt: new Date().toISOString(),
  companyId: YGP,
  databaseFingerprint: null,
  connection: null,
  tokenHealth: null,
  entityCounts: {},
  mappingCounts: {},
  syncLogs: {},
  importJobs: {},
  financialMemory: {},
  coverage: null,
  schedules: null,
  writeApprovals: null,
  auditLogSample: null,
};

const url = loadDbUrl();
out.databaseFingerprint = fp(url);
const sql = postgres(url, { max: 1, prepare: false });

try {
  const [conn] = await sql`
    SELECT id, status, last_sync_at, last_error, connected_at, updated_at, created_at,
           config, (credentials_encrypted IS NOT NULL AND length(credentials_encrypted) > 0) AS credentials_present
    FROM integration_connections
    WHERE company_id = ${YGP}::uuid AND provider = 'xero'`;
  if (conn) {
    const cfg = typeof conn.config === 'object' ? conn.config : {};
    out.connection = {
      exists: true,
      status: conn.status,
      lastSyncAt: conn.last_sync_at,
      lastError: conn.last_error ? String(conn.last_error).slice(0, 200) : null,
      connectedAt: conn.connected_at,
      updatedAt: conn.updated_at,
      organisationName: cfg.organisationName ?? null,
      organisationId: cfg.organisationId ?? null,
      tenantId: cfg.tenantId ?? null,
      baseCurrency: cfg.baseCurrency ?? null,
      grantedScopes: cfg.grantedScopes ?? cfg.scopes ?? null,
      credentialsEncryptedPresent: conn.credentials_present,
    };
    // Token health without decrypting
    if (conn.credentials_present) {
      const credLen = (
        await sql`SELECT length(credentials_encrypted) AS n FROM integration_connections
                  WHERE company_id = ${YGP}::uuid AND provider = 'xero'`
      )[0]?.n;
      out.tokenHealth = {
        encryptedBlobPresent: true,
        encryptedBlobLength: credLen,
        refreshCapabilityInCode: true,
        tokenExpiryKnownWithoutDecrypt: false,
        note: 'Expiry stored inside encrypted blob — not read during this audit',
      };
    } else {
      out.tokenHealth = { encryptedBlobPresent: false };
    }
  } else {
    out.connection = { exists: false };
  }

  const countQ = async (table, where = `company_id = '${YGP}'`) => {
    const [r] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`);
    return r.n;
  };

  out.entityCounts = {
    customers: await countQ('customers'),
    quotes: await countQ('quotes'),
    invoices: await countQ('invoices'),
    invoiceLineItems: await countQ('invoice_line_items'),
    payments: await countQ('payments'),
    xeroBankTransactions: await countQ('xero_bank_transactions'),
    xeroBills: await countQ('xero_bills'),
    xeroCreditNotes: await countQ('xero_credit_notes'),
    xeroAccounts: await countQ('xero_accounts'),
    xeroTrackingCategories: await countQ('xero_tracking_categories'),
    xeroAttachments: await countQ('xero_attachments'),
  };

  out.mappingCounts = {
    xeroCustomerMappings: await countQ('xero_customer_mappings'),
    xeroQuoteMappings: await countQ('xero_quote_mappings'),
    xeroInvoiceMappings: await countQ('xero_invoice_mappings'),
    xeroPaymentMappings: await countQ('xero_payment_mappings'),
    customersWithMapping: await sql`
      SELECT count(DISTINCT customer_id)::int AS n FROM xero_customer_mappings
      WHERE company_id = ${YGP}::uuid`.then((r) => r[0].n),
    customersWithoutMapping: await sql`
      SELECT count(*)::int AS n FROM customers c
      WHERE c.company_id = ${YGP}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM xero_customer_mappings m
          WHERE m.company_id = c.company_id AND m.customer_id = c.id
        )`.then((r) => r[0].n),
    orphanInvoiceMappings: await sql`
      SELECT count(*)::int AS n FROM xero_invoice_mappings m
      LEFT JOIN invoices i ON i.id = m.invoice_id AND i.company_id = m.company_id
      WHERE m.company_id = ${YGP}::uuid AND i.id IS NULL`.then((r) => r[0].n),
  };

  out.syncLogs = {
    byEntity: await sql`
      SELECT entity_type, status, count(*)::int AS n
      FROM xero_sync_logs WHERE company_id = ${YGP}::uuid
      GROUP BY entity_type, status ORDER BY entity_type, status`,
    lastSuccess: await sql`
      SELECT entity_type, max(created_at) AS last_at
      FROM xero_sync_logs WHERE company_id = ${YGP}::uuid AND status = 'success'
      GROUP BY entity_type ORDER BY entity_type`,
    lastFailure: await sql`
      SELECT entity_type, max(created_at) AS last_at,
             left(max(message), 120) AS sample_message
      FROM xero_sync_logs WHERE company_id = ${YGP}::uuid AND status <> 'success'
      GROUP BY entity_type ORDER BY entity_type`,
    totalEntries: await countQ('xero_sync_logs'),
  };

  out.importJobs = {
    byStatus: await sql`
      SELECT status, count(*)::int AS n FROM integration_sync_jobs
      WHERE company_id = ${YGP}::uuid AND provider = 'xero'
      GROUP BY status ORDER BY status`,
    active: await sql`
      SELECT count(*)::int AS n FROM integration_sync_jobs
      WHERE company_id = ${YGP}::uuid AND provider = 'xero' AND status IN ('pending','running')`,
    recent: await sql`
      SELECT id, status, sync_scope, started_at, completed_at, left(error_message, 120) AS error_sample,
             progress
      FROM integration_sync_jobs WHERE company_id = ${YGP}::uuid AND provider = 'xero'
      ORDER BY created_at DESC LIMIT 8`,
  };

  out.financialMemory = {
    entityCoverage: await sql`
      SELECT entity_type, imported_count, source_total, last_imported_at, pagination_complete, modified_since_cursor
      FROM xero_entity_coverage WHERE company_id = ${YGP}::uuid ORDER BY entity_type`,
    financeSyncRuns: await sql`
      SELECT id, status, started_at, completed_at, left(error_message, 120) AS error_sample
      FROM xero_finance_sync_runs WHERE company_id = ${YGP}::uuid
      ORDER BY started_at DESC LIMIT 5`,
  };

  out.schedules = await sql`
    SELECT provider, enabled, interval_minutes, last_run_at, next_run_at
    FROM integration_sync_schedules WHERE company_id = ${YGP}::uuid AND provider = 'xero'`;

  out.writeApprovals = await sql`
    SELECT status, count(*)::int AS n FROM xero_write_approvals
    WHERE company_id = ${YGP}::uuid GROUP BY status ORDER BY status`;

  out.auditLogSample = await sql`
    SELECT action, count(*)::int AS n FROM security_audit_logs
    WHERE company_id = ${YGP}::uuid AND action LIKE 'xero%'
    GROUP BY action ORDER BY action`;

  out.dateRanges = {
    invoices: (
      await sql`SELECT min(created_at) AS min_created, max(created_at) AS max_created,
                       min(issued_at) AS min_issued, max(issued_at) AS max_issued,
                       min(updated_at) AS max_updated
                FROM invoices WHERE company_id = ${YGP}::uuid`
    )[0],
    customers: (
      await sql`SELECT min(created_at) AS min_created, max(created_at) AS max_created
                FROM customers WHERE company_id = ${YGP}::uuid`
    )[0],
    xeroBankTx: (
      await sql`SELECT min(date) AS min_date, max(date) AS max_date, count(*)::int AS n
                FROM xero_bank_transactions WHERE company_id = ${YGP}::uuid`
    )[0],
  };

  out.migrationCount = (await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)[0].n;
} catch (e) {
  out.fatalError = String(e.message || e).slice(0, 300);
} finally {
  await sql.end({ timeout: 5 });
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('Wrote', OUT);
console.log(JSON.stringify({ connection: out.connection?.status, entityCounts: out.entityCounts, mappingCounts: out.mappingCounts }, null, 2));
