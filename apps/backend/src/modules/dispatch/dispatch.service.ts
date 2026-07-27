import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface TechnicianAvailability {
  technicianId: string;
  name: string;
  currentJobCount: number;
  maxJobsPerDay: number;
  skills: string[];
  distanceKm: number;
  estimatedTravelMinutes: number;
  score: number;
}

interface DispatchRecommendation {
  jobId: string;
  recommendations: TechnicianAvailability[];
  autoAssigned: boolean;
  reason: string;
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(private prisma: PrismaService) {}

  async getAvailableTechnicians(branchId: string, date: Date, jobType?: string) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const technicians = await this.prisma.technicianProfile.findMany({
      where: {
        isAvailable: true,
        user: {
          isActive: true,
          branches: { some: { branchId } },
        },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const availabilityPromises = technicians.map(async (tech) => {
      const jobCount = await this.prisma.job.count({
        where: {
          assignedToId: tech.userId,
          scheduledStart: { gte: startOfDay, lte: endOfDay },
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
        },
      });

      return {
        technicianId: tech.userId,
        name: `${tech.user.firstName} ${tech.user.lastName}`,
        currentJobCount: jobCount,
        maxJobsPerDay: tech.maxJobsPerDay,
        skills: tech.skills,
        availableSlots: tech.maxJobsPerDay - jobCount,
      };
    });

    const availability = await Promise.all(availabilityPromises);
    return availability.filter((t) => t.availableSlots > 0);
  }

  async recommendTechnician(
    jobId: string,
    branchId: string,
  ): Promise<DispatchRecommendation> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { property: true },
    });

    if (!job) {
      return { jobId, recommendations: [], autoAssigned: false, reason: 'Job not found' };
    }

    const date = job.scheduledStart || new Date();
    const technicians = await this.getAvailableTechnicians(branchId, date);

    const scored: TechnicianAvailability[] = technicians.map((tech) => {
      let score = 100;

      // Penalize technicians with more jobs
      score -= tech.currentJobCount * 15;

      // Bonus for matching skills (based on job type)
      const jobTypeSkillMap: Record<string, string[]> = {
        REPAIR: ['general-plumbing', 'drain-clearing', 'leak-repair'],
        INSTALLATION: ['hot-water', 'renovation', 'new-builds'],
        MAINTENANCE: ['general-plumbing', 'preventive'],
        EMERGENCY: ['emergency', 'drain-clearing', 'leak-repair'],
      };

      const relevantSkills = jobTypeSkillMap[job.type] || [];
      const matchingSkills = tech.skills.filter((s) => relevantSkills.includes(s));
      score += matchingSkills.length * 10;

      return {
        ...tech,
        distanceKm: 0,
        estimatedTravelMinutes: 0,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const autoAssign = scored.length > 0 && scored[0].score >= 70;

    if (autoAssign) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          assignedToId: scored[0].technicianId,
          status: 'DISPATCHED',
        },
      });

      this.logger.log(
        `Auto-assigned job ${jobId} to ${scored[0].name} (score: ${scored[0].score})`,
      );
    }

    return {
      jobId,
      recommendations: scored.slice(0, 5),
      autoAssigned: autoAssign,
      reason: autoAssign
        ? `Auto-assigned to ${scored[0].name} based on availability and skills`
        : 'Manual assignment recommended - review options',
    };
  }

  async getDispatchBoard(branchId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [unassigned, dispatched, technicians] = await Promise.all([
      this.prisma.job.findMany({
        where: {
          branchId,
          assignedToId: null,
          status: { in: ['PENDING', 'SCHEDULED'] },
          scheduledStart: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          customer: { select: { firstName: true, lastName: true, phone: true } },
          property: { select: { address: true, suburb: true } },
        },
        orderBy: { priority: 'desc' },
      }),
      this.prisma.job.findMany({
        where: {
          branchId,
          assignedToId: { not: null },
          scheduledStart: { gte: startOfDay, lte: endOfDay },
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
        },
        include: {
          customer: { select: { firstName: true, lastName: true } },
          property: { select: { address: true, suburb: true } },
          assignedTo: { select: { firstName: true, lastName: true } },
        },
        orderBy: { scheduledStart: 'asc' },
      }),
      this.getAvailableTechnicians(branchId, date),
    ]);

    return { unassigned, dispatched, technicians, date };
  }
}
