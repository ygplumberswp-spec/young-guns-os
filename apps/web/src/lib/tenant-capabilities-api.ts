import type {
  CapabilityDiscoveryResponse,
  CreateCapabilityProposalRequest,
  DiscoverCapabilityRequest,
  TenantCapabilityDetail,
  TenantCapabilitySummary,
  TenantCapabilityTestSummary,
  TenantCapabilityVersionSummary,
  UpdateCapabilityProposalRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchTenantCapabilities(accessToken: string) {
  const data = await request<{ capabilities: TenantCapabilitySummary[] }>('/tenant-capabilities', {
    accessToken,
  });
  return data.capabilities;
}

export async function discoverTenantCapability(
  accessToken: string,
  body: DiscoverCapabilityRequest,
) {
  const data = await request<{ discovery: CapabilityDiscoveryResponse }>(
    '/tenant-capabilities/discover',
    { accessToken, method: 'POST', body },
  );
  return data.discovery;
}

export async function createTenantCapabilityProposal(
  accessToken: string,
  body: CreateCapabilityProposalRequest,
) {
  const data = await request<{ capability: TenantCapabilityDetail }>('/tenant-capabilities/proposals', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.capability;
}

export async function fetchTenantCapability(accessToken: string, capabilityId: string) {
  const data = await request<{ capability: TenantCapabilityDetail }>(
    `/tenant-capabilities/${capabilityId}`,
    { accessToken },
  );
  return data.capability;
}

export async function updateTenantCapabilityProposal(
  accessToken: string,
  capabilityId: string,
  body: UpdateCapabilityProposalRequest,
) {
  const data = await request<{ capability: TenantCapabilityDetail }>(
    `/tenant-capabilities/${capabilityId}/proposal`,
    { accessToken, method: 'PATCH', body },
  );
  return data.capability;
}

export async function testTenantCapability(accessToken: string, capabilityId: string) {
  const data = await request<{
    test: TenantCapabilityTestSummary;
    capability: TenantCapabilityDetail;
  }>(`/tenant-capabilities/${capabilityId}/test`, { accessToken, method: 'POST' });
  return data;
}

export async function activateTenantCapability(accessToken: string, capabilityId: string) {
  const data = await request<{ capability: TenantCapabilityDetail }>(
    `/tenant-capabilities/${capabilityId}/activate`,
    { accessToken, method: 'POST', body: {} },
  );
  return data.capability;
}

export async function archiveTenantCapability(accessToken: string, capabilityId: string) {
  const data = await request<{ capability: TenantCapabilityDetail }>(
    `/tenant-capabilities/${capabilityId}/archive`,
    { accessToken, method: 'POST', body: {} },
  );
  return data.capability;
}

export async function fetchTenantCapabilityVersions(accessToken: string, capabilityId: string) {
  const data = await request<{ versions: TenantCapabilityVersionSummary[] }>(
    `/tenant-capabilities/${capabilityId}/versions`,
    { accessToken },
  );
  return data.versions;
}
