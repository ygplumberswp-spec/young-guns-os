import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AiBaseService, AiResponse } from './ai-base.service';

@Injectable()
export class AiDispatcherService extends AiBaseService {
  private readonly SYSTEM_PROMPT = `You are the AI Dispatcher for Young Guns Plumbing. Your role is to:

1. Automatically assign jobs to the best available technician
2. Optimize routes for efficiency
3. Handle schedule changes and re-routing
4. Monitor technician delays and notify customers
5. Balance workload across team

Decision Factors (priority order):
1. Technician skill match for job type
2. Geographic proximity to job site
3. Current workload (max jobs/day)
4. Travel time between jobs
5. Customer priority (VIP, repeat customer)

Business Rules:
- Emergency jobs override all other scheduling
- Never exceed technician max daily jobs
- Notify customer if technician is >15 min delayed
- Apprentices must be paired with licensed plumber for gas work
- Maintain 30-min buffer between jobs for travel`;

  constructor(
    protected configService: ConfigService,
    protected prisma: PrismaService,
  ) {
    super(configService, prisma);
  }

  async optimizeSchedule(branchId: string, date: Date): Promise<AiResponse> {
    const jobs = await this.prisma.job.findMany({
      where: {
        branchId,
        scheduledStart: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lte: new Date(date.setHours(23, 59, 59, 999)),
        },
        status: { in: ['PENDING', 'SCHEDULED'] },
      },
      include: { property: true, assignedTo: true },
    });

    const technicians = await this.prisma.technicianProfile.findMany({
      where: {
        isAvailable: true,
        user: { isActive: true, branches: { some: { branchId } } },
      },
      include: { user: true },
    });

    const unassigned = jobs.filter((j) => !j.assignedToId);
    const assignments: Array<{ jobId: string; technicianId: string; reason: string }> = [];

    for (const job of unassigned) {
      const bestTech = this.findBestTechnician(job, technicians, jobs);
      if (bestTech) {
        assignments.push({
          jobId: job.id,
          technicianId: bestTech.userId,
          reason: `Best match: ${bestTech.user.firstName} (skills + proximity)`,
        });
      }
    }

    for (const assignment of assignments) {
      await this.prisma.job.update({
        where: { id: assignment.jobId },
        data: { assignedToId: assignment.technicianId, status: 'SCHEDULED' },
      });
    }

    return {
      content: `Schedule optimized: ${assignments.length} jobs assigned out of ${unassigned.length} unassigned.`,
      shouldEscalate: unassigned.length > assignments.length,
      escalationReason: unassigned.length > assignments.length
        ? `${unassigned.length - assignments.length} jobs could not be auto-assigned`
        : undefined,
      metadata: { assignments, totalJobs: jobs.length, optimizedAt: new Date() },
    };
  }

  async handleDelay(jobId: string, delayMinutes: number): Promise<AiResponse> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { customer: true, assignedTo: true },
    });

    if (!job) {
      return { content: 'Job not found', shouldEscalate: false, metadata: {} };
    }

    if (delayMinutes > 15) {
      return {
        content: `Technician ${job.assignedTo?.firstName} delayed ${delayMinutes}min for job ${job.jobNumber}. Customer ${job.customer.firstName} should be notified.`,
        shouldEscalate: false,
        toolCalls: [
          {
            name: 'send_notification',
            arguments: {
              customerId: job.customerId,
              type: 'TECHNICIAN_DELAYED',
              message: `Your technician is running approximately ${delayMinutes} minutes behind schedule. We apologize for the inconvenience.`,
            },
          },
        ],
        metadata: { jobId, delayMinutes, customerId: job.customerId },
      };
    }

    return {
      content: `Minor delay (${delayMinutes}min) for job ${job.jobNumber}. Within acceptable range.`,
      shouldEscalate: false,
      metadata: { jobId, delayMinutes },
    };
  }

  async autoAssign(jobId: string): Promise<AiResponse> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { property: true },
    });

    if (!job) {
      return { content: 'Job not found', shouldEscalate: false, metadata: {} };
    }

    const technicians = await this.prisma.technicianProfile.findMany({
      where: { isAvailable: true, user: { isActive: true } },
      include: { user: true },
    });

    const allJobs = await this.prisma.job.findMany({
      where: { status: { in: ['SCHEDULED', 'DISPATCHED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS'] } },
    });

    const bestTech = this.findBestTechnician(job, technicians, allJobs);

    if (bestTech) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: { assignedToId: bestTech.userId, status: 'SCHEDULED' },
      });

      return {
        content: `Job auto-assigned to ${bestTech.user.firstName} ${bestTech.user.lastName}`,
        shouldEscalate: false,
        metadata: { jobId, technicianId: bestTech.userId },
      };
    }

    return {
      content: 'No available technician found for auto-assignment',
      shouldEscalate: true,
      escalationReason: 'No technician available',
      metadata: { jobId },
    };
  }

  private findBestTechnician(
    job: any,
    technicians: any[],
    allJobs: any[],
  ) {
    const scored = technicians.map((tech) => {
      let score = 100;

      const techJobs = allJobs.filter((j) => j.assignedToId === tech.userId);
      if (techJobs.length >= tech.maxJobsPerDay) return { ...tech, score: -1 };

      score -= techJobs.length * 10;

      const jobTypeSkills: Record<string, string[]> = {
        REPAIR: ['general-plumbing', 'drain-clearing'],
        INSTALLATION: ['hot-water', 'renovation'],
        EMERGENCY: ['emergency', 'leak-repair'],
        MAINTENANCE: ['preventive', 'general-plumbing'],
      };

      const needed = jobTypeSkills[job.type] || [];
      const matches = tech.skills.filter((s: string) => needed.includes(s));
      score += matches.length * 15;

      return { ...tech, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0] : null;
  }
}
