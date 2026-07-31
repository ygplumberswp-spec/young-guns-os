import { and, asc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import type {
  JobAssignee,
  ScheduleJobRequest,
  ScheduledJobEvent,
  SchedulingCalendarResponse,
  SchedulingStats,
  UpdateScheduleRequest,
} from '@titan/shared';
import { buildJobAddressDisplay } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { jobs, users } from '@titan/db';
import { JobsError } from './jobs.service.js';

export class SchedulingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SchedulingError';
  }
}

export type AuraSchedulingContext = {
  scheduledCount: number;
  upcomingEvents: ScheduledJobEvent[];
  assigneeWorkload: Array<{
    userId: string;
    userName: string;
    scheduledJobCount: number;
  }>;
};

export class SchedulingService {
  constructor(private readonly db: DatabaseClient) {}

  async listAssignees(companyId: string): Promise<JobAssignee[]> {
    const members = await this.db.query.users.findMany({
      where: and(eq(users.companyId, companyId), eq(users.isActive, true)),
      with: { role: true },
      orderBy: [asc(users.firstName), asc(users.lastName)],
    });

    return members.map((member) => ({
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      roleName: member.role?.name ?? 'Unknown',
    }));
  }

  async getStats(companyId: string): Promise<SchedulingStats> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), isNotNull(jobs.scheduledAt)));

    return {
      scheduledCount: row?.count ?? 0,
    };
  }

  async getCalendar(companyId: string, from: Date, to: Date): Promise<SchedulingCalendarResponse> {
    if (from >= to) {
      throw new SchedulingError('VALIDATION_ERROR', 'Calendar range end must be after start');
    }

    const rows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        isNotNull(jobs.scheduledAt),
        gte(jobs.scheduledAt, from),
        lt(jobs.scheduledAt, to),
      ),
      with: {
        customer: true,
        assignedUser: true,
      },
      orderBy: [asc(jobs.scheduledAt)],
    });

    const events = rows.map(toScheduledJobEvent);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      scheduledCount: events.length,
      events,
    };
  }

  async scheduleJob(
    companyId: string,
    jobId: string,
    input: ScheduleJobRequest,
  ): Promise<ScheduledJobEvent> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });

    if (!job) {
      throw new SchedulingError('NOT_FOUND', 'Job not found');
    }

    const scheduledAt = parseRequiredDate(input.scheduledAt);
    const scheduledEndAt = parseOptionalDate(input.scheduledEndAt);

    validateScheduleRange(scheduledAt, scheduledEndAt);

    if (input.assignedUserId) {
      await this.ensureAssigneeBelongsToCompany(companyId, input.assignedUserId);
    }

    const [updated] = await this.db
      .update(jobs)
      .set({
        scheduledAt,
        scheduledEndAt,
        assignedUserId: input.assignedUserId ?? null,
        status: job.status === 'new' ? 'scheduled' : job.status,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new SchedulingError('SCHEDULE_FAILED', 'Unable to schedule job');
    }

    return (await this.getScheduledJobEvent(companyId, jobId))!;
  }

  async updateSchedule(
    companyId: string,
    jobId: string,
    input: UpdateScheduleRequest,
  ): Promise<ScheduledJobEvent | null> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });

    if (!job) {
      throw new SchedulingError('NOT_FOUND', 'Job not found');
    }

    if (input.clearSchedule) {
      const [cleared] = await this.db
        .update(jobs)
        .set({
          scheduledAt: null,
          scheduledEndAt: null,
          assignedUserId: null,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
        .returning();

      if (!cleared) {
        throw new SchedulingError('SCHEDULE_FAILED', 'Unable to clear schedule');
      }

      return null;
    }

    const scheduledAt =
      input.scheduledAt === undefined
        ? job.scheduledAt
        : input.scheduledAt
          ? parseRequiredDate(input.scheduledAt)
          : null;

    const scheduledEndAt =
      input.scheduledEndAt === undefined
        ? job.scheduledEndAt
        : parseOptionalDate(input.scheduledEndAt);

    if (!scheduledAt) {
      throw new SchedulingError('VALIDATION_ERROR', 'Scheduled start time is required');
    }

    validateScheduleRange(scheduledAt, scheduledEndAt);

    if (input.assignedUserId) {
      await this.ensureAssigneeBelongsToCompany(companyId, input.assignedUserId);
    }

    const [updated] = await this.db
      .update(jobs)
      .set({
        scheduledAt,
        scheduledEndAt,
        assignedUserId:
          input.assignedUserId === undefined ? job.assignedUserId : (input.assignedUserId ?? null),
        status: job.status === 'new' ? 'scheduled' : job.status,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new SchedulingError('SCHEDULE_FAILED', 'Unable to update schedule');
    }

    return (await this.getScheduledJobEvent(companyId, jobId))!;
  }

  async buildAuraContext(companyId: string): Promise<AuraSchedulingContext> {
    const stats = await this.getStats(companyId);

    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const calendar = await this.getCalendar(companyId, now, horizon);

    const workloadRows = await this.db
      .select({
        userId: jobs.assignedUserId,
        count: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          isNotNull(jobs.scheduledAt),
          isNotNull(jobs.assignedUserId),
        ),
      )
      .groupBy(jobs.assignedUserId);

    const assignees = await this.listAssignees(companyId);
    const assigneeNameById = new Map(
      assignees.map((assignee) => [assignee.id, `${assignee.firstName} ${assignee.lastName}`]),
    );

    const assigneeWorkload = workloadRows
      .filter((row) => row.userId)
      .map((row) => ({
        userId: row.userId!,
        userName: assigneeNameById.get(row.userId!) ?? 'Unknown',
        scheduledJobCount: row.count,
      }))
      .sort((a, b) => b.scheduledJobCount - a.scheduledJobCount);

    return {
      scheduledCount: stats.scheduledCount,
      upcomingEvents: calendar.events.slice(0, 20),
      assigneeWorkload,
    };
  }

  private async getScheduledJobEvent(
    companyId: string,
    jobId: string,
  ): Promise<ScheduledJobEvent | null> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId), isNotNull(jobs.scheduledAt)),
      with: {
        customer: true,
        assignedUser: true,
      },
    });

    if (!job || !job.scheduledAt) {
      return null;
    }

    return toScheduledJobEvent(job);
  }

  private async ensureAssigneeBelongsToCompany(companyId: string, userId: string): Promise<void> {
    const assignee = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.companyId, companyId), eq(users.isActive, true)),
    });

    if (!assignee) {
      throw new SchedulingError('ASSIGNEE_NOT_FOUND', 'Team member not found for this company');
    }
  }
}

type JobWithRelations = typeof jobs.$inferSelect & {
  customer: { name: string } | null;
  assignedUser: { firstName: string; lastName: string } | null;
};

function toScheduledJobEvent(job: JobWithRelations): ScheduledJobEvent {
  if (!job.scheduledAt) {
    throw new JobsError('VALIDATION_ERROR', 'Job is not scheduled');
  }

  const addressDisplay =
    buildJobAddressDisplay({
      street: job.snapshotStreet,
      suburb: job.snapshotSuburb,
      city: job.snapshotCity,
      province: job.snapshotProvince,
      postalCode: job.snapshotPostalCode,
      unit: job.snapshotUnit,
    }) ?? null;

  return {
    id: job.id,
    jobNumber: job.jobNumber ?? null,
    title: job.title,
    status: job.status,
    priority: job.priority ?? 'normal',
    jobType: job.jobType ?? null,
    customerId: job.customerId,
    customerName: job.snapshotCustomerName ?? job.customer?.name ?? 'Unknown',
    suburb: job.snapshotSuburb ?? null,
    addressDisplay,
    siteContactName: job.snapshotSiteContactName ?? null,
    siteContactMobile: job.snapshotSiteContactMobile ?? null,
    accessWarning: Boolean(job.accessInstructions?.trim()),
    accessInstructions: job.accessInstructions ?? null,
    scheduledAt: job.scheduledAt.toISOString(),
    scheduledEndAt: job.scheduledEndAt ? job.scheduledEndAt.toISOString() : null,
    assignedUserId: job.assignedUserId,
    assignedUserName: job.assignedUser
      ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`
      : null,
    vehicleLabel: null,
    crewLabel: job.assignedUser
      ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`.trim()
      : null,
  };
}

function parseRequiredDate(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new SchedulingError('VALIDATION_ERROR', 'Invalid scheduled date');
  }

  return parsed;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }

  return parseRequiredDate(value);
}

function validateScheduleRange(start: Date, end: Date | null): void {
  if (end && end <= start) {
    throw new SchedulingError('VALIDATION_ERROR', 'Scheduled end must be after start');
  }
}
