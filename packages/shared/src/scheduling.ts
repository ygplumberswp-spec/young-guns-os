export type CalendarJobDisplayStatus =
  | 'Unassigned'
  | 'Scheduled'
  | 'Dispatched'
  | 'Travelling'
  | 'On site'
  | 'Completed'
  | 'Delayed'
  | 'Cancelled';

export type CalendarViewMode = 'day' | 'week' | 'month';

export type JobAssignee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
};

export type ScheduledJobEvent = {
  id: string;
  jobNumber: string | null;
  title: string;
  status: string;
  displayStatus: CalendarJobDisplayStatus;
  executionPhase: string;
  priority: string;
  jobType: string | null;
  customerId: string;
  customerName: string;
  suburb: string | null;
  addressDisplay: string | null;
  siteContactName: string | null;
  siteContactMobile: string | null;
  accessWarning: boolean;
  accessInstructions: string | null;
  scheduledAt: string;
  scheduledEndAt: string | null;
  expectedFinishAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  vehicleLabel: string | null;
  crewLabel: string | null;
};

export type SchedulingCalendarFilters = {
  technicianId?: string | null;
  status?: string | null;
  suburb?: string | null;
  priority?: string | null;
};

export type SchedulingCalendarResponse = {
  from: string;
  to: string;
  scheduledCount: number;
  viewScope: 'all' | 'own';
  events: ScheduledJobEvent[];
  settings: SchedulingSettingsSummary;
};

export type SchedulingSettingsSummary = {
  schedulingBufferMinutes: number;
  defaultTravelMinutes: number;
  workDayStartHour: number;
  workDayEndHour: number;
  cartrackConnected: boolean;
  travelTimeSource: 'default' | 'cartrack' | 'google_maps';
};

export type SchedulingConflictType =
  | 'overlap'
  | 'leave'
  | 'outside_hours'
  | 'unavailable_technician'
  | 'impossible_travel';

export type SchedulingConflict = {
  type: SchedulingConflictType;
  message: string;
  severity: 'block' | 'warn';
};

export type SchedulingConflictSuggestion = {
  kind: 'next_available' | 'alternate_technician' | 'closest_slot';
  label: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
};

export type SchedulingConflictCheckRequest = {
  jobId?: string | null;
  scheduledAt: string;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
  durationMinutes?: number | null;
};

export type SchedulingConflictCheckResponse = {
  hasConflicts: boolean;
  conflicts: SchedulingConflict[];
  suggestions: SchedulingConflictSuggestion[];
  canOverride: boolean;
};

export type SchedulingCalendarPatchRequest = {
  scheduledAt: string;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
  overrideReason?: string | null;
  acknowledgeConflicts?: boolean;
};

export type SchedulingStats = {
  scheduledCount: number;
};

export type ScheduleJobRequest = {
  scheduledAt: string;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
  overrideReason?: string | null;
  acknowledgeConflicts?: boolean;
};

export type UpdateScheduleRequest = {
  scheduledAt?: string | null;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
  clearSchedule?: boolean;
  overrideReason?: string | null;
  acknowledgeConflicts?: boolean;
};

/** Map job record fields to calendar card display status. */
export function mapCalendarJobDisplayStatus(input: {
  status: string;
  assignedUserId: string | null;
  executionPhase: string;
  scheduledAt: string;
  scheduledEndAt?: string | null;
}): CalendarJobDisplayStatus {
  if (input.status === 'cancelled') return 'Cancelled';
  if (input.status === 'completed') return 'Completed';

  if (!input.assignedUserId) return 'Unassigned';

  if (input.executionPhase === 'en_route') return 'Travelling';
  if (input.executionPhase === 'on_site' || input.executionPhase === 'in_progress') {
    return 'On site';
  }
  if (input.executionPhase === 'accepted') return 'Dispatched';

  const now = Date.now();
  const endMs = input.scheduledEndAt
    ? new Date(input.scheduledEndAt).getTime()
    : new Date(input.scheduledAt).getTime() + 60 * 60_000;

  if (
    input.status !== 'completed' &&
    input.status !== 'cancelled' &&
    endMs < now &&
    ['scheduled', 'in_progress', 'new'].includes(input.status)
  ) {
    return 'Delayed';
  }

  if (input.status === 'scheduled' || input.status === 'new') return 'Scheduled';
  return 'Scheduled';
}
