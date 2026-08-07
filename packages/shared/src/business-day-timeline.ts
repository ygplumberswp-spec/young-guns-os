import type { MobileTimeEntryType } from './mobile-workforce.js';

export type BusinessDayTimelineEventKind = 'time_entry' | 'workflow';

export type BusinessDayTimelineCategory =
  | 'attendance'
  | 'travel'
  | 'labour'
  | 'break'
  | 'workflow';

export type BusinessDayTimelineEvent = {
  id: string;
  kind: BusinessDayTimelineEventKind;
  occurredAt: string;
  label: string;
  detail: string | null;
  userId: string;
  userName: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  durationMinutes: number | null;
  category: BusinessDayTimelineCategory;
};

export type BusinessDayTimelineSummary = {
  date: string;
  totalEvents: number;
  uniqueUsers: number;
  totalJobTimeMinutes: number;
  totalTravelMinutes: number;
  workflowEventCount: number;
};

export type BusinessDayTimelineResponse = {
  date: string;
  events: BusinessDayTimelineEvent[];
  summary: BusinessDayTimelineSummary;
};

export const TIME_ENTRY_LABELS: Record<MobileTimeEntryType, string> = {
  clock_in: 'Clock in',
  clock_out: 'Clock out',
  break_start: 'Break start',
  break_end: 'Break end',
  travel: 'Travel',
  job_time: 'On-site labour',
};

export const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  accept: 'Accepted job',
  en_route: 'Started travel',
  arrive: 'Arrived on site',
  start_work: 'Started work',
  pause: 'Paused work',
  resume: 'Resumed work',
  await_customer: 'Awaiting customer',
  await_parts: 'Awaiting parts',
  await_approval: 'Awaiting approval',
  ready_to_complete: 'Ready to complete',
  complete: 'Completed job',
  reopen: 'Reopened job',
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a calendar date (YYYY-MM-DD) into UTC day bounds for querying. */
export function parseBusinessDayRange(dateIso: string): { from: Date; to: Date } {
  if (!ISO_DATE_PATTERN.test(dateIso)) {
    throw new Error('INVALID_DATE');
  }

  const from = new Date(`${dateIso}T00:00:00.000Z`);
  const to = new Date(`${dateIso}T23:59:59.999Z`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('INVALID_DATE');
  }

  return { from, to };
}

export function categoryForTimeEntry(entryType: MobileTimeEntryType): BusinessDayTimelineCategory {
  switch (entryType) {
    case 'clock_in':
    case 'clock_out':
      return 'attendance';
    case 'break_start':
    case 'break_end':
      return 'break';
    case 'travel':
      return 'travel';
    case 'job_time':
      return 'labour';
    default:
      return 'attendance';
  }
}

export function labelForWorkflowAction(action: string): string {
  return WORKFLOW_ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

export function buildBusinessDayTimelineSummary(
  date: string,
  events: BusinessDayTimelineEvent[],
): BusinessDayTimelineSummary {
  const userIds = new Set<string>();
  let totalJobTimeMinutes = 0;
  let totalTravelMinutes = 0;
  let workflowEventCount = 0;

  for (const event of events) {
    userIds.add(event.userId);

    if (event.kind === 'workflow') {
      workflowEventCount += 1;
    }

    if (event.category === 'labour') {
      totalJobTimeMinutes += event.durationMinutes ?? 0;
    }

    if (event.category === 'travel') {
      totalTravelMinutes += event.durationMinutes ?? 0;
    }
  }

  return {
    date,
    totalEvents: events.length,
    uniqueUsers: userIds.size,
    totalJobTimeMinutes,
    totalTravelMinutes,
    workflowEventCount,
  };
}

/** Merge and sort timeline events chronologically (newest first for office review). */
export function mergeBusinessDayTimelineEvents(
  events: BusinessDayTimelineEvent[],
): BusinessDayTimelineEvent[] {
  return [...events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}
