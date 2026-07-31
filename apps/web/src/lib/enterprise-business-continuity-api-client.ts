import type {
  BcAuditLogSummary,
  BcContinuityAlertSummary,
  EnterpriseBusinessContinuityDashboard,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchBusinessContinuityDashboard(
  accessToken: string,
): Promise<EnterpriseBusinessContinuityDashboard> {
  const data = await request<{ dashboard: EnterpriseBusinessContinuityDashboard }>(
    '/enterprise-business-continuity/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function syncContinuityAlerts(
  accessToken: string,
): Promise<BcContinuityAlertSummary[]> {
  const data = await request<{ continuityAlerts: BcContinuityAlertSummary[] }>(
    '/enterprise-business-continuity/continuity-alerts/sync',
    { accessToken, method: 'POST' },
  );
  return data.continuityAlerts;
}

export async function captureBusinessContinuityAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>(
    '/enterprise-business-continuity/analytics/capture',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.analytics;
}

export async function fetchBusinessContinuityAuditLogs(
  accessToken: string,
): Promise<BcAuditLogSummary[]> {
  const data = await request<{ auditLogs: BcAuditLogSummary[] }>(
    '/enterprise-business-continuity/audit-logs',
    {
      accessToken,
    },
  );
  return data.auditLogs;
}
