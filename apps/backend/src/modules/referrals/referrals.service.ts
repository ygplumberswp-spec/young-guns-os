import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ReferralsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    referrerId: string;
    referredName: string;
    referredPhone: string;
    referredEmail?: string;
    rewardType?: string;
    rewardValue?: number;
  }) {
    return this.prisma.referral.create({ data: data as any });
  }

  async findAll(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    return this.prisma.referral.findMany({
      where,
      include: {
        referrer: { select: { firstName: true, lastName: true } },
        referred: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async convert(id: string, customerId: string) {
    return this.prisma.referral.update({
      where: { id },
      data: { status: 'CONVERTED', referredId: customerId, convertedAt: new Date() },
    });
  }

  async issueReward(id: string) {
    return this.prisma.referral.update({
      where: { id },
      data: { status: 'REWARDED', rewardIssuedAt: new Date() },
    });
  }

  async getTopReferrers(limit = 10) {
    const referrals = await this.prisma.referral.groupBy({
      by: ['referrerId'],
      _count: true,
      where: { status: 'CONVERTED' },
      orderBy: { _count: { referrerId: 'desc' } },
      take: limit,
    });
    return referrals;
  }
}
