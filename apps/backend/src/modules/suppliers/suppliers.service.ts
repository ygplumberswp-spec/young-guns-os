import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, data: {
    name: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    accountNumber?: string;
    paymentTerms?: number;
  }) {
    return this.prisma.supplier.create({ data: { organizationId, ...data } });
  }

  async findAll(organizationId: string) {
    return this.prisma.supplier.findMany({
      where: { organizationId, isActive: true },
      include: { _count: { select: { inventoryItems: true, purchaseOrders: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { inventoryItems: true, purchaseOrders: { take: 10, orderBy: { createdAt: 'desc' } } },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, data: Record<string, unknown>) {
    return this.prisma.supplier.update({ where: { id }, data });
  }
}
