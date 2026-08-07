/**
 * TITAN Communication Department — Email Centre & Communication Timeline contracts.
 *
 * Email source: Communications Platform Gmail index (not a parallel inbox).
 * Outbound compose: existing Gmail draft → approve → execute path.
 * Transactional send provider remains Resend (unchanged).
 * WhatsApp Business remains the WA channel source.
 */

import type {
  CommPlatformDraftStatus,
  CommPlatformGmailDraftRequest,
  CommPlatformInboxFilter,
  CommPlatformInboxItemSummary,
  CommPlatformLinkTargetType,
} from './communications-platform.js';
import type { UcProviderChannel, UcTimelineEntrySummary } from './enterprise-unified-communications.js';

export type CommAttachmentKind =
  | 'quote'
  | 'boq'
  | 'invoice'
  | 'receipt'
  | 'coc'
  | 'report'
  | 'job_photo'
  | 'document';

export const COMM_ATTACHMENT_KINDS: CommAttachmentKind[] = [
  'quote',
  'boq',
  'invoice',
  'receipt',
  'coc',
  'report',
  'job_photo',
  'document',
];

export type CommAttachmentAnchorType =
  | 'inbox_item'
  | 'gmail_draft'
  | 'timeline_entry'
  | 'timeline_note'
  | 'whatsapp_message'
  | 'communication';

export type EmailCentreMailboxFilter = CommPlatformInboxFilter & {
  /** Email Centre defaults to Gmail/business email channel. */
  channel?: 'email' | 'all';
};

export type EmailCentreMessageSummary = CommPlatformInboxItemSummary & {
  externalThreadId?: string | null;
  externalMessageId?: string | null;
  gmailAttachments?: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
};

export type EmailCentreThreadMessage = {
  id: string;
  subject: string | null;
  preview: string | null;
  direction: string;
  participantLabel: string | null;
  occurredAt: string;
  folder: string;
  unread: boolean;
  attachmentCount: number;
  linkTargetType: CommPlatformLinkTargetType | null;
  linkTargetId: string | null;
  externalMessageId: string | null;
};

export type EmailCentreThreadHistory = {
  threadId: string | null;
  messages: EmailCentreThreadMessage[];
  linkedCustomerId: string | null;
  linkedJobId: string | null;
  attachmentLinks: CommAttachmentLinkSummary[];
  composePath: 'gmail_draft_approve_execute';
  composeNote: string;
};

export type EmailCentreAttachmentRef = Omit<
  CreateCommAttachmentLinkRequest,
  'anchorType' | 'anchorId'
>;

export type EmailCentreReplyRequest = CommPlatformGmailDraftRequest & {
  /** Inbox index row being replied to / forwarded. */
  inboxItemId?: string;
  /** Linked after draft create — anchors to the new gmail_draft id. */
  attachmentLinks?: EmailCentreAttachmentRef[];
};

export type EmailCentreDraftSummary = {
  id: string;
  status: CommPlatformDraftStatus;
  subject: string;
  to: string[];
  createdAt: string;
  requiresApproval: true;
  note: string;
  attachmentLinks: CommAttachmentLinkSummary[];
  /** Honest: send uses Gmail API after approve→execute; Resend stays transactional-only. */
  sendProvider: 'gmail_api';
};

export type CreateCommAttachmentLinkRequest = {
  anchorType: CommAttachmentAnchorType;
  anchorId: string;
  attachmentKind: CommAttachmentKind;
  entityType: string;
  entityId: string;
  documentId?: string;
  customerId?: string;
  jobId?: string;
  label: string;
  fileName?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
};

export type CommAttachmentLinkSummary = {
  id: string;
  anchorType: CommAttachmentAnchorType;
  anchorId: string;
  attachmentKind: CommAttachmentKind;
  entityType: string;
  entityId: string;
  documentId: string | null;
  customerId: string | null;
  jobId: string | null;
  label: string;
  fileName: string | null;
  mimeType: string | null;
  createdAt: string;
};

export type CreateCommTimelineNoteRequest = {
  body: string;
  customerId?: string;
  jobId?: string;
  statusUpdate?: string;
  metadata?: Record<string, unknown>;
  attachmentLinks?: Omit<CreateCommAttachmentLinkRequest, 'anchorType' | 'anchorId'>[];
};

export type CommTimelineNoteSummary = {
  id: string;
  body: string;
  statusUpdate: string | null;
  customerId: string | null;
  jobId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  attachmentLinks: CommAttachmentLinkSummary[];
};

export type CommunicationTimelineFilter = {
  customerId?: string;
  jobId?: string;
  channel?: UcProviderChannel | 'all' | 'note' | 'attachment';
  entryType?: string;
  limit?: number;
  offset?: number;
};

export type CommunicationTimelineEntry = UcTimelineEntrySummary & {
  jobId: string | null;
  attachmentLinks: CommAttachmentLinkSummary[];
};

export type CommunicationTimelineResult = {
  entries: CommunicationTimelineEntry[];
  total: number;
  filtersApplied: CommunicationTimelineFilter;
  sources: {
    gmailInbox: true;
    whatsappBusiness: true;
    crmCommunications: true;
    timelineNotes: true;
    attachmentLinks: true;
    personalWhatsappIntelligence: 'readiness_only';
  };
  syncNote: string;
};

export type EmailCentreDashboard = {
  summary: string;
  mailbox: {
    items: EmailCentreMessageSummary[];
    total: number;
    emptyReason: 'none' | 'not_configured' | 'no_matches' | 'role_filtered';
  };
  draftsPendingApproval: number;
  recentAttachments: CommAttachmentLinkSummary[];
  timelinePreview: CommunicationTimelineEntry[];
  policies: {
    emailSource: 'gmail_index';
    outboundCompose: 'gmail_draft_approve_execute';
    transactionalProvider: 'resend';
    autoSendEnabled: false;
    requiresApproval: true;
  };
};
