import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CreateJobRequest,
  JobDetail,
  JobsStats,
  JobSummary,
  UpdateJobRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { customers, jobs, users } from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import { buildTenantCacheKey, cachedTenantRead, CACHE_TTLS } from './api-read-cache.js';

const ACTIVE_JOB_STATUSES = ['new', 'scheduled', 'in_progress'] as const;

export class JobsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobsError';
  }
}

export type AuraJobsContext = {
  totalCount: number;
  activeCount: number;
  jobs: Array<{
    id: string;
    title: string;
    status: string;
    customerId: string;
    customerName: string;
    scheduledAt: string | null;
    scheduledEndAt: string | null;
    assignedUserId: string | null;
    assignedUserName: string | null;
  }>;
  focusedJob: {
    id: string;
    title: string;
    status: string;
    description: string | null;
    notes: string | null;
    scheduledAt: string | null;
    scheduledEndAt: string | null;
    customerId: string;
    customerName: string;
    assignedUserId: string | null;
    assignedUserName: string | null;
  } | null;
};

export class JobsService {
  constructor(private readonly db: DatabaseClient) {}

  async listJobs(companyId: string): Promise<JobSummary[]> {
    const rows = await this.db.query.jobs.findMany({
      where: eq(jobs.companyId, companyId),
      with: { customer: true, assignedUser: true },
      orderBy: [desc(jobs.updatedAt)],
    });

    return rows.map(toJobSummary);
  }

  async getJob(companyId: string, jobId: string): Promise<JobDetail | null> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
      with: { customer: true, assignedUser: true },
    });

    if (!job) {
      return null;
    }

    return toJobDetail(job);
  }

  async createJob(companyId: string, input: CreateJobRequest): Promise<JobDetail> {
    const title = input.title.trim();

    if (!title) {
      throw new JobsError('VALIDATION_ERROR', 'Job title is required');
    }

    await this.ensureCustomerBelongsToCompany(companyId, input.customerId);

    if (input.assignedUserId) {
      await this.ensureAssigneeBelongsToCompany(companyId, input.assignedUserId);
    }

    const scheduledAt = parseOptionalDate(input.scheduledAt);
    const scheduledEndAt = parseOptionalDate(input.scheduledEndAt);

    if (scheduledAt && scheduledEndAt) {
      validateScheduleRange(scheduledAt, scheduledEndAt);
    }

    const [created] = await this.db
      .insert(jobs)
      .values({
        companyId,
        customerId: input.customerId,
        title,
        description: normalizeOptionalText(input.description),
        status: input.status ?? 'new',
        scheduledAt,
        scheduledEndAt,
        assignedUserId: input.assignedUserId ?? null,
        notes: normalizeOptionalText(input.notes),
      })
      .returning();

    if (!created) {
      throw new JobsError('CREATE_FAILED', 'Unable to create job');
    }

    const jobDetail = (await this.getJob(companyId, created.id))!;

    emitBusinessEvent({
      companyId,
      eventType: 'job.created',
      entityType: 'job',
      entityId: created.id,
      payload: {
        job: {
          id: created.id,
          status: created.status,
          customerId: created.customerId,
          scheduledAt: created.scheduledAt?.toISOString() ?? null,
        },
        customerId: created.customerId,
      },
    });

    if (created.scheduledAt) {
      emitBusinessEvent({
        companyId,
        eventType: 'job.scheduled',
        entityType: 'job',
        entityId: created.id,
        payload: {
          job: {
            id: created.id,
            status: created.status,
            customerId: created.customerId,
          },
          customerId: created.customerId,
        },
      });
    }

    return jobDetail;
  }

  async updateJob(companyId: string, jobId: string, input: UpdateJobRequest): Promise<JobDetail> {
    const existing = await this.getJob(companyId, jobId);

    if (!existing) {
      throw new JobsError('NOT_FOUND', 'Job not found');
    }

    if (input.customerId) {
      await this.ensureCustomerBelongsToCompany(companyId, input.customerId);
    }

    if (input.assignedUserId) {
      await this.ensureAssigneeBelongsToCompany(companyId, input.assignedUserId);
    }

    const updates: Partial<typeof jobs.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) {
      const title = input.title.trim();

      if (!title) {
        throw new JobsError('VALIDATION_ERROR', 'Job title is required');
      }

      updates.title = title;
    }

    if (input.customerId !== undefined) {
      updates.customerId = input.customerId;
    }

    if (input.description !== undefined) {
      updates.description = normalizeOptionalText(input.description);
    }

    if (input.status !== undefined) {
      updates.status = input.status;
    }

    if (input.scheduledAt !== undefined) {
      updates.scheduledAt = parseOptionalDate(input.scheduledAt);
    }

    if (input.scheduledEndAt !== undefined) {
      updates.scheduledEndAt = parseOptionalDate(input.scheduledEndAt);
    }

    if (input.assignedUserId !== undefined) {
      updates.assignedUserId = input.assignedUserId ?? null;
    }

    if (updates.scheduledAt && updates.scheduledEndAt) {
      validateScheduleRange(updates.scheduledAt, updates.scheduledEndAt);
    }

    if (input.notes !== undefined) {
      updates.notes = normalizeOptionalText(input.notes);
    }

    const [updated] = await this.db
      .update(jobs)
      .set(updates)
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new JobsError('UPDATE_FAILED', 'Unable to update job');
    }

    const jobPayload = {
      job: {
        id: jobId,
        status: updated.status,
        customerId: updated.customerId,
        scheduledAt: updated.scheduledAt?.toISOString() ?? null,
      },
      customerId: updated.customerId,
    };

    if (input.status !== undefined && input.status !== existing.status) {
      emitBusinessEvent({
        companyId,
        eventType: 'job.status_changed',
        entityType: 'job',
        entityId: jobId,
        payload: jobPayload,
      });

      if (updated.status === 'completed') {
        emitBusinessEvent({
          companyId,
          eventType: 'job.completed',
          entityType: 'job',
          entityId: jobId,
          payload: jobPayload,
        });
      }

      if (updated.status === 'scheduled') {
        emitBusinessEvent({
          companyId,
          eventType: 'job.scheduled',
          entityType: 'job',
          entityId: jobId,
          payload: jobPayload,
        });
      }
    }

    return (await this.getJob(companyId, jobId))!;
  }

  async getStats(companyId: string): Promise<JobsStats> {
    return cachedTenantRead(
      buildTenantCacheKey(companyId, 'jobs/stats'),
      async () => {
        const [totalRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobs)
          .where(eq(jobs.companyId, companyId));

        const [activeRow] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobs)
          .where(and(eq(jobs.companyId, companyId), inArray(jobs.status, [...ACTIVE_JOB_STATUSES])));

        return {
          totalCount: totalRow?.count ?? 0,
          activeCount: activeRow?.count ?? 0,
        };
      },
      CACHE_TTLS.stats,
    );
  }

  async buildAuraContext(companyId: string, jobId?: string): Promise<AuraJobsContext> {
    const stats = await this.getStats(companyId);

    const jobRows = await this.db.query.jobs.findMany({
      where: eq(jobs.companyId, companyId),
      with: { customer: true, assignedUser: true },
      orderBy: [desc(jobs.updatedAt)],
      limit: 25,
    });

    let focusedJob: AuraJobsContext['focusedJob'] = null;

    if (jobId) {
      const detail = await this.getJob(companyId, jobId);

      if (detail) {
        focusedJob = {
          id: detail.id,
          title: detail.title,
          status: detail.status,
          description: detail.description,
          notes: detail.notes,
          scheduledAt: detail.scheduledAt,
          scheduledEndAt: detail.scheduledEndAt,
          customerId: detail.customerId,
          customerName: detail.customerName,
          assignedUserId: detail.assignedUserId,
          assignedUserName: detail.assignedUserName,
        };
      }
    }

    return {
      totalCount: stats.totalCount,
      activeCount: stats.activeCount,
      jobs: jobRows.map((job) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        customerId: job.customerId,
        customerName: job.customer?.name ?? 'Unknown',
        scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
        scheduledEndAt: job.scheduledEndAt ? job.scheduledEndAt.toISOString() : null,
        assignedUserId: job.assignedUserId,
        assignedUserName: job.assignedUser
          ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`
          : null,
      })),
      focusedJob,
    };
  }

  private async ensureCustomerBelongsToCompany(companyId: string, customerId: string): Promise<void> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new JobsError('CUSTOMER_NOT_FOUND', 'Customer not found for this company');
    }
  }

  private async ensureAssigneeBelongsToCompany(companyId: string, userId: string): Promise<void> {
    const assignee = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.companyId, companyId), eq(users.isActive, true)),
    });

    if (!assignee) {
      throw new JobsError('ASSIGNEE_NOT_FOUND', 'Team member not found for this company');
    }
  }
}

type JobWithRelations = typeof jobs.$inferSelect & {
  customer: typeof customers.$inferSelect | null;
  assignedUser: typeof users.$inferSelect | null;
};

function toJobSummary(job: JobWithRelations): JobSummary {
  return {
    id: job.id,
    customerId: job.customerId,
    customerName: job.customer?.name ?? 'Unknown',
    title: job.title,
    status: job.status,
    scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
    scheduledEndAt: job.scheduledEndAt ? job.scheduledEndAt.toISOString() : null,
    assignedUserId: job.assignedUserId,
    assignedUserName: job.assignedUser
      ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`
      : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function toJobDetail(job: JobWithRelations): JobDetail {
  return {
    ...toJobSummary(job),
    description: job.description,
    notes: job.notes,
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new JobsError('VALIDATION_ERROR', 'Invalid scheduled date');
  }

  return parsed;
}

function validateScheduleRange(start: Date, end: Date | null): void {
  if (end && end <= start) {
    throw new JobsError('VALIDATION_ERROR', 'Scheduled end must be after start');
  }
}
