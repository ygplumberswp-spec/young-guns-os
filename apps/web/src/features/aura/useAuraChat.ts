import { useCallback, useEffect, useState } from 'react';
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

export function useAuraChat(pageContext?: {
  customerId?: string;
  jobId?: string;
  vehicleId?: string;
  schedulingView?: boolean;
}) {
  const { accessToken } = useAuth();
  const [conversations, setConversations] = useState<AuraConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<AuraConversationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<AgentChatMessage[]>([]);
  const [pendingTasks, setPendingTasks] = useState<AgentTaskSummary[]>([]);
  const [lastRunTools, setLastRunTools] = useState<string[]>([]);

  const loadConversations = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const items = await auraApi.listAuraConversations(accessToken);
    setConversations(items);
    return items;
  }, [accessToken]);

  const selectConversation = useCallback(
    async (conversationId: string) => {
      if (!accessToken) {
        return;
      }

      setError(null);
      const conversation = await auraApi.getAuraConversation(accessToken, conversationId);
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
      if (!accessToken) {
        return;
      }

      setIsSending(true);
      setError(null);

      try {
        let conversationId = activeConversation?.id;

        if (!conversationId) {
          const created = await auraApi.createAuraConversation(accessToken);
          conversationId = created.id;
          setActiveConversation(created);
        }

        const result = await auraApi.sendAuraMessage(
          accessToken,
          conversationId,
          content,
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
        );

        setActiveConversation((current) => {
          if (!current || current.id !== result.conversation.id) {
            return {
              ...result.conversation,
              messages: [result.userMessage, result.assistantMessage],
            };
          }

          return {
            ...result.conversation,
            messages: [...current.messages, result.userMessage, result.assistantMessage],
          };
        });

        await loadConversations();
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Unable to send message');
      } finally {
        setIsSending(false);
      }
    },
    [accessToken, activeConversation, loadConversations, pageContext],
  );

  const sendAgentMessage = useCallback(
    async (content: string, agentKey: AgentKey) => {
      if (!accessToken) {
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
    [accessToken, activeConversation?.id, pageContext],
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

      try {
        await loadConversations();
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
