import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export interface AiAgentConfig {
  agentType: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  tools: string[];
  escalationRules: EscalationRule[];
}

export interface EscalationRule {
  trigger: string;
  action: 'ESCALATE_TO_HUMAN' | 'ESCALATE_TO_AGENT' | 'LOG_AND_CONTINUE';
  targetAgent?: string;
  message?: string;
}

export interface AiResponse {
  content: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; result?: unknown }>;
  shouldEscalate: boolean;
  escalationReason?: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class AiBaseService {
  protected readonly logger = new Logger(AiBaseService.name);

  constructor(
    protected configService: ConfigService,
    protected prisma: PrismaService,
  ) {}

  async createConversation(agentType: string, userId?: string) {
    const sessionId = `${agentType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return this.prisma.aiConversation.create({
      data: {
        agentType: agentType as any,
        userId,
        sessionId,
      },
    });
  }

  async addMessage(conversationId: string, role: string, content: string, toolCalls?: unknown) {
    return this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: role as any,
        content,
        toolCalls: toolCalls ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
      },
    });
  }

  async getConversationHistory(conversationId: string) {
    return this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  protected buildMessages(
    systemPrompt: string,
    history: Array<{ role: string; content: string }>,
    userMessage: string,
  ) {
    return [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];
  }

  protected checkEscalation(
    content: string,
    rules: EscalationRule[],
  ): { shouldEscalate: boolean; rule?: EscalationRule } {
    for (const rule of rules) {
      if (content.toLowerCase().includes(rule.trigger.toLowerCase())) {
        return { shouldEscalate: true, rule };
      }
    }
    return { shouldEscalate: false };
  }
}
