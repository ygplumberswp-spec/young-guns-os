import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(data: {
    organizationId: string;
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({ data: data as any });
  }

  async findAll(organizationId: string, pagination: PaginationDto & {
    resource?: string;
    userId?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, limit = 50, resource, userId, action, startDate, endDate } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (resource) where.resource = resource;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as any).gte = new Date(startDate);
      if (endDate) (where.createdAt as any).lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
