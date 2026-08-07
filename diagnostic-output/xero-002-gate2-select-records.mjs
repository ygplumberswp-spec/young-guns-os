#!/usr/bin/env node
/** Gate 2 record selection — staging DB read-only, no secrets printed. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const requireDb = createRequire(path.join(repoRoot, 'packages/db/package.json'));
const postgres = requireDb('postgres');

const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';

function loadDbUrl() {
  const raw = fs.readFileSync(path.join(repoRoot, 'apps/api/.env.staging.local'), 'utf8');
  const m = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL missing');
  const url = m[1].trim().replace(/^["']|["']$/g, '');
  if (url.includes(FORBIDDEN)) throw new Error('production forbidden');
  if (!url.includes(STAGING_REF)) throw new Error('not staging ref');
  return url;
}

function maskId(value) {
  if (!value || typeof value !== 'string') return null;
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

const url = loadDbUrl();
const sql = postgres(url, { max: 1, prepare: false });

try {
  const [conn] = await sql`
    SELECT status, config->>'organisationName' AS org_name, config->>'tenantId' AS tenant_id,
           config->'grantedScopes' AS granted_scopes
    FROM integration_connections
    WHERE company_id = ${YGP}::uuid AND provider = 'xero'`;

  if (!conn || conn.org_name !== 'Young Guns Plumbing') {
    throw new Error(`STOP: organisation is not Young Guns Plumbing (${conn?.org_name ?? 'missing'})`);
  }

  const [selected] = await sql`
    SELECT
      m.customer_id,
      m.xero_contact_id,
      m.sync_status,
      im.invoice_id,
      im.xero_invoice_id,
      i.invoice_number,
      i.status AS invoice_status,
      i.amount_cents,
      i.amount_paid_cents
    FROM xero_customer_mappings m
    JOIN invoices i ON i.customer_id = m.customer_id AND i.company_id = m.company_id
    JOIN xero_invoice_mappings im ON im.invoice_id = i.id AND im.company_id = i.company_id
    WHERE m.company_id = ${YGP}::uuid
      AND m.xero_contact_id IS NOT NULL
      AND m.sync_status = 'synced'
      AND im.xero_invoice_id IS NOT NULL
    ORDER BY m.last_successful_sync_at DESC NULLS LAST, i.updated_at DESC
    LIMIT 1`;

  if (!selected) throw new Error('No confirmed mapped contact+invoice pair found');

  const out = {
    label: 'xero-002-gate2-selection',
    generatedAt: new Date().toISOString(),
    companyId: YGP,
    organisationName: conn.org_name,
    tenantId: conn.tenant_id,
    grantedScopes: conn.granted_scopes,
    selected: {
      customerId: selected.customer_id,
      xeroContactId: selected.xero_contact_id,
      mappingClassification: 'confirmed_linked',
      syncStatus: selected.sync_status,
      invoiceId: selected.invoice_id,
      xeroInvoiceId: selected.xero_invoice_id,
      invoiceNumber: selected.invoice_number,
      invoiceStatus: selected.invoice_status,
    },
    masked: {
      customerId: maskId(selected.customer_id),
      xeroContactId: maskId(selected.xero_contact_id),
      invoiceId: maskId(selected.invoice_id),
      xeroInvoiceId: maskId(selected.xero_invoice_id),
      invoiceNumber: selected.invoice_number,
    },
  };

  fs.writeFileSync(path.join(repoRoot, 'diagnostic-output/xero-002-gate2-selection.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ masked: out.masked, org: conn.org_name, classification: 'confirmed_linked' }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
