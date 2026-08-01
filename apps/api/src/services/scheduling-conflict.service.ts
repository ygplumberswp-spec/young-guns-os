import type {
  SchedulingConflict,
  SchedulingConflictCheckRequest,
  SchedulingConflictCheckResponse,
  SchedulingConflictSuggestion,
  SchedulingSettingsSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companySchedulingSettings,
  jobs,
  users,
  wiLeaveApplications,
} from '@titan/db';
import { and, eq, isNotNull, lt, ne, sql } from 'drizzle-orm';
import { isCompanyOwnerRole, isManagerRole, type StaffIdentity } from '@titan/auth';
import { TravelTimeService } from './travel-time.service.js';

export type ConflictJobSlot = {
  id: string;
  jobId: string;
  assignedUserId: string | null;
  scheduledAt: Date;
  scheduledEndAt: Date | null;
  suburb: string | null;
};

export type ResolvedSchedulingSettings = {
  schedulingBufferMinutes: number;
  defaultTravelMinutes: number;
  workDayStartHour: number;
  workDayEndHour: number;
};

const DEFAULT_SETTINGS: ResolvedSchedulingSettings = {
  schedulingBufferMinutes: 15,
  defaultTravelMinutes: 30,
  workDayStartHour: 7,
  workDayEndHour: 18,
};

export function resolveEffectiveEnd(
  start: Date,
  end: Date | null,
  travelMinutes: number,
  bufferMinutes: number,
): Date {
  const baseEnd = end ?? new Date(start.getTime() + 60 * 60_000);
  return new Date(baseEnd.getTime() + travelMinutes * 60_000 + bufferMinutes * 60_000);
}

export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function isOutsideBusinessHours(
  start: Date,
  end: Date,
  workDayStartHour: number,
  workDayEndHour: number,
): boolean {
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  return startHour < workDayStartHour || endHour > workDayEndHour;
}

export class SchedulingConflictService {
  private readonly travelTimeService: TravelTimeService;

  constructor(private readonly db: DatabaseClient) {
    this.travelTimeService = new TravelTimeService(db);
  }

  async loadSettings(companyId: string): Promise<ResolvedSchedulingSettings> {
    const row = await this.db.query.companySchedulingSettings.findFirst({
      where: eq(companySchedulingSettings.companyId, companyId),
    });

    if (!row) return DEFAULT_SETTINGS;

    return {
      schedulingBufferMinutes: row.schedulingBufferMinutes,
      defaultTravelMinutes: row.defaultTravelMinutes,
      workDayStartHour: row.workDayStartHour,
      workDayEndHour: row.workDayEndHour,
    };
  }

  async buildSettingsSummary(companyId: string): Promise<SchedulingSettingsSummary> {
    const settings = await this.loadSettings(companyId);
    const cartrackConnected = await this.travelTimeService.isCartrackConnected(companyId);

    return {
      ...settings,
      cartrackConnected,
      travelTimeSource: cartrackConnected ? 'cartrack' : 'default',
    };
  }

  canOverrideConflicts(identity: StaffIdentity): boolean {
    return isCompanyOwnerRole(identity) || isManagerRole(identity);
  }

  async checkConflicts(
    companyId: string,
    identity: StaffIdentity,
    input: SchedulingConflictCheckRequest,
  ): Promise<SchedulingConflictCheckResponse> {
    const settings = await this.loadSettings(companyId);
    const scheduledAt = new Date(input.scheduledAt);
    const scheduledEndAt = input.scheduledEndAt ? new Date(input.scheduledEndAt) : null;

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error('Invalid scheduledAt');
    }

    const durationEnd =
      scheduledEndAt ??
      new Date(
        scheduledAt.getTime() + (input.durationMinutes ?? 60) * 60_000,
      );

    const travel = await this.travelTimeService.estimateTravelMinutes({
      companyId,
      defaultMinutes: settings.defaultTravelMinutes,
      fromJobId: input.jobId,
    });

    const effectiveEnd = resolveEffectiveEnd(
      scheduledAt,
      durationEnd,
      travel.minutes,
      settings.schedulingBufferMinutes,
    );

    const conflicts: SchedulingConflict[] = [];

    if (
      isOutsideBusinessHours(
        scheduledAt,
        durationEnd,
        settings.workDayStartHour,
        settings.workDayEndHour,
      )
    ) {
      conflicts.push({
        type: 'outside_hours',
        message: `Scheduled time falls outside business hours (${settings.workDayStartHour}:00–${settings.workDayEndHour}:00).`,
        severity: 'block',
      });
    }

    if (input.assignedUserId) {
      const assignee = await this.db.query.users.findFirst({
        where: and(
          eq(users.id, input.assignedUserId),
          eq(users.companyId, companyId),
          eq(users.isActive, true),
        ),
      });

      if (!assignee) {
        conflicts.push({
          type: 'unavailable_technician',
          message: 'Selected technician is not available for this company.',
          severity: 'block',
        });
      } else {
        const leaveConflict = await this.hasApprovedLeave(
          companyId,
          input.assignedUserId,
          scheduledAt,
          durationEnd,
        );
        if (leaveConflict) {
          conflicts.push({
            type: 'leave',
            message: 'Technician has approved leave during this time.',
            severity: 'block',
          });
        }

        const overlaps = await this.findOverlappingJobs(
          companyId,
          input.assignedUserId,
          scheduledAt,
          effectiveEnd,
          input.jobId ?? null,
          settings,
        );

        for (const overlap of overlaps) {
          conflicts.push({
            type: 'overlap',
            message: `Overlaps with job ${overlap.jobNumber ?? overlap.id.slice(0, 8)}.`,
            severity: 'block',
          });
        }

        if (overlaps.length > 0) {
          const impossibleTravel = await this.detectImpossibleTravel(
            companyId,
            input.assignedUserId,
            scheduledAt,
            input.jobId ?? null,
            settings,
          );
          if (impossibleTravel) {
            conflicts.push({
              type: 'impossible_travel',
              message: impossibleTravel,
              severity: 'warn',
            });
          }
        }
      }
    }

    const suggestions = await this.buildSuggestions(
      companyId,
      input,
      settings,
      conflicts,
    );

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      suggestions,
      canOverride: this.canOverrideConflicts(identity),
    };
  }

  private async hasApprovedLeave(
    companyId: string,
    userId: string,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    try {
      const rows = await this.db
        .select({ id: wiLeaveApplications.id })
        .from(wiLeaveApplications)
        .where(
          and(
            eq(wiLeaveApplications.companyId, companyId),
            eq(wiLeaveApplications.userId, userId),
            eq(wiLeaveApplications.status, 'approved'),
            lteDate(wiLeaveApplications.startDate, end),
            gteDate(wiLeaveApplications.endDate, start),
          ),
        )
        .limit(1);

      return rows.length > 0;
    } catch {
      // WI tables may be absent on minimal staging — treat as no leave data.
      return false;
    }
  }

  private async findOverlappingJobs(
    companyId: string,
    assignedUserId: string,
    start: Date,
    effectiveEnd: Date,
    excludeJobId: string | null,
    settings: ResolvedSchedulingSettings,
  ): Promise<Array<{ id: string; jobNumber: string | null }>> {
    const rows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        eq(jobs.assignedUserId, assignedUserId),
        isNotNull(jobs.scheduledAt),
        excludeJobId ? ne(jobs.id, excludeJobId) : undefined,
        lt(jobs.scheduledAt, effectiveEnd),
      ),
      columns: {
        id: true,
        jobNumber: true,
        scheduledAt: true,
        scheduledEndAt: true,
      },
    });

    return rows.filter((row) => {
      if (!row.scheduledAt) return false;
      const rowEnd = resolveEffectiveEnd(
        row.scheduledAt,
        row.scheduledEndAt,
        settings.defaultTravelMinutes,
        settings.schedulingBufferMinutes,
      );
      return intervalsOverlap(start, effectiveEnd, row.scheduledAt, rowEnd);
    });
  }

  private async detectImpossibleTravel(
    companyId: string,
    assignedUserId: string,
    start: Date,
    excludeJobId: string | null,
    settings: ResolvedSchedulingSettings,
  ): Promise<string | null> {
    const priorRows = await this.db
      .select({
        id: jobs.id,
        scheduledAt: jobs.scheduledAt,
        scheduledEndAt: jobs.scheduledEndAt,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          eq(jobs.assignedUserId, assignedUserId),
          isNotNull(jobs.scheduledAt),
          lt(jobs.scheduledAt, start),
          excludeJobId ? ne(jobs.id, excludeJobId) : undefined,
        ),
      )
      .orderBy(sql`${jobs.scheduledAt} desc`)
      .limit(1);

    const prior = priorRows[0];

    if (!prior?.scheduledAt) return null;

    const priorEnd = resolveEffectiveEnd(
      prior.scheduledAt,
      prior.scheduledEndAt,
      settings.defaultTravelMinutes,
      settings.schedulingBufferMinutes,
    );

    const gapMinutes = (start.getTime() - priorEnd.getTime()) / 60_000;
    if (gapMinutes < settings.defaultTravelMinutes) {
      return `Only ${Math.round(gapMinutes)} minutes after previous job — default travel allowance is ${settings.defaultTravelMinutes} minutes.`;
    }

    return null;
  }

  private async buildSuggestions(
    companyId: string,
    input: SchedulingConflictCheckRequest,
    settings: ResolvedSchedulingSettings,
    conflicts: SchedulingConflict[],
  ): Promise<SchedulingConflictSuggestion[]> {
    if (conflicts.length === 0) return [];

    const suggestions: SchedulingConflictSuggestion[] = [];
    const start = new Date(input.scheduledAt);
    const durationMs = input.scheduledEndAt
      ? new Date(input.scheduledEndAt).getTime() - start.getTime()
      : (input.durationMinutes ?? 60) * 60_000;

    const nextSlot = new Date(start.getTime() + 60 * 60_000);
    suggestions.push({
      kind: 'next_available',
      label: 'Next hour slot',
      scheduledAt: nextSlot.toISOString(),
      scheduledEndAt: new Date(nextSlot.getTime() + durationMs).toISOString(),
      assignedUserId: input.assignedUserId ?? null,
      assignedUserName: null,
    });

    if (input.assignedUserId) {
      const alt = await this.db.query.users.findFirst({
        where: and(
          eq(users.companyId, companyId),
          eq(users.isActive, true),
          ne(users.id, input.assignedUserId),
        ),
        with: { role: true },
        orderBy: (table, { asc }) => [asc(table.firstName)],
      });

      if (alt) {
        suggestions.push({
          kind: 'alternate_technician',
          label: `${alt.firstName} ${alt.lastName}`,
          scheduledAt: input.scheduledAt,
          scheduledEndAt: input.scheduledEndAt ?? null,
          assignedUserId: alt.id,
          assignedUserName: `${alt.firstName} ${alt.lastName}`,
        });
      }
    }

    const closest = new Date(start);
    closest.setMinutes(0, 0, 0);
    closest.setHours(settings.workDayStartHour);
    if (closest <= start) {
      closest.setDate(closest.getDate() + 1);
    }
    suggestions.push({
      kind: 'closest_slot',
      label: `Next business day open (${settings.workDayStartHour}:00)`,
      scheduledAt: closest.toISOString(),
      scheduledEndAt: new Date(closest.getTime() + durationMs).toISOString(),
      assignedUserId: input.assignedUserId ?? null,
      assignedUserName: null,
    });

    return suggestions;
  }
}

function lteDate(column: typeof wiLeaveApplications.startDate, end: Date) {
  return sql`${column} <= ${end.toISOString().slice(0, 10)}::date`;
}

function gteDate(column: typeof wiLeaveApplications.endDate, start: Date) {
  return sql`${column} >= ${start.toISOString().slice(0, 10)}::date`;
}
