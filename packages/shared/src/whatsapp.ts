export type WhatsappProvider = 'meta_cloud_api';

export type WhatsappConnectionStatus = 'disconnected' | 'pending' | 'connected' | 'error';

export type WhatsappMessageDirection = 'incoming' | 'outgoing';

export type WhatsappDeliveryStatus = 'draft' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type WhatsappTemplateCategory =
  | 'job_booked_confirmation'
  | 'technician_assigned'
  | 'technician_on_the_way'
  | 'job_completed'
  | 'invoice_sent'
  | 'payment_reminder'
  | 'utility'
  | 'marketing';

export type WhatsappTemplateStatus = 'pending' | 'approved' | 'rejected';

export const WHATSAPP_CONNECTION_STATUS_OPTIONS: Array<{
  value: WhatsappConnectionStatus;
  label: string;
}> = [
  { value: 'disconnected', label: 'Disconnected' },
  { value: 'pending', label: 'Pending' },
  { value: 'connected', label: 'Connected' },
  { value: 'error', label: 'Error' },
];

export const WHATSAPP_TEMPLATE_CATEGORY_OPTIONS: Array<{
  value: WhatsappTemplateCategory;
  label: string;
}> = [
  { value: 'job_booked_confirmation', label: 'Job Booked Confirmation' },
  { value: 'technician_assigned', label: 'Technician Assigned' },
  { value: 'technician_on_the_way', label: 'Technician On The Way' },
  { value: 'job_completed', label: 'Job Completed' },
  { value: 'invoice_sent', label: 'Invoice Sent' },
  { value: 'payment_reminder', label: 'Payment Reminder' },
  { value: 'utility', label: 'Utility' },
  { value: 'marketing', label: 'Marketing' },
];

export const WHATSAPP_NOTIFICATION_CATEGORIES: WhatsappTemplateCategory[] = [
  'job_booked_confirmation',
  'technician_assigned',
  'technician_on_the_way',
  'job_completed',
  'invoice_sent',
  'payment_reminder',
];

export const WHATSAPP_TEMPLATE_STATUS_OPTIONS: Array<{
  value: WhatsappTemplateStatus;
  label: string;
}> = [
  { value: 'pending', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export type WhatsappConnectionSummary = {
  provider: WhatsappProvider;
  status: WhatsappConnectionStatus;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  displayPhoneNumber: string | null;
  hasCredentials: boolean;
  webhookVerifyTokenHint: string | null;
  lastError: string | null;
  connectedAt: string | null;
  webhookUrl: string;
  /** Runtime gate: WHATSAPP_ENABLED && PROVIDERS_ENABLED */
  featureEnabled: boolean;
  /** Runtime gate: WEBHOOKS_ENABLED (inbound processing) */
  webhooksEnabled: boolean;
  /** Runtime gate: OUTBOUND_MESSAGES_ENABLED (live send/approve) */
  outboundMessagesEnabled: boolean;
  /** Honest operator note when flags block live traffic */
  runtimeNote: string | null;
};

/** LIVE-001B — read-only Meta GET proof using stored tenant credentials. */
export type WhatsappConnectionTestResult = {
  ok: boolean;
  status: 'connected' | 'degraded' | 'error';
  phoneNumberId: string;
  businessAccountId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  /** Always false — Test Connection never POSTs /messages. */
  providerWritePerformed: false;
  outboundMessageSent: false;
};

export type SaveWhatsappConnectionRequest = {
  accessToken?: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken?: string | null;
};

export type WhatsappStats = {
  totalMessages: number;
  incomingCount: number;
  outgoingCount: number;
  draftCount: number;
  pendingReplyCount: number;
  templateCount: number;
  approvedTemplateCount: number;
};

export type WhatsappTemplateSummary = {
  id: string;
  name: string;
  externalTemplateId: string | null;
  category: WhatsappTemplateCategory;
  language: string;
  body: string;
  variables: string[];
  status: WhatsappTemplateStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateWhatsappTemplateRequest = {
  name: string;
  externalTemplateId?: string | null;
  category?: WhatsappTemplateCategory;
  language?: string;
  body: string;
  variables?: string[];
  status?: WhatsappTemplateStatus;
};

export type UpdateWhatsappTemplateRequest = {
  name?: string;
  externalTemplateId?: string | null;
  category?: WhatsappTemplateCategory;
  language?: string;
  body?: string;
  variables?: string[];
  status?: WhatsappTemplateStatus;
};

export type WhatsappMessageSummary = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  direction: WhatsappMessageDirection;
  messageContent: string;
  externalMessageId: string | null;
  deliveryStatus: WhatsappDeliveryStatus;
  templateId: string | null;
  templateName: string | null;
  notificationCategory: WhatsappTemplateCategory | null;
  isDraft: boolean;
  approvedByUserId: string | null;
  approvedByName: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
};

export type SendWhatsappMessageRequest = {
  customerId: string;
  messageContent: string;
  templateId?: string | null;
  templateVariables?: Record<string, string>;
  asDraft?: boolean;
};

export type SendWhatsappTestMessageRequest = {
  phoneNumber: string;
  messageContent: string;
};

export type WhatsappAutomationTriggerContext = {
  triggerType: 'job_status_changed' | 'invoice_overdue';
  jobId?: string;
  jobStatus?: string;
  customerId?: string;
  invoiceId?: string;
};

export type WhatsappAutomationActionResult = {
  workflowId: string;
  workflowName: string;
  actionType: 'send_whatsapp_template' | 'send_whatsapp_draft';
  draftMessageId: string | null;
  category: WhatsappTemplateCategory | null;
  preview: string;
};
