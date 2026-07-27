import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TechnicianService {
  constructor(private prisma: PrismaService) {}

  async getMyJobs(userId: string, date?: Date) {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.job.findMany({
      where: {
        assignedToId: userId,
        scheduledStart: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ['CANCELLED'] },
      },
      include: {
        customer: { select: { firstName: true, lastName: true, phone: true } },
        property: true,
        jobItems: true,
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  async updateLocation(userId: string, latitude: number, longitude: number) {
    await this.prisma.technicianProfile.update({
      where: { userId },
      data: {
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationUpdate: new Date(),
      },
    });
  }

  async startJob(userId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, assignedToId: userId },
    });
    if (!job) throw new NotFoundException('Job not found or not assigned to you');

    return this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'IN_PROGRESS', actualStart: new Date() },
    });
  }

  async completeJob(userId: string, jobId: string, notes?: string, photos?: string[]) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, assignedToId: userId },
    });
    if (!job) throw new NotFoundException('Job not found or not assigned to you');

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        actualEnd: new Date(),
        completionNotes: notes,
        photos: photos || [],
      },
    });
  }

  async addJobPhoto(jobId: string, photoUrl: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    return this.prisma.job.update({
      where: { id: jobId },
      data: { photos: [...job.photos, photoUrl] },
    });
  }

  async getProfile(userId: string) {
    return this.prisma.technicianProfile.findUnique({
      where: { userId },
      include: { user: true, vehicle: true },
    });
  }

  async setAvailability(userId: string, isAvailable: boolean) {
    return this.prisma.technicianProfile.update({
      where: { userId },
      data: { isAvailable },
    });
  }
}
