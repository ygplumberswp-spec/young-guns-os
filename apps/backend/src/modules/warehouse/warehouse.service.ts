import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WarehouseService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, branchId: string, data: {
    name: string;
    code: string;
    address?: string;
    type?: string;
  }) {
    return this.prisma.warehouse.create({
      data: { organizationId, branchId, ...data } as any,
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.warehouse.findMany({
      where: { organizationId },
      include: {
        branch: { select: { name: true } },
        _count: { select: { stockLevels: true } },
      },
    });
  }

  async findById(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        stockLevels: { include: { inventory: true } },
        branch: true,
      },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async transferStock(
    inventoryId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    performedBy: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.stockLevel.update({
        where: { inventoryId_warehouseId: { inventoryId, warehouseId: fromWarehouseId } },
        data: { quantity: { decrement: quantity } },
      }),
      this.prisma.stockLevel.upsert({
        where: { inventoryId_warehouseId: { inventoryId, warehouseId: toWarehouseId } },
        update: { quantity: { increment: quantity } },
        create: { inventoryId, warehouseId: toWarehouseId, quantity },
      }),
      this.prisma.stockMovement.create({
        data: {
          inventoryId,
          warehouseId: fromWarehouseId,
          type: 'TRANSFERRED',
          quantity: -quantity,
          performedBy,
          notes: `Transfer to warehouse ${toWarehouseId}`,
        },
      }),
      this.prisma.stockMovement.create({
        data: {
          inventoryId,
          warehouseId: toWarehouseId,
          type: 'TRANSFERRED',
          quantity,
          performedBy,
          notes: `Transfer from warehouse ${fromWarehouseId}`,
        },
      }),
    ]);
  }
}
