import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AiBaseService, AiResponse } from './ai-base.service';

@Injectable()
export class AiSalesService extends AiBaseService {
  private readonly SYSTEM_PROMPT = `You are the AI Sales Assistant for Young Guns Plumbing. Your role is to:

1. Follow up on quotes that haven't been responded to (48h+ rule)
2. Convert leads into bookings
3. Upsell maintenance plans to existing customers
4. Handle quote objections professionally
5. Track conversion rates and report on pipeline

Business Rules:
- Follow up quotes after 48 hours of no response
- Offer 10% discount on maintenance plan sign-up (max $50 discount)
- Never pressure customers - be helpful and informative
- Log all interactions for compliance
- Escalate if customer expresses dissatisfaction

Tone: Consultative, not pushy. Focus on value and customer benefit.`;

  constructor(
    protected configService: ConfigService,
    protected prisma: PrismaService,
  ) {
    super(configService, prisma);
  }

  async followUpQuote(quoteId: string): Promise<AiResponse> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { customer: true, items: true },
    });

    if (!quote) {
      return {
        content: 'Quote not found',
        shouldEscalate: false,
        metadata: {},
      };
    }

    const conversation = await this.createConversation('SALES');

    const message = `Hi ${quote.customer.firstName}, this is Sam from Young Guns Plumbing. I'm just following up on the quote we sent through for ${quote.title} (${quote.quoteNumber}). The total was $${quote.total}. Did you have any questions about it?`;

    await this.addMessage(conversation.id, 'ASSISTANT', message);

    return {
      content: message,
      shouldEscalate: false,
      metadata: {
        quoteId,
        quoteNumber: quote.quoteNumber,
        total: quote.total,
        customerPhone: quote.customer.phone,
      },
    };
  }

  async generateLeadFollowUp(leadId: string): Promise<AiResponse> {
    const lead = await this.prisma.marketingLead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      return { content: 'Lead not found', shouldEscalate: false, metadata: {} };
    }

    const message = `Hi ${lead.name}, thanks for your enquiry about ${lead.serviceType || 'plumbing services'}. I'm Sam from Young Guns Plumbing. Would you like to book a time for one of our licensed plumbers to come out and take a look?`;

    return {
      content: message,
      shouldEscalate: false,
      metadata: { leadId, leadSource: lead.source },
    };
  }

  async getSalesPipeline() {
    const [pendingQuotes, sentQuotes, followUpRequired] = await Promise.all([
      this.prisma.quote.count({ where: { status: 'DRAFT' } }),
      this.prisma.quote.count({ where: { status: 'SENT' } }),
      this.prisma.quote.count({
        where: {
          status: 'SENT',
          createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return { pendingQuotes, sentQuotes, followUpRequired };
  }
}
