import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);

  constructor(private prisma: PrismaService) {}

  async send(data: {
    customerId: string;
    channel: 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PHONE' | 'PUSH' | 'IN_APP';
    subject?: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    this.logger.log(`Sending ${data.channel} to customer ${data.customerId}: ${data.subject || '(no subject)'}`);

    const record = await this.prisma.communication.create({
      data: {
        customerId: data.customerId,
        channel: data.channel as any,
        direction: 'OUTBOUND',
        subject: data.subject,
        content: data.body,
        status: 'SENT',
        metadata: (data.metadata || {}) as any,
        sentAt: new Date(),
      },
    });

    return {
      id: record.id,
      status: record.status,
      channel: record.channel,
      customerId: record.customerId,
      sentAt: record.sentAt,
    };
  }

  async sendBulk(messages: Array<{
    customerId: string;
    channel: 'SMS' | 'EMAIL';
    subject?: string;
    body: string;
  }>) {
    const results = await Promise.all(messages.map((msg) => this.send(msg)));
    return { sent: results.length, results };
  }

  async getHistory(customerId: string) {
    return this.prisma.communication.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
