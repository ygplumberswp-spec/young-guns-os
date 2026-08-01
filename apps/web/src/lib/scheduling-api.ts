import type {
  JobAssignee,
  ScheduleJobRequest,
  ScheduledJobEvent,
  SchedulingCalendarFilters,
  SchedulingCalendarPatchRequest,
  SchedulingCalendarResponse,
  SchedulingConflictCheckRequest,
  SchedulingConflictCheckResponse,
  SchedulingStats,
  UpdateScheduleRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchSchedulingStats(accessToken: string): Promise<SchedulingStats> {
  return request<SchedulingStats>('/scheduling/stats', { accessToken });
}

export async function fetchAssignees(accessToken: string): Promise<JobAssignee[]> {
  const data = await request<{ assignees: JobAssignee[] }>('/scheduling/assignees', {
    accessToken,
  });

  return data.assignees;
}

export async function fetchSchedulingCalendar(
  accessToken: string,
  from: string,
  to: string,
  filters: SchedulingCalendarFilters = {},
): Promise<SchedulingCalendarResponse> {
  const params = new URLSearchParams({ from, to });
  if (filters.technicianId) params.set('technicianId', filters.technicianId);
  if (filters.status) params.set('status', filters.status);
  if (filters.suburb) params.set('suburb', filters.suburb);
  if (filters.priority) params.set('priority', filters.priority);

  return request<SchedulingCalendarResponse>(`/scheduling/calendar?${params.toString()}`, {
    accessToken,
  });
}

export async function checkSchedulingConflicts(
  accessToken: string,
  body: SchedulingConflictCheckRequest,
): Promise<SchedulingConflictCheckResponse> {
  return request<SchedulingConflictCheckResponse>('/scheduling/calendar/conflicts', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function patchCalendarEvent(
  accessToken: string,
  jobId: string,
  body: SchedulingCalendarPatchRequest,
): Promise<ScheduledJobEvent | null> {
  const data = await request<{ event: ScheduledJobEvent | null }>(
    `/scheduling/calendar/${jobId}`,
    {
      method: 'PATCH',
      accessToken,
      body,
    },
  );
  return data.event;
}

export async function scheduleJob(
  accessToken: string,
  jobId: string,
  body: ScheduleJobRequest,
): Promise<ScheduledJobEvent> {
  const data = await request<{ event: ScheduledJobEvent }>(`/scheduling/jobs/${jobId}/schedule`, {
    method: 'POST',
    accessToken,
    body,
  });

  return data.event;
}

export async function updateJobSchedule(
  accessToken: string,
  jobId: string,
  body: UpdateScheduleRequest,
): Promise<ScheduledJobEvent | null> {
  const data = await request<{ event: ScheduledJobEvent | null }>(
    `/scheduling/jobs/${jobId}/schedule`,
    {
      method: 'PATCH',
      accessToken,
      body,
    },
  );

  return data.event;
}
