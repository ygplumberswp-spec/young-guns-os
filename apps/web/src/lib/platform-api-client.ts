import type {
  CreateSaasFeatureFlagRequest,
  CreateSaasSubscriptionPlanRequest,
  CreateSaasTenantBranchRequest,
  EnterpriseSaasPlatformDashboard,
  PlatformOwnerAiOperationsDashboard,
  ProvisionSaasTenantRequest,
  SaasBrandingProfileSummary,
  SaasSubscriptionPlanSummary,
  SaasSubscriptionSummary,
  SaasTenantSummary,
  UpdateAiProviderResilienceConfigRequest,
  UpdateSaasBrandingRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as PlatformApiClientError };

export async function fetchPlatformDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseSaasPlatformDashboard }>('/platform/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function markPlatformOwner(accessToken: string) {
  const data = await request<{ companyId: string; tenantKind: 'platform_owner' }>(
    '/platform/platform-owner/mark',
    { accessToken, method: 'POST' },
  );
  return data;
}

export async function provisionTenant(accessToken: string, body: ProvisionSaasTenantRequest) {
  const data = await request<{ tenant: SaasTenantSummary }>('/platform/tenants/provision', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.tenant;
}

export async function suspendTenant(accessToken: string, companyId: string) {
  const data = await request<{ tenant: SaasTenantSummary }>(`/platform/tenants/${companyId}/suspend`, {
    accessToken,
    method: 'POST',
  });
  return data.tenant;
}

export async function reactivateTenant(accessToken: string, companyId: string) {
  const data = await request<{ tenant: SaasTenantSummary }>(`/platform/tenants/${companyId}/reactivate`, {
    accessToken,
    method: 'POST',
  });
  return data.tenant;
}

export async function createSubscriptionPlan(accessToken: string, body: CreateSaasSubscriptionPlanRequest) {
  const data = await request<{ plan: SaasSubscriptionPlanSummary }>('/platform/plans', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.plan;
}

export async function upgradeSubscription(accessToken: string, planId: string) {
  const data = await request<{ subscription: SaasSubscriptionSummary }>('/platform/subscription/upgrade', {
    accessToken,
    method: 'POST',
    body: { planId },
  });
  return data.subscription;
}

export async function downgradeSubscription(accessToken: string, planId: string) {
  const data = await request<{ subscription: SaasSubscriptionSummary }>('/platform/subscription/downgrade', {
    accessToken,
    method: 'POST',
    body: { planId },
  });
  return data.subscription;
}

export async function cancelSubscription(accessToken: string) {
  const data = await request<{ subscription: SaasSubscriptionSummary }>('/platform/subscription/cancel', {
    accessToken,
    method: 'POST',
  });
  return data.subscription;
}

export async function updateBranding(accessToken: string, body: UpdateSaasBrandingRequest) {
  const data = await request<{ branding: SaasBrandingProfileSummary }>('/platform/branding', {
    accessToken,
    method: 'PUT',
    body,
  });
  return data.branding;
}

export async function capturePlatformUsage(accessToken: string) {
  const data = await request<{ snapshot: { id: string } }>('/platform/usage/capture', {
    accessToken,
    method: 'POST',
  });
  return data.snapshot;
}

export async function createFeatureFlag(accessToken: string, body: CreateSaasFeatureFlagRequest) {
  const data = await request<{ flag: EnterpriseSaasPlatformDashboard['featureFlags'][number] }>(
    '/platform/feature-flags',
    { accessToken, method: 'POST', body },
  );
  return data.flag;
}

export async function createTenantBranch(accessToken: string, body: CreateSaasTenantBranchRequest) {
  const data = await request<{ branch: EnterpriseSaasPlatformDashboard['branches'][number] }>(
    '/platform/branches',
    { accessToken, method: 'POST', body },
  );
  return data.branch;
}

export async function fetchAiOperationsDashboard(accessToken: string) {
  const data = await request<{ dashboard: PlatformOwnerAiOperationsDashboard }>(
    '/platform/ai-operations/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function updateAiResilienceConfig(
  accessToken: string,
  body: UpdateAiProviderResilienceConfigRequest,
) {
  const data = await request<{ config: PlatformOwnerAiOperationsDashboard['resilience']['config'] }>(
    '/platform/ai-operations/resilience',
    { accessToken, method: 'PUT', body },
  );
  return data.config;
}
