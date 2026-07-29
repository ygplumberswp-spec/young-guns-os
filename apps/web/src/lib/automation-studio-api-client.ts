import type {
  AutomationStudioApprovalRecordSummary,
  AutomationStudioMonitoringSummary,
  AutomationStudioPlatformActionSummary,
  AutomationStudioRecommendationSummary,
  AutomationStudioTestRunSummary,
  CreateAutomationStudioActionRequest,
  EnterpriseAutomationStudioDashboard,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as AutomationStudioApiClientError };

export async function fetchAutomationStudioDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseAutomationStudioDashboard }>(
    '/automation-studio/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchAutomationMonitoring(accessToken: string) {
  const data = await request<{ monitoring: AutomationStudioMonitoringSummary }>(
    '/automation-studio/monitoring',
    { accessToken },
  );
  return data.monitoring;
}

export async function fetchAutomationRecommendations(accessToken: string) {
  const data = await request<{ recommendations: AutomationStudioRecommendationSummary[] }>(
    '/automation-studio/recommendations',
    { accessToken },
  );
  return data.recommendations;
}

export async function generateAutomationRecommendations(accessToken: string) {
  const data = await request<{ recommendations: AutomationStudioRecommendationSummary[] }>(
    '/automation-studio/recommendations/generate',
    { accessToken, method: 'POST' },
  );
  return data.recommendations;
}

export async function fetchAutomationStudioActions(accessToken: string) {
  const data = await request<{ actions: AutomationStudioPlatformActionSummary[] }>(
    '/automation-studio/actions',
    { accessToken },
  );
  return data.actions;
}

export async function createAutomationStudioAction(
  accessToken: string,
  body: CreateAutomationStudioActionRequest,
) {
  const data = await request<{ action: AutomationStudioPlatformActionSummary }>('/automation-studio/actions', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.action;
}

export async function fetchAutomationTestRuns(accessToken: string) {
  const data = await request<{ testRuns: AutomationStudioTestRunSummary[] }>('/automation-studio/test-runs', {
    accessToken,
  });
  return data.testRuns;
}

export async function fetchAutomationApprovalRecords(accessToken: string) {
  const data = await request<{ records: AutomationStudioApprovalRecordSummary[] }>(
    '/automation-studio/approval-records',
    { accessToken },
  );
  return data.records;
}

export async function recordAutomationMetricsSnapshot(accessToken: string) {
  const data = await request<{ monitoring: AutomationStudioMonitoringSummary }>(
    '/automation-studio/monitoring/snapshot',
    { accessToken, method: 'POST' },
  );
  return data.monitoring;
}
