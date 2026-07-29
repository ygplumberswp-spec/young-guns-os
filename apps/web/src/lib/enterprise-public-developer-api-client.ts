import { request } from './api-client';
import type {
  DeveloperOauthApplicationSummary,
  EnterprisePublicDeveloperDashboard,
  GeneratePdpSdkRequest,
  PdpApiScopeSummary,
  PdpAuditLogSummary,
  PdpDeveloperAlertSummary,
  PdpRateLimitPolicySummary,
  PdpSandboxConfigSummary,
  PdpWebhookEventTypeSummary,
} from '@titan/shared';

export async function fetchPublicDeveloperDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterprisePublicDeveloperDashboard }>(
    '/enterprise-public-developer/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function syncDeveloperAlerts(accessToken: string) {
  const data = await request<{ developerAlerts: PdpDeveloperAlertSummary[] }>(
    '/enterprise-public-developer/developer-alerts/sync',
    { method: 'POST', accessToken },
  );
  return data.developerAlerts;
}

export async function capturePublicDeveloperAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-public-developer/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function capturePublicApiStatus(accessToken: string) {
  const data = await request<{ apiStatus: unknown }>('/enterprise-public-developer/api-status/capture', {
    method: 'POST',
    accessToken,
  });
  return data.apiStatus;
}

export async function generatePublicOpenApiSpec(accessToken: string) {
  const data = await request<{ openapiSpec: unknown }>('/enterprise-public-developer/openapi/generate', {
    method: 'POST',
    accessToken,
  });
  return data.openapiSpec;
}

export async function generatePublicSdk(accessToken: string, body: GeneratePdpSdkRequest) {
  const data = await request<{ record: unknown }>('/enterprise-public-developer/sdk/generate', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.record;
}

export async function fetchPublicApiScopes(accessToken: string) {
  const data = await request<{ apiScopes: PdpApiScopeSummary[] }>('/enterprise-public-developer/api-scopes', {
    accessToken,
  });
  return data.apiScopes;
}

export async function fetchPublicWebhookEventTypes(accessToken: string) {
  const data = await request<{ webhookEventTypes: PdpWebhookEventTypeSummary[] }>(
    '/enterprise-public-developer/webhook-event-types',
    { accessToken },
  );
  return data.webhookEventTypes;
}

export async function fetchPublicApiKeys(accessToken: string) {
  const data = await request<{ apiKeys: Array<{ id: string; name: string; keyPrefix: string; status: string }> }>(
    '/enterprise-public-developer/api-keys',
    { accessToken },
  );
  return data.apiKeys;
}

export async function fetchPublicOauthApplications(accessToken: string) {
  const data = await request<{ oauthApplications: DeveloperOauthApplicationSummary[] }>(
    '/enterprise-public-developer/oauth-applications',
    { accessToken },
  );
  return data.oauthApplications;
}

export async function fetchPublicWebhookDeliveries(accessToken: string) {
  const data = await request<{
    webhookDeliveries: Array<{
      id: string;
      eventType: string;
      status: string;
      attempts: number;
      errorMessage: string | null;
      createdAt: string;
    }>;
  }>('/enterprise-public-developer/webhook-deliveries', { accessToken });
  return data.webhookDeliveries;
}

export async function fetchPublicRateLimitPolicies(accessToken: string) {
  const data = await request<{ rateLimitPolicies: PdpRateLimitPolicySummary[] }>(
    '/enterprise-public-developer/rate-limit-policies',
    { accessToken },
  );
  return data.rateLimitPolicies;
}

export async function fetchPublicDeveloperAuditLogs(accessToken: string) {
  const data = await request<{ auditLogs: PdpAuditLogSummary[] }>('/enterprise-public-developer/audit-logs', {
    accessToken,
  });
  return data.auditLogs;
}

export async function fetchPublicSandboxConfig(accessToken: string) {
  const data = await request<{ sandboxConfig: PdpSandboxConfigSummary }>(
    '/enterprise-public-developer/sandbox-config',
    { accessToken },
  );
  return data.sandboxConfig;
}

export async function updatePublicSandboxConfig(
  accessToken: string,
  body: Partial<PdpSandboxConfigSummary>,
) {
  const data = await request<{ sandboxConfig: PdpSandboxConfigSummary }>(
    '/enterprise-public-developer/sandbox-config',
    { method: 'PUT', accessToken, body },
  );
  return data.sandboxConfig;
}
