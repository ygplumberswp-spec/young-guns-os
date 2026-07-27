import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateCustomerDto) {
    const { branchId, ...customerData } = dto;
    return this.prisma.customer.create({
      data: {
        organizationId,
        ...customerData,
      },
      include: { properties: true },
    });
  }

  async findAll(organizationId: string, pagination: PaginationDto & { phone?: string }) {
    const { page = 1, limit = 20, search, phone } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };

    if (phone) {
      where.phone = { contains: phone };
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        include: {
          properties: true,
          _count: { select: { jobs: true, invoices: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        properties: true,
        jobs: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        quotes: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        communications: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        reviews: true,
        warranties: { where: { status: 'ACTIVE' } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findById(id);
    return this.prisma.customer.update({
      where: { id },
      data: dto,
      include: { properties: true },
    });
  }

  async findByPhone(organizationId: string, phone: string) {
    return this.prisma.customer.findFirst({
      where: { organizationId, phone },
      include: { properties: true },
    });
  }

  async updateLifetimeValue(id: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { customerId: id, status: 'PAID' },
      select: { total: true },
    });

    const lifetimeValue = invoices.reduce(
      (sum, inv) => sum + Number(inv.total),
      0,
    );

    return this.prisma.customer.update({
      where: { id },
      data: { lifetimeValue },
    });
  }

  async getTopCustomers(organizationId: string, limit = 10) {
    return this.prisma.customer.findMany({
      where: { organizationId, isActive: true },
      orderBy: { lifetimeValue: 'desc' },
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyName: true,
        lifetimeValue: true,
        _count: { select: { jobs: true } },
      },
    });
  }
}
