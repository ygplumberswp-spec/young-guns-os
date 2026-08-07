/**
 * Sales Intelligence Agent Foundation (Department 10.1)
 *
 * Owner-gated sales intelligence over real TITAN CRM leads, sales pipeline,
 * quotes, customers, and communications. Extends existing sales / leads /
 * enterprise sales intelligence — does not rebuild CRM.
 *
 * Invariants:
 * - No fake leads/opportunities; unavailable when no real records
 * - No spam / uncontrolled outreach; Owner approval before external actions
 * - Technician / Client denied; Owner + sales/leads RBAC only
 * - Audit all intelligence actions via security_audit_logs
 */

export const SALES_INTELLIGENCE_AGENT_KEY = 'sales' as const;
export const SALES_INTELLIGENCE_CHAT_AGENT_KEY = 'sales_intelligence' as const;

export const SALES_INTELLIGENCE_AGENT_CAPABILITIES = [
  'lead_hunting',
  'lead_qualification',
  'pipeline_read',
  'opportunity_signals',
  'conversion_tracking',
  'draft_outreach_recommendation',
  'sales_insights',
  'best_next_action',
  'owner_decision_support',
] as const;

export type SalesIntelligenceAgentCapability =
  (typeof SALES_INTELLIGENCE_AGENT_CAPABILITIES)[number];

export type SalesIntelligenceRecommendationKind =
  | 'outreach_draft'
  | 'follow_up'
  | 'lead_priority'
  | 'quote_follow_up'
  | 'pipeline_advance'
  | 'revenue_opportunity'
  | 'best_next_action'
  | 'owner_decision'
  | 'aura_handoff';

export type SalesIntelligenceRecommendationStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type SalesIntelligenceInsightKind =
  | 'lead_hunting_summary'
  | 'qualification_summary'
  | 'pipeline_summary'
  | 'conversion_tracking'
  | 'revenue_opportunity'
  | 'best_next_action'
  | 'lead_priority'
  | 'business_sales_context';

export type SalesIntelligenceSignalKind =
  | 'lead_source'
  | 'unconverted_quote'
  | 'open_opportunity'
  | 'stale_follow_up'
  | 'high_score_lead'
  | 'comms_signal'
  | 'market_opportunity'
  | 'conversion';

export type SalesIntelligenceAgentIdentity = {
  agentKey: typeof SALES_INTELLIGENCE_AGENT_KEY;
  chatAgentKey: typeof SALES_INTELLIGENCE_CHAT_AGENT_KEY;
  name: string;
  description: string;
  capabilities: SalesIntelligenceAgentCapability[];
  registry: {
    commandCentreKey: 'sales';
    agentNetworkKey: 'sales';
    globalAgentKey: 'sales';
    chatAgentKey: 'sales_intelligence';
  };
  status: 'foundation_active';
  autoExecuteOutreach: false;
};

export type SalesIntelligenceRecommendationSummary = {
  id: string;
  kind: SalesIntelligenceRecommendationKind;
  status: SalesIntelligenceRecommendationStatus;
  title: string;
  recommendation: string;
  draftOutreach: string | null;
  sourceLeadId: string | null;
  sourceOpportunityId: string | null;
  sourceQuoteId: string | null;
  sourceCustomerId: string | null;
  /** Always false — never auto-send outreach. */
  autoExecuted: false;
  outreachSent: false;
  createdAt: string;
  decidedAt: string | null;
};

export type SalesIntelligenceInsightSummary = {
  id: string;
  kind: SalesIntelligenceInsightKind;
  title: string;
  body: string;
  metricLabel: string | null;
  metricValue: number | null;
  metricValueCents: number | null;
  currency: string | null;
  sourceLeadCount: number;
  sourceOpportunityCount: number;
  sourceQuoteCount: number;
  createdAt: string;
};

export type SalesIntelligenceSignalSummary = {
  id: string;
  kind: SalesIntelligenceSignalKind;
  title: string;
  detail: string;
  priority: string;
  sourceLeadId: string | null;
  sourceOpportunityId: string | null;
  sourceQuoteId: string | null;
  sourceCustomerId: string | null;
  sourceLeadSourceId: string | null;
  estimatedValueCents: number | null;
  currency: string | null;
  dismissed: boolean;
  createdAt: string;
};

export type SalesIntelligenceQualificationSample = {
  leadId: string;
  title: string;
  status: string;
  urgency: string;
  score: number | null;
  needsSummary: string | null;
  jobValueCents: number | null;
  potentialValueCents: number | null;
  urgencyLabel: string;
  availability: 'available' | 'partial' | 'unavailable';
};

export type SalesIntelligencePipelineSummary = {
  availability: 'available' | 'unavailable';
  stageCount: number;
  openOpportunityCount: number;
  wonOpportunityCount: number;
  lostOpportunityCount: number;
  openPipelineValueCents: number | null;
  currency: string;
  followUpDueCount: number;
  conversionCount: number;
  summary: string;
};

export type SalesIntelligenceLeadHuntingSummary = {
  availability: 'available' | 'unavailable';
  leadSourceCount: number;
  openLeadCount: number;
  highScoreLeadCount: number;
  unconvertedQuoteCount: number;
  communicationSignalCount: number;
  marketOpportunityCount: number;
  summary: string;
};

export type SalesIntelligenceBusinessContext = {
  availability: 'available' | 'unavailable';
  currency: string;
  customerCount: number;
  leadCount: number;
  openLeadCount: number;
  opportunityCount: number;
  openOpportunityCount: number;
  quoteCount: number;
  sentQuoteCount: number;
  conversionCount: number;
  communicationCount: number;
  leadHunting: SalesIntelligenceLeadHuntingSummary;
  pipeline: SalesIntelligencePipelineSummary;
  qualificationSamples: SalesIntelligenceQualificationSample[];
  summary: string;
};

export type SalesIntelligenceQuestionAnswer = {
  question: string;
  answer: string;
  availability: 'available' | 'unavailable';
  groundedIn: Array<'leads' | 'opportunities' | 'quotes' | 'customers' | 'communications' | 'conversions'>;
  autoExecuted: false;
  outreachSent: false;
  context: SalesIntelligenceBusinessContext;
};

export type SalesIntelligenceAuraConnection = {
  target:
    | 'command_centre'
    | 'agent_network'
    | 'sales_intelligence'
    | 'leads'
    | 'sales_pipeline'
    | 'quotes'
    | 'crm';
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type SalesIntelligenceAgentDashboard = {
  summary: string;
  identity: SalesIntelligenceAgentIdentity;
  productClarification: {
    existingCrmLeads: string;
    existingSalesPipeline: string;
    enterpriseSalesIntelligence: string;
    thisLayer: string;
  };
  policy: {
    autoExecuteEnabled: false;
    autoOutreachEnabled: false;
    requiresOwnerApproval: true;
    technicianClientDenied: true;
    fakeDataInvented: false;
    spamProhibited: true;
  };
  registry: {
    commandCentreStatus: string;
    note: string;
  };
  businessContext: SalesIntelligenceBusinessContext;
  recommendations: SalesIntelligenceRecommendationSummary[];
  insights: SalesIntelligenceInsightSummary[];
  signals: SalesIntelligenceSignalSummary[];
  auraConnections: SalesIntelligenceAuraConnection[];
};

export type CreateSalesIntelligenceRecommendationRequest = {
  kind: SalesIntelligenceRecommendationKind;
  title: string;
  recommendation: string;
  draftOutreach?: string;
  sourceLeadId?: string;
  sourceOpportunityId?: string;
  sourceQuoteId?: string;
  sourceCustomerId?: string;
};

export type DecideSalesIntelligenceRecommendationRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type AskSalesIntelligenceQuestionRequest = {
  question: string;
};

// ─── Access helpers ───────────────────────────────────────────────────────────

function isOwnerRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  );
}

/** Owner + sales/leads RBAC; Technician/Client always denied. */
export function canAccessSalesIntelligenceAgent(identity: {
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
    permissions.includes('agents:read')
  );
}

export function canWriteSalesIntelligenceAgent(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessSalesIntelligenceAgent(identity)) return false;
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

/** Owner (Company/Platform) or * may approve outreach / recommendations. */
export function canApproveSalesIntelligenceAgent(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessSalesIntelligenceAgent(identity)) return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerRole(identity.roleName);
}

// ─── Identity & copy ──────────────────────────────────────────────────────────

export function getSalesIntelligenceAgentIdentity(): SalesIntelligenceAgentIdentity {
  return {
    agentKey: SALES_INTELLIGENCE_AGENT_KEY,
    chatAgentKey: SALES_INTELLIGENCE_CHAT_AGENT_KEY,
    name: 'Sales Intelligence Agent',
    description:
      'Owner-gated sales intelligence — lead hunting, qualification, pipeline insights, and draft outreach recommendations grounded in real TITAN CRM, leads, quotes, and communications. Never auto-sends outreach.',
    capabilities: [...SALES_INTELLIGENCE_AGENT_CAPABILITIES],
    registry: {
      commandCentreKey: 'sales',
      agentNetworkKey: 'sales',
      globalAgentKey: 'sales',
      chatAgentKey: 'sales_intelligence',
    },
    status: 'foundation_active',
    autoExecuteOutreach: false,
  };
}

export const SALES_INTELLIGENCE_AGENT_PRODUCT_COPY = {
  existingCrmLeads:
    'CRM customers and the Leads module remain the system of record for contacts and lead lifecycle — this agent does not invent leads or replace CRM.',
  existingSalesPipeline:
    'Sales pipeline stages/opportunities (`/sales`, `/sales-intelligence`) remain the operational pipeline — this foundation adds AURA agent identity and Owner-gated insight/recommendation drafts.',
  enterpriseSalesIntelligence:
    'Enterprise Sales Intelligence remains available for advanced forecasts/accounts when permitted. This layer focuses on Department 10.1 foundation: hunting, qualification, pipeline tracking, and approval-gated outreach drafts.',
  thisLayer:
    'Sales Intelligence Agent Foundation registers with Command Centre (sales key), surfaces lead/opportunity signals from real TITAN data only, and never auto-sends outreach or creates spam.',
} as const;

export function unavailableSalesIntelligenceBusinessContext(
  currency = 'ZAR',
): SalesIntelligenceBusinessContext {
  return {
    availability: 'unavailable',
    currency,
    customerCount: 0,
    leadCount: 0,
    openLeadCount: 0,
    opportunityCount: 0,
    openOpportunityCount: 0,
    quoteCount: 0,
    sentQuoteCount: 0,
    conversionCount: 0,
    communicationCount: 0,
    leadHunting: {
      availability: 'unavailable',
      leadSourceCount: 0,
      openLeadCount: 0,
      highScoreLeadCount: 0,
      unconvertedQuoteCount: 0,
      communicationSignalCount: 0,
      marketOpportunityCount: 0,
      summary:
        'No leads, quotes, or opportunity signals found for this tenant. Lead hunting is unavailable — values are not invented.',
    },
    pipeline: {
      availability: 'unavailable',
      stageCount: 0,
      openOpportunityCount: 0,
      wonOpportunityCount: 0,
      lostOpportunityCount: 0,
      openPipelineValueCents: null,
      currency,
      followUpDueCount: 0,
      conversionCount: 0,
      summary:
        'No sales pipeline opportunities or conversions found. Pipeline tracking is unavailable — values are not invented.',
    },
    qualificationSamples: [],
    summary:
      'No CRM leads, sales opportunities, or quotes found for this tenant. Sales context is unavailable — leads and opportunities are not invented.',
  };
}

export function formatSalesIntelligenceCents(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  return `${currency} ${amount}`;
}

export function buildSalesIntelligenceBusinessContext(input: {
  currency?: string;
  customerCount: number;
  leadCount: number;
  openLeadCount: number;
  opportunityCount: number;
  openOpportunityCount: number;
  quoteCount: number;
  sentQuoteCount: number;
  conversionCount: number;
  communicationCount: number;
  leadSourceCount: number;
  highScoreLeadCount: number;
  unconvertedQuoteCount: number;
  stageCount: number;
  wonOpportunityCount: number;
  lostOpportunityCount: number;
  openPipelineValueCents: number | null;
  followUpDueCount: number;
  qualificationSamples: SalesIntelligenceQualificationSample[];
}): SalesIntelligenceBusinessContext {
  const currency = input.currency ?? 'ZAR';
  if (
    input.leadCount === 0 &&
    input.opportunityCount === 0 &&
    input.quoteCount === 0 &&
    input.customerCount === 0
  ) {
    return unavailableSalesIntelligenceBusinessContext(currency);
  }

  const huntingAvailable =
    input.leadCount > 0 ||
    input.unconvertedQuoteCount > 0 ||
    input.leadSourceCount > 0 ||
    input.communicationCount > 0;
  const pipelineAvailable = input.opportunityCount > 0 || input.stageCount > 0 || input.conversionCount > 0;
  const marketOpportunityCount = input.unconvertedQuoteCount + input.openOpportunityCount;

  const leadHunting: SalesIntelligenceLeadHuntingSummary = huntingAvailable
    ? {
        availability: 'available',
        leadSourceCount: input.leadSourceCount,
        openLeadCount: input.openLeadCount,
        highScoreLeadCount: input.highScoreLeadCount,
        unconvertedQuoteCount: input.unconvertedQuoteCount,
        communicationSignalCount: input.communicationCount,
        marketOpportunityCount,
        summary: [
          `${input.leadSourceCount} lead source(s)`,
          `${input.openLeadCount} open lead(s)`,
          `${input.highScoreLeadCount} high-score lead(s)`,
          `${input.unconvertedQuoteCount} unconverted quote(s)`,
          `${input.communicationCount} communication record(s)`,
        ].join(' · '),
      }
    : {
        availability: 'unavailable',
        leadSourceCount: 0,
        openLeadCount: 0,
        highScoreLeadCount: 0,
        unconvertedQuoteCount: 0,
        communicationSignalCount: 0,
        marketOpportunityCount: 0,
        summary:
          'Lead hunting signals unavailable — no real leads, quotes, or communications to analyse.',
      };

  const pipeline: SalesIntelligencePipelineSummary = pipelineAvailable
    ? {
        availability: 'available',
        stageCount: input.stageCount,
        openOpportunityCount: input.openOpportunityCount,
        wonOpportunityCount: input.wonOpportunityCount,
        lostOpportunityCount: input.lostOpportunityCount,
        openPipelineValueCents: input.openPipelineValueCents,
        currency,
        followUpDueCount: input.followUpDueCount,
        conversionCount: input.conversionCount,
        summary: [
          `${input.stageCount} stage(s)`,
          `${input.openOpportunityCount} open opportunit(ies)`,
          `${input.wonOpportunityCount} won / ${input.lostOpportunityCount} lost`,
          `open value ${
            input.openPipelineValueCents == null
              ? 'unavailable'
              : formatSalesIntelligenceCents(input.openPipelineValueCents, currency)
          }`,
          `${input.followUpDueCount} follow-up(s) due`,
          `${input.conversionCount} conversion(s)`,
        ].join(' · '),
      }
    : {
        availability: 'unavailable',
        stageCount: 0,
        openOpportunityCount: 0,
        wonOpportunityCount: 0,
        lostOpportunityCount: 0,
        openPipelineValueCents: null,
        currency,
        followUpDueCount: 0,
        conversionCount: 0,
        summary: 'Pipeline unavailable — no real opportunities or conversions stored.',
      };

  return {
    availability: 'available',
    currency,
    customerCount: input.customerCount,
    leadCount: input.leadCount,
    openLeadCount: input.openLeadCount,
    opportunityCount: input.opportunityCount,
    openOpportunityCount: input.openOpportunityCount,
    quoteCount: input.quoteCount,
    sentQuoteCount: input.sentQuoteCount,
    conversionCount: input.conversionCount,
    communicationCount: input.communicationCount,
    leadHunting,
    pipeline,
    qualificationSamples: input.qualificationSamples,
    summary: [
      `${input.customerCount} customer(s)`,
      `${input.leadCount} lead(s)`,
      `${input.openOpportunityCount} open opportunit(ies)`,
      `${input.sentQuoteCount} sent/accepted quote(s)`,
      `${input.conversionCount} conversion(s)`,
    ].join(' · ') + '. Figures from real TITAN records only.',
  };
}

export function buildSalesIntelligenceQualificationSample(input: {
  leadId: string;
  title: string;
  status: string;
  urgency: string;
  score: number | null;
  serviceType: string | null;
  notes: string | null;
  linkedQuoteValueCents: number | null;
}): SalesIntelligenceQualificationSample {
  const needsParts = [input.serviceType, input.notes].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  const needsSummary = needsParts.length > 0 ? needsParts.join(' — ').slice(0, 280) : null;
  const urgencyLabel =
    input.urgency === 'urgent' || input.urgency === 'high'
      ? 'high'
      : input.urgency === 'low'
        ? 'low'
        : input.urgency?.trim()
          ? input.urgency
          : 'normal';

  const hasScore = input.score != null;
  const hasNeeds = needsSummary != null;
  const hasValue = input.linkedQuoteValueCents != null;
  const availability: SalesIntelligenceQualificationSample['availability'] =
    hasScore || hasNeeds || hasValue
      ? hasScore && (hasNeeds || hasValue)
        ? 'available'
        : 'partial'
      : 'unavailable';

  return {
    leadId: input.leadId,
    title: input.title,
    status: input.status,
    urgency: input.urgency,
    score: input.score,
    needsSummary,
    jobValueCents: input.linkedQuoteValueCents,
    potentialValueCents: input.linkedQuoteValueCents,
    urgencyLabel,
    availability,
  };
}

export function answerSalesIntelligenceQuestion(input: {
  question: string;
  context: SalesIntelligenceBusinessContext;
}): SalesIntelligenceQuestionAnswer {
  const question = input.question.trim();
  const q = question.toLowerCase();
  const groundedIn: SalesIntelligenceQuestionAnswer['groundedIn'] = [];

  if (input.context.availability === 'unavailable') {
    return {
      question,
      answer:
        'Sales context is unavailable — there are no leads, opportunities, or quotes for this tenant yet. TITAN does not invent leads, pipeline value, or conversion probabilities.',
      availability: 'unavailable',
      groundedIn: [],
      autoExecuted: false,
      outreachSent: false,
      context: input.context,
    };
  }

  if (input.context.leadCount > 0) groundedIn.push('leads');
  if (input.context.opportunityCount > 0) groundedIn.push('opportunities');
  if (input.context.quoteCount > 0) groundedIn.push('quotes');
  if (input.context.customerCount > 0) groundedIn.push('customers');
  if (input.context.communicationCount > 0) groundedIn.push('communications');
  if (input.context.conversionCount > 0) groundedIn.push('conversions');

  let answer = input.context.summary;

  if (q.includes('priority') || q.includes('best next') || q.includes('next action')) {
    const top = input.context.qualificationSamples.find((s) => s.availability !== 'unavailable');
    answer = top
      ? [
          `Best next action draft (not sent): review lead "${top.title}" (status ${top.status}`,
          top.score != null ? `, score ${top.score}` : '',
          `, urgency ${top.urgencyLabel}).`,
          ' Owner approval is required before any outreach.',
        ].join('')
      : 'No qualified lead samples available for a best-next-action suggestion. Nothing was auto-contacted.';
  } else if (q.includes('pipeline') || q.includes('opportunity')) {
    answer = input.context.pipeline.summary + ' No opportunity was auto-created or advanced.';
  } else if (q.includes('lead') || q.includes('hunt') || q.includes('source')) {
    answer = input.context.leadHunting.summary + ' Lead hunting uses stored records only — no scraped or invented leads.';
  } else if (q.includes('convert') || q.includes('conversion') || q.includes('won')) {
    answer = [
      `Conversions recorded: ${input.context.conversionCount}.`,
      `Won opportunities: ${input.context.pipeline.wonOpportunityCount}.`,
      'Conversion tracking uses stored lead_conversions / opportunity statuses only.',
    ].join(' ');
  } else if (q.includes('quote') || q.includes('revenue')) {
    answer = [
      `Quotes: ${input.context.quoteCount} (${input.context.sentQuoteCount} sent/accepted).`,
      `Open pipeline value: ${
        input.context.pipeline.openPipelineValueCents == null
          ? 'unavailable'
          : formatSalesIntelligenceCents(
              input.context.pipeline.openPipelineValueCents,
              input.context.currency,
            )
      }.`,
      'Revenue opportunity figures use real quote/opportunity amounts only.',
    ].join(' ');
  } else if (q.includes('outreach') || q.includes('email') || q.includes('message') || q.includes('spam')) {
    answer =
      'Outreach remains draft-only. Owner approval is required before any external contact. Uncontrolled outreach and spam are prohibited — nothing was sent.';
  }

  return {
    question,
    answer,
    availability: 'available',
    groundedIn,
    autoExecuted: false,
    outreachSent: false,
    context: input.context,
  };
}

export type SalesIntelligenceSignalInput = {
  currency: string;
  openLeads: Array<{
    leadId: string;
    customerId: string | null;
    title: string;
    status: string;
    score: number;
    urgency: string;
    nextActionDueAt: string | null;
  }>;
  unconvertedQuotes: Array<{
    quoteId: string;
    customerId: string;
    title: string;
    amountCents: number;
    status: string;
  }>;
  openOpportunities: Array<{
    opportunityId: string;
    customerId: string;
    title: string;
    estimatedValueCents: number | null;
    status: string;
  }>;
  leadSources: Array<{ sourceId: string; name: string; enabled: boolean }>;
  conversionCount: number;
  communicationCount: number;
  followUpDueCount: number;
};

/** Build draft recommendation payloads from real signals — never auto-executed / never sent. */
export function buildSalesIntelligenceRecommendationDraftsFromSignals(
  signals: SalesIntelligenceSignalInput,
): CreateSalesIntelligenceRecommendationRequest[] {
  const drafts: CreateSalesIntelligenceRecommendationRequest[] = [];

  const highScore = signals.openLeads
    .filter((l) => l.score >= 70)
    .sort((a, b) => b.score - a.score);
  if (highScore.length > 0) {
    const top = highScore[0]!;
    drafts.push({
      kind: 'lead_priority',
      title: `Prioritise high-score lead: ${top.title}`,
      recommendation: [
        `${highScore.length} open lead(s) score ≥ 70 from stored lead scores.`,
        `Top sample: "${top.title}" (score ${top.score}, status ${top.status}, urgency ${top.urgency}).`,
        'Draft for Owner review — no outreach was sent.',
      ].join(' '),
      draftOutreach: [
        `Hi — following up on your enquiry (${top.title}).`,
        'We are ready to help when you are. Please reply if you would like a quote or booking.',
        '(Sales Intelligence draft — not sent.)',
      ].join(' '),
      sourceLeadId: top.leadId,
      sourceCustomerId: top.customerId ?? undefined,
    });
  }

  if (signals.unconvertedQuotes.length > 0) {
    const top = [...signals.unconvertedQuotes].sort((a, b) => b.amountCents - a.amountCents)[0]!;
    drafts.push({
      kind: 'quote_follow_up',
      title: `Follow up unconverted quote: ${top.title}`,
      recommendation: [
        `${signals.unconvertedQuotes.length} quote(s) in sent/viewed/accepted states without conversion signal.`,
        `Largest sample: ${formatSalesIntelligenceCents(top.amountCents, signals.currency)} (${top.status}).`,
        'Owner approval required before any customer message.',
      ].join(' '),
      draftOutreach: [
        `Hi — checking in on quote "${top.title}".`,
        'Happy to answer questions or adjust scope if needed.',
        '(Sales Intelligence draft — not sent.)',
      ].join(' '),
      sourceQuoteId: top.quoteId,
      sourceCustomerId: top.customerId,
    });
  }

  if (signals.followUpDueCount > 0 || signals.openLeads.some((l) => l.nextActionDueAt)) {
    const due = signals.openLeads.find((l) => l.nextActionDueAt) ?? signals.openLeads[0];
    if (due) {
      drafts.push({
        kind: 'follow_up',
        title: `Follow-up due: ${due.title}`,
        recommendation: [
          `${signals.followUpDueCount || 1} lead follow-up signal(s) from stored next-action dates / open leads.`,
          'Draft recommendation only — no message was delivered.',
        ].join(' '),
        draftOutreach: [
          `Hi — quick follow-up on ${due.title}.`,
          'Let us know a good time to continue.',
          '(Sales Intelligence draft — not sent.)',
        ].join(' '),
        sourceLeadId: due.leadId,
        sourceCustomerId: due.customerId ?? undefined,
      });
    }
  }

  if (signals.openOpportunities.length > 0) {
    const top = signals.openOpportunities[0]!;
    drafts.push({
      kind: 'revenue_opportunity',
      title: `Review open opportunity: ${top.title}`,
      recommendation: [
        `${signals.openOpportunities.length} open sales opportunit(ies) in the pipeline.`,
        top.estimatedValueCents != null
          ? `Sample value ${formatSalesIntelligenceCents(top.estimatedValueCents, signals.currency)}.`
          : 'Sample value unavailable (not invented).',
        'Draft insight for Owner — pipeline records were not auto-advanced.',
      ].join(' '),
      sourceOpportunityId: top.opportunityId,
      sourceCustomerId: top.customerId,
    });
  }

  if (signals.openLeads.length > 0) {
    const top = signals.openLeads[0]!;
    drafts.push({
      kind: 'best_next_action',
      title: 'Best next sales action (draft)',
      recommendation: [
        `Review open lead "${top.title}" (${top.status}).`,
        'Suggested next step: qualify needs / confirm urgency / prepare quote if value signals exist.',
        'Draft recommendation for Owner approval — no automatic outreach was sent and no CRM mutation was performed.',
      ].join(' '),
      sourceLeadId: top.leadId,
      sourceCustomerId: top.customerId ?? undefined,
    });
  }

  return drafts;
}

export function buildSalesIntelligenceInsightBodies(
  context: SalesIntelligenceBusinessContext,
): Array<{
  kind: SalesIntelligenceInsightKind;
  title: string;
  body: string;
  metricLabel: string | null;
  metricValue: number | null;
  metricValueCents: number | null;
  currency: string | null;
  sourceLeadCount: number;
  sourceOpportunityCount: number;
  sourceQuoteCount: number;
}> {
  if (context.availability === 'unavailable') {
    return [
      {
        kind: 'business_sales_context',
        title: 'Sales context unavailable',
        body: context.summary,
        metricLabel: null,
        metricValue: null,
        metricValueCents: null,
        currency: context.currency,
        sourceLeadCount: 0,
        sourceOpportunityCount: 0,
        sourceQuoteCount: 0,
      },
    ];
  }

  return [
    {
      kind: 'lead_hunting_summary',
      title: 'Lead hunting from real sources',
      body: context.leadHunting.summary,
      metricLabel: 'open_leads',
      metricValue: context.leadHunting.openLeadCount,
      metricValueCents: null,
      currency: context.currency,
      sourceLeadCount: context.leadCount,
      sourceOpportunityCount: context.opportunityCount,
      sourceQuoteCount: context.quoteCount,
    },
    {
      kind: 'qualification_summary',
      title: 'Lead qualification samples',
      body:
        context.qualificationSamples.length === 0
          ? 'No lead qualification samples available — scores/needs/value are not invented when signals are missing.'
          : `${context.qualificationSamples.length} lead sample(s) with honest scoring from stored status/urgency/score/quote links.`,
      metricLabel: 'qualification_samples',
      metricValue: context.qualificationSamples.length,
      metricValueCents: null,
      currency: context.currency,
      sourceLeadCount: context.leadCount,
      sourceOpportunityCount: context.opportunityCount,
      sourceQuoteCount: context.quoteCount,
    },
    {
      kind: 'pipeline_summary',
      title: 'Sales pipeline foundation',
      body: context.pipeline.summary,
      metricLabel: 'open_opportunities',
      metricValue: context.pipeline.openOpportunityCount,
      metricValueCents: context.pipeline.openPipelineValueCents,
      currency: context.currency,
      sourceLeadCount: context.leadCount,
      sourceOpportunityCount: context.opportunityCount,
      sourceQuoteCount: context.quoteCount,
    },
    {
      kind: 'conversion_tracking',
      title: 'Conversion tracking',
      body: `${context.conversionCount} lead conversion record(s); ${context.pipeline.wonOpportunityCount} won opportunit(ies). Tracking uses stored rows only.`,
      metricLabel: 'conversions',
      metricValue: context.conversionCount,
      metricValueCents: null,
      currency: context.currency,
      sourceLeadCount: context.leadCount,
      sourceOpportunityCount: context.opportunityCount,
      sourceQuoteCount: context.quoteCount,
    },
    {
      kind: 'revenue_opportunity',
      title: 'Revenue opportunity signals',
      body: [
        `${context.leadHunting.unconvertedQuoteCount} unconverted quote(s)`,
        `${context.openOpportunityCount} open opportunit(ies)`,
        `open pipeline value ${
          context.pipeline.openPipelineValueCents == null
            ? 'unavailable'
            : formatSalesIntelligenceCents(
                context.pipeline.openPipelineValueCents,
                context.currency,
              )
        }`,
      ].join(' · '),
      metricLabel: 'open_pipeline_value',
      metricValue: null,
      metricValueCents: context.pipeline.openPipelineValueCents,
      currency: context.currency,
      sourceLeadCount: context.leadCount,
      sourceOpportunityCount: context.opportunityCount,
      sourceQuoteCount: context.quoteCount,
    },
    {
      kind: 'best_next_action',
      title: 'Best next action (insight)',
      body:
        context.qualificationSamples[0] != null
          ? `Draft focus: "${context.qualificationSamples[0].title}" — Owner approval required before outreach.`
          : 'No best-next-action sample available without real open leads.',
      metricLabel: null,
      metricValue: null,
      metricValueCents: null,
      currency: context.currency,
      sourceLeadCount: context.leadCount,
      sourceOpportunityCount: context.opportunityCount,
      sourceQuoteCount: context.quoteCount,
    },
  ];
}

export function buildSalesIntelligenceSignalDraftsFromSignals(
  signals: SalesIntelligenceSignalInput,
): Array<{
  kind: SalesIntelligenceSignalKind;
  title: string;
  detail: string;
  priority: string;
  sourceLeadId: string | null;
  sourceOpportunityId: string | null;
  sourceQuoteId: string | null;
  sourceCustomerId: string | null;
  sourceLeadSourceId: string | null;
  estimatedValueCents: number | null;
  currency: string | null;
}> {
  const out: Array<{
    kind: SalesIntelligenceSignalKind;
    title: string;
    detail: string;
    priority: string;
    sourceLeadId: string | null;
    sourceOpportunityId: string | null;
    sourceQuoteId: string | null;
    sourceCustomerId: string | null;
    sourceLeadSourceId: string | null;
    estimatedValueCents: number | null;
    currency: string | null;
  }> = [];

  for (const source of signals.leadSources.slice(0, 5)) {
    out.push({
      kind: 'lead_source',
      title: `Lead source: ${source.name}`,
      detail: source.enabled
        ? 'Enabled lead source from stored lead_sources — hunting foundation only.'
        : 'Disabled lead source retained for honest inventory (not invented).',
      priority: 'low',
      sourceLeadId: null,
      sourceOpportunityId: null,
      sourceQuoteId: null,
      sourceCustomerId: null,
      sourceLeadSourceId: source.sourceId,
      estimatedValueCents: null,
      currency: signals.currency,
    });
  }

  for (const quote of signals.unconvertedQuotes.slice(0, 5)) {
    out.push({
      kind: 'unconverted_quote',
      title: `Unconverted quote: ${quote.title}`,
      detail: `Quote status ${quote.status}. Market opportunity signal from real quote — not a fabricated lead.`,
      priority: quote.amountCents >= 500000 ? 'high' : 'medium',
      sourceLeadId: null,
      sourceOpportunityId: null,
      sourceQuoteId: quote.quoteId,
      sourceCustomerId: quote.customerId,
      sourceLeadSourceId: null,
      estimatedValueCents: quote.amountCents,
      currency: signals.currency,
    });
  }

  for (const opp of signals.openOpportunities.slice(0, 5)) {
    out.push({
      kind: 'open_opportunity',
      title: `Open opportunity: ${opp.title}`,
      detail: `Opportunity status ${opp.status}. Pipeline signal from sales_opportunities.`,
      priority: 'medium',
      sourceLeadId: null,
      sourceOpportunityId: opp.opportunityId,
      sourceQuoteId: null,
      sourceCustomerId: opp.customerId,
      sourceLeadSourceId: null,
      estimatedValueCents: opp.estimatedValueCents,
      currency: signals.currency,
    });
  }

  for (const lead of signals.openLeads.filter((l) => l.score >= 70).slice(0, 5)) {
    out.push({
      kind: 'high_score_lead',
      title: `High-score lead: ${lead.title}`,
      detail: `Stored score ${lead.score}; status ${lead.status}. Qualification signal only.`,
      priority: 'high',
      sourceLeadId: lead.leadId,
      sourceOpportunityId: null,
      sourceQuoteId: null,
      sourceCustomerId: lead.customerId,
      sourceLeadSourceId: null,
      estimatedValueCents: null,
      currency: signals.currency,
    });
  }

  const stale = signals.openLeads.filter((l) => l.nextActionDueAt);
  for (const lead of stale.slice(0, 3)) {
    out.push({
      kind: 'stale_follow_up',
      title: `Follow-up due: ${lead.title}`,
      detail: `Next action due ${lead.nextActionDueAt}. Draft follow-up only — not auto-contacted.`,
      priority: 'high',
      sourceLeadId: lead.leadId,
      sourceOpportunityId: null,
      sourceQuoteId: null,
      sourceCustomerId: lead.customerId,
      sourceLeadSourceId: null,
      estimatedValueCents: null,
      currency: signals.currency,
    });
  }

  if (signals.communicationCount > 0) {
    out.push({
      kind: 'comms_signal',
      title: 'Communication activity present',
      detail: `${signals.communicationCount} communication record(s) available for sales context. Personal WhatsApp private data is never sourced.`,
      priority: 'low',
      sourceLeadId: null,
      sourceOpportunityId: null,
      sourceQuoteId: null,
      sourceCustomerId: null,
      sourceLeadSourceId: null,
      estimatedValueCents: null,
      currency: signals.currency,
    });
  }

  if (signals.unconvertedQuotes.length > 0 || signals.openOpportunities.length > 0) {
    out.push({
      kind: 'market_opportunity',
      title: 'Market / revenue opportunity cluster',
      detail: [
        `${signals.unconvertedQuotes.length} unconverted quote(s)`,
        `${signals.openOpportunities.length} open opportunit(ies)`,
        'Identified from real CRM/sales/quote data — not scraped market lists.',
      ].join(' · '),
      priority: 'medium',
      sourceLeadId: null,
      sourceOpportunityId: signals.openOpportunities[0]?.opportunityId ?? null,
      sourceQuoteId: signals.unconvertedQuotes[0]?.quoteId ?? null,
      sourceCustomerId:
        signals.openOpportunities[0]?.customerId ??
        signals.unconvertedQuotes[0]?.customerId ??
        null,
      sourceLeadSourceId: null,
      estimatedValueCents: null,
      currency: signals.currency,
    });
  }

  if (signals.conversionCount > 0) {
    out.push({
      kind: 'conversion',
      title: 'Conversion tracking foundation',
      detail: `${signals.conversionCount} lead conversion record(s) stored. Tracking only — no automatic conversion.`,
      priority: 'low',
      sourceLeadId: null,
      sourceOpportunityId: null,
      sourceQuoteId: null,
      sourceCustomerId: null,
      sourceLeadSourceId: null,
      estimatedValueCents: null,
      currency: signals.currency,
    });
  }

  return out;
}

export function listSalesIntelligenceAuraConnections(): SalesIntelligenceAuraConnection[] {
  return [
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'available_link',
      note: 'Sales agent key is registered in the Command Centre agent registry.',
    },
    {
      target: 'agent_network',
      label: 'AURA Agent Network',
      href: '/aura-agent-network',
      status: 'available_link',
      note: 'Sales participates in the Agent Network catalog (sales key) — outreach stays approval-gated.',
    },
    {
      target: 'sales_intelligence',
      label: 'Sales Intelligence',
      href: '/sales-intelligence',
      status: 'available_link',
      note: 'Existing Sales Intelligence / enterprise SI surface remains the broader ops dashboard.',
    },
    {
      target: 'leads',
      label: 'Leads',
      href: '/leads',
      status: 'available_link',
      note: 'System of record for lead lifecycle and sources.',
    },
    {
      target: 'sales_pipeline',
      label: 'Sales pipeline',
      href: '/sales',
      status: 'available_link',
      note: 'Operational opportunities and pipeline stages.',
    },
    {
      target: 'quotes',
      label: 'Quotes',
      href: '/finance/quotes',
      status: 'available_link',
      note: 'Quote records used for unconverted / revenue opportunity signals.',
    },
    {
      target: 'crm',
      label: 'CRM',
      href: '/crm',
      status: 'available_link',
      note: 'Customer records remain in CRM — this agent does not invent customers.',
    },
  ];
}
