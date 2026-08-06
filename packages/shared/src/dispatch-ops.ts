/**
 * TITAN Operations — Dispatch Intelligence helpers.
 * Maps dual-track job.status + executionPhase onto dispatcher ops labels.
 * Never invents ETA, GPS, or outbound messages.
 */

import type { JobExecutionPhase } from './job-execution.js';
import type { JobPriority } from './job-contract.js';
import type { MapsEtaCapabilityState } from './young-guns-ops.js';
import type { UcDispatchNotificationType, UcProviderChannel } from './enterprise-unified-communications.js';

/** Dispatcher-facing technician/job status flow (ops display). */
export type DispatcherStatusStep =
  | 'scheduled'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed';

export const DISPATCHER_STATUS_FLOW: readonly DispatcherStatusStep[] = [
  'scheduled',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
] as const;

export type DispatcherTechnicianAvailability =
  | 'available'
  | 'scheduled'
  | 'en_route'
  | 'on_site'
  | 'in_progress'
  | 'off_duty';

/** Honest customer ETA readiness — schedule-based until live routing inputs exist. */
export type CustomerEtaReadinessState =
  | 'schedule_based'
  | 'live_routing_ready'
  | 'technician_location_available'
  | 'awaiting_coordinates'
  | 'maps_not_connected'
  | 'unavailable';

export type CustomerEtaReadiness = {
  state: CustomerEtaReadinessState;
  label: string;
  /** ISO timestamp when schedule-based or live estimate exists; never invented. */
  etaAt: string | null;
  travelMinutes: number | null;
  travelSource: 'default' | 'google_maps' | 'cartrack' | null;
  mapsCapability: MapsEtaCapabilityState;
  cartrackPositionAvailable: boolean;
  warning: string | null;
};

export type DispatchCommunicationHookType =
  | 'appointment_confirmation'
  | 'technician_en_route'
  | 'job_completed';

export type DispatchCommunicationReadinessState =
  | 'ready_to_queue'
  | 'channel_unavailable'
  | 'missing_recipient'
  | 'not_applicable'
  | 'already_queued';

export type DispatchCommunicationReadiness = {
  hookType: DispatchCommunicationHookType;
  notificationType: UcDispatchNotificationType;
  state: DispatchCommunicationReadinessState;
  label: string;
  preferredChannel: UcProviderChannel | null;
  recipientAddress: string | null;
  /** Draft body only — never auto-sent. */
  draftMessageBody: string | null;
  requiresApproval: true;
};

export function formatDispatcherStatusLabel(step: DispatcherStatusStep): string {
  switch (step) {
    case 'scheduled':
      return 'Scheduled';
    case 'en_route':
      return 'En route';
    case 'arrived':
      return 'Arrived';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
  }
}

/**
 * Map dual-track office status + field executionPhase to dispatcher flow step.
 * Field phase wins when present; office completed/cancelled still short-circuit.
 */
export function mapDualTrackToDispatcherStatus(input: {
  status: string;
  executionPhase?: string | null;
}): DispatcherStatusStep {
  if (input.status === 'completed') return 'completed';
  if (input.status === 'cancelled') return 'scheduled';

  const phase = (input.executionPhase ?? null) as JobExecutionPhase | null;

  switch (phase) {
    case 'en_route':
      return 'en_route';
    case 'on_site':
      return 'arrived';
    case 'in_progress':
    case 'paused':
    case 'awaiting_customer':
    case 'awaiting_parts':
    case 'awaiting_approval':
    case 'ready_to_complete':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'assigned':
    case 'accepted':
    case null:
    default:
      return 'scheduled';
  }
}

export function deriveTechnicianAvailability(input: {
  hasAssignedJobsToday: boolean;
  dominantStep: DispatcherStatusStep | null;
}): DispatcherTechnicianAvailability {
  if (!input.hasAssignedJobsToday || !input.dominantStep) return 'available';
  switch (input.dominantStep) {
    case 'en_route':
      return 'en_route';
    case 'arrived':
      return 'on_site';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'available';
    case 'scheduled':
    default:
      return 'scheduled';
  }
}

export function formatTechnicianAvailabilityLabel(
  availability: DispatcherTechnicianAvailability,
): string {
  switch (availability) {
    case 'available':
      return 'Available';
    case 'scheduled':
      return 'Scheduled';
    case 'en_route':
      return 'En route';
    case 'on_site':
      return 'On site';
    case 'in_progress':
      return 'In progress';
    case 'off_duty':
      return 'Off duty';
  }
}

export function formatCustomerEtaReadinessLabel(state: CustomerEtaReadinessState): string {
  switch (state) {
    case 'live_routing_ready':
      return 'Live routing ETA ready';
    case 'technician_location_available':
      return 'Technician GPS available — routing pending';
    case 'schedule_based':
      return 'Schedule-based ETA';
    case 'awaiting_coordinates':
      return 'Awaiting verified coordinates';
    case 'maps_not_connected':
      return 'Maps not connected — schedule ETA only';
    case 'unavailable':
      return 'ETA unavailable';
  }
}

/**
 * Honest ETA readiness. Prefer schedule window until Maps can route from real coords.
 * Never invents minutes or arrival times.
 */
export function resolveCustomerEtaReadiness(input: {
  status: string;
  assignedUserId: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  jobHasVerifiedCoordinates: boolean;
  mapsCapability: MapsEtaCapabilityState;
  cartrackPositionAvailable: boolean;
  travelMinutes?: number | null;
  travelSource?: 'default' | 'google_maps' | 'cartrack' | null;
  travelWarning?: string | null;
}): CustomerEtaReadiness {
  if (
    !input.assignedUserId ||
    input.status === 'cancelled' ||
    input.status === 'completed'
  ) {
    return {
      state: 'unavailable',
      label: formatCustomerEtaReadinessLabel('unavailable'),
      etaAt: null,
      travelMinutes: null,
      travelSource: null,
      mapsCapability: input.mapsCapability,
      cartrackPositionAvailable: input.cartrackPositionAvailable,
      warning: null,
    };
  }

  const scheduleEta = input.scheduledEndAt ?? input.scheduledAt;
  const mapsConnected = input.mapsCapability === 'connected';
  const travelMinutes =
    typeof input.travelMinutes === 'number' && Number.isFinite(input.travelMinutes)
      ? input.travelMinutes
      : null;

  if (
    mapsConnected &&
    input.jobHasVerifiedCoordinates &&
    input.cartrackPositionAvailable &&
    input.travelSource === 'google_maps' &&
    travelMinutes != null
  ) {
    return {
      state: 'live_routing_ready',
      label: formatCustomerEtaReadinessLabel('live_routing_ready'),
      etaAt: scheduleEta,
      travelMinutes,
      travelSource: 'google_maps',
      mapsCapability: input.mapsCapability,
      cartrackPositionAvailable: true,
      warning: input.travelWarning ?? null,
    };
  }

  if (input.cartrackPositionAvailable && !mapsConnected) {
    return {
      state: 'technician_location_available',
      label: formatCustomerEtaReadinessLabel('technician_location_available'),
      etaAt: scheduleEta,
      travelMinutes: null,
      travelSource: null,
      mapsCapability: input.mapsCapability,
      cartrackPositionAvailable: true,
      warning:
        'Cartrack GPS is available for presence. Live customer ETA requires Google Maps routing with verified job coordinates.',
    };
  }

  if (input.cartrackPositionAvailable && mapsConnected && !input.jobHasVerifiedCoordinates) {
    return {
      state: 'awaiting_coordinates',
      label: formatCustomerEtaReadinessLabel('awaiting_coordinates'),
      etaAt: scheduleEta,
      travelMinutes: null,
      travelSource: null,
      mapsCapability: input.mapsCapability,
      cartrackPositionAvailable: true,
      warning:
        'Technician GPS is available, but the job site lacks verified coordinates for live routing.',
    };
  }

  if (!mapsConnected) {
    return {
      state: 'maps_not_connected',
      label: formatCustomerEtaReadinessLabel('maps_not_connected'),
      etaAt: scheduleEta,
      travelMinutes: null,
      travelSource: null,
      mapsCapability: input.mapsCapability,
      cartrackPositionAvailable: input.cartrackPositionAvailable,
      warning: 'Customer ETA uses the planned schedule until Google Maps routing is connected.',
    };
  }

  if (!input.jobHasVerifiedCoordinates) {
    return {
      state: 'awaiting_coordinates',
      label: formatCustomerEtaReadinessLabel('awaiting_coordinates'),
      etaAt: scheduleEta,
      travelMinutes: null,
      travelSource: null,
      mapsCapability: input.mapsCapability,
      cartrackPositionAvailable: input.cartrackPositionAvailable,
      warning: 'Add or verify job site coordinates before live routing ETA is available.',
    };
  }

  return {
    state: 'schedule_based',
    label: formatCustomerEtaReadinessLabel('schedule_based'),
    etaAt: scheduleEta,
    travelMinutes: travelMinutes,
    travelSource: input.travelSource ?? null,
    mapsCapability: input.mapsCapability,
    cartrackPositionAvailable: input.cartrackPositionAvailable,
    warning:
      input.travelWarning ??
      'Showing planned schedule ETA until a live vehicle-to-job route estimate is available.',
  };
}

export function mapDispatcherStepToCommunicationHook(
  step: DispatcherStatusStep,
): DispatchCommunicationHookType | null {
  switch (step) {
    case 'scheduled':
      return 'appointment_confirmation';
    case 'en_route':
      return 'technician_en_route';
    case 'completed':
      return 'job_completed';
    default:
      return null;
  }
}

export function mapWorkflowActionToCommunicationHook(
  action: string,
): DispatchCommunicationHookType | null {
  switch (action) {
    case 'en_route':
      return 'technician_en_route';
    case 'complete':
      return 'job_completed';
    default:
      return null;
  }
}

export function communicationHookToNotificationType(
  hook: DispatchCommunicationHookType,
): UcDispatchNotificationType {
  switch (hook) {
    case 'appointment_confirmation':
      return 'appointment_confirmation';
    case 'technician_en_route':
      return 'technician_en_route';
    case 'job_completed':
      return 'completion';
  }
}

export function buildDispatchCommunicationDraftBody(input: {
  hookType: DispatchCommunicationHookType;
  customerName: string;
  jobTitle: string;
  technicianName: string | null;
  scheduledAt: string | null;
  etaLabel: string | null;
}): string {
  const tech = input.technicianName?.trim() || 'Your technician';
  const when = input.scheduledAt
    ? new Date(input.scheduledAt).toLocaleString([], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'the scheduled time';

  switch (input.hookType) {
    case 'appointment_confirmation':
      return `Hi ${input.customerName}, your appointment for "${input.jobTitle}" is confirmed for ${when}.`;
    case 'technician_en_route':
      return input.etaLabel
        ? `Hi ${input.customerName}, ${tech} is en route for "${input.jobTitle}". ${input.etaLabel}`
        : `Hi ${input.customerName}, ${tech} is en route for "${input.jobTitle}".`;
    case 'job_completed':
      return `Hi ${input.customerName}, work on "${input.jobTitle}" has been marked completed.`;
  }
}

/**
 * Assess outbound CX communication readiness. Never sends — draft→approve→queue only.
 */
export function assessDispatchCommunicationReadiness(input: {
  hookType: DispatchCommunicationHookType;
  customerName: string;
  jobTitle: string;
  technicianName: string | null;
  scheduledAt: string | null;
  etaLabel: string | null;
  recipientAddress: string | null;
  activeChannels: readonly UcProviderChannel[];
  preferredChannel?: UcProviderChannel | null;
  alreadyQueued?: boolean;
}): DispatchCommunicationReadiness {
  const notificationType = communicationHookToNotificationType(input.hookType);
  const draftMessageBody = buildDispatchCommunicationDraftBody(input);
  const preferred =
    input.preferredChannel && input.activeChannels.includes(input.preferredChannel)
      ? input.preferredChannel
      : input.activeChannels.includes('whatsapp')
        ? 'whatsapp'
        : input.activeChannels.includes('sms')
          ? 'sms'
          : input.activeChannels.includes('email')
            ? 'email'
            : null;

  if (input.alreadyQueued) {
    return {
      hookType: input.hookType,
      notificationType,
      state: 'already_queued',
      label: 'Already queued — awaiting send adapter',
      preferredChannel: preferred,
      recipientAddress: input.recipientAddress,
      draftMessageBody,
      requiresApproval: true,
    };
  }

  if (!preferred) {
    return {
      hookType: input.hookType,
      notificationType,
      state: 'channel_unavailable',
      label: 'No active WhatsApp / SMS / Email adapter',
      preferredChannel: null,
      recipientAddress: input.recipientAddress,
      draftMessageBody,
      requiresApproval: true,
    };
  }

  if (!input.recipientAddress?.trim()) {
    return {
      hookType: input.hookType,
      notificationType,
      state: 'missing_recipient',
      label: `Ready channel (${preferred}) — recipient missing`,
      preferredChannel: preferred,
      recipientAddress: null,
      draftMessageBody,
      requiresApproval: true,
    };
  }

  return {
    hookType: input.hookType,
    notificationType,
    state: 'ready_to_queue',
    label: `Draft ready — approve to queue via ${preferred}`,
    preferredChannel: preferred,
    recipientAddress: input.recipientAddress.trim(),
    draftMessageBody,
    requiresApproval: true,
  };
}

/** Dominant (most advanced) step among a technician's jobs for availability. */
export function dominantDispatcherStatus(
  steps: readonly DispatcherStatusStep[],
): DispatcherStatusStep | null {
  if (steps.length === 0) return null;
  const rank: Record<DispatcherStatusStep, number> = {
    scheduled: 1,
    en_route: 2,
    arrived: 3,
    in_progress: 4,
    completed: 0,
  };
  let best: DispatcherStatusStep = steps[0]!;
  for (const step of steps) {
    if (rank[step] > rank[best]) best = step;
  }
  // If all completed, treat as available (null dominant for availability helper).
  if (steps.every((s) => s === 'completed')) return null;
  return best === 'completed' ? null : best;
}

/** Aligns with ops-intel emergencyQueue — urgent/high open work only. */
export function isDispatcherEmergencyPriority(priority: JobPriority | string | null | undefined): boolean {
  return priority === 'urgent' || priority === 'high';
}

export function jobPriorityRank(priority: JobPriority | string | null | undefined): number {
  switch (priority) {
    case 'urgent':
      return 4;
    case 'high':
      return 3;
    case 'normal':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

/**
 * Sort for dispatcher workload: urgent/high first, then planned start, then title.
 * Does not invent priorities — uses stored job.priority only.
 */
export function compareJobsForDispatcherBoard<
  T extends {
    priority?: JobPriority | string | null;
    scheduledAt?: string | null;
    title?: string | null;
    status?: string | null;
  },
>(a: T, b: T): number {
  const aDone = a.status === 'completed' || a.status === 'cancelled';
  const bDone = b.status === 'completed' || b.status === 'cancelled';
  if (aDone !== bDone) return aDone ? 1 : -1;

  const byPriority = jobPriorityRank(b.priority) - jobPriorityRank(a.priority);
  if (byPriority !== 0) return byPriority;

  const aAt = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
  const bAt = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
  if (aAt !== bAt) return aAt - bAt;

  return (a.title ?? '').localeCompare(b.title ?? '');
}

export function selectDispatcherEmergencyJobs<
  T extends {
    priority?: JobPriority | string | null;
    status?: string | null;
  },
>(jobs: readonly T[]): T[] {
  return jobs
    .filter(
      (job) =>
        isDispatcherEmergencyPriority(job.priority) &&
        job.status !== 'completed' &&
        job.status !== 'cancelled',
    )
    .slice()
    .sort(compareJobsForDispatcherBoard);
}
