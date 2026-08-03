/**
 * Financial Reporting & Forecasting (Department 4.3)
 *
 * Extends Finance AURA Agent + Cashflow & Profit Intelligence with
 * Owner-gated reports and transparent forecasting from real TITAN data.
 *
 * Invariants:
 * - No invented forecasts; unavailable / insufficient_history when data is thin
 * - Every forecast explains assumptions and methodology
 * - Owner approval required for recommended actions; never auto-execute
 * - Technician / Client denied; Owner + finance RBAC only
 */

import {
  canAccessFinanceAuraAgent,
  canApproveFinanceAuraAgent,
  canWriteFinanceAuraAgent,
  formatFinanceAuraCents,
} from './finance-aura-agent.js';

export type FrfAvailability = 'available' | 'unavailable' | 'insufficient_history';

export type FrfConfidence = 'high' | 'medium' | 'low' | 'unavailable';

export type FrfReportKind =
  | 'revenue'
  | 'expense'
  | 'profit'
  | 'invoice'
  | 'payment'
  | 'job'
  | 'job_profitability';

export type FrfForecastKind =
  | 'revenue'
  | 'cashflow'
  | 'budget_planning'
  | 'trend';

export type FrfInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'finance_aura_agent'
  | 'dashboard';

export type FrfInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type FrfActionKind =
  | 'review_forecast'
  | 'budget_adjustment'
  | 'collections_focus'
  | 'expense_review'
  | 'executive_brief'
  | 'aura_handoff';

export type FrfActionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type FrfPeriodPoint = {
  periodKey: string;
  label: string;
  amountCents: number;
};

export type FrfReportLine = {
  key: string;
  label: string;
  amountCents: number | null;
  count: number;
  note: string | null;
};

export type FrfReportResult = {
  kind: FrfReportKind;
  availability: FrfAvailability;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalCents: number | null;
  lineCount: number;
  lines: FrfReportLine[];
  series: FrfPeriodPoint[];
  gaps: string[];
  summary: string;
  generatedAt: string;
};

export type FrfReportSnapshotSummary = {
  id: string;
  kind: FrfReportKind;
  availability: FrfAvailability;
  title: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalCents: number | null;
  lineCount: number;
  summary: string;
  createdAt: string;
};

export type FrfForecastAssumption = {
  key: string;
  label: string;
  value: string;
};

export type FrfForecastResult = {
  kind: FrfForecastKind;
  availability: FrfAvailability;
  currency: string;
  methodology: string;
  assumptions: FrfForecastAssumption[];
  confidence: FrfConfidence;
  confidenceRationale: string;
  historyMonthsUsed: number;
  minHistoryRequired: number;
  historySeries: FrfPeriodPoint[];
  /** Null when unavailable / insufficient_history — never fabricated. */
  projectedSeries: FrfPeriodPoint[] | null;
  projectedTotalCents: number | null;
  gaps: string[];
  summary: string;
  generatedAt: string;
};

export type FrfForecastSnapshotSummary = {
  id: string;
  kind: FrfForecastKind;
  availability: FrfAvailability;
  title: string;
  currency: string;
  methodology: string;
  historyMonthsUsed: number;
  projectedTotalCents: number | null;
  summary: string;
  createdAt: string;
};

export type FrfBudgetPlanSummary = {
  id: string;
  name: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  budgetedRevenueCents: number | null;
  budgetedExpenseCents: number | null;
  actualRevenueCents: number | null;
  actualExpenseCents: number | null;
  revenueVarianceCents: number | null;
  expenseVarianceCents: number | null;
  notes: string | null;
  createdAt: string;
};

export type FrfInsightSummary = {
  id: string;
  target: FrfInsightTarget;
  status: FrfInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceReportId: string | null;
  sourceForecastId: string | null;
  createdAt: string;
};

export type FrfActionSummary = {
  id: string;
  kind: FrfActionKind;
  status: FrfActionStatus;
  title: string;
  recommendation: string;
  sourceReportId: string | null;
  sourceForecastId: string | null;
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type FrfAuraConnection = {
  target:
    | 'finance_aura_agent'
    | 'finance_cashflow_profit'
    | 'command_centre'
    | 'executive_dashboard'
    | 'dashboard'
    | 'finance_invoices'
    | 'finance_payments'
    | 'financial_planning';
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type FrfDashboard = {
  summary: string;
  productClarification: {
    financeAuraAgent: string;
    cashflowProfit: string;
    thisLayer: string;
  };
  policy: {
    autoExecuteEnabled: false;
    requiresOwnerApproval: true;
    technicianClientDenied: true;
    fakeDataInvented: false;
    forecastsExplainAssumptions: true;
  };
  reports: FrfReportSnapshotSummary[];
  forecasts: FrfForecastSnapshotSummary[];
  budgetPlans: FrfBudgetPlanSummary[];
  insights: FrfInsightSummary[];
  actions: FrfActionSummary[];
  auraConnections: FrfAuraConnection[];
  pendingApprovals: number;
  liveReports: {
    revenue: FrfReportResult;
    expense: FrfReportResult;
    profit: FrfReportResult;
    invoice: FrfReportResult;
    payment: FrfReportResult;
    job: FrfReportResult;
    jobProfitability: FrfReportResult;
  };
  liveForecasts: {
    revenue: FrfForecastResult;
    cashflow: FrfForecastResult;
    budgetPlanning: FrfForecastResult;
    trend: FrfForecastResult;
  };
};

export type CreateFrfBudgetPlanRequest = {
  name: string;
  periodStart: string;
  periodEnd: string;
  currency?: string;
  budgetedRevenueCents?: number | null;
  budgetedExpenseCents?: number | null;
  notes?: string | null;
};

export type CreateFrfInsightRequest = {
  target: FrfInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceReportId?: string;
  sourceForecastId?: string;
};

export function frfInsightTargetHref(target: FrfInsightTarget): string {
  switch (target) {
    case 'command_centre': return '/aura-command-centre';
    case 'executive_dashboard':
    case 'dashboard': return '/dashboard';
    case 'finance_aura_agent': return '/finance-aura-agent';
    default: return '/finance-reporting-forecast';
  }
}

export type AcknowledgeFrfInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

export type CreateFrfActionRequest = {
  kind: FrfActionKind;
  title: string;
  recommendation: string;
  sourceReportId?: string;
  sourceForecastId?: string;
  submitForApproval?: boolean;
};

export type DecideFrfActionRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type GenerateFrfReportRequest = {
  kind: FrfReportKind;
  persist?: boolean;
};

export type GenerateFrfForecastRequest = {
  kind: FrfForecastKind;
  horizonMonths?: number;
  persist?: boolean;
};

// ─── Access (extends Finance AURA Agent RBAC) ─────────────────────────────────

export function canAccessFinanceReportingForecast(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessFinanceAuraAgent(identity);
}

export function canWriteFinanceReportingForecast(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canWriteFinanceAuraAgent(identity);
}

export function canApproveFinanceReportingForecast(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canApproveFinanceAuraAgent(identity);
}

export const FRF_PRODUCT_COPY = {
  financeAuraAgent:
    'Finance AURA Agent Foundation remains the Owner-gated recommendations / insights / alerts layer.',
  cashflowProfit:
    'Cashflow & Profit Intelligence remains the live cashflow/profit signal layer this module reports and forecasts from.',
  thisLayer:
    'Financial Reporting & Forecasting builds Owner reports and transparent forecasts from real TITAN invoices, payments, jobs, and procurement costs. Forecasts explain assumptions and return insufficient_history when history is too thin — never invented projections.',
} as const;

export const FRF_MIN_HISTORY_MONTHS = 3;

export function listFrfAuraConnections(): FrfAuraConnection[] {
  return [
    {
      target: 'finance_aura_agent',
      label: 'Finance AURA Agent',
      href: '/finance-aura-agent',
      status: 'available_link',
      note: 'Parent finance intelligence agent.',
    },
    {
      target: 'finance_cashflow_profit',
      label: 'Cashflow & Profit Intelligence',
      href: '/finance-cashflow-profit',
      status: 'available_link',
      note: 'Live cashflow and profit signals used by reports/forecasts.',
    },
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura-command-centre',
      status: 'available_link',
      note: 'Executive handoff target for real finance insights only.',
    },
    {
      target: 'executive_dashboard',
      label: 'Executive Dashboard',
      href: '/dashboard',
      status: 'available_link',
      note: 'Owner executive surface — insight links only, no fabricated KPIs.',
    },
    {
      target: 'dashboard',
      label: 'Owner Dashboard',
      href: '/dashboard',
      status: 'available_link',
      note: 'Primary Owner dashboard link for reported finance insights.',
    },
    {
      target: 'finance_invoices',
      label: 'Invoices',
      href: '/finance/invoices',
      status: 'available_link',
      note: 'Invoice / revenue report source of record.',
    },
    {
      target: 'finance_payments',
      label: 'Payments',
      href: '/finance/payments',
      status: 'available_link',
      note: 'Payment report and cash inflow source.',
    },
    {
      target: 'financial_planning',
      label: 'Financial Planning',
      href: '/financial-planning',
      status: 'available_link',
      note: 'Existing planning surface — this module adds reporting/forecast snapshots.',
    },
  ];
}

export function computeFrfForecastConfidence(input: {
  availability: FrfAvailability;
  historyMonthsUsed: number;
  activeAmountsCents: number[];
}): { confidence: FrfConfidence; rationale: string } {
  if (input.availability === 'unavailable') return { confidence: 'unavailable', rationale: 'No historical activity — confidence cannot be assessed; projection withheld.' };
  if (input.availability === 'insufficient_history') return { confidence: 'unavailable', rationale: `Fewer than ${FRF_MIN_HISTORY_MONTHS} active month(s) — confidence unavailable; projection withheld.` };
  const amounts = input.activeAmountsCents.filter((n) => n > 0);
  const mean = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  let cv = 0;
  if (mean > 0 && amounts.length >= 2) {
    const variance = amounts.reduce((sum, n) => sum + (n - mean) ** 2, 0) / amounts.length;
    cv = Math.sqrt(variance) / mean;
  }
  if (input.historyMonthsUsed >= 6 && cv <= 0.35) return { confidence: 'high', rationale: `${input.historyMonthsUsed} active month(s) with relatively stable activity (CV ${(cv * 100).toFixed(0)}%). Still a heuristic — not a recorded fact.` };
  if (input.historyMonthsUsed >= 4 && cv <= 0.75) return { confidence: 'medium', rationale: `${input.historyMonthsUsed} active month(s); moderate variability (CV ${(cv * 100).toFixed(0)}%). Transparent average projection only.` };
  return { confidence: 'low', rationale: `${input.historyMonthsUsed} active month(s)${cv > 0 ? ` with high variability (CV ${(cv * 100).toFixed(0)}%)` : ''}. Treat as directional only — assumptions disclosed.` };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const month = Number(m);
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${names[month - 1] ?? m} ${y}`;
}

function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y!, (m! - 1) + delta, 1));
  return monthKey(d);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emptyReport(
  kind: FrfReportKind,
  currency: string,
  gaps: string[],
  summary: string,
  generatedAt: string,
): FrfReportResult {
  return {
    kind,
    availability: 'unavailable',
    currency,
    periodStart: null,
    periodEnd: null,
    totalCents: null,
    lineCount: 0,
    lines: [],
    series: [],
    gaps,
    summary,
    generatedAt,
  };
}

function buildMonthlySeries(
  points: Array<{ at: Date; amountCents: number }>,
  now: Date,
  months = 6,
): FrfPeriodPoint[] {
  const map = new Map<string, number>();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    map.set(monthKey(d), 0);
  }
  for (const p of points) {
    const key = monthKey(p.at);
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + Math.max(0, p.amountCents));
    }
  }
  return [...map.entries()].map(([periodKey, amountCents]) => ({
    periodKey,
    label: monthLabel(periodKey),
    amountCents,
  }));
}

export function buildFrfRevenueReport(input: {
  currency?: string;
  invoices: Array<{
    id: string;
    status: string;
    totalCents: number;
    amountCents: number;
    amountPaidCents: number;
    issuedAt: string | Date | null;
    createdAt: string | Date;
    customerId: string | null;
  }>;
  now?: Date;
}): FrfReportResult {
  const currency = input.currency ?? 'ZAR';
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const invoices = input.invoices.filter((i) => i.status !== 'cancelled');

  if (invoices.length === 0) {
    return emptyReport(
      'revenue',
      currency,
      ['No invoice records found. Revenue is not invented.'],
      'Revenue report unavailable — no real invoices for this tenant.',
      generatedAt,
    );
  }

  const totalCents = invoices.reduce(
    (sum, inv) => sum + Math.max(0, inv.totalCents || inv.amountCents),
    0,
  );
  const byStatus = new Map<string, { amountCents: number; count: number }>();
  for (const inv of invoices) {
    const bucket = byStatus.get(inv.status) ?? { amountCents: 0, count: 0 };
    bucket.amountCents += Math.max(0, inv.totalCents || inv.amountCents);
    bucket.count += 1;
    byStatus.set(inv.status, bucket);
  }

  const series = buildMonthlySeries(
    invoices.map((inv) => ({
      at: toDate(inv.issuedAt) ?? new Date(inv.createdAt),
      amountCents: inv.totalCents || inv.amountCents,
    })),
    now,
  );

  const dates = invoices
    .map((i) => toDate(i.issuedAt) ?? new Date(i.createdAt))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    kind: 'revenue',
    availability: 'available',
    currency,
    periodStart: dates[0]?.toISOString() ?? null,
    periodEnd: dates[dates.length - 1]?.toISOString() ?? null,
    totalCents,
    lineCount: invoices.length,
    lines: [...byStatus.entries()].map(([status, v]) => ({
      key: status,
      label: `Invoices · ${status}`,
      amountCents: v.amountCents,
      count: v.count,
      note: null,
    })),
    series,
    gaps: [],
    summary: `Revenue from ${invoices.length} real invoice(s): ${formatFinanceAuraCents(totalCents, currency)}.`,
    generatedAt,
  };
}

export function buildFrfPaymentReport(input: {
  currency?: string;
  payments: Array<{
    id: string;
    amountCents: number;
    method: string | null;
    paidAt: string | Date;
    invoiceId: string | null;
  }>;
  now?: Date;
}): FrfReportResult {
  const currency = input.currency ?? 'ZAR';
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();

  if (input.payments.length === 0) {
    return emptyReport(
      'payment',
      currency,
      ['No payment records found. Payment totals are not invented.'],
      'Payment report unavailable — no real payments for this tenant.',
      generatedAt,
    );
  }

  const totalCents = input.payments.reduce(
    (sum, p) => sum + Math.max(0, p.amountCents),
    0,
  );
  const byMethod = new Map<string, { amountCents: number; count: number }>();
  for (const p of input.payments) {
    const key = p.method?.trim() || 'unspecified';
    const bucket = byMethod.get(key) ?? { amountCents: 0, count: 0 };
    bucket.amountCents += Math.max(0, p.amountCents);
    bucket.count += 1;
    byMethod.set(key, bucket);
  }

  const series = buildMonthlySeries(
    input.payments.map((p) => ({
      at: new Date(p.paidAt),
      amountCents: p.amountCents,
    })),
    now,
  );

  const dates = input.payments
    .map((p) => new Date(p.paidAt))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    kind: 'payment',
    availability: 'available',
    currency,
    periodStart: dates[0]?.toISOString() ?? null,
    periodEnd: dates[dates.length - 1]?.toISOString() ?? null,
    totalCents,
    lineCount: input.payments.length,
    lines: [...byMethod.entries()].map(([method, v]) => ({
      key: method,
      label: `Payments · ${method}`,
      amountCents: v.amountCents,
      count: v.count,
      note: null,
    })),
    series,
    gaps: [],
    summary: `Payments from ${input.payments.length} real payment(s): ${formatFinanceAuraCents(totalCents, currency)}.`,
    generatedAt,
  };
}

export function buildFrfExpenseReport(input: {
  currency?: string;
  purchaseOrders: Array<{
    id: string;
    status: string;
    totalCostCents: number;
    createdAt: string | Date;
  }>;
  now?: Date;
}): FrfReportResult {
  const currency = input.currency ?? 'ZAR';
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();

  if (input.purchaseOrders.length === 0) {
    return emptyReport(
      'expense',
      currency,
      [
        'No purchase order expense records found. Operating expenses outside procurement are not invented.',
      ],
      'Expense report unavailable — no real procurement cost records for this tenant.',
      generatedAt,
    );
  }

  const relevant = input.purchaseOrders.filter((po) =>
    ['approved', 'ordered', 'received', 'completed'].includes(po.status),
  );
  const totalCents = relevant.reduce(
    (sum, po) => sum + Math.max(0, po.totalCostCents),
    0,
  );
  const byStatus = new Map<string, { amountCents: number; count: number }>();
  for (const po of relevant) {
    const bucket = byStatus.get(po.status) ?? { amountCents: 0, count: 0 };
    bucket.amountCents += Math.max(0, po.totalCostCents);
    bucket.count += 1;
    byStatus.set(po.status, bucket);
  }

  const series = buildMonthlySeries(
    relevant.map((po) => ({
      at: new Date(po.createdAt),
      amountCents: po.totalCostCents,
    })),
    now,
  );

  return {
    kind: 'expense',
    availability: 'available',
    currency,
    periodStart: null,
    periodEnd: null,
    totalCents,
    lineCount: relevant.length,
    lines: [...byStatus.entries()].map(([status, v]) => ({
      key: status,
      label: `PO expense · ${status}`,
      amountCents: v.amountCents,
      count: v.count,
      note: null,
    })),
    series,
    gaps:
      relevant.length < input.purchaseOrders.length
        ? [
            'Draft/cancelled purchase orders excluded from expense total.',
          ]
        : [],
    summary: `Expense from ${relevant.length} procurement PO(s): ${formatFinanceAuraCents(totalCents, currency)}.`,
    generatedAt,
  };
}

export function buildFrfInvoiceReport(input: {
  currency?: string;
  invoices: Array<{ id: string; invoiceNumber: string | null; status: string; totalCents: number; amountCents: number; amountPaidCents: number; dueDate: string | Date | null; issuedAt: string | Date | null; createdAt: string | Date; customerId: string | null; }>;
  now?: Date;
}): FrfReportResult {
  const currency = input.currency ?? 'ZAR'; const now = input.now ?? new Date(); const generatedAt = now.toISOString();
  const invoices = input.invoices.filter((i) => i.status !== 'cancelled');
  if (invoices.length === 0) return emptyReport('invoice', currency, ['No invoice records found. Invoice ageing/totals are not invented.'], 'Invoice report unavailable — no real invoices for this tenant.', generatedAt);
  let outstandingCents = 0, overdueCents = 0, overdueCount = 0;
  const byStatus = new Map<string, { amountCents: number; count: number }>();
  for (const inv of invoices) {
    const total = Math.max(0, inv.totalCents || inv.amountCents);
    const outstanding = Math.max(0, total - inv.amountPaidCents);
    outstandingCents += outstanding;
    const due = toDate(inv.dueDate);
    const isOverdue = outstanding > 0 && (inv.status === 'overdue' || (due != null && due.getTime() < now.getTime()));
    if (isOverdue) { overdueCents += outstanding; overdueCount += 1; }
    const bucket = byStatus.get(inv.status) ?? { amountCents: 0, count: 0 };
    bucket.amountCents += total; bucket.count += 1; byStatus.set(inv.status, bucket);
  }
  const totalCents = invoices.reduce((sum, inv) => sum + Math.max(0, inv.totalCents || inv.amountCents), 0);
  const lines: FrfReportLine[] = [
    { key: 'outstanding', label: 'Outstanding receivables', amountCents: outstandingCents, count: invoices.filter((i) => (i.totalCents || i.amountCents) - i.amountPaidCents > 0).length, note: 'From real TITAN invoice balances.' },
    { key: 'overdue', label: 'Overdue', amountCents: overdueCents, count: overdueCount, note: overdueCount === 0 ? null : 'Due date passed or status=overdue.' },
    ...[...byStatus.entries()].map(([status, v]) => ({ key: `status_${status}`, label: `Status · ${status}`, amountCents: v.amountCents, count: v.count, note: null as string | null })),
  ];
  const series = buildMonthlySeries(invoices.map((inv) => ({ at: toDate(inv.issuedAt) ?? new Date(inv.createdAt), amountCents: inv.totalCents || inv.amountCents })), now);
  return { kind: 'invoice', availability: 'available', currency, periodStart: null, periodEnd: null, totalCents, lineCount: invoices.length, lines, series, gaps: [], summary: `Invoice report: ${invoices.length} invoice(s), total ${formatFinanceAuraCents(totalCents, currency)}, outstanding ${formatFinanceAuraCents(outstandingCents, currency)}, overdue ${formatFinanceAuraCents(overdueCents, currency)}.`, generatedAt };
}

export function buildFrfJobReport(input: {
  currency?: string;
  jobs: Array<{
    id: string;
    jobNumber: string | null;
    title: string;
    jobType: string | null;
    status: string | null;
  }>;
  invoices: Array<{
    id: string;
    jobId: string | null;
    status: string;
    totalCents: number;
    amountCents: number;
  }>;
  now?: Date;
}): FrfReportResult {
  const currency = input.currency ?? 'ZAR';
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();

  const linked = input.invoices.filter(
    (inv) => inv.jobId && inv.status !== 'cancelled',
  );
  if (input.jobs.length === 0 && linked.length === 0) {
    return emptyReport(
      'job',
      currency,
      ['No jobs or job-linked invoices found. Job revenue is not invented.'],
      'Job report unavailable — no real job/invoice linkage for this tenant.',
      generatedAt,
    );
  }

  const revenueByJob = new Map<string, number>();
  for (const inv of linked) {
    if (!inv.jobId) continue;
    revenueByJob.set(
      inv.jobId,
      (revenueByJob.get(inv.jobId) ?? 0) + Math.max(0, inv.totalCents || inv.amountCents),
    );
  }

  const lines: FrfReportLine[] = input.jobs.slice(0, 50).map((job) => {
    const amount = revenueByJob.get(job.id) ?? null;
    return {
      key: job.id,
      label: job.jobNumber ? `${job.jobNumber} · ${job.title}` : job.title,
      amountCents: amount,
      count: amount == null ? 0 : 1,
      note:
        amount == null
          ? 'No linked invoice revenue for this job.'
          : job.jobType
            ? `Type: ${job.jobType}`
            : null,
    };
  });

  const totalCents = [...revenueByJob.values()].reduce((a, b) => a + b, 0);
  const gaps: string[] = [];
  if (linked.length === 0) {
    gaps.push('Jobs exist but no job-linked invoices — revenue per job unavailable.');
  }

  return {
    kind: 'job',
    availability: linked.length > 0 || input.jobs.length > 0 ? 'available' : 'unavailable',
    currency,
    periodStart: null,
    periodEnd: null,
    totalCents: linked.length > 0 ? totalCents : null,
    lineCount: lines.length,
    lines,
    series: [],
    gaps,
    summary:
      linked.length > 0
        ? `Job report: ${revenueByJob.size} job(s) with linked invoice revenue totalling ${formatFinanceAuraCents(totalCents, currency)}.`
        : `Job report: ${input.jobs.length} job(s) listed; invoice revenue linkage unavailable.`,
    generatedAt,
  };
}

export function buildFrfJobProfitabilityReport(input: {
  currency?: string;
  jobs: Array<{ jobId: string; jobNumber: string | null; title: string; revenueCents: number; costCents: number | null; marginCents: number | null; costAvailability: 'available' | 'unavailable'; costGapReason: string | null; }>;
  now?: Date;
}): FrfReportResult {
  const currency = input.currency ?? 'ZAR'; const now = input.now ?? new Date(); const generatedAt = now.toISOString();
  if (input.jobs.length === 0) return emptyReport('job_profitability', currency, ['No job profitability rows from real job-linked invoices/costs. Margins are not invented.'], 'Job profitability report unavailable — insufficient real job/invoice/cost records.', generatedAt);
  const withCost = input.jobs.filter((j) => j.costAvailability === 'available');
  const revenueCents = input.jobs.reduce((s, j) => s + Math.max(0, j.revenueCents), 0);
  const costCents = withCost.length > 0 ? withCost.reduce((s, j) => s + Math.max(0, j.costCents ?? 0), 0) : null;
  const marginCents = costCents == null ? null : revenueCents - costCents;
  const lines: FrfReportLine[] = input.jobs.slice(0, 50).map((job) => ({
    key: job.jobId, label: job.jobNumber ? `${job.jobNumber} · ${job.title}` : job.title, amountCents: job.marginCents, count: 1,
    note: job.costAvailability === 'unavailable' ? job.costGapReason ?? 'Cost unavailable — margin not invented.' : `Revenue ${formatFinanceAuraCents(job.revenueCents, currency)}; cost ${formatFinanceAuraCents(job.costCents ?? 0, currency)}.`,
  }));
  const gaps: string[] = [];
  if (withCost.length === 0) gaps.push('Job revenue listed from invoices; unit-cost data missing — margins unavailable (not invented).');
  else if (withCost.length < input.jobs.length) gaps.push(`${input.jobs.length - withCost.length} job(s) lack real cost data — those margins shown as unavailable.`);
  return { kind: 'job_profitability', availability: 'available', currency, periodStart: null, periodEnd: null, totalCents: marginCents, lineCount: lines.length, lines, series: [], gaps, summary: marginCents == null ? `Job profitability: ${input.jobs.length} job(s), revenue ${formatFinanceAuraCents(revenueCents, currency)}; margins unavailable without real costs.` : `Job profitability: ${withCost.length}/${input.jobs.length} job(s) with cost data; margin ${formatFinanceAuraCents(marginCents, currency)}.`, generatedAt };
}

export function buildFrfProfitReport(input: {
  currency?: string;
  revenueCents: number | null;
  costCents: number | null;
  marginCents: number | null;
  jobsWithCostData: number;
  jobCount: number;
  gaps?: string[];
  now?: Date;
}): FrfReportResult {
  const currency = input.currency ?? 'ZAR';
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();

  if (input.revenueCents == null && input.costCents == null) {
    return emptyReport(
      'profit',
      currency,
      input.gaps ?? [
        'Profit unavailable — need job-linked invoices and/or real cost data. Margins are not invented.',
      ],
      'Profit report unavailable — insufficient real revenue/cost records.',
      generatedAt,
    );
  }

  const lines: FrfReportLine[] = [
    {
      key: 'revenue',
      label: 'Revenue (job-linked invoices)',
      amountCents: input.revenueCents,
      count: input.jobCount,
      note: null,
    },
    {
      key: 'cost',
      label: 'Cost (material unit costs when present)',
      amountCents: input.costCents,
      count: input.jobsWithCostData,
      note:
        input.costCents == null
          ? 'Cost unavailable — no real unit_cost_cents on material lines.'
          : null,
    },
    {
      key: 'margin',
      label: 'Gross margin',
      amountCents: input.marginCents,
      count: input.jobsWithCostData,
      note:
        input.marginCents == null
          ? 'Margin unavailable without both revenue and cost.'
          : null,
    },
  ];

  const gaps = [...(input.gaps ?? [])];
  if (input.costCents == null) {
    gaps.push('Cost/margin unavailable without real material unit costs.');
  }

  return {
    kind: 'profit',
    availability: 'available',
    currency,
    periodStart: null,
    periodEnd: null,
    totalCents: input.marginCents,
    lineCount: lines.length,
    lines,
    series: [],
    gaps,
    summary:
      input.marginCents == null
        ? `Profit report: revenue ${
            input.revenueCents == null
              ? 'unavailable'
              : formatFinanceAuraCents(input.revenueCents, currency)
          }; margin unavailable without cost data.`
        : `Profit report: margin ${formatFinanceAuraCents(input.marginCents, currency)} from ${input.jobsWithCostData}/${input.jobCount} job(s) with cost data.`,
    generatedAt,
  };
}

/**
 * Transparent forecasting: average of months with activity, projected forward.
 * Returns insufficient_history (projected null) when fewer than min months have data.
 */
export function buildFrfForecast(input: {
  kind: FrfForecastKind;
  currency?: string;
  historySeries: FrfPeriodPoint[];
  horizonMonths?: number;
  minHistoryMonths?: number;
  now?: Date;
  extraAssumptions?: FrfForecastAssumption[];
  gaps?: string[];
}): FrfForecastResult {
  const currency = input.currency ?? 'ZAR';
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const horizon = Math.min(Math.max(input.horizonMonths ?? 3, 1), 12);
  const minHistory = input.minHistoryMonths ?? FRF_MIN_HISTORY_MONTHS;

  const activeMonths = input.historySeries.filter((p) => p.amountCents > 0);
  const historyMonthsUsed = activeMonths.length;

  const methodology =
    input.kind === 'budget_planning'
      ? 'Budget planning compares Owner-entered budget targets to actual TITAN revenue/expense when available. No forward projection is invented beyond stated averages of real history.'
      : 'Simple historical average of months with recorded activity, projected flat across the horizon. This is a transparent heuristic — not a guaranteed outcome, bank balance, or accounting forecast.';

  const assumptions: FrfForecastAssumption[] = [
    {
      key: 'method',
      label: 'Method',
      value: 'Average of months with non-zero recorded activity (flat projection).',
    },
    {
      key: 'min_history',
      label: 'Minimum history',
      value: `${minHistory} month(s) with activity required before any projection is shown.`,
    },
    {
      key: 'horizon',
      label: 'Horizon',
      value: `${horizon} month(s)`,
    },
    {
      key: 'history_used',
      label: 'History months with activity',
      value: String(historyMonthsUsed),
    },
    {
      key: 'not_a_fact',
      label: 'Honesty',
      value:
        'Projections are labeled forecasts with assumptions — never presented as recorded facts.',
    },
    ...(input.extraAssumptions ?? []),
  ];

  const gaps = [...(input.gaps ?? [])];
  const activeAmounts = activeMonths.map((p) => p.amountCents);
  if (input.historySeries.every((p) => p.amountCents === 0) && historyMonthsUsed === 0) {
    const conf = computeFrfForecastConfidence({ availability: 'unavailable', historyMonthsUsed: 0, activeAmountsCents: [] });
    return { kind: input.kind, availability: 'unavailable', currency, methodology, assumptions, confidence: conf.confidence, confidenceRationale: conf.rationale, historyMonthsUsed: 0, minHistoryRequired: minHistory, historySeries: input.historySeries, projectedSeries: null, projectedTotalCents: null, gaps: [...gaps, 'No historical activity found. Forecast values are not invented.'], summary: `${input.kind} forecast unavailable — no real history for this tenant.`, generatedAt };
  }
  if (historyMonthsUsed < minHistory) {
    const conf = computeFrfForecastConfidence({ availability: 'insufficient_history', historyMonthsUsed, activeAmountsCents: activeAmounts });
    return { kind: input.kind, availability: 'insufficient_history', currency, methodology, assumptions, confidence: conf.confidence, confidenceRationale: conf.rationale, historyMonthsUsed, minHistoryRequired: minHistory, historySeries: input.historySeries, projectedSeries: null, projectedTotalCents: null, gaps: [...gaps, `Only ${historyMonthsUsed} month(s) with activity; need at least ${minHistory}. Projection withheld.`], summary: `${input.kind} forecast insufficient_history — ${historyMonthsUsed}/${minHistory} active month(s). No projection fabricated.`, generatedAt };
  }
  const avg = Math.round(activeMonths.reduce((sum, p) => sum + p.amountCents, 0) / historyMonthsUsed);
  const lastKey = input.historySeries[input.historySeries.length - 1]?.periodKey ?? monthKey(now);
  const projectedSeries: FrfPeriodPoint[] = [];
  for (let i = 1; i <= horizon; i += 1) {
    const key = addMonths(lastKey, i);
    projectedSeries.push({ periodKey: key, label: `${monthLabel(key)} (forecast)`, amountCents: avg });
  }
  const projectedTotalCents = projectedSeries.reduce((s, p) => s + p.amountCents, 0);
  const conf = computeFrfForecastConfidence({ availability: 'available', historyMonthsUsed, activeAmountsCents: activeAmounts });
  return { kind: input.kind, availability: 'available', currency, methodology, assumptions: [...assumptions, { key: 'average_cents', label: 'Average monthly activity used', value: formatFinanceAuraCents(avg, currency) }, { key: 'confidence', label: 'Confidence', value: `${conf.confidence} — ${conf.rationale}` }], confidence: conf.confidence, confidenceRationale: conf.rationale, historyMonthsUsed, minHistoryRequired: minHistory, historySeries: input.historySeries, projectedSeries, projectedTotalCents, gaps, summary: `${input.kind} forecast (heuristic, confidence=${conf.confidence}): ${formatFinanceAuraCents(avg, currency)}/mo average × ${horizon} mo = ${formatFinanceAuraCents(projectedTotalCents, currency)}. Assumptions disclosed — not a recorded fact.`, generatedAt };
}


export function buildFrfBudgetPlanVariance(input: {
  budgetedRevenueCents: number | null;
  budgetedExpenseCents: number | null;
  actualRevenueCents: number | null;
  actualExpenseCents: number | null;
}): {
  revenueVarianceCents: number | null;
  expenseVarianceCents: number | null;
} {
  return {
    revenueVarianceCents:
      input.budgetedRevenueCents == null || input.actualRevenueCents == null
        ? null
        : input.actualRevenueCents - input.budgetedRevenueCents,
    expenseVarianceCents:
      input.budgetedExpenseCents == null || input.actualExpenseCents == null
        ? null
        : input.actualExpenseCents - input.budgetedExpenseCents,
  };
}

export function buildFrfInsightDraftsFromSignals(input: {
  revenue: FrfReportResult;
  payment: FrfReportResult;
  expense: FrfReportResult;
  revenueForecast: FrfForecastResult;
  cashflowForecast: FrfForecastResult;
}): Array<Omit<CreateFrfInsightRequest, never>> {
  const drafts: CreateFrfInsightRequest[] = [];

  if (input.revenue.availability === 'available' && input.revenue.totalCents != null) {
    drafts.push({
      target: 'command_centre',
      title: 'Revenue report insight',
      insight: input.revenue.summary,
      href: '/finance-reporting-forecast',
    });
  }

  if (
    input.payment.availability === 'available' &&
    input.expense.availability === 'available' &&
    input.payment.totalCents != null &&
    input.expense.totalCents != null
  ) {
    drafts.push({
      target: 'executive_dashboard',
      title: 'Payment vs procurement expense',
      insight: [
        `Payments ${formatFinanceAuraCents(input.payment.totalCents, input.payment.currency)}`,
        `vs procurement expense ${formatFinanceAuraCents(input.expense.totalCents, input.expense.currency)}.`,
        'From real TITAN records only.',
      ].join(' '),
      href: '/finance-reporting-forecast',
    });
  }

  if (input.revenueForecast.availability === 'insufficient_history') {
    drafts.push({
      target: 'command_centre',
      title: 'Revenue forecast withheld',
      insight: input.revenueForecast.summary,
      href: '/finance-reporting-forecast',
    });
  } else if (
    input.revenueForecast.availability === 'available' &&
    input.revenueForecast.projectedTotalCents != null
  ) {
    drafts.push({
      target: 'executive_dashboard',
      title: 'Revenue forecast (assumptions disclosed)',
      insight: input.revenueForecast.summary,
      href: '/finance-reporting-forecast',
    });
  }

  if (input.cashflowForecast.availability === 'available') {
    drafts.push({
      target: 'command_centre',
      title: 'Cashflow forecast (heuristic)',
      insight: input.cashflowForecast.summary,
      href: '/finance-reporting-forecast',
    });
  }

  return drafts;
}

export function buildFrfActionDraftsFromSignals(input: {
  revenueForecast: FrfForecastResult;
  expense: FrfReportResult;
  payment: FrfReportResult;
}): CreateFrfActionRequest[] {
  const drafts: CreateFrfActionRequest[] = [];

  if (input.revenueForecast.availability === 'insufficient_history') {
    drafts.push({
      kind: 'review_forecast',
      title: 'Accumulate history before relying on forecasts',
      recommendation:
        'Revenue forecast is insufficient_history. Owner should continue recording invoices/payments; TITAN will not invent projections.',
      submitForApproval: true,
    });
  }

  if (
    input.expense.availability === 'available' &&
    input.payment.availability === 'available' &&
    input.expense.totalCents != null &&
    input.payment.totalCents != null &&
    input.expense.totalCents > input.payment.totalCents
  ) {
    drafts.push({
      kind: 'expense_review',
      title: 'Procurement expense exceeds payment inflow',
      recommendation: [
        `Procurement expense ${formatFinanceAuraCents(input.expense.totalCents, input.expense.currency)}`,
        `exceeds payments ${formatFinanceAuraCents(input.payment.totalCents, input.payment.currency)}.`,
        'Draft for Owner approval — no ledger mutation executed.',
      ].join(' '),
      submitForApproval: true,
    });
  }

  if (input.revenueForecast.availability === 'available') {
    drafts.push({
      kind: 'executive_brief',
      title: 'Send forecast assumptions to Command Centre',
      recommendation:
        'Owner may hand off the disclosed-assumption revenue forecast insight to AURA Command Centre / Executive Dashboard. Nothing auto-executes.',
      submitForApproval: true,
    });
  }

  return drafts;
}
