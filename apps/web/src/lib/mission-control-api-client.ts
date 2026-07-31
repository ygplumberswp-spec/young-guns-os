import type {
  EnterpriseMissionControlDashboard,
  MissionControlModuleSnapshot,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as MissionControlApiClientError };

export type MissionControlSummary = Omit<EnterpriseMissionControlDashboard, 'moduleSnapshots'>;

export async function fetchMissionControlSummary(accessToken: string) {
  const data = await request<{ summary: MissionControlSummary }>(
    '/mission-control/dashboard/summary',
    {
      accessToken,
    },
  );
  return data.summary;
}

export async function fetchMissionControlModuleSnapshots(accessToken: string) {
  const data = await request<{ moduleSnapshots: MissionControlModuleSnapshot[] }>(
    '/mission-control/dashboard/modules',
    { accessToken },
  );
  return data.moduleSnapshots;
}

export async function fetchMissionControlDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseMissionControlDashboard }>(
    '/mission-control/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function syncMissionControlAlerts(accessToken: string) {
  const data = await request<{ alerts: EnterpriseMissionControlDashboard['recentAlerts'] }>(
    '/mission-control/alerts/sync',
    { accessToken, method: 'POST' },
  );
  return data.alerts;
}

export async function acknowledgeMissionControlAlert(accessToken: string, alertId: string) {
  const data = await request<{ alert: EnterpriseMissionControlDashboard['recentAlerts'][number] }>(
    '/mission-control/alerts/acknowledge',
    { accessToken, method: 'POST', body: { alertId } },
  );
  return data.alert;
}

export async function captureMissionControlOperationsMap(accessToken: string) {
  const data = await request<{ points: EnterpriseMissionControlDashboard['operationsMap'] }>(
    '/mission-control/operations-map/capture',
    { accessToken, method: 'POST' },
  );
  return data.points;
}

export async function syncMissionControlTimeline(accessToken: string) {
  const data = await request<{ events: EnterpriseMissionControlDashboard['timelineEvents'] }>(
    '/mission-control/timeline/sync',
    { accessToken, method: 'POST' },
  );
  return data.events;
}

export async function generateMissionControlRecommendations(accessToken: string) {
  const data = await request<{
    recommendations: EnterpriseMissionControlDashboard['recommendations'];
  }>('/mission-control/recommendations/generate', { accessToken, method: 'POST' });
  return data.recommendations;
}

export async function refreshMissionControlDepartmentHealth(accessToken: string) {
  const data = await request<{
    departmentHealth: EnterpriseMissionControlDashboard['departmentHealth'];
  }>('/mission-control/department-health/refresh', { accessToken, method: 'POST' });
  return data.departmentHealth;
}

export async function createMissionControlIncident(
  accessToken: string,
  input: { title: string; description: string; severity?: string },
) {
  const data = await request<{
    incident: EnterpriseMissionControlDashboard['activeIncidents'][number];
  }>('/mission-control/incidents', { accessToken, method: 'POST', body: input });
  return data.incident;
}

export async function createMissionControlCommandAction(
  accessToken: string,
  input: {
    actionType: string;
    subject: string;
    recommendation: string;
    incidentId?: string | null;
  },
) {
  const data = await request<{ action: { id: string } }>('/mission-control/actions', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.action;
}
