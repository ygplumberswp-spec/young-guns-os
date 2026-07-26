import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AiBaseService, AiResponse, EscalationRule } from './ai-base.service';

@Injectable()
export class AiReceptionistService extends AiBaseService {
  private readonly SYSTEM_PROMPT = `You are the AI Receptionist for Young Guns Plumbing. Your role is to:

1. Answer incoming calls and messages professionally
2. Collect customer information (name, phone, address, issue description)
3. Determine urgency and job type
4. Book appointments based on available slots
5. Handle basic questions about services and pricing
6. Escalate to a human when needed

Business Rules:
- Emergency calls (burst pipes, flooding, gas leaks) are URGENT - escalate immediately
- Always confirm the customer's callback number
- Never quote exact prices - say "we'll provide a quote on site"
- Operating hours: 7am-5pm Monday-Friday, 8am-12pm Saturday
- After hours emergencies: $150 call-out fee applies
- Service areas: Sydney Metro, Western Sydney, Northern Beaches

Tone: Professional, friendly, helpful. Use Australian English.`;

  private readonly ESCALATION_RULES: EscalationRule[] = [
    { trigger: 'gas leak', action: 'ESCALATE_TO_HUMAN', message: 'Emergency: Gas leak reported' },
    { trigger: 'flooding', action: 'ESCALATE_TO_HUMAN', message: 'Emergency: Flooding reported' },
    { trigger: 'burst pipe', action: 'ESCALATE_TO_HUMAN', message: 'Emergency: Burst pipe reported' },
    { trigger: 'complaint', action: 'ESCALATE_TO_HUMAN', message: 'Customer complaint - needs human attention' },
    { trigger: 'speak to manager', action: 'ESCALATE_TO_HUMAN', message: 'Customer requesting manager' },
    { trigger: 'refund', action: 'ESCALATE_TO_HUMAN', message: 'Refund request' },
  ];

  constructor(
    protected configService: ConfigService,
    protected prisma: PrismaService,
  ) {
    super(configService, prisma);
  }

  async handleMessage(
    conversationId: string,
    message: string,
    context?: { customerPhone?: string; branchId?: string },
  ): Promise<AiResponse> {
    const history = await this.getConversationHistory(conversationId);

    await this.addMessage(conversationId, 'USER', message);

    const escalation = this.checkEscalation(message, this.ESCALATION_RULES);
    if (escalation.shouldEscalate) {
      const response: AiResponse = {
        content: `I understand this is urgent. Let me connect you with our team right away. ${escalation.rule?.message || ''}`,
        shouldEscalate: true,
        escalationReason: escalation.rule?.message,
        metadata: { context },
      };

      await this.addMessage(conversationId, 'ASSISTANT', response.content);

      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { status: 'ESCALATED' },
      });

      return response;
    }

    // In production, this would call OpenAI API
    const aiResponse = await this.generateResponse(history, message, context);

    await this.addMessage(conversationId, 'ASSISTANT', aiResponse.content);

    return aiResponse;
  }

  async handleIncomingCall(phone: string, branchId: string) {
    const existingCustomer = await this.prisma.customer.findFirst({
      where: { phone, organization: { branches: { some: { id: branchId } } } },
      include: { properties: true },
    });

    const conversation = await this.createConversation('RECEPTIONIST');

    const greeting = existingCustomer
      ? `G'day ${existingCustomer.firstName}! Thanks for calling Young Guns Plumbing. How can I help you today?`
      : `G'day! Thanks for calling Young Guns Plumbing. My name's Sam, the AI assistant. How can I help you today?`;

    await this.addMessage(conversation.id, 'ASSISTANT', greeting);

    return {
      conversationId: conversation.id,
      greeting,
      existingCustomer,
      isReturningCustomer: !!existingCustomer,
    };
  }

  private async generateResponse(
    history: Array<{ role: string; content: string }>,
    message: string,
    context?: Record<string, unknown>,
  ): Promise<AiResponse> {
    // Placeholder for OpenAI integration
    // In production: call OpenAI with system prompt, history, and tools
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('book') || lowerMessage.includes('appointment')) {
      return {
        content: "I'd be happy to help you book an appointment. What suburb are you located in, and what's the plumbing issue you're experiencing?",
        shouldEscalate: false,
        metadata: { intent: 'booking', context },
      };
    }

    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
      return {
        content: "Our pricing depends on the specific job. We offer free quotes for most work - one of our licensed plumbers will assess the issue on site and provide a fixed price before any work begins. Would you like to book a quote?",
        shouldEscalate: false,
        metadata: { intent: 'pricing_inquiry', context },
      };
    }

    return {
      content: "I'd be happy to help. Could you tell me a bit more about the plumbing issue you're experiencing?",
      shouldEscalate: false,
      metadata: { intent: 'general', context },
    };
  }
}
