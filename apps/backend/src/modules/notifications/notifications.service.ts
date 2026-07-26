import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async send(userId: string, data: {
    type: string;
    title: string;
    body: string;
    channel: 'IN_APP' | 'PUSH' | 'EMAIL' | 'SMS';
    data?: Record<string, unknown>;
  }) {
    return this.prisma.notification.create({
      data: {
        userId,
        type: data.type,
        title: data.title,
        body: data.body,
        channel: data.channel,
        data: data.data || {},
        sentAt: new Date(),
      },
    });
  }

  async getUserNotifications(userId: string, unreadOnly = false) {
    const where: Record<string, unknown> = { userId };
    if (unreadOnly) where.isRead = false;

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }
}
