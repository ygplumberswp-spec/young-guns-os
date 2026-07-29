export type CommunicationChannel = 'email' | 'phone' | 'sms' | 'note';

export type CommunicationDirection = 'inbound' | 'outbound';

export const COMMUNICATION_CHANNEL_OPTIONS: Array<{ value: CommunicationChannel; label: string }> = [
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
  authorUserId: string;
  authorName: string;
  templateId: string | null;
  templateName: string | null;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  subject: string | null;
  body: string;
  occurredAt: string;
  createdAt: string;
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
  templateId?: string | null;
  channel?: CommunicationChannel;
  direction?: CommunicationDirection;
  subject?: string | null;
  body: string;
  occurredAt?: string;
};
