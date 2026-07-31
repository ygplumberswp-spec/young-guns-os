import type { NcAuditLogSummary, EnterpriseNotificationsDashboard } from '@titan/shared';
import { request } from './api-client';

export async function fetchNotificationsDashboard(
  accessToken: string,
): Promise<EnterpriseNotificationsDashboard> {
  const data = await request<{ dashboard: EnterpriseNotificationsDashboard }>(
    '/enterprise-notifications/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function syncPlatformAlerts(accessToken: string) {
  const data = await request<{ platformAlerts: unknown[] }>(
    '/enterprise-notifications/platform-alerts/sync',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.platformAlerts;
}

export async function captureNotificationsAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>(
    '/enterprise-notifications/analytics/capture',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.analytics;
}

export async function fetchNotificationsAuditLogs(
  accessToken: string,
): Promise<NcAuditLogSummary[]> {
  const data = await request<{ auditLogs: NcAuditLogSummary[] }>(
    '/enterprise-notifications/audit-logs',
    {
      accessToken,
    },
  );
  return data.auditLogs;
}

export async function markAllNotificationsRead(accessToken: string) {
  const data = await request<{ inboxItems: unknown[] }>(
    '/enterprise-notifications/inbox/mark-all-read',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.inboxItems;
}

export async function createNotificationRule(
  accessToken: string,
  input: { name: string; moduleSource?: string; channels?: string[] },
) {
  const data = await request<{ rule: unknown }>('/enterprise-notifications/rules', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.rule;
}

export async function createNotificationTemplate(
  accessToken: string,
  input: { templateKey: string; name: string; subjectTemplate: string; bodyTemplate: string },
) {
  const data = await request<{ template: unknown }>('/enterprise-notifications/templates', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.template;
}

export async function acknowledgeAlert(accessToken: string, alertId: string) {
  const data = await request<{ alert: unknown }>(
    `/enterprise-notifications/alerts/${alertId}/acknowledge`,
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.alert;
}

export async function resolveAlert(accessToken: string, alertId: string) {
  const data = await request<{ alert: unknown }>(
    `/enterprise-notifications/alerts/${alertId}/resolve`,
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.alert;
}
