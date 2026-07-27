import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  async create(customerId: string, data: {
    type?: string;
    address: string;
    unit?: string;
    suburb: string;
    state: string;
    postcode: string;
    latitude?: number;
    longitude?: number;
    accessNotes?: string;
    parkingInfo?: string;
    petInfo?: string;
  }) {
    return this.prisma.property.create({
      data: { customerId, ...data } as any,
    });
  }

  async findByCustomer(customerId: string) {
    return this.prisma.property.findMany({
      where: { customerId },
      include: {
        _count: { select: { jobs: true } },
        maintenanceSchedules: { where: { isActive: true } },
        warranties: { where: { status: 'ACTIVE' } },
      },
    });
  }

  async findById(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        customer: true,
        jobs: { take: 10, orderBy: { createdAt: 'desc' } },
        maintenanceSchedules: true,
        warranties: true,
      },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async update(id: string, data: Record<string, unknown>) {
    await this.findById(id);
    return this.prisma.property.update({ where: { id }, data });
  }
}
