import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class JobsService {
  private readonly STATUS_TRANSITIONS: Record<string, string[]> = {
    PENDING: ['SCHEDULED', 'CANCELLED'],
    SCHEDULED: ['DISPATCHED', 'CANCELLED', 'PENDING'],
    DISPATCHED: ['EN_ROUTE', 'CANCELLED', 'SCHEDULED'],
    EN_ROUTE: ['ON_SITE', 'CANCELLED'],
    ON_SITE: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['PAUSED', 'COMPLETED', 'REQUIRES_FOLLOWUP'],
    PAUSED: ['IN_PROGRESS', 'CANCELLED'],
    COMPLETED: ['REQUIRES_FOLLOWUP'],
    REQUIRES_FOLLOWUP: ['SCHEDULED'],
  };

  constructor(private prisma: PrismaService) {}

  async create(branchId: string, userId: string, dto: CreateJobDto) {
    const jobNumber = await this.generateJobNumber(branchId);

    return this.prisma.job.create({
      data: {
        branchId,
        createdById: userId,
        jobNumber,
        customerId: dto.customerId,
        propertyId: dto.propertyId,
        type: dto.type,
        priority: dto.priority,
        title: dto.title,
        description: dto.description,
        scheduledStart: dto.scheduledStart,
        scheduledEnd: dto.scheduledEnd,
        estimatedDuration: dto.estimatedDuration,
        assignedToId: dto.assignedToId,
        tags: dto.tags || [],
      },
      include: {
        customer: true,
        property: true,
        assignedTo: true,
      },
    });
  }

  async findAll(branchId: string, pagination: PaginationDto & { status?: string; assignedToId?: string }) {
    const { page = 1, limit = 20, search, status, assignedToId } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { branchId };

    if (status) where.status = status;
    if (assignedToId) where.assignedToId = assignedToId;
    if (search) {
      where.OR = [
        { jobNumber: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { customer: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
          property: { select: { id: true, address: true, suburb: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { scheduledStart: 'asc' },
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data: jobs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        customer: true,
        property: true,
        assignedTo: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        jobItems: { include: { inventory: true } },
        jobTimeLogs: true,
        jobStatusHistory: { orderBy: { createdAt: 'desc' } },
        booking: true,
        quote: true,
        invoice: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async update(id: string, dto: UpdateJobDto) {
    await this.findById(id);
    return this.prisma.job.update({
      where: { id },
      data: dto,
      include: { customer: true, property: true, assignedTo: true },
    });
  }

  async updateStatus(id: string, userId: string, dto: UpdateJobStatusDto) {
    const job = await this.findById(id);

    const allowedTransitions = this.STATUS_TRANSITIONS[job.status] || [];
    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${job.status} to ${dto.status}. Allowed: ${allowedTransitions.join(', ')}`,
      );
    }

    const updateData: Record<string, unknown> = { status: dto.status };

    if (dto.status === 'IN_PROGRESS' && !job.actualStart) {
      updateData.actualStart = new Date();
    }
    if (dto.status === 'COMPLETED') {
      updateData.actualEnd = new Date();
      updateData.completionNotes = dto.reason;
    }

    const [updatedJob] = await Promise.all([
      this.prisma.job.update({ where: { id }, data: updateData }),
      this.prisma.jobStatusHistory.create({
        data: {
          jobId: id,
          fromStatus: job.status,
          toStatus: dto.status,
          changedBy: userId,
          reason: dto.reason,
        },
      }),
    ]);

    return updatedJob;
  }

  async assignTechnician(id: string, technicianId: string) {
    await this.findById(id);
    return this.prisma.job.update({
      where: { id },
      data: { assignedToId: technicianId },
      include: { assignedTo: true },
    });
  }

  async getJobsForTechnician(technicianId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.job.findMany({
      where: {
        assignedToId: technicianId,
        scheduledStart: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
      include: {
        customer: { select: { firstName: true, lastName: true, phone: true } },
        property: true,
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  async addTimeLog(jobId: string, userId: string, type: string, startTime: Date, endTime?: Date) {
    const duration = endTime
      ? Math.round((endTime.getTime() - startTime.getTime()) / 60000)
      : undefined;

    return this.prisma.jobTimeLog.create({
      data: {
        jobId,
        userId,
        type: type as 'TRAVEL' | 'WORK' | 'BREAK',
        startTime,
        endTime,
        duration,
      },
    });
  }

  private async generateJobNumber(branchId: string): Promise<string> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { code: true },
    });

    const count = await this.prisma.job.count({ where: { branchId } });
    const paddedNumber = String(count + 1).padStart(6, '0');
    return `${branch?.code || 'YG'}-${paddedNumber}`;
  }
}
