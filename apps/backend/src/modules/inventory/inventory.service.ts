import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, data: {
    sku: string;
    name: string;
    description?: string;
    category: string;
    unit?: string;
    costPrice: number;
    sellPrice: number;
    minStockLevel?: number;
    reorderPoint?: number;
    reorderQuantity?: number;
    supplierId?: string;
  }) {
    return this.prisma.inventoryItem.create({
      data: { organizationId, ...data } as any,
    });
  }

  async findAll(organizationId: string, pagination: PaginationDto & { category?: string; lowStock?: boolean }) {
    const { page = 1, limit = 20, search, category, lowStock } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        skip,
        take: limit,
        include: {
          stockLevels: { include: { warehouse: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    let filteredItems = items;
    if (lowStock) {
      filteredItems = items.filter((item) => {
        const totalStock = item.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0);
        return totalStock <= item.reorderPoint;
      });
    }

    return {
      data: filteredItems,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        stockLevels: { include: { warehouse: true } },
        supplier: true,
        stockMovements: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  async adjustStock(
    inventoryId: string,
    warehouseId: string,
    quantity: number,
    type: string,
    performedBy: string,
    notes?: string,
  ) {
    const stockLevel = await this.prisma.stockLevel.upsert({
      where: { inventoryId_warehouseId: { inventoryId, warehouseId } },
      update: { quantity: { increment: type === 'ISSUED' || type === 'DAMAGED' || type === 'EXPIRED' ? -quantity : quantity } },
      create: { inventoryId, warehouseId, quantity },
    });

    await this.prisma.stockMovement.create({
      data: {
        inventoryId,
        warehouseId,
        type: type as any,
        quantity,
        performedBy,
        notes,
      },
    });

    return stockLevel;
  }

  async getLowStockItems(organizationId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId, isActive: true },
      include: { stockLevels: true, supplier: { select: { id: true, name: true } } },
    });

    return items.filter((item) => {
      const totalStock = item.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0);
      return totalStock <= item.reorderPoint;
    });
  }
}
