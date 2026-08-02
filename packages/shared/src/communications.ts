export type CommunicationChannel = 'email' | 'phone' | 'sms' | 'note';

export type CommunicationDirection = 'inbound' | 'outbound';

export type CommunicationVisibility = 'internal_note' | 'customer_visible' | 'outbound_request';

export type CommunicationDeliveryState =
  | 'logged_only'
  | 'requested'
  | 'queued'
  | 'send_failed'
  | 'provider_delivered';

export const COMMUNICATION_CHANNEL_OPTIONS: Array<{ value: CommunicationChannel; label: string }> =
  [
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'sms', label: 'SMS' },
    { value: 'note', label: 'Note' },
  ];

export const COMMUNICATION_DIRECTION_OPTIONS: Array<{
  value: CommunicationDirection;
  label: string;
}> = [
  { value: 'outbound', label: 'Outbound' },
  { value: 'inbound', label: 'Inbound' },
];

export const COMMUNICATION_VISIBILITY_OPTIONS: Array<{
  value: CommunicationVisibility;
  label: string;
}> = [
  { value: 'internal_note', label: 'Internal note (staff only)' },
  { value: 'customer_visible', label: 'Customer-visible message' },
  { value: 'outbound_request', label: 'Outbound send request' },
];

export const COMMUNICATION_DELIVERY_STATE_OPTIONS: Array<{
  value: CommunicationDeliveryState;
  label: string;
}> = [
  { value: 'logged_only', label: 'Logged only — not provider-delivered' },
  { value: 'requested', label: 'Requested — awaiting send path' },
  { value: 'queued', label: 'Queued' },
  { value: 'send_failed', label: 'Send failed' },
  { value: 'provider_delivered', label: 'Provider delivered' },
];

export type MessageTemplateSummary = {
  id: string;
  name: string;
  channel: CommunicationChannel;
  subject: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationSummary = {
  id: string;
  customerId: string;
  customerName: string;
  jobId: string | null;
  jobNumber: string | null;
  authorUserId: string;
  authorName: string;
  templateId: string | null;
  templateName: string | null;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  visibility: CommunicationVisibility;
  deliveryState: CommunicationDeliveryState;
  subject: string | null;
  body: string;
  failureReason: string | null;
  clientActionId: string | null;
  occurredAt: string;
  createdAt: string;
  idempotentReplay?: boolean;
};

export type CommunicationsStats = {
  messageCount: number;
  templateCount: number;
};

export type CreateMessageTemplateRequest = {
  name: string;
  channel?: CommunicationChannel;
  subject?: string | null;
  body: string;
};

export type CreateCommunicationRequest = {
  customerId: string;
  jobId?: string | null;
  templateId?: string | null;
  channel?: CommunicationChannel;
  direction?: CommunicationDirection;
  visibility?: CommunicationVisibility;
  subject?: string | null;
  body: string;
  occurredAt?: string;
  clientActionId?: string | null;
};

/** Phase 10 — unified communications workspace channels. */
export type CommunicationsWorkspaceChannel =
  | 'whatsapp_business'
  | 'personal_whatsapp'
  | 'email'
  | 'sms'
  | 'calls'
  | 'system';

export type CommunicationsWorkspaceQueue =
  | 'unread'
  | 'needs_reply'
  | 'waiting_for_customer'
  | 'booking'
  | 'eta_delay'
  | 'quote_followup'
  | 'payment_followup'
  | 'complaint'
  | 'supplier'
  | 'cv_recruitment'
  | 'marketing_opt_out'
  | 'escalated';

export type CommunicationsIntegrationState =
  | 'connected'
  | 'syncing'
  | 'not_configured'
  | 'provider_unavailable'
  | 'error';

export const COMMUNICATIONS_WORKSPACE_QUEUE_OPTIONS: Array<{
  value: CommunicationsWorkspaceQueue;
  label: string;
}> = [
  { value: 'unread', label: 'Unread' },
  { value: 'needs_reply', label: 'Needs Reply' },
  { value: 'waiting_for_customer', label: 'Waiting for Customer' },
  { value: 'booking', label: 'Booking' },
  { value: 'eta_delay', label: 'ETA / Delay' },
  { value: 'quote_followup', label: 'Quote Follow-up' },
  { value: 'payment_followup', label: 'Payment Follow-up' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'cv_recruitment', label: 'CV / Recruitment' },
  { value: 'marketing_opt_out', label: 'Marketing Opt-out' },
  { value: 'escalated', label: 'Escalated' },
];

export const COMMUNICATIONS_WORKSPACE_CHANNEL_OPTIONS: Array<{
  value: CommunicationsWorkspaceChannel;
  label: string;
}> = [
  { value: 'whatsapp_business', label: 'WhatsApp Business' },
  { value: 'personal_whatsapp', label: 'Personal WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'calls', label: 'Calls' },
  { value: 'system', label: 'System messages' },
];

export type CommunicationsChannelIntegration = {
  channel: CommunicationsWorkspaceChannel;
  label: string;
  state: CommunicationsIntegrationState;
  detail: string | null;
};

export type CommunicationsWorkspaceEntityLinks = {
  leadId: string | null;
  leadName: string | null;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  jobNumber: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  supplierId: string | null;
  supplierName: string | null;
  staffId: string | null;
  staffName: string | null;
};

export type CommunicationsWorkspaceConversation = {
  id: string;
  channel: CommunicationsWorkspaceChannel;
  queues: CommunicationsWorkspaceQueue[];
  direction: 'inbound' | 'outbound' | 'internal';
  subject: string;
  preview: string;
  isUnread: boolean;
  occurredAt: string;
  sourceType: string;
  sourceId: string;
  entities: CommunicationsWorkspaceEntityLinks;
};

export type CommunicationsWorkspaceQueueSummary = {
  queue: CommunicationsWorkspaceQueue;
  label: string;
  count: number;
};

export type CommunicationsWorkspaceResponse = {
  summary: string;
  integrations: CommunicationsChannelIntegration[];
  queueSummaries: CommunicationsWorkspaceQueueSummary[];
  conversations: CommunicationsWorkspaceConversation[];
};
