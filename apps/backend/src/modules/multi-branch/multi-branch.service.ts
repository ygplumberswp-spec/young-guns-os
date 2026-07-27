import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class MultiBranchService {
  constructor(private prisma: PrismaService) {}

  async createBranch(organizationId: string, data: {
    name: string;
    code: string;
    address?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    phone?: string;
    email?: string;
    latitude?: number;
    longitude?: number;
  }) {
    return this.prisma.branch.create({
      data: { organizationId, ...data },
    });
  }

  async getBranches(organizationId: string) {
    return this.prisma.branch.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { users: true, jobs: true, vehicles: true, warehouses: true },
        },
      },
    });
  }

  async getBranchById(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        users: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        _count: { select: { jobs: true, vehicles: true, bookings: true } },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async updateBranch(id: string, data: Record<string, unknown>) {
    return this.prisma.branch.update({ where: { id }, data });
  }

  async getBranchStats(organizationId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId },
      select: { id: true, name: true, code: true },
    });

    const stats = await Promise.all(
      branches.map(async (branch) => {
        const [activeJobs, monthlyRevenue, techCount] = await Promise.all([
          this.prisma.job.count({
            where: { branchId: branch.id, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
          }),
          this.prisma.invoice.aggregate({
            where: {
              branchId: branch.id,
              status: 'PAID',
              paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
            },
            _sum: { total: true },
          }),
          this.prisma.userBranch.count({ where: { branchId: branch.id } }),
        ]);

        return {
          ...branch,
          activeJobs,
          monthlyRevenue: monthlyRevenue._sum.total || 0,
          techCount,
        };
      }),
    );

    return stats;
  }
}
