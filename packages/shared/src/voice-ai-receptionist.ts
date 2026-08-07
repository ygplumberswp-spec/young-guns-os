/**
 * Voice AI Receptionist Foundation (Department 9.1)
 *
 * Extends existing `/voice` + enterprise voice reception foundations —
 * does not rebuild CRM, telephony providers, or invent call traffic.
 *
 * Invariants:
 * - No fake calls/customers/leads
 * - Honest `not_configured` without telephony credentials
 * - Human takeover always available; no hidden actions
 * - Lead create / booking execute require Owner approval where sensitive
 * - Live TTS/STT provider status is honest (foundation config only until connected)
 */

export const VOICE_AI_RECEPTIONIST_KEY = 'voice-ai-receptionist' as const;

export type VairAvailability = 'available' | 'partial' | 'unavailable' | 'not_configured';
export type VairTelephonyStatus = 'not_configured' | 'configured' | 'degraded';
export type VairTtsSttStatus = 'not_configured' | 'configured' | 'partial';
export type VairCallSessionStatus =
  | 'ringing' | 'active' | 'human_takeover' | 'completed' | 'missed' | 'failed' | 'abandoned';
export type VairRoutingDestination =
  | 'ai_receptionist' | 'human_queue' | 'extension' | 'voicemail' | 'callback';
export type VairApprovalKind = 'lead_create' | 'booking_draft' | 'routing_change' | 'other';
export type VairApprovalStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled' | 'executed';
export type VairTakeoverReason =
  | 'caller_request' | 'low_confidence' | 'emergency' | 'operator_initiated' | 'policy';
export type VairSaLocale = 'en-ZA' | 'af-ZA' | 'zu-ZA' | 'xh-ZA' | 'other';

export type VairProviderSnapshot = {
  telephonyStatus: VairTelephonyStatus;
  ttsStatus: VairTtsSttStatus;
  sttStatus: VairTtsSttStatus;
  providerKey: string | null;
  rationale: string;
  liveCallsEnabled: false | true;
};

export type VairCallerIdentification = {
  callerPhone: string | null;
  callerName: string | null;
  normalizedPhone: string | null;
  matchConfidence: 'exact' | 'partial' | 'none' | 'unavailable';
  customerId: string | null;
  customerName: string | null;
  rationale: string;
};

export type VairCustomerLookupResult = {
  availability: VairAvailability;
  matches: Array<{
    customerId: string;
    customerName: string;
    phone: string | null;
    email: string | null;
    status: string;
  }>;
  rationale: string;
  customer360: false;
};

export type VairCallSessionSummary = {
  id: string;
  status: VairCallSessionStatus;
  direction: 'inbound' | 'outbound';
  callerPhone: string | null;
  callerName: string | null;
  customerId: string | null;
  customerName: string | null;
  voiceSessionId: string | null;
  routingDestination: VairRoutingDestination | null;
  humanTakeoverActive: boolean;
  summary: string | null;
  startedAt: string;
  endedAt: string | null;
  invented: false;
};

export type VairRoutingRuleSummary = {
  id: string;
  ruleKey: string;
  name: string;
  priority: number;
  destination: VairRoutingDestination;
  matchCriteria: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

export type VairApprovalDraftSummary = {
  id: string;
  kind: VairApprovalKind;
  status: VairApprovalStatus;
  title: string;
  body: string;
  callSessionId: string | null;
  customerId: string | null;
  leadId: string | null;
  jobId: string | null;
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
};

export type VairTakeoverEventSummary = {
  id: string;
  callSessionId: string;
  reason: VairTakeoverReason;
  notes: string | null;
  takenOverByUserId: string | null;
  takenOverAt: string;
  releasedAt: string | null;
};

export type VairSettings = {
  id: string;
  receptionistEnabled: boolean;
  humanTakeoverAlwaysAvailable: true;
  leadCreateRequiresApproval: boolean;
  bookingExecuteRequiresApproval: boolean;
  defaultLocale: VairSaLocale;
  preferredVoiceLabel: string | null;
  welcomeMessage: string | null;
  afterHoursMessage: string | null;
  telephonyProviderKey: string | null;
  ttsProviderKey: string | null;
  sttProviderKey: string | null;
  notes: string | null;
  updatedAt: string;
};

export type VairConnection = {
  target:
    | 'voice' | 'enterprise_voice_reception' | 'crm' | 'leads' | 'jobs'
    | 'scheduling' | 'customer_360' | 'command_centre';
  label: string;
  href: string;
  status: 'available_link' | 'unavailable' | 'registry_stub';
  availability: VairAvailability;
  note: string;
};

export type VairOwnerDashboard = {
  summary: string;
  productClarification: {
    voiceFoundation: string;
    enterpriseVoiceReception: string;
    thisLayer: string;
    customer360: string;
  };
  policy: {
    fakeCalls: false;
    fakeCustomers: false;
    fakeLeads: false;
    humanTakeoverAlwaysAvailable: true;
    hiddenActions: false;
    leadCreateRequiresApproval: boolean;
    bookingExecuteRequiresApproval: boolean;
    ownerControlled: true;
  };
  provider: VairProviderSnapshot;
  saVoice: {
    defaultLocale: VairSaLocale;
    preferredVoiceLabel: string | null;
    ttsStatus: VairTtsSttStatus;
    sttStatus: VairTtsSttStatus;
    rationale: string;
  };
  callStats: {
    totalSessions: number;
    activeSessions: number;
    humanTakeoverCount: number;
    completedSessions: number;
    availability: VairAvailability;
    rationale: string;
  };
  pendingApprovals: number;
  callSessions: VairCallSessionSummary[];
  routingRules: VairRoutingRuleSummary[];
  approvalQueue: VairApprovalDraftSummary[];
  takeoverEvents: VairTakeoverEventSummary[];
  connections: VairConnection[];
  settings: VairSettings;
};

export type RecordVairIncomingCallRequest = {
  callerPhone?: string;
  callerName?: string;
  voiceSessionId?: string;
  summary?: string;
  identifyCaller?: boolean;
};

export type LookupVairCustomerRequest = {
  phone?: string;
  email?: string;
  name?: string;
  limit?: number;
};

export type CreateVairLeadDraftRequest = {
  callSessionId?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  serviceType?: string;
  notes?: string;
  submitForApproval?: boolean;
};

export type CreateVairBookingDraftRequest = {
  callSessionId?: string;
  customerId?: string;
  preferredAt?: string;
  serviceType?: string;
  notes?: string;
  submitForApproval?: boolean;
};

export type DecideVairApprovalRequest = {
  decision: 'approve' | 'reject' | 'cancel';
  notes?: string;
  execute?: boolean;
};

export type RequestVairTakeoverRequest = {
  callSessionId: string;
  reason?: VairTakeoverReason;
  notes?: string;
};

export type ReleaseVairTakeoverRequest = {
  callSessionId: string;
  notes?: string;
};

export type UpsertVairRoutingRuleRequest = {
  ruleKey: string;
  name: string;
  priority?: number;
  destination: VairRoutingDestination;
  matchCriteria?: Record<string, unknown>;
  enabled?: boolean;
};

export type UpdateVairSettingsRequest = {
  receptionistEnabled?: boolean;
  leadCreateRequiresApproval?: boolean;
  bookingExecuteRequiresApproval?: boolean;
  defaultLocale?: VairSaLocale;
  preferredVoiceLabel?: string | null;
  welcomeMessage?: string | null;
  afterHoursMessage?: string | null;
  telephonyProviderKey?: string | null;
  ttsProviderKey?: string | null;
  sttProviderKey?: string | null;
  notes?: string | null;
};

export type CompleteVairCallSessionRequest = {
  status?: 'completed' | 'missed' | 'failed' | 'abandoned';
  summary?: string;
};

function isOwnerOrAdminRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

export function canAccessVoiceAiReceptionist(identity: {
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

export function canWriteVoiceAiReceptionist(identity: {
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

export function canApproveVairDrafts(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerOrAdminRole(role);
}

export function canManageVairSettings(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canApproveVairDrafts(identity);
}

export const VAIR_PRODUCT_COPY = {
  voiceFoundation:
    'Core voice sessions, conversations, and follow-ups remain under /voice — this layer does not replace VoiceService.',
  enterpriseVoiceReception:
    'Enterprise Voice Reception at /voice-reception governs platform routing, queues, and AI receptionist policy — this foundation links those configs when present.',
  thisLayer:
    'Voice AI Receptionist Foundation supports incoming call handling, caller identification, CRM lookup, approval-gated lead drafts, routing, SA locale/voice config, and always-on human takeover. No fake calls. Live telephony/TTS/STT stay not_configured until credentials connect.',
  customer360:
    'Customer 360 is not a dedicated module yet — lookup uses real CRM customers by phone/email/name only.',
} as const;

export function defaultVairSettings(partial?: Partial<VairSettings> & { id: string }): VairSettings {
  return {
    id: partial?.id ?? 'pending',
    receptionistEnabled: partial?.receptionistEnabled ?? true,
    humanTakeoverAlwaysAvailable: true,
    leadCreateRequiresApproval: partial?.leadCreateRequiresApproval ?? true,
    bookingExecuteRequiresApproval: partial?.bookingExecuteRequiresApproval ?? true,
    defaultLocale: partial?.defaultLocale ?? 'en-ZA',
    preferredVoiceLabel: partial?.preferredVoiceLabel ?? null,
    welcomeMessage: partial?.welcomeMessage ?? null,
    afterHoursMessage: partial?.afterHoursMessage ?? null,
    telephonyProviderKey: partial?.telephonyProviderKey ?? null,
    ttsProviderKey: partial?.ttsProviderKey ?? null,
    sttProviderKey: partial?.sttProviderKey ?? null,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('27') && digits.length >= 11) return digits;
  if (digits.startsWith('0') && digits.length >= 10) return `27${digits.slice(1)}`;
  return digits;
}

export function buildVairProviderSnapshot(input: {
  telephonyProviderKey: string | null;
  ttsProviderKey: string | null;
  sttProviderKey: string | null;
  enterpriseTelephonyConfigured?: boolean;
}): VairProviderSnapshot {
  const telephonyConfigured = Boolean(
    input.telephonyProviderKey?.trim() || input.enterpriseTelephonyConfigured,
  );
  const ttsConfigured = Boolean(input.ttsProviderKey?.trim());
  const sttConfigured = Boolean(input.sttProviderKey?.trim());
  const telephonyStatus: VairTelephonyStatus = telephonyConfigured ? 'configured' : 'not_configured';
  const ttsStatus: VairTtsSttStatus = ttsConfigured ? 'configured' : 'not_configured';
  const sttStatus: VairTtsSttStatus = sttConfigured ? 'configured' : 'not_configured';
  const liveCallsEnabled = telephonyConfigured && ttsConfigured && sttConfigured;

  let rationale: string;
  if (!telephonyConfigured && !ttsConfigured && !sttConfigured) {
    rationale =
      'Telephony, TTS, and STT providers are not_configured — no live AI receptionist media path. Foundation stores real call session records only when a provider connects. No fake calls.';
  } else if (!telephonyConfigured) {
    rationale =
      'TTS/STT keys may be set, but telephony remains not_configured — inbound live calls unavailable until a telephony provider credential is connected.';
  } else if (!ttsConfigured || !sttConfigured) {
    rationale =
      'Telephony key present but TTS/STT incomplete — live AI voice path stays partial/not_configured for missing speech providers. Human takeover remains available.';
  } else {
    rationale =
      'Provider keys recorded for telephony + TTS + STT. Live media still depends on real provider webhooks — this foundation does not invent call traffic.';
  }

  return {
    telephonyStatus,
    ttsStatus,
    sttStatus,
    providerKey: input.telephonyProviderKey,
    rationale,
    liveCallsEnabled: liveCallsEnabled ? true : false,
  };
}

export function buildVairCallStats(input: {
  totalSessions: number;
  activeSessions: number;
  humanTakeoverCount: number;
  completedSessions: number;
}): VairOwnerDashboard['callStats'] {
  if (input.totalSessions <= 0) {
    return {
      totalSessions: 0,
      activeSessions: 0,
      humanTakeoverCount: 0,
      completedSessions: 0,
      availability: 'unavailable',
      rationale:
        'No real Voice AI call session rows yet — stats unavailable (not invented). Sessions appear when providers connect or operators record inbound handling.',
    };
  }
  return {
    totalSessions: input.totalSessions,
    activeSessions: input.activeSessions,
    humanTakeoverCount: input.humanTakeoverCount,
    completedSessions: input.completedSessions,
    availability: 'available',
    rationale: `Derived from ${input.totalSessions} real call session record(s). No fake calls.`,
  };
}

export function buildVairLeadDraft(input: {
  contactName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  serviceType?: string | null;
  notes?: string | null;
}): { kind: 'lead_create'; title: string; body: string } {
  return {
    kind: 'lead_create',
    title: `Lead draft — ${input.contactName}`.slice(0, 200),
    body: [
      `Contact: ${input.contactName}`,
      input.contactPhone ? `Phone: ${input.contactPhone}` : 'Phone: (not provided)',
      input.contactEmail ? `Email: ${input.contactEmail}` : 'Email: (not provided)',
      input.serviceType ? `Service: ${input.serviceType}` : 'Service: (not specified)',
      '',
      input.notes?.trim() || 'Notes: (none)',
      '',
      'Approval-gated CRM lead create — not auto-executed.',
      'Owner approval required before any lead record is written.',
    ].join('\n'),
  };
}

export function buildVairBookingDraft(input: {
  customerId?: string | null;
  preferredAt?: string | null;
  serviceType?: string | null;
  notes?: string | null;
}): { kind: 'booking_draft'; title: string; body: string } {
  return {
    kind: 'booking_draft',
    title: `Booking draft — ${input.serviceType?.trim() || 'service request'}`.slice(0, 200),
    body: [
      input.customerId ? `Customer ID: ${input.customerId}` : 'Customer: (unlinked)',
      input.preferredAt ? `Preferred time: ${input.preferredAt}` : 'Preferred time: (not set)',
      input.serviceType ? `Service: ${input.serviceType}` : 'Service: (not specified)',
      '',
      input.notes?.trim() || 'Notes: (none)',
      '',
      'Draft booking only — scheduling is never auto-executed from Voice AI.',
      'Owner approval records intent; operators complete booking under Scheduling/Jobs.',
    ].join('\n'),
  };
}

export function listVairConnections(): VairConnection[] {
  return [
    { target: 'voice', label: 'Voice sessions', href: '/voice', status: 'available_link', availability: 'available', note: 'Core voice session lifecycle and follow-ups.' },
    { target: 'enterprise_voice_reception', label: 'Enterprise Voice Reception', href: '/voice-reception', status: 'available_link', availability: 'available', note: 'Platform routing, queues, and AI receptionist policy.' },
    { target: 'crm', label: 'CRM customers', href: '/crm', status: 'available_link', availability: 'available', note: 'Caller identification and customer lookup use real CRM rows.' },
    { target: 'leads', label: 'Leads', href: '/leads', status: 'available_link', availability: 'available', note: 'Lead create from voice is approval-gated — never auto-written.' },
    { target: 'jobs', label: 'Jobs', href: '/jobs', status: 'available_link', availability: 'available', note: 'Job context lookup for identified customers; no auto job create.' },
    { target: 'scheduling', label: 'Scheduling', href: '/scheduling', status: 'available_link', availability: 'partial', note: 'Booking drafts only — never auto-schedule without Owner approval path.' },
    { target: 'customer_360', label: 'Customer 360', href: '/customer-engagement-intelligence', status: 'unavailable', availability: 'unavailable', note: 'Customer 360 module not built — engagement/CRM lookup only.' },
    { target: 'command_centre', label: 'AURA Command Centre', href: '/aura/command-centre', status: 'available_link', availability: 'available', note: 'Owner command surface for agent coordination.' },
  ];
}
