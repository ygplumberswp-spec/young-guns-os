import type { EnterpriseProductionLaunchDashboard, PlAuditLogSummary } from '@titan/shared';
import { request } from './api-client';

export async function fetchProductionLaunchDashboard(
  accessToken: string,
): Promise<EnterpriseProductionLaunchDashboard> {
  const data = await request<{ dashboard: EnterpriseProductionLaunchDashboard }>(
    '/enterprise-production-launch/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function runEnvironmentReview(accessToken: string) {
  const data = await request<{ review: unknown }>(
    '/enterprise-production-launch/environment-review/run',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.review;
}

export async function runDomainSecurityReview(accessToken: string) {
  const data = await request<{ review: unknown }>(
    '/enterprise-production-launch/domain-security-review/run',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.review;
}

export async function runLiveIntegrationVerification(accessToken: string) {
  const data = await request<{ run: unknown }>(
    '/enterprise-production-launch/live-integration-verification/run',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.run;
}

export async function runCommercialReadinessReview(accessToken: string) {
  const data = await request<{ review: unknown }>(
    '/enterprise-production-launch/commercial-readiness/run',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.review;
}

export async function runMobileProductionReview(accessToken: string) {
  const data = await request<{ review: unknown }>(
    '/enterprise-production-launch/mobile-production-review/run',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.review;
}

export async function createDeploymentRun(
  accessToken: string,
  input?: { title?: string; environment?: string },
) {
  const data = await request<{ run: unknown }>('/enterprise-production-launch/deployment-runs', {
    accessToken,
    method: 'POST',
    body: input ?? {},
  });
  return data.run;
}

export async function runDeploymentHealthVerification(accessToken: string, runId: string) {
  const data = await request<{ run: unknown }>(
    `/enterprise-production-launch/deployment-runs/${runId}/health-verification`,
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.run;
}

export async function runDeploymentSmokeTests(accessToken: string, runId: string) {
  const data = await request<{ run: unknown }>(
    `/enterprise-production-launch/deployment-runs/${runId}/smoke-tests`,
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.run;
}

export async function submitDeploymentForApproval(accessToken: string, runId: string) {
  const data = await request<{ run: unknown }>(
    `/enterprise-production-launch/deployment-runs/${runId}/submit-approval`,
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.run;
}

export async function approveDeployment(accessToken: string, runId: string, notes?: string) {
  const data = await request<{ run: unknown }>(
    `/enterprise-production-launch/deployment-runs/${runId}/approve`,
    {
      accessToken,
      method: 'POST',
      body: { notes },
    },
  );
  return data.run;
}

export async function createGoLiveWizard(accessToken: string, input: { title: string }) {
  const data = await request<{ wizard: unknown }>('/enterprise-production-launch/go-live/wizards', {
    accessToken,
    method: 'POST',
    body: input,
  });
  return data.wizard;
}

export async function approveGoLiveWizard(accessToken: string, wizardId: string, notes?: string) {
  const data = await request<{ wizard: unknown }>(
    `/enterprise-production-launch/go-live/wizards/${wizardId}/approve`,
    {
      accessToken,
      method: 'POST',
      body: { notes },
    },
  );
  return data.wizard;
}

export async function confirmGoLiveLaunch(accessToken: string, wizardId: string) {
  const data = await request<{ wizard: unknown }>(
    `/enterprise-production-launch/go-live/wizards/${wizardId}/confirm-launch`,
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.wizard;
}

export async function syncProductionLaunchAlerts(accessToken: string) {
  const data = await request<{ platformAlerts: unknown[] }>(
    '/enterprise-production-launch/platform-alerts/sync',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.platformAlerts;
}

export async function fetchProductionLaunchAuditLogs(
  accessToken: string,
): Promise<PlAuditLogSummary[]> {
  const data = await request<{ auditLogs: PlAuditLogSummary[] }>(
    '/enterprise-production-launch/audit-logs',
    {
      accessToken,
    },
  );
  return data.auditLogs;
}
