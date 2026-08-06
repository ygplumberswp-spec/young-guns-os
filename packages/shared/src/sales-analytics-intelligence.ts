/**
 * Sales Analytics Intelligence (Department 10.3)
 *
 * Extends Sales Intelligence Agent (10.1) / Sales Follow-up (10.2) /
 * CRM leads / quotes / sales pipeline / jobs / finance aggregates.
 *
 * Invariants:
 * - Real CRM/quotes/jobs/finance signals only — no invented conversion rates or revenue
 * - Honest unavailable when sample size insufficient
 * - AURA insights are recommendations only — no auto outreach
 * - Technician / Client denied; Owner + sales/leads RBAC
 */

export const SALES_ANALYTICS_INTELLIGENCE_KEY = 'sales-analytics-intelligence' as const;

/** Minimum quotes-sent sample before quote conversion rate is considered available. */
export const SAI_DEFAULT_MIN_CONVERSION_SAMPLE = 5;

export type SaiAvailability = 'available' | 'partial' | 'unavailable';

export type SaiInsightKind =
  | 'sales_trend'
  | 'lost_opportunity'
  | 'improvement_area'
  | 'conversion_signal'
  | 'revenue_opportunity'
  | 'performance_signal';

export type SaiInsightStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type SaiAuraInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'sales_intelligence_agent'
  | 'sales_followup_intelligence'
  | 'sales_intelligence'
  | 'crm'
  | 'quotes'
  | 'jobs'
  | 'finance'
  | 'leads';

export type SaiAuraInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type SaiMetricSnapshot = {
  availability: SaiAvailability;
  leadsCreated: number;
  quotesSent: number;
  quotesAccepted: number;
  quotesDeclined: number;
  openOpportunityCount: number;
  wonOpportunityCount: number;
  lostOpportunityCount: number;
  /** Null when no open opportunities with estimated values. */
  pipelineValueCents: number | null;
  /** Null when no accepted quotes with totals. */
  acceptedQuoteValueCents: number | null;
  currency: string;
  /** Null when sample size insufficient — never invented. */
  quoteConversionRatePercent: number | null;
  /** Null when leadsCreated insufficient or zero quotes. */
  leadToQuoteRatePercent: number | null;
  /** Null when closed opportunities sample insufficient. */
  winRatePercent: number | null;
  conversionAvailability: SaiAvailability;
  revenueAvailability: SaiAvailability;
  rationale: string;
};

export type SaiPerformanceRow = {
  label: string;
  value: number | null;
  unit: 'count' | 'percent' | 'cents';
  availability: SaiAvailability;
  note: string;
};

export type SaiInsightDraftSummary = {
  id: string;
  kind: SaiInsightKind;
  status: SaiInsightStatus;
  title: string;
  body: string;
  sourceQuoteId: string | null;
  sourceLeadId: string | null;
  sourceOpportunityId: string | null;
  sourceCustomerId: string | null;
  /** Invariant: always false. */
  inventedRates: false;
  /** Invariant: always false. */
  autoOutreach: false;
  createdAt: string;
  decidedAt: string | null;
};

export type SaiAuraInsightSummary = {
  id: string;
  target: SaiAuraInsightTarget;
  status: SaiAuraInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceInsightDraftId: string | null;
  createdAt: string;
};

export type SaiConnection = {
  target: SaiAuraInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'unavailable' | 'registry_stub';
  availability: SaiAvailability;
  note: string;
};

export type SaiSettings = {
  id: string;
  insightsEnabled: boolean;
  minConversionSample: number;
  /** Invariant: always false. */
  inventRatesEnabled: false;
  /** Invariant: always false. */
  autoOutreachEnabled: false;
  notes: string | null;
  updatedAt: string;
};

export type SaiAnalyticsSnapshotSummary = {
  id: string;
  leadsCreated: number;
  quotesSent: number;
  quotesAccepted: number;
  quotesDeclined: number;
  openOpportunityCount: number;
  wonOpportunityCount: number;
  lostOpportunityCount: number;
  pipelineValueCents: number | null;
  acceptedQuoteValueCents: number | null;
  currency: string;
  quoteConversionRatePercent: number | null;
  leadToQuoteRatePercent: number | null;
  winRatePercent: number | null;
  conversionAvailability: SaiAvailability;
  revenueAvailability: SaiAvailability;
  rationale: string;
  createdAt: string;
};

export type SaiOwnerDashboard = {
  summary: string;
  productClarification: {
    salesIntelligenceAgent: string;
    salesFollowup: string;
    enterpriseSalesIntelligence: string;
    thisLayer: string;
  };
  policy: {
    inventRates: false;
    inventRevenue: false;
    autoOutreach: false;
    requiresOwnerApproval: true;
    technicianClientDenied: true;
    fakeDataInvented: false;
  };
  metrics: SaiMetricSnapshot;
  performance: SaiPerformanceRow[];
  latestSnapshot: SaiAnalyticsSnapshotSummary | null;
  insightDrafts: SaiInsightDraftSummary[];
  auraInsights: SaiAuraInsightSummary[];
  connections: SaiConnection[];
  settings: SaiSettings;
  pendingApprovals: number;
};

export type RefreshSaiInsightsRequest = {
  submitForApproval?: boolean;
};

export type DecideSaiInsightRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type UpdateSaiSettingsRequest = {
  insightsEnabled?: boolean;
  minConversionSample?: number;
  notes?: string | null;
};

export type CreateSaiAuraInsightRequest = {
  target: SaiAuraInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceInsightDraftId?: string;
};

export type AcknowledgeSaiInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access ───────────────────────────────────────────────────────────────────

function isOwnerRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

/** Owner + sales/leads RBAC; Technician/Client always denied. */
export function canAccessSalesAnalyticsIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerRole(role)) return true;
  return (
    permissions.includes('sales:read') ||
    permissions.includes('sales:write') ||
    permissions.includes('sales_intelligence:read') ||
    permissions.includes('sales_intelligence:write') ||
    permissions.includes('sales_intelligence:manage') ||
    permissions.includes('leads:read') ||
    permissions.includes('leads:write') ||
    permissions.includes('analytics:read') ||
    permissions.includes('agents:read')
  );
}

export function canWriteSalesAnalyticsIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessSalesAnalyticsIntelligence(identity)) return false;
  const role = identity.roleName ?? '';
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerRole(role)) return true;
  return (
    permissions.includes('sales:write') ||
    permissions.includes('sales_intelligence:write') ||
    permissions.includes('sales_intelligence:manage') ||
    permissions.includes('leads:write') ||
    permissions.includes('agents:write')
  );
}

export function canApproveSaiInsightDrafts(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessSalesAnalyticsIntelligence(identity)) return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerRole(identity.roleName);
}

export function canManageSaiSettings(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canApproveSaiInsightDrafts(identity);
}

// ─── Copy & builders ──────────────────────────────────────────────────────────

export const SAI_PRODUCT_COPY = {
  salesIntelligenceAgent:
    'Sales Intelligence Agent (Department 10.1) remains the foundation for lead hunting, qualification, and Owner-gated outreach drafts at /sales-intelligence-agent.',
  salesFollowup:
    'Sales Follow-up Intelligence (Department 10.2) owns quote reminders and reactivation drafts at /sales-followup-intelligence — never auto-send.',
  enterpriseSalesIntelligence:
    'Enterprise Sales Intelligence at /sales-intelligence remains the advanced RevOps workspace — this layer focuses on honest pipeline analytics from real TITAN records.',
  thisLayer:
    'Sales Analytics Intelligence tracks leads created, quotes sent/accepted, conversion rates, revenue opportunities, and sales performance from real CRM/quotes/jobs/finance signals only. Rates stay unavailable when sample size is insufficient. AURA insights are recommendations only — no auto outreach.',
} as const;

export function defaultSaiSettings(partial?: Partial<SaiSettings> & { id: string }): SaiSettings {
  return {
    id: partial?.id ?? 'pending',
    insightsEnabled: partial?.insightsEnabled ?? true,
    minConversionSample: partial?.minConversionSample ?? SAI_DEFAULT_MIN_CONVERSION_SAMPLE,
    inventRatesEnabled: false,
    autoOutreachEnabled: false,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function roundPercent(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function buildSaiMetricSnapshot(input: {
  leadsCreated: number;
  quotesSent: number;
  quotesAccepted: number;
  quotesDeclined: number;
  openOpportunityCount: number;
  wonOpportunityCount: number;
  lostOpportunityCount: number;
  pipelineValueCents: number;
  acceptedQuoteValueCents: number;
  currency?: string;
  minConversionSample?: number;
}): SaiMetricSnapshot {
  const minSample = input.minConversionSample ?? SAI_DEFAULT_MIN_CONVERSION_SAMPLE;
  const currency = input.currency ?? 'ZAR';
  const closedOpps = input.wonOpportunityCount + input.lostOpportunityCount;

  const hasAnySignal =
    input.leadsCreated > 0 ||
    input.quotesSent > 0 ||
    input.quotesAccepted > 0 ||
    input.openOpportunityCount > 0 ||
    closedOpps > 0;

  if (!hasAnySignal) {
    return {
      availability: 'unavailable',
      leadsCreated: 0,
      quotesSent: 0,
      quotesAccepted: 0,
      quotesDeclined: 0,
      openOpportunityCount: 0,
      wonOpportunityCount: 0,
      lostOpportunityCount: 0,
      pipelineValueCents: null,
      acceptedQuoteValueCents: null,
      currency,
      quoteConversionRatePercent: null,
      leadToQuoteRatePercent: null,
      winRatePercent: null,
      conversionAvailability: 'unavailable',
      revenueAvailability: 'unavailable',
      rationale:
        'No real leads, quotes, or sales opportunities yet — sales analytics unavailable (not invented). Create CRM leads and quotes first.',
    };
  }

  let quoteConversionRatePercent: number | null = null;
  let conversionAvailability: SaiAvailability = 'unavailable';
  if (input.quotesSent >= minSample) {
    quoteConversionRatePercent = roundPercent(input.quotesAccepted, input.quotesSent);
    conversionAvailability = 'available';
  } else if (input.quotesSent > 0) {
    conversionAvailability = 'partial';
  }

  let leadToQuoteRatePercent: number | null = null;
  if (input.leadsCreated >= minSample) {
    leadToQuoteRatePercent = roundPercent(
      Math.min(input.quotesSent, input.leadsCreated),
      input.leadsCreated,
    );
  }

  let winRatePercent: number | null = null;
  if (closedOpps >= minSample) {
    winRatePercent = roundPercent(input.wonOpportunityCount, closedOpps);
  }

  const pipelineValueCents = input.pipelineValueCents > 0 ? input.pipelineValueCents : null;
  const acceptedQuoteValueCents =
    input.acceptedQuoteValueCents > 0 ? input.acceptedQuoteValueCents : null;

  let revenueAvailability: SaiAvailability = 'unavailable';
  if (pipelineValueCents !== null || acceptedQuoteValueCents !== null) {
    revenueAvailability = 'available';
  } else if (input.openOpportunityCount > 0 || input.quotesAccepted > 0) {
    revenueAvailability = 'partial';
  }

  const availability: SaiAvailability =
    conversionAvailability === 'available' && revenueAvailability === 'available'
      ? 'available'
      : 'partial';

  const rateNote =
    conversionAvailability === 'available'
      ? `Quote conversion ${quoteConversionRatePercent}% from ${input.quotesSent} sent quote(s).`
      : `Quote conversion unavailable — need at least ${minSample} sent quotes (have ${input.quotesSent}); rate not invented.`;

  return {
    availability,
    leadsCreated: input.leadsCreated,
    quotesSent: input.quotesSent,
    quotesAccepted: input.quotesAccepted,
    quotesDeclined: input.quotesDeclined,
    openOpportunityCount: input.openOpportunityCount,
    wonOpportunityCount: input.wonOpportunityCount,
    lostOpportunityCount: input.lostOpportunityCount,
    pipelineValueCents,
    acceptedQuoteValueCents,
    currency,
    quoteConversionRatePercent,
    leadToQuoteRatePercent,
    winRatePercent,
    conversionAvailability,
    revenueAvailability,
    rationale: [
      `Real pipeline signals: ${input.leadsCreated} lead(s), ${input.quotesSent} quote(s) sent, ${input.quotesAccepted} accepted, ${input.openOpportunityCount} open / ${input.wonOpportunityCount} won / ${input.lostOpportunityCount} lost opportunities.`,
      rateNote,
      revenueAvailability === 'available'
        ? 'Revenue opportunity values use stored estimated/accepted cents only — never invented.'
        : 'Revenue opportunity totals unavailable or partial without stored opportunity/quote values — not invented.',
    ].join(' '),
  };
}

export function buildSaiPerformanceRows(metrics: SaiMetricSnapshot): SaiPerformanceRow[] {
  return [
    {
      label: 'Leads created',
      value: metrics.leadsCreated,
      unit: 'count',
      availability: metrics.leadsCreated > 0 ? 'available' : 'unavailable',
      note:
        metrics.leadsCreated > 0
          ? 'Counted from real leads rows.'
          : 'No leads yet — not invented.',
    },
    {
      label: 'Quotes sent',
      value: metrics.quotesSent,
      unit: 'count',
      availability: metrics.quotesSent > 0 ? 'available' : 'unavailable',
      note:
        metrics.quotesSent > 0
          ? 'Quotes in sent/accepted (or issued) states.'
          : 'No sent quotes yet — not invented.',
    },
    {
      label: 'Quotes accepted',
      value: metrics.quotesAccepted,
      unit: 'count',
      availability: metrics.quotesAccepted > 0 ? 'available' : 'unavailable',
      note:
        metrics.quotesAccepted > 0
          ? 'Quotes with accepted status.'
          : 'No accepted quotes yet — not invented.',
    },
    {
      label: 'Quote conversion rate',
      value: metrics.quoteConversionRatePercent,
      unit: 'percent',
      availability: metrics.conversionAvailability,
      note:
        metrics.quoteConversionRatePercent !== null
          ? 'Accepted ÷ sent from real quotes.'
          : 'Unavailable until minimum sample of sent quotes — not invented.',
    },
    {
      label: 'Open pipeline value',
      value: metrics.pipelineValueCents,
      unit: 'cents',
      availability: metrics.pipelineValueCents !== null ? 'available' : metrics.revenueAvailability,
      note:
        metrics.pipelineValueCents !== null
          ? 'Sum of open opportunity estimatedValueCents.'
          : 'No stored open opportunity values — not invented.',
    },
    {
      label: 'Win rate',
      value: metrics.winRatePercent,
      unit: 'percent',
      availability:
        metrics.winRatePercent !== null
          ? 'available'
          : metrics.wonOpportunityCount + metrics.lostOpportunityCount > 0
            ? 'partial'
            : 'unavailable',
      note:
        metrics.winRatePercent !== null
          ? 'Won ÷ closed opportunities from real sales_opportunities.'
          : 'Unavailable until minimum closed-opportunity sample — not invented.',
    },
  ];
}

export function buildSalesTrendInsightDraft(input: {
  leadsCreated: number;
  quotesSent: number;
  quotesAccepted: number;
}): { kind: SaiInsightKind; title: string; body: string } {
  return {
    kind: 'sales_trend',
    title: `Sales trend — ${input.leadsCreated} leads / ${input.quotesSent} quotes sent`.slice(
      0,
      200,
    ),
    body: [
      `Real pipeline activity: ${input.leadsCreated} lead(s) created, ${input.quotesSent} quote(s) sent, ${input.quotesAccepted} accepted.`,
      '',
      'Draft AURA insight only — not an automatic outreach or invented conversion forecast.',
      'Review CRM, Quotes, and Sales Intelligence Agent for next actions. Owner approval required before any outreach.',
    ].join('\n'),
  };
}

export function buildLostOpportunityInsightDraft(input: {
  lostOpportunityCount: number;
  quotesDeclined: number;
}): { kind: SaiInsightKind; title: string; body: string } {
  return {
    kind: 'lost_opportunity',
    title: `Lost opportunities — ${input.lostOpportunityCount} lost / ${input.quotesDeclined} declined`.slice(
      0,
      200,
    ),
    body: [
      `${input.lostOpportunityCount} opportunity(ies) marked lost and ${input.quotesDeclined} quote(s) declined from real records.`,
      '',
      'Draft recommendation: review win/loss notes and consider Sales Follow-up drafts for recoverable quotes — never auto-send.',
      'AURA recommendation only. Owner approval required before outreach.',
    ].join('\n'),
  };
}

export function buildImprovementAreaInsightDraft(input: {
  quotesSent: number;
  quotesAccepted: number;
  minSample: number;
  conversionRatePercent: number | null;
}): { kind: SaiInsightKind; title: string; body: string } {
  if (input.conversionRatePercent === null) {
    return {
      kind: 'improvement_area',
      title: 'Improvement area — conversion sample insufficient'.slice(0, 200),
      body: [
        `Only ${input.quotesSent} sent quote(s) recorded (need ${input.minSample} for conversion rate).`,
        `${input.quotesAccepted} accepted so far — rate stays unavailable (not invented).`,
        '',
        'Draft recommendation: focus on issuing more real quotes before optimising conversion.',
        'AURA recommendation only — no automatic outreach.',
      ].join('\n'),
    };
  }

  return {
    kind: 'improvement_area',
    title: `Improvement area — conversion ${input.conversionRatePercent}%`.slice(0, 200),
    body: [
      `Quote conversion is ${input.conversionRatePercent}% from ${input.quotesSent} sent / ${input.quotesAccepted} accepted (real quotes).`,
      '',
      'Draft recommendation: review declined quotes and stalled opportunities; use Sales Follow-up drafts where appropriate.',
      'AURA recommendation only — Owner approval required before any outreach. Rates are not invented.',
    ].join('\n'),
  };
}

export function buildRevenueOpportunityInsightDraft(input: {
  openOpportunityCount: number;
  pipelineValueCents: number | null;
  currency: string;
}): { kind: SaiInsightKind; title: string; body: string } {
  const valueLabel =
    input.pipelineValueCents !== null
      ? `${(input.pipelineValueCents / 100).toFixed(2)} ${input.currency}`
      : 'value unavailable (no stored estimates)';

  return {
    kind: 'revenue_opportunity',
    title: `Revenue opportunities — ${input.openOpportunityCount} open`.slice(0, 200),
    body: [
      `${input.openOpportunityCount} open opportunity(ies). Pipeline value: ${valueLabel}.`,
      '',
      'Values use stored estimatedValueCents only — never invented revenue.',
      'Draft AURA insight only. No automatic outreach or pipeline mutation.',
    ].join('\n'),
  };
}

export function buildAuraSalesInsightDraft(input: {
  kind: 'sales_trend' | 'lost_opportunity' | 'improvement_area';
  title: string;
  supportingSignals: string[];
  recommendation: string;
}): { target: SaiAuraInsightTarget; title: string; insight: string } {
  const target: SaiAuraInsightTarget =
    input.kind === 'lost_opportunity'
      ? 'sales_followup_intelligence'
      : input.kind === 'improvement_area'
        ? 'sales_intelligence_agent'
        : 'command_centre';

  const signals =
    input.supportingSignals.length > 0
      ? input.supportingSignals.map((s) => `• ${s}`).join('\n')
      : '• No supporting signals supplied.';

  return {
    target,
    title: input.title.slice(0, 200),
    insight: [
      `AURA sales analytics insight (${input.kind.replace(/_/g, ' ')}) — draft recommendation only.`,
      '',
      'Supporting signals:',
      signals,
      '',
      `Recommendation: ${input.recommendation}`,
      '',
      'Not invented rates/revenue. No automatic outreach. Owner review required.',
    ].join('\n'),
  };
}

export function listSaiConnections(input?: {
  leadsAvailable?: boolean;
  quotesAvailable?: boolean;
  opportunitiesAvailable?: boolean;
  financeLinkAvailable?: boolean;
  salesAgentPresent?: boolean;
  salesFollowupPresent?: boolean;
}): SaiConnection[] {
  const leadsAvailable = input?.leadsAvailable ?? false;
  const quotesAvailable = input?.quotesAvailable ?? false;
  const opportunitiesAvailable = input?.opportunitiesAvailable ?? false;
  const financeLinkAvailable = input?.financeLinkAvailable ?? true;
  const salesAgentPresent = input?.salesAgentPresent ?? true;
  const salesFollowupPresent = input?.salesFollowupPresent ?? true;

  return [
    {
      target: 'crm',
      label: 'CRM',
      href: '/crm',
      status: 'available_link',
      availability: 'available',
      note: 'Customer records — system of record for contacts.',
    },
    {
      target: 'leads',
      label: 'Leads',
      href: '/leads',
      status: leadsAvailable ? 'available_link' : 'unavailable',
      availability: leadsAvailable ? 'available' : 'unavailable',
      note: leadsAvailable
        ? 'Real leads available for analytics.'
        : 'No leads yet — connection shown as unavailable.',
    },
    {
      target: 'quotes',
      label: 'Quotes',
      href: '/quotes',
      status: quotesAvailable ? 'available_link' : 'unavailable',
      availability: quotesAvailable ? 'available' : 'unavailable',
      note: quotesAvailable
        ? 'Real quotes available for conversion tracking.'
        : 'No quotes yet — conversion stays unavailable.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      availability: 'available',
      note: 'Jobs for accepted-work context — read aggregates only.',
    },
    {
      target: 'finance',
      label: 'Finance reporting',
      href: '/finance-reporting-forecast',
      status: financeLinkAvailable ? 'available_link' : 'registry_stub',
      availability: financeLinkAvailable ? 'available' : 'unavailable',
      note: 'Finance aggregates / reporting — read-only handoff; no invented revenue here.',
    },
    {
      target: 'sales_intelligence_agent',
      label: 'Sales Intelligence Agent',
      href: '/sales-intelligence-agent',
      status: salesAgentPresent ? 'available_link' : 'registry_stub',
      availability: salesAgentPresent ? 'available' : 'unavailable',
      note: 'Department 10.1 foundation — lead hunting and approval-gated drafts.',
    },
    {
      target: 'sales_followup_intelligence',
      label: 'Sales Follow-up',
      href: '/sales-followup-intelligence',
      status: salesFollowupPresent ? 'available_link' : 'registry_stub',
      availability: salesFollowupPresent ? 'available' : 'unavailable',
      note: 'Department 10.2 — quote reminders and reactivation drafts (never auto-send).',
    },
    {
      target: 'sales_intelligence',
      label: 'Enterprise Sales Intelligence',
      href: '/sales-intelligence',
      status: opportunitiesAvailable || quotesAvailable ? 'available_link' : 'available_link',
      availability: 'available',
      note: 'Advanced RevOps workspace — complementary to this analytics layer.',
    },
    {
      target: 'executive_dashboard',
      label: 'Executive Dashboard',
      href: '/dashboard',
      status: 'available_link',
      availability: 'available',
      note: 'Executive overview handoff — analytics remain grounded in real TITAN data.',
    },
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'available_link',
      availability: 'available',
      note: 'AURA coordination — insight handoffs only; never auto outreach.',
    },
  ];
}
