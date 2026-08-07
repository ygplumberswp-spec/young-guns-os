/**
 * Read-only staging probe — Young Guns Plumbing customer value metrics (counts only, no PII).
 * Does NOT enqueue sync jobs or interrupt Xero background import.
 *
 * Usage:
 *   STAGING_DATABASE_URL=postgresql://... node diagnostic-output/182-customer-value-classification-staging-probe.mjs
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
const outPath = path.resolve(repoRoot, 'diagnostic-output/182-customer-value-classification-staging-probe.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';

const EXCLUDED = new Set(['draft', 'cancelled', 'voided', 'deleted']);

function cents(n) {
  return Number(n ?? 0);
}

function classifyCustomer(customer, invoiceRows) {
  if (customer.is_supplier_only) {
    return {
      primary: 'supplier_only_contact',
      isVerifiedInvoiced: false,
      isPaying: false,
      isFullyPaid: false,
      isPartiallyPaid: false,
      isUnpaid: false,
      isOverdue: false,
      isProspect: false,
      totalInvoicedCents: 0,
      cashReceivedCents: 0,
      outstandingCents: 0,
      overdueOutstandingCents: 0,
    };
  }

  const qualifying = invoiceRows.filter((inv) => {
    if (EXCLUDED.has(inv.status)) return false;
    return cents(inv.total_cents || inv.amount_cents) > 0;
  });

  const asOf = Date.now();
  let totalInvoicedCents = 0;
  let cashReceivedCents = 0;
  let outstandingCents = 0;
  let overdueOutstandingCents = 0;

  for (const inv of qualifying) {
    const total = cents(inv.total_cents || inv.amount_cents);
    const paid = Math.min(cents(inv.amount_paid_cents), total);
    const outstanding = Math.max(0, total - paid);
    totalInvoicedCents += total;
    cashReceivedCents += paid;
    outstandingCents += outstanding;
    if (outstanding > 0 && inv.due_date && new Date(inv.due_date).getTime() < asOf) {
      overdueOutstandingCents += outstanding;
    }
  }

  const isVerifiedInvoiced = qualifying.length > 0;
  const isPaying = cashReceivedCents > 0;
  const isFullyPaid = isVerifiedInvoiced && outstandingCents === 0;
  const isPartiallyPaid = isPaying && outstandingCents > 0;
  const isUnpaid = isVerifiedInvoiced && cashReceivedCents === 0;
  const isOverdue = overdueOutstandingCents > 0;
  const isProspect = !isVerifiedInvoiced;

  let primary = 'verified_invoiced_customer';
  if (isProspect) primary = 'prospect_contact';
  else if (isOverdue) primary = 'overdue_debtor';
  else if (isUnpaid) primary = 'unpaid_debtor';
  else if (isPartiallyPaid) primary = 'partially_paid_customer';
  else if (isFullyPaid) primary = 'fully_paid_customer';

  return {
    primary,
    isVerifiedInvoiced,
    isPaying,
    isFullyPaid,
    isPartiallyPaid,
    isUnpaid,
    isOverdue,
    isProspect,
    totalInvoicedCents,
    cashReceivedCents,
    outstandingCents,
    overdueOutstandingCents,
  };
}

function matches(summary, key) {
  switch (key) {
    case 'supplier_only_contact':
      return summary.primary === 'supplier_only_contact';
    case 'prospect_contact':
      return summary.isProspect;
    case 'verified_invoiced_customer':
      return summary.isVerifiedInvoiced;
    case 'paying_customer':
      return summary.isPaying;
    case 'fully_paid_customer':
      return summary.isFullyPaid;
    case 'partially_paid_customer':
      return summary.isPartiallyPaid;
    case 'unpaid_debtor':
      return summary.isUnpaid && !summary.isOverdue;
    case 'overdue_debtor':
      return summary.isOverdue;
    default:
      return false;
  }
}

function bucketValue(key, summary) {
  switch (key) {
    case 'verified_invoiced_customer':
    case 'fully_paid_customer':
      return summary.totalInvoicedCents;
    case 'paying_customer':
      return summary.cashReceivedCents;
    case 'partially_paid_customer':
    case 'unpaid_debtor':
      return summary.outstandingCents;
    case 'overdue_debtor':
      return summary.overdueOutstandingCents;
    default:
      return 0;
  }
}

async function main() {
  const databaseUrl = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
  const report = {
    label: '182-customer-value-classification-staging-probe',
    generatedAt: new Date().toISOString(),
    stagingRef: STAGING_REF,
    forbiddenProductionRef: FORBIDDEN,
    verdict: 'SKIPPED',
    xeroImportInProgress: null,
    youngGunsCompanyId: null,
    metrics: null,
    notes: [],
  };

  if (!databaseUrl) {
    report.notes.push('No STAGING_DATABASE_URL — skipped live probe');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Wrote ${outPath} (skipped — no DATABASE_URL)`);
    return;
  }

  if (databaseUrl.includes(FORBIDDEN)) {
    report.verdict = 'REFUSED_PRODUCTION';
    report.notes.push('Refused production Supabase ref');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error('Refused production database URL');
    process.exit(1);
  }

  if (!databaseUrl.includes(STAGING_REF)) {
    report.notes.push(`Database URL ref is not staging ${STAGING_REF} — proceeding with caution`);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const companies = await sql`
      select id, name from companies where name ilike '%Young Guns Plumbing%' limit 1
    `;
    if (!companies[0]) {
      report.notes.push('Young Guns Plumbing company not found');
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      return;
    }

    const companyId = companies[0].id;
    report.youngGunsCompanyId = companyId;

    const importJobs = await sql`
      select status from integration_sync_jobs
      where company_id = ${companyId}
        and provider = 'xero'
        and sync_scope = 'import'
        and status in ('pending', 'running')
      limit 1
    `;
    report.xeroImportInProgress = importJobs.length > 0;
    if (report.xeroImportInProgress) {
      report.notes.push('Xero background import active — metrics may be partial (read-only probe only)');
    }

    const customers = await sql`
      select id, is_supplier_only from customers where company_id = ${companyId}
    `;
    const invoices = await sql`
      select customer_id, status, amount_cents, total_cents, amount_paid_cents, due_date
      from invoices where company_id = ${companyId}
    `;

    const invoicesByCustomer = new Map();
    for (const inv of invoices) {
      const list = invoicesByCustomer.get(inv.customer_id) ?? [];
      list.push(inv);
      invoicesByCustomer.set(inv.customer_id, list);
    }

    const summaries = customers.map((customer) =>
      classifyCustomer(customer, invoicesByCustomer.get(customer.id) ?? []),
    );

    const keys = [
      'verified_invoiced_customer',
      'paying_customer',
      'fully_paid_customer',
      'partially_paid_customer',
      'unpaid_debtor',
      'overdue_debtor',
      'prospect_contact',
      'supplier_only_contact',
    ];

    const buckets = keys.map((key) => {
      const matched = summaries.filter((s) => matches(s, key));
      return {
        classification: key,
        count: matched.length,
        valueCents: matched.reduce((sum, row) => sum + bucketValue(key, row), 0),
      };
    });

    report.metrics = {
      currency: 'ZAR',
      dataCompleteness: report.xeroImportInProgress ? 'partial' : 'complete',
      buckets,
      totals: {
        customerRecords: summaries.length,
        qualifyingCustomers: summaries.filter((s) => s.isVerifiedInvoiced).length,
        totalInvoicedCents: summaries.reduce((sum, s) => sum + s.totalInvoicedCents, 0),
        cashReceivedCents: summaries.reduce((sum, s) => sum + s.cashReceivedCents, 0),
        outstandingCents: summaries.reduce((sum, s) => sum + s.outstandingCents, 0),
        overdueOutstandingCents: summaries.reduce((sum, s) => sum + s.overdueOutstandingCents, 0),
      },
    };
    report.verdict = 'PASS';
  } catch (err) {
    report.verdict = 'ERROR';
    report.notes.push(`Read-only probe failed: ${String(err?.message || err).slice(0, 200)}`);
  } finally {
    try {
      await sql.end();
    } catch {
      // ignore disconnect errors
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
