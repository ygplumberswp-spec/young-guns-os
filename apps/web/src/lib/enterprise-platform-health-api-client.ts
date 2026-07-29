import type { PhAuditLogSummary, EnterprisePlatformHealthDashboard } from '@titan/shared';
import { request } from './api-client';

export async function fetchPlatformHealthDashboard(accessToken: string): Promise<EnterprisePlatformHealthDashboard> {
  const data = await request<{ dashboard: EnterprisePlatformHealthDashboard }>('/enterprise-platform-health/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function captureHealthSnapshot(accessToken: string) {
  const data = await request<{ healthSnapshot: unknown }>('/enterprise-platform-health/health-snapshots/capture', {
    accessToken,
    method: 'POST',
  });
  return data.healthSnapshot;
}

export async function runDiagnostics(accessToken: string) {
  const data = await request<{ diagnosticRun: unknown }>('/enterprise-platform-health/diagnostics/run', {
    accessToken,
    method: 'POST',
  });
  return data.diagnosticRun;
}

export async function generatePerformanceInsights(accessToken: string) {
  const data = await request<{ performanceInsights: unknown[] }>('/enterprise-platform-health/performance/insights/generate', {
    accessToken,
    method: 'POST',
  });
  return data.performanceInsights;
}

export async function captureCapacitySnapshot(accessToken: string) {
  const data = await request<{ capacitySnapshot: unknown }>('/enterprise-platform-health/capacity/capture', {
    accessToken,
    method: 'POST',
  });
  return data.capacitySnapshot;
}

export async function syncPlatformHealthAlerts(accessToken: string) {
  const data = await request<{ platformAlerts: unknown[] }>('/enterprise-platform-health/platform-alerts/sync', {
    accessToken,
    method: 'POST',
  });
  return data.platformAlerts;
}

export async function capturePlatformHealthAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-platform-health/analytics/capture', {
    accessToken,
    method: 'POST',
  });
  return data.analytics;
}

export async function fetchPlatformHealthAuditLogs(accessToken: string): Promise<PhAuditLogSummary[]> {
  const data = await request<{ auditLogs: PhAuditLogSummary[] }>('/enterprise-platform-health/audit-logs', {
    accessToken,
  });
  return data.auditLogs;
}

export async function createPlatformHealthIncident(
  accessToken: string,
  input: { title: string; description?: string; severity?: string },
) {
  const data = await request<{ incident: unknown }>('/enterprise-platform-health/incidents', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.incident;
}

export async function resolvePlatformHealthIncident(accessToken: string, incidentId: string) {
  const data = await request<{ incident: unknown }>(`/enterprise-platform-health/incidents/${incidentId}`, {
    accessToken,
    method: 'PUT',
    body: { status: 'resolved' },
  });
  return data.incident;
}
