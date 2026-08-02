import type {
  GmailConnectionSummary,
  GmailLabelSummary,
  GmailMessageDetail,
  GmailMessageSummary,
  GmailStats,
  GmailSyncResult,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchGmailConnection(
  token: string,
): Promise<{ connection: GmailConnectionSummary; stats: GmailStats; labels: GmailLabelSummary[] }> {
  const connectionResponse = await request<{ connection: GmailConnectionSummary }>('/gmail/connection', { accessToken: token });
  const statsResponse = await request<{ stats: GmailStats }>('/gmail/stats', { accessToken: token });
  const labelsResponse = await request<{ labels: GmailLabelSummary[] }>('/gmail/labels', { accessToken: token });

  return {
    connection: connectionResponse.connection,
    stats: statsResponse.stats,
    labels: labelsResponse.labels,
  };
}

export async function connectGmail(
  token: string,
  payload: { code: string; redirectUri: string },
): Promise<GmailConnectionSummary> {
  const response = await request<{ connection: GmailConnectionSummary }>('/gmail/auth', {
    method: 'POST',
    body: payload,
    accessToken: token,
  });

  return response.connection;
}

export async function disconnectGmail(token: string): Promise<void> {
  await request<void>('/gmail/connection', { method: 'DELETE', accessToken: token });
}

export async function syncGmailMessages(token: string): Promise<GmailSyncResult> {
  const response = await request<{ result: GmailSyncResult }>('/gmail/sync', { method: 'POST', accessToken: token });
  return response.result;
}

export async function fetchGmailMessages(
  token: string,
  filters?: { labelId?: string },
): Promise<GmailMessageSummary[]> {
  const params = new URLSearchParams();
  if (filters?.labelId) params.set('labelId', filters.labelId);

  const response = await request<{ messages: GmailMessageSummary[] }>(`/gmail/messages?${params.toString()}`, { accessToken: token });
  return response.messages;
}

export async function fetchGmailMessage(token: string, messageId: string): Promise<GmailMessageDetail> {
  const response = await request<{ message: GmailMessageDetail }>(`/gmail/messages/${messageId}`, { accessToken: token });
  return response.message;
}

export async function sendGmailMessage(
  token: string,
  payload: {
    to: string;
    subject: string;
    bodyHtml?: string;
    bodyText?: string;
    cc?: string;
    bcc?: string;
    customerId?: string | null;
    isDraft?: boolean;
  },
): Promise<GmailMessageDetail> {
  const response = await request<{ message: GmailMessageDetail }>('/gmail/messages/send', {
    method: 'POST',
    body: payload,
    accessToken: token,
  });

  return response.message;
}
