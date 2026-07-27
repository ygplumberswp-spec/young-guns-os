import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class MarketingService {
  constructor(private prisma: PrismaService) {}

  async createCampaign(data: {
    name: string;
    type: string;
    platform?: string;
    status?: string;
    budget?: number;
    startDate?: string;
    endDate?: string;
    targeting?: Record<string, unknown>;
  }) {
    const platformValues = ['META', 'GOOGLE', 'EMAIL', 'SMS', 'WHATSAPP'];
    const typeValues = ['AWARENESS', 'LEAD_GENERATION', 'RETARGETING', 'SEASONAL', 'REFERRAL'];

    let campaignType = data.type;
    let campaignPlatform = data.platform || 'EMAIL';

    if (platformValues.includes(data.type) && !typeValues.includes(data.type)) {
      campaignPlatform = data.type;
      campaignType = 'LEAD_GENERATION';
    }
    if (!typeValues.includes(campaignType)) {
      campaignType = 'LEAD_GENERATION';
    }
    if (!platformValues.includes(campaignPlatform)) {
      campaignPlatform = 'EMAIL';
    }

    return this.prisma.marketingCampaign.create({
      data: {
        name: data.name,
        type: campaignType as any,
        platform: campaignPlatform as any,
        status: (data.status || 'DRAFT') as any,
        budget: data.budget,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        targeting: data.targeting || {},
      } as any,
    });
  }

  async getCampaigns(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    return this.prisma.marketingCampaign.findMany({
      where,
      include: { _count: { select: { leads: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLead(data: {
    campaignId?: string;
    source: string;
    name: string;
    phone: string;
    email?: string;
    suburb?: string;
    serviceType?: string;
  }) {
    return this.prisma.marketingLead.create({ data });
  }

  async getLeads(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    return this.prisma.marketingLead.findMany({
      where,
      include: { campaign: { select: { name: true, platform: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaignMetrics() {
    const campaigns = await this.prisma.marketingCampaign.findMany({
      where: { status: 'ACTIVE' },
      include: { _count: { select: { leads: true } } },
    });

    const totalSpend = campaigns.reduce((sum, c) => sum + Number(c.spent), 0);
    const totalLeads = campaigns.reduce((sum, c) => sum + c._count.leads, 0);
    const costPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;

    return { activeCampaigns: campaigns.length, totalSpend, totalLeads, costPerLead, campaigns };
  }
}
