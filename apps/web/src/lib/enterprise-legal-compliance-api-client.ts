import { request, ApiClientError } from './api-client';
import type { EnterpriseLegalComplianceDashboard, UpdateLcPlatformConfigRequest } from '@titan/shared';

export { ApiClientError as EnterpriseLegalComplianceApiClientError };

export async function fetchLegalComplianceDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseLegalComplianceDashboard }>(
    '/enterprise-legal-compliance/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureLegalAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-legal-compliance/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function approveContract(accessToken: string, contractId: string) {
  const data = await request<{ contract: unknown }>(
    `/enterprise-legal-compliance/contracts/${contractId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.contract;
}

export async function completeObligation(accessToken: string, obligationId: string) {
  const data = await request<{ obligation: unknown }>(
    `/enterprise-legal-compliance/obligations/${obligationId}/complete`,
    { method: 'POST', accessToken },
  );
  return data.obligation;
}

export async function publishPolicy(accessToken: string, policyId: string) {
  const data = await request<{ policy: unknown }>(
    `/enterprise-legal-compliance/policies/${policyId}/publish`,
    { method: 'POST', accessToken },
  );
  return data.policy;
}

export async function testSignatureProvider(accessToken: string, providerId: string) {
  const data = await request<{ provider: unknown }>(
    `/enterprise-legal-compliance/signature/providers/${providerId}/test`,
    { method: 'POST', accessToken },
  );
  return data.provider;
}

export async function updateLegalPlatformConfig(accessToken: string, body: UpdateLcPlatformConfigRequest) {
  const data = await request<{ platformConfig: unknown }>('/enterprise-legal-compliance/platform-config', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.platformConfig;
}

export async function fetchEmployeeLegalSummary(accessToken: string) {
  const data = await request<{ summary: unknown }>('/enterprise-legal-compliance/employee', { accessToken });
  return data.summary;
}
