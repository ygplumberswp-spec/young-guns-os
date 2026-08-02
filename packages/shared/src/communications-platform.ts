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
  syncEnabled?: boolean;
  retentionDays?: number;
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
