import type { EnterpriseReleaseManagementDashboard, RlmAuditLogSummary } from '@titan/shared';
import { request } from './api-client';

export async function fetchReleaseManagementDashboard(accessToken: string): Promise<EnterpriseReleaseManagementDashboard> {
  const data = await request<{ dashboard: EnterpriseReleaseManagementDashboard }>('/enterprise-release-management/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function runMobilePackagingReview(accessToken: string) {
  const data = await request<{ review: unknown }>('/enterprise-release-management/mobile-packaging-review/run', {
    accessToken,
    method: 'POST',
  });
  return data.review;
}

export async function runAppStoreReadinessReviews(accessToken: string) {
  const data = await request<{ reviews: unknown[] }>('/enterprise-release-management/app-store-readiness/run', {
    accessToken,
    method: 'POST',
  });
  return data.reviews;
}

export async function runBrandingReview(accessToken: string) {
  const data = await request<{ review: unknown }>('/enterprise-release-management/branding-review/run', {
    accessToken,
    method: 'POST',
  });
  return data.review;
}

export async function runUxReview(accessToken: string) {
  const data = await request<{ review: unknown }>('/enterprise-release-management/ux-review/run', {
    accessToken,
    method: 'POST',
  });
  return data.review;
}

export async function refreshDocumentationStatus(accessToken: string) {
  const data = await request<{ artifacts: unknown[] }>('/enterprise-release-management/documentation/refresh', {
    accessToken,
    method: 'POST',
  });
  return data.artifacts;
}

export async function finalizeVersion(accessToken: string) {
  const data = await request<{ versionRecord: unknown }>('/enterprise-release-management/version/finalize', {
    accessToken,
    method: 'POST',
  });
  return data.versionRecord;
}

export async function syncReleaseManagementAlerts(accessToken: string) {
  const data = await request<{ platformAlerts: unknown[] }>('/enterprise-release-management/platform-alerts/sync', {
    accessToken,
    method: 'POST',
  });
  return data.platformAlerts;
}

export async function captureReleaseManagementAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-release-management/analytics/capture', {
    accessToken,
    method: 'POST',
  });
  return data.analytics;
}

export async function fetchReleaseManagementAuditLogs(accessToken: string): Promise<RlmAuditLogSummary[]> {
  const data = await request<{ auditLogs: RlmAuditLogSummary[] }>('/enterprise-release-management/audit-logs', {
    accessToken,
  });
  return data.auditLogs;
}
