import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentKey,
  AgentTaskSummary,
  AuraConversationDetail,
  AuraConversationSummary,
  AuraMessage,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import * as auraApi from '../../lib/aura-api';
import { runAgent } from '../../lib/agents-api';
import { useAuth } from '../../lib/auth-context';

type AgentChatMessage = AuraMessage & {
  toolsUsed?: string[];
};

const conversationsCache = new Map<string, AuraConversationSummary[]>();
const AURA_MESSAGE_TIMEOUT_MS = 90_000;

function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return true;
  }

  return error instanceof ApiClientError && error.code === 'PROVIDER_TIMEOUT';
}

export function useAuraChat(pageContext?: {
  customerId?: string;
  jobId?: string;
  vehicleId?: string;
  schedulingView?: boolean;
}) {
  const { accessToken } = useAuth();
  const [conversations, setConversations] = useState<AuraConversationSummary[]>(() =>
    accessToken ? (conversationsCache.get(accessToken) ?? []) : [],
  );
  const [activeConversation, setActiveConversation] = useState<AuraConversationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(() =>
    accessToken ? !conversationsCache.has(accessToken) : false,
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<AgentChatMessage[]>([]);
  const [pendingTasks, setPendingTasks] = useState<AgentTaskSummary[]>([]);
  const [lastRunTools, setLastRunTools] = useState<string[]>([]);
  const selectRequestId = useRef(0);
  const sendRequestId = useRef(0);
  const sendAbortController = useRef<AbortController | null>(null);

  const loadConversations = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const items = await auraApi.listAuraConversations(accessToken);
    conversationsCache.set(accessToken, items);
    setConversations(items);
    return items;
  }, [accessToken]);

  const selectConversation = useCallback(
    async (conversationId: string) => {
      if (!accessToken) {
        return;
      }

      const requestId = ++selectRequestId.current;
      setError(null);
      const conversation = await auraApi.getAuraConversation(accessToken, conversationId);

      if (requestId !== selectRequestId.current) {
        return;
      }

      setActiveConversation(conversation);
    },
    [accessToken],
  );

  const startConversation = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setError(null);
    const conversation = await auraApi.createAuraConversation(accessToken);
    setActiveConversation(conversation);
    setAgentMessages([]);
    setPendingTasks([]);
    setLastRunTools([]);
    await loadConversations();
    return conversation;
  }, [accessToken, loadConversations]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!accessToken || isSending) {
        return;
      }

      const requestId = ++sendRequestId.current;
      sendAbortController.current?.abort();
      const controller = new AbortController();
      sendAbortController.current = controller;

      const trimmed = content.trim();
      const optimisticUserMessage: AuraMessage = {
        id: `pending-user-${requestId}`,
        conversationId: activeConversation?.id ?? 'pending',
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setIsSending(true);
      setError(null);
      setActiveConversation((current) => {
        if (!current) {
          return {
            id: 'pending',
            companyId: '',
            userId: '',
            title: 'New conversation',
            createdAt: optimisticUserMessage.createdAt,
            updatedAt: optimisticUserMessage.createdAt,
            messages: [optimisticUserMessage],
          };
        }

        return {
          ...current,
          messages: [...current.messages, optimisticUserMessage],
        };
      });

      try {
        let conversationId = activeConversation?.id;

        if (!conversationId || conversationId === 'pending') {
          const created = await auraApi.createAuraConversation(accessToken);
          conversationId = created.id;

          if (requestId !== sendRequestId.current) {
            return;
          }

          setActiveConversation({
            ...created,
            messages: [optimisticUserMessage],
          });
        }

        const result = await auraApi.sendAuraMessage(
          accessToken,
          conversationId,
          trimmed,
          pageContext?.customerId ||
            pageContext?.jobId ||
            pageContext?.vehicleId ||
            pageContext?.schedulingView
            ? {
                customerId: pageContext.customerId,
                jobId: pageContext.jobId,
                vehicleId: pageContext.vehicleId,
                schedulingView: pageContext.schedulingView,
              }
            : undefined,
          {
            signal: controller.signal,
            timeoutMs: AURA_MESSAGE_TIMEOUT_MS,
          },
        );

        if (requestId !== sendRequestId.current) {
          return;
        }

        setActiveConversation((current) => {
          if (!current || current.id === 'pending' || current.id !== result.conversation.id) {
            return {
              ...result.conversation,
              messages: [result.userMessage, result.assistantMessage],
            };
          }

          const withoutOptimistic = current.messages.filter(
            (message) => message.id !== optimisticUserMessage.id,
          );

          return {
            ...result.conversation,
            messages: [...withoutOptimistic, result.userMessage, result.assistantMessage],
          };
        });

        void loadConversations();
      } catch (err) {
        if (requestId !== sendRequestId.current) {
          return;
        }

        if (controller.signal.aborted && !(err instanceof ApiClientError)) {
          return;
        }

        setActiveConversation((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            messages: current.messages.filter((message) => message.id !== optimisticUserMessage.id),
          };
        });

        if (isTimeoutError(err)) {
          setError('AURA took too long to respond. You can safely retry your message.');
        } else {
          setError(err instanceof ApiClientError ? err.message : 'Unable to send message');
        }
      } finally {
        if (requestId === sendRequestId.current) {
          setIsSending(false);
          sendAbortController.current = null;
        }
      }
    },
    [accessToken, activeConversation, isSending, loadConversations, pageContext],
  );

  const sendAgentMessage = useCallback(
    async (content: string, agentKey: AgentKey) => {
      if (!accessToken || isSending) {
        return;
      }

      setIsSending(true);
      setError(null);

      const userMessage: AgentChatMessage = {
        id: crypto.randomUUID(),
        conversationId: activeConversation?.id ?? 'agent-session',
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };

      setAgentMessages((current) => [...current, userMessage]);

      try {
        const result = await runAgent(accessToken, {
          request: content,
          agentKey,
          conversationId: activeConversation?.id,
          pageContext,
        });

        const assistantMessage: AgentChatMessage = {
          id: crypto.randomUUID(),
          conversationId: activeConversation?.id ?? 'agent-session',
          role: 'assistant',
          content: result.assistantMessage,
          createdAt: new Date().toISOString(),
          toolsUsed: result.run.toolsUsed,
        };

        setAgentMessages((current) => [...current, assistantMessage]);
        setPendingTasks(result.pendingTasks);
        setLastRunTools(result.run.toolsUsed);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Unable to run agent');
      } finally {
        setIsSending(false);
      }
    },
    [accessToken, activeConversation?.id, isSending, pageContext],
  );

  const updateTask = useCallback((task: AgentTaskSummary) => {
    setPendingTasks((current) => current.map((entry) => (entry.id === task.id ? task : entry)));
  }, []);

  const removeConversation = useCallback(
    async (conversationId: string) => {
      if (!accessToken) {
        return;
      }

      setError(null);
      await auraApi.deleteAuraConversation(accessToken, conversationId);

      if (activeConversation?.id === conversationId) {
        setActiveConversation(null);
        setAgentMessages([]);
        setPendingTasks([]);
        setLastRunTools([]);
      }

      await loadConversations();
    },
    [accessToken, activeConversation, loadConversations],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      const cached = conversationsCache.get(accessToken);
      if (cached) {
        setConversations(cached);
        setIsLoading(false);
      }

      try {
        const items = await loadConversations();
        if (!cancelled && items) {
          setConversations(items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load AURA');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      selectRequestId.current += 1;
      sendAbortController.current?.abort();
    };
  }, [accessToken, loadConversations]);

  const messages: AuraMessage[] = activeConversation?.messages ?? [];

  return {
    conversations,
    activeConversation,
    messages,
    agentMessages,
    pendingTasks,
    lastRunTools,
    isLoading,
    isSending,
    error,
    startConversation,
    selectConversation,
    sendMessage,
    sendAgentMessage,
    updateTask,
    removeConversation,
  };
}
