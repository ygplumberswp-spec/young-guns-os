import type { EnterpriseReleaseCenterDashboard, RcAuditLogSummary } from '@titan/shared';
import { request } from './api-client';

export async function fetchReleaseCenterDashboard(accessToken: string): Promise<EnterpriseReleaseCenterDashboard> {
  const data = await request<{ dashboard: EnterpriseReleaseCenterDashboard }>('/enterprise-release-center/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function runIntegrationValidation(accessToken: string) {
  const data = await request<{ run: unknown }>('/enterprise-release-center/integration-validation/run', {
    accessToken,
    method: 'POST',
  });
  return data.run;
}

export async function runWorkflowValidation(accessToken: string) {
  const data = await request<{ run: unknown }>('/enterprise-release-center/workflow-validation/run', {
    accessToken,
    method: 'POST',
  });
  return data.run;
}

export async function capturePerformanceSnapshot(accessToken: string) {
  const data = await request<{ snapshot: unknown }>('/enterprise-release-center/performance/capture', {
    accessToken,
    method: 'POST',
  });
  return data.snapshot;
}

export async function runSecurityVerification(accessToken: string) {
  const data = await request<{ run: unknown }>('/enterprise-release-center/security-verification/run', {
    accessToken,
    method: 'POST',
  });
  return data.run;
}

export async function runConfigurationReview(accessToken: string) {
  const data = await request<{ review: unknown }>('/enterprise-release-center/configuration-review/run', {
    accessToken,
    method: 'POST',
  });
  return data.review;
}

export async function generateReleaseReport(accessToken: string) {
  const data = await request<{ report: unknown }>('/enterprise-release-center/release-report/generate', {
    accessToken,
    method: 'POST',
  });
  return data.report;
}

export async function syncReleaseCenterAlerts(accessToken: string) {
  const data = await request<{ platformAlerts: unknown[] }>('/enterprise-release-center/platform-alerts/sync', {
    accessToken,
    method: 'POST',
  });
  return data.platformAlerts;
}

export async function captureReleaseCenterAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-release-center/analytics/capture', {
    accessToken,
    method: 'POST',
  });
  return data.analytics;
}

export async function fetchReleaseCenterAuditLogs(accessToken: string): Promise<RcAuditLogSummary[]> {
  const data = await request<{ auditLogs: RcAuditLogSummary[] }>('/enterprise-release-center/audit-logs', {
    accessToken,
  });
  return data.auditLogs;
}
