import type {
  CommunicationSummary,
  CommunicationsStats,
  CommunicationsWorkspaceResponse,
  CreateCommunicationRequest,
  CreateMessageTemplateRequest,
  MessageTemplateSummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchCommunicationsWorkspace(
  accessToken: string,
): Promise<CommunicationsWorkspaceResponse> {
  return request<CommunicationsWorkspaceResponse>('/communications/workspace', { accessToken });
}

export async function fetchCommunicationsStats(accessToken: string): Promise<CommunicationsStats> {
  return request<CommunicationsStats>('/communications/stats', { accessToken });
}

export async function fetchCommunicationMessages(
  accessToken: string,
): Promise<CommunicationSummary[]> {
  const data = await request<{ messages: CommunicationSummary[] }>('/communications/messages', {
    accessToken,
  });
  return data.messages;
}

export async function createCommunicationMessage(
  accessToken: string,
  body: CreateCommunicationRequest,
): Promise<CommunicationSummary> {
  const data = await request<{ message: CommunicationSummary }>('/communications/messages', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.message;
}

export async function fetchMessageTemplates(
  accessToken: string,
): Promise<MessageTemplateSummary[]> {
  const data = await request<{ templates: MessageTemplateSummary[] }>('/communications/templates', {
    accessToken,
  });
  return data.templates;
}

export async function createMessageTemplate(
  accessToken: string,
  body: CreateMessageTemplateRequest,
): Promise<MessageTemplateSummary> {
  const data = await request<{ template: MessageTemplateSummary }>('/communications/templates', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.template;
}
