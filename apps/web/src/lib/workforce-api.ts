import type { BusinessDayTimelineResponse } from '@titan/shared';
import { request } from './api-client';

export async function fetchBusinessDayTimeline(
  accessToken: string,
  date: string,
  userId?: string | null,
): Promise<BusinessDayTimelineResponse> {
  const params = new URLSearchParams({ date });
  if (userId) params.set('userId', userId);

  return request<BusinessDayTimelineResponse>(`/scheduling/day-timeline?${params.toString()}`, {
    accessToken,
  });
}
