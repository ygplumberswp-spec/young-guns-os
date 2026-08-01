import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type {
  JobAssignee,
  ScheduleJobRequest,
  ScheduledJobEvent,
  SchedulingCalendarFilters,
  SchedulingCalendarResponse,
  SchedulingStats,
  UpdateScheduleRequest,
} from '@titan/shared';
import { buildJobAddressDisplay, mapCalendarJobDisplayStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  jobs,
  jobCrewMembers,
  jobVehicleAssignments,
  schedulingOverrideAudits,
  users,
  vehicles,
} from '@titan/db';
import { resolveCalendarViewScope, type SchedulingAuthContext } from './scheduling-access.js';
import { JobsError } from './jobs.service.js';
import { upsertPrimaryCrewMember } from './job-execution.service.js';
import {
  formatSchedulingCrewLabel,
  formatSchedulingVehicleLabel,
} from './scheduling-execution-labels.js';
import { SchedulingConflictService } from './scheduling-conflict.service.js';

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
  private readonly conflictService: SchedulingConflictService;

  constructor(private readonly db: DatabaseClient) {
    this.conflictService = new SchedulingConflictService(db);
  }

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

  async getCalendar(
    companyId: string,
    from: Date,
    to: Date,
    identity: SchedulingAuthContext = {
      userId: '',
      roleName: 'Company Owner',
      permissions: ['*'],
    },
    filters: SchedulingCalendarFilters = {},
  ): Promise<SchedulingCalendarResponse> {
    if (from >= to) {
      throw new SchedulingError('VALIDATION_ERROR', 'Calendar range end must be after start');
    }

    const viewScope = resolveCalendarViewScope(identity);
    const settings = await this.conflictService.buildSettingsSummary(companyId);

    const rows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        isNotNull(jobs.scheduledAt),
        gte(jobs.scheduledAt, from),
        lt(jobs.scheduledAt, to),
        viewScope === 'own' ? eq(jobs.assignedUserId, identity.userId) : undefined,
        filters.technicianId ? eq(jobs.assignedUserId, filters.technicianId) : undefined,
        filters.status ? eq(jobs.status, filters.status as typeof jobs.$inferSelect.status) : undefined,
        filters.priority
          ? eq(jobs.priority, filters.priority as typeof jobs.$inferSelect.priority)
          : undefined,
        filters.suburb ? eq(jobs.snapshotSuburb, filters.suburb) : undefined,
      ),
      with: {
        customer: true,
        assignedUser: true,
      },
      orderBy: [asc(jobs.scheduledAt)],
    });

    const executionLabels = await this.loadExecutionLabels(
      companyId,
      rows.map((row) => row.id),
    );
    const events = rows.map((row) => toScheduledJobEvent(row, executionLabels.get(row.id)));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      scheduledCount: events.length,
      viewScope,
      events,
      settings,
    };
  }

  async scheduleJob(
    companyId: string,
    jobId: string,
    input: ScheduleJobRequest,
    identity: SchedulingAuthContext,
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

    await this.assertScheduleAllowed(companyId, identity, jobId, {
      scheduledAt,
      scheduledEndAt,
      assignedUserId: input.assignedUserId ?? null,
      overrideReason: input.overrideReason ?? null,
      acknowledgeConflicts: input.acknowledgeConflicts ?? false,
    });

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

    if (input.assignedUserId) {
      await upsertPrimaryCrewMember(this.db, {
        companyId,
        jobId,
        userId: input.assignedUserId,
        assignedByUserId: identity.userId,
      });
    }

    return (await this.getScheduledJobEvent(companyId, jobId))!;
  }

  private async loadExecutionLabels(
    companyId: string,
    jobIds: string[],
  ): Promise<Map<string, { crewLabel: string | null; vehicleLabel: string | null }>> {
    const labels = new Map<string, { crewLabel: string | null; vehicleLabel: string | null }>();
    if (jobIds.length === 0) {
      return labels;
    }

    for (const jobId of jobIds) {
      labels.set(jobId, { crewLabel: null, vehicleLabel: null });
    }

    const crewRows = await this.db
      .select({
        jobId: jobCrewMembers.jobId,
        firstName: users.firstName,
        lastName: users.lastName,
        isPrimary: jobCrewMembers.isPrimary,
      })
      .from(jobCrewMembers)
      .innerJoin(users, eq(jobCrewMembers.userId, users.id))
      .where(
        and(
          eq(jobCrewMembers.companyId, companyId),
          inArray(jobCrewMembers.jobId, jobIds),
          isNull(jobCrewMembers.unassignedAt),
        ),
      )
      .orderBy(desc(jobCrewMembers.isPrimary), asc(jobCrewMembers.assignedAt));

    const crewNamesByJob = new Map<string, string[]>();
    for (const row of crewRows) {
      const names = crewNamesByJob.get(row.jobId) ?? [];
      names.push(`${row.firstName} ${row.lastName}`.trim());
      crewNamesByJob.set(row.jobId, names);
    }

    for (const [jobId, names] of crewNamesByJob) {
      const current = labels.get(jobId) ?? { crewLabel: null, vehicleLabel: null };
      current.crewLabel = formatSchedulingCrewLabel(names);
      labels.set(jobId, current);
    }

    const vehicleRows = await this.db
      .select({
        jobId: jobVehicleAssignments.jobId,
        name: vehicles.name,
        licensePlate: vehicles.licensePlate,
      })
      .from(jobVehicleAssignments)
      .innerJoin(vehicles, eq(jobVehicleAssignments.vehicleId, vehicles.id))
      .where(
        and(
          eq(jobVehicleAssignments.companyId, companyId),
          inArray(jobVehicleAssignments.jobId, jobIds),
          isNull(jobVehicleAssignments.unassignedAt),
        ),
      )
      .orderBy(asc(jobVehicleAssignments.assignedAt));

    for (const row of vehicleRows) {
      const current = labels.get(row.jobId) ?? { crewLabel: null, vehicleLabel: null };
      if (!current.vehicleLabel) {
        current.vehicleLabel = formatSchedulingVehicleLabel(row.name, row.licensePlate);
        labels.set(row.jobId, current);
      }
    }

    return labels;
  }

  async updateSchedule(
    companyId: string,
    jobId: string,
    input: UpdateScheduleRequest,
    identity: SchedulingAuthContext,
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

    const nextAssignee =
      input.assignedUserId === undefined ? job.assignedUserId : (input.assignedUserId ?? null);

    if (input.assignedUserId) {
      await this.ensureAssigneeBelongsToCompany(companyId, input.assignedUserId);
    }

    await this.assertScheduleAllowed(companyId, identity, jobId, {
      scheduledAt,
      scheduledEndAt,
      assignedUserId: nextAssignee,
      overrideReason: input.overrideReason ?? null,
      acknowledgeConflicts: input.acknowledgeConflicts ?? false,
    });

    const [updated] = await this.db
      .update(jobs)
      .set({
        scheduledAt,
        scheduledEndAt,
        assignedUserId: nextAssignee,
        status: job.status === 'new' ? 'scheduled' : job.status,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new SchedulingError('SCHEDULE_FAILED', 'Unable to update schedule');
    }

    if (nextAssignee) {
      await upsertPrimaryCrewMember(this.db, {
        companyId,
        jobId,
        userId: nextAssignee,
        assignedByUserId: identity.userId,
      });
    }

    return (await this.getScheduledJobEvent(companyId, jobId))!;
  }

  getConflictService(): SchedulingConflictService {
    return this.conflictService;
  }

  private async assertScheduleAllowed(
    companyId: string,
    identity: SchedulingAuthContext,
    jobId: string,
    input: {
      scheduledAt: Date;
      scheduledEndAt: Date | null;
      assignedUserId: string | null;
      overrideReason: string | null;
      acknowledgeConflicts: boolean;
    },
  ): Promise<void> {
    const check = await this.conflictService.checkConflicts(companyId, identity, {
      jobId,
      scheduledAt: input.scheduledAt.toISOString(),
      scheduledEndAt: input.scheduledEndAt?.toISOString() ?? null,
      assignedUserId: input.assignedUserId,
    });

    if (!check.hasConflicts) return;

    const blocking = check.conflicts.filter((c) => c.severity === 'block');
    if (blocking.length === 0) return;

    if (input.acknowledgeConflicts && check.canOverride) {
      if (!input.overrideReason?.trim()) {
        throw new SchedulingError(
          'OVERRIDE_REASON_REQUIRED',
          'Owner/Admin override requires a reason',
        );
      }

      await this.db.insert(schedulingOverrideAudits).values({
        companyId,
        jobId,
        userId: identity.userId,
        reason: input.overrideReason.trim(),
        conflictSummary: { conflicts: check.conflicts },
      });
      return;
    }

    throw new SchedulingError(
      'SCHEDULING_CONFLICT',
      blocking.map((c) => c.message).join(' '),
    );
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

    const executionLabels = await this.loadExecutionLabels(companyId, [jobId]);
    return toScheduledJobEvent(job, executionLabels.get(jobId));
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

function toScheduledJobEvent(
  job: JobWithRelations,
  executionLabels?: { crewLabel: string | null; vehicleLabel: string | null } | null,
): ScheduledJobEvent {
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

  const assignedUserName = job.assignedUser
    ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`
    : null;

  const scheduledAtIso = job.scheduledAt.toISOString();
  const scheduledEndAtIso = job.scheduledEndAt ? job.scheduledEndAt.toISOString() : null;
  const displayStatus = mapCalendarJobDisplayStatus({
    status: job.status,
    assignedUserId: job.assignedUserId,
    executionPhase: job.executionPhase,
    scheduledAt: scheduledAtIso,
    scheduledEndAt: scheduledEndAtIso,
  });

  return {
    id: job.id,
    jobNumber: job.jobNumber ?? null,
    title: job.title,
    status: job.status,
    displayStatus,
    executionPhase: job.executionPhase,
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
    scheduledAt: scheduledAtIso,
    scheduledEndAt: scheduledEndAtIso,
    expectedFinishAt: scheduledEndAtIso,
    assignedUserId: job.assignedUserId,
    assignedUserName,
    vehicleLabel: executionLabels?.vehicleLabel ?? null,
    crewLabel: executionLabels?.crewLabel ?? assignedUserName,
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
