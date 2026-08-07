/**
 * Communication AURA Intelligence
 *
 * Cross-channel intelligence over existing Email Centre, Communications Platform
 * (business Gmail / business WhatsApp), Communication Timeline, and related
 * approval patterns. Extends — does not replace — Communications Intelligence,
 * Personal WhatsApp Intelligence, or Personal Communications Intelligence.
 *
 * Invariants:
 * - Never fabricates messages or sentiment scores
 * - Sentiment is `unavailable` when no lexical signal exists
 * - Smart replies / outbound are drafts only — Owner approval before send
 * - Never auto-sends; never auto-links CRM entities
 * - Personal WhatsApp remains on its own Owner-gated path (not sourced here)
 */

import type { CommPlatformLinkTargetType } from './communications-platform.js';
import { canAccessBusinessCommunications } from './communications-platform.js';

export type CommAuraChannel = 'email' | 'whatsapp';

export type CommAuraSourceKind = 'business_gmail' | 'business_whatsapp';

export type CommAuraPriority = 'critical' | 'high' | 'normal' | 'low';

/** Honest sentiment — unavailable when no signal; never invent neutral scores. */
export type CommAuraSentiment = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unavailable';

export type CommAuraProposalStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type CommAuraDraftType = 'smart_reply' | 'follow_up';

export type CommAuraLinkTargetType = CommPlatformLinkTargetType | 'timeline';

export type CommAuraSentimentResult = {
  sentiment: CommAuraSentiment;
  /** 0–100 when available; null when unavailable. */
  confidence: number | null;
  signals: string[];
  rationale: string;
};

export type CommAuraScoreBreakdown = {
  urgencyPoints: number;
  unreadPoints: number;
  agePoints: number;
  attachmentPoints: number;
  unlinkedPoints: number;
  sentimentPoints: number;
};

export type CommAuraPrioritisedMessage = {
  id: string;
  sourceKind: CommAuraSourceKind;
  channel: CommAuraChannel;
  inboxItemId: string;
  subject: string | null;
  preview: string | null;
  participantLabel: string | null;
  occurredAt: string | null;
  unread: boolean;
  urgent: boolean;
  priority: CommAuraPriority;
  communicationScore: number;
  scoreBreakdown: CommAuraScoreBreakdown;
  sentiment: CommAuraSentiment;
  sentimentConfidence: number | null;
  sentimentSignals: string[];
  linkedCustomerId: string | null;
  linkedLeadId: string | null;
  linkedJobId: string | null;
  timelineLinked: boolean;
  followUpSuggested: boolean;
};

export type CommAuraDraftSummary = {
  id: string;
  draftType: CommAuraDraftType;
  status: CommAuraProposalStatus;
  channel: CommAuraChannel;
  inboxItemId: string | null;
  customerId: string | null;
  jobId: string | null;
  subject: string;
  body: string;
  /** Always false — AURA never auto-sends. */
  autoSend: false;
  createdAt: string;
  decidedAt: string | null;
};

export type CommAuraFollowUpSummary = {
  id: string;
  status: CommAuraProposalStatus;
  inboxItemId: string | null;
  customerId: string | null;
  jobId: string | null;
  subject: string;
  recommendation: string;
  dueHint: string | null;
  autoExecuted: false;
  createdAt: string;
};

export type CommAuraLinkProposalSummary = {
  id: string;
  inboxItemId: string | null;
  linkTargetType: CommAuraLinkTargetType;
  linkTargetId: string | null;
  status: CommAuraProposalStatus;
  subject: string;
  recommendation: string;
  autoLinked: false;
  createdAt: string;
  decidedAt: string | null;
};

export type CommAuraCustomerInsight = {
  id: string;
  customerId: string;
  customerName: string | null;
  messageCount: number;
  unreadCount: number;
  averageScore: number | null;
  dominantSentiment: CommAuraSentiment;
  sentimentAvailability: 'available' | 'unavailable';
  openFollowUps: number;
  pendingDrafts: number;
  linkedJobCount: number;
  lastCommunicationAt: string | null;
  summary: string;
};

export type CommAuraDashboard = {
  summary: string;
  productClarification: {
    communicationsIntelligence: string;
    emailCentreAndTimeline: string;
    personalWhatsappIntelligence: string;
    thisLayer: string;
  };
  /** Honest: this layer never reads Personal WhatsApp threads. */
  usesPersonalWhatsapp: false;
  totalScored: number;
  byPriority: Record<CommAuraPriority, number>;
  sentimentAvailableCount: number;
  sentimentUnavailableCount: number;
  pendingDraftApprovals: number;
  pendingFollowUps: number;
  pendingLinkApprovals: number;
  averageCommunicationScore: number | null;
  prioritisedMessages: CommAuraPrioritisedMessage[];
  draftQueue: CommAuraDraftSummary[];
  followUpQueue: CommAuraFollowUpSummary[];
  linkQueue: CommAuraLinkProposalSummary[];
  customerInsights: CommAuraCustomerInsight[];
  sendPolicy: {
    autoSendEnabled: false;
    requiresOwnerApproval: true;
    draftApproveExecute: true;
  };
};

export type RunCommAuraScanRequest = {
  /** When true, also queue smart-reply / follow-up drafts for Owner approval. */
  generateDrafts?: boolean;
  /** Cap inbox items analysed in one scan (real indexed rows only). */
  limit?: number;
};

export type CreateCommAuraDraftRequest = {
  inboxItemId: string;
  draftType: CommAuraDraftType;
  subject?: string;
  body?: string;
};

export type DecideCommAuraDraftRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type CreateCommAuraFollowUpRequest = {
  inboxItemId?: string;
  customerId?: string;
  jobId?: string;
  subject: string;
  recommendation: string;
  dueHint?: string;
};

export type DecideCommAuraFollowUpRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type CreateCommAuraLinkProposalRequest = {
  inboxItemId: string;
  linkTargetType: CommAuraLinkTargetType;
  linkTargetId?: string;
  subject?: string;
  recommendation?: string;
  notes?: string;
};

export type DecideCommAuraLinkProposalRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type AnalyseCommAuraInboxItemRequest = {
  inboxItemId: string;
  /** Optional owner/staff context — never invents message content. */
  contextText?: string;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const POSITIVE_KEYWORDS = [
  'thank',
  'thanks',
  'great',
  'appreciate',
  'excellent',
  'happy',
  'pleased',
  'wonderful',
  'perfect',
];
const NEGATIVE_KEYWORDS = [
  'angry',
  'unhappy',
  'angry',
  'disappointed',
  'terrible',
  'awful',
  'refund',
  'cancel',
  'complaint',
  'unacceptable',
  'frustrated',
];
const URGENCY_KEYWORDS = [
  'emergency',
  'urgent',
  'asap',
  'immediately',
  'burst',
  'flooding',
  'no water',
  'gas leak',
  'today',
];
const FOLLOW_UP_KEYWORDS = [
  'follow up',
  'follow-up',
  'get back',
  'call me',
  'waiting',
  'any update',
  'still waiting',
  'please confirm',
];

export function canAccessCommunicationAuraIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  return canAccessBusinessCommunications(identity);
}

export function canWriteCommunicationAuraIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessCommunicationAuraIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('communications:write') ||
    identity.permissions.includes('communications:manage') ||
    identity.permissions.includes('communications_intelligence:write')
  );
}

export function detectCommAuraSentiment(input: {
  subject?: string | null;
  preview?: string | null;
  contextText?: string | null;
}): CommAuraSentimentResult {
  const text = [input.subject, input.preview, input.contextText]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (!text.trim()) {
    return {
      sentiment: 'unavailable',
      confidence: null,
      signals: [],
      rationale: 'No message text available — sentiment unavailable (not invented).',
    };
  }

  const positiveHits = POSITIVE_KEYWORDS.filter((k) => text.includes(k));
  const negativeHits = NEGATIVE_KEYWORDS.filter((k) => text.includes(k));
  const signals = [
    ...positiveHits.map((k) => `positive:${k}`),
    ...negativeHits.map((k) => `negative:${k}`),
  ];

  if (positiveHits.length === 0 && negativeHits.length === 0) {
    return {
      sentiment: 'unavailable',
      confidence: null,
      signals: [],
      rationale: 'No clear sentiment keywords — sentiment unavailable (not invented).',
    };
  }

  if (positiveHits.length > 0 && negativeHits.length > 0) {
    return {
      sentiment: 'mixed',
      confidence: Math.min(90, 50 + (positiveHits.length + negativeHits.length) * 8),
      signals,
      rationale: 'Both positive and negative lexical signals detected.',
    };
  }
  if (negativeHits.length > 0) {
    return {
      sentiment: 'negative',
      confidence: Math.min(92, 55 + negativeHits.length * 10),
      signals,
      rationale: 'Negative lexical signals detected.',
    };
  }
  return {
    sentiment: 'positive',
    confidence: Math.min(92, 55 + positiveHits.length * 10),
    signals,
    rationale: 'Positive lexical signals detected.',
  };
}

export function scoreCommAuraMessage(input: {
  urgent?: boolean;
  unread?: boolean;
  occurredAt?: string | Date | null;
  attachmentCount?: number;
  hasCrmLink?: boolean;
  sentiment?: CommAuraSentiment;
  preview?: string | null;
  subject?: string | null;
  now?: Date;
}): { score: number; priority: CommAuraPriority; breakdown: CommAuraScoreBreakdown } {
  const now = input.now ?? new Date();
  const text = [input.subject, input.preview].filter(Boolean).join('\n').toLowerCase();
  const lexicalUrgent = URGENCY_KEYWORDS.some((k) => text.includes(k));

  const urgencyPoints = input.urgent || lexicalUrgent ? 35 : 0;
  const unreadPoints = input.unread ? 15 : 0;

  let agePoints = 0;
  if (input.occurredAt) {
    const occurred =
      typeof input.occurredAt === 'string' ? new Date(input.occurredAt) : input.occurredAt;
    if (!Number.isNaN(occurred.getTime())) {
      const hours = (now.getTime() - occurred.getTime()) / (1000 * 60 * 60);
      if (hours >= 72) agePoints = 25;
      else if (hours >= 24) agePoints = 18;
      else if (hours >= 8) agePoints = 10;
      else if (hours >= 2) agePoints = 5;
    }
  }

  const attachmentPoints = (input.attachmentCount ?? 0) > 0 ? 5 : 0;
  const unlinkedPoints = input.hasCrmLink ? 0 : 10;

  let sentimentPoints = 0;
  if (input.sentiment === 'negative') sentimentPoints = 15;
  else if (input.sentiment === 'mixed') sentimentPoints = 8;
  // unavailable / positive / neutral add no escalation points

  const score = Math.min(
    100,
    urgencyPoints + unreadPoints + agePoints + attachmentPoints + unlinkedPoints + sentimentPoints,
  );

  const breakdown: CommAuraScoreBreakdown = {
    urgencyPoints,
    unreadPoints,
    agePoints,
    attachmentPoints,
    unlinkedPoints,
    sentimentPoints,
  };

  let priority: CommAuraPriority = 'low';
  if (score >= 70 || urgencyPoints >= 35) priority = 'critical';
  else if (score >= 45) priority = 'high';
  else if (score >= 20) priority = 'normal';

  return { score, priority, breakdown };
}

export function buildCommAuraSmartReply(input: {
  channel: CommAuraChannel;
  participantLabel?: string | null;
  subject?: string | null;
  preview?: string | null;
  companyName?: string | null;
}): { subject: string; body: string } {
  const name =
    input.participantLabel?.replace(/<.*>/, '').trim().split(/\s+/)[0] ||
    'there';
  const topic = input.subject?.trim() || 'your message';
  const signOff = input.companyName?.trim() ? `— ${input.companyName.trim()}` : '—';
  const channelNote =
    input.channel === 'whatsapp'
      ? 'WhatsApp draft for Owner approval — send only via approved Business WhatsApp path.'
      : 'Email draft for Owner approval — send only via Gmail draft → approve → execute.';

  return {
    subject: `Draft reply — ${topic}`.slice(0, 200),
    body: [
      `Hi ${name},`,
      '',
      'Thanks for getting in touch. We have received your message and will confirm next steps shortly.',
      '',
      input.preview?.trim()
        ? `(Context preview on file — AURA did not invent additional conversation content.)`
        : '(Limited preview on file — draft kept generic; do not invent details.)',
      '',
      `(${channelNote} Nothing was sent.)`,
      '',
      signOff,
    ].join('\n'),
  };
}

export function buildCommAuraFollowUpSuggestion(input: {
  participantLabel?: string | null;
  subject?: string | null;
  preview?: string | null;
  unread?: boolean;
  occurredAt?: string | null;
  hasCrmLink?: boolean;
}): { subject: string; recommendation: string; dueHint: string | null; suggested: boolean } {
  const text = [input.subject, input.preview].filter(Boolean).join('\n').toLowerCase();
  const lexicalFollowUp = FOLLOW_UP_KEYWORDS.some((k) => text.includes(k));
  const name = input.participantLabel?.replace(/<.*>/, '').trim() || 'contact';

  if (!lexicalFollowUp && !input.unread && input.hasCrmLink) {
    return {
      subject: `No follow-up signal — ${name}`,
      recommendation:
        'No lexical follow-up request and item is linked. No draft follow-up queued automatically.',
      dueHint: null,
      suggested: false,
    };
  }

  const reasons: string[] = [];
  if (lexicalFollowUp) reasons.push('customer asked for a follow-up');
  if (input.unread) reasons.push('still unread');
  if (!input.hasCrmLink) reasons.push('not linked to CRM yet');

  return {
    subject: `Follow-up suggested — ${name}`.slice(0, 200),
    recommendation: `Suggest Owner-approved follow-up because ${reasons.join('; ') || 'inbox signal'}. Do not contact automatically.`,
    dueHint: lexicalFollowUp || input.unread ? 'within_24h' : 'when_convenient',
    suggested: true,
  };
}

export function emptyCommAuraPriorityCounts(): Record<CommAuraPriority, number> {
  return {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
  };
}

export function dominantCommAuraSentiment(
  sentiments: CommAuraSentiment[],
): { sentiment: CommAuraSentiment; availability: 'available' | 'unavailable' } {
  const available = sentiments.filter((s) => s !== 'unavailable');
  if (available.length === 0) {
    return { sentiment: 'unavailable', availability: 'unavailable' };
  }
  const counts: Record<string, number> = {};
  for (const s of available) {
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return {
    sentiment: ranked[0]![0] as CommAuraSentiment,
    availability: 'available',
  };
}

export const COMM_AURA_PRODUCT_COPY = {
  communicationsIntelligence:
    'Communications Intelligence covers calls, SMS, voice, and conversation insights. Communication AURA Intelligence focuses on prioritising and drafting across Email Centre / business inbox channels.',
  emailCentreAndTimeline:
    'Email Centre and Communication Timeline remain the operational surfaces for mailbox, drafts, attachments, and customer/job timeline notes.',
  personalWhatsappIntelligence:
    'Personal WhatsApp Intelligence / Connection Layer stay Platform Owner–only and are never sourced by this business-channel AURA layer.',
  thisLayer:
    'Communication AURA Intelligence prioritises business messages, scores communications, surfaces honest sentiment (or unavailable), queues smart-reply and follow-up drafts for Owner approval, and proposes CRM/timeline links. It never auto-sends and never fabricates messages or scores.',
} as const;
