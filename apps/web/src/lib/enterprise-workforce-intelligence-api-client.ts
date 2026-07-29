import { request, ApiClientError } from './api-client';
import type { EnterpriseWorkforceIntelligenceDashboard, UpdateWiPlatformConfigRequest } from '@titan/shared';

export { ApiClientError as EnterpriseWorkforceIntelligenceApiClientError };

export async function fetchWorkforceIntelligenceDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseWorkforceIntelligenceDashboard }>(
    '/enterprise-workforce/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureWorkforceAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-workforce/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function captureTechnicianPerformance(accessToken: string) {
  const data = await request<{ snapshots: unknown[] }>('/enterprise-workforce/performance/capture', {
    method: 'POST',
    accessToken,
  });
  return data.snapshots;
}

export async function testWorkforceProvider(accessToken: string, providerId: string) {
  const data = await request<{ provider: unknown }>(
    `/enterprise-workforce/providers/${providerId}/test`,
    { method: 'POST', accessToken },
  );
  return data.provider;
}

export async function approveTimesheet(accessToken: string, timesheetId: string) {
  const data = await request<{ timesheet: unknown }>(
    `/enterprise-workforce/timesheets/${timesheetId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.timesheet;
}

export async function approveLeaveApplication(accessToken: string, applicationId: string) {
  const data = await request<{ application: unknown }>(
    `/enterprise-workforce/leave/applications/${applicationId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.application;
}

export async function updateWorkforcePlatformConfig(accessToken: string, body: UpdateWiPlatformConfigRequest) {
  const data = await request<{ platformConfig: unknown }>('/enterprise-workforce/platform-config', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.platformConfig;
}

export async function fetchManagerWorkspace(accessToken: string) {
  const data = await request<{ workspace: unknown }>('/enterprise-workforce/manager', { accessToken });
  return data.workspace;
}

export async function fetchSelfService(accessToken: string) {
  const data = await request<{ selfService: unknown }>('/enterprise-workforce/self-service', { accessToken });
  return data.selfService;
}
