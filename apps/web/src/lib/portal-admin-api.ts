import type {
  CreatePortalUserInviteResponse,
  CreatePortalUserRequest,
  CustomerPortalAccessSummary,
  PortalAccessPermission,
  PortalStats,
  PortalUserDetail,
  PortalUserSummary,
  UpdatePortalUserRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchPortalStats(accessToken: string): Promise<PortalStats> {
  return request<PortalStats>('/portal/stats', { accessToken });
}

export async function fetchPortalUsers(accessToken: string): Promise<PortalUserSummary[]> {
  const data = await request<{ users: PortalUserSummary[] }>('/portal/users', { accessToken });
  return data.users;
}

export async function createPortalUser(
  accessToken: string,
  body: CreatePortalUserRequest,
): Promise<PortalUserDetail> {
  const data = await request<{ user: PortalUserDetail }>('/portal/users', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.user;
}

export async function updatePortalUser(
  accessToken: string,
  portalUserId: string,
  body: UpdatePortalUserRequest,
): Promise<PortalUserDetail> {
  const data = await request<{ user: PortalUserDetail }>(`/portal/users/${portalUserId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.user;
}

export async function fetchCustomerPortalAccess(
  accessToken: string,
  customerId: string,
): Promise<CustomerPortalAccessSummary> {
  return request<CustomerPortalAccessSummary>(`/portal/customers/${customerId}/access`, {
    accessToken,
  });
}

export async function createCustomerPortalInvite(
  accessToken: string,
  customerId: string,
  body: { email: string; permissions?: PortalAccessPermission[] },
): Promise<CreatePortalUserInviteResponse> {
  return request<CreatePortalUserInviteResponse>(`/portal/customers/${customerId}/invites`, {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function revokeCustomerPortalInvite(
  accessToken: string,
  customerId: string,
  inviteId: string,
): Promise<void> {
  await request<{ success: boolean }>(`/portal/customers/${customerId}/invites/${inviteId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function revokePortalUserAccess(
  accessToken: string,
  portalUserId: string,
): Promise<PortalUserDetail> {
  const data = await request<{ user: PortalUserDetail }>(
    `/portal/users/${portalUserId}/revoke-access`,
    {
      method: 'POST',
      accessToken,
    },
  );
  return data.user;
}
