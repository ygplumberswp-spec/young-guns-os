import type {
  CreateWhatsappTemplateRequest,
  SaveWhatsappConnectionRequest,
  SendWhatsappMessageRequest,
  SendWhatsappTestMessageRequest,
  UpdateWhatsappTemplateRequest,
  WhatsappConnectionSummary,
  WhatsappMessageSummary,
  WhatsappStats,
  WhatsappTemplateSummary,
} from '@titan/shared';
import { request } from './api-client';

export type WhatsappIntegrationResponse = {
  connection: WhatsappConnectionSummary;
  stats: WhatsappStats;
  templates: WhatsappTemplateSummary[];
};

export async function fetchWhatsappIntegration(accessToken: string): Promise<WhatsappIntegrationResponse> {
  return request<WhatsappIntegrationResponse>('/integrations/whatsapp', { accessToken });
}

export async function saveWhatsappConnection(
  accessToken: string,
  body: SaveWhatsappConnectionRequest,
): Promise<WhatsappConnectionSummary> {
  const data = await request<{ connection: WhatsappConnectionSummary }>('/integrations/whatsapp', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.connection;
}

export async function disconnectWhatsapp(accessToken: string): Promise<WhatsappConnectionSummary> {
  const data = await request<{ connection: WhatsappConnectionSummary }>('/integrations/whatsapp', {
    method: 'DELETE',
    accessToken,
  });
  return data.connection;
}

export async function sendWhatsappTestMessage(
  accessToken: string,
  body: SendWhatsappTestMessageRequest,
): Promise<{ externalMessageId: string }> {
  const data = await request<{ result: { externalMessageId: string } }>('/integrations/whatsapp/test', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.result;
}

export async function createWhatsappTemplate(
  accessToken: string,
  body: CreateWhatsappTemplateRequest,
): Promise<WhatsappTemplateSummary> {
  const data = await request<{ template: WhatsappTemplateSummary }>('/integrations/whatsapp/templates', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.template;
}

export async function updateWhatsappTemplate(
  accessToken: string,
  templateId: string,
  body: UpdateWhatsappTemplateRequest,
): Promise<WhatsappTemplateSummary> {
  const data = await request<{ template: WhatsappTemplateSummary }>(
    `/integrations/whatsapp/templates/${templateId}`,
    {
      method: 'PATCH',
      accessToken,
      body,
    },
  );
  return data.template;
}

export async function deleteWhatsappTemplate(accessToken: string, templateId: string): Promise<void> {
  await request(`/integrations/whatsapp/templates/${templateId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function fetchWhatsappMessages(
  accessToken: string,
  customerId?: string,
): Promise<WhatsappMessageSummary[]> {
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
  const data = await request<{ messages: WhatsappMessageSummary[] }>(`/whatsapp/messages${query}`, {
    accessToken,
  });
  return data.messages;
}

export async function sendWhatsappMessage(
  accessToken: string,
  body: SendWhatsappMessageRequest,
): Promise<WhatsappMessageSummary> {
  const data = await request<{ message: WhatsappMessageSummary }>('/whatsapp/messages/send', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.message;
}

export async function approveWhatsappDraft(
  accessToken: string,
  messageId: string,
): Promise<WhatsappMessageSummary> {
  const data = await request<{ message: WhatsappMessageSummary }>(`/whatsapp/messages/${messageId}/approve`, {
    method: 'POST',
    accessToken,
    body: {},
  });
  return data.message;
}
