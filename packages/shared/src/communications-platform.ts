/**
 * TITAN Communications Platform V1 — shared types.
 * Business Gmail + Business WhatsApp + optional Personal WhatsApp (owner-only).
 * Personal is private by default and never auto-imported into business indexes.
 */

export type CommPlatformChannel = 'email' | 'whatsapp';

export type CommPlatformAccountKind =
  | 'business_gmail'
  | 'business_whatsapp'
  | 'personal_whatsapp';

export const COMM_PLATFORM_ACCOUNT_KINDS: CommPlatformAccountKind[] = [
  'business_gmail',
  'business_whatsapp',
  'personal_whatsapp',
];

export const COMM_PLATFORM_BUSINESS_ACCOUNT_KINDS: CommPlatformAccountKind[] = [
  'business_gmail',
  'business_whatsapp',
];

export type CommPlatformLinkTargetType =
  | 'customer'
  | 'lead'
  | 'job'
  | 'quote'
  | 'invoice'
  | 'property'
  | 'supplier'
  | 'staff';

export type CommPlatformCapabilityState =
  | 'not_configured'
  | 'disconnected'
  | 'pending'
  | 'connected'
  | 'error'
  | 'degraded';

export type CommPlatformInboxFolder =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'labels'
  | 'all'
  | 'chats';

export type CommPlatformParticipantKind =
  | 'customer'
  | 'supplier'
  | 'staff'
  | 'unknown';

export type CommPlatformImportDecisionAction =
  | 'import'
  | 'import_from'
  | 'create_customer'
  | 'link'
  | 'keep_private';

export type CommPlatformMessageDirection = 'inbound' | 'outbound' | 'internal';

export type CommPlatformDraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

/** Explicit office actions — never auto-create; staff opens create forms with prefill. */
export type CommPlatformOfficeAction = {
  kind: 'create_lead' | 'create_job' | 'open_customer' | 'open_whatsapp_settings';
  href: string;
  label: string;
  enabled: boolean;
  /** Honest note — readiness only; never implies silent import. */
  note: string;
};

export type CommPlatformInboxItemSummary = {
  id: string;
  accountKind: CommPlatformAccountKind;
  channel: CommPlatformChannel;
  /** Personal items are only returned on owner-only endpoints — never business search. */
  isPersonal: boolean;
  isBusinessIndexed: boolean;
  subject: string | null;
  preview: string | null;
  participantLabel: string | null;
  participantKind: CommPlatformParticipantKind;
  folder: CommPlatformInboxFolder;
  unread: boolean;
  urgent: boolean;
  direction: CommPlatformMessageDirection;
  linkTargetType: CommPlatformLinkTargetType | null;
  linkTargetId: string | null;
  occurredAt: string;
  attachmentCount: number;
  labels: string[];
  capabilityState: CommPlatformCapabilityState;
  /** Normalized contact phone when known (Business WhatsApp). */
  contactPhone?: string | null;
  /** Lead/job creation readiness affordances — never auto-executed. */
  officeActions?: CommPlatformOfficeAction[];
};

export type CommPlatformConnectionHealth = {
  accountKind: CommPlatformAccountKind;
  label: string;
  status: CommPlatformCapabilityState;
  connected: boolean;
  hasCredentials: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  lastError: string | null;
  privacyDefault: 'private' | 'business';
  syncEnabled: boolean;
  retentionDays: number | null;
  /** Honest empty-state copy when not connected. */
  emptyStateMessage: string;
  /** Google OAuth client id/secret present on the API host. */
  oauthConfigured?: boolean;
  /** Connected Workspace / Gmail address when known. */
  emailAddress?: string | null;
  /** Last successful provider sync (ISO). */
  lastSyncAt?: string | null;
  /** Last sync outcome for honest UI. */
  lastSyncStatus?: string | null;
  /** Sanitized last sync failure message (never secrets/tokens). */
  lastSyncError?: string | null;
  /** Display phone for Business WhatsApp when known. */
  displayPhoneNumber?: string | null;
  /** Runtime feature gate honesty (Business WhatsApp). */
  featureEnabled?: boolean;
  webhooksEnabled?: boolean;
  outboundMessagesEnabled?: boolean;
  runtimeNote?: string | null;
};

export type CommPlatformSettingsSummary = {
  businessGmail: CommPlatformConnectionHealth;
  businessWhatsapp: CommPlatformConnectionHealth;
  personalWhatsapp: CommPlatformConnectionHealth | null;
  privacy: {
    personalPrivateByDefault: boolean;
    personalNeverInBusinessSearch: boolean;
    personalNeverAutoImport: boolean;
    requireApprovalToSend: boolean;
  };
  healthSummary: string;
};

export type CommPlatformInboxFilter = {
  channel?: CommPlatformChannel | 'all';
  accountKind?: CommPlatformAccountKind | 'business' | 'personal' | 'all';
  unread?: boolean;
  urgent?: boolean;
  participantKind?: CommPlatformParticipantKind | 'all';
  folder?: CommPlatformInboxFolder;
  q?: string;
  linkTargetType?: CommPlatformLinkTargetType;
  linkTargetId?: string;
  /** Include personal assistant threads — Platform Owner only; ignored/denied otherwise. */
  includePersonal?: boolean;
  limit?: number;
  offset?: number;
};

export type CommPlatformInboxResult = {
  items: CommPlatformInboxItemSummary[];
  total: number;
  filtersApplied: CommPlatformInboxFilter;
  /** Always false for business search endpoints. */
  includesPersonal: boolean;
  emptyReason: 'none' | 'not_configured' | 'no_matches' | 'role_filtered';
  capabilityNotes: string[];
};

export type CommPlatformSearchResult = {
  items: CommPlatformInboxItemSummary[];
  total: number;
  query: string;
  /** Personal threads are never included. */
  businessOnly: true;
  emptyReason: 'none' | 'not_configured' | 'no_matches' | 'empty_query';
};

export type CommPlatformGmailMailboxView = {
  folder: CommPlatformInboxFolder;
  capabilityState: CommPlatformCapabilityState;
  items: CommPlatformInboxItemSummary[];
  labels: string[];
  note: string;
};

export type CommPlatformGmailDraftRequest = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  replyToMessageId?: string;
  forwardOfMessageId?: string;
  labelIds?: string[];
};

export type CommPlatformGmailDraftSummary = {
  id: string;
  status: CommPlatformDraftStatus;
  subject: string;
  to: string[];
  createdAt: string;
  requiresApproval: true;
  note: string;
};

export type CommPlatformWhatsappChatSummary = {
  id: string;
  accountKind: 'business_whatsapp' | 'personal_whatsapp';
  contactPhone: string | null;
  contactName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: boolean;
  attachmentCount: number;
  linkTargetType: CommPlatformLinkTargetType | null;
  linkTargetId: string | null;
  isPersonal: boolean;
};

export type CommPlatformLinkRequest = {
  linkTargetType: CommPlatformLinkTargetType;
  linkTargetId: string;
};

export type CommPlatformSmartDetectionPrompt = {
  id: string;
  contactPhone: string | null;
  contactName: string | null;
  suggestedClassification: string;
  confidence: number;
  options: CommPlatformImportDecisionAction[];
  defaultAction: 'keep_private';
  autoImport: false;
  createdAt: string;
};

export type CommPlatformImportDecisionRequest = {
  promptId?: string;
  contactPhone?: string;
  contactName?: string;
  action: CommPlatformImportDecisionAction;
  linkTargetType?: CommPlatformLinkTargetType;
  linkTargetId?: string;
  notes?: string;
  /** ISO date — only import messages from this point when action is import_from. */
  importFromAt?: string;
};

export type CommPlatformImportDecisionSummary = {
  id: string;
  action: CommPlatformImportDecisionAction;
  contactPhone: string | null;
  contactName: string | null;
  decidedAt: string;
  decidedByUserId: string;
  imported: false;
  note: string;
};

export type CommPlatformAuraCapability =
  | 'business_summarize'
  | 'business_draft'
  | 'business_emergency'
  | 'business_job_suggest'
  | 'personal_assist';

export type CommPlatformAuraHookSummary = {
  capability: CommPlatformAuraCapability;
  available: boolean;
  ownerOnly: boolean;
  exposesPersonalData: boolean;
  status: 'ready' | 'stub' | 'not_configured' | 'forbidden';
  note: string;
};

export type CommPlatformHubDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  settings: CommPlatformSettingsSummary;
  inbox: CommPlatformInboxResult;
  auraHooks: CommPlatformAuraHookSummary[];
  /** Explicit: outbound send always requires approval — never auto-send. */
  sendPolicy: {
    autoSendEnabled: false;
    requiresOwnerOrStaffApproval: true;
    draftApproveExecute: true;
  };
};

export type SaveCommPlatformGmailConnectionRequest = {
  emailAddress?: string;
  /** OAuth refresh token / access token blob — encrypted at rest. */
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  syncEnabled?: boolean;
  retentionDays?: number;
};

export type CommPlatformGmailOAuthStartResult = {
  authorizationUrl: string;
  oauthConfigured: true;
};

export type CommPlatformGmailOAuthStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  status: CommPlatformCapabilityState;
  emailAddress: string | null;
  redirectUri: string | null;
  scopes: string[];
  emptyStateMessage: string;
};

/** Durable Gmail sync lifecycle stored on account metadata (`lastSyncStatus`). */
export type CommPlatformGmailSyncLifecycle =
  | 'idle'
  | 'syncing'
  | 'completed'
  | 'failed';

export type CommPlatformGmailSyncResult = {
  /** Counts are 0 while sync is still running in the background. */
  synced: number;
  skipped: number;
  labels: string[];
  capabilityState: CommPlatformCapabilityState;
  /**
   * Immediate Sync Now responses use `syncing` (HTTP 202).
   * Final outcomes are observed via settings polling (`completed` / `failed`).
   */
  syncStatus: 'syncing' | 'completed' | 'failed';
  /** Prior/last completed sync time; null until a sync has finished successfully. */
  lastSyncAt: string | null;
  note: string;
};

export type CommPlatformGmailAttachmentMeta = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  messageId: string;
};

export type CommPlatformAuraDraftAssistResult = {
  mode: 'summarize' | 'draft_reply';
  status: 'ready' | 'not_configured' | 'stub';
  summary?: string;
  draft?: CommPlatformGmailDraftSummary;
  note: string;
  /** Always false — AURA never auto-sends. */
  autoSend: false;
};

export type SaveCommPlatformPersonalWhatsappRequest = {
  label?: string;
  phoneNumber?: string;
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  syncEnabled?: boolean;
  /** Always private by default; owner may opt into prompts but never auto-import. */
  privateByDefault?: boolean;
};

export type CommPlatformTestConnectionResult = {
  ok: boolean;
  accountKind: CommPlatformAccountKind;
  status: CommPlatformCapabilityState;
  message: string;
  testedAt: string;
};

/** RBAC helpers — pure, testable without DB. */
export function isBusinessAccountKind(kind: CommPlatformAccountKind): boolean {
  return kind === 'business_gmail' || kind === 'business_whatsapp';
}

export function isPersonalAccountKind(kind: CommPlatformAccountKind): boolean {
  return kind === 'personal_whatsapp';
}

export function personalAllowedInBusinessSearch(_kind: CommPlatformAccountKind): false {
  return false;
}

export function canAccessPersonalWhatsappAssistant(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  // Personal WhatsApp Assistant is Platform Owner only — wildcards on other roles never grant it.
  return identity.roleName === 'Platform Owner';
}

/**
 * Business Gmail Connect / Disconnect / Reconnect — Platform Owner and Company Owner only.
 * Admin, Office Staff, Technician, Client remain restricted. Wildcards on other roles do not grant it.
 * Personal WhatsApp stays Platform Owner only (see canAccessPersonalWhatsappAssistant).
 */
export function canConnectBusinessGmail(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return (
    identity.roleName === 'Platform Owner' ||
    identity.roleName === 'Company Owner' ||
    identity.roleName === 'Owner'
  );
}

/**
 * Business Gmail Sync Now — Owners and Admin (and staff with write/manage) may sync.
 * Technician and Client never sync. Connect remains Owner-only (see canConnectBusinessGmail).
 */
export function canSyncBusinessGmail(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (
    identity.roleName === 'Platform Owner' ||
    identity.roleName === 'Company Owner' ||
    identity.roleName === 'Owner' ||
    identity.roleName === 'Admin'
  ) {
    return true;
  }
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('communications:write') ||
    identity.permissions.includes('communications:manage') ||
    identity.permissions.includes('integrations:manage')
  );
}

/** Normalize stored metadata sync status into a lifecycle value. */
export function normalizeGmailSyncLifecycle(
  lastSyncStatus: string | null | undefined,
): CommPlatformGmailSyncLifecycle {
  if (lastSyncStatus === 'syncing') return 'syncing';
  if (lastSyncStatus === 'completed' || lastSyncStatus === 'ok') return 'completed';
  if (lastSyncStatus === 'failed' || lastSyncStatus === 'error') return 'failed';
  return 'idle';
}

/**
 * User-facing Gmail sync status when the mailbox is connected:
 * Connected (idle / never synced) · Syncing · Completed · Failed.
 */
export function formatGmailSyncUserStatus(input: {
  connected: boolean;
  lastSyncStatus?: string | null;
}): string {
  if (!input.connected) return 'Disconnected';
  switch (normalizeGmailSyncLifecycle(input.lastSyncStatus)) {
    case 'syncing':
      return 'Syncing';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Connected';
  }
}

/** User-facing labels for capability status (internal enum values stay unchanged for APIs). */
export function formatCommPlatformCapabilityState(
  status: CommPlatformCapabilityState,
): string {
  switch (status) {
    case 'not_configured':
      return 'Not Configured';
    case 'disconnected':
      return 'Disconnected';
    case 'pending':
      return 'Pending';
    case 'connected':
      return 'Connected';
    case 'error':
      return 'Error';
    case 'degraded':
      return 'Degraded';
    default:
      return status;
  }
}

/**
 * Honest Business Gmail status for UI:
 * - OAuth app missing → Not Configured
 * - OAuth app ready but tenant not connected → Disconnected (never "Not Configured")
 */
export function formatBusinessGmailUserStatus(input: {
  oauthConfigured: boolean;
  status: CommPlatformCapabilityState;
}): string {
  if (!input.oauthConfigured) return 'Not Configured';
  if (input.status === 'not_configured') return 'Disconnected';
  return formatCommPlatformCapabilityState(input.status);
}

/**
 * Honest Business WhatsApp status for normal users (no env-flag debug text).
 * Connected / Error / Not Configured / Disconnected — plus Disabled when feature gated.
 */
export function formatBusinessWhatsappUserStatus(input: {
  status: CommPlatformCapabilityState;
  connected: boolean;
  hasCredentials: boolean;
  featureEnabled?: boolean;
}): string {
  if (input.featureEnabled === false) return 'Disabled';
  if (input.status === 'error') return 'Error';
  if (input.status === 'connected' || input.connected) return 'Connected';
  if (input.status === 'pending') return 'Pending';
  if (input.status === 'degraded') return 'Attention needed';
  if (input.hasCredentials || input.status === 'disconnected') return 'Disconnected';
  return 'Not Configured';
}

/** Light inbound priority signal — never invents urgency without message cues. */
export function detectWhatsappInboundUrgency(preview: string | null | undefined): boolean {
  const text = (preview ?? '').toLowerCase();
  if (!text.trim()) return false;
  return /\b(urgent|emergency|asap|flood|gas\s*leak|no\s*hot\s*water|burst|critical)\b/.test(
    text,
  );
}

/**
 * Build lead/job creation readiness links for a Business WhatsApp conversation.
 * Opens create forms with prefill — never auto-creates CRM records.
 */
export function buildBusinessWhatsappOfficeActions(input: {
  contactPhone: string | null;
  contactName: string | null;
  customerId: string | null;
  preview: string | null;
  inboxItemId?: string | null;
}): CommPlatformOfficeAction[] {
  const phone = input.contactPhone?.replace(/\D/g, '') || '';
  const name = (input.contactName ?? '').trim();
  const params = new URLSearchParams();
  if (phone) params.set('phone', phone.startsWith('27') ? `+${phone}` : phone);
  if (name) params.set('name', name);
  params.set('source', 'whatsapp');
  if (input.preview?.trim()) {
    params.set('description', input.preview.trim().slice(0, 280));
  }
  if (input.inboxItemId) params.set('commsInboxId', input.inboxItemId);

  const actions: CommPlatformOfficeAction[] = [];

  if (input.customerId) {
    actions.push({
      kind: 'open_customer',
      href: `/crm/customers/${input.customerId}`,
      label: 'Open customer',
      enabled: true,
      note: 'Conversation matched an existing customer.',
    });
    actions.push({
      kind: 'create_job',
      href: `/jobs/new?customerId=${encodeURIComponent(input.customerId)}`,
      label: 'Create job',
      enabled: true,
      note: 'Opens job create with this customer — you confirm before saving.',
    });
  } else {
    actions.push({
      kind: 'create_lead',
      href: `/leads/new?${params.toString()}`,
      label: 'Create lead',
      enabled: Boolean(phone || name),
      note: phone || name
        ? 'Opens lead create with phone/name prefilled — nothing is saved until you submit.'
        : 'Add a phone or name before creating a lead from this conversation.',
    });
    actions.push({
      kind: 'create_job',
      href: '/jobs/new',
      label: 'Create job',
      enabled: false,
      note: 'Link or match a customer first — jobs require an existing customer.',
    });
  }

  return actions;
}

export function canAccessBusinessCommunications(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('communications:read') ||
    identity.permissions.includes('communications:write') ||
    identity.permissions.includes('communications:manage') ||
    identity.permissions.includes('communications_intelligence:read') ||
    identity.permissions.includes('integrations:read')
  );
}

export function technicianJobScopedOnly(identity: { roleName: string }): boolean {
  return identity.roleName === 'Technician';
}
