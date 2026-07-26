import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async create(branchId: string, userId: string, data: {
    customerId: string;
    jobId?: string;
    items: Array<{ description: string; quantity: number; unitPrice: number; isLabour?: boolean; inventoryId?: string }>;
    dueInDays?: number;
    notes?: string;
    paymentTerms?: string;
  }) {
    const invoiceNumber = await this.generateInvoiceNumber(branchId);

    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = subtotal * 0.1;
    const total = subtotal + taxAmount;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (data.dueInDays || 14));

    return this.prisma.invoice.create({
      data: {
        branchId,
        createdById: userId,
        customerId: data.customerId,
        jobId: data.jobId,
        invoiceNumber,
        subtotal,
        taxAmount,
        total,
        dueDate,
        notes: data.notes,
        paymentTerms: data.paymentTerms,
        items: {
          create: data.items.map((item, index) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            isLabour: item.isLabour || false,
            inventoryId: item.inventoryId,
            sortOrder: index,
          })),
        },
      },
      include: { items: true, customer: true },
    });
  }

  async findAll(branchId: string, pagination: PaginationDto & { status?: string }) {
    const { page = 1, limit = 20, status } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { branchId };
    if (status) where.status = status;

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: { select: { firstName: true, lastName: true, companyName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data: invoices, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } }, customer: true, job: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async send(id: string) {
    const invoice = await this.findById(id);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Only draft invoices can be sent');
    return this.prisma.invoice.update({ where: { id }, data: { status: 'SENT' } });
  }

  async recordPayment(id: string, amount: number, method: string, reference?: string) {
    const invoice = await this.findById(id);
    const newAmountPaid = Number(invoice.amountPaid) + amount;
    const isFullyPaid = newAmountPaid >= Number(invoice.total);

    await this.prisma.payment.create({
      data: { invoiceId: id, amount, method: method as any, reference, paidAt: new Date() },
    });

    return this.prisma.invoice.update({
      where: { id },
      data: {
        amountPaid: newAmountPaid,
        status: isFullyPaid ? 'PAID' : 'PARTIALLY_PAID',
        paidAt: isFullyPaid ? new Date() : undefined,
      },
      include: { payments: true },
    });
  }

  async getOverdueInvoices(branchId: string) {
    return this.prisma.invoice.findMany({
      where: {
        branchId,
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: new Date() },
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getRevenueStats(branchId: string, startDate: Date, endDate: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        branchId,
        status: 'PAID',
        paidAt: { gte: startDate, lte: endDate },
      },
      select: { total: true, paidAt: true },
    });

    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    return { totalRevenue, invoiceCount: invoices.length, period: { startDate, endDate } };
  }

  private async generateInvoiceNumber(branchId: string): Promise<string> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { code: true },
    });
    const count = await this.prisma.invoice.count({ where: { branchId } });
    return `INV-${branch?.code || 'YG'}-${String(count + 1).padStart(5, '0')}`;
  }
}
