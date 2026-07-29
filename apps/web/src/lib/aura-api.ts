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
): Promise<AuraConversationDetail> {
  const data = await request<{ conversation: AuraConversationDetail }>(
    `/aura/conversations/${conversationId}`,
    { accessToken },
  );

  return data.conversation;
}

export async function sendAuraMessage(
  accessToken: string,
  conversationId: string,
  content: string,
  pageContext?: { customerId?: string; jobId?: string; vehicleId?: string; schedulingView?: boolean },
): Promise<SendAuraMessageResponse> {
  return request<SendAuraMessageResponse>(`/aura/conversations/${conversationId}/messages`, {
    method: 'POST',
    accessToken,
    body: { content, pageContext },
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
