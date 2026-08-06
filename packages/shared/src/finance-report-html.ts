import { formatFinanceAuraCents } from './finance-aura-agent.js';
import { buildYoungGunsReportShellHtml } from './young-guns-report-shell.js';
import {
  FINANCE_CASH_NOT_PROFIT_NOTE,
  FINANCE_PROFIT_UNAVAILABLE_NOTE,
} from './finance-report-source-policy.js';
import type {
  AccountsReceivableReportContext,
  CashflowCollectionsReportContext,
  CustomerPropertyHistoryReportContext,
  FinanceAggregateReportContext,
  FinanceMetricLine,
  FinanceReportKind,
} from './finance-report.js';
import { financeReportKindLabel } from './finance-report.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function formatCents(cents: number, currency: string): string {
  return formatFinanceAuraCents(cents, currency);
}

function renderMetrics(metrics: FinanceMetricLine[]): string {
  if (!metrics.length) return '<p class="muted">No metrics recorded.</p>';
  const rows = metrics
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.label)}</td><td>${escapeHtml(m.displayValue)}</td><td class="muted">${escapeHtml(m.note ?? '')}</td></tr>`,
    )
    .join('');
  return `<table class="fin-table"><thead><tr><th>Metric</th><th>Value</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function shell(
  kind: FinanceReportKind,
  ctx: {
    reportReference: string;
    companyName: string;
    currency: string;
    periodStart: string | null;
    periodEnd: string | null;
    snapshotDate: string | null;
    timezone: string;
    generatedAt: string;
    dataSourceNote: string;
    freshnessState: string;
    dataQualityWarnings: string[];
  },
  body: string,
): string {
  const periodLabel = ctx.snapshotDate
    ? `Snapshot ${ctx.snapshotDate} (${ctx.timezone})`
    : ctx.periodStart && ctx.periodEnd
      ? `${ctx.periodStart} to ${ctx.periodEnd} (${ctx.timezone})`
      : ctx.timezone;

  const warnings =
    ctx.dataQualityWarnings.length > 0
      ? section(
          'Data quality warnings',
          `<ul>${ctx.dataQualityWarnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`,
        )
      : '';

  return buildYoungGunsReportShellHtml({
    financeKind: kind,
    reportTitle: financeReportKindLabel(kind),
    periodLabel,
    generatedAt: ctx.generatedAt,
    filterSummary: `${ctx.dataSourceNote} · Freshness: ${ctx.freshnessState} · Currency: ${ctx.currency}`,
    bodyHtml: `<style>${financeReportShellExtraCss()}</style>${body}${warnings}`,
  });
}

export function buildFinanceAggregateReportHtml(ctx: FinanceAggregateReportContext): string {
  const agingRows = ctx.agingSummary
    .filter((a) => a.invoiceCount > 0 || a.balanceDueCents > 0)
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.bucketLabel)}</td><td>${a.invoiceCount}</td><td>${formatCents(a.balanceDueCents, ctx.currency)}</td></tr>`,
    )
    .join('');

  const body = [
    section('Data source', `<p class="muted">${escapeHtml(ctx.dataSourceNote)}</p><p class="muted">Reporting basis: ${escapeHtml(ctx.provenance.reportingBasis)} · VAT: ${escapeHtml(ctx.provenance.vatBasis)}</p>`),
    section('Summary metrics', renderMetrics(ctx.metrics)),
    section(
      'Profit and cash',
      `<p><strong>Profit:</strong> ${escapeHtml(ctx.profitNote)}</p><p class="muted">${escapeHtml(FINANCE_PROFIT_UNAVAILABLE_NOTE)}</p><p class="muted">${escapeHtml(ctx.cashFlowNote || FINANCE_CASH_NOT_PROFIT_NOTE)}</p>`,
    ),
    section('Outstanding aging', agingRows ? `<table class="fin-table"><thead><tr><th>Bucket</th><th>Invoices</th><th>Balance</th></tr></thead><tbody>${agingRows}</tbody></table>` : '<p class="muted">No outstanding receivables.</p>'),
    section('VAT note', `<p class="muted">${escapeHtml(ctx.vatNote)}</p>`),
  ].join('');

  return shell('finance_aggregate', ctx, body);
}

export function buildCashflowCollectionsReportHtml(ctx: CashflowCollectionsReportContext): string {
  const monthly = ctx.monthlyMovement
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.month)}</td><td>${m.inflowCents != null ? formatCents(m.inflowCents, ctx.currency) : '—'}</td><td>${m.outflowCents != null ? formatCents(m.outflowCents, ctx.currency) : '—'}</td><td>${formatCents(m.netCents, ctx.currency)}</td></tr>`,
    )
    .join('');

  const bankRows = ctx.bankFeedLines
    .slice(0, 100)
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.transactionDate ?? '—')}</td><td>${formatCents(b.amountCents, b.currency)}</td><td>${escapeHtml(b.description ?? '—')}</td><td>${escapeHtml(b.exclusionReason ?? '')}</td></tr>`,
    )
    .join('');

  const body = [
    section('Data source', `<p class="muted">${escapeHtml(ctx.dataSourceNote)}</p>`),
    section('Cash movement summary', renderMetrics(ctx.metrics)),
    section(
      'Monthly movement',
      monthly
        ? `<table class="fin-table"><thead><tr><th>Month</th><th>Inflows</th><th>Outflows</th><th>Net</th></tr></thead><tbody>${monthly}</tbody></table>`
        : '<p class="muted">No cash movement recorded for this period.</p>',
    ),
    section(
      'Bank feed (informational)',
      bankRows
        ? `<p class="muted">Bank feed lines are not summed into payment totals to prevent double-counting.</p><table class="fin-table"><thead><tr><th>Date</th><th>Amount</th><th>Description</th><th>Note</th></tr></thead><tbody>${bankRows}</tbody></table>`
        : '<p class="muted">No bank transactions recorded for this period.</p>',
    ),
  ].join('');

  return shell('cashflow_collections', ctx, body);
}

export function buildAccountsReceivableReportHtml(ctx: AccountsReceivableReportContext): string {
  const agingRows = ctx.agingSummary
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.bucketLabel)}</td><td>${a.invoiceCount}</td><td>${formatCents(a.balanceDueCents, ctx.currency)}</td></tr>`,
    )
    .join('');

  const invoiceRows = ctx.invoiceLines
    .slice(0, 200)
    .map(
      (inv) =>
        `<tr><td>${escapeHtml(inv.customerName)}</td><td>${escapeHtml(inv.publicNumber)}</td><td>${escapeHtml(inv.invoiceDate ?? '—')}</td><td>${escapeHtml(inv.dueDate ?? '—')}</td><td>${formatCents(inv.balanceDueCents, ctx.currency)}</td><td>${escapeHtml(inv.status)}</td><td>${inv.daysOverdue ?? '—'}</td><td>${escapeHtml(inv.flags.join('; ') || '—')}</td></tr>`,
    )
    .join('');

  const body = [
    section('Snapshot', `<p><strong>Total outstanding:</strong> ${formatCents(ctx.totalOutstandingCents, ctx.currency)}</p><p class="muted">${escapeHtml(ctx.dataSourceNote)}</p>`),
    section('Aging summary', `<table class="fin-table"><thead><tr><th>Bucket</th><th>Count</th><th>Balance</th></tr></thead><tbody>${agingRows}</tbody></table>`),
    section(
      'Outstanding invoices',
      invoiceRows
        ? `<table class="fin-table fin-table--dense"><thead><tr><th>Customer</th><th>Invoice #</th><th>Date</th><th>Due</th><th>Balance</th><th>Status</th><th>Days overdue</th><th>Flags</th></tr></thead><tbody>${invoiceRows}</tbody></table>`
        : '<p class="muted">No outstanding invoices.</p>',
    ),
  ].join('');

  return shell('accounts_receivable', ctx, body);
}

export function buildCustomerPropertyHistoryReportHtml(ctx: CustomerPropertyHistoryReportContext): string {
  const propertyRows = ctx.properties
    .map((p) => `<li>${escapeHtml(p.name)}${p.address ? ` — ${escapeHtml(p.address)}` : ''}</li>`)
    .join('');

  const timelineRows = ctx.timeline
    .slice(0, 150)
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.kind)}</td><td>${escapeHtml(item.publicReference)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.status ?? '—')}</td><td>${item.amountCents != null ? formatCents(item.amountCents, ctx.currency) : '—'}</td><td>${escapeHtml(item.propertyName ?? '—')}</td></tr>`,
    )
    .join('');

  const body = [
    section(
      'Customer',
      `<p><strong>${escapeHtml(ctx.customerName)}</strong> (${escapeHtml(ctx.customerReference)})</p>${ctx.contactEmail ? `<p>Email: ${escapeHtml(ctx.contactEmail)}</p>` : ''}${ctx.contactPhone ? `<p>Phone: ${escapeHtml(ctx.contactPhone)}</p>` : ''}`,
    ),
    section('Properties', propertyRows ? `<ul>${propertyRows}</ul>` : '<p class="muted">No properties recorded.</p>'),
    ctx.outstandingBalanceCents != null
      ? section('Account summary', `<p><strong>Outstanding balance:</strong> ${formatCents(ctx.outstandingBalanceCents, ctx.currency)}</p>${ctx.amountPaidCents != null ? `<p><strong>Amount paid (period):</strong> ${formatCents(ctx.amountPaidCents, ctx.currency)}</p>` : ''}`)
      : '',
    ctx.audience === 'internal' && ctx.internalNotes
      ? section('Internal notes', `<p>${escapeHtml(ctx.internalNotes)}</p>`)
      : '',
    section(
      'History timeline',
      timelineRows
        ? `<table class="fin-table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Title</th><th>Status</th><th>Amount</th><th>Property</th></tr></thead><tbody>${timelineRows}</tbody></table>`
        : '<p class="muted">No history records for this period.</p>',
    ),
  ].join('');

  return shell('customer_property_history', ctx, body);
}

export function financeReportShellExtraCss(): string {
  return `
    .fin-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .fin-table th, .fin-table td { border: 1px solid rgba(255,255,255,0.12); padding: 4px 6px; text-align: left; vertical-align: top; }
    .fin-table thead th { background: rgba(255,255,255,0.04); }
    .fin-table--dense td, .fin-table--dense th { font-size: 8pt; }
  `;
}
