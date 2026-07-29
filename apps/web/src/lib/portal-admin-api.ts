import type {
  CreatePortalUserRequest,
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
