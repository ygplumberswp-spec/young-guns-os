/**
 * Call Intelligence Engine (Department 9.2)
 *
 * Extends Voice AI Receptionist Foundation (9.1) + core `/voice` sessions —
 * does not rebuild telephony, CRM, or invent call traffic.
 *
 * Capabilities (real records only; honest unavailable otherwise):
 * - Call summaries / key points / requests / actions / follow-up recommendations
 * - Customer history lookup during calls (profile, jobs, quotes, invoices, maintenance)
 * - Lead extraction drafts (Owner approval required; never auto-communicate)
 * - Sentiment (satisfaction / frustration / urgency / priority) — signal-based only
 * - Aggregated call insights (questions, sales opportunities, trends, issues)
 *
 * Invariants:
 * - No fake calls or leads
 * - No automatic customer communication
 * - Lead drafts require Owner approval
 * - Never expose finance margins / quote internal notes inappropriately
 * - Protect customer privacy; RBAC; tenant isolation; audit logging
 */

export const CALL_INTELLIGENCE_KEY = 'call-intelligence' as const;

export type CiAvailability = 'available' | 'partial' | 'unavailable';

export type CiSentimentLabel =
  | 'satisfied'
  | 'neutral'
  | 'frustrated'
  | 'urgent'
  | 'mixed'
  | 'unavailable';

export type CiPriority = 'low' | 'normal' | 'high' | 'urgent' | 'unavailable';

export type CiLeadKind =
  | 'new_enquiry'
  | 'service_request'
  | 'potential_job'
  | 'urgent_opportunity'
  | 'other';

export type CiLeadDraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type CiInsightKind =
  | 'common_question'
  | 'sales_opportunity'
  | 'service_trend'
  | 'customer_issue';

export type CiCallSummaryView = {
  callSessionId: string | null;
  voiceSessionId: string | null;
  availability: CiAvailability;
  summary: string | null;
  keyPoints: string[];
  customerRequests: string[];
  requiredActions: string[];
  followUpRecommendations: string[];
  transcriptTurnCount: number;
  rationale: string;
  /** Never invented. */
  invented: false;
};

export type CiSentimentView = {
  availability: CiAvailability;
  sentiment: CiSentimentLabel;
  satisfaction: CiSentimentLabel | 'unavailable';
  frustration: boolean | null;
  urgency: CiPriority;
  priority: CiPriority;
  confidence: number | null;
  rationale: string;
  recommendations: string[];
};

export type CiSafeCustomerProfile = {
  customerId: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  /** Internal CRM notes are Owner/Admin only; otherwise null. */
  notes: string | null;
  notesVisibility: 'owner_admin' | 'hidden';
};

export type CiSafeJobSummary = {
  id: string;
  jobNumber: string | null;
  title: string;
  status: string;
  priority: string;
  scheduledAt: string | null;
  customerVisibleNotes: string | null;
};

export type CiSafeQuoteSummary = {
  id: string;
  quoteNumber: string;
  title: string;
  status: string;
  totalCents: number;
  currency: string;
  /** Margins / internal notes intentionally omitted. */
  financeMarginsExposed: false;
  internalNotesExposed: false;
};

export type CiSafeInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  title: string;
  status: string;
  totalCents: number;
  amountPaidCents: number;
  currency: string;
  dueDate: string | null;
};

export type CiMaintenanceSummary = {
  id: string;
  planName: string;
  status: string;
  nextDueAt: string | null;
};

export type CiEquipmentSummary = {
  availability: CiAvailability;
  items: Array<{ id: string; name: string; status: string; locationText: string | null }>;
  rationale: string;
};

export type CiCustomerHistoryLookup = {
  availability: CiAvailability;
  customer: CiSafeCustomerProfile | null;
  previousJobs: CiSafeJobSummary[];
  quotes: CiSafeQuoteSummary[];
  invoices: CiSafeInvoiceSummary[];
  maintenance: CiMaintenanceSummary[];
  equipment: CiEquipmentSummary;
  rationale: string;
  /** Dedicated Customer 360 may be separate — this is call-safe CRM facets only. */
  customer360Module: false;
};

export type CiLeadDraftSummary = {
  id: string;
  kind: CiLeadKind;
  status: CiLeadDraftStatus;
  title: string;
  body: string;
  callSessionId: string | null;
  voiceSessionId: string | null;
  customerId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  /** Invariant: always false — never auto customer communication / lead write. */
  autoExecuted: false;
  autoSend: false;
  createdAt: string;
  decidedAt: string | null;
};

export type CiInsightItem = {
  kind: CiInsightKind;
  label: string;
  count: number;
  examples: string[];
  recommendation: string;
};

export type CiInsightsView = {
  availability: CiAvailability;
  callSessionCount: number;
  commonQuestions: CiInsightItem[];
  salesOpportunities: CiInsightItem[];
  serviceTrends: CiInsightItem[];
  customerIssues: CiInsightItem[];
  rationale: string;
};

export type CiConnection = {
  target: 'voice_ai_receptionist' | 'voice' | 'enterprise_voice_reception' | 'leads' | 'crm' | 'jobs';
  label: string;
  href: string;
  status: 'available_link' | 'partial' | 'unavailable';
  note: string;
};

export type CiOwnerDashboard = {
  summary: string;
  productClarification: {
    voiceAiReceptionist: string;
    voiceFoundation: string;
    thisLayer: string;
  };
  policy: {
    fakeCalls: false;
    fakeLeads: false;
    automaticCustomerCommunication: false;
    leadDraftsRequireOwnerApproval: true;
    financeMarginsExposed: false;
    ownerControlled: true;
  };
  callStats: {
    vairSessionCount: number;
    voiceSessionCount: number;
    analyzedCount: number;
    pendingLeadApprovals: number;
    availability: CiAvailability;
    rationale: string;
  };
  recentSummaries: CiCallSummaryView[];
  sentimentOverview: CiSentimentView;
  insights: CiInsightsView;
  leadDraftQueue: CiLeadDraftSummary[];
  connections: CiConnection[];
};

export type AnalyzeCiCallRequest = {
  callSessionId?: string;
  voiceSessionId?: string;
};

export type LookupCiCustomerHistoryRequest = {
  customerId?: string;
  callSessionId?: string;
  voiceSessionId?: string;
};

export type ExtractCiLeadDraftRequest = {
  callSessionId?: string;
  voiceSessionId?: string;
  kind?: CiLeadKind;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  serviceType?: string;
  notes?: string;
  submitForApproval?: boolean;
};

export type DecideCiLeadDraftRequest = {
  decision: 'approve' | 'reject' | 'cancel';
  notes?: string;
};

export const CI_PRODUCT_COPY = {
  voiceAiReceptionist:
    'Voice AI Receptionist Foundation (Dept 9.1) owns inbound call sessions, routing, takeover, and approval-gated lead/booking drafts — Call Intelligence extends those real sessions.',
  voiceFoundation:
    'Core `/voice` sessions and conversation turns supply transcripts/notes when present. No fake calls.',
  thisLayer:
    'Call Intelligence Engine derives summaries, customer history lookup, lead extraction drafts, sentiment, and aggregated insights from real call records only. Lead drafts require Owner approval. No automatic customer communication.',
} as const;

function isOwnerOrAdminRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

/** Call Intelligence — Owner/Admin or voice/comms elevated permissions. Technician/Client denied. */
export function canAccessCallIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerOrAdminRole(role)) return true;
  return (
    permissions.includes('voice:read') ||
    permissions.includes('voice:write') ||
    permissions.includes('voice_reception:read') ||
    permissions.includes('voice_reception:write') ||
    permissions.includes('voice_reception:manage') ||
    permissions.includes('communications:read') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage') ||
    permissions.includes('agents:read')
  );
}

export function canWriteCallIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerOrAdminRole(role)) return true;
  return (
    permissions.includes('voice:write') ||
    permissions.includes('voice_reception:write') ||
    permissions.includes('voice_reception:manage') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage')
  );
}

/** Lead draft approval is Owner/Admin only. */
export function canApproveCiLeadDrafts(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerOrAdminRole(role);
}

/** Whether CRM internal notes may be shown in call history lookup. */
export function canViewCiInternalCustomerNotes(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canApproveCiLeadDrafts(identity);
}

const REQUEST_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(quote|quotation|estimate|pricing)\b/i, label: 'Requested a quote/estimate' },
  { re: /\b(book|appointment|schedule|visit)\b/i, label: 'Requested booking/appointment' },
  { re: /\b(urgent|emergency|asap|today)\b/i, label: 'Flagged urgency / same-day need' },
  { re: /\b(leak|geyser|drain|blocked|burst|toilet|pipe)\b/i, label: 'Plumbing service issue mentioned' },
  { re: /\b(callback|call back|follow[- ]?up)\b/i, label: 'Requested callback/follow-up' },
  { re: /\b(invoice|payment|account)\b/i, label: 'Asked about invoice/payment' },
];

const ACTION_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(send|email|whatsapp).{0,40}\b(quote|invoice|details)\b/i, label: 'Prepare outbound document/details (approval required)' },
  { re: /\b(create|log|open).{0,20}\b(job|lead|ticket)\b/i, label: 'Create job/lead draft for Owner review' },
  { re: /\b(dispatch|technician|plumber)\b/i, label: 'Coordinate technician dispatch (ops approval)' },
  { re: /\b(reschedule|move|change).{0,20}\b(appointment|booking|visit)\b/i, label: 'Reschedule booking draft' },
];

const FOLLOW_UP_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(follow[- ]?up|call back|callback)\b/i, label: 'Schedule operator follow-up call' },
  { re: /\b(quote|estimate)\b/i, label: 'Prepare quote draft for Owner approval before send' },
  { re: /\b(maintenance|service plan|homeshield)\b/i, label: 'Review maintenance / membership options with customer' },
];

export function extractKeyPointsFromTranscript(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 12);
  const points: string[] = [];
  for (const line of lines) {
    if (points.length >= 8) break;
    if (/^(hi|hello|thanks|thank you|ok|okay|bye)\b/i.test(line)) continue;
    points.push(line.slice(0, 240));
  }
  return points;
}

export function extractLabeledMatches(
  text: string,
  patterns: Array<{ re: RegExp; label: string }>,
): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    if (p.re.test(text) && !out.includes(p.label)) out.push(p.label);
  }
  return out;
}

export function buildCiCallSummaryFromText(input: {
  callSessionId?: string | null;
  voiceSessionId?: string | null;
  storedSummary?: string | null;
  transcriptText?: string | null;
  transcriptTurnCount?: number;
}): CiCallSummaryView {
  const text = [input.storedSummary, input.transcriptText].filter(Boolean).join('\n').trim();
  const turnCount = input.transcriptTurnCount ?? 0;
  if (!text && turnCount <= 0) {
    return {
      callSessionId: input.callSessionId ?? null,
      voiceSessionId: input.voiceSessionId ?? null,
      availability: 'unavailable',
      summary: null,
      keyPoints: [],
      customerRequests: [],
      requiredActions: [],
      followUpRecommendations: [],
      transcriptTurnCount: 0,
      rationale:
        'No real call transcript or session notes available — summary unavailable (not invented).',
      invented: false,
    };
  }

  const keyPoints = extractKeyPointsFromTranscript(text);
  const customerRequests = extractLabeledMatches(text, REQUEST_PATTERNS);
  const requiredActions = extractLabeledMatches(text, ACTION_PATTERNS);
  const followUpRecommendations = extractLabeledMatches(text, FOLLOW_UP_PATTERNS);
  if (followUpRecommendations.length === 0 && customerRequests.length > 0) {
    followUpRecommendations.push('Review customer requests and queue an Owner-approved next step');
  }

  const summary =
    input.storedSummary?.trim() ||
    (keyPoints[0] ? `Call notes: ${keyPoints[0]}` : 'Call session has transcript/notes; see key points.');

  return {
    callSessionId: input.callSessionId ?? null,
    voiceSessionId: input.voiceSessionId ?? null,
    availability: turnCount > 0 || Boolean(input.storedSummary?.trim()) ? 'available' : 'partial',
    summary,
    keyPoints,
    customerRequests,
    requiredActions,
    followUpRecommendations,
    transcriptTurnCount: turnCount,
    rationale:
      turnCount > 0
        ? `Derived from ${turnCount} real transcript turn(s) and/or stored session notes. No invented content.`
        : 'Derived from stored session notes only (no transcript turns). No invented content.',
    invented: false,
  };
}

export function detectCiSentimentFromText(input: {
  text?: string | null;
}): CiSentimentView {
  const text = (input.text ?? '').toLowerCase().trim();
  if (!text) {
    return {
      availability: 'unavailable',
      sentiment: 'unavailable',
      satisfaction: 'unavailable',
      frustration: null,
      urgency: 'unavailable',
      priority: 'unavailable',
      confidence: null,
      rationale: 'No transcript/notes signal — sentiment unavailable (not invented).',
      recommendations: [],
    };
  }

  const satisfied = ['thank', 'thanks', 'great', 'excellent', 'happy', 'pleased', 'appreciate'];
  const frustrated = [
    'angry',
    'frustrated',
    'unacceptable',
    'terrible',
    'awful',
    'complaint',
    'disappointed',
    'furious',
  ];
  const urgent = ['urgent', 'emergency', 'asap', 'immediately', 'today', 'burst', 'flooding'];

  const satHits = satisfied.filter((k) => text.includes(k));
  const frHits = frustrated.filter((k) => text.includes(k));
  const urgHits = urgent.filter((k) => text.includes(k));

  if (satHits.length === 0 && frHits.length === 0 && urgHits.length === 0) {
    return {
      availability: 'unavailable',
      sentiment: 'unavailable',
      satisfaction: 'unavailable',
      frustration: null,
      urgency: 'unavailable',
      priority: 'unavailable',
      confidence: null,
      rationale: 'No clear sentiment/urgency keywords — unavailable (not invented).',
      recommendations: [],
    };
  }

  let sentiment: CiSentimentLabel = 'neutral';
  if (satHits.length > 0 && frHits.length > 0) sentiment = 'mixed';
  else if (frHits.length > 0) sentiment = 'frustrated';
  else if (urgHits.length > 0 && satHits.length === 0) sentiment = 'urgent';
  else if (satHits.length > 0) sentiment = 'satisfied';

  const urgency: CiPriority =
    urgHits.length >= 2 ? 'urgent' : urgHits.length === 1 ? 'high' : 'normal';
  const priority: CiPriority =
    frHits.length > 0 && urgHits.length > 0
      ? 'urgent'
      : frHits.length > 0 || urgHits.length > 0
        ? 'high'
        : 'normal';

  const recommendations: string[] = [];
  if (frHits.length > 0) {
    recommendations.push('Owner/ops: prioritise human follow-up — frustration signals present (recommendation only).');
  }
  if (urgHits.length > 0) {
    recommendations.push('Review urgency flags with dispatch — do not auto-dispatch from Call Intelligence.');
  }
  if (satHits.length > 0 && frHits.length === 0) {
    recommendations.push('Positive tone detected — optional review-request draft may be considered via CEI (approval-gated).');
  }

  return {
    availability: 'available',
    sentiment,
    satisfaction: satHits.length > 0 ? 'satisfied' : frHits.length > 0 ? 'frustrated' : 'neutral',
    frustration: frHits.length > 0 ? true : satHits.length > 0 ? false : null,
    urgency,
    priority,
    confidence: Math.min(92, 50 + (satHits.length + frHits.length + urgHits.length) * 8),
    rationale: 'Lexical sentiment/urgency derived from real transcript/notes only.',
    recommendations,
  };
}

export function buildCiLeadDraft(input: {
  kind: CiLeadKind;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  serviceType?: string | null;
  notes?: string | null;
  summaryExcerpt?: string | null;
}): { title: string; body: string } {
  const name = input.contactName?.trim() || 'Unknown caller';
  const title = `Lead draft (${input.kind}) — ${name}`.slice(0, 200);
  const body = [
    `Kind: ${input.kind}`,
    `Contact: ${name}`,
    input.contactPhone ? `Phone: ${input.contactPhone}` : 'Phone: (not provided)',
    input.contactEmail ? `Email: ${input.contactEmail}` : 'Email: (not provided)',
    input.serviceType ? `Service: ${input.serviceType}` : 'Service: (not specified)',
    '',
    input.summaryExcerpt?.trim() || input.notes?.trim() || 'Notes: (none from real call text)',
    '',
    'Lead draft only — not written to CRM automatically.',
    'Owner approval required. No automatic customer communication.',
  ].join('\n');
  return { title, body };
}

export function inferCiLeadKindFromText(text: string | null | undefined): CiLeadKind {
  const t = (text ?? '').toLowerCase();
  if (!t.trim()) return 'other';
  if (/\b(urgent|emergency|asap|burst|flooding)\b/.test(t)) return 'urgent_opportunity';
  if (/\b(job|install|repair|fix|service request)\b/.test(t)) return 'service_request';
  if (/\b(quote|new customer|enquiry|inquiry|interested)\b/.test(t)) return 'new_enquiry';
  if (/\b(potential|considering|thinking about)\b/.test(t)) return 'potential_job';
  return 'other';
}

export function aggregateCiInsights(input: {
  texts: string[];
}): CiInsightsView {
  if (input.texts.length === 0) {
    return {
      availability: 'unavailable',
      callSessionCount: 0,
      commonQuestions: [],
      salesOpportunities: [],
      serviceTrends: [],
      customerIssues: [],
      rationale:
        'No real aggregated call text available — insights unavailable (not invented).',
    };
  }

  const joined = input.texts.join('\n');
  const countMatches = (re: RegExp) =>
    input.texts.reduce((n, t) => n + (re.test(t) ? 1 : 0), 0);

  const mk = (
    kind: CiInsightKind,
    label: string,
    re: RegExp,
    recommendation: string,
  ): CiInsightItem | null => {
    const count = countMatches(re);
    if (count <= 0) return null;
    const examples = input.texts
      .filter((t) => re.test(t))
      .slice(0, 3)
      .map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 160));
    return { kind, label, count, examples, recommendation };
  };

  const commonQuestions = [
    mk(
      'common_question',
      'Pricing / quote questions',
      /\b(quote|price|pricing|how much|cost)\b/i,
      'Prepare Owner-approved quote follow-up templates — never auto-send.',
    ),
    mk(
      'common_question',
      'Booking / availability questions',
      /\b(available|appointment|book|when can)\b/i,
      'Align scheduling capacity before promising times.',
    ),
  ].filter((x): x is CiInsightItem => Boolean(x));

  const salesOpportunities = [
    mk(
      'sales_opportunity',
      'New enquiry / quote interest',
      /\b(new|enquiry|inquiry|quote|interested)\b/i,
      'Queue lead drafts for Owner approval — do not auto-create CRM leads.',
    ),
    mk(
      'sales_opportunity',
      'Maintenance / plan interest',
      /\b(maintenance|service plan|homeshield|contract)\b/i,
      'Route to HomeShield / maintenance drafts with Owner approval.',
    ),
  ].filter((x): x is CiInsightItem => Boolean(x));

  const serviceTrends = [
    mk(
      'service_trend',
      'Plumbing leak / geyser mentions',
      /\b(leak|geyser|burst|drain|blocked)\b/i,
      'Track recurring plumbing themes from real calls only.',
    ),
    mk(
      'service_trend',
      'After-hours / callback volume',
      /\b(after hours|callback|call back|missed)\b/i,
      'Review staffing/routing — recommendations only.',
    ),
  ].filter((x): x is CiInsightItem => Boolean(x));

  const customerIssues = [
    mk(
      'customer_issue',
      'Frustration / complaint language',
      /\b(angry|frustrated|complaint|unacceptable|disappointed)\b/i,
      'Prioritise human follow-up; no automatic customer messages.',
    ),
    mk(
      'customer_issue',
      'Billing / invoice concerns',
      /\b(invoice|overcharged|payment|account issue)\b/i,
      'Finance follow-up requires Owner/ops — never expose margins on calls.',
    ),
  ].filter((x): x is CiInsightItem => Boolean(x));

  const totalSignals =
    commonQuestions.length +
    salesOpportunities.length +
    serviceTrends.length +
    customerIssues.length;

  return {
    availability: totalSignals > 0 ? 'available' : 'unavailable',
    callSessionCount: input.texts.length,
    commonQuestions,
    salesOpportunities,
    serviceTrends,
    customerIssues,
    rationale:
      totalSignals > 0
        ? `Aggregated from ${input.texts.length} real call text record(s). No invented insights.`
        : `Reviewed ${input.texts.length} real call text record(s) but no insight patterns matched — unavailable (not invented). Joined length ${joined.length}.`,
  };
}

export function listCiConnections(): CiConnection[] {
  return [
    {
      target: 'voice_ai_receptionist',
      label: 'Voice AI Receptionist',
      href: '/voice-ai-receptionist',
      status: 'available_link',
      note: 'Dept 9.1 call sessions, routing, and takeover — primary source for Call Intelligence.',
    },
    {
      target: 'voice',
      label: 'Voice sessions',
      href: '/voice',
      status: 'available_link',
      note: 'Core transcripts/outcomes when present.',
    },
    {
      target: 'enterprise_voice_reception',
      label: 'Enterprise Voice Reception',
      href: '/voice-reception',
      status: 'available_link',
      note: 'Platform telephony/routing policy surface.',
    },
    {
      target: 'leads',
      label: 'Leads',
      href: '/leads',
      status: 'partial',
      note: 'Lead drafts from calls require Owner approval before CRM write.',
    },
    {
      target: 'crm',
      label: 'CRM customers',
      href: '/crm',
      status: 'available_link',
      note: 'Customer history lookup uses real CRM rows with privacy filters.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Previous jobs for identified callers — no auto job create.',
    },
  ];
}

export function buildCiCallStats(input: {
  vairSessionCount: number;
  voiceSessionCount: number;
  analyzedCount: number;
  pendingLeadApprovals: number;
}): CiOwnerDashboard['callStats'] {
  const total = input.vairSessionCount + input.voiceSessionCount;
  if (total <= 0) {
    return {
      vairSessionCount: 0,
      voiceSessionCount: 0,
      analyzedCount: 0,
      pendingLeadApprovals: input.pendingLeadApprovals,
      availability: 'unavailable',
      rationale:
        'No real Voice AI / voice session rows yet — call intelligence stats unavailable (not invented).',
    };
  }
  return {
    vairSessionCount: input.vairSessionCount,
    voiceSessionCount: input.voiceSessionCount,
    analyzedCount: input.analyzedCount,
    pendingLeadApprovals: input.pendingLeadApprovals,
    availability: 'available',
    rationale: `Derived from ${input.vairSessionCount} VAIR session(s) and ${input.voiceSessionCount} core voice session(s). No fake calls.`,
  };
}
