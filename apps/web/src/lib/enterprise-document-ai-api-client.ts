import type {
  DipAuditLogSummary,
  DipDocumentAlertSummary,
  EnterpriseDocumentAiDashboard,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchDocumentAiDashboard(
  accessToken: string,
): Promise<EnterpriseDocumentAiDashboard> {
  const data = await request<{ dashboard: EnterpriseDocumentAiDashboard }>(
    '/enterprise-document-ai/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function syncDocumentAlerts(accessToken: string): Promise<DipDocumentAlertSummary[]> {
  const data = await request<{ documentAlerts: DipDocumentAlertSummary[] }>(
    '/enterprise-document-ai/document-alerts/sync',
    { accessToken, method: 'POST' },
  );
  return data.documentAlerts;
}

export async function captureDocumentAiAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-document-ai/analytics/capture', {
    accessToken,
    method: 'POST',
  });
  return data.analytics;
}

export async function fetchDocumentAiAuditLogs(accessToken: string): Promise<DipAuditLogSummary[]> {
  const data = await request<{ auditLogs: DipAuditLogSummary[] }>(
    '/enterprise-document-ai/audit-logs',
    {
      accessToken,
    },
  );
  return data.auditLogs;
}

export async function searchDocuments(accessToken: string, query: string) {
  const data = await request<{ results: unknown[] }>('/enterprise-document-ai/search', {
    accessToken,
    method: 'POST',
    body: { query },
  });
  return data.results;
}
