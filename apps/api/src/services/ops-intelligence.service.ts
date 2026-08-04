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
  OpsSourceState,
  OpsTravelEstimate,
  OpsTravelSource,
} from '@titan/shared';
import {
  OPS_DEFAULT_TRAVEL_FALLBACK_MINUTES,
  OPS_INTELLIGENCE_GUARANTEES,
  OPS_SNAPSHOT_FRESH_MS,
  OPS_SNAPSHOT_INLINE_DEADLINE_MS,
  OPS_SNAPSHOT_MAX_SERVE_MS,
  OPS_TRAVEL_LOOKUP_CONCURRENCY,
  OPS_TRAVEL_PROVIDER_BUDGET_MS,
  buildNavigateHref,
  buildOpsReminderDedupeKey,
  buildOpsSourceState,
  buildRouteOptimisationSuggestedAction,
  buildRunningLateSuggestedActions,
  buildStandardEventActions,
  detectJobScheduleReminder,
  formatOpsTravelSourceLabel,
  isOnArrival,
  isValidLatLng,
  localPlanDateIso,
  resolveOpsMapsCapability,
  resolveOpsSnapshotFreshness,
  resolveStoredSnapshotFreshness,
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

/** One evaluation of the live picture, plus the honesty state behind it. */
type OpsEvaluation = {
  events: OpsIntelligenceEvent[];
  liveStrip: OpsLiveStrip;
  morningBrief: OpsMorningBrief;
  mapsCapability: ReturnType<typeof resolveOpsMapsCapability>;
  cartrackConnected: boolean;
  defaultTravelFallbackMinutes: number;
  planDate: string;
  sources: OpsSourceState[];
};

type StoredEvaluation = {
  snapshot: OpsIntelligenceSnapshot;
  computedAtMs: number;
};

/**
 * Runs tasks a few at a time. Serial awaits were the whole problem here, but an
 * unbounded fan-out would push the small database pool over and hurt every other
 * request on the page.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Waits up to `ms` for a promise. The promise keeps running either way — the caller
 * simply stops waiting, so a slow evaluation still lands in the store for the next read.
 */
async function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
): Promise<{ completed: true; value: T } | { completed: false }> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<{ completed: false }>((resolve) => {
    timer = setTimeout(() => resolve({ completed: false }), ms);
  });
  try {
    return await Promise.race([
      promise.then((value) => ({ completed: true as const, value })).catch(() => ({
        completed: false as const,
      })),
      expiry,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  /** Last completed evaluation per company — the dashboard reads this, not the providers. */
  private readonly stored = new Map<string, StoredEvaluation>();
  /** One refresh per company at a time; concurrent readers share it. */
  private readonly refreshing = new Map<string, Promise<OpsIntelligenceSnapshot>>();

  constructor(
    private readonly db: DatabaseClient,
    private readonly googleMapsService: GoogleMapsService,
    private readonly integrationsService: IntegrationsService,
    private readonly notificationService: NotificationService,
  ) {
    this.travelTime = new TravelTimeService(db, googleMapsService);
  }

  /**
   * Serves the stored evaluation and refreshes behind the request.
   *
   * A live evaluation reads scheduling, Cartrack and Google routing, so putting it in
   * the dashboard's render path meant the Live Fleet Map card waited on every provider
   * before it could show anything. It now waits on none of them: a stored evaluation
   * answers immediately, and a cold start is bounded by
   * {@link OPS_SNAPSHOT_INLINE_DEADLINE_MS} and reports honestly if it needs longer.
   */
  async getSnapshot(
    companyId: string,
    options: { forceRefresh?: boolean } = {},
  ): Promise<OpsIntelligenceSnapshot> {
    const stored = options.forceRefresh ? undefined : this.stored.get(companyId);

    if (stored) {
      const ageMs = Date.now() - stored.computedAtMs;
      if (ageMs <= OPS_SNAPSHOT_FRESH_MS) {
        return this.present(stored, ageMs, this.refreshing.has(companyId));
      }
      if (ageMs <= OPS_SNAPSHOT_MAX_SERVE_MS) {
        void this.startRefresh(companyId);
        return this.present(stored, ageMs, true);
      }
    }

    const refresh = this.startRefresh(companyId, options.forceRefresh === true);
    const fresh = await withDeadline(refresh, OPS_SNAPSHOT_INLINE_DEADLINE_MS);
    if (fresh.completed) return fresh.value;

    // The evaluation is still running and will populate the store when it lands.
    const fallback = this.stored.get(companyId);
    if (fallback) {
      return this.present(fallback, Date.now() - fallback.computedAtMs, true);
    }
    return this.buildPendingSnapshot(companyId);
  }

  /** Explicit Owner-triggered refresh — bypasses the stored evaluation. */
  async refreshSnapshot(companyId: string): Promise<OpsIntelligenceSnapshot> {
    return this.getSnapshot(companyId, { forceRefresh: true });
  }

  async getMorningBrief(companyId: string): Promise<OpsMorningBrief> {
    return (await this.getSnapshot(companyId)).morningBrief;
  }

  async getLiveStrip(companyId: string): Promise<OpsLiveStrip> {
    return (await this.getSnapshot(companyId)).liveStrip;
  }

  async getEvents(companyId: string): Promise<OpsIntelligenceEvent[]> {
    return (await this.getSnapshot(companyId)).events;
  }

  /** Drops the stored evaluation so an acknowledged reminder stops being reported. */
  private invalidate(companyId: string): void {
    this.stored.delete(companyId);
  }

  private startRefresh(companyId: string, force = false): Promise<OpsIntelligenceSnapshot> {
    const existing = this.refreshing.get(companyId);
    if (existing && !force) return existing;

    const run = (async () => {
      const now = new Date();
      const planDate = localPlanDateIso();
      const evaluation = await this.evaluateLive(companyId, planDate, now);
      const snapshot: OpsIntelligenceSnapshot = {
        generatedAt: now.toISOString(),
        planDate: evaluation.planDate,
        mapsCapability: evaluation.mapsCapability,
        cartrackConnected: evaluation.cartrackConnected,
        defaultTravelFallbackMinutes: evaluation.defaultTravelFallbackMinutes,
        events: evaluation.events,
        morningBrief: evaluation.morningBrief,
        liveStrip: evaluation.liveStrip,
        freshness: resolveOpsSnapshotFreshness(evaluation.sources),
        ageSeconds: 0,
        refreshing: false,
        dataAvailable: true,
        sources: evaluation.sources,
        guarantees: OPS_INTELLIGENCE_GUARANTEES,
      };
      this.stored.set(companyId, { snapshot, computedAtMs: Date.now() });
      return snapshot;
    })();

    const tracked = run.finally(() => {
      if (this.refreshing.get(companyId) === tracked) this.refreshing.delete(companyId);
    });
    this.refreshing.set(companyId, tracked);
    // A background refresh must never surface as an unhandled rejection.
    tracked.catch(() => {});
    return tracked;
  }

  private present(
    stored: StoredEvaluation,
    ageMs: number,
    refreshing: boolean,
  ): OpsIntelligenceSnapshot {
    const ageSeconds = Math.max(0, Math.round(ageMs / 1000));
    const aged = resolveStoredSnapshotFreshness(ageMs);
    // A partial evaluation stays partial however recently it ran.
    const freshness =
      aged === 'live' && stored.snapshot.freshness === 'partial' ? 'partial' : aged;
    return { ...stored.snapshot, freshness, ageSeconds, refreshing };
  }

  /**
   * What TITAN returns before it has ever evaluated this company: no counts, no
   * invented figures, and a state the UI can label truthfully.
   */
  private buildPendingSnapshot(companyId: string): OpsIntelligenceSnapshot {
    const planDate = localPlanDateIso();
    const now = new Date();
    const note =
      'TITAN is still evaluating operations for today. No figures are shown until the evaluation completes.';
    return {
      generatedAt: now.toISOString(),
      planDate,
      mapsCapability: 'not_configured',
      cartrackConnected: false,
      defaultTravelFallbackMinutes: OPS_DEFAULT_TRAVEL_FALLBACK_MINUTES,
      events: [],
      morningBrief: {
        generatedAt: now.toISOString(),
        planDate,
        summaryLine: note,
        sections: [],
        highestPriorities: [],
        auraHref: '/aura',
        weatherIncluded: false,
        weatherNote: 'Weather omitted — no weather provider is connected in TITAN.',
        honestyNotes: [note],
      },
      liveStrip: {
        generatedAt: now.toISOString(),
        counts: {
          techniciansDriving: 0,
          lateArrivals: 0,
          upcomingDepartures: 0,
          longestTravelMinutes: null,
          longestTravelLabel: null,
          jobsWaiting: 0,
          completedJobs: 0,
          emergencyQueue: 0,
        },
        mapsCapability: 'not_configured',
        cartrackConnected: false,
        honestyNotes: [note],
      },
      freshness: 'timed_out',
      ageSeconds: 0,
      refreshing: this.refreshing.has(companyId),
      dataAvailable: false,
      sources: [
        buildOpsSourceState('schedule', 'timed_out', note),
        buildOpsSourceState('fleet_tracking', 'timed_out', note),
        buildOpsSourceState('travel_routing', 'timed_out', note),
        buildOpsSourceState('morning_brief', 'timed_out', note),
      ],
      guarantees: OPS_INTELLIGENCE_GUARANTEES,
    };
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

    // The stored evaluation still lists this reminder — drop it so the next read re-evaluates.
    this.invalidate(scope.companyId);

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
      this.invalidate(scope.companyId);
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

  private async evaluateLive(
    companyId: string,
    planDate: string,
    now: Date,
  ): Promise<OpsEvaluation> {
    const { start, end } = dayBounds(planDate);

    // None of these five reads depends on another. Awaiting them one after the other
    // cost five sequential database round trips before any work could start.
    const [settings, googleMapsConnected, fleet, todayJobsRows, existingStates, morningBrief] =
      await Promise.all([
        this.db.query.companySchedulingSettings.findFirst({
          where: eq(companySchedulingSettings.companyId, companyId),
        }),
        this.googleMapsService.isConnected(companyId),
        this.integrationsService.buildFleetTrackingContext(companyId),
        this.db.query.jobs.findMany({
          where: and(
            eq(jobs.companyId, companyId),
            gte(jobs.scheduledAt, start),
            lt(jobs.scheduledAt, end),
            inArray(jobs.status, ['scheduled', 'in_progress', 'completed']),
          ),
          orderBy: [asc(jobs.scheduledAt)],
        }),
        this.db.query.opsIntelligenceReminderStates.findMany({
          where: and(
            eq(opsIntelligenceReminderStates.companyId, companyId),
            eq(opsIntelligenceReminderStates.planDate, planDate),
          ),
        }),
        this.buildMorningBrief(companyId, planDate),
      ]);

    const defaultTravelFallbackMinutes =
      settings?.defaultTravelMinutes ?? OPS_DEFAULT_TRAVEL_FALLBACK_MINUTES;
    const cartrackConnected = fleet.cartrackConnected;
    const todayJobs = todayJobsRows as JobRow[];
    const stateByKey = new Map(existingStates.map((s) => [s.dedupeKey, s]));

    const mapsCapability = resolveOpsMapsCapability({
      googleMapsConnected,
      hasSchedule: todayJobs.length > 0,
    });

    const techIds = [
      ...new Set(todayJobs.map((j) => j.assignedUserId).filter((id): id is string => Boolean(id))),
    ];
    const vehicleIds = fleet.latestPositions
      .map((p) => p.vehicleId)
      .filter((id): id is string => Boolean(id));

    const [techRows, vehicleRows] = await Promise.all([
      techIds.length > 0
        ? this.db.query.users.findMany({
            where: and(eq(users.companyId, companyId), inArray(users.id, techIds)),
            columns: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      vehicleIds.length > 0
        ? this.db.query.vehicles.findMany({
            where: and(eq(vehicles.companyId, companyId), inArray(vehicles.id, vehicleIds)),
            columns: { id: true, assignedUserId: true },
          })
        : Promise.resolve([] as Array<{ id: string; assignedUserId: string | null }>),
    ]);
    const techById = new Map(techRows.map((u) => [u.id, u]));

    const positionsByUser = new Map<
      string,
      { latitude: number; longitude: number; speedKmh: number | null; recordedAt: string }
    >();
    // Resolve GPS via vehicle assignedUserId when available — never invent positions.
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

    const events: OpsIntelligenceEvent[] = [];
    /** Reminder persistence and notifications — flushed once the response is shaped. */
    const followUpWrites: Array<() => Promise<void>> = [];
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

    // Every stop, in schedule order, with the origin/destination already resolved.
    type Stop = {
      job: JobRow;
      previous: JobRow | null;
      techPos: { latitude: number; longitude: number } | undefined;
      origin: { latitude: number; longitude: number } | null;
      destination: { latitude: number; longitude: number } | null;
    };
    const stops: Stop[] = [];
    for (const [, techJobs] of byTech) {
      techJobs.sort(
        (a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0),
      );
      for (let i = 0; i < techJobs.length; i++) {
        const job = techJobs[i]!;
        if (!job.scheduledAt) continue;

        const previous = i > 0 ? techJobs[i - 1]! : null;
        const techPos = job.assignedUserId ? positionsByUser.get(job.assignedUserId) : undefined;

        const origin =
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

        stops.push({ job, previous, techPos, origin, destination });
      }
    }

    /**
     * Routing runs a few stops at a time against a shared wall-clock budget, with the
     * connection state passed in. Previously each stop re-read the Cartrack and Google
     * rows and then waited on Google before the next stop could start, so a day's
     * schedule turned into a chain of provider calls the dashboard had to sit through.
     */
    let routingBudgetSpent = false;
    const routingDeadline = Date.now() + OPS_TRAVEL_PROVIDER_BUDGET_MS;
    const travelResults = await mapWithConcurrency(
      stops,
      OPS_TRAVEL_LOOKUP_CONCURRENCY,
      async (stop) => {
        const overBudget = Date.now() >= routingDeadline;
        if (overBudget) routingBudgetSpent = true;
        return this.travelTime.estimateTravelMinutes({
          companyId,
          fromJobId: stop.previous?.id,
          toJobId: stop.job.id,
          origin: stop.origin,
          destination: stop.destination,
          defaultMinutes: defaultTravelFallbackMinutes,
          knownCartrackConnected: cartrackConnected,
          knownGoogleMapsConnected: googleMapsConnected,
          skipProviderLookup: overBudget,
        });
      },
    );

    for (const [index, stop] of stops.entries()) {
      {
        const { job, techPos } = stop;
        if (!job.scheduledAt) continue;
        const travelResult = travelResults[index]!;

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

        // Reminder bookkeeping does not shape the response, so it is collected here
        // and flushed together rather than blocking each stop in turn.
        const assignedUserId = job.assignedUserId;
        followUpWrites.push(async () => {
          await this.persistNotifiedState({
            companyId,
            reminderType: effectiveType,
            dedupeKey,
            jobId: job.id,
            technicianId: assignedUserId,
            planDate,
            summary: event.title,
            existingId: existing?.id,
            now,
          });

          // Technician leave-now in-app notification (never customer-facing).
          if (effectiveType === 'leave_now' && assignedUserId) {
            await this.notificationService.createNotification({
              companyId,
              recipientType: 'staff',
              recipientUserId: assignedUserId,
              notificationType: 'dispatch_alert',
              title: event.title,
              body: event.body,
              entityType: 'job',
              entityId: job.id,
            });
          }
        });
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
        const technicianId = completed.assignedUserId;
        followUpWrites.push(async () => {
          await this.persistNotifiedState({
            companyId,
            reminderType: 'post_completion_next_job',
            dedupeKey,
            jobId: nextJob.id,
            technicianId,
            planDate,
            summary: event.title,
            existingId: existing?.id,
            now,
          });
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
      // The brief was already built alongside the other reads — building it a second
      // time here was doubling the query count of every snapshot request.
      const brief = morningBrief;
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
          followUpWrites.push(async () => {
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
          });
        }
      }
    }

    await mapWithConcurrency(followUpWrites, OPS_TRAVEL_LOOKUP_CONCURRENCY, (write) => write());

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
    if (routingBudgetSpent) {
      honestyNotes.push(
        'Some stops fell back to default travel minutes — live routing ran out of time for this refresh.',
      );
    }
    honestyNotes.push(
      'Ops Intelligence never auto-messages customers or changes bookings. Owner approval required.',
    );

    // Each source reports for itself so one degraded provider cannot take the card down.
    const fleetStatus: OpsSourceState = !cartrackConnected
      ? buildOpsSourceState(
          'fleet_tracking',
          'not_configured',
          'Cartrack is not connected for this company.',
        )
      : fleet.lastError
        ? buildOpsSourceState('fleet_tracking', 'unavailable', fleet.lastError)
        : fleet.connectionDisplayState === 'stale' || fleet.connectionDisplayState === 'degraded'
          ? buildOpsSourceState(
              'fleet_tracking',
              'stale',
              'Cartrack positions are older than the expected sync interval.',
            )
          : buildOpsSourceState('fleet_tracking', 'live');

    const routingStatus: OpsSourceState = !googleMapsConnected
      ? buildOpsSourceState(
          'travel_routing',
          'not_configured',
          'Google Maps routing is not connected — default travel minutes only.',
        )
      : routingBudgetSpent
        ? buildOpsSourceState(
            'travel_routing',
            'timed_out',
            'Live routing exceeded its budget for this refresh; the remaining stops used default travel minutes.',
          )
        : buildOpsSourceState('travel_routing', 'live');

    const sources: OpsSourceState[] = [
      buildOpsSourceState('schedule', 'live'),
      fleetStatus,
      routingStatus,
      buildOpsSourceState('morning_brief', 'live'),
    ];

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
      morningBrief,
      mapsCapability,
      cartrackConnected,
      defaultTravelFallbackMinutes,
      planDate,
      sources,
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
        ? [
            ...buildRunningLateSuggestedActions({
              jobId: job.id,
              navigateHref,
              technicianId: job.assignedUserId,
            }),
            ...(travel.source === 'google_maps' ? [buildRouteOptimisationSuggestedAction()] : []),
          ]
        : buildStandardEventActions({
            jobId: job.id,
            navigateHref,
            technicianId: job.assignedUserId,
            includeRouteOptimisation: travel.source === 'google_maps',
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
        snapshotLatitude: true,
        snapshotLongitude: true,
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
      (() => {
        // Advisory only — never auto-reorders. Requires verified coords on 2+ jobs per tech.
        const byTech = new Map<string, typeof todayJobRows>();
        for (const job of todayJobRows) {
          if (!job.assignedUserId) continue;
          if (!isValidLatLng(job.snapshotLatitude, job.snapshotLongitude)) continue;
          const list = byTech.get(job.assignedUserId) ?? [];
          list.push(job);
          byTech.set(job.assignedUserId, list);
        }
        const multiStopTechs = [...byTech.entries()].filter(([, list]) => list.length >= 2);
        return {
          key: 'route_optimisation',
          title: 'Route optimisation suggestions',
          items: multiStopTechs.slice(0, 5).map(([, list]) => {
            const labels = list
              .slice(0, 4)
              .map((j) => j.jobNumber ?? j.title)
              .join(' → ');
            return `${list.length} verified stops — review order in Scheduling (${labels}). Advisory only; no auto booking changes.`;
          }),
          count: multiStopTechs.length,
          href: '/scheduling',
        };
      })(),
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
