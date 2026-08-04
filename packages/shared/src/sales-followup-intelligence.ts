/**
 * Sales Follow-up Intelligence (Department 10.2)
 *
 * Extends Sales Intelligence Agent Foundation (10.1) / quotes / CRM customers /
 * jobs / recurring maintenance with:
 * - Quote follow-up reminders, scheduling, and customer response tracking
 * - Objection handling drafts (concerns, price, value) — AI drafts only
 * - Reactivation campaign drafts from real previous-customer history
 *
 * Invariants:
 * - Draft only — Owner approval before sending; never automatic messaging
 * - Real quotes/customers/jobs only — no fake campaigns or invented responses
 * - Technician / Client denied; Owner + sales/leads RBAC
 * - Audit via security_audit_logs
 */

export const SALES_FOLLOWUP_INTELLIGENCE_KEY = 'sales-followup-intelligence' as const;

export type SfiDraftKind =
  | 'quote_reminder'
  | 'quote_follow_up'
  | 'objection_response'
  | 'price_objection'
  | 'value_explanation'
  | 'reactivation'
  | 'maintenance_opportunity'
  | 'service_opportunity';

export type SfiDraftStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled';

export type SfiChannel = 'email' | 'sms' | 'portal' | 'whatsapp_business' | 'other';

export type SfiCustomerResponseStatus =
  | 'none'
  | 'awaiting'
  | 'responded'
  | 'no_response'
  | 'unavailable';

export type SfiObjectionCategory =
  | 'price'
  | 'timing'
  | 'scope'
  | 'trust'
  | 'competitor'
  | 'other'
  | 'unavailable';

export type SfiAvailability = 'available' | 'partial' | 'unavailable';

export type SfiAccessIdentity = {
  roleName?: string | null;
  permissions?: string[] | null;
};

// ─── Access helpers ───────────────────────────────────────────────────────────

function isOwnerRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner'
  );
}

/** Owner + sales/leads RBAC; Technician/Client always denied. */
export function canAccessSalesFollowupIntelligence(identity: SfiAccessIdentity): boolean {
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
    permissions.includes('quotes:read') ||
    permissions.includes('quotes:write') ||
    permissions.includes('agents:read')
  );
}

export function canWriteSalesFollowupIntelligence(identity: SfiAccessIdentity): boolean {
  if (!canAccessSalesFollowupIntelligence(identity)) return false;
  const role = identity.roleName ?? '';
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (isOwnerRole(role)) return true;
  return (
    permissions.includes('sales:write') ||
    permissions.includes('sales_intelligence:write') ||
    permissions.includes('sales_intelligence:manage') ||
    permissions.includes('leads:write') ||
    permissions.includes('quotes:write') ||
    permissions.includes('agents:write')
  );
}

/** Owner (Company/Platform) or * may approve outreach drafts. */
export function canApproveSalesFollowupIntelligence(identity: SfiAccessIdentity): boolean {
  if (!canAccessSalesFollowupIntelligence(identity)) return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerRole(identity.roleName);
}

export const SFI_PRODUCT_COPY = {
  salesIntelligenceAgent:
    'Sales Intelligence Agent Foundation (10.1) remains the agent identity / lead-hunting / pipeline insight layer. This module extends it with quote follow-up, objection drafts, and reactivation drafts — it does not rebuild the agent.',
  thisLayer:
    'Sales Follow-up Intelligence queues quote reminders, objection/value response drafts, and reactivation outreach from real quotes/customers/jobs only. Owner approval required; nothing is auto-sent. No fake campaigns.',
} as const;

// ─── Settings ─────────────────────────────────────────────────────────────────

export type SfiSettings = {
  quoteRemindersEnabled: boolean;
  objectionDraftsEnabled: boolean;
  reactivationDraftsEnabled: boolean;
  /** Invariant: always false — never auto-send. */
  autoSendEnabled: false;
  defaultChannel: SfiChannel;
  staleQuoteDays: number;
  reactivationIdleDays: number;
  updatedAt: string;
};

export type UpdateSfiSettingsRequest = {
  quoteRemindersEnabled?: boolean;
  objectionDraftsEnabled?: boolean;
  reactivationDraftsEnabled?: boolean;
  defaultChannel?: SfiChannel;
  staleQuoteDays?: number;
  reactivationIdleDays?: number;
};

export function emptySfiDraftKindCounts(): Record<SfiDraftKind, number> {
  return {
    quote_reminder: 0,
    quote_follow_up: 0,
    objection_response: 0,
    price_objection: 0,
    value_explanation: 0,
    reactivation: 0,
    maintenance_opportunity: 0,
    service_opportunity: 0,
  };
}

export function defaultSfiSettings(now: Date = new Date()): SfiSettings {
  return {
    quoteRemindersEnabled: true,
    objectionDraftsEnabled: true,
    reactivationDraftsEnabled: true,
    autoSendEnabled: false,
    defaultChannel: 'email',
    staleQuoteDays: 7,
    reactivationIdleDays: 90,
    updatedAt: now.toISOString(),
  };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function formatSfiCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

const OPEN_QUOTE_STATUSES = new Set<string>([
  'sent',
  'viewed',
  'approved_for_sending',
  'accepted',
]);

export function isSfiOpenQuoteStatus(status: string): boolean {
  return OPEN_QUOTE_STATUSES.has(status);
}

/** Whole days elapsed since an ISO timestamp; null when the value is absent or unparseable. */
export function sfiDaysBetween(
  fromIso: string | null | undefined,
  to: Date = new Date(),
): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

// ─── Objection detection ──────────────────────────────────────────────────────

export type SfiObjectionDetection = {
  category: SfiObjectionCategory;
  availability: SfiAvailability;
};

export function detectSfiObjectionCategory(
  text: string | null | undefined,
): SfiObjectionDetection {
  const raw = (text ?? '').trim().toLowerCase();
  if (!raw) return { category: 'unavailable', availability: 'unavailable' };
  if (/\b(price|expensive|cost|afford|budget|cheaper|quote.*high)\b/.test(raw)) {
    return { category: 'price', availability: 'available' };
  }
  if (/\b(later|timing|not ready|next month|busy|delay)\b/.test(raw)) {
    return { category: 'timing', availability: 'available' };
  }
  if (/\b(scope|include|exclude|what.*cover|too much work)\b/.test(raw)) {
    return { category: 'scope', availability: 'available' };
  }
  if (/\b(trust|review|guarantee|warranty|sure|confident)\b/.test(raw)) {
    return { category: 'trust', availability: 'available' };
  }
  if (/\b(competitor|other company|someone else|alternative)\b/.test(raw)) {
    return { category: 'competitor', availability: 'available' };
  }
  if (/\b(concern|object|hesitat|not sure|question)\b/.test(raw)) {
    return { category: 'other', availability: 'available' };
  }
  return { category: 'unavailable', availability: 'unavailable' };
}

// ─── Draft builders (never auto-send) ─────────────────────────────────────────

export type SfiQuoteReminderDraftInput = {
  customerName: string | null;
  quoteNumber: string;
  quoteTitle: string;
  totalCents: number;
  currency: string;
  validUntil: string | null;
};

export type SfiQuoteReminderDraft = {
  subject: string;
  body: string;
  /** Invariant: always false — Owner approval is required before sending. */
  autoSend: false;
};

export function buildSfiQuoteReminderDraft(
  input: SfiQuoteReminderDraftInput,
): SfiQuoteReminderDraft {
  const name = input.customerName?.trim() || 'Customer';
  const amount = formatSfiCents(input.totalCents, input.currency);
  const valid = input.validUntil
    ? ` Validity noted until ${input.validUntil.slice(0, 10)}.`
    : ' Validity date is not stored on this quote.';
  return {
    subject: `DRAFT: Quote reminder — ${input.quoteNumber}`,
    body: [
      `Hi ${name},`,
      '',
      `This is an AURA quote follow-up draft for quote ${input.quoteNumber} (${input.quoteTitle}) totaling ${amount}.${valid}`,
      '',
      'Owner approval is required before sending. Nothing was sent automatically.',
      '— TITAN Sales Follow-up Intelligence (draft only)',
    ].join('\n'),
    autoSend: false,
  };
}

export type SfiObjectionDraftKind = 'objection_response' | 'price_objection' | 'value_explanation';

export type SfiObjectionDraftInput = {
  customerName: string | null;
  category: SfiObjectionCategory;
  quoteNumber: string | null;
  signalText: string | null;
};

export type SfiObjectionDraft = {
  kind: SfiObjectionDraftKind;
  subject: string;
  body: string;
  /** Invariant: always false — Owner approval is required before sending. */
  autoSend: false;
};

export function buildSfiObjectionDraft(input: SfiObjectionDraftInput): SfiObjectionDraft {
  const name = input.customerName?.trim() || 'Customer';
  const quoteRef = input.quoteNumber ? ` regarding quote ${input.quoteNumber}` : '';
  const kind: SfiObjectionDraftKind =
    input.category === 'price'
      ? 'price_objection'
      : input.category === 'scope' || input.category === 'trust'
        ? 'value_explanation'
        : 'objection_response';
  const guidance =
    input.category === 'price'
      ? 'Acknowledge the budget concern, restate scope value, and offer Owner-approved options — do not invent discounts.'
      : input.category === 'timing'
        ? 'Acknowledge timing, keep the quote open politely, and invite a preferred revisit window.'
        : input.category === 'scope'
          ? 'Clarify scope inclusions/exclusions from the real quote — do not invent line items.'
          : 'Address the concern with clear, factual language grounded in the real quote/job history.';
  const signal = input.signalText?.trim()
    ? `Customer signal (real text): "${input.signalText.trim().slice(0, 280)}"`
    : 'No stored objection text — category inferred as unavailable or partial; draft stays generic.';
  return {
    kind,
    subject: `DRAFT: Objection response${quoteRef}`,
    body: [
      `Hi ${name},`,
      '',
      `This is an AURA ${kind.replaceAll('_', ' ')} draft${quoteRef}.`,
      guidance,
      signal,
      '',
      'Owner approval is required before sending. Nothing was sent automatically.',
      '— TITAN Sales Follow-up Intelligence (draft only)',
    ].join('\n'),
    autoSend: false,
  };
}

export type SfiReactivationKind =
  | 'maintenance_opportunity'
  | 'service_opportunity'
  | 'previous_customer';

export type SfiReactivationDraftKind =
  | 'reactivation'
  | 'maintenance_opportunity'
  | 'service_opportunity';

export type SfiReactivationDraftInput = {
  customerName: string | null;
  kind: SfiReactivationKind;
  lastJobAt: string | null;
  completedJobCount: number;
  maintenancePlanName: string | null;
};

export type SfiReactivationDraft = {
  draftKind: SfiReactivationDraftKind;
  subject: string;
  body: string;
  /** Invariant: always false — Owner approval is required before sending. */
  autoSend: false;
};

export function buildSfiReactivationDraft(input: SfiReactivationDraftInput): SfiReactivationDraft {
  const name = input.customerName?.trim() || 'Customer';
  const draftKind: SfiReactivationDraftKind =
    input.kind === 'maintenance_opportunity'
      ? 'maintenance_opportunity'
      : input.kind === 'service_opportunity'
        ? 'service_opportunity'
        : 'reactivation';
  const lastJob = input.lastJobAt
    ? `Last completed work on record: ${input.lastJobAt.slice(0, 10)} (${input.completedJobCount} completed job(s)).`
    : `Completed jobs on record: ${input.completedJobCount}. Last job date unavailable.`;
  const maint = input.maintenancePlanName
    ? `Linked maintenance plan: ${input.maintenancePlanName}.`
    : 'No linked maintenance plan name available — opportunity grounded in job history only.';
  return {
    draftKind,
    subject: `DRAFT: ${draftKind.replaceAll('_', ' ')} — ${name}`,
    body: [
      `Hi ${name},`,
      '',
      'This is an AURA reactivation / service opportunity draft from real customer history.',
      lastJob,
      maint,
      '',
      'Owner approval is required before sending. Nothing was sent automatically. No fake campaign was created.',
      '— TITAN Sales Follow-up Intelligence (draft only)',
    ].join('\n'),
    autoSend: false,
  };
}

// ─── Quote follow-up items ────────────────────────────────────────────────────

export type SfiQuoteFollowUpInput = {
  quoteId: string;
  quoteNumber: string;
  title: string;
  status: string;
  customerId: string;
  customerName: string | null;
  totalCents: number;
  currency: string;
  issuedAt: string | null;
  validUntil: string | null;
  staleQuoteDays: number;
  responseStatus: SfiCustomerResponseStatus;
  lastResponseAt: string | null;
  scheduledFollowUpAt: string | null;
};

export type SfiQuoteFollowUpItem = {
  quoteId: string;
  quoteNumber: string;
  title: string;
  status: string;
  customerId: string;
  customerName: string | null;
  totalCents: number;
  currency: string;
  issuedAt: string | null;
  validUntil: string | null;
  daysSinceIssued: number | null;
  reminderRecommended: boolean;
  responseStatus: SfiCustomerResponseStatus;
  responseAvailability: SfiAvailability;
  lastResponseAt: string | null;
  scheduledFollowUpAt: string | null;
  summary: string;
};

export function buildSfiQuoteFollowUpItem(input: SfiQuoteFollowUpInput): SfiQuoteFollowUpItem {
  const days = sfiDaysBetween(input.issuedAt);
  const reminderRecommended =
    isSfiOpenQuoteStatus(input.status) &&
    days !== null &&
    days >= input.staleQuoteDays &&
    input.responseStatus !== 'responded';
  const responseAvailability: SfiAvailability =
    input.responseStatus === 'unavailable'
      ? 'unavailable'
      : input.responseStatus === 'none'
        ? 'partial'
        : 'available';
  return {
    quoteId: input.quoteId,
    quoteNumber: input.quoteNumber,
    title: input.title,
    status: input.status,
    customerId: input.customerId,
    customerName: input.customerName,
    totalCents: input.totalCents,
    currency: input.currency,
    issuedAt: input.issuedAt,
    validUntil: input.validUntil,
    daysSinceIssued: days,
    reminderRecommended,
    responseStatus: input.responseStatus,
    responseAvailability,
    lastResponseAt: input.lastResponseAt,
    scheduledFollowUpAt: input.scheduledFollowUpAt,
    summary: reminderRecommended
      ? `Quote ${input.quoteNumber} is open for ${days} day(s) — reminder draft recommended (approval required).`
      : `Quote ${input.quoteNumber} tracked from real quote record; response status: ${input.responseStatus}.`,
  };
}

// ─── Read models ──────────────────────────────────────────────────────────────

export type SfiObjectionSignal = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  category: SfiObjectionCategory;
  availability: SfiAvailability;
  signalText: string;
  recommendation: string;
  /** Invariant: always false — signals never trigger outreach on their own. */
  autoExecuted: false;
};

export type SfiReactivationOpportunityKind = 'maintenance_opportunity' | 'previous_customer';

export type SfiReactivationOpportunity = {
  id: string;
  customerId: string;
  customerName: string | null;
  kind: SfiReactivationOpportunityKind;
  availability: SfiAvailability;
  lastJobAt: string | null;
  completedJobCount: number;
  openMaintenancePlanCount: number;
  recommendation: string;
  /** Invariant: always false — opportunities never trigger outreach on their own. */
  autoExecuted: false;
};

export type SfiOutreachDraftSummary = {
  id: string;
  kind: SfiDraftKind;
  status: SfiDraftStatus;
  channel: SfiChannel;
  customerId: string | null;
  customerName: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  jobId: string | null;
  maintenancePlanId: string | null;
  subject: string;
  body: string;
  scheduledFollowUpAt: string | null;
  customerResponseStatus: SfiCustomerResponseStatus;
  objectionCategory: SfiObjectionCategory | null;
  /** Invariant: always false — never auto-send external customer communications. */
  autoSend: false;
  createdAt: string;
  decidedAt: string | null;
};

export type SfiAuraConnection = {
  target: string;
  label: string;
  href: string;
  note: string;
};

export type SfiDashboard = {
  summary: string;
  policy: {
    autoSendEnabled: false;
    requiresOwnerApproval: true;
    technicianClientDenied: true;
    fakeCampaignsInvented: false;
    extendsSalesIntelligenceAgent: true;
  };
  productClarification: {
    salesIntelligenceAgent: string;
    thisLayer: string;
  };
  quoteFollowUps: {
    availability: SfiAvailability;
    openQuoteCount: number;
    reminderDueCount: number;
    awaitingResponseCount: number;
    items: SfiQuoteFollowUpItem[];
    note: string;
  };
  objections: {
    availability: SfiAvailability;
    signalCount: number;
    signals: SfiObjectionSignal[];
    note: string;
  };
  reactivation: {
    availability: SfiAvailability;
    opportunityCount: number;
    opportunities: SfiReactivationOpportunity[];
    note: string;
  };
  drafts: SfiOutreachDraftSummary[];
  pendingApprovalCount: number;
  settings: SfiSettings;
  auraConnections: SfiAuraConnection[];
};

// ─── Requests ─────────────────────────────────────────────────────────────────

export type CreateSfiDraftRequest = {
  kind: SfiDraftKind;
  customerId?: string;
  quoteId?: string;
  jobId?: string;
  maintenancePlanId?: string;
  channel?: SfiChannel;
  subject?: string;
  body?: string;
  scheduledFollowUpAt?: string;
  objectionCategory?: SfiObjectionCategory;
  submitForApproval?: boolean;
};

export type DecideSfiDraftRequest = {
  decision: 'approve' | 'reject' | 'cancel';
  notes?: string;
};

export type ScheduleSfiQuoteFollowUpRequest = {
  quoteId: string;
  scheduledFollowUpAt: string;
  notes?: string;
};

export type SfiRecordableResponseStatus = 'awaiting' | 'responded' | 'no_response';

export type RecordSfiQuoteResponseRequest = {
  quoteId: string;
  responseStatus: SfiRecordableResponseStatus;
  respondedAt?: string;
  notes?: string;
};

export type GenerateSfiQuoteReminderDraftsRequest = {
  limit?: number;
};

export type GenerateSfiObjectionDraftsRequest = {
  limit?: number;
};

export type GenerateSfiReactivationDraftsRequest = {
  limit?: number;
};
