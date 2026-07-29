import { request, ApiClientError } from './api-client';
import type {
  AlAssetAlertSummary,
  AlIotProviderAdapterSummary,
  AlPredictiveAssessmentSummary,
  EnterpriseAssetLifecycleDashboard,
  UpdateAlPlatformConfigRequest,
} from '@titan/shared';

export { ApiClientError as EnterpriseAssetLifecycleApiClientError };

export async function fetchAssetLifecycleDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseAssetLifecycleDashboard }>(
    '/enterprise-asset-lifecycle/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureAssetAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-asset-lifecycle/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function generateMaintenanceDue(accessToken: string) {
  const data = await request<{ dueRecords: unknown[] }>('/enterprise-asset-lifecycle/maintenance/generate-due', {
    method: 'POST',
    accessToken,
  });
  return data.dueRecords;
}

export async function generatePredictiveAssessment(accessToken: string, assetId: string) {
  const data = await request<{ assessment: AlPredictiveAssessmentSummary }>(
    `/enterprise-asset-lifecycle/predictive/${assetId}`,
    { method: 'POST', accessToken },
  );
  return data.assessment;
}

export async function createIotProvider(
  accessToken: string,
  body: { providerType: string; providerKey: string; name: string; endpointUrl?: string },
) {
  const data = await request<{ provider: AlIotProviderAdapterSummary }>(
    '/enterprise-asset-lifecycle/iot/providers',
    { method: 'POST', accessToken, body },
  );
  return data.provider;
}

export async function testIotProvider(accessToken: string, providerId: string) {
  const data = await request<{ provider: AlIotProviderAdapterSummary }>(
    `/enterprise-asset-lifecycle/iot/providers/${providerId}/test`,
    { method: 'POST', accessToken },
  );
  return data.provider;
}

export async function acknowledgeAssetAlert(accessToken: string, alertId: string) {
  const data = await request<{ alert: AlAssetAlertSummary }>(
    `/enterprise-asset-lifecycle/alerts/${alertId}/acknowledge`,
    { method: 'POST', accessToken },
  );
  return data.alert;
}

export async function resolveAssetAlert(accessToken: string, alertId: string, resolutionNotes?: string) {
  const data = await request<{ alert: AlAssetAlertSummary }>(
    `/enterprise-asset-lifecycle/alerts/${alertId}/resolve`,
    { method: 'POST', accessToken, body: { resolutionNotes } },
  );
  return data.alert;
}

export async function updateAssetLifecyclePlatformConfig(accessToken: string, body: UpdateAlPlatformConfigRequest) {
  const data = await request<{ platformConfig: unknown }>('/enterprise-asset-lifecycle/platform-config', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.platformConfig;
}
