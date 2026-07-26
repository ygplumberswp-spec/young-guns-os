import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(branchId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      todayJobs,
      monthJobs,
      pendingBookings,
      overdueInvoices,
      monthRevenue,
      openQuotes,
    ] = await Promise.all([
      this.prisma.job.count({
        where: { branchId, scheduledStart: { gte: today } },
      }),
      this.prisma.job.count({
        where: { branchId, createdAt: { gte: startOfMonth } },
      }),
      this.prisma.booking.count({
        where: { branchId, status: 'PENDING' },
      }),
      this.prisma.invoice.count({
        where: { branchId, status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() } },
      }),
      this.prisma.invoice.aggregate({
        where: { branchId, status: 'PAID', paidAt: { gte: startOfMonth } },
        _sum: { total: true },
      }),
      this.prisma.quote.count({
        where: { branchId, status: { in: ['SENT', 'VIEWED'] } },
      }),
    ]);

    return {
      todayJobs,
      monthJobs,
      pendingBookings,
      overdueInvoices,
      monthRevenue: monthRevenue._sum.total || 0,
      openQuotes,
    };
  }

  async getRevenueReport(branchId: string, startDate: Date, endDate: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        branchId,
        status: 'PAID',
        paidAt: { gte: startDate, lte: endDate },
      },
      select: { total: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    });

    return {
      total: invoices.reduce((sum, i) => sum + Number(i.total), 0),
      count: invoices.length,
      period: { startDate, endDate },
      dailyRevenue: this.groupByDay(invoices),
    };
  }

  async getTechnicianPerformance(branchId: string, startDate: Date, endDate: Date) {
    const jobs = await this.prisma.job.findMany({
      where: {
        branchId,
        status: 'COMPLETED',
        actualEnd: { gte: startDate, lte: endDate },
        assignedToId: { not: null },
      },
      include: {
        assignedTo: { select: { firstName: true, lastName: true } },
        jobTimeLogs: true,
      },
    });

    const byTechnician = new Map<string, { name: string; jobs: number; totalHours: number }>();

    for (const job of jobs) {
      const techId = job.assignedToId!;
      const current = byTechnician.get(techId) || {
        name: `${job.assignedTo!.firstName} ${job.assignedTo!.lastName}`,
        jobs: 0,
        totalHours: 0,
      };

      current.jobs++;
      const workLogs = job.jobTimeLogs.filter((l) => l.type === 'WORK');
      current.totalHours += workLogs.reduce((sum, l) => sum + (l.duration || 0), 0) / 60;

      byTechnician.set(techId, current);
    }

    return Array.from(byTechnician.entries()).map(([id, data]) => ({
      technicianId: id,
      ...data,
      avgHoursPerJob: data.jobs > 0 ? data.totalHours / data.jobs : 0,
    }));
  }

  async getJobTypeBreakdown(branchId: string, startDate: Date, endDate: Date) {
    const jobs = await this.prisma.job.groupBy({
      by: ['type'],
      where: { branchId, createdAt: { gte: startDate, lte: endDate } },
      _count: true,
    });
    return jobs;
  }

  private groupByDay(records: Array<{ total: any; paidAt: Date | null }>) {
    const grouped: Record<string, number> = {};
    for (const record of records) {
      if (!record.paidAt) continue;
      const day = record.paidAt.toISOString().split('T')[0];
      grouped[day] = (grouped[day] || 0) + Number(record.total);
    }
    return grouped;
  }
}
