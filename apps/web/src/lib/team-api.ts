import type { CreateTeamInviteRequest, CreateTeamInviteResponse, InvitePreview, TeamInvite, TeamMember, TeamRole } from '@titan/shared';
import { request, type AuthPayload } from './api-client';

export async function fetchTeamMembers(
  accessToken: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<TeamMember[]> {
  const data = await request<{ members: TeamMember[] }>('/team/members', {
    accessToken,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? 20_000,
  });
  return data.members;
}

export async function fetchTeamRoles(
  accessToken: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<{ roles: TeamRole[]; assignableRoles: TeamRole[] }> {
  return request<{ roles: TeamRole[]; assignableRoles: TeamRole[] }>('/team/roles', {
    accessToken,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? 20_000,
  });
}

export async function fetchTeamInvites(
  accessToken: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<TeamInvite[]> {
  const data = await request<{ invites: TeamInvite[] }>('/team/invites', {
    accessToken,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? 20_000,
  });
  return data.invites;
}

export async function createTeamInvite(
  accessToken: string,
  body: CreateTeamInviteRequest,
): Promise<CreateTeamInviteResponse> {
  return request<CreateTeamInviteResponse>('/team/invites', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function revokeTeamInvite(accessToken: string, inviteId: string): Promise<void> {
  await request<{ success: boolean }>(`/team/invites/${inviteId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function updateTeamMemberStatus(
  accessToken: string,
  memberId: string,
  isActive: boolean,
): Promise<TeamMember> {
  const data = await request<{ member: TeamMember }>(`/team/members/${memberId}/status`, {
    method: 'PATCH',
    accessToken,
    body: { isActive },
  });
  return data.member;
}

export async function fetchInvitePreview(token: string): Promise<InvitePreview> {
  const data = await request<{ preview: InvitePreview }>(
    `/auth/invites/preview?token=${encodeURIComponent(token)}`,
    { skipAuthRefresh: true },
  );

  return data.preview;
}

export async function acceptInvite(body: {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
}): Promise<AuthPayload> {
  return request<AuthPayload>('/auth/accept-invite', {
    method: 'POST',
    body,
    skipAuthRefresh: true,
  });
}
