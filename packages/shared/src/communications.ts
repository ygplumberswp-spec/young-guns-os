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
  { value: 'internal_note', label: 'Internal Note (Staff Only)' },
  { value: 'customer_visible', label: 'Customer-Visible Message' },
  { value: 'outbound_request', label: 'Outbound Send Request' },
];

export const COMMUNICATION_DELIVERY_STATE_OPTIONS: Array<{
  value: CommunicationDeliveryState;
  label: string;
}> = [
  { value: 'logged_only', label: 'Logged Only — Not Provider-Delivered' },
  { value: 'requested', label: 'Requested — Awaiting Send Path' },
  { value: 'queued', label: 'Queued' },
  { value: 'send_failed', label: 'Send Failed' },
  { value: 'provider_delivered', label: 'Provider Delivered' },
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
