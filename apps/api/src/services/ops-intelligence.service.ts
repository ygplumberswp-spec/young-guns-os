import { and, asc, count, desc, eq, gte, inArray, lt, lte, ne } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  companyDayPlanFollowUps,
  companyDayPlans,
  invoices,
  jobs,
  opsIntelligenceReminderStates,
  quotes,
  companySchedulingSettings,
  users,
  vehicles,
} from '@titan/db';
import type {
  OpsAckReminderRequest,
  OpsIntelligenceEvent,
  OpsIntelligenceSnapshot,
  OpsLiveStrip,
  OpsMorningBrief,
  OpsReminderStateSummary,
  OpsReminderType,
  OpsTravelEstimate,
  OpsTravelSource,
} from '@titan/shared';
import {
  OPS_DEFAULT_TRAVEL_FALLBACK_MINUTES,
  OPS_INTELLIGENCE_GUARANTEES,
  buildNavigateHref,
  buildOpsReminderDedupeKey,
  buildRunningLateSuggestedActions,
  buildStandardEventActions,
  detectJobScheduleReminder,
  formatOpsTravelSourceLabel,
  isOnArrival,
  isValidLatLng,
  localPlanDateIso,
  resolveOpsMapsCapability,
  shouldEmitReminder,
  computeLeaveByMs,
} from '@titan/shared';
import type { GoogleMapsService } from './google-maps.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { NotificationService } from './notification.service.js';
import { TravelTimeService } from './travel-time.service.js';

export class OpsIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OpsIntelligenceError';
  }
}

type Scope = {
  companyId: string;
  userId: string;
};

type JobRow = {
  id: string;
  jobNumber: string | null;
  title: string;
  status: string;
  priority: string;
  scheduledAt: Date | null;
  scheduledEndAt: Date | null;
  assignedUserId: string | null;
  snapshotStreet: string | null;
  snapshotSuburb: string | null;
  snapshotCity: string | null;
  snapshotFormattedAddress: string | null;
  snapshotLatitude: number | null;
  snapshotLongitude: number | null;
  snapshotCustomerName: string | null;
  executionPhase: string;
};

function dayBounds(planDate: string): { start: Date; end: Date } {
  const start = new Date(`${planDate}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatJobAddress(job: JobRow): string | null {
  if (job.snapshotFormattedAddress?.trim()) return job.snapshotFormattedAddress.trim();
  const parts = [job.snapshotStreet, job.snapshotSuburb, job.snapshotCity].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function technicianDisplayName(
  user: { firstName: string; lastName: string } | undefined,
): string | null {
  if (!user) return null;
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name || null;
}

export class OpsIntelligenceService {
  private readonly travelTime: TravelTimeService;

  constructor(
    private readonly db: DatabaseClient,
    private readonly googleMapsService: GoogleMapsService,
    private readonly integrationsService: IntegrationsService,
    private readonly notificationService: NotificationService,
  ) {
    this.travelTime = new TravelTimeService(db, googleMapsService);
  }

  async getSnapshot(companyId: string): Promise<OpsIntelligenceSnapshot> {
    const planDate = localPlanDateIso();
    const now = new Date();
    const { events, liveStrip, mapsCapability, cartrackConnected, defaultTravelFallbackMinutes } =
      await this.evaluateLive(companyId, planDate, now);
    const morningBrief = await this.buildMorningBrief(companyId, planDate);

    return {
      generatedAt: now.toISOString(),
      planDate,
      mapsCapability,
      cartrackConnected,
      defaultTravelFallbackMinutes,
      events,
      morningBrief,
      liveStrip,
      guarantees: OPS_INTELLIGENCE_GUARANTEES,
    };
  }

  async getMorningBrief(companyId: string): Promise<OpsMorningBrief> {
    return this.buildMorningBrief(companyId, localPlanDateIso());
  }

  async getLiveStrip(companyId: string): Promise<OpsLiveStrip> {
    const planDate = localPlanDateIso();
    const { liveStrip } = await this.evaluateLive(companyId, planDate, new Date());
    return liveStrip;
  }

  async getEvents(companyId: string): Promise<OpsIntelligenceEvent[]> {
    const planDate = localPlanDateIso();
    const { events } = await this.evaluateLive(companyId, planDate, new Date());
    return events;
  }

  async acknowledgeReminder(
    scope: Scope,
    reminderStateId: string,
    input: OpsAckReminderRequest,
  ): Promise<OpsReminderStateSummary> {
    const existing = await this.db.query.opsIntelligenceReminderStates.findFirst({
      where: and(
        eq(opsIntelligenceReminderStates.companyId, scope.companyId),
        eq(opsIntelligenceReminderStates.id, reminderStateId),
      ),
    });
    if (!existing) {
      throw new OpsIntelligenceError('NOT_FOUND', 'Reminder state not found');
    }

    const now = new Date();
    const [updated] = await this.db
      .update(opsIntelligenceReminderStates)
      .set({
        status: input.status,
        acknowledgedAt: input.status === 'acknowledged' ? now : existing.acknowledgedAt,
        dismissedAt: input.status === 'dismissed' ? now : existing.dismissedAt,
        acknowledgedByUserId: scope.userId,
        updatedAt: now,
      })
      .where(eq(opsIntelligenceReminderStates.id, reminderStateId))
      .returning();

    if (!updated) {
      throw new OpsIntelligenceError('NOT_FOUND', 'Reminder state not found');
    }

    return {
      id: updated.id,
      reminderType: updated.reminderType,
      dedupeKey: updated.dedupeKey,
      jobId: updated.jobId,
      status: updated.status,
      notifiedAt: updated.notifiedAt?.toISOString() ?? null,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
      dismissedAt: updated.dismissedAt?.toISOString() ?? null,
    };
  }

  async acknowledgeByDedupeKey(
    scope: Scope,
    dedupeKey: string,
    input: OpsAckReminderRequest,
  ): Promise<OpsReminderStateSummary> {
    const existing = await this.db.query.opsIntelligenceReminderStates.findFirst({
      where: and(
        eq(opsIntelligenceReminderStates.companyId, scope.companyId),
        eq(opsIntelligenceReminderStates.dedupeKey, dedupeKey),
      ),
    });
    if (!existing) {
      // Create a dismissed/acked shell so the event stays suppressed for the day.
      const planDate = localPlanDateIso();
      const reminderType = this.parseReminderTypeFromDedupe(dedupeKey);
      const now = new Date();
      const [created] = await this.db
        .insert(opsIntelligenceReminderStates)
        .values({
          companyId: scope.companyId,
          reminderType,
          dedupeKey,
          planDate,
          status: input.status,
          acknowledgedAt: input.status === 'acknowledged' ? now : null,
          dismissedAt: input.status === 'dismissed' ? now : null,
          acknowledgedByUserId: scope.userId,
        })
        .returning();
      if (!created) {
        throw new OpsIntelligenceError('WRITE_FAILED', 'Unable to persist reminder acknowledgement');
      }
      return {
        id: created.id,
        reminderType: created.reminderType,
        dedupeKey: created.dedupeKey,
        jobId: created.jobId,
        status: created.status,
        notifiedAt: null,
        acknowledgedAt: created.acknowledgedAt?.toISOString() ?? null,
        dismissedAt: created.dismissedAt?.toISOString() ?? null,
      };
    }
    return this.acknowledgeReminder(scope, existing.id, input);
  }

  private parseReminderTypeFromDedupe(dedupeKey: string): OpsReminderType {
    const parts = dedupeKey.split(':');
    const candidate = parts[1] as OpsReminderType | undefined;
    const allowed: OpsReminderType[] = [
      'next_job_approaching',
      'leave_now',
      'running_late',
      'on_arrival',
      'post_completion_next_job',
      'morning_brief',
    ];
    if (candidate && allowed.includes(candidate)) return candidate;
    return 'next_job_approaching';
  }

  private async evaluateLive(companyId: string, planDate: string, now: Date) {
    const { start, end } = dayBounds(planDate);
    const settings = await this.db.query.companySchedulingSettings.findFirst({
      where: eq(companySchedulingSettings.companyId, companyId),
    });
    const defaultTravelFallbackMinutes =
      settings?.defaultTravelMinutes ?? OPS_DEFAULT_TRAVEL_FALLBACK_MINUTES;

    const googleMapsConnected = await this.googleMapsService.isConnected(companyId);
    const fleet = await this.integrationsService.buildFleetTrackingContext(companyId);
    const cartrackConnected = fleet.cartrackConnected;

    const todayJobs = (await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        gte(jobs.scheduledAt, start),
        lt(jobs.scheduledAt, end),
        inArray(jobs.status, ['scheduled', 'in_progress', 'completed']),
      ),
      orderBy: [asc(jobs.scheduledAt)],
    })) as JobRow[];

    const mapsCapability = resolveOpsMapsCapability({
      googleMapsConnected,
      hasSchedule: todayJobs.length > 0,
    });

    const techIds = [
      ...new Set(todayJobs.map((j) => j.assignedUserId).filter((id): id is string => Boolean(id))),
    ];
    const techRows =
      techIds.length > 0
        ? await this.db.query.users.findMany({
            where: and(eq(users.companyId, companyId), inArray(users.id, techIds)),
            columns: { id: true, firstName: true, lastName: true },
          })
        : [];
    const techById = new Map(techRows.map((u) => [u.id, u]));

    const positionsByUser = new Map<
      string,
      { latitude: number; longitude: number; speedKmh: number | null; recordedAt: string }
    >();
    // Resolve GPS via vehicle assignedUserId when available — never invent positions.
    const vehicleIds = fleet.latestPositions
      .map((p) => p.vehicleId)
      .filter((id): id is string => Boolean(id));
    if (vehicleIds.length > 0) {
      const vehicleRows = await this.db.query.vehicles.findMany({
        where: and(eq(vehicles.companyId, companyId), inArray(vehicles.id, vehicleIds)),
        columns: { id: true, assignedUserId: true },
      });
      const vehicleUser = new Map(
        vehicleRows
          .filter((v) => v.assignedUserId)
          .map((v) => [v.id, v.assignedUserId as string]),
      );
      for (const position of fleet.latestPositions) {
        if (!position.vehicleId) continue;
        const userId = vehicleUser.get(position.vehicleId);
        if (!userId) continue;
        if (!isValidLatLng(position.latitude, position.longitude)) continue;
        positionsByUser.set(userId, {
          latitude: position.latitude,
          longitude: position.longitude,
          speedKmh: position.speedKmh,
          recordedAt: position.recordedAt,
        });
      }
    }

    const existingStates = await this.db.query.opsIntelligenceReminderStates.findMany({
      where: and(
        eq(opsIntelligenceReminderStates.companyId, companyId),
        eq(opsIntelligenceReminderStates.planDate, planDate),
      ),
    });
    const stateByKey = new Map(existingStates.map((s) => [s.dedupeKey, s]));

    const events: OpsIntelligenceEvent[] = [];
    const travelByJobId = new Map<string, OpsTravelEstimate>();
    let longestTravelMinutes: number | null = null;
    let longestTravelLabel: string | null = null;
    let lateArrivals = 0;
    let upcomingDepartures = 0;

    const activeUpcoming = todayJobs.filter(
      (j) => j.status === 'scheduled' || j.status === 'in_progress',
    );
    const completedJobs = todayJobs.filter((j) => j.status === 'completed');
    const jobsWaiting = todayJobs.filter((j) => j.status === 'scheduled').length;
    const emergencyQueue = todayJobs.filter(
      (j) =>
        (j.status === 'scheduled' || j.status === 'in_progress') &&
        (j.priority === 'urgent' || j.priority === 'high'),
    ).length;

    // Per-technician schedule order for previous→next travel.
    const byTech = new Map<string, JobRow[]>();
    for (const job of activeUpcoming) {
      const key = job.assignedUserId ?? `unassigned:${job.id}`;
      const list = byTech.get(key) ?? [];
      list.push(job);
      byTech.set(key, list);
    }

    for (const [, techJobs] of byTech) {
      techJobs.sort(
        (a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0),
      );
      for (let i = 0; i < techJobs.length; i++) {
        const job = techJobs[i]!;
        if (!job.scheduledAt) continue;

        const previous = i > 0 ? techJobs[i - 1] : null;
        const techPos = job.assignedUserId ? positionsByUser.get(job.assignedUserId) : undefined;

        let origin =
          techPos != null
            ? { latitude: techPos.latitude, longitude: techPos.longitude }
            : previous &&
                isValidLatLng(previous.snapshotLatitude, previous.snapshotLongitude) &&
                previous.snapshotLatitude != null &&
                previous.snapshotLongitude != null
              ? {
                  latitude: previous.snapshotLatitude,
                  longitude: previous.snapshotLongitude,
                }
              : null;

        const destination =
          isValidLatLng(job.snapshotLatitude, job.snapshotLongitude) &&
          job.snapshotLatitude != null &&
          job.snapshotLongitude != null
            ? { latitude: job.snapshotLatitude, longitude: job.snapshotLongitude }
            : null;

        const travelResult = await this.travelTime.estimateTravelMinutes({
          companyId,
          fromJobId: previous?.id,
          toJobId: job.id,
          origin,
          destination,
          defaultMinutes: defaultTravelFallbackMinutes,
        });

        const source: OpsTravelSource =
          travelResult.source === 'google_maps'
            ? 'google_maps'
            : travelResult.minutes != null
              ? 'default'
              : 'unavailable';

        const travel: OpsTravelEstimate = {
          minutes: travelResult.minutes,
          distanceMeters: travelResult.distanceMeters,
          distanceText: travelResult.distanceText,
          durationInTrafficMinutes: travelResult.durationInTrafficMinutes,
          source,
          mapsCapability,
          warning:
            travelResult.warning ??
            (source === 'default'
              ? `Using configurable default (${defaultTravelFallbackMinutes} min) — ${formatOpsTravelSourceLabel(source)}`
              : null),
        };
        travelByJobId.set(job.id, travel);

        if (travel.minutes != null) {
          if (longestTravelMinutes == null || travel.minutes > longestTravelMinutes) {
            longestTravelMinutes = travel.minutes;
            longestTravelLabel = `${job.jobNumber ? `${job.jobNumber} · ` : ''}${job.title} (${travel.minutes} min · ${formatOpsTravelSourceLabel(source)})`;
          }
        }

        const onArrival = Boolean(
          techPos &&
            isOnArrival({
              technicianLatitude: techPos.latitude,
              technicianLongitude: techPos.longitude,
              jobLatitude: job.snapshotLatitude,
              jobLongitude: job.snapshotLongitude,
            }),
        );
        const alreadyOnSite =
          job.status === 'in_progress' ||
          job.executionPhase === 'on_site' ||
          job.executionPhase === 'in_progress';

        const reminderType = detectJobScheduleReminder({
          nowMs: now.getTime(),
          scheduledAtMs: job.scheduledAt.getTime(),
          travelMinutes: travel.minutes ?? defaultTravelFallbackMinutes,
          travelSource: source,
          alreadyArrived: alreadyOnSite,
          onArrival: onArrival && job.status === 'scheduled' && !alreadyOnSite,
        });

        // If already working on site, skip leave/approaching noise.
        const effectiveType =
          alreadyOnSite &&
          reminderType &&
          (reminderType === 'leave_now' ||
            reminderType === 'next_job_approaching' ||
            reminderType === 'running_late')
            ? null
            : reminderType;

        if (effectiveType === 'running_late') lateArrivals += 1;
        if (effectiveType === 'leave_now' || effectiveType === 'next_job_approaching') {
          upcomingDepartures += 1;
        }

        if (!effectiveType) continue;

        const dedupeKey = buildOpsReminderDedupeKey({
          companyId,
          reminderType: effectiveType,
          jobId: job.id,
          planDate,
        });
        const existing = stateByKey.get(dedupeKey);
        if (existing?.status === 'acknowledged' || existing?.status === 'dismissed') {
          continue;
        }

        const leaveByMs = computeLeaveByMs({
          scheduledAtMs: job.scheduledAt.getTime(),
          travelMinutes: travel.minutes ?? defaultTravelFallbackMinutes,
        });
        const navigateHref = buildNavigateHref({
          formattedAddress: formatJobAddress(job),
          latitude: job.snapshotLatitude,
          longitude: job.snapshotLongitude,
        });
        const techName = job.assignedUserId
          ? technicianDisplayName(techById.get(job.assignedUserId))
          : null;

        const event = this.buildEvent({
          reminderType: effectiveType,
          job,
          techName,
          travel,
          leaveByMs,
          navigateHref,
          dedupeKey,
          now,
          stateId: existing?.id,
        });
        events.push(event);

        const shouldNotify = shouldEmitReminder({
          existingStatus: existing?.status ?? null,
          lastNotifiedAtMs: existing?.notifiedAt?.getTime() ?? null,
          nowMs: now.getTime(),
        });
        if (!shouldNotify) continue;

        await this.persistNotifiedState({
          companyId,
          reminderType: effectiveType,
          dedupeKey,
          jobId: job.id,
          technicianId: job.assignedUserId,
          planDate,
          summary: event.title,
          existingId: existing?.id,
          now,
        });

        // Technician leave-now in-app notification (never customer-facing).
        if (effectiveType === 'leave_now' && job.assignedUserId) {
          await this.notificationService.createNotification({
            companyId,
            recipientType: 'staff',
            recipientUserId: job.assignedUserId,
            notificationType: 'dispatch_alert',
            title: event.title,
            body: event.body,
            entityType: 'job',
            entityId: job.id,
          });
        }
      }
    }

    // Post-completion next-job suggestion (advisory).
    for (const completed of completedJobs) {
      if (!completed.assignedUserId || !completed.scheduledAt) continue;
      const techJobs = (byTech.get(completed.assignedUserId) ?? []).filter(
        (j) => j.status === 'scheduled',
      );
      const nextJob = techJobs.find(
        (j) => j.scheduledAt && completed.scheduledAt && j.scheduledAt > completed.scheduledAt,
      );
      if (!nextJob?.scheduledAt) continue;

      const dedupeKey = buildOpsReminderDedupeKey({
        companyId,
        reminderType: 'post_completion_next_job',
        jobId: nextJob.id,
        planDate,
      });
      const existing = stateByKey.get(dedupeKey);
      if (existing?.status === 'acknowledged' || existing?.status === 'dismissed') {
        continue;
      }

      const travel =
        travelByJobId.get(nextJob.id) ??
        ({
          minutes: defaultTravelFallbackMinutes,
          distanceMeters: null,
          distanceText: null,
          durationInTrafficMinutes: null,
          source: 'default' as const,
          mapsCapability,
          warning: `Using configurable default (${defaultTravelFallbackMinutes} min)`,
        } satisfies OpsTravelEstimate);

      const navigateHref = buildNavigateHref({
        formattedAddress: formatJobAddress(nextJob),
        latitude: nextJob.snapshotLatitude,
        longitude: nextJob.snapshotLongitude,
      });
      const techName = technicianDisplayName(techById.get(completed.assignedUserId));
      const travelLabel =
        travel.minutes != null
          ? `${travel.minutes} min · ${formatOpsTravelSourceLabel(travel.source)}`
          : formatOpsTravelSourceLabel(travel.source);
      const event: OpsIntelligenceEvent = {
        id: existing?.id ?? dedupeKey,
        reminderType: 'post_completion_next_job',
        severity: 'info',
        title: 'Next job ready',
        body: `${techName ?? 'Technician'} completed a job. Next: ${nextJob.jobNumber ? `${nextJob.jobNumber} · ` : ''}${nextJob.title}. Travel: ${travelLabel}.`,
        jobId: nextJob.id,
        jobNumber: nextJob.jobNumber,
        jobTitle: nextJob.title,
        technicianId: completed.assignedUserId,
        technicianName: techName,
        scheduledAt: nextJob.scheduledAt.toISOString(),
        leaveByAt: new Date(
          computeLeaveByMs({
            scheduledAtMs: nextJob.scheduledAt.getTime(),
            travelMinutes: travel.minutes ?? defaultTravelFallbackMinutes,
          }),
        ).toISOString(),
        travel,
        navigateHref,
        audience: 'both',
        suggestedActions: buildStandardEventActions({
          jobId: nextJob.id,
          navigateHref,
          technicianId: completed.assignedUserId,
        }),
        dedupeKey,
        detectedAt: now.toISOString(),
        autoExecuted: false,
      };
      events.push(event);
      if (
        shouldEmitReminder({
          existingStatus: existing?.status ?? null,
          lastNotifiedAtMs: existing?.notifiedAt?.getTime() ?? null,
          nowMs: now.getTime(),
        })
      ) {
        await this.persistNotifiedState({
          companyId,
          reminderType: 'post_completion_next_job',
          dedupeKey,
          jobId: nextJob.id,
          technicianId: completed.assignedUserId,
          planDate,
          summary: event.title,
          existingId: existing?.id,
          now,
        });
      }
    }

    // Morning brief event once per day (owner).
    const briefKey = buildOpsReminderDedupeKey({
      companyId,
      reminderType: 'morning_brief',
      jobId: null,
      planDate,
    });
    const briefState = stateByKey.get(briefKey);
    if (briefState?.status !== 'acknowledged' && briefState?.status !== 'dismissed') {
      const brief = await this.buildMorningBrief(companyId, planDate);
      // Surface morning brief in the morning window (before noon local) or when not yet notified.
      const localHour = now.getHours();
      const showBrief = localHour < 12 || briefState?.status == null;
      if (showBrief) {
        events.unshift({
          id: briefState?.id ?? briefKey,
          reminderType: 'morning_brief',
          severity: 'info',
          title: 'Morning executive brief',
          body: brief.summaryLine,
          jobId: null,
          jobNumber: null,
          jobTitle: null,
          technicianId: null,
          technicianName: null,
          scheduledAt: null,
          leaveByAt: null,
          travel: null,
          navigateHref: null,
          audience: 'owner',
          suggestedActions: [
            {
              type: 'open_aura',
              label: 'Open AURA',
              href: '/aura',
              requiresOwnerApproval: false,
              wouldChangeSchedule: false,
              honestyNote: null,
            },
            {
              type: 'dismiss',
              label: 'Dismiss',
              href: null,
              requiresOwnerApproval: false,
              wouldChangeSchedule: false,
              honestyNote: null,
            },
          ],
          dedupeKey: briefKey,
          detectedAt: now.toISOString(),
          autoExecuted: false,
        });
        if (
          shouldEmitReminder({
            existingStatus: briefState?.status ?? null,
            lastNotifiedAtMs: briefState?.notifiedAt?.getTime() ?? null,
            nowMs: now.getTime(),
            cooldownMs: 12 * 60 * 60_000,
          })
        ) {
          await this.persistNotifiedState({
            companyId,
            reminderType: 'morning_brief',
            dedupeKey: briefKey,
            jobId: null,
            technicianId: null,
            planDate,
            summary: brief.summaryLine,
            existingId: briefState?.id,
            now,
          });
        }
      }
    }

    const techniciansDriving = fleet.latestPositions.filter(
      (p) => p.speedKmh != null && p.speedKmh > 5,
    ).length;

    const honestyNotes: string[] = [];
    if (!googleMapsConnected) {
      honestyNotes.push(
        'Google Maps routing is not connected — travel uses configurable default minutes only.',
      );
    }
    if (!cartrackConnected) {
      honestyNotes.push(
        'Cartrack is not connected — technician driving/on-arrival uses stored GPS only when available.',
      );
    }
    honestyNotes.push(
      'Ops Intelligence never auto-messages customers or changes bookings. Owner approval required.',
    );

    const liveStrip: OpsLiveStrip = {
      generatedAt: now.toISOString(),
      counts: {
        techniciansDriving,
        lateArrivals,
        upcomingDepartures,
        longestTravelMinutes,
        longestTravelLabel,
        jobsWaiting,
        completedJobs: completedJobs.length,
        emergencyQueue,
      },
      mapsCapability,
      cartrackConnected,
      honestyNotes,
    };

    return {
      events,
      liveStrip,
      mapsCapability,
      cartrackConnected,
      defaultTravelFallbackMinutes,
    };
  }

  private buildEvent(input: {
    reminderType: OpsReminderType;
    job: JobRow;
    techName: string | null;
    travel: OpsTravelEstimate;
    leaveByMs: number;
    navigateHref: string | null;
    dedupeKey: string;
    now: Date;
    stateId?: string;
  }): OpsIntelligenceEvent {
    const { reminderType, job, techName, travel, leaveByMs, navigateHref, dedupeKey, now } = input;
    const travelLabel =
      travel.minutes != null
        ? `${travel.minutes} min · ${formatOpsTravelSourceLabel(travel.source)}`
        : formatOpsTravelSourceLabel(travel.source);

    const titles: Record<OpsReminderType, string> = {
      next_job_approaching: 'Next job approaching',
      leave_now: 'Leave now',
      running_late: 'Running late',
      on_arrival: 'On arrival',
      post_completion_next_job: 'Next job ready',
      morning_brief: 'Morning executive brief',
    };

    const severity =
      reminderType === 'running_late'
        ? 'critical'
        : reminderType === 'leave_now' || reminderType === 'on_arrival'
          ? 'warning'
          : 'info';

    const body =
      reminderType === 'running_late'
        ? `${techName ?? 'Technician'} is past the scheduled start for ${job.jobNumber ? `${job.jobNumber} · ` : ''}${job.title}. Travel estimate: ${travelLabel}. Suggested actions require your approval — nothing was sent or changed.`
        : reminderType === 'leave_now'
          ? `Leave now for ${job.jobNumber ? `${job.jobNumber} · ` : ''}${job.title}. Travel: ${travelLabel}. Leave-by ${new Date(leaveByMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
          : reminderType === 'on_arrival'
            ? `${techName ?? 'Technician'} is within proximity of ${job.jobNumber ? `${job.jobNumber} · ` : ''}${job.title} (real GPS).`
            : `Upcoming: ${job.jobNumber ? `${job.jobNumber} · ` : ''}${job.title}. Leave-by ${new Date(leaveByMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${travelLabel}.`;

    const suggestedActions =
      reminderType === 'running_late'
        ? buildRunningLateSuggestedActions({
            jobId: job.id,
            navigateHref,
            technicianId: job.assignedUserId,
          })
        : buildStandardEventActions({
            jobId: job.id,
            navigateHref,
            technicianId: job.assignedUserId,
          });

    return {
      id: input.stateId ?? dedupeKey,
      reminderType,
      severity,
      title: titles[reminderType],
      body,
      jobId: job.id,
      jobNumber: job.jobNumber,
      jobTitle: job.title,
      technicianId: job.assignedUserId,
      technicianName: techName,
      scheduledAt: job.scheduledAt?.toISOString() ?? null,
      leaveByAt: new Date(leaveByMs).toISOString(),
      travel,
      navigateHref,
      audience:
        reminderType === 'leave_now'
          ? 'both'
          : reminderType === 'on_arrival'
            ? 'owner'
            : 'owner',
      suggestedActions,
      dedupeKey,
      detectedAt: now.toISOString(),
      autoExecuted: false,
    };
  }

  private async persistNotifiedState(input: {
    companyId: string;
    reminderType: OpsReminderType;
    dedupeKey: string;
    jobId: string | null;
    technicianId: string | null;
    planDate: string;
    summary: string;
    existingId?: string;
    now: Date;
  }): Promise<void> {
    if (input.existingId) {
      await this.db
        .update(opsIntelligenceReminderStates)
        .set({
          status: 'notified',
          notifiedAt: input.now,
          payloadSummary: input.summary,
          updatedAt: input.now,
        })
        .where(eq(opsIntelligenceReminderStates.id, input.existingId));
      return;
    }
    try {
      await this.db.insert(opsIntelligenceReminderStates).values({
        companyId: input.companyId,
        reminderType: input.reminderType,
        dedupeKey: input.dedupeKey,
        jobId: input.jobId,
        technicianId: input.technicianId,
        planDate: input.planDate,
        status: 'notified',
        payloadSummary: input.summary,
        notifiedAt: input.now,
      });
    } catch {
      // Unique dedupe race — update existing row instead of inventing a second reminder.
      await this.db
        .update(opsIntelligenceReminderStates)
        .set({
          status: 'notified',
          notifiedAt: input.now,
          payloadSummary: input.summary,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(opsIntelligenceReminderStates.companyId, input.companyId),
            eq(opsIntelligenceReminderStates.dedupeKey, input.dedupeKey),
          ),
        );
    }
  }

  private async buildMorningBrief(companyId: string, planDate: string): Promise<OpsMorningBrief> {
    const { start, end } = dayBounds(planDate);
    const now = new Date();
    const honestyNotes: string[] = [
      'Brief uses live TITAN data only. Weather omitted — no weather provider connected.',
      'No customer messages or schedule changes are made from this brief.',
    ];

    const todayJobRows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        gte(jobs.scheduledAt, start),
        lt(jobs.scheduledAt, end),
        ne(jobs.status, 'cancelled'),
      ),
      columns: {
        id: true,
        jobNumber: true,
        title: true,
        status: true,
        priority: true,
        assignedUserId: true,
        scheduledAt: true,
      },
    });

    const emergencies = todayJobRows.filter(
      (j) => j.priority === 'urgent' || j.priority === 'high',
    );
    const workingTechIds = new Set(
      todayJobRows
        .filter((j) => j.status === 'in_progress' && j.assignedUserId)
        .map((j) => j.assignedUserId as string),
    );

    const [outstandingInvoiceCount] = await this.db
      .select({ total: count() })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          inArray(invoices.status, ['sent', 'partial', 'overdue']),
        ),
      );

    const [overdueInvoiceCount] = await this.db
      .select({ total: count() })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.status, 'overdue')));

    const [overdueQuoteCount] = await this.db
      .select({ total: count() })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, companyId),
          eq(quotes.status, 'sent'),
          lte(quotes.validUntil, now),
        ),
      );

    const followUps = await this.db.query.companyDayPlanFollowUps.findMany({
      where: and(
        eq(companyDayPlanFollowUps.companyId, companyId),
        eq(companyDayPlanFollowUps.planDate, planDate),
        inArray(companyDayPlanFollowUps.status, [
          'draft',
          'pending_review',
          'approved',
          'assigned',
        ]),
      ),
      limit: 20,
    });

    const dayPlanPriorities = await this.db.query.companyDayPlans.findMany({
      where: and(
        eq(companyDayPlans.companyId, companyId),
        eq(companyDayPlans.planDate, planDate),
        eq(companyDayPlans.status, 'active'),
      ),
      orderBy: [desc(companyDayPlans.priority), asc(companyDayPlans.createdAt)],
      limit: 10,
    });

    const fleetMaintenance = await this.db.query.vehicles.findMany({
      where: and(eq(vehicles.companyId, companyId), eq(vehicles.status, 'maintenance')),
      columns: { id: true, name: true, licensePlate: true },
      limit: 20,
    });

    // Busy periods from real scheduled job hour buckets.
    const hourBuckets = new Map<number, number>();
    for (const job of todayJobRows) {
      if (!job.scheduledAt) continue;
      const hour = job.scheduledAt.getHours();
      hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + 1);
    }
    const busyPeriods = [...hourBuckets.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, c]) => `${String(hour).padStart(2, '0')}:00 — ${c} job(s)`);

    const sections: OpsMorningBrief['sections'] = [
      {
        key: 'jobs_today',
        title: 'Jobs today',
        items: todayJobRows.slice(0, 8).map((j) => {
          const time = j.scheduledAt
            ? j.scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—';
          return `${time} · ${j.jobNumber ? `${j.jobNumber} · ` : ''}${j.title} (${j.status})`;
        }),
        count: todayJobRows.length,
        href: '/scheduling',
      },
      {
        key: 'emergencies',
        title: 'Emergencies / high priority',
        items: emergencies.map(
          (j) =>
            `${j.jobNumber ? `${j.jobNumber} · ` : ''}${j.title} (${j.priority})`,
        ),
        count: emergencies.length,
        href: '/scheduling',
      },
      {
        key: 'technicians_working',
        title: 'Technicians working',
        items:
          workingTechIds.size > 0
            ? [`${workingTechIds.size} technician(s) with in-progress jobs`]
            : [],
        count: workingTechIds.size,
        href: '/fleet',
      },
      {
        key: 'outstanding_invoices',
        title: 'Outstanding invoices',
        items:
          Number(outstandingInvoiceCount?.total ?? 0) > 0
            ? [
                `${outstandingInvoiceCount.total} outstanding (incl. ${overdueInvoiceCount?.total ?? 0} overdue)`,
              ]
            : [],
        count: Number(outstandingInvoiceCount?.total ?? 0),
        href: '/finance',
      },
      {
        key: 'overdue_quotes',
        title: 'Overdue quotes',
        items:
          Number(overdueQuoteCount?.total ?? 0) > 0
            ? [`${overdueQuoteCount.total} sent quote(s) past validity`]
            : [],
        count: Number(overdueQuoteCount?.total ?? 0),
        href: '/quotes',
      },
      {
        key: 'follow_ups',
        title: 'Follow-ups',
        items: followUps
          .slice(0, 5)
          .map((f) => f.nextAction?.trim() || f.reason?.trim() || 'Follow-up'),
        count: followUps.length,
        href: '/aura',
      },
      {
        key: 'fleet_service',
        title: 'Fleet service needs',
        items: fleetMaintenance.map(
          (v) => `${v.name}${v.licensePlate ? ` · ${v.licensePlate}` : ''} (maintenance)`,
        ),
        count: fleetMaintenance.length,
        href: '/fleet',
      },
      {
        key: 'busy_periods',
        title: 'Busy periods',
        items: busyPeriods,
        count: busyPeriods.length,
        href: '/scheduling',
      },
    ].filter((s) => s.count > 0 || ['jobs_today', 'emergencies'].includes(s.key));

    const highestPriorities = dayPlanPriorities
      .filter((p) => p.priority === 'high')
      .map((p) => p.content)
      .filter(Boolean)
      .slice(0, 5);

    if (highestPriorities.length === 0) {
      highestPriorities.push(...dayPlanPriorities.map((p) => p.content).filter(Boolean).slice(0, 3));
    }

    const summaryLine = [
      `${todayJobRows.length} job(s) today`,
      emergencies.length > 0 ? `${emergencies.length} high-priority` : null,
      workingTechIds.size > 0 ? `${workingTechIds.size} tech(s) working` : null,
      Number(overdueInvoiceCount?.total ?? 0) > 0
        ? `${overdueInvoiceCount.total} overdue invoice(s)`
        : null,
      highestPriorities[0] ? `Top priority: ${highestPriorities[0]}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      generatedAt: now.toISOString(),
      planDate,
      summaryLine: summaryLine || 'No scheduled activity found for today in TITAN.',
      sections,
      highestPriorities,
      auraHref: '/aura',
      weatherIncluded: false,
      weatherNote: 'Weather omitted — no weather provider is connected in TITAN.',
      honestyNotes,
    };
  }
}
