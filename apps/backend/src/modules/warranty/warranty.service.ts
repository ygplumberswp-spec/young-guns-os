import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WarrantyService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    customerId: string;
    propertyId: string;
    jobId?: string;
    type: string;
    description: string;
    startDate: string;
    endDate: string;
    terms?: string;
  }) {
    return this.prisma.warranty.create({
      data: {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      } as any,
    });
  }

  async findActive(customerId?: string) {
    const where: Record<string, unknown> = { status: 'ACTIVE' };
    if (customerId) where.customerId = customerId;
    return this.prisma.warranty.findMany({
      where,
      include: { customer: true, property: true },
      orderBy: { endDate: 'asc' },
    });
  }

  async getExpiringSoon(days = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.prisma.warranty.findMany({
      where: { status: 'ACTIVE', endDate: { lte: futureDate, gte: new Date() } },
      include: { customer: true, property: true },
    });
  }

  async claim(id: string) {
    return this.prisma.warranty.update({ where: { id }, data: { status: 'CLAIMED' } });
  }
}
