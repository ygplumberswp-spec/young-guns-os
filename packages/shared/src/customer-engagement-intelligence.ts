/**
 * Customer Engagement Intelligence (Department 7.2)
 *
 * Extends Customer Experience / Communications / Maintenance foundations with:
 * - Customer notification drafts (draft → approve; never auto-send)
 * - ETA update drafts/suggestions from real job/dispatch when available
 * - Satisfaction tracking from real CX review feedback (honest unavailable)
 * - Review request drafts (approval-gated)
 * - Follow-up suggestions (AURA recommendations; drafts only)
 * - Customer relationship scoring from real jobs/reviews/comms/maintenance
 * - Maintenance reminder draft links from Recurring Maintenance when present
 * - Communication scoring linked to Communication AURA Intelligence when present
 *
 * Invariants:
 * - Drafts only — Owner/ops approval required before any external customer communication
 * - AURA recommendations never auto-send / auto-execute
 * - No fake customers, reviews, scores, or ETA values
 * - Does not rebuild Customer 360 / customer portal
 */

export type CeiDraftKind =
  | 'notification'
  | 'eta_update'
  | 'review_request'
  | 'satisfaction_follow_up'
  | 'follow_up'
  | 'maintenance_reminder';

export type CeiDraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type CeiChannel = 'email' | 'sms' | 'portal' | 'whatsapp_business' | 'other';

export type CeiSentiment = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unavailable';

export type CeiAvailability = 'available' | 'unavailable';

export type CeiFollowUpReason =
  | 'completed_job_no_review'
  | 'negative_satisfaction'
  | 'stale_communication'
  | 'upcoming_maintenance'
  | 'open_job_no_eta_update';

export type CeiOutreachDraftSummary = {
  id: string;
  kind: CeiDraftKind;
  status: CeiDraftStatus;
  channel: CeiChannel;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  maintenancePlanId: string | null;
  subject: string;
  body: string;
  /** Always false — never auto-send external customer communications. */
  autoSend: false;
  etaSuggestionAt: string | null;
  etaAvailability: CeiAvailability;
  linkedCommAuraScoreId: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type CeiSatisfactionSummary = {
  availability: CeiAvailability;
  reviewCount: number;
  averageRating: number | null;
  sentiment: CeiSentiment;
  byReviewType: Record<string, number>;
  recent: Array<{
    id: string;
    customerId: string;
    customerName: string | null;
    jobId: string | null;
    reviewType: string;
    rating: number | null;
    subject: string;
    createdAt: string;
  }>;
  note: string;
};

export type CeiEtaSuggestion = {
  jobId: string;
  customerId: string | null;
  customerName: string | null;
  jobTitle: string | null;
  status: string;
  etaAt: string | null;
  availability: CeiAvailability;
  rationale: string;
};

export type CeiCommunicationScoreSummary = {
  customerId: string;
  customerName: string | null;
  availability: CeiAvailability;
  averageScore: number | null;
  messageCount: number;
  dominantSentiment: CeiSentiment;
  lastCommunicationAt: string | null;
  source: 'communication_aura_intelligence' | 'unavailable';
  summary: string;
};

export type CeiFollowUpSuggestion = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  maintenancePlanId: string | null;
  reason: CeiFollowUpReason;
  priority: 'high' | 'normal' | 'low';
  recommendation: string;
  autoExecuted: false;
};

export type CeiRelationshipScoreSummary = {
  customerId: string;
  customerName: string | null;
  availability: CeiAvailability;
  relationshipScore: number | null;
  band: 'strong' | 'stable' | 'at_risk' | 'unavailable';
  components: {
    jobHistoryPoints: number;
    satisfactionPoints: number;
    communicationPoints: number;
    maintenancePoints: number;
  };
  jobCount: number;
  reviewCount: number;
  openMaintenancePlans: number;
  lastJobAt: string | null;
  lastCommunicationAt: string | null;
  summary: string;
  /** Honest: Customer 360 module not built; CRM/CX/jobs/maintenance composite only. */
  customer360: false;
};

export type CeiMaintenanceLinkSuggestion = {
  planId: string;
  planName: string;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  status: string;
  nextDueAt: string | null;
  recommendation: string;
  draftKind: 'maintenance_reminder' | 'follow_up';
};

export type CeiRetentionReason =
  | 'unhappy_satisfaction'
  | 'negative_communication'
  | 'homeshield_renewal'
  | 'homeshield_inactive'
  | 'stale_engagement';

export type CeiRetentionOpportunity = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  reason: CeiRetentionReason;
  priority: 'high' | 'normal' | 'low';
  recommendation: string;
  homeShieldSubscriptionId: string | null;
  homeShieldRenewalOpportunityId: string | null;
  autoExecuted: false;
};

export type CeiDashboard = {
  summary: string;
  productClarification: {
    customerExperience: string;
    communicationAura: string;
    contentReputation: string;
    recurringMaintenance: string;
    homeShield: string;
    thisLayer: string;
    customer360: string;
  };
  pendingDraftApprovals: number;
  draftCountsByKind: Record<CeiDraftKind, number>;
  satisfaction: CeiSatisfactionSummary;
  etaSuggestions: CeiEtaSuggestion[];
  etaAvailability: CeiAvailability;
  communicationScores: CeiCommunicationScoreSummary[];
  communicationScoreAvailability: CeiAvailability;
  followUpSuggestions: CeiFollowUpSuggestion[];
  relationshipScores: CeiRelationshipScoreSummary[];
  relationshipScoreAvailability: CeiAvailability;
  maintenanceLinks: CeiMaintenanceLinkSuggestion[];
  maintenanceAvailability: CeiAvailability;
  retentionOpportunities: CeiRetentionOpportunity[];
  retentionAvailability: CeiAvailability;
  draftQueue: CeiOutreachDraftSummary[];
  connections: {
    communicationAuraIntelligence: boolean;
    communicationTimeline: boolean;
    contentReputationIntelligence: boolean;
    enterpriseCustomerExperience: boolean;
    recurringMaintenance: boolean;
    homeShieldExperience: boolean;
    customer360: false;
  };
  sendPolicy: {
    autoSendEnabled: false;
    requiresOwnerApproval: true;
    draftApproveExecute: true;
  };
};

export type CreateCeiDraftRequest = {
  kind: CeiDraftKind;
  channel?: CeiChannel;
  customerId?: string;
  jobId?: string;
  maintenancePlanId?: string;
  subject?: string;
  body?: string;
  submitForApproval?: boolean;
};

export type GenerateCeiEtaDraftsRequest = {
  limit?: number;
  submitForApproval?: boolean;
};

export type GenerateCeiReviewRequestDraftsRequest = {
  limit?: number;
  channel?: CeiChannel;
  submitForApproval?: boolean;
};

export type GenerateCeiFollowUpDraftsRequest = {
  limit?: number;
  submitForApproval?: boolean;
};

export type GenerateCeiMaintenanceReminderDraftsRequest = {
  limit?: number;
  submitForApproval?: boolean;
};

export type DecideCeiDraftRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export const CEI_PRODUCT_COPY = {
  customerExperience:
    'Enterprise Customer Experience provides portal, bookings, and review feedback foundations — this layer does not rebuild the portal.',
  communicationAura:
    'Communication AURA Intelligence scores business inbox messages; Customer Engagement links those real scores when present and never invents them.',
  contentReputation:
    'Content & Reputation Intelligence tracks public reviews; engagement review requests remain drafts until Owner/ops approval.',
  recurringMaintenance:
    'Recurring Maintenance Engine supplies real maintenance plans/due dates when present; reminder drafts never invent schedules.',
  homeShield:
    'HomeShield memberships/renewals supply real retention signals when present; CEI only suggests follow-up drafts and never auto-bills.',
  thisLayer:
    'Customer Engagement Intelligence queues notification, ETA, review-request, follow-up, and maintenance-reminder drafts only. AURA recommendations never auto-send.',
  customer360:
    'Customer 360 is not a dedicated module yet — relationship scoring uses real CRM customers, jobs, maintenance plans, CX reviews, and Communication AURA scores when present.',
} as const;

export function emptyCeiDraftKindCounts(): Record<CeiDraftKind, number> {
  return {
    notification: 0,
    eta_update: 0,
    review_request: 0,
    satisfaction_follow_up: 0,
    follow_up: 0,
    maintenance_reminder: 0,
  };
}

export function canAccessCustomerEngagementIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('customer_experience:read') ||
    identity.permissions.includes('customer_experience:write') ||
    identity.permissions.includes('customers:read') ||
    identity.permissions.includes('customers:write') ||
    identity.permissions.includes('communications:read') ||
    identity.permissions.includes('communications:write') ||
    identity.permissions.includes('communications:manage') ||
    identity.permissions.includes('portal:read') ||
    identity.permissions.includes('portal:manage')
  );
}

export function canWriteCustomerEngagementIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessCustomerEngagementIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('customer_experience:write') ||
    identity.permissions.includes('customers:write') ||
    identity.permissions.includes('communications:write') ||
    identity.permissions.includes('communications:manage') ||
    identity.permissions.includes('portal:manage')
  );
}

export function canApproveCustomerEngagementOutreach(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canWriteCustomerEngagementIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  const elevated =
    identity.roleName === 'Owner' ||
    identity.roleName === 'Admin' ||
    identity.roleName === 'Manager' ||
    identity.roleName === 'Platform Owner';
  return (
    elevated ||
    identity.permissions.includes('customer_experience:write') ||
    identity.permissions.includes('communications:manage') ||
    identity.permissions.includes('portal:manage')
  );
}

export function detectCeiSentimentFromText(input: {
  subject?: string | null;
  body?: string | null;
}): { sentiment: CeiSentiment; confidence: number | null; rationale: string } {
  const text = [input.subject, input.body].filter(Boolean).join('\n').toLowerCase();
  if (!text.trim()) {
    return {
      sentiment: 'unavailable',
      confidence: null,
      rationale: 'No feedback text — sentiment unavailable (not invented).',
    };
  }
  const positive = ['thank', 'thanks', 'great', 'excellent', 'happy', 'pleased', 'wonderful', 'perfect'];
  const negative = [
    'angry',
    'unhappy',
    'disappointed',
    'terrible',
    'awful',
    'refund',
    'complaint',
    'unacceptable',
    'frustrated',
  ];
  const posHits = positive.filter((k) => text.includes(k));
  const negHits = negative.filter((k) => text.includes(k));
  if (posHits.length === 0 && negHits.length === 0) {
    return {
      sentiment: 'unavailable',
      confidence: null,
      rationale: 'No clear sentiment keywords — sentiment unavailable (not invented).',
    };
  }
  if (posHits.length > 0 && negHits.length > 0) {
    return {
      sentiment: 'mixed',
      confidence: Math.min(90, 50 + (posHits.length + negHits.length) * 8),
      rationale: 'Both positive and negative lexical signals detected.',
    };
  }
  if (negHits.length > 0) {
    return {
      sentiment: 'negative',
      confidence: Math.min(92, 55 + negHits.length * 10),
      rationale: 'Negative lexical signals detected.',
    };
  }
  return {
    sentiment: 'positive',
    confidence: Math.min(92, 55 + posHits.length * 10),
    rationale: 'Positive lexical signals detected.',
  };
}

export function aggregateCeiSatisfaction(input: {
  ratings: Array<number | null | undefined>;
  sentiments: CeiSentiment[];
}): Pick<CeiSatisfactionSummary, 'availability' | 'averageRating' | 'sentiment' | 'note'> {
  const numeric = input.ratings.filter(
    (r): r is number => typeof r === 'number' && Number.isFinite(r) && r >= 1 && r <= 5,
  );
  if (numeric.length === 0 && input.sentiments.every((s) => s === 'unavailable')) {
    return {
      availability: 'unavailable',
      averageRating: null,
      sentiment: 'unavailable',
      note: 'No real satisfaction reviews/ratings available — score not invented.',
    };
  }
  const averageRating =
    numeric.length > 0
      ? Math.round((numeric.reduce((a, b) => a + b, 0) / numeric.length) * 10) / 10
      : null;
  const counts: Record<Exclude<CeiSentiment, 'unavailable'>, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    mixed: 0,
  };
  for (const s of input.sentiments) {
    if (s !== 'unavailable') counts[s] += 1;
  }
  const ranked = (
    Object.entries(counts) as Array<[Exclude<CeiSentiment, 'unavailable'>, number]>
  ).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const sentiment: CeiSentiment =
    !top || top[1] === 0
      ? averageRating === null
        ? 'unavailable'
        : averageRating >= 4
          ? 'positive'
          : averageRating <= 2
            ? 'negative'
            : 'neutral'
      : top[0];
  return {
    availability: 'available',
    averageRating,
    sentiment,
    note:
      averageRating === null
        ? 'Satisfaction signals present without numeric ratings — average rating unavailable.'
        : `Average rating computed from ${numeric.length} real review rating(s).`,
  };
}

export function buildCeiNotificationDraft(input: {
  customerName?: string | null;
  subjectHint?: string | null;
  companyName?: string | null;
}): { subject: string; body: string } {
  const name = input.customerName?.trim() || 'Customer';
  const company = input.companyName?.trim() || 'our team';
  const subject = input.subjectHint?.trim()
    ? `DRAFT: ${input.subjectHint.trim()}`
    : `DRAFT: Update from ${company}`;
  const body = [
    `Hi ${name},`,
    '',
    `This is a draft customer notification prepared by TITAN Customer Engagement Intelligence for ${company}.`,
    '',
    'Please personalise this message before approval.',
    '',
    '—',
    'Nothing was sent. Owner/ops approval is required before any external customer communication.',
  ].join('\n');
  return { subject, body };
}

export function buildCeiEtaUpdateDraft(input: {
  customerName?: string | null;
  jobTitle?: string | null;
  etaAt?: string | null;
  companyName?: string | null;
}): { subject: string; body: string; etaAvailability: CeiAvailability } {
  const name = input.customerName?.trim() || 'Customer';
  const company = input.companyName?.trim() || 'our team';
  const jobLabel = input.jobTitle?.trim() || 'your scheduled service';
  const etaAvailability: CeiAvailability = input.etaAt ? 'available' : 'unavailable';
  const etaLine =
    etaAvailability === 'available'
      ? `Our current scheduled window for ${jobLabel} is ${input.etaAt}.`
      : `A customer-visible ETA for ${jobLabel} is not available from real job/dispatch data yet — no ETA was invented.`;
  return {
    subject: `DRAFT: ETA update — ${jobLabel}`,
    body: [
      `Hi ${name},`,
      '',
      `This is a draft ETA update from ${company}.`,
      etaLine,
      '',
      'We will confirm any changes once approved by our operations team.',
      '',
      '—',
      'Nothing was sent. Owner/ops approval is required before contacting the customer.',
    ].join('\n'),
    etaAvailability,
  };
}

export function buildCeiReviewRequestDraft(input: {
  customerName?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
}): { subject: string; body: string } {
  const name = input.customerName?.trim() || 'Customer';
  const company = input.companyName?.trim() || 'our team';
  const jobLabel = input.jobTitle?.trim() || 'your recent service';
  return {
    subject: `DRAFT: How was ${jobLabel}?`,
    body: [
      `Hi ${name},`,
      '',
      `Thank you for choosing ${company} for ${jobLabel}.`,
      'If you have a moment, we would appreciate your honest feedback.',
      '',
      'This is a draft review request only — it will not be sent until Owner/ops approval.',
      '',
      '—',
      'Nothing was sent. No fake reviews or scores are created by this draft.',
    ].join('\n'),
  };
}

export function buildCeiFollowUpDraft(input: {
  customerName?: string | null;
  reason: CeiFollowUpReason;
  jobTitle?: string | null;
  maintenancePlanName?: string | null;
  companyName?: string | null;
}): { subject: string; body: string } {
  const name = input.customerName?.trim() || 'Customer';
  const company = input.companyName?.trim() || 'our team';
  const reasonLine = {
    completed_job_no_review: `We noticed ${input.jobTitle?.trim() || 'your recent service'} was completed and wanted to follow up.`,
    negative_satisfaction: 'We saw feedback that suggests we should follow up personally.',
    stale_communication: 'It has been a while since our last conversation, and we wanted to check in.',
    upcoming_maintenance: `Your maintenance plan${input.maintenancePlanName ? ` (${input.maintenancePlanName})` : ''} may be due soon.`,
    open_job_no_eta_update: `We wanted to share an update on ${input.jobTitle?.trim() || 'your open job'}.`,
  }[input.reason];
  return {
    subject: `DRAFT: Follow-up from ${company}`,
    body: [
      `Hi ${name},`,
      '',
      reasonLine,
      '',
      'This is an AURA follow-up suggestion draft only.',
      '',
      '—',
      'Nothing was sent. Owner/ops approval is required before contacting the customer.',
    ].join('\n'),
  };
}

export function buildCeiMaintenanceReminderDraft(input: {
  customerName?: string | null;
  planName?: string | null;
  nextDueAt?: string | null;
  companyName?: string | null;
}): { subject: string; body: string } {
  const name = input.customerName?.trim() || 'Customer';
  const company = input.companyName?.trim() || 'our team';
  const plan = input.planName?.trim() || 'your maintenance plan';
  const due = input.nextDueAt
    ? `Next due around ${input.nextDueAt}.`
    : 'A next-due date is not available from real maintenance data yet — no due date was invented.';
  return {
    subject: `DRAFT: Maintenance reminder — ${plan}`,
    body: [
      `Hi ${name},`,
      '',
      `This is a draft maintenance reminder from ${company} for ${plan}.`,
      due,
      '',
      '—',
      'Nothing was sent. Owner/ops approval is required before contacting the customer.',
    ].join('\n'),
  };
}

export function resolveCeiJobEtaSuggestion(input: {
  jobId: string;
  customerId: string | null;
  customerName: string | null;
  jobTitle: string | null;
  status: string;
  assignedUserId: string | null;
  scheduledAt: string | Date | null;
  scheduledEndAt: string | Date | null;
}): CeiEtaSuggestion {
  const scheduledEnd =
    input.scheduledEndAt instanceof Date
      ? input.scheduledEndAt.toISOString()
      : input.scheduledEndAt;
  const scheduledStart =
    input.scheduledAt instanceof Date ? input.scheduledAt.toISOString() : input.scheduledAt;
  const trackingEligible =
    Boolean(input.assignedUserId) &&
    input.status !== 'cancelled' &&
    input.status !== 'completed' &&
    (input.status === 'scheduled' || input.status === 'in_progress' || input.status === 'new');
  const etaAt = trackingEligible ? scheduledEnd ?? scheduledStart ?? null : null;
  if (!etaAt) {
    return {
      jobId: input.jobId,
      customerId: input.customerId,
      customerName: input.customerName,
      jobTitle: input.jobTitle,
      status: input.status,
      etaAt: null,
      availability: 'unavailable',
      rationale: trackingEligible
        ? 'Job is tracking-eligible but has no scheduled start/end — ETA unavailable (not invented).'
        : 'Job is not eligible for customer-visible ETA from real dispatch/schedule data.',
    };
  }
  return {
    jobId: input.jobId,
    customerId: input.customerId,
    customerName: input.customerName,
    jobTitle: input.jobTitle,
    status: input.status,
    etaAt,
    availability: 'available',
    rationale: 'ETA derived from real job schedule / assignment data.',
  };
}

/** Composite relationship score from real signals only — unavailable when no signals. */
export function scoreCeiCustomerRelationship(input: {
  jobCount: number;
  completedJobCount: number;
  averageRating: number | null;
  reviewCount: number;
  communicationAverageScore: number | null;
  communicationMessageCount: number;
  openMaintenancePlans: number;
  overdueMaintenancePlans: number;
}): Omit<
  CeiRelationshipScoreSummary,
  'customerId' | 'customerName' | 'lastJobAt' | 'lastCommunicationAt' | 'customer360'
> {
  const hasSignal =
    input.jobCount > 0 ||
    input.reviewCount > 0 ||
    input.communicationMessageCount > 0 ||
    input.openMaintenancePlans > 0;
  if (!hasSignal) {
    return {
      availability: 'unavailable',
      relationshipScore: null,
      band: 'unavailable',
      components: {
        jobHistoryPoints: 0,
        satisfactionPoints: 0,
        communicationPoints: 0,
        maintenancePoints: 0,
      },
      jobCount: input.jobCount,
      reviewCount: input.reviewCount,
      openMaintenancePlans: input.openMaintenancePlans,
      summary:
        'No real jobs, reviews, communications, or maintenance plans — relationship score unavailable (not invented).',
    };
  }

  const jobHistoryPoints = Math.min(35, input.completedJobCount * 7 + Math.min(10, input.jobCount));
  let satisfactionPoints = 0;
  if (input.averageRating !== null) {
    satisfactionPoints = Math.round(((input.averageRating - 1) / 4) * 30);
  } else if (input.reviewCount > 0) {
    satisfactionPoints = 10;
  }
  const communicationPoints =
    input.communicationAverageScore === null
      ? 0
      : Math.min(25, Math.round(input.communicationAverageScore * 0.25));
  let maintenancePoints = Math.min(10, input.openMaintenancePlans * 3);
  if (input.overdueMaintenancePlans > 0) {
    maintenancePoints = Math.max(0, maintenancePoints - input.overdueMaintenancePlans * 4);
  }

  const relationshipScore = Math.min(
    100,
    jobHistoryPoints + satisfactionPoints + communicationPoints + maintenancePoints,
  );
  const band =
    relationshipScore >= 70 ? 'strong' : relationshipScore >= 45 ? 'stable' : 'at_risk';

  return {
    availability: 'available',
    relationshipScore,
    band,
    components: {
      jobHistoryPoints,
      satisfactionPoints,
      communicationPoints,
      maintenancePoints,
    },
    jobCount: input.jobCount,
    reviewCount: input.reviewCount,
    openMaintenancePlans: input.openMaintenancePlans,
    summary: `Relationship score from real jobs (${input.jobCount}), reviews (${input.reviewCount}), communication signals, and maintenance plans (${input.openMaintenancePlans}).`,
  };
}
