import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentKey,
  AgentTaskSummary,
  AuraConversationDetail,
  AuraConversationSummary,
  AuraMessage,
  AuraSendDiagnostics,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import * as auraApi from '../../lib/aura-api';
import { runAgent } from '../../lib/agents-api';
import { useAuth } from '../../lib/auth-context';
import {
  nextAuraThinkingPhase,
  resolveAuraThinkingLabel,
  type AuraThinkingPhase,
} from './aura-thinking';

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

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof ApiClientError && error.code === 'REQUEST_TIMEOUT')
  );
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
  const [thinkingPhase, setThinkingPhase] = useState<AuraThinkingPhase>('idle');
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastDiagnostics, setLastDiagnostics] = useState<AuraSendDiagnostics | null>(null);
  const [agentMessages, setAgentMessages] = useState<AgentChatMessage[]>([]);
  const [pendingTasks, setPendingTasks] = useState<AgentTaskSummary[]>([]);
  const [lastRunTools, setLastRunTools] = useState<string[]>([]);
  const selectRequestId = useRef(0);
  const sendRequestId = useRef(0);
  const sendAbortController = useRef<AbortController | null>(null);
  const selectAbortController = useRef<AbortController | null>(null);
  const thinkingStartedAt = useRef<number | null>(null);

  const hasPageContext = Boolean(
    pageContext?.customerId ||
      pageContext?.jobId ||
      pageContext?.vehicleId ||
      pageContext?.schedulingView,
  );

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

      selectAbortController.current?.abort();
      const controller = new AbortController();
      selectAbortController.current = controller;

      const requestId = ++selectRequestId.current;
      setError(null);

      try {
        const conversation = await auraApi.getAuraConversation(accessToken, conversationId, {
          signal: controller.signal,
        });

        if (requestId !== selectRequestId.current) {
          return;
        }

        setActiveConversation(conversation);
      } catch (err) {
        if (isAbortError(err) || requestId !== selectRequestId.current) {
          return;
        }

        setError(err instanceof ApiClientError ? err.message : 'Unable to load conversation');
      }
    },
    [accessToken],
  );

  const cancelSend = useCallback(() => {
    sendAbortController.current?.abort();
    sendAbortController.current = null;
    sendRequestId.current += 1;
    setIsSending(false);
    setThinkingPhase('idle');
    setThinkingElapsedMs(0);
    thinkingStartedAt.current = null;
  }, []);

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
      const idempotencyKey = crypto.randomUUID();

      const trimmed = content.trim();
      const optimisticUserMessage: AuraMessage = {
        id: `pending-user-${requestId}`,
        conversationId: activeConversation?.id ?? 'pending',
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setIsSending(true);
      setThinkingPhase('thinking');
      setThinkingElapsedMs(0);
      thinkingStartedAt.current = Date.now();
      setError(null);
      setActiveConversation((current) => {
        if (!current) {
          return {
            id: 'pending',
            companyId: '',
            userId: '',
            title: 'New Conversation',
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
            idempotencyKey,
          },
        );

        if (requestId !== sendRequestId.current) {
          return;
        }

        setLastDiagnostics(result.diagnostics ?? null);

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

        if (controller.signal.aborted || isAbortError(err)) {
          setActiveConversation((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              messages: current.messages.filter(
                (message) => message.id !== optimisticUserMessage.id,
              ),
            };
          });
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
          setThinkingPhase('idle');
          setThinkingElapsedMs(0);
          thinkingStartedAt.current = null;
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

      const requestId = ++sendRequestId.current;
      sendAbortController.current?.abort();
      const controller = new AbortController();
      sendAbortController.current = controller;

      setIsSending(true);
      setThinkingPhase('thinking');
      setThinkingElapsedMs(0);
      thinkingStartedAt.current = Date.now();
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

        if (requestId !== sendRequestId.current) {
          return;
        }

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

        if (result.pendingTasks.length > 0) {
          setThinkingPhase('waiting_approval');
        }
      } catch (err) {
        if (requestId !== sendRequestId.current || isAbortError(err)) {
          return;
        }

        setAgentMessages((current) => current.filter((message) => message.id !== userMessage.id));

        if (isTimeoutError(err)) {
          setError('The agent took too long to respond. You can safely retry your message.');
        } else {
          setError(err instanceof ApiClientError ? err.message : 'Unable to run agent');
        }
      } finally {
        if (requestId === sendRequestId.current) {
          setIsSending(false);
          setThinkingPhase('idle');
          setThinkingElapsedMs(0);
          thinkingStartedAt.current = null;
          sendAbortController.current = null;
        }
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
    if (!isSending || thinkingStartedAt.current == null) {
      return;
    }

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - (thinkingStartedAt.current ?? Date.now());
      setThinkingElapsedMs(elapsed);
      setThinkingPhase((current) => nextAuraThinkingPhase(current, elapsed, hasPageContext));
    }, 400);

    return () => window.clearInterval(interval);
  }, [hasPageContext, isSending]);

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
      selectAbortController.current?.abort();
    };
  }, [accessToken, loadConversations]);

  const messages: AuraMessage[] = activeConversation?.messages ?? [];
  const workingLabel = resolveAuraThinkingLabel(thinkingPhase, thinkingElapsedMs, hasPageContext);

  return {
    conversations,
    activeConversation,
    messages,
    agentMessages,
    pendingTasks,
    lastRunTools,
    lastDiagnostics,
    isLoading,
    isSending,
    thinkingPhase,
    thinkingElapsedMs,
    hasPageContext,
    workingLabel,
    error,
    startConversation,
    selectConversation,
    sendMessage,
    sendAgentMessage,
    cancelSend,
    updateTask,
    removeConversation,
  };
}
