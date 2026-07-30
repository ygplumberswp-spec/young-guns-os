import type {
  MobileJobExecutionWorkspace,
  MobileRouteIntelligence,
  MobileWorkforceDashboard,
  MobileWorkforceInventoryCentre,
  MobileWorkforceJobList,
  MobileWorkforceNotificationCentre,
  MobileOfflineBundle,
  MobileSyncProcessResult,
  MobileTimeEntrySummary,
  MobileWorkforceRequestSummary,
  NotificationSummary,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as MobileApiClientError };

export async function fetchMobileWorkforceDashboard(
  accessToken: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
) {
  const data = await request<{ dashboard: MobileWorkforceDashboard }>(
    '/mobile/technician/workforce/dashboard',
    {
      accessToken,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 20_000,
    },
  );
  return data.dashboard;
}

export async function fetchMobileWorkforceJobs(accessToken: string) {
  return request<MobileWorkforceJobList>('/mobile/technician/workforce/jobs', { accessToken });
}

export async function fetchMobileJobWorkspace(accessToken: string, jobId: string) {
  const data = await request<{ workspace: MobileJobExecutionWorkspace }>(
    `/mobile/technician/workforce/jobs/${jobId}`,
    { accessToken },
  );
  return data.workspace;
}

export async function fetchMobileRoute(accessToken: string) {
  const data = await request<{ route: MobileRouteIntelligence }>(
    '/mobile/technician/workforce/route',
    { accessToken },
  );
  return data.route;
}

export async function fetchMobileInventory(accessToken: string) {
  const data = await request<{ inventory: MobileWorkforceInventoryCentre }>(
    '/mobile/technician/workforce/inventory',
    { accessToken },
  );
  return data.inventory;
}

export async function fetchMobileTimeEntries(accessToken: string) {
  const data = await request<{ entries: MobileTimeEntrySummary[] }>(
    '/mobile/technician/workforce/time',
    { accessToken },
  );
  return data.entries;
}

export async function createMobileTimeEntry(
  accessToken: string,
  body: { entryType: string; jobId?: string; notes?: string },
) {
  const data = await request<{ entry: MobileTimeEntrySummary }>(
    '/mobile/technician/workforce/time',
    { accessToken, method: 'POST', body },
  );
  return data.entry;
}

export async function fetchMobileNotifications(accessToken: string) {
  return request<MobileWorkforceNotificationCentre>(
    '/mobile/technician/workforce/notifications',
    { accessToken },
  );
}

export async function fetchMobileNotificationsLegacy(accessToken: string) {
  const data = await request<{ notifications: NotificationSummary[] }>(
    '/mobile/technician/notifications',
    { accessToken },
  );
  return data.notifications;
}

export async function markMobileNotificationRead(accessToken: string, notificationId: string) {
  return request<{ success: boolean }>(`/mobile/technician/notifications/${notificationId}/read`, {
    accessToken,
    method: 'PATCH',
  });
}

export async function fetchMobileRequests(accessToken: string) {
  const data = await request<{ requests: MobileWorkforceRequestSummary[] }>(
    '/mobile/technician/workforce/requests',
    { accessToken },
  );
  return data.requests;
}

export async function createMobileRequest(
  accessToken: string,
  body: {
    requestType: string;
    subject: string;
    message: string;
    entityType?: string;
    entityId?: string;
  },
) {
  const data = await request<{ request: MobileWorkforceRequestSummary }>(
    '/mobile/technician/workforce/requests',
    { accessToken, method: 'POST', body },
  );
  return data.request;
}

export async function fetchMobileOfflineBundle(accessToken: string) {
  const data = await request<{ bundle: MobileOfflineBundle }>(
    '/mobile/technician/workforce/offline',
    { accessToken },
  );
  return data.bundle;
}

export async function processMobileSync(accessToken: string) {
  const data = await request<{ result: MobileSyncProcessResult }>(
    '/mobile/technician/workforce/sync/process',
    { accessToken, method: 'POST', body: {} },
  );
  return data.result;
}
