import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  async createEndpoint(data: { url: string; events: string[]; description?: string }) {
    const secret = crypto.randomBytes(32).toString('hex');
    return this.prisma.webhookEndpoint.create({
      data: { url: data.url, events: data.events, secret, description: data.description },
    });
  }

  async dispatch(event: string, payload: Record<string, unknown>) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { isActive: true, events: { has: event } },
    });

    for (const endpoint of endpoints) {
      await this.prisma.webhookDelivery.create({
        data: { endpointId: endpoint.id, event, payload },
      });
    }

    this.logger.log(`Dispatched ${event} to ${endpoints.length} endpoints`);
  }

  async getEndpoints() {
    return this.prisma.webhookEndpoint.findMany({
      where: { isActive: true },
      include: { _count: { select: { deliveries: true } } },
    });
  }

  async getDeliveries(endpointId: string) {
    return this.prisma.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
