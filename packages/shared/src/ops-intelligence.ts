/**
 * TITAN Operations Intelligence V1 — advisory schedule/travel awareness.
 * Never invents locations, ETAs, traffic, or jobs. Never auto-messages customers
 * or auto-changes bookings. Owner approval required for suggested actions.
 */

import type { MapsEtaCapabilityState } from './young-guns-ops.js';
import { buildAddressMapsDeepLink } from './young-guns-ops.js';

/** Default travel minutes used only when real Maps/routing data is unavailable. */
export const OPS_DEFAULT_TRAVEL_FALLBACK_MINUTES = 20;

/** Minutes before leave-by to surface "next job approaching". */
export const OPS_APPROACHING_LEAD_MINUTES = 15;

/** Extra prep buffer added on top of travel time for leave-by. */
export const OPS_LEAVE_PREP_MINUTES = 5;

/** On-arrival proximity radius (meters) — real GPS only. */
export const OPS_ON_ARRIVAL_RADIUS_METERS = 150;

/** Suppress duplicate reminder emissions within this window. */
export const OPS_REMINDER_DEDUPE_COOLDOWN_MS = 30 * 60_000;

/**
 * A stored evaluation younger than this is served as-is. The Owner dashboard reads
 * the stored snapshot; live provider work happens on refresh, not in the render path.
 */
export const OPS_SNAPSHOT_FRESH_MS = 60_000;

/** Past this age a stored evaluation is served but labelled stale, and a refresh is started. */
export const OPS_SNAPSHOT_STALE_MS = 5 * 60_000;

/** Beyond this the stored evaluation is too old to present as the current picture. */
export const OPS_SNAPSHOT_MAX_SERVE_MS = 30 * 60_000;

/** How long a cold request waits for a first evaluation before answering honestly instead. */
export const OPS_SNAPSHOT_INLINE_DEADLINE_MS = 6_000;

/** How soon the dashboard looks again after being told an evaluation is still running. */
export const OPS_SNAPSHOT_FOLLOW_UP_MS = 5_000;

/** Total wall-clock budget for live routing lookups in one evaluation. */
export const OPS_TRAVEL_PROVIDER_BUDGET_MS = 5_000;

/** Concurrent routing lookups — enough to beat serial latency without spiking provider usage. */
export const OPS_TRAVEL_LOOKUP_CONCURRENCY = 4;

/** Where one part of the Ops Intelligence picture comes from. */
export type OpsSourceKey = 'schedule' | 'fleet_tracking' | 'travel_routing' | 'morning_brief';

export type OpsSourceStatus =
  | 'live'
  | 'stale'
  | 'not_configured'
  | 'unavailable'
  | 'timed_out';

/** Honest per-source state so one slow provider never mislabels the whole card. */
export type OpsSourceState = {
  key: OpsSourceKey;
  label: string;
  status: OpsSourceStatus;
  /** Plain-language reason when the status is not `live`. */
  detail: string | null;
};

/**
 * Overall state of a snapshot payload.
 * - `live` — evaluated just now, every source answered
 * - `partial` — evaluated now, but at least one source could not answer
 * - `stale` — stored evaluation served while a refresh runs
 * - `timed_out` — no stored evaluation and the first one did not finish in time
 * - `unavailable` — the evaluation failed outright
 */
export type OpsSnapshotFreshness = 'live' | 'partial' | 'stale' | 'timed_out' | 'unavailable';

const OPS_SOURCE_LABELS: Record<OpsSourceKey, string> = {
  schedule: 'Schedule',
  fleet_tracking: 'Cartrack tracking',
  travel_routing: 'Google Maps routing',
  morning_brief: 'Morning brief',
};

export function opsSourceLabel(key: OpsSourceKey): string {
  return OPS_SOURCE_LABELS[key];
}

export function buildOpsSourceState(
  key: OpsSourceKey,
  status: OpsSourceStatus,
  detail: string | null = null,
): OpsSourceState {
  return { key, label: OPS_SOURCE_LABELS[key], status, detail };
}

/** `live` only when every source answered; a single degraded source makes it `partial`. */
export function resolveOpsSnapshotFreshness(sources: OpsSourceState[]): OpsSnapshotFreshness {
  const degraded = sources.some(
    (source) => source.status === 'unavailable' || source.status === 'timed_out',
  );
  return degraded ? 'partial' : 'live';
}

/** Age-based state for a stored evaluation that is being served without recomputing. */
export function resolveStoredSnapshotFreshness(ageMs: number): OpsSnapshotFreshness {
  if (ageMs <= OPS_SNAPSHOT_FRESH_MS) return 'live';
  if (ageMs <= OPS_SNAPSHOT_MAX_SERVE_MS) return 'stale';
  return 'unavailable';
}

export function formatOpsSnapshotFreshnessLabel(
  freshness: OpsSnapshotFreshness,
  ageSeconds: number,
): string {
  switch (freshness) {
    case 'live':
      return 'Live';
    case 'partial':
      return 'Partial — some sources did not answer';
    case 'stale':
      return `Stale — ${formatOpsAge(ageSeconds)} old, refreshing`;
    case 'timed_out':
      return 'Timed out — no figures rather than guessed ones';
    case 'unavailable':
    default:
      return 'Unavailable';
  }
}

export function formatOpsAge(ageSeconds: number): string {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return 'unknown age';
  if (ageSeconds < 60) return `${Math.round(ageSeconds)}s`;
  const minutes = Math.round(ageSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

/** The one line the Live Fleet Map shows instead of blanking when insights lag behind. */
export const OPS_INSIGHTS_DEGRADED_MESSAGE = 'Operational insights temporarily unavailable.';

/**
 * Whether the map card should keep its vehicles and drop only the insight numbers.
 * Cartrack positions are independent of Ops Intelligence, so a slow evaluation must
 * never take the map down with it.
 */
export function shouldKeepFleetMapOnOpsFailure(): true {
  return true;
}

export type OpsTravelSource = 'google_maps' | 'default' | 'unavailable';

export type OpsReminderType =
  | 'next_job_approaching'
  | 'leave_now'
  | 'running_late'
  | 'on_arrival'
  | 'post_completion_next_job'
  | 'morning_brief';

export type OpsReminderStateStatus =
  | 'pending'
  | 'notified'
  | 'acknowledged'
  | 'dismissed'
  | 'suppressed';

export type OpsSuggestedActionType =
  | 'open_job_360'
  | 'navigate'
  | 'contact_technician'
  | 'notify_customer'
  | 'move_booking'
  | 'reassign'
  | 'suggest_route_order'
  | 'dismiss'
  | 'open_aura';

/** All suggested actions are advisory — never executed by ops intelligence. */
export type OpsSuggestedAction = {
  type: OpsSuggestedActionType;
  label: string;
  /** Existing TITAN route or external deep link; null when not available. */
  href: string | null;
  /** True when the action would contact a customer — always requires owner approval. */
  requiresOwnerApproval: boolean;
  /** True when the action would change schedule — always requires owner approval. */
  wouldChangeSchedule: boolean;
  /** Honest note when the action cannot be completed from this surface. */
  honestyNote: string | null;
};

export type OpsTravelEstimate = {
  minutes: number | null;
  distanceMeters: number | null;
  distanceText: string | null;
  durationInTrafficMinutes: number | null;
  source: OpsTravelSource;
  mapsCapability: MapsEtaCapabilityState;
  warning: string | null;
};

export type OpsIntelligenceEvent = {
  id: string;
  reminderType: OpsReminderType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  technicianId: string | null;
  technicianName: string | null;
  scheduledAt: string | null;
  leaveByAt: string | null;
  travel: OpsTravelEstimate | null;
  navigateHref: string | null;
  audience: 'owner' | 'technician' | 'both';
  suggestedActions: OpsSuggestedAction[];
  dedupeKey: string;
  detectedAt: string;
  /** Always false in V1 — ops intelligence never auto-executes. */
  autoExecuted: false;
};

export type OpsMorningBriefSection = {
  key: string;
  title: string;
  items: string[];
  count: number;
  href: string | null;
};

export type OpsMorningBrief = {
  generatedAt: string;
  planDate: string;
  summaryLine: string;
  sections: OpsMorningBriefSection[];
  highestPriorities: string[];
  auraHref: string;
  /** Weather omitted when no real provider is connected. */
  weatherIncluded: false;
  weatherNote: string;
  honestyNotes: string[];
};

export type OpsLiveStripCounts = {
  techniciansDriving: number;
  lateArrivals: number;
  upcomingDepartures: number;
  longestTravelMinutes: number | null;
  longestTravelLabel: string | null;
  jobsWaiting: number;
  completedJobs: number;
  emergencyQueue: number;
};

export type OpsLiveStrip = {
  generatedAt: string;
  counts: OpsLiveStripCounts;
  mapsCapability: MapsEtaCapabilityState;
  cartrackConnected: boolean;
  honestyNotes: string[];
};

export type OpsIntelligenceSnapshot = {
  generatedAt: string;
  planDate: string;
  mapsCapability: MapsEtaCapabilityState;
  cartrackConnected: boolean;
  defaultTravelFallbackMinutes: number;
  events: OpsIntelligenceEvent[];
  morningBrief: OpsMorningBrief;
  liveStrip: OpsLiveStrip;
  /** How current this payload is — see {@link OpsSnapshotFreshness}. */
  freshness: OpsSnapshotFreshness;
  /** Age of the underlying evaluation. 0 when it was just computed. */
  ageSeconds: number;
  /** True while a background refresh is running for this company. */
  refreshing: boolean;
  /** False when TITAN has no evaluation yet and is reporting that instead of zeros. */
  dataAvailable: boolean;
  /** Per-source honesty behind the headline state. */
  sources: OpsSourceState[];
  /** Explicit V1 guarantees. */
  guarantees: {
    autoCustomerMessages: false;
    autoScheduleChanges: false;
    ownerApprovalRequired: true;
  };
};

export type OpsAckReminderRequest = {
  status: 'acknowledged' | 'dismissed';
};

export type OpsReminderStateSummary = {
  id: string;
  reminderType: OpsReminderType;
  dedupeKey: string;
  jobId: string | null;
  status: OpsReminderStateStatus;
  notifiedAt: string | null;
  acknowledgedAt: string | null;
  dismissedAt: string | null;
};

export function formatOpsTravelSourceLabel(source: OpsTravelSource): string {
  switch (source) {
    case 'google_maps':
      return 'Google Maps travel time';
    case 'default':
      return 'Default travel allowance (no live route)';
    case 'unavailable':
    default:
      return 'Travel time unavailable';
  }
}

export function resolveOpsMapsCapability(input: {
  googleMapsConnected: boolean;
  providerError?: boolean;
  hasSchedule: boolean;
}): MapsEtaCapabilityState {
  if (input.providerError) return 'provider_unavailable';
  if (input.googleMapsConnected) return 'connected';
  if (input.hasSchedule) return 'schedule_only';
  return 'not_configured';
}

/** Leave-by = scheduled start − travel − prep. Uses real travel when provided. */
export function computeLeaveByMs(input: {
  scheduledAtMs: number;
  travelMinutes: number;
  prepMinutes?: number;
}): number {
  const prep = input.prepMinutes ?? OPS_LEAVE_PREP_MINUTES;
  const bufferMs = (Math.max(0, input.travelMinutes) + Math.max(0, prep)) * 60_000;
  return input.scheduledAtMs - bufferMs;
}

export function isLeaveNow(input: {
  nowMs: number;
  leaveByMs: number;
  scheduledAtMs: number;
}): boolean {
  return input.nowMs >= input.leaveByMs && input.nowMs < input.scheduledAtMs;
}

export function isNextJobApproaching(input: {
  nowMs: number;
  leaveByMs: number;
  leadMinutes?: number;
}): boolean {
  const lead = (input.leadMinutes ?? OPS_APPROACHING_LEAD_MINUTES) * 60_000;
  return input.nowMs >= input.leaveByMs - lead && input.nowMs < input.leaveByMs;
}

export function isRunningLate(input: {
  nowMs: number;
  scheduledAtMs: number;
  /** Optional: if technician already marked on site / arrived, not late for arrival. */
  alreadyArrived?: boolean;
}): boolean {
  if (input.alreadyArrived) return false;
  return input.nowMs > input.scheduledAtMs;
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** On-arrival only when both tech GPS and job coordinates are real. */
export function isOnArrival(input: {
  technicianLatitude: number | null | undefined;
  technicianLongitude: number | null | undefined;
  jobLatitude: number | null | undefined;
  jobLongitude: number | null | undefined;
  radiusMeters?: number;
}): boolean {
  const {
    technicianLatitude: tLat,
    technicianLongitude: tLng,
    jobLatitude: jLat,
    jobLongitude: jLng,
  } = input;
  if (
    tLat == null ||
    tLng == null ||
    jLat == null ||
    jLng == null ||
    !Number.isFinite(tLat) ||
    !Number.isFinite(tLng) ||
    !Number.isFinite(jLat) ||
    !Number.isFinite(jLng)
  ) {
    return false;
  }
  const radius = input.radiusMeters ?? OPS_ON_ARRIVAL_RADIUS_METERS;
  return haversineMeters(tLat, tLng, jLat, jLng) <= radius;
}

export function buildOpsReminderDedupeKey(input: {
  companyId: string;
  reminderType: OpsReminderType;
  jobId?: string | null;
  planDate: string;
}): string {
  const jobPart = input.jobId ?? 'none';
  return `${input.companyId}:${input.reminderType}:${jobPart}:${input.planDate}`;
}

export function shouldEmitReminder(input: {
  existingStatus: OpsReminderStateStatus | null;
  lastNotifiedAtMs: number | null;
  nowMs: number;
  cooldownMs?: number;
}): boolean {
  if (input.existingStatus === 'acknowledged' || input.existingStatus === 'dismissed') {
    return false;
  }
  if (input.existingStatus === 'suppressed') {
    return false;
  }
  if (input.existingStatus === 'notified' && input.lastNotifiedAtMs != null) {
    const cooldown = input.cooldownMs ?? OPS_REMINDER_DEDUPE_COOLDOWN_MS;
    if (input.nowMs - input.lastNotifiedAtMs < cooldown) {
      return false;
    }
  }
  return true;
}

/** Detect the highest-priority schedule reminder for a single upcoming job. */
export function detectJobScheduleReminder(input: {
  nowMs: number;
  scheduledAtMs: number;
  travelMinutes: number;
  travelSource: OpsTravelSource;
  alreadyArrived?: boolean;
  onArrival?: boolean;
}): OpsReminderType | null {
  if (input.onArrival) return 'on_arrival';
  if (isRunningLate({
    nowMs: input.nowMs,
    scheduledAtMs: input.scheduledAtMs,
    alreadyArrived: input.alreadyArrived,
  })) {
    return 'running_late';
  }
  const leaveByMs = computeLeaveByMs({
    scheduledAtMs: input.scheduledAtMs,
    travelMinutes: input.travelMinutes,
  });
  if (isLeaveNow({ nowMs: input.nowMs, leaveByMs, scheduledAtMs: input.scheduledAtMs })) {
    return 'leave_now';
  }
  if (isNextJobApproaching({ nowMs: input.nowMs, leaveByMs })) {
    return 'next_job_approaching';
  }
  return null;
}

export function buildNavigateHref(input: {
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  if (
    input.latitude != null &&
    input.longitude != null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${input.latitude},${input.longitude}`;
  }
  return buildAddressMapsDeepLink(input.formattedAddress);
}

export function buildRunningLateSuggestedActions(input: {
  jobId: string;
  navigateHref: string | null;
  technicianId: string | null;
}): OpsSuggestedAction[] {
  return [
    {
      type: 'open_job_360',
      label: 'Open Job 360',
      href: `/jobs/${input.jobId}`,
      requiresOwnerApproval: false,
      wouldChangeSchedule: false,
      honestyNote: null,
    },
    {
      type: 'navigate',
      label: 'Navigate',
      href: input.navigateHref,
      requiresOwnerApproval: false,
      wouldChangeSchedule: false,
      honestyNote: input.navigateHref
        ? null
        : 'No verified address or coordinates — Navigate unavailable.',
    },
    {
      type: 'contact_technician',
      label: 'Contact Technician',
      href: input.technicianId ? `/team` : '/team',
      requiresOwnerApproval: false,
      wouldChangeSchedule: false,
      honestyNote: null,
    },
    {
      type: 'notify_customer',
      label: 'Notify Customer',
      href: `/jobs/${input.jobId}`,
      requiresOwnerApproval: true,
      wouldChangeSchedule: false,
      honestyNote:
        'Advisory only — TITAN will not send a customer message until you approve and send it.',
    },
    {
      type: 'move_booking',
      label: 'Move Next Booking',
      href: '/scheduling',
      requiresOwnerApproval: true,
      wouldChangeSchedule: true,
      honestyNote: 'Advisory only — open Scheduling to move a booking. No automatic changes.',
    },
    {
      type: 'reassign',
      label: 'Reassign',
      href: `/jobs/${input.jobId}`,
      requiresOwnerApproval: true,
      wouldChangeSchedule: true,
      honestyNote: 'Advisory only — reassignment requires owner/manager action in Job 360.',
    },
    {
      type: 'dismiss',
      label: 'Dismiss',
      href: null,
      requiresOwnerApproval: false,
      wouldChangeSchedule: false,
      honestyNote: null,
    },
  ];
}

export function buildStandardEventActions(input: {
  jobId: string | null;
  navigateHref: string | null;
  technicianId: string | null;
  /** When true, include advisory route-order suggestion (never auto-applies). */
  includeRouteOptimisation?: boolean;
}): OpsSuggestedAction[] {
  const actions: OpsSuggestedAction[] = [];
  if (input.jobId) {
    actions.push({
      type: 'open_job_360',
      label: 'Open Job 360',
      href: `/jobs/${input.jobId}`,
      requiresOwnerApproval: false,
      wouldChangeSchedule: false,
      honestyNote: null,
    });
  }
  actions.push({
    type: 'navigate',
    label: 'Navigate',
    href: input.navigateHref,
    requiresOwnerApproval: false,
    wouldChangeSchedule: false,
    honestyNote: input.navigateHref
      ? null
      : 'No verified address or coordinates — Navigate unavailable.',
  });
  if (input.includeRouteOptimisation) {
    actions.push(buildRouteOptimisationSuggestedAction());
  }
  if (input.technicianId || input.jobId) {
    actions.push({
      type: 'contact_technician',
      label: 'Contact Technician',
      href: '/team',
      requiresOwnerApproval: false,
      wouldChangeSchedule: false,
      honestyNote: null,
    });
  }
  actions.push({
    type: 'dismiss',
    label: 'Dismiss',
    href: null,
    requiresOwnerApproval: false,
    wouldChangeSchedule: false,
    honestyNote: null,
  });
  return actions;
}

/**
 * Advisory route optimisation suggestion — Owner reporting / Scheduling review only.
 * Never auto-reorders bookings.
 */
export function buildRouteOptimisationSuggestedAction(): OpsSuggestedAction {
  return {
    type: 'suggest_route_order',
    label: 'Review Route Order',
    href: '/scheduling',
    requiresOwnerApproval: true,
    wouldChangeSchedule: true,
    honestyNote:
      'Advisory only — TITAN suggests reviewing stop order in Scheduling. No automatic booking changes.',
  };
}

/** Explicit guarantee constant for API responses and tests. */
export const OPS_INTELLIGENCE_GUARANTEES = {
  autoCustomerMessages: false as const,
  autoScheduleChanges: false as const,
  ownerApprovalRequired: true as const,
};
