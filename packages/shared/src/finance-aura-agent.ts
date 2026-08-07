/**
 * Finance AURA Agent Foundation (Department 4.1)
 *
 * Owner-gated finance intelligence layer over real TITAN invoices, payments,
 * jobs, customers, and post-import Xero-linked records. Extends existing
 * finance / Xero / finance-intelligence foundations — does not rebuild accounting.
 *
 * Invariants:
 * - No fake financial data; unavailable when no real provider/TITAN records
 * - No auto-execute of financial mutations; recommendations need Owner approval
 * - Technician / Client denied; Owner (Company/Platform) + finance RBAC only
 * - Audit all intelligence actions via security_audit_logs
 */

export const FINANCE_AURA_AGENT_KEY = 'finance' as const;

export const FINANCE_AURA_AGENT_CAPABILITIES = [
  'cashflow_signals',
  'receivables_read',
  'payments_read',
  'invoice_context',
  'job_finance_context',
  'xero_imported_read',
  'draft_finance_recommendation',
  'finance_insights',
  'finance_alerts',
  'owner_decision_support',
] as const;

export type FinanceAuraAgentCapability = (typeof FINANCE_AURA_AGENT_CAPABILITIES)[number];

export type FinanceAuraRecommendationKind =
  | 'collections'
  | 'cashflow'
  | 'receivables_review'
  | 'payment_follow_up'
  | 'xero_reconciliation'
  | 'job_profitability_review'
  | 'owner_decision'
  | 'aura_handoff';

export type FinanceAuraRecommendationStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type FinanceAuraInsightKind =
  | 'receivables_summary'
  | 'payments_summary'
  | 'overdue_concentration'
  | 'xero_link_status'
  | 'job_invoice_linkage'
  | 'business_financial_context';

export type FinanceAuraAlertSeverity = 'info' | 'warning' | 'critical';

export type FinanceAuraAlertKind =
  | 'overdue_invoices'
  | 'outstanding_receivables'
  | 'no_recent_payments'
  | 'xero_disconnected'
  | 'unlinked_job_invoices';

export type FinanceAuraAlertStatus = 'open' | 'acknowledged' | 'dismissed';

export type FinanceAuraXeroLinkStatus = {
  availability: 'available' | 'unavailable';
  connectionStatus: string | null;
  lastSyncAt: string | null;
  invoicesWithXeroNumber: number;
  paymentsWithXeroId: number;
  rationale: string;
};

export type FinanceAuraAgentIdentity = {
  agentKey: typeof FINANCE_AURA_AGENT_KEY;
  name: string;
  description: string;
  capabilities: FinanceAuraAgentCapability[];
  registry: {
    commandCentreKey: 'finance';
    agentNetworkKey: 'finance';
    globalAgentKey: 'finance';
  };
  status: 'foundation_active';
  autoExecuteFinancialMutations: false;
};

export type FinanceAuraRecommendationSummary = {
  id: string;
  kind: FinanceAuraRecommendationKind;
  status: FinanceAuraRecommendationStatus;
  title: string;
  recommendation: string;
  /** Linked TITAN entity IDs when recommendation is grounded in real rows. */
  sourceInvoiceId: string | null;
  sourcePaymentId: string | null;
  sourceJobId: string | null;
  sourceCustomerId: string | null;
  /** Always false — never auto-execute financial mutations. */
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type FinanceAuraInsightSummary = {
  id: string;
  kind: FinanceAuraInsightKind;
  title: string;
  body: string;
  /** Null metrics when unavailable — never invented. */
  metricLabel: string | null;
  metricValueCents: number | null;
  currency: string | null;
  sourceInvoiceCount: number;
  sourcePaymentCount: number;
  createdAt: string;
};

export type FinanceAuraAlertSummary = {
  id: string;
  kind: FinanceAuraAlertKind;
  severity: FinanceAuraAlertSeverity;
  status: FinanceAuraAlertStatus;
  title: string;
  detail: string;
  relatedInvoiceId: string | null;
  relatedCustomerId: string | null;
  amountCents: number | null;
  currency: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
};

export type FinanceAuraBusinessContext = {
  availability: 'available' | 'unavailable';
  currency: string;
  invoiceCount: number;
  paymentCount: number;
  jobLinkedInvoiceCount: number;
  customerWithInvoicesCount: number;
  outstandingReceivableCents: number | null;
  overdueInvoiceCount: number;
  overdueAmountCents: number | null;
  paidInFullInvoiceCount: number;
  recentPaymentCount30d: number;
  recentPaymentTotalCents: number | null;
  summary: string;
  xero: FinanceAuraXeroLinkStatus;
};

export type FinanceAuraQuestionAnswer = {
  question: string;
  answer: string;
  availability: 'available' | 'unavailable';
  groundedIn: Array<'invoices' | 'payments' | 'jobs' | 'customers' | 'xero_import'>;
  autoExecuted: false;
  context: FinanceAuraBusinessContext;
};

export type FinanceAuraAuraConnection = {
  target:
    | 'command_centre'
    | 'agent_network'
    | 'finance_invoices'
    | 'finance_payments'
    | 'xero_settings'
    | 'finance_intelligence'
    | 'financial_planning';
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type FinanceAuraAgentDashboard = {
  summary: string;
  identity: FinanceAuraAgentIdentity;
  productClarification: {
    existingFinance: string;
    xeroIntegration: string;
    financeIntelligence: string;
    thisLayer: string;
  };
  policy: {
    autoExecuteEnabled: false;
    requiresOwnerApproval: true;
    technicianClientDenied: true;
    fakeDataInvented: false;
  };
  registry: {
    commandCentreStatus: string;
    note: string;
  };
  businessContext: FinanceAuraBusinessContext;
  recommendations: FinanceAuraRecommendationSummary[];
  insights: FinanceAuraInsightSummary[];
  alerts: FinanceAuraAlertSummary[];
  auraConnections: FinanceAuraAuraConnection[];
};

export type CreateFinanceAuraRecommendationRequest = {
  kind: FinanceAuraRecommendationKind;
  title: string;
  recommendation: string;
  sourceInvoiceId?: string;
  sourcePaymentId?: string;
  sourceJobId?: string;
  sourceCustomerId?: string;
};

export type DecideFinanceAuraRecommendationRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type AskFinanceAuraQuestionRequest = {
  question: string;
};

export type AcknowledgeFinanceAuraAlertRequest = {
  notes?: string;
};

// ─── Access helpers ───────────────────────────────────────────────────────────

function isOwnerRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  );
}

/** Owner + finance RBAC; Technician/Client always denied. */
export function canAccessFinanceAuraAgent(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerRole(role)) return true;
  return permissions.includes('finance:read') || permissions.includes('finance:write');
}

export function canWriteFinanceAuraAgent(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessFinanceAuraAgent(identity)) return false;
  const role = identity.roleName ?? '';
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerRole(role)) return true;
  return permissions.includes('finance:write');
}

/** Owner (Company/Platform) or * may approve finance recommendations/actions. */
export function canApproveFinanceAuraAgent(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessFinanceAuraAgent(identity)) return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerRole(identity.roleName);
}

// ─── Identity & copy ──────────────────────────────────────────────────────────

export function getFinanceAuraAgentIdentity(): FinanceAuraAgentIdentity {
  return {
    agentKey: FINANCE_AURA_AGENT_KEY,
    name: 'Finance AURA Agent',
    description:
      'Owner-gated finance intelligence — recommendations, insights, and alerts grounded in real TITAN invoices, payments, jobs, customers, and imported Xero-linked records. Never auto-executes financial mutations.',
    capabilities: [...FINANCE_AURA_AGENT_CAPABILITIES],
    registry: {
      commandCentreKey: 'finance',
      agentNetworkKey: 'finance',
      globalAgentKey: 'finance',
    },
    status: 'foundation_active',
    autoExecuteFinancialMutations: false,
  };
}

export const FINANCE_AURA_AGENT_PRODUCT_COPY = {
  existingFinance:
    'Core Finance (quotes, invoices, payments) and job finance summaries remain the system of record — this agent does not replace accounting ledgers.',
  xeroIntegration:
    'Xero sync/import remains the integration path. This layer reads TITAN invoices/payments after import (including xeroInvoiceNumber / xeroPaymentId when present). It does not invent live Xero API calls.',
  financeIntelligence:
    'Existing Finance Intelligence / Financial Planning surfaces remain for advanced cashflow and planning — this foundation adds the AURA agent identity, Owner-gated recommendations, insights, and alerts.',
  thisLayer:
    'Finance AURA Agent Foundation registers with Command Centre / Agent Network (finance key), surfaces Owner decision support from real TITAN data only, and never auto-executes financial mutations.',
} as const;

export function emptyFinanceAuraXeroLinkStatus(): FinanceAuraXeroLinkStatus {
  return {
    availability: 'unavailable',
    connectionStatus: null,
    lastSyncAt: null,
    invoicesWithXeroNumber: 0,
    paymentsWithXeroId: 0,
    rationale:
      'No Xero connection or imported Xero-linked invoice/payment markers found for this tenant. Status is not invented.',
  };
}

export function unavailableFinanceAuraBusinessContext(
  currency = 'ZAR',
): FinanceAuraBusinessContext {
  return {
    availability: 'unavailable',
    currency,
    invoiceCount: 0,
    paymentCount: 0,
    jobLinkedInvoiceCount: 0,
    customerWithInvoicesCount: 0,
    outstandingReceivableCents: null,
    overdueInvoiceCount: 0,
    overdueAmountCents: null,
    paidInFullInvoiceCount: 0,
    recentPaymentCount30d: 0,
    recentPaymentTotalCents: null,
    summary:
      'No invoice or payment records found for this tenant. Financial context is unavailable — values are not invented.',
    xero: emptyFinanceAuraXeroLinkStatus(),
  };
}

export function buildFinanceAuraBusinessContext(input: {
  currency?: string;
  invoiceCount: number;
  paymentCount: number;
  jobLinkedInvoiceCount: number;
  customerWithInvoicesCount: number;
  outstandingReceivableCents: number;
  overdueInvoiceCount: number;
  overdueAmountCents: number;
  paidInFullInvoiceCount: number;
  recentPaymentCount30d: number;
  recentPaymentTotalCents: number;
  xero: FinanceAuraXeroLinkStatus;
}): FinanceAuraBusinessContext {
  const currency = input.currency ?? 'ZAR';
  if (input.invoiceCount === 0 && input.paymentCount === 0) {
    return unavailableFinanceAuraBusinessContext(currency);
  }

  const parts: string[] = [
    `${input.invoiceCount} invoice(s)`,
    `${input.paymentCount} payment(s)`,
    `${input.overdueInvoiceCount} overdue`,
    `outstanding ${formatFinanceAuraCents(input.outstandingReceivableCents, currency)}`,
  ];
  if (input.xero.availability === 'available') {
    parts.push(
      `Xero link: ${input.xero.connectionStatus ?? 'unknown'} (${input.xero.invoicesWithXeroNumber} invoice(s) with Xero number)`,
    );
  } else {
    parts.push('Xero link unavailable');
  }

  return {
    availability: 'available',
    currency,
    invoiceCount: input.invoiceCount,
    paymentCount: input.paymentCount,
    jobLinkedInvoiceCount: input.jobLinkedInvoiceCount,
    customerWithInvoicesCount: input.customerWithInvoicesCount,
    outstandingReceivableCents: input.outstandingReceivableCents,
    overdueInvoiceCount: input.overdueInvoiceCount,
    overdueAmountCents: input.overdueAmountCents,
    paidInFullInvoiceCount: input.paidInFullInvoiceCount,
    recentPaymentCount30d: input.recentPaymentCount30d,
    recentPaymentTotalCents: input.recentPaymentTotalCents,
    summary: `Business financial context from real TITAN records: ${parts.join(' · ')}.`,
    xero: input.xero,
  };
}

export function formatFinanceAuraCents(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  return `${currency} ${amount}`;
}

export function answerFinanceAuraQuestion(input: {
  question: string;
  context: FinanceAuraBusinessContext;
}): FinanceAuraQuestionAnswer {
  const question = input.question.trim();
  const q = question.toLowerCase();
  const groundedIn: FinanceAuraQuestionAnswer['groundedIn'] = [];

  if (input.context.availability === 'unavailable') {
    return {
      question,
      answer:
        'Financial context is unavailable — there are no invoice or payment records for this tenant yet. TITAN does not invent balances or forecasts.',
      availability: 'unavailable',
      groundedIn: [],
      autoExecuted: false,
      context: input.context,
    };
  }

  groundedIn.push('invoices', 'payments');
  if (input.context.jobLinkedInvoiceCount > 0) groundedIn.push('jobs');
  if (input.context.customerWithInvoicesCount > 0) groundedIn.push('customers');
  if (input.context.xero.availability === 'available') groundedIn.push('xero_import');

  let answer = input.context.summary;

  if (q.includes('overdue') || q.includes('receivable') || q.includes('owed')) {
    answer = [
      `Overdue invoices: ${input.context.overdueInvoiceCount}`,
      `Overdue amount: ${
        input.context.overdueAmountCents == null
          ? 'unavailable'
          : formatFinanceAuraCents(input.context.overdueAmountCents, input.context.currency)
      }`,
      `Outstanding receivables: ${
        input.context.outstandingReceivableCents == null
          ? 'unavailable'
          : formatFinanceAuraCents(
              input.context.outstandingReceivableCents,
              input.context.currency,
            )
      }`,
      'Figures are from real TITAN invoices only. No collection action was executed.',
    ].join(' ');
  } else if (q.includes('payment') || q.includes('cash') || q.includes('collected')) {
    answer = [
      `Payments recorded: ${input.context.paymentCount}`,
      `Last 30 days: ${input.context.recentPaymentCount30d} payment(s)`,
      `30-day total: ${
        input.context.recentPaymentTotalCents == null
          ? 'unavailable'
          : formatFinanceAuraCents(
              input.context.recentPaymentTotalCents,
              input.context.currency,
            )
      }`,
      'Cash figures use stored TITAN payments only.',
    ].join(' ');
  } else if (q.includes('xero')) {
    answer =
      input.context.xero.availability === 'available'
        ? `Xero connection status: ${input.context.xero.connectionStatus ?? 'unknown'}. ${input.context.xero.invoicesWithXeroNumber} invoice(s) have a Xero invoice number after import; ${input.context.xero.paymentsWithXeroId} payment(s) have a Xero payment id. Live Xero API calls are not invented here.`
        : input.context.xero.rationale;
  } else if (q.includes('profit') || q.includes('margin')) {
    answer =
      'Job-level profitability detail remains on Finance Intelligence / job costing surfaces when cost data exists. This foundation summarises invoice and payment context only and does not invent margins.';
  }

  return {
    question,
    answer,
    availability: 'available',
    groundedIn,
    autoExecuted: false,
    context: input.context,
  };
}

export type FinanceAuraSignalInput = {
  overdueInvoices: Array<{
    invoiceId: string;
    customerId: string | null;
    outstandingCents: number;
    currency: string;
    daysOverdue: number | null;
  }>;
  outstandingReceivableCents: number;
  recentPaymentCount30d: number;
  invoiceCount: number;
  paymentCount: number;
  xero: FinanceAuraXeroLinkStatus;
  jobUnlinkedOpenInvoiceCount: number;
  currency: string;
};

/** Build draft recommendation payloads from real signals — never auto-executed. */
export function buildFinanceAuraRecommendationDraftsFromSignals(
  signals: FinanceAuraSignalInput,
): Array<Omit<CreateFinanceAuraRecommendationRequest, never>> {
  const drafts: CreateFinanceAuraRecommendationRequest[] = [];

  if (signals.overdueInvoices.length > 0) {
    const top = signals.overdueInvoices[0]!;
    drafts.push({
      kind: 'collections',
      title: 'Review overdue receivables',
      recommendation: [
        `${signals.overdueInvoices.length} overdue invoice(s) found in TITAN.`,
        `Largest outstanding sample: ${formatFinanceAuraCents(top.outstandingCents, top.currency)}.`,
        'Draft recommendation for Owner approval — no collection message or ledger mutation was executed.',
      ].join(' '),
      sourceInvoiceId: top.invoiceId,
      sourceCustomerId: top.customerId ?? undefined,
    });
  }

  if (signals.outstandingReceivableCents > 0 && signals.invoiceCount > 0) {
    drafts.push({
      kind: 'receivables_review',
      title: 'Outstanding receivables review',
      recommendation: [
        `Outstanding receivables total ${formatFinanceAuraCents(signals.outstandingReceivableCents, signals.currency)} across ${signals.invoiceCount} invoice(s).`,
        'Recommend Owner review of ageing and follow-up priorities. No payment or write-off was applied.',
      ].join(' '),
    });
  }

  if (signals.invoiceCount > 0 && signals.recentPaymentCount30d === 0) {
    drafts.push({
      kind: 'payment_follow_up',
      title: 'No payments recorded in the last 30 days',
      recommendation:
        'Invoices exist but no TITAN payments were recorded in the last 30 days. Owner may review collection cadence. This is a draft only — nothing was auto-executed.',
    });
  }

  if (
    signals.xero.availability === 'unavailable' &&
    signals.invoiceCount > 0 &&
    signals.xero.invoicesWithXeroNumber === 0
  ) {
    drafts.push({
      kind: 'xero_reconciliation',
      title: 'Xero import linkage unavailable',
      recommendation:
        'Invoices exist in TITAN but no Xero connection/import markers were found. Connect or sync Xero when ready; this agent will not invent live Xero balances.',
    });
  } else if (
    signals.xero.availability === 'available' &&
    signals.xero.invoicesWithXeroNumber < signals.invoiceCount
  ) {
    drafts.push({
      kind: 'xero_reconciliation',
      title: 'Partial Xero invoice numbering',
      recommendation: [
        `${signals.xero.invoicesWithXeroNumber} of ${signals.invoiceCount} invoice(s) carry a Xero invoice number after import.`,
        'Owner may review sync/import coverage. No Xero write was attempted.',
      ].join(' '),
    });
  }

  if (signals.jobUnlinkedOpenInvoiceCount > 0) {
    drafts.push({
      kind: 'job_profitability_review',
      title: 'Open invoices without job linkage',
      recommendation: [
        `${signals.jobUnlinkedOpenInvoiceCount} open invoice(s) are not linked to a job.`,
        'Consider linking invoices to jobs for clearer job finance context. Draft only — records were not modified.',
      ].join(' '),
    });
  }

  return drafts;
}

export function buildFinanceAuraInsightBodies(context: FinanceAuraBusinessContext): Array<{
  kind: FinanceAuraInsightKind;
  title: string;
  body: string;
  metricLabel: string | null;
  metricValueCents: number | null;
  currency: string | null;
  sourceInvoiceCount: number;
  sourcePaymentCount: number;
}> {
  if (context.availability === 'unavailable') {
    return [
      {
        kind: 'business_financial_context',
        title: 'Financial context unavailable',
        body: context.summary,
        metricLabel: null,
        metricValueCents: null,
        currency: context.currency,
        sourceInvoiceCount: 0,
        sourcePaymentCount: 0,
      },
    ];
  }

  return [
    {
      kind: 'receivables_summary',
      title: 'Receivables from TITAN invoices',
      body: `Outstanding receivables ${
        context.outstandingReceivableCents == null
          ? 'unavailable'
          : formatFinanceAuraCents(context.outstandingReceivableCents, context.currency)
      } · ${context.overdueInvoiceCount} overdue invoice(s).`,
      metricLabel: 'outstanding_receivable',
      metricValueCents: context.outstandingReceivableCents,
      currency: context.currency,
      sourceInvoiceCount: context.invoiceCount,
      sourcePaymentCount: context.paymentCount,
    },
    {
      kind: 'payments_summary',
      title: 'Payments recorded in TITAN',
      body: `${context.paymentCount} payment(s) total; ${context.recentPaymentCount30d} in the last 30 days (${
        context.recentPaymentTotalCents == null
          ? 'total unavailable'
          : formatFinanceAuraCents(context.recentPaymentTotalCents, context.currency)
      }).`,
      metricLabel: 'recent_payments_30d',
      metricValueCents: context.recentPaymentTotalCents,
      currency: context.currency,
      sourceInvoiceCount: context.invoiceCount,
      sourcePaymentCount: context.paymentCount,
    },
    {
      kind: 'xero_link_status',
      title: 'Xero import / connection status',
      body:
        context.xero.availability === 'available'
          ? `Connection: ${context.xero.connectionStatus ?? 'unknown'}. ${context.xero.invoicesWithXeroNumber} invoice(s) with Xero number; ${context.xero.paymentsWithXeroId} payment(s) with Xero id. Live API not invented.`
          : context.xero.rationale,
      metricLabel: null,
      metricValueCents: null,
      currency: context.currency,
      sourceInvoiceCount: context.invoiceCount,
      sourcePaymentCount: context.paymentCount,
    },
    {
      kind: 'job_invoice_linkage',
      title: 'Job ↔ invoice linkage',
      body: `${context.jobLinkedInvoiceCount} of ${context.invoiceCount} invoice(s) linked to jobs; ${context.customerWithInvoicesCount} customer(s) with invoices.`,
      metricLabel: null,
      metricValueCents: null,
      currency: context.currency,
      sourceInvoiceCount: context.invoiceCount,
      sourcePaymentCount: context.paymentCount,
    },
  ];
}

export function buildFinanceAuraAlertDraftsFromSignals(signals: FinanceAuraSignalInput): Array<{
  kind: FinanceAuraAlertKind;
  severity: FinanceAuraAlertSeverity;
  title: string;
  detail: string;
  relatedInvoiceId: string | null;
  relatedCustomerId: string | null;
  amountCents: number | null;
  currency: string | null;
}> {
  const alerts: Array<{
    kind: FinanceAuraAlertKind;
    severity: FinanceAuraAlertSeverity;
    title: string;
    detail: string;
    relatedInvoiceId: string | null;
    relatedCustomerId: string | null;
    amountCents: number | null;
    currency: string | null;
  }> = [];

  if (signals.overdueInvoices.length > 0) {
    const top = signals.overdueInvoices[0]!;
    alerts.push({
      kind: 'overdue_invoices',
      severity: signals.overdueInvoices.length >= 5 ? 'critical' : 'warning',
      title: `${signals.overdueInvoices.length} overdue invoice(s)`,
      detail: 'Real TITAN invoices past due with outstanding balance. Alert only — no auto collection.',
      relatedInvoiceId: top.invoiceId,
      relatedCustomerId: top.customerId,
      amountCents: signals.overdueInvoices.reduce((sum, row) => sum + row.outstandingCents, 0),
      currency: signals.currency,
    });
  }

  if (signals.outstandingReceivableCents > 0) {
    alerts.push({
      kind: 'outstanding_receivables',
      severity: 'info',
      title: 'Outstanding receivables present',
      detail: `Outstanding ${formatFinanceAuraCents(signals.outstandingReceivableCents, signals.currency)} from open TITAN invoices.`,
      relatedInvoiceId: null,
      relatedCustomerId: null,
      amountCents: signals.outstandingReceivableCents,
      currency: signals.currency,
    });
  }

  if (signals.invoiceCount > 0 && signals.recentPaymentCount30d === 0) {
    alerts.push({
      kind: 'no_recent_payments',
      severity: 'warning',
      title: 'No payments in last 30 days',
      detail: 'Invoices exist but no payments were recorded recently in TITAN.',
      relatedInvoiceId: null,
      relatedCustomerId: null,
      amountCents: null,
      currency: signals.currency,
    });
  }

  if (
    signals.xero.connectionStatus === 'disconnected' ||
    (signals.invoiceCount > 0 &&
      signals.xero.availability === 'unavailable' &&
      signals.xero.invoicesWithXeroNumber === 0)
  ) {
    alerts.push({
      kind: 'xero_disconnected',
      severity: 'info',
      title: 'Xero link unavailable or disconnected',
      detail: signals.xero.rationale,
      relatedInvoiceId: null,
      relatedCustomerId: null,
      amountCents: null,
      currency: signals.currency,
    });
  }

  if (signals.jobUnlinkedOpenInvoiceCount > 0) {
    alerts.push({
      kind: 'unlinked_job_invoices',
      severity: 'info',
      title: 'Open invoices without job link',
      detail: `${signals.jobUnlinkedOpenInvoiceCount} open invoice(s) lack a jobId linkage.`,
      relatedInvoiceId: null,
      relatedCustomerId: null,
      amountCents: null,
      currency: signals.currency,
    });
  }

  return alerts;
}

export function listFinanceAuraAuraConnections(): FinanceAuraAuraConnection[] {
  return [
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'available_link',
      note: 'Finance agent key is registered in the Command Centre agent registry.',
    },
    {
      target: 'agent_network',
      label: 'AURA Agent Network',
      href: '/aura-agent-network',
      status: 'available_link',
      note: 'Finance participates in the Agent Network catalog (finance key) — sensitive actions stay approval-gated.',
    },
    {
      target: 'finance_invoices',
      label: 'Invoices',
      href: '/finance/invoices',
      status: 'available_link',
      note: 'System of record for TITAN invoices (including post-Xero-import numbers when present).',
    },
    {
      target: 'finance_payments',
      label: 'Payments',
      href: '/finance/payments',
      status: 'available_link',
      note: 'System of record for TITAN payments.',
    },
    {
      target: 'xero_settings',
      label: 'Xero integration',
      href: '/integrations/xero',
      status: 'available_link',
      note: 'Connect/sync Xero here — this agent reads imported TITAN data only.',
    },
    {
      target: 'finance_intelligence',
      label: 'Finance Intelligence',
      href: '/finance-intelligence',
      status: 'available_link',
      note: 'Existing advanced finance intelligence surface remains available when permitted.',
    },
    {
      target: 'financial_planning',
      label: 'Financial Planning',
      href: '/financial-planning',
      status: 'available_link',
      note: 'Enterprise financial planning remains a separate Owner surface.',
    },
  ];
}
