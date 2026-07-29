import type { CommunicationSummary } from './communications.js';
import type { DocumentSummary } from './documents.js';
import type { InvoiceSummary, PaymentSummary, QuoteSummary } from './finance.js';
import type { JobSummary } from './jobs.js';
import type { NotificationSummary, NotificationPreferenceSummary } from './mobile.js';
import type { PortalAccessPermission } from './portal.js';
import type { ScheduledJobEvent } from './scheduling.js';

export type PortalCustomerRequestType =
  | 'quote_clarification'
  | 'quote_approval'
  | 'appointment_reschedule'
  | 'appointment_cancellation'
  | 'appointment_confirmation'
  | 'support_message'
  | 'general_request';

export type PortalCustomerRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type PortalCustomerExperienceDashboard = {
  customerName: string;
  companyName: string;
  permissions: PortalAccessPermission[];
  activeJobCount: number;
  completedJobCount: number;
  pendingQuoteCount: number;
  outstandingInvoiceCount: number;
  outstandingBalanceCents: number;
  currency: string;
  upcomingAppointmentCount: number;
  unreadNotificationCount: number;
  activeJobs: JobSummary[];
  pendingQuotes: QuoteSummary[];
  recentInvoices: InvoiceSummary[];
  upcomingAppointments: PortalAppointmentSummary[];
  recentCommunications: CommunicationSummary[];
  notifications: NotificationSummary[];
};

export type PortalJobTrackingDetail = {
  job: JobSummary & {
    description: string | null;
    etaAt: string | null;
    completedWorkSummary: string | null;
  };
  timeline: PortalJobTimelineEntry[];
  documents: DocumentSummary[];
};

export type PortalJobTimelineEntry = {
  id: string;
  type: 'created' | 'scheduled' | 'status_change' | 'completed';
  title: string;
  description: string | null;
  occurredAt: string;
};

export type PortalQuoteDetail = QuoteSummary & {
  canRequestClarification: boolean;
  canRequestApproval: boolean;
};

export type PortalFinanceCentre = {
  outstandingBalanceCents: number;
  currency: string;
  invoices: InvoiceSummary[];
  payments: PaymentSummary[];
};

export type PortalAppointmentSummary = {
  jobId: string;
  jobTitle: string;
  status: string;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  assignedUserName: string | null;
};

export type PortalCustomerCommunicationsCentre = {
  communications: CommunicationSummary[];
  supportConversations: PortalSupportConversationSummary[];
  voiceCallSummaries: PortalVoiceCallSummary[];
  marketingPreferences: NotificationPreferenceSummary[];
};

export type PortalSupportConversationSummary = {
  id: string;
  subject: string;
  status: string;
  channel: string;
  updatedAt: string;
  messageCount: number;
};

export type PortalVoiceCallSummary = {
  id: string;
  subject: string;
  summary: string | null;
  occurredAt: string;
};

export type PortalKnowledgeArticleSummary = {
  id: string;
  resultType: 'article' | 'sop';
  title: string;
  summary: string | null;
  articleType: string | null;
  categoryName: string | null;
};

export type PortalCustomerRequestSummary = {
  id: string;
  requestType: PortalCustomerRequestType;
  status: PortalCustomerRequestStatus;
  subject: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePortalCustomerRequest = {
  requestType: PortalCustomerRequestType;
  subject: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

export type PortalCustomerExperienceAuraContext = {
  customerName: string;
  activeJobCount: number;
  pendingQuoteCount: number;
  outstandingInvoiceCount: number;
  outstandingBalanceCents: number;
  unreadNotificationCount: number;
  upcomingAppointmentCount: number;
  recentRequests: Array<{
    requestType: string;
    status: string;
    subject: string;
    createdAt: string;
  }>;
};

export type PortalKnowledgeSearchRequest = {
  query: string;
  limit?: number;
};

export type ScheduledJobEventForPortal = ScheduledJobEvent;
