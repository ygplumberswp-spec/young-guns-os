import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: {
    supplierId: string;
    items: Array<{ inventoryId: string; quantity: number; unitPrice: number }>;
    notes?: string;
  }) {
    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const tax = subtotal * 0.1;

    return this.prisma.purchaseOrder.create({
      data: {
        supplierId: data.supplierId,
        orderNumber,
        subtotal,
        tax,
        total: subtotal + tax,
        createdBy: userId,
        notes: data.notes,
        items: {
          create: data.items.map((item) => ({
            inventoryId: item.inventoryId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          })),
        },
      },
      include: { items: { include: { inventory: true } }, supplier: true },
    });
  }

  async findAll(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    return this.prisma.purchaseOrder.findMany({
      where,
      include: { supplier: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: { include: { inventory: true } }, supplier: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async approve(id: string) {
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED' },
    });
  }

  async markOrdered(id: string) {
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'ORDERED', orderedAt: new Date() },
    });
  }

  async receiveItems(id: string, receivedItems: Array<{ itemId: string; quantity: number }>) {
    const po = await this.findById(id);

    for (const received of receivedItems) {
      await this.prisma.purchaseOrderItem.update({
        where: { id: received.itemId },
        data: { receivedQty: { increment: received.quantity } },
      });
    }

    const allItems = await this.prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: id },
    });
    const fullyReceived = allItems.every((item) => item.receivedQty >= item.quantity);

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        receivedAt: fullyReceived ? new Date() : undefined,
      },
    });
  }
}
