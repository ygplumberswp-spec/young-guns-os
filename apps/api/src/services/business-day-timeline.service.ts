import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { jobWorkflowEvents, jobs, mobileTimeEntries, users } from '@titan/db';
import type {
  BusinessDayTimelineEvent,
  BusinessDayTimelineResponse,
  MobileTimeEntryType,
} from '@titan/shared';
import {
  buildBusinessDayTimelineSummary,
  categoryForTimeEntry,
  labelForWorkflowAction,
  mergeBusinessDayTimelineEvents,
  parseBusinessDayRange,
  TIME_ENTRY_LABELS,
} from '@titan/shared';

export class BusinessDayTimelineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BusinessDayTimelineError';
  }
}

type UserLookup = Map<string, string>;
type JobLookup = Map<string, { jobNumber: string | null; title: string }>;

function displayUserName(row: { firstName: string | null; lastName: string | null; email: string }): string {
  const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return full || row.email;
}

export class BusinessDayTimelineService {
  constructor(private readonly db: DatabaseClient) {}

  async getDayTimeline(
    companyId: string,
    dateIso: string,
    filterUserId?: string | null,
  ): Promise<BusinessDayTimelineResponse> {
    let range: { from: Date; to: Date };
    try {
      range = parseBusinessDayRange(dateIso);
    } catch {
      throw new BusinessDayTimelineError('VALIDATION_ERROR', 'date must be YYYY-MM-DD');
    }

    const timeWhere = and(
      eq(mobileTimeEntries.companyId, companyId),
      gte(mobileTimeEntries.startedAt, range.from),
      lte(mobileTimeEntries.startedAt, range.to),
      filterUserId ? eq(mobileTimeEntries.userId, filterUserId) : undefined,
    );

    const workflowWhere = and(
      eq(jobWorkflowEvents.companyId, companyId),
      gte(jobWorkflowEvents.createdAt, range.from),
      lte(jobWorkflowEvents.createdAt, range.to),
      filterUserId ? eq(jobWorkflowEvents.userId, filterUserId) : undefined,
    );

    const [timeRows, workflowRows] = await Promise.all([
      this.db.query.mobileTimeEntries.findMany({
        where: timeWhere,
        orderBy: [desc(mobileTimeEntries.startedAt)],
      }),
      this.db.query.jobWorkflowEvents.findMany({
        where: workflowWhere,
        orderBy: [desc(jobWorkflowEvents.createdAt)],
      }),
    ]);

    const userIds = new Set<string>();
    const jobIds = new Set<string>();

    for (const row of timeRows) {
      userIds.add(row.userId);
      if (row.jobId) jobIds.add(row.jobId);
    }

    for (const row of workflowRows) {
      userIds.add(row.userId);
      jobIds.add(row.jobId);
    }

    const userIdList = [...userIds];
    const jobIdList = [...jobIds];

    const [userRows, jobRows] = await Promise.all([
      userIdList.length
        ? this.db.query.users.findMany({
            where: and(eq(users.companyId, companyId), inArray(users.id, userIdList)),
            columns: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve([]),
      jobIdList.length
        ? this.db.query.jobs.findMany({
            where: and(eq(jobs.companyId, companyId), inArray(jobs.id, jobIdList)),
            columns: { id: true, jobNumber: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    const userLookup: UserLookup = new Map(userRows.map((row) => [row.id, displayUserName(row)]));

    const jobLookup: JobLookup = new Map(
      jobRows.map((row) => [row.id, { jobNumber: row.jobNumber, title: row.title }]),
    );

    const events: BusinessDayTimelineEvent[] = [];

    for (const row of timeRows) {
      const entryType = row.entryType as MobileTimeEntryType;
      const job = row.jobId ? jobLookup.get(row.jobId) : null;

      events.push({
        id: row.id,
        kind: 'time_entry',
        occurredAt: row.startedAt.toISOString(),
        label: TIME_ENTRY_LABELS[entryType] ?? entryType.replace(/_/g, ' '),
        detail: row.notes,
        userId: row.userId,
        userName: userLookup.get(row.userId) ?? 'Unknown',
        jobId: row.jobId,
        jobNumber: job?.jobNumber ?? null,
        jobTitle: job?.title ?? null,
        durationMinutes: row.durationMinutes,
        category: categoryForTimeEntry(entryType),
      });
    }

    for (const row of workflowRows) {
      const job = jobLookup.get(row.jobId);

      events.push({
        id: row.id,
        kind: 'workflow',
        occurredAt: row.createdAt.toISOString(),
        label: labelForWorkflowAction(row.action),
        detail: row.reason,
        userId: row.userId,
        userName: userLookup.get(row.userId) ?? 'Unknown',
        jobId: row.jobId,
        jobNumber: job?.jobNumber ?? null,
        jobTitle: job?.title ?? null,
        durationMinutes: null,
        category: 'workflow',
      });
    }

    const merged = mergeBusinessDayTimelineEvents(events);

    return {
      date: dateIso,
      events: merged,
      summary: buildBusinessDayTimelineSummary(dateIso, merged),
    };
  }
}
