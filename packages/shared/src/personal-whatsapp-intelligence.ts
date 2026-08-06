/**
 * Personal WhatsApp Intelligence Workflow
 *
 * Distinct from:
 * - Personal Communications Intelligence (`personal_comm_*`) — currently indexes
 *   Business WhatsApp messages for company-scoped business intelligence.
 * - Personal WhatsApp Assistant (`personal_whatsapp` / Communications Platform) —
 *   Platform Owner–only credential path; private by default; never auto-imported.
 *
 * This module classifies owner-scoped personal threads, extracts business fields
 * when classified as business, and queues CRM/timeline links + AURA drafts for
 * explicit Owner approval. Never sends without approval. Never fabricates messages.
 */

import type { PersonalCommClassification } from './personal-communications-intelligence.js';
import type { CommPlatformLinkTargetType } from './communications-platform.js';

/** Canonical intelligence classifications for Personal WhatsApp threads. */
export type PersonalWaIntelClassification =
  | 'customer'
  | 'supplier'
  | 'employee'
  | 'business_opportunity'
  | 'private_personal';

export const PERSONAL_WA_INTEL_CLASSIFICATIONS: PersonalWaIntelClassification[] = [
  'customer',
  'supplier',
  'employee',
  'business_opportunity',
  'private_personal',
];

export type PersonalWaIntelLinkTargetType = CommPlatformLinkTargetType | 'timeline';

export type PersonalWaIntelProposalStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type PersonalWaIntelAuraSuggestionType =
  | 'next_action'
  | 'draft_reply'
  | 'approval_request';

export type PersonalWaIntelUrgency = 'low' | 'normal' | 'high' | 'emergency';

export type PersonalWaIntelBusinessExtraction = {
  customerName: string | null;
  phone: string | null;
  address: string | null;
  jobRequest: string | null;
  urgency: PersonalWaIntelUrgency;
  hasPhotosOrDocs: boolean;
  followUpNeeded: boolean;
  followUpNotes: string | null;
  signals: string[];
};

export type PersonalWaIntelClassificationResult = {
  classification: PersonalWaIntelClassification;
  confidence: number;
  rationale: string;
  isBusiness: boolean;
  /** Private-personal must stay excluded from business indexes. */
  excludedFromBusinessSearch: true | false;
};

export type PersonalWaIntelThreadSummary = {
  id: string;
  personalThreadId: string;
  contactPhone: string | null;
  contactName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  classification: PersonalWaIntelClassification;
  classificationConfidence: number;
  manualOverride: PersonalWaIntelClassification | null;
  privacyExcluded: boolean;
  extraction: PersonalWaIntelBusinessExtraction | null;
  linkedCustomerId: string | null;
  linkedLeadId: string | null;
  linkedJobId: string | null;
  linkedPropertyId: string | null;
  timelineLinked: boolean;
};

export type PersonalWaIntelLinkProposalSummary = {
  id: string;
  personalThreadId: string | null;
  classificationId: string | null;
  linkTargetType: PersonalWaIntelLinkTargetType;
  linkTargetId: string | null;
  status: PersonalWaIntelProposalStatus;
  subject: string;
  recommendation: string;
  autoLinked: false;
  createdAt: string;
  decidedAt: string | null;
};

export type PersonalWaIntelAuraSuggestionSummary = {
  id: string;
  personalThreadId: string | null;
  suggestionType: PersonalWaIntelAuraSuggestionType;
  status: PersonalWaIntelProposalStatus;
  subject: string;
  body: string;
  /** Always false — AURA never auto-sends. */
  autoSend: false;
  createdAt: string;
};

export type PersonalWaIntelDashboard = {
  summary: string;
  productClarification: {
    personalCommunicationsIntelligence: string;
    personalWhatsappAssistant: string;
    thisWorkflow: string;
  };
  sourcePath: 'personal_whatsapp_credential' | 'none';
  /** Honest: Business WA messages are NOT the source for this workflow. */
  usesBusinessWhatsappMessages: false;
  totalThreads: number;
  classifiedCount: number;
  byClassification: Record<PersonalWaIntelClassification, number>;
  pendingLinkApprovals: number;
  pendingAuraApprovals: number;
  privateExcludedCount: number;
  businessReadyCount: number;
  recentThreads: PersonalWaIntelThreadSummary[];
  approvalQueue: PersonalWaIntelLinkProposalSummary[];
  auraQueue: PersonalWaIntelAuraSuggestionSummary[];
  sendPolicy: {
    autoSendEnabled: false;
    requiresOwnerApproval: true;
    draftApproveExecute: true;
  };
};

export type ClassifyPersonalWaThreadRequest = {
  personalThreadId: string;
  /** Optional owner-provided context text — never invents message content. */
  contextText?: string;
  classificationOverride?: PersonalWaIntelClassification;
  notes?: string;
};

export type CreatePersonalWaLinkProposalRequest = {
  personalThreadId: string;
  linkTargetType: PersonalWaIntelLinkTargetType;
  linkTargetId?: string;
  subject?: string;
  recommendation?: string;
  notes?: string;
};

export type DecidePersonalWaLinkProposalRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type CreatePersonalWaAuraSuggestionRequest = {
  personalThreadId?: string;
  suggestionType: PersonalWaIntelAuraSuggestionType;
  subject: string;
  body: string;
};

export type DecidePersonalWaAuraSuggestionRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type RunPersonalWaIntelScanRequest = {
  /** When true, also create draft AURA next-action suggestions for business threads. */
  generateAuraSuggestions?: boolean;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const SUPPLIER_KEYWORDS = [
  'supplier',
  'purchase order',
  'delivery note',
  'wholesale',
  'stock available',
  'invoice from',
];
const EMPLOYEE_KEYWORDS = [
  'on my way',
  'clock in',
  'timesheet',
  'shift',
  'leave request',
  'payroll',
  'staff meeting',
];
const CUSTOMER_KEYWORDS = [
  'my account',
  'existing customer',
  'invoice',
  'statement',
  'job at my place',
  'previous job',
];
const OPPORTUNITY_KEYWORDS = [
  'quote',
  'estimate',
  'how much',
  'pricing',
  'can you come',
  'need a plumber',
  'leak',
  'blocked',
  'geyser',
  'book',
  'appointment',
  'new customer',
];
const PRIVATE_KEYWORDS = [
  'family',
  'mom',
  'dad',
  'brother',
  'sister',
  'birthday',
  'weekend plans',
  'personal',
  'braai',
  'friend',
];
const EMERGENCY_KEYWORDS = ['emergency', 'burst', 'flooding', 'urgent', 'no water', 'gas leak'];
const ADDRESS_PATTERN =
  /\b(\d{1,5}\s+[A-Za-z][A-Za-z\s]{2,40}(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|close|crescent|way)\b)/i;
const PHONE_PATTERN = /(?:\+?27|0)\s?\d{2}\s?\d{3}\s?\d{4}|\b\d{10,13}\b/;

export function isBusinessIntelClassification(
  classification: PersonalWaIntelClassification,
): boolean {
  return classification !== 'private_personal';
}

/** Map legacy PCI classifications onto the five-way intelligence taxonomy. */
export function mapPciToIntelClassification(
  pci: PersonalCommClassification,
): PersonalWaIntelClassification {
  switch (pci) {
    case 'existing_customer':
    case 'business_customer':
      return 'customer';
    case 'supplier':
      return 'supplier';
    case 'employee':
      return 'employee';
    case 'new_lead':
      return 'business_opportunity';
    case 'personal':
    case 'family':
    case 'friend':
      return 'private_personal';
    case 'marketing':
    case 'spam':
    case 'unknown':
    default:
      return 'private_personal';
  }
}

export function classifyPersonalWaIntelligence(input: {
  contactName?: string | null;
  contactPhone?: string | null;
  preview?: string | null;
  contextText?: string | null;
  knownCustomer?: boolean;
}): PersonalWaIntelClassificationResult {
  const text = [input.contactName, input.preview, input.contextText]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (!text.trim() && !input.knownCustomer) {
    return {
      classification: 'private_personal',
      confidence: 20,
      rationale: 'Insufficient signal — default private-personal until Owner classifies.',
      isBusiness: false,
      excludedFromBusinessSearch: true,
    };
  }

  if (PRIVATE_KEYWORDS.some((k) => text.includes(k))) {
    return {
      classification: 'private_personal',
      confidence: 78,
      rationale: 'Private/personal language detected — excluded from business indexes.',
      isBusiness: false,
      excludedFromBusinessSearch: true,
    };
  }
  if (SUPPLIER_KEYWORDS.some((k) => text.includes(k))) {
    return {
      classification: 'supplier',
      confidence: 74,
      rationale: 'Supplier/procurement language detected.',
      isBusiness: true,
      excludedFromBusinessSearch: false,
    };
  }
  if (EMPLOYEE_KEYWORDS.some((k) => text.includes(k))) {
    return {
      classification: 'employee',
      confidence: 72,
      rationale: 'Staff/operations language detected.',
      isBusiness: true,
      excludedFromBusinessSearch: false,
    };
  }
  if (input.knownCustomer || CUSTOMER_KEYWORDS.some((k) => text.includes(k))) {
    return {
      classification: 'customer',
      confidence: input.knownCustomer ? 88 : 70,
      rationale: input.knownCustomer
        ? 'Matched known customer context.'
        : 'Customer service language detected.',
      isBusiness: true,
      excludedFromBusinessSearch: false,
    };
  }
  if (OPPORTUNITY_KEYWORDS.some((k) => text.includes(k))) {
    return {
      classification: 'business_opportunity',
      confidence: 76,
      rationale: 'Job/quote/booking opportunity language detected.',
      isBusiness: true,
      excludedFromBusinessSearch: false,
    };
  }

  return {
    classification: 'private_personal',
    confidence: 45,
    rationale: 'No clear business signal — kept private-personal by default.',
    isBusiness: false,
    excludedFromBusinessSearch: true,
  };
}

export function extractBusinessFields(input: {
  contactName?: string | null;
  contactPhone?: string | null;
  preview?: string | null;
  contextText?: string | null;
  attachmentCount?: number;
}): PersonalWaIntelBusinessExtraction {
  const raw = [input.contactName, input.preview, input.contextText].filter(Boolean).join('\n');
  const lower = raw.toLowerCase();
  const addressMatch = raw.match(ADDRESS_PATTERN);
  const phoneFromText = raw.match(PHONE_PATTERN)?.[0] ?? null;
  const urgency: PersonalWaIntelUrgency = EMERGENCY_KEYWORDS.some((k) => lower.includes(k))
    ? 'emergency'
    : /asap|today|urgent/.test(lower)
      ? 'high'
      : 'normal';

  const signals: string[] = [];
  if (OPPORTUNITY_KEYWORDS.some((k) => lower.includes(k))) signals.push('job_or_quote_interest');
  if (urgency === 'emergency' || urgency === 'high') signals.push('urgency');
  if ((input.attachmentCount ?? 0) > 0 || /\[image|\[document|\[photo|\[video/.test(lower)) {
    signals.push('media_attached');
  }
  if (/follow.?up|call me|get back/.test(lower)) signals.push('follow_up_requested');

  const jobRequest =
    raw
      .split(/[.!?\n]/)
      .map((p) => p.trim())
      .find((p) => p.length > 12 && OPPORTUNITY_KEYWORDS.some((k) => p.toLowerCase().includes(k))) ??
    null;

  return {
    customerName: input.contactName?.trim() || null,
    phone: input.contactPhone?.trim() || phoneFromText,
    address: addressMatch?.[1]?.trim() ?? null,
    jobRequest,
    urgency,
    hasPhotosOrDocs: signals.includes('media_attached'),
    followUpNeeded: signals.includes('follow_up_requested') || Boolean(jobRequest),
    followUpNotes: signals.includes('follow_up_requested')
      ? 'Owner-approved follow-up recommended — do not contact automatically.'
      : null,
    signals,
  };
}

export function buildPersonalWaDraftReply(input: {
  classification: PersonalWaIntelClassification;
  contactName?: string | null;
  extraction?: PersonalWaIntelBusinessExtraction | null;
}): { subject: string; body: string } {
  const name = input.contactName?.trim() || 'there';
  if (input.classification === 'private_personal') {
    return {
      subject: 'Private thread — no business draft',
      body: 'This thread is private-personal. No business reply draft is generated.',
    };
  }
  if (input.classification === 'business_opportunity') {
    const job = input.extraction?.jobRequest ?? 'your request';
    return {
      subject: `Draft reply — opportunity (${name})`,
      body: `Hi ${name},\n\nThanks for getting in touch about ${job}. I can help arrange a visit — please confirm a suitable time and the site address.\n\n(This is an AURA draft for Owner approval only — nothing was sent.)`,
    };
  }
  if (input.classification === 'customer') {
    return {
      subject: `Draft reply — customer (${name})`,
      body: `Hi ${name},\n\nThanks for your message. I have noted the details and will confirm next steps shortly.\n\n(This is an AURA draft for Owner approval only — nothing was sent.)`,
    };
  }
  if (input.classification === 'supplier') {
    return {
      subject: `Draft reply — supplier (${name})`,
      body: `Hi ${name},\n\nThanks — please send the latest pricing / availability and I will confirm.\n\n(This is an AURA draft for Owner approval only — nothing was sent.)`,
    };
  }
  return {
    subject: `Draft reply — staff (${name})`,
    body: `Hi ${name},\n\nNoted — please confirm status when done.\n\n(This is an AURA draft for Owner approval only — nothing was sent.)`,
  };
}

export function buildPersonalWaNextAction(input: {
  classification: PersonalWaIntelClassification;
  contactName?: string | null;
  extraction?: PersonalWaIntelBusinessExtraction | null;
}): { subject: string; body: string } {
  const name = input.contactName?.trim() || 'contact';
  if (input.classification === 'private_personal') {
    return {
      subject: 'Keep private',
      body: `Thread with ${name} is private-personal. No CRM or timeline action.`,
    };
  }
  if (input.classification === 'business_opportunity') {
    return {
      subject: `Review opportunity — ${name}`,
      body: 'Propose linking to a new lead or existing customer after Owner approval. Never auto-create CRM records.',
    };
  }
  if (input.classification === 'customer') {
    return {
      subject: `Link customer conversation — ${name}`,
      body: 'Propose linking to the matching customer / job / property on the Communication Timeline after Owner approval.',
    };
  }
  if (input.classification === 'supplier') {
    return {
      subject: `Link supplier — ${name}`,
      body: 'Propose linking to supplier record after Owner approval.',
    };
  }
  return {
    subject: `Review staff thread — ${name}`,
    body: 'Propose linking to staff record after Owner approval. Keep out of customer search.',
  };
}

export function emptyIntelClassificationCounts(): Record<PersonalWaIntelClassification, number> {
  return {
    customer: 0,
    supplier: 0,
    employee: 0,
    business_opportunity: 0,
    private_personal: 0,
  };
}

export const PERSONAL_WA_INTEL_PRODUCT_COPY = {
  personalCommunicationsIntelligence:
    'Personal Communications Intelligence (`personal_comm_*`) analyses Business WhatsApp messages for company-scoped lead/follow-up intelligence. It does not ingest Personal WhatsApp sessions.',
  personalWhatsappAssistant:
    'Personal WhatsApp Assistant (`personal_whatsapp`) is a Platform Owner–only credential path on the Communications Platform. Threads are private by default, excluded from business search, and never auto-imported.',
  thisWorkflow:
    'Personal WhatsApp Intelligence classifies owner-scoped personal threads, extracts business fields when appropriate, and queues CRM/timeline links plus AURA drafts for explicit Owner approval. It never sends messages and never fabricates conversation content.',
} as const;
