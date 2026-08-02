import { useCallback, useRef, useState } from 'react';
import {
  sendPortalAuraMessage,
  type PortalAuraChatMessage,
  type PortalAuraPageContext,
} from '../../lib/portal-aura-api';
import { PortalApiClientError } from '../../lib/portal-api-client';

const AURA_MESSAGE_TIMEOUT_MS = 90_000;

export function usePortalAuraChat(pageContext: PortalAuraPageContext) {
  const [messages, setMessages] = useState<PortalAuraChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendAbortController = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (accessToken: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed || !accessToken) return;

      sendAbortController.current?.abort();
      const controller = new AbortController();
      sendAbortController.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), AURA_MESSAGE_TIMEOUT_MS);

      const userMessage: PortalAuraChatMessage = { role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      setIsSending(true);
      setError(null);

      try {
        const result = await sendPortalAuraMessage(
          accessToken,
          {
            content: trimmed,
            pageContext,
            history: messages.slice(-8),
          },
          { signal: controller.signal },
        );
        setMessages((prev) => [...prev, result.message]);
      } catch (err) {
        if (controller.signal.aborted) {
          setError('Request timed out — try again.');
        } else if (err instanceof PortalApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to reach AURA right now.');
        }
      } finally {
        window.clearTimeout(timeout);
        setIsSending(false);
        sendAbortController.current = null;
      }
    },
    [messages, pageContext],
  );

  const cancelSend = useCallback(() => {
    sendAbortController.current?.abort();
    setIsSending(false);
  }, []);

  return { messages, isSending, error, sendMessage, cancelSend };
}
