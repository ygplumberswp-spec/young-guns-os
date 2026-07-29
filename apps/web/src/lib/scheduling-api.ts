import type {
  JobAssignee,
  ScheduleJobRequest,
  ScheduledJobEvent,
  SchedulingCalendarResponse,
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
): Promise<SchedulingCalendarResponse> {
  const params = new URLSearchParams({ from, to });
  return request<SchedulingCalendarResponse>(`/scheduling/calendar?${params.toString()}`, {
    accessToken,
  });
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
