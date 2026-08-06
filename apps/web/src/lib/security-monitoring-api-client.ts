import type {
  DecideSecmonRecommendationRequest,
  OpenSecmonIncidentRequest,
  SecmonAuditEntry,
  SecmonDashboard,
  SecmonIncident,
  SecmonSettings,
  SecmonTriageState,
  TriageSecmonSignalRequest,
  UpdateSecmonIncidentRequest,
  UpdateSecmonSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as SecurityMonitoringApiClientError };

export async function fetchSecmonDashboard(accessToken: string) {
  const data = await request<{ dashboard: SecmonDashboard }>('/security-monitoring/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchSecmonSettings(accessToken: string) {
  const data = await request<{ settings: SecmonSettings }>('/security-monitoring/settings', {
    accessToken,
  });
  return data.settings;
}

export async function updateSecmonSettings(
  accessToken: string,
  body: UpdateSecmonSettingsRequest,
) {
  const data = await request<{ settings: SecmonSettings }>('/security-monitoring/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function triageSecmonSignal(
  accessToken: string,
  signalKey: string,
  body: TriageSecmonSignalRequest,
) {
  const data = await request<{ signalKey: string; triage: SecmonTriageState }>(
    `/security-monitoring/signals/${encodeURIComponent(signalKey)}/triage`,
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function openSecmonIncident(
  accessToken: string,
  body: OpenSecmonIncidentRequest,
) {
  const data = await request<{ incident: SecmonIncident }>('/security-monitoring/incidents', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.incident;
}

export async function updateSecmonIncident(
  accessToken: string,
  incidentId: string,
  body: UpdateSecmonIncidentRequest,
) {
  const data = await request<{ incident: SecmonIncident }>(
    `/security-monitoring/incidents/${encodeURIComponent(incidentId)}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.incident;
}

/**
 * Records the Owner's decision. The API never performs the underlying
 * operation, so nothing is deleted, revoked, rotated or disconnected here.
 */
export async function decideSecmonRecommendation(
  accessToken: string,
  recommendationKey: string,
  body: DecideSecmonRecommendationRequest,
) {
  const data = await request<{
    recommendationKey: string;
    decision: 'approved' | 'rejected';
    executed: false;
  }>(`/security-monitoring/recommendations/${encodeURIComponent(recommendationKey)}/decide`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data;
}

export async function fetchSecmonAudit(accessToken: string, limit = 100) {
  const data = await request<{ entries: SecmonAuditEntry[] }>(
    `/security-monitoring/audit?limit=${encodeURIComponent(String(limit))}`,
    { accessToken },
  );
  return data.entries;
}
