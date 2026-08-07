/**
 * Cashflow & Profit Intelligence (Department 4.2)
 *
 * Extends Finance AURA Agent Foundation with cashflow and profit intelligence
 * grounded in real TITAN invoices, payments, jobs, procurement costs, and
 * inventory unit costs when present. Never invents balances or margins.
 *
 * Invariants:
 * - No fake financial numbers; unavailable when insufficient real data
 * - Inventory costs only contribute when real unit_cost_cents > 0 exist
 * - Owner approval required for recommended actions; never auto-execute
 * - Technician / Client denied; Owner + finance RBAC only
 */

import {
  canAccessFinanceAuraAgent,
  canApproveFinanceAuraAgent,
  canWriteFinanceAuraAgent,
  formatFinanceAuraCents,
} from './finance-aura-agent.js';
import {
  computeJobGrossProfitCents,
  materialLineCostCents,
  sumMaterialLinesCents,
} from './job-costing.js';

export type FcpAvailability = 'available' | 'unavailable';

export type FcpInsightKind =
  | 'cashflow_risk'
  | 'cashflow_opportunity'
  | 'cost_problem'
  | 'profit_improvement'
  | 'margin_warning'
  | 'receivables_pressure'
  | 'expense_concentration'
  | 'poor_performing_service'
  | 'outstanding_money'
  | 'labour_cost_gap'
  | 'profit_opportunity';

export type FcpInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type FcpActionKind =
  | 'collections_push'
  | 'expense_review'
  | 'margin_review'
  | 'job_cost_review'
  | 'cash_position_review'
  | 'inventory_cost_gap'
  | 'aura_handoff';

export type FcpActionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type FcpTrendPoint = {
  periodKey: string;
  label: string;
  incomeCents: number;
  expenseCents: number | null;
  netCents: number | null;
};

export type FcpCashflowIntelligence = {
  availability: FcpAvailability;
  currency: string;
  incomeCents: number | null;
  /** Payments received in the last 30 days (real paidAt rows). */
  incomingPaymentsCents: number | null;
  incomingPaymentCount: number;
  expenseCents: number | null;
  /** Income − expense when both available; otherwise null. */
  cashPositionCents: number | null;
  outstandingReceivableCents: number | null;
  overdueAmountCents: number | null;
  overdueInvoiceCount: number;
  paymentCount: number;
  invoiceCount: number;
  purchaseOrderExpenseCents: number | null;
  purchaseOrderCount: number;
  trends: FcpTrendPoint[];
  /** Explicit cashflow risk signals grounded in real data. */
  risks: string[];
  warnings: string[];
  gaps: string[];
  summary: string;
  xero: {
    availability: FcpAvailability;
    invoicesWithXeroNumber: number;
    paymentsWithXeroId: number;
    rationale: string;
  };
};

export type FcpJobProfitRow = {
  jobId: string;
  jobNumber: string | null;
  title: string;
  jobType: string | null;
  revenueCents: number;
  /** Material cost only when real unit_cost_cents > 0. */
  costCents: number | null;
  materialCostCents: number | null;
  labourMinutes: number | null;
  /** Always null until a real hourly rate exists in TITAN. */
  labourCostCents: number | null;
  marginCents: number | null;
  marginBps: number | null;
  costAvailability: FcpAvailability;
  costGapReason: string | null;
};

export type FcpServiceProfitRow = {
  serviceKey: string;
  jobCount: number;
  revenueCents: number;
  costCents: number | null;
  marginCents: number | null;
  marginBps: number | null;
  costAvailability: FcpAvailability;
};

export type FcpProfitIntelligence = {
  availability: FcpAvailability;
  currency: string;
  revenueCents: number | null;
  /** Material costs only (real unit costs); labour $ never invented. */
  costCents: number | null;
  materialCostCents: number | null;
  labourMinutesTotal: number | null;
  labourCostCents: number | null;
  labourCostAvailability: FcpAvailability;
  labourCostRationale: string;
  marginCents: number | null;
  marginBps: number | null;
  jobCount: number;
  jobsWithCostData: number;
  inventoryCostAvailability: FcpAvailability;
  inventoryCostRationale: string;
  byJob: FcpJobProfitRow[];
  byService: FcpServiceProfitRow[];
  gaps: string[];
  summary: string;
};

export type FcpInsightSummary = {
  id: string;
  kind: FcpInsightKind;
  status: FcpInsightStatus;
  title: string;
  body: string;
  metricLabel: string | null;
  metricValueCents: number | null;
  currency: string | null;
  sourceInvoiceCount: number;
  sourcePaymentCount: number;
  sourceJobCount: number;
  createdAt: string;
};

export type FcpActionSummary = {
  id: string;
  kind: FcpActionKind;
  status: FcpActionStatus;
  title: string;
  recommendation: string;
  sourceInvoiceId: string | null;
  sourceJobId: string | null;
  sourceInsightId: string | null;
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type FcpAuraConnection = {
  target:
    | 'finance_aura_agent'
    | 'command_centre'
    | 'finance_invoices'
    | 'finance_payments'
    | 'xero_settings'
    | 'inventory'
    | 'jobs';
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type FcpDashboard = {
  summary: string;
  productClarification: {
    financeAuraAgent: string;
    existingFinance: string;
    thisLayer: string;
  };
  policy: {
    autoExecuteEnabled: false;
    requiresOwnerApproval: true;
    technicianClientDenied: true;
    fakeDataInvented: false;
  };
  cashflow: FcpCashflowIntelligence;
  profit: FcpProfitIntelligence;
  insights: FcpInsightSummary[];
  actions: FcpActionSummary[];
  auraConnections: FcpAuraConnection[];
  pendingApprovals: number;
};

export type CreateFcpActionRequest = {
  kind: FcpActionKind;
  title: string;
  recommendation: string;
  sourceInvoiceId?: string;
  sourceJobId?: string;
  sourceInsightId?: string;
  submitForApproval?: boolean;
};

export type DecideFcpActionRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type AcknowledgeFcpInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access (extends Finance AURA Agent RBAC) ─────────────────────────────────

export function canAccessFinanceCashflowProfit(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessFinanceAuraAgent(identity);
}

export function canWriteFinanceCashflowProfit(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canWriteFinanceAuraAgent(identity);
}

export function canApproveFinanceCashflowProfit(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canApproveFinanceAuraAgent(identity);
}

export const FCP_PRODUCT_COPY = {
  financeAuraAgent:
    'Finance AURA Agent Foundation remains the Owner-gated recommendations / insights / alerts layer. This module extends it with cashflow and profit intelligence.',
  existingFinance:
    'Core Finance invoices, payments, jobs, procurement POs, and inventory unit costs remain the system of record. Values are never invented.',
  thisLayer:
    'Cashflow & Profit Intelligence computes income, expense, cash position, trends, job/service profitability, and draft AURA insights from real TITAN data only. Recommended actions require Owner approval and never auto-execute.',
} as const;

export function listFcpAuraConnections(): FcpAuraConnection[] {
  return [
    {
      target: 'finance_aura_agent',
      label: 'Finance AURA Agent',
      href: '/finance-aura-agent',
      status: 'available_link',
      note: 'Parent finance intelligence agent — recommendations and alerts foundation.',
    },
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura-command-centre',
      status: 'available_link',
      note: 'Executive handoff surface for Owner-reviewed finance insights.',
    },
    {
      target: 'finance_invoices',
      label: 'Invoices',
      href: '/finance/invoices',
      status: 'available_link',
      note: 'Real invoice ledger used for income and receivables.',
    },
    {
      target: 'finance_payments',
      label: 'Payments',
      href: '/finance/payments',
      status: 'available_link',
      note: 'Real payment ledger used for cash inflow tracking.',
    },
    {
      target: 'xero_settings',
      label: 'Xero connection',
      href: '/integrations/xero',
      status: 'available_link',
      note: 'Xero-imported markers on invoices/payments when present — not invented live API calls.',
    },
    {
      target: 'inventory',
      label: 'Inventory',
      href: '/inventory',
      status: 'available_link',
      note: 'Unit costs contribute to profit only when real cost data exists.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Job revenue and material cost lines for profitability.',
    },
  ];
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

export function unavailableFcpCashflow(currency = 'ZAR'): FcpCashflowIntelligence {
  return {
    availability: 'unavailable',
    currency,
    incomeCents: null,
    incomingPaymentsCents: null,
    incomingPaymentCount: 0,
    expenseCents: null,
    cashPositionCents: null,
    outstandingReceivableCents: null,
    overdueAmountCents: null,
    overdueInvoiceCount: 0,
    paymentCount: 0,
    invoiceCount: 0,
    purchaseOrderExpenseCents: null,
    purchaseOrderCount: 0,
    trends: [],
    risks: [],
    warnings: [],
    gaps: [
      'No invoice or payment records found for this tenant. Cashflow figures are not invented.',
    ],
    summary:
      'Cashflow intelligence unavailable — no real invoice/payment data for this tenant yet.',
    xero: {
      availability: 'unavailable',
      invoicesWithXeroNumber: 0,
      paymentsWithXeroId: 0,
      rationale: 'No Xero-linked invoice/payment markers found. Status is not invented.',
    },
  };
}

export function unavailableFcpProfit(currency = 'ZAR'): FcpProfitIntelligence {
  return {
    availability: 'unavailable',
    currency,
    revenueCents: null,
    costCents: null,
    materialCostCents: null,
    labourMinutesTotal: null,
    labourCostCents: null,
    labourCostAvailability: 'unavailable',
    labourCostRationale:
      'No timesheet / mobile time entries, and no hourly labour rate in TITAN — labour $ is never invented.',
    marginCents: null,
    marginBps: null,
    jobCount: 0,
    jobsWithCostData: 0,
    inventoryCostAvailability: 'unavailable',
    inventoryCostRationale:
      'No job-linked invoices or material cost lines with real unit costs found.',
    byJob: [],
    byService: [],
    gaps: [
      'Profit intelligence unavailable — need job-linked invoices and/or material cost data.',
    ],
    summary:
      'Profit intelligence unavailable — insufficient real job/invoice/cost records. Margins are not invented.',
  };
}

export function buildFcpCashflowIntelligence(input: {
  currency?: string;
  invoices: Array<{
    id: string;
    status: string;
    totalCents: number;
    amountCents: number;
    amountPaidCents: number;
    dueDate: string | Date | null;
    issuedAt: string | Date | null;
    createdAt: string | Date;
    xeroInvoiceNumber: string | null;
  }>;
  payments: Array<{
    id: string;
    amountCents: number;
    paidAt: string | Date;
    xeroPaymentId: string | null;
  }>;
  purchaseOrders: Array<{
    id: string;
    status: string;
    totalCostCents: number;
    createdAt: string | Date;
  }>;
  now?: Date;
}): FcpCashflowIntelligence {
  const currency = input.currency ?? 'ZAR';
  const now = input.now ?? new Date();

  if (input.invoices.length === 0 && input.payments.length === 0) {
    return unavailableFcpCashflow(currency);
  }

  const incomeCents = input.payments.reduce((sum, p) => sum + Math.max(0, p.amountCents), 0);

  const openPoStatuses = new Set(['approved', 'ordered', 'received', 'completed']);
  const relevantPos = input.purchaseOrders.filter((po) => openPoStatuses.has(po.status));
  const purchaseOrderExpenseCents = relevantPos.reduce(
    (sum, po) => sum + Math.max(0, po.totalCostCents),
    0,
  );
  const expenseAvailable = input.purchaseOrders.length > 0;
  const expenseCents = expenseAvailable ? purchaseOrderExpenseCents : null;

  const outstandingReceivableCents = input.invoices
    .filter((inv) => ['sent', 'partial', 'overdue'].includes(inv.status))
    .reduce(
      (sum, inv) =>
        sum + Math.max(0, (inv.totalCents || inv.amountCents) - inv.amountPaidCents),
      0,
    );

  let overdueInvoiceCount = 0;
  let overdueAmountCents = 0;
  for (const inv of input.invoices) {
    if (inv.status === 'cancelled' || inv.status === 'draft' || inv.status === 'paid') continue;
    const total = inv.totalCents || inv.amountCents;
    const outstanding = Math.max(0, total - inv.amountPaidCents);
    if (outstanding <= 0) continue;
    const due = inv.dueDate ? new Date(inv.dueDate) : null;
    if (inv.status === 'overdue' || (due && due.getTime() < now.getTime())) {
      overdueInvoiceCount += 1;
      overdueAmountCents += outstanding;
    }
  }

  const invoicesWithXeroNumber = input.invoices.filter((i) => Boolean(i.xeroInvoiceNumber)).length;
  const paymentsWithXeroId = input.payments.filter((p) => Boolean(p.xeroPaymentId)).length;
  const xeroAvailable = invoicesWithXeroNumber > 0 || paymentsWithXeroId > 0;

  // Build last 6 calendar months of trends from payments (income) and POs (expense).
  const trendMap = new Map<string, { incomeCents: number; expenseCents: number }>();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    trendMap.set(key, { incomeCents: 0, expenseCents: 0 });
  }
  for (const p of input.payments) {
    const key = monthKey(new Date(p.paidAt));
    const bucket = trendMap.get(key);
    if (bucket) bucket.incomeCents += Math.max(0, p.amountCents);
  }
  for (const po of relevantPos) {
    const key = monthKey(new Date(po.createdAt));
    const bucket = trendMap.get(key);
    if (bucket) bucket.expenseCents += Math.max(0, po.totalCostCents);
  }

  const trends: FcpTrendPoint[] = [...trendMap.entries()].map(([periodKey, v]) => ({
    periodKey,
    label: monthLabel(periodKey),
    incomeCents: v.incomeCents,
    expenseCents: expenseAvailable ? v.expenseCents : null,
    netCents: expenseAvailable ? v.incomeCents - v.expenseCents : null,
  }));

  const gaps: string[] = [];
  if (!expenseAvailable) {
    gaps.push(
      'Expense / cash outflow is unavailable — no purchase order records found. TITAN does not invent operating expenses.',
    );
  }
  if (!xeroAvailable) {
    gaps.push('No Xero-imported invoice/payment markers found for this tenant.');
  }

  const warnings: string[] = [];
  if (overdueInvoiceCount > 0) {
    warnings.push(
      `${overdueInvoiceCount} overdue invoice(s) totalling ${formatFinanceAuraCents(overdueAmountCents, currency)}.`,
    );
  }
  if (expenseAvailable && expenseCents != null && incomeCents > 0 && expenseCents > incomeCents) {
    warnings.push(
      `Recorded procurement outflow (${formatFinanceAuraCents(expenseCents, currency)}) exceeds payment inflow (${formatFinanceAuraCents(incomeCents, currency)}).`,
    );
  }
  if (outstandingReceivableCents > incomeCents && incomeCents >= 0) {
    warnings.push(
      `Outstanding receivables (${formatFinanceAuraCents(outstandingReceivableCents, currency)}) exceed recorded payment inflow.`,
    );
  }

  const cashPositionCents =
    expenseCents == null ? null : incomeCents - expenseCents;

  const windowMs = 30 * 24 * 60 * 60 * 1000;
  const incomingCutoff = now.getTime() - windowMs;
  let incomingPaymentsCents = 0;
  let incomingPaymentCount = 0;
  for (const pay of input.payments) {
    const paidAt = new Date(pay.paidAt).getTime();
    if (Number.isFinite(paidAt) && paidAt >= incomingCutoff) {
      incomingPaymentsCents += Math.max(0, pay.amountCents);
      incomingPaymentCount += 1;
    }
  }

  const risks: string[] = [];
  if (overdueInvoiceCount > 0) {
    risks.push(
      `${overdueInvoiceCount} overdue invoice(s) threaten near-term cash (${formatFinanceAuraCents(overdueAmountCents, currency)}).`,
    );
  }
  if (expenseAvailable && expenseCents != null && incomeCents > 0 && expenseCents > incomeCents) {
    risks.push('Procurement outflow exceeds recorded payment inflow.');
  }
  if (
    outstandingReceivableCents > 0 &&
    incomeCents > 0 &&
    outstandingReceivableCents > incomeCents
  ) {
    risks.push('Outstanding receivables exceed total recorded payment inflow.');
  }
  if (incomingPaymentCount === 0 && input.payments.length > 0) {
    risks.push('No payments received in the last 30 days despite historical payment rows.');
  }
  if (!expenseAvailable) {
    risks.push(
      'Cash position incomplete — expense/outflow side unavailable without purchase orders or an expense ledger.',
    );
  }

  const parts = [
    `Income (payments): ${formatFinanceAuraCents(incomeCents, currency)}`,
    `Incoming (30d): ${formatFinanceAuraCents(incomingPaymentsCents, currency)}`,
    expenseCents == null
      ? 'Expense: unavailable'
      : `Expense (procurement POs): ${formatFinanceAuraCents(expenseCents, currency)}`,
    cashPositionCents == null
      ? 'Cash position: unavailable without expense data'
      : `Cash position: ${formatFinanceAuraCents(cashPositionCents, currency)}`,
    `Receivables outstanding: ${formatFinanceAuraCents(outstandingReceivableCents, currency)}`,
  ];

  return {
    availability: 'available',
    currency,
    incomeCents,
    incomingPaymentsCents,
    incomingPaymentCount,
    expenseCents,
    cashPositionCents,
    outstandingReceivableCents,
    overdueAmountCents,
    overdueInvoiceCount,
    paymentCount: input.payments.length,
    invoiceCount: input.invoices.length,
    purchaseOrderExpenseCents: expenseAvailable ? purchaseOrderExpenseCents : null,
    purchaseOrderCount: input.purchaseOrders.length,
    trends,
    risks,
    warnings,
    gaps,
    summary: `Cashflow from real TITAN records: ${parts.join(' · ')}.`,
    xero: {
      availability: xeroAvailable ? 'available' : 'unavailable',
      invoicesWithXeroNumber,
      paymentsWithXeroId,
      rationale: xeroAvailable
        ? `${invoicesWithXeroNumber} invoice(s) with Xero number; ${paymentsWithXeroId} payment(s) with Xero id.`
        : 'No Xero-linked invoice/payment markers found. Status is not invented.',
    },
  };
}

export function buildFcpProfitIntelligence(input: {
  currency?: string;
  jobs: Array<{
    id: string;
    jobNumber: string | null;
    title: string;
    jobType: string | null;
  }>;
  invoices: Array<{
    jobId: string | null;
    status: string;
    totalCents: number;
    amountCents: number;
    amountPaidCents: number;
  }>;
  materialLines: Array<{
    jobId: string;
    status: string;
    quantity: string;
    fulfilledQuantity: string | null;
    unitCostCents: number;
    materialSource: string;
    inventoryItemId: string | null;
  }>;
  /** Real timesheet / mobile time minutes by job when available. */
  labourByJob?: Array<{ jobId: string; durationMinutes: number }>;
  inventoryItemsWithCost: number;
}): FcpProfitIntelligence {
  const currency = input.currency ?? 'ZAR';
  if (input.jobs.length === 0 && input.invoices.every((i) => !i.jobId)) {
    return unavailableFcpProfit(currency);
  }

  const revenueByJob = new Map<string, { invoiced: number; paid: number }>();
  for (const inv of input.invoices) {
    if (!inv.jobId || inv.status === 'cancelled' || inv.status === 'draft') continue;
    const entry = revenueByJob.get(inv.jobId) ?? { invoiced: 0, paid: 0 };
    entry.invoiced += inv.totalCents || inv.amountCents;
    entry.paid += inv.amountPaidCents;
    revenueByJob.set(inv.jobId, entry);
  }

  const materialsByJob = new Map<string, typeof input.materialLines>();
  for (const line of input.materialLines) {
    const list = materialsByJob.get(line.jobId) ?? [];
    list.push(line);
    materialsByJob.set(line.jobId, list);
  }

  const labourMinutesByJob = new Map<string, number>();
  for (const row of input.labourByJob ?? []) {
    if (!row.jobId || row.durationMinutes <= 0) continue;
    labourMinutesByJob.set(
      row.jobId,
      (labourMinutesByJob.get(row.jobId) ?? 0) + row.durationMinutes,
    );
  }
  const labourMinutesTotal =
    labourMinutesByJob.size === 0
      ? null
      : [...labourMinutesByJob.values()].reduce((a, b) => a + b, 0);
  // No hourly rate in TITAN schema — labour $ stays unavailable (honest).
  const labourCostCents: number | null = null;
  const labourCostAvailability: FcpAvailability = 'unavailable';
  const labourCostRationale =
    labourMinutesTotal == null
      ? 'No timesheet / mobile time entries linked to jobs. Labour minutes and labour $ unavailable — not invented.'
      : `${labourMinutesTotal} labour minute(s) from real timesheets/mobile time; labour $ unavailable — no hourly rate stored in TITAN.`;

  const hasAnyPositiveUnitCost = input.materialLines.some(
    (l) => materialLineCostCents(l) > 0 || l.unitCostCents > 0,
  );
  const inventoryCostAvailability: FcpAvailability =
    input.inventoryItemsWithCost > 0 || hasAnyPositiveUnitCost ? 'available' : 'unavailable';
  const inventoryCostRationale =
    inventoryCostAvailability === 'available'
      ? `${input.inventoryItemsWithCost} inventory item(s) with unit_cost_cents > 0; material lines with real unit costs included when present.`
      : 'No inventory unit costs or material line unit costs > 0 found. Cost/margin marked unavailable — not invented.';

  const byJob: FcpJobProfitRow[] = [];
  let totalRevenue = 0;
  let totalCost: number | null = 0;
  let jobsWithCostData = 0;
  let anyCost = false;

  const jobIds = new Set<string>([
    ...input.jobs.map((j) => j.id),
    ...revenueByJob.keys(),
  ]);

  for (const jobId of jobIds) {
    const job = input.jobs.find((j) => j.id === jobId);
    const rev = revenueByJob.get(jobId) ?? { invoiced: 0, paid: 0 };
    const revenueCents = rev.paid > 0 ? rev.paid : rev.invoiced;
    if (revenueCents <= 0 && !materialsByJob.has(jobId) && !labourMinutesByJob.has(jobId))
      continue;

    const lines = materialsByJob.get(jobId) ?? [];
    const costSum = sumMaterialLinesCents(lines);
    const hasCost = lines.some((l) => l.unitCostCents > 0 && materialLineCostCents(l) > 0);

    let costCents: number | null = null;
    let costAvailability: FcpAvailability = 'unavailable';
    let costGapReason: string | null = null;

    if (hasCost) {
      costCents = costSum;
      costAvailability = 'available';
      anyCost = true;
      jobsWithCostData += 1;
    } else if (lines.length > 0) {
      costGapReason =
        'Material lines exist but unit_cost_cents are zero/missing — cost unavailable.';
    } else {
      costGapReason = 'No material cost lines for this job — cost unavailable.';
    }

    if (totalCost != null && costCents != null) {
      totalCost += costCents;
    } else if (!hasCost) {
      // Keep totalCost aggregating only when all contributing jobs have costs;
      // if any job lacks cost, overall cost remains partial — we still sum known costs
      // but mark overall margin carefully below.
    }

    const marginCents = computeJobGrossProfitCents({
      paidCents: rev.paid,
      invoicedCents: rev.invoiced,
      actualCostCents: costCents ?? 0,
      includeProfit: hasCost,
    });
    const marginBps =
      marginCents != null && revenueCents > 0
        ? Math.round((marginCents / revenueCents) * 10_000)
        : null;

    totalRevenue += revenueCents;

    const labourMinutes = labourMinutesByJob.get(jobId) ?? null;

    byJob.push({
      jobId,
      jobNumber: job?.jobNumber ?? null,
      title: job?.title ?? 'Job',
      jobType: job?.jobType ?? null,
      revenueCents,
      costCents,
      materialCostCents: costCents,
      labourMinutes,
      labourCostCents: null,
      marginCents,
      marginBps,
      costAvailability,
      costGapReason,
    });
  }

  byJob.sort((a, b) => b.revenueCents - a.revenueCents);

  if (!anyCost) {
    totalCost = null;
  }

  const serviceMap = new Map<
    string,
    { jobCount: number; revenueCents: number; costCents: number; hasCost: boolean }
  >();
  for (const row of byJob) {
    const key = (row.jobType?.trim() || row.title.trim().slice(0, 60) || 'General').slice(0, 80);
    const entry = serviceMap.get(key) ?? {
      jobCount: 0,
      revenueCents: 0,
      costCents: 0,
      hasCost: false,
    };
    entry.jobCount += 1;
    entry.revenueCents += row.revenueCents;
    if (row.costAvailability === 'available' && row.costCents != null) {
      entry.costCents += row.costCents;
      entry.hasCost = true;
    }
    serviceMap.set(key, entry);
  }

  const byService: FcpServiceProfitRow[] = [...serviceMap.entries()]
    .map(([serviceKey, v]) => {
      const marginCents = v.hasCost ? v.revenueCents - v.costCents : null;
      const marginBps =
        marginCents != null && v.revenueCents > 0
          ? Math.round((marginCents / v.revenueCents) * 10_000)
          : null;
      return {
        serviceKey,
        jobCount: v.jobCount,
        revenueCents: v.revenueCents,
        costCents: v.hasCost ? v.costCents : null,
        marginCents,
        marginBps,
        costAvailability: v.hasCost ? ('available' as const) : ('unavailable' as const),
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);

  const gaps: string[] = [];
  if (inventoryCostAvailability === 'unavailable') {
    gaps.push(inventoryCostRationale);
  }
  gaps.push(labourCostRationale);
  if (jobsWithCostData === 0 && byJob.length > 0) {
    gaps.push(
      'Job profitability margins unavailable — material/inventory unit costs missing for all jobs.',
    );
  }

  if (byJob.length === 0) {
    return unavailableFcpProfit(currency);
  }

  const marginCents =
    totalCost == null ? null : totalRevenue - totalCost;
  const marginBps =
    marginCents != null && totalRevenue > 0
      ? Math.round((marginCents / totalRevenue) * 10_000)
      : null;

  return {
    availability: 'available',
    currency,
    revenueCents: totalRevenue,
    costCents: totalCost,
    materialCostCents: totalCost,
    labourMinutesTotal,
    labourCostCents,
    labourCostAvailability,
    labourCostRationale,
    marginCents,
    marginBps,
    jobCount: byJob.length,
    jobsWithCostData,
    inventoryCostAvailability,
    inventoryCostRationale,
    byJob: byJob.slice(0, 50),
    byService: byService.slice(0, 30),
    gaps,
    summary:
      totalCost == null
        ? `Revenue from real job-linked invoices: ${formatFinanceAuraCents(totalRevenue, currency)}. Material cost/margin unavailable — real unit costs missing. Labour minutes: ${labourMinutesTotal == null ? 'unavailable' : String(labourMinutesTotal)}; labour $ unavailable.`
        : `Profit from real TITAN data: revenue ${formatFinanceAuraCents(totalRevenue, currency)}, material cost ${formatFinanceAuraCents(totalCost, currency)}, margin ${formatFinanceAuraCents(marginCents ?? 0, currency)} (${jobsWithCostData}/${byJob.length} jobs with cost data). Labour minutes: ${labourMinutesTotal == null ? 'unavailable' : String(labourMinutesTotal)}; labour $ unavailable (no hourly rate).`,
  };
}

export function buildFcpInsightDraftsFromSignals(input: {
  cashflow: FcpCashflowIntelligence;
  profit: FcpProfitIntelligence;
}): Array<{
  kind: FcpInsightKind;
  title: string;
  body: string;
  metricLabel: string | null;
  metricValueCents: number | null;
  currency: string | null;
  sourceInvoiceCount: number;
  sourcePaymentCount: number;
  sourceJobCount: number;
}> {
  const drafts: Array<{
    kind: FcpInsightKind;
    title: string;
    body: string;
    metricLabel: string | null;
    metricValueCents: number | null;
    currency: string | null;
    sourceInvoiceCount: number;
    sourcePaymentCount: number;
    sourceJobCount: number;
  }> = [];

  const { cashflow, profit } = input;
  if (cashflow.availability === 'unavailable' && profit.availability === 'unavailable') {
    return drafts;
  }

  if (cashflow.overdueInvoiceCount > 0 && cashflow.overdueAmountCents != null) {
    drafts.push({
      kind: 'receivables_pressure',
      title: 'Overdue receivables pressure',
      body: `${cashflow.overdueInvoiceCount} overdue invoice(s) totalling ${formatFinanceAuraCents(cashflow.overdueAmountCents, cashflow.currency)}. Collections review recommended — no action auto-executed.`,
      metricLabel: 'overdue_amount',
      metricValueCents: cashflow.overdueAmountCents,
      currency: cashflow.currency,
      sourceInvoiceCount: cashflow.invoiceCount,
      sourcePaymentCount: cashflow.paymentCount,
      sourceJobCount: 0,
    });
  }

  if (
    cashflow.expenseCents != null &&
    cashflow.incomeCents != null &&
    cashflow.expenseCents > cashflow.incomeCents
  ) {
    drafts.push({
      kind: 'cashflow_risk',
      title: 'Procurement outflow exceeds payment inflow',
      body: `Recorded procurement PO costs (${formatFinanceAuraCents(cashflow.expenseCents, cashflow.currency)}) exceed payment inflow (${formatFinanceAuraCents(cashflow.incomeCents, cashflow.currency)}). Review expense timing — figures are from real PO/payment rows only.`,
      metricLabel: 'expense_minus_income',
      metricValueCents: cashflow.expenseCents - cashflow.incomeCents,
      currency: cashflow.currency,
      sourceInvoiceCount: cashflow.invoiceCount,
      sourcePaymentCount: cashflow.paymentCount,
      sourceJobCount: 0,
    });
  }

  if (
    cashflow.incomeCents != null &&
    cashflow.incomeCents > 0 &&
    cashflow.outstandingReceivableCents != null &&
    cashflow.outstandingReceivableCents === 0
  ) {
    drafts.push({
      kind: 'cashflow_opportunity',
      title: 'Receivables clear — strong collection position',
      body: `Payment inflow of ${formatFinanceAuraCents(cashflow.incomeCents, cashflow.currency)} with no outstanding open receivables in TITAN. Opportunity signal only — not a forecast.`,
      metricLabel: 'income',
      metricValueCents: cashflow.incomeCents,
      currency: cashflow.currency,
      sourceInvoiceCount: cashflow.invoiceCount,
      sourcePaymentCount: cashflow.paymentCount,
      sourceJobCount: 0,
    });
  }

  if (profit.availability === 'available' && profit.jobsWithCostData === 0 && profit.jobCount > 0) {
    drafts.push({
      kind: 'cost_problem',
      title: 'Job cost data gap blocks margin insight',
      body: `${profit.jobCount} job(s) have revenue signals but no material/inventory unit costs > 0. Margin insights unavailable until real cost data exists.`,
      metricLabel: 'jobs_missing_cost',
      metricValueCents: profit.jobCount,
      currency: profit.currency,
      sourceInvoiceCount: 0,
      sourcePaymentCount: 0,
      sourceJobCount: profit.jobCount,
    });
  }

  const weakJobs = profit.byJob.filter(
    (j) =>
      j.costAvailability === 'available' &&
      j.marginBps != null &&
      j.marginBps < 1500 &&
      j.revenueCents > 0,
  );
  if (weakJobs.length > 0) {
    const worst = weakJobs.sort((a, b) => (a.marginBps ?? 0) - (b.marginBps ?? 0))[0]!;
    drafts.push({
      kind: 'profit_improvement',
      title: 'Low-margin job detected from real costs',
      body: `Job "${worst.title}" shows margin ${((worst.marginBps ?? 0) / 100).toFixed(1)}% from real revenue/cost rows. Review pricing or material costs — recommendation only.`,
      metricLabel: 'margin_bps',
      metricValueCents: worst.marginBps,
      currency: profit.currency,
      sourceInvoiceCount: 0,
      sourcePaymentCount: 0,
      sourceJobCount: 1,
    });
  }

  if (
    profit.marginBps != null &&
    profit.marginBps < 2000 &&
    profit.costCents != null &&
    profit.revenueCents != null &&
    profit.revenueCents > 0
  ) {
    drafts.push({
      kind: 'margin_warning',
      title: 'Overall margin below 20% (real cost basis)',
      body: `Aggregate margin is ${((profit.marginBps ?? 0) / 100).toFixed(1)}% across ${profit.jobsWithCostData} job(s) with cost data. Warning grounded in stored costs only.`,
      metricLabel: 'margin_bps',
      metricValueCents: profit.marginBps,
      currency: profit.currency,
      sourceInvoiceCount: 0,
      sourcePaymentCount: 0,
      sourceJobCount: profit.jobsWithCostData,
    });
  }


  if (
    cashflow.outstandingReceivableCents != null &&
    cashflow.outstandingReceivableCents > 0
  ) {
    drafts.push({
      kind: 'outstanding_money',
      title: 'Outstanding money tied up in receivables',
      body: `${formatFinanceAuraCents(cashflow.outstandingReceivableCents, cashflow.currency)} outstanding across open invoices. Draft insight only — Owner approval required for collection actions.`,
      metricLabel: 'outstanding_receivable',
      metricValueCents: cashflow.outstandingReceivableCents,
      currency: cashflow.currency,
      sourceInvoiceCount: cashflow.invoiceCount,
      sourcePaymentCount: cashflow.paymentCount,
      sourceJobCount: 0,
    });
  }

  const weakServices = profit.byService.filter(
    (s) =>
      s.costAvailability === 'available' &&
      s.marginBps != null &&
      s.marginBps < 1500 &&
      s.revenueCents > 0 &&
      s.jobCount >= 1,
  );
  if (weakServices.length > 0) {
    const worst = [...weakServices].sort((a, b) => (a.marginBps ?? 0) - (b.marginBps ?? 0))[0]!;
    drafts.push({
      kind: 'poor_performing_service',
      title: 'Poor performing service from real margins',
      body: `Service "${worst.serviceKey}" shows margin ${((worst.marginBps ?? 0) / 100).toFixed(1)}% across ${worst.jobCount} job(s) with real cost data. Review pricing or delivery cost — recommendation only.`,
      metricLabel: 'margin_bps',
      metricValueCents: worst.marginBps,
      currency: profit.currency,
      sourceInvoiceCount: 0,
      sourcePaymentCount: 0,
      sourceJobCount: worst.jobCount,
    });
  }

  if (cashflow.expenseCents != null && cashflow.purchaseOrderCount > 0) {
    drafts.push({
      kind: 'expense_concentration',
      title: 'Procurement expense concentration',
      body: `${cashflow.purchaseOrderCount} purchase order(s) contribute ${formatFinanceAuraCents(cashflow.expenseCents, cashflow.currency)} to expense analysis. No other operating-expense ledger is assumed.`,
      metricLabel: 'procurement_expense',
      metricValueCents: cashflow.expenseCents,
      currency: cashflow.currency,
      sourceInvoiceCount: 0,
      sourcePaymentCount: 0,
      sourceJobCount: 0,
    });
  }

  return drafts;
}

export function buildFcpActionDraftsFromSignals(input: {
  cashflow: FcpCashflowIntelligence;
  profit: FcpProfitIntelligence;
}): Array<{
  kind: FcpActionKind;
  title: string;
  recommendation: string;
  sourceJobId?: string;
}> {
  const actions: Array<{
    kind: FcpActionKind;
    title: string;
    recommendation: string;
    sourceJobId?: string;
  }> = [];

  if (input.cashflow.overdueInvoiceCount > 0) {
    actions.push({
      kind: 'collections_push',
      title: 'Review overdue collections',
      recommendation: `Owner review of ${input.cashflow.overdueInvoiceCount} overdue invoice(s). Approval records intent only — TITAN will not auto-send collection notices.`,
    });
  }

  if (input.cashflow.expenseCents == null) {
    actions.push({
      kind: 'expense_review',
      title: 'Capture expense data for cashflow completeness',
      recommendation:
        'Expense side of cashflow is unavailable without purchase orders or an expense ledger. Approve to acknowledge the gap — no fake expenses will be created.',
    });
  }

  if (input.profit.inventoryCostAvailability === 'unavailable' && input.profit.jobCount > 0) {
    actions.push({
      kind: 'inventory_cost_gap',
      title: 'Fill inventory / material unit costs',
      recommendation:
        'Profit margins are unavailable because inventory/material unit costs are missing. Approve to acknowledge the data-quality action — costs will not be invented.',
    });
  }

  const weak = input.profit.byJob.find(
    (j) => j.costAvailability === 'available' && j.marginBps != null && j.marginBps < 1500,
  );
  if (weak) {
    actions.push({
      kind: 'job_cost_review',
      title: `Review low-margin job: ${weak.title}`,
      recommendation: `Owner review of job cost/pricing for "${weak.title}". Approval does not mutate invoices or costs.`,
      sourceJobId: weak.jobId,
    });
  }

  if (input.cashflow.availability === 'available') {
    actions.push({
      kind: 'cash_position_review',
      title: 'Owner cash position review',
      recommendation:
        'Review cashflow income, expense availability, and receivables warnings on the Cashflow & Profit Intelligence dashboard. No financial mutation will execute.',
    });
  }

  return actions;
}
