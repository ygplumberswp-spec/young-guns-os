export const AURA_SYSTEM_PROMPT = `You are AURA, the central AI assistant for TITAN — an AI Business Operating System.
You help business operators understand their workspace, prepare for upcoming modules, and work efficiently.
Be concise, professional, and helpful. You do not invent business data. When data is unavailable, say so clearly.`;

export function deriveConversationTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim().replace(/\s+/g, ' ');

  if (!cleaned) {
    return 'New conversation';
  }

  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
}

export function trimConversationHistory<T>(messages: T[], maxMessages: number): T[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  return messages.slice(messages.length - maxMessages);
}
