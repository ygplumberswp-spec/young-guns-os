/**
 * Executive Command Centre (Department 15)
 *
 * Owner-only unified business view that composes existing finance, operations,
 * HR, fleet, marketing and sales sources plus the AURA Command Centre.
 *
 * Invariants:
 * - Owner only — Technician, Client, Manager, Dispatcher, Accountant and Staff denied
 * - Never invents financial figures — every money value reports availability + reason
 * - Composes existing services; does not rebuild Finance / HR / Fleet / Sales logic
 * - AURA may summarise and recommend; executive actions are drafts requiring approval
 * - Preserve RBAC, tenant isolation, approval workflows, audit logs
 */

export const EXECUTIVE_COMMAND_CENTRE_KEY = 'executive-command-centre' as const;

export type EcAvailability = 'available' | 'partial' | 'unavailable';

export type EcPanelKey =
  | 'revenue'
  | 'profit'
  | 'cash'
  | 'outstanding_invoices'
  | 'jobs'
  | 'staff'
  | 'fleet'
  | 'marketing'
  | 'sales';

export type EcSeverity = 'critical' | 'high' | 'medium' | 'low';

export type EcRiskKind =
  | 'cash_shortfall'
  | 'overdue_receivable'
  | 'margin_unknown'
  | 'job_backlog'
  | 'fleet_downtime'
  | 'sales_pipeline_stall'
  | 'staffing_gap';

export type EcOpportunityKind =
  | 'open_pipeline'
  | 'unconverted_lead'
  | 'idle_capacity'
  | 'marketing_reach'
  | 'margin_improvement';

export type EcActionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type EcInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type EcSourceModule =
  | 'finance_cashflow_profit'
  | 'jobs'
  | 'team'
  | 'fleet'
  | 'marketing'
  | 'sales'
  | 'aura_command_centre';

/** A money figure that is never invented — null value always carries a reason. */
export type EcMoney = {
  availability: EcAvailability;
  amountCents: number | null;
  currency: string;
  /** Why the figure is missing or partial. Empty when fully available. */
  rationale: string;
};

/** A counted figure over real rows. */
export type EcCount = {
  availability: EcAvailability;
  value: number | null;
  rationale: string;
};

export type EcRevenuePanel = {
  availability: EcAvailability;
  /** Invoiced income over the reporting window (real invoice rows). */
  invoicedCents: EcMoney;
  /** Payments actually received (real paidAt rows). */
  collectedCents: EcMoney;
  invoiceCount: number;
  paymentCount: number;
  rationale: string;
};

export type EcProfitPanel = {
  availability: EcAvailability;
  revenueCents: EcMoney;
  /** Material cost only — labour cost is never invented. */
  costCents: EcMoney;
  marginCents: EcMoney;
  marginBps: number | null;
  jobCount: number;
  jobsWithCostData: number;
  /** Explains that labour cost is excluded until a real rate exists. */
  labourCostRationale: string;
  rationale: string;
};

export type EcCashPanel = {
  availability: EcAvailability;
  cashPositionCents: EcMoney;
  incomingPaymentsCents: EcMoney;
  expenseCents: EcMoney;
  rationale: string;
};

export type EcOutstandingPanel = {
  availability: EcAvailability;
  outstandingReceivableCents: EcMoney;
  overdueAmountCents: EcMoney;
  overdueInvoiceCount: number;
  rationale: string;
};

export type EcJobsPanel = {
  availability: EcAvailability;
  total: number;
  newCount: number;
  scheduledCount: number;
  inProgressCount: number;
  completedCount: number;
  cancelledCount: number;
  openCount: number;
  rationale: string;
};

export type EcStaffPanel = {
  availability: EcAvailability;
  activeCount: number;
  inactiveCount: number;
  total: number;
  rationale: string;
};

export type EcFleetPanel = {
  availability: EcAvailability;
  total: number;
  availableCount: number;
  inUseCount: number;
  maintenanceCount: number;
  outOfServiceCount: number;
  rationale: string;
};

export type EcMarketingPanel = {
  availability: EcAvailability;
  total: number;
  activeCount: number;
  draftCount: number;
  completedCount: number;
  rationale: string;
};

export type EcSalesPanel = {
  availability: EcAvailability;
  openOpportunityCount: number;
  wonOpportunityCount: number;
  lostOpportunityCount: number;
  openLeadCount: number;
  convertedLeadCount: number;
  /** Only summed from rows carrying a real estimated value in one currency. */
  openPipelineCents: EcMoney;
  rationale: string;
};

export type EcRiskItem = {
  kind: EcRiskKind;
  severity: EcSeverity;
  title: string;
  detail: string;
  source: EcSourceModule;
  /** Never a decision — surfaced for Owner judgement only. */
  autoResolved: false;
};

export type EcOpportunityItem = {
  kind: EcOpportunityKind;
  title: string;
  detail: string;
  source: EcSourceModule;
  /** Never acted on automatically. */
  autoExecuted: false;
};

export type EcActionDraftSummary = {
  id: string;
  title: string;
  body: string;
  panel: EcPanelKey | null;
  status: EcActionStatus;
  /** Invariant: always false — never auto-execute. */
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type EcInsightSummary = {
  id: string;
  panel: EcPanelKey | null;
  status: EcInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceActionId: string | null;
  createdAt: string;
};

export type EcConnection = {
  module: EcSourceModule;
  label: string;
  href: string;
  note: string;
};

export type EcSettings = {
  id: string;
  /** Invariant: always false. */
  autoExecuteActionsEnabled: false;
  /** Invariant: always false. */
  inventFinancialFiguresEnabled: false;
  financePanelsEnabled: boolean;
  operationsPanelsEnabled: boolean;
  riskDetectionEnabled: boolean;
  opportunityDetectionEnabled: boolean;
  notes: string | null;
  updatedAt: string;
};

export type EcDashboard = {
  summary: string;
  productClarification: {
    auraCommandCentre: string;
    financeOps: string;
    thisLayer: string;
  };
  policy: {
    ownerOnly: true;
    autoExecuteActionsEnabled: false;
    inventFinancialFiguresEnabled: false;
    requiresOwnerApproval: true;
    fakeBusinessData: false;
  };
  revenue: EcRevenuePanel;
  profit: EcProfitPanel;
  cash: EcCashPanel;
  outstandingInvoices: EcOutstandingPanel;
  jobs: EcJobsPanel;
  staff: EcStaffPanel;
  fleet: EcFleetPanel;
  marketing: EcMarketingPanel;
  sales: EcSalesPanel;
  risks: EcRiskItem[];
  opportunities: EcOpportunityItem[];
  actionDrafts: EcActionDraftSummary[];
  insights: EcInsightSummary[];
  connections: EcConnection[];
  settings: EcSettings;
  pendingApprovals: number;
  /** Panels that could not be filled from real data, with the reason. */
  unavailablePanels: Array<{ panel: EcPanelKey; reason: string }>;
};

export type CreateEcActionDraftRequest = {
  title: string;
  body: string;
  panel?: EcPanelKey | null;
  submitForApproval?: boolean;
};

export type DecideEcActionRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type RefreshEcInsightsRequest = {
  submitForApproval?: boolean;
};

export type CreateEcInsightRequest = {
  panel?: EcPanelKey | null;
  title: string;
  insight: string;
  href?: string;
  sourceActionId?: string;
};

export type AcknowledgeEcInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

export type UpdateEcSettingsRequest = {
  financePanelsEnabled?: boolean;
  operationsPanelsEnabled?: boolean;
  riskDetectionEnabled?: boolean;
  opportunityDetectionEnabled?: boolean;
  notes?: string | null;
};

// ─── Access ───────────────────────────────────────────────────────────────────

const OWNER_ROLES = ['Company Owner', 'Owner', 'Platform Owner'] as const;

/**
 * Owner only. Finance, payroll, margin, profit and strategy data are exposed
 * here, so Technician, Client, Manager, Dispatcher, Accountant and general
 * Staff are denied even when they hold broad read permissions. A wildcard
 * permission alone does not grant access without an owner role.
 */
export function canAccessExecutiveCommandCentre(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  return (OWNER_ROLES as readonly string[]).includes(role);
}

export function canWriteExecutiveCommandCentre(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessExecutiveCommandCentre(identity);
}

/** Approving an executive action draft is an owner decision. */
export function canApproveExecutiveCommandCentre(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessExecutiveCommandCentre(identity);
}

export function canManageExecutiveCommandCentreSettings(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessExecutiveCommandCentre(identity);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const EC_PRODUCT_COPY = {
  auraCommandCentre:
    'AURA Command Centre (/aura/command-centre) keeps agent orchestration, memory and handoffs — this layer does not rebuild it and links to it instead.',
  financeOps:
    'Finance operations stay under /finance and Cashflow & Profit Intelligence — this layer reads their real figures rather than recomputing them.',
  thisLayer:
    'Executive Command Centre gives the Owner one unified view of revenue, profit, cash, outstanding invoices, jobs, staff, fleet, marketing, sales, risks and opportunities. Real connected data only. Financial figures are never invented, and executive actions are drafts requiring Owner approval.',
} as const;

export const EC_PANEL_LABELS: Record<EcPanelKey, string> = {
  revenue: 'Revenue',
  profit: 'Profit',
  cash: 'Cash position',
  outstanding_invoices: 'Outstanding invoices',
  jobs: 'Jobs',
  staff: 'Staff',
  fleet: 'Fleet',
  marketing: 'Marketing',
  sales: 'Sales',
};

export const EC_PANEL_KEYS: readonly EcPanelKey[] = [
  'revenue',
  'profit',
  'cash',
  'outstanding_invoices',
  'jobs',
  'staff',
  'fleet',
  'marketing',
  'sales',
] as const;

export function isEcPanelKey(value: string | null | undefined): value is EcPanelKey {
  return Boolean(value && (EC_PANEL_KEYS as readonly string[]).includes(value));
}

/**
 * Wraps a money figure. A null or negative-unknown input stays null with a
 * reason rather than being coerced to zero, so a missing figure is never
 * presented as R0.
 */
export function ecMoney(
  amountCents: number | null | undefined,
  currency: string,
  missingReason: string,
): EcMoney {
  if (amountCents == null || !Number.isFinite(amountCents)) {
    return {
      availability: 'unavailable',
      amountCents: null,
      currency,
      rationale: missingReason,
    };
  }
  return { availability: 'available', amountCents, currency, rationale: '' };
}

export function ecCount(
  value: number | null | undefined,
  missingReason: string,
): EcCount {
  if (value == null || !Number.isFinite(value)) {
    return { availability: 'unavailable', value: null, rationale: missingReason };
  }
  return { availability: 'available', value, rationale: '' };
}

/** Panel availability from the money figures it depends on. */
export function ecPanelAvailability(parts: EcMoney[]): EcAvailability {
  if (parts.length === 0) return 'unavailable';
  const available = parts.filter((p) => p.availability === 'available').length;
  if (available === 0) return 'unavailable';
  if (available < parts.length) return 'partial';
  return 'available';
}

export function listEcConnections(): EcConnection[] {
  return [
    {
      module: 'finance_cashflow_profit',
      label: 'Cashflow & Profit Intelligence',
      href: '/finance-cashflow-profit',
      note: 'Source of revenue, cash position, receivables and margin figures.',
    },
    {
      module: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      note: 'Real job rows behind the operations panel.',
    },
    {
      module: 'team',
      label: 'Team',
      href: '/team',
      note: 'Active staff accounts behind the staff panel.',
    },
    {
      module: 'fleet',
      label: 'Fleet',
      href: '/fleet',
      note: 'Vehicle status rows behind the fleet panel.',
    },
    {
      module: 'marketing',
      label: 'Marketing',
      href: '/marketing',
      note: 'Campaign rows behind the marketing panel.',
    },
    {
      module: 'sales',
      label: 'Sales',
      href: '/leads',
      note: 'Leads and opportunities behind the sales panel.',
    },
    {
      module: 'aura_command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      note: 'Agent orchestration, memory and handoffs — not rebuilt here.',
    },
  ];
}

export function defaultEcSettings(partial?: {
  id?: string;
  financePanelsEnabled?: boolean;
  operationsPanelsEnabled?: boolean;
  riskDetectionEnabled?: boolean;
  opportunityDetectionEnabled?: boolean;
  notes?: string | null;
  updatedAt?: string;
}): EcSettings {
  return {
    id: partial?.id ?? 'pending',
    autoExecuteActionsEnabled: false,
    inventFinancialFiguresEnabled: false,
    financePanelsEnabled: partial?.financePanelsEnabled ?? true,
    operationsPanelsEnabled: partial?.operationsPanelsEnabled ?? true,
    riskDetectionEnabled: partial?.riskDetectionEnabled ?? true,
    opportunityDetectionEnabled: partial?.opportunityDetectionEnabled ?? true,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

/**
 * Risks derived only from real signals. A figure that is unavailable produces a
 * `margin_unknown` style visibility risk rather than a fabricated number.
 */
export function buildEcRisks(input: {
  cash: EcCashPanel;
  outstanding: EcOutstandingPanel;
  profit: EcProfitPanel;
  jobs: EcJobsPanel;
  fleet: EcFleetPanel;
  sales: EcSalesPanel;
  staff: EcStaffPanel;
}): EcRiskItem[] {
  const risks: EcRiskItem[] = [];

  if (
    input.cash.cashPositionCents.availability === 'available' &&
    (input.cash.cashPositionCents.amountCents ?? 0) < 0
  ) {
    risks.push({
      kind: 'cash_shortfall',
      severity: 'critical',
      title: 'Cash position is negative',
      detail:
        'Recorded income minus recorded expenses is negative over the reporting window. Figure comes from real invoice and expense rows.',
      source: 'finance_cashflow_profit',
      autoResolved: false,
    });
  }

  if (input.outstanding.overdueInvoiceCount > 0) {
    risks.push({
      kind: 'overdue_receivable',
      severity: input.outstanding.overdueInvoiceCount >= 5 ? 'high' : 'medium',
      title: `${input.outstanding.overdueInvoiceCount} overdue invoice(s)`,
      detail:
        'Counted from real invoices past their due date with an outstanding balance. No amounts are estimated.',
      source: 'finance_cashflow_profit',
      autoResolved: false,
    });
  }

  if (input.profit.marginCents.availability !== 'available') {
    risks.push({
      kind: 'margin_unknown',
      severity: 'medium',
      title: 'Margin visibility is incomplete',
      detail: `${input.profit.marginCents.rationale} Margin is reported unavailable rather than estimated.`,
      source: 'finance_cashflow_profit',
      autoResolved: false,
    });
  }

  if (input.jobs.availability === 'available' && input.jobs.openCount >= 20) {
    risks.push({
      kind: 'job_backlog',
      severity: input.jobs.openCount >= 50 ? 'high' : 'medium',
      title: `${input.jobs.openCount} open job(s)`,
      detail:
        'Counted from real job rows that are new, scheduled or in progress. Capacity impact is not inferred.',
      source: 'jobs',
      autoResolved: false,
    });
  }

  const fleetDown = input.fleet.maintenanceCount + input.fleet.outOfServiceCount;
  if (input.fleet.availability === 'available' && fleetDown > 0) {
    risks.push({
      kind: 'fleet_downtime',
      severity: fleetDown >= 3 ? 'high' : 'low',
      title: `${fleetDown} vehicle(s) unavailable`,
      detail:
        'Counted from real vehicle rows in maintenance or out of service. Downtime cost is not estimated.',
      source: 'fleet',
      autoResolved: false,
    });
  }

  if (
    input.sales.availability === 'available' &&
    input.sales.openLeadCount > 0 &&
    input.sales.openOpportunityCount === 0
  ) {
    risks.push({
      kind: 'sales_pipeline_stall',
      severity: 'medium',
      title: 'Open leads with no open opportunities',
      detail:
        'Real lead rows exist but no opportunity row is open. Conversion likelihood is not predicted.',
      source: 'sales',
      autoResolved: false,
    });
  }

  if (input.staff.availability === 'available' && input.staff.activeCount === 0) {
    risks.push({
      kind: 'staffing_gap',
      severity: 'high',
      title: 'No active staff accounts',
      detail: 'Counted from real user rows marked active. No headcount is assumed.',
      source: 'team',
      autoResolved: false,
    });
  }

  return risks;
}

export function buildEcOpportunities(input: {
  sales: EcSalesPanel;
  jobs: EcJobsPanel;
  fleet: EcFleetPanel;
  marketing: EcMarketingPanel;
  profit: EcProfitPanel;
}): EcOpportunityItem[] {
  const items: EcOpportunityItem[] = [];

  if (
    input.sales.openPipelineCents.availability === 'available' &&
    (input.sales.openPipelineCents.amountCents ?? 0) > 0
  ) {
    items.push({
      kind: 'open_pipeline',
      title: 'Open pipeline value recorded',
      detail:
        'Summed only from opportunity rows carrying a real estimated value in a single currency. Rows without a value are excluded rather than estimated.',
      source: 'sales',
      autoExecuted: false,
    });
  }

  if (input.sales.availability === 'available' && input.sales.openLeadCount > 0) {
    items.push({
      kind: 'unconverted_lead',
      title: `${input.sales.openLeadCount} lead(s) not yet converted`,
      detail:
        'Counted from real lead rows that are neither converted nor lost. No conversion value is projected.',
      source: 'sales',
      autoExecuted: false,
    });
  }

  if (
    input.fleet.availability === 'available' &&
    input.fleet.availableCount > 0 &&
    input.jobs.availability === 'available' &&
    input.jobs.openCount === 0
  ) {
    items.push({
      kind: 'idle_capacity',
      title: `${input.fleet.availableCount} vehicle(s) available with no open jobs`,
      detail:
        'Both figures come from real rows. Revenue upside is not estimated.',
      source: 'fleet',
      autoExecuted: false,
    });
  }

  if (input.marketing.availability === 'available' && input.marketing.draftCount > 0) {
    items.push({
      kind: 'marketing_reach',
      title: `${input.marketing.draftCount} draft campaign(s) not yet launched`,
      detail: 'Counted from real campaign rows in draft. Reach and return are not predicted.',
      source: 'marketing',
      autoExecuted: false,
    });
  }

  if (
    input.profit.availability !== 'unavailable' &&
    input.profit.jobCount > 0 &&
    input.profit.jobsWithCostData < input.profit.jobCount
  ) {
    items.push({
      kind: 'margin_improvement',
      title: 'Cost data missing on some jobs',
      detail: `${input.profit.jobsWithCostData} of ${input.profit.jobCount} job(s) carry real cost data. Capturing the rest would complete margin visibility — no margin is assumed for the others.`,
      source: 'finance_cashflow_profit',
      autoExecuted: false,
    });
  }

  return items;
}

export function buildEcSummary(input: {
  revenue: EcRevenuePanel;
  profit: EcProfitPanel;
  cash: EcCashPanel;
  jobs: EcJobsPanel;
  riskCount: number;
  opportunityCount: number;
  unavailableCount: number;
}): string {
  const parts: string[] = [];
  parts.push(
    input.revenue.availability === 'unavailable'
      ? 'Revenue unavailable (no real invoice or payment rows yet)'
      : 'Revenue from real invoice and payment rows',
  );
  parts.push(
    input.profit.marginCents.availability === 'available'
      ? 'margin available'
      : 'margin incomplete (never estimated)',
  );
  parts.push(
    input.cash.cashPositionCents.availability === 'available'
      ? 'cash position available'
      : 'cash position incomplete',
  );
  parts.push(`${input.jobs.openCount} open job(s)`);
  parts.push(`${input.riskCount} risk(s)`);
  parts.push(`${input.opportunityCount} opportunity(ies)`);
  const tail =
    input.unavailableCount > 0
      ? ` ${input.unavailableCount} panel(s) report unavailable with a reason rather than an invented figure.`
      : '';
  return `Owner view: ${parts.join(', ')}.${tail}`;
}

export function buildEcActionDraft(input: {
  panelLabel: string;
  title: string;
  detail: string;
}): { title: string; body: string } {
  return {
    title: `${input.panelLabel} — ${input.title}`.slice(0, 200),
    body: [
      input.detail,
      '',
      'Draft only, composed from real connected business data. No figure is invented.',
      'Owner approval required. Approval records a decision and never executes finance, payroll, dispatch or marketing changes.',
    ].join('\n'),
  };
}
