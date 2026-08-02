import type {
  AuraConversationDetail,
  AuraConversationSummary,
  SendAuraMessageResponse,
} from '@titan/shared';
import { request } from './api-client';

export async function listAuraConversations(
  accessToken: string,
): Promise<AuraConversationSummary[]> {
  const data = await request<{ conversations: AuraConversationSummary[] }>('/aura/conversations', {
    accessToken,
  });

  return data.conversations;
}

export async function createAuraConversation(accessToken: string): Promise<AuraConversationDetail> {
  const data = await request<{ conversation: AuraConversationDetail }>('/aura/conversations', {
    method: 'POST',
    accessToken,
  });

  return data.conversation;
}

export async function getAuraConversation(
  accessToken: string,
  conversationId: string,
  options?: { signal?: AbortSignal },
): Promise<AuraConversationDetail> {
  const data = await request<{ conversation: AuraConversationDetail }>(
    `/aura/conversations/${conversationId}`,
    { accessToken, signal: options?.signal },
  );

  return data.conversation;
}

export async function sendAuraMessage(
  accessToken: string,
  conversationId: string,
  content: string,
  pageContext?: import('@titan/shared').AuraPageContext,
  options?: { signal?: AbortSignal; timeoutMs?: number; idempotencyKey?: string },
): Promise<SendAuraMessageResponse> {
  const headers: Record<string, string> = {};
  if (options?.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  return request<SendAuraMessageResponse>(`/aura/conversations/${conversationId}/messages`, {
    method: 'POST',
    accessToken,
    body: { content, pageContext },
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? 90_000,
    headers,
  });
}

export async function deleteAuraConversation(
  accessToken: string,
  conversationId: string,
): Promise<void> {
  await request<{ success: boolean }>(`/aura/conversations/${conversationId}`, {
    method: 'DELETE',
    accessToken,
  });
}
