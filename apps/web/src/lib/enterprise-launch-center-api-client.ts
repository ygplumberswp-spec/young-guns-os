import type { EnterpriseLaunchCenterDashboard, LncAuditLogSummary } from '@titan/shared';
import { request } from './api-client';

export async function fetchLaunchCenterDashboard(accessToken: string): Promise<EnterpriseLaunchCenterDashboard> {
  const data = await request<{ dashboard: EnterpriseLaunchCenterDashboard }>('/enterprise-launch-center/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function runReadinessScan(accessToken: string) {
  const data = await request<{ scan: unknown }>('/enterprise-launch-center/readiness-scans/run', {
    accessToken,
    method: 'POST',
  });
  return data.scan;
}

export async function runAcceptanceTests(accessToken: string, suiteId?: string) {
  const data = await request<{ run: unknown }>('/enterprise-launch-center/acceptance/run', {
    accessToken,
    method: 'POST',
    body: suiteId ? { suiteId } : {},
  });
  return data.run;
}

export async function createGoLiveWizard(accessToken: string, input: { title: string }) {
  const data = await request<{ wizard: unknown }>('/enterprise-launch-center/go-live/wizards', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.wizard;
}

export async function approveGoLiveWizard(accessToken: string, wizardId: string, notes?: string) {
  const data = await request<{ wizard: unknown }>(`/enterprise-launch-center/go-live/wizards/${wizardId}/approve`, {
    accessToken,
    method: 'POST',
    body: { notes },
  });
  return data.wizard;
}

export async function runPostDeploymentValidation(accessToken: string, goLiveWizardId?: string) {
  const data = await request<{ validation: unknown }>('/enterprise-launch-center/deployment-validations/run', {
    accessToken,
    method: 'POST',
    body: goLiveWizardId ? { goLiveWizardId } : {},
  });
  return data.validation;
}

export async function syncLaunchCenterAlerts(accessToken: string) {
  const data = await request<{ platformAlerts: unknown[] }>('/enterprise-launch-center/platform-alerts/sync', {
    accessToken,
    method: 'POST',
  });
  return data.platformAlerts;
}

export async function captureLaunchCenterAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-launch-center/analytics/capture', {
    accessToken,
    method: 'POST',
  });
  return data.analytics;
}

export async function fetchLaunchCenterAuditLogs(accessToken: string): Promise<LncAuditLogSummary[]> {
  const data = await request<{ auditLogs: LncAuditLogSummary[] }>('/enterprise-launch-center/audit-logs', {
    accessToken,
  });
  return data.auditLogs;
}

export async function validateRollbackPlan(accessToken: string, linkId: string) {
  const data = await request<{ link: unknown }>(`/enterprise-launch-center/rollback-plans/${linkId}/validate`, {
    accessToken,
    method: 'POST',
  });
  return data.link;
}
