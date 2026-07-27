import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async requestReview(customerId: string, jobId: string) {
    return { customerId, jobId, status: 'review_requested', sentAt: new Date() };
  }

  async create(data: { customerId: string; rating: number; comment?: string; platform: string }) {
    return this.prisma.review.create({ data: data as any });
  }

  async getAll(filters?: { minRating?: number; platform?: string }) {
    const where: Record<string, unknown> = {};
    if (filters?.minRating) where.rating = { gte: filters.minRating };
    if (filters?.platform) where.platform = filters.platform;

    return this.prisma.review.findMany({
      where,
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAverageRating() {
    const result = await this.prisma.review.aggregate({ _avg: { rating: true }, _count: true });
    return { averageRating: result._avg.rating || 0, totalReviews: result._count };
  }

  async respondToReview(id: string, response: string) {
    return this.prisma.review.update({
      where: { id },
      data: { response, respondedAt: new Date() },
    });
  }
}
