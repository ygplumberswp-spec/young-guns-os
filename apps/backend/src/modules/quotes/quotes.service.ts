import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  async create(branchId: string, userId: string, data: {
    customerId: string;
    jobId?: string;
    title: string;
    description?: string;
    items: Array<{ description: string; quantity: number; unitPrice: number; isLabour?: boolean; inventoryId?: string }>;
    validDays?: number;
    notes?: string;
    terms?: string;
  }) {
    const quoteNumber = await this.generateQuoteNumber(branchId);

    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = subtotal * 0.1; // 10% GST
    const total = subtotal + taxAmount;

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + (data.validDays || 30));

    return this.prisma.quote.create({
      data: {
        branchId,
        createdById: userId,
        customerId: data.customerId,
        jobId: data.jobId,
        quoteNumber,
        title: data.title,
        description: data.description,
        subtotal,
        taxAmount,
        total,
        validUntil,
        notes: data.notes,
        terms: data.terms,
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

    const [quotes, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: { select: { firstName: true, lastName: true, companyName: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quote.count({ where }),
    ]);

    return { data: quotes, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } }, customer: true, job: true, createdBy: true },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async send(id: string) {
    const quote = await this.findById(id);
    if (quote.status !== 'DRAFT') {
      throw new BadRequestException('Only draft quotes can be sent');
    }
    return this.prisma.quote.update({ where: { id }, data: { status: 'SENT' } });
  }

  async accept(id: string) {
    const quote = await this.findById(id);
    if (!['SENT', 'VIEWED'].includes(quote.status)) {
      throw new BadRequestException('Quote cannot be accepted in current status');
    }
    return this.prisma.quote.update({
      where: { id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
  }

  async reject(id: string, reason?: string) {
    return this.prisma.quote.update({
      where: { id },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
    });
  }

  async getExpiredQuotes(branchId: string) {
    return this.prisma.quote.findMany({
      where: {
        branchId,
        status: 'SENT',
        validUntil: { lt: new Date() },
      },
      include: { customer: true },
    });
  }

  async getFollowUpRequired(branchId: string) {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    return this.prisma.quote.findMany({
      where: {
        branchId,
        status: 'SENT',
        createdAt: { lt: twoDaysAgo },
        validUntil: { gt: new Date() },
      },
      include: { customer: true },
    });
  }

  private async generateQuoteNumber(branchId: string): Promise<string> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { code: true },
    });
    const count = await this.prisma.quote.count({ where: { branchId } });
    return `Q-${branch?.code || 'YG'}-${String(count + 1).padStart(5, '0')}`;
  }
}
