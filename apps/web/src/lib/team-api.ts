import type { CreateTeamInviteRequest, CreateTeamInviteResponse, InvitePreview, TeamInvite, TeamMember, TeamRole } from '@titan/shared';
import { request, type AuthPayload } from './api-client';

export async function fetchTeamMembers(accessToken: string): Promise<TeamMember[]> {
  const data = await request<{ members: TeamMember[] }>('/team/members', { accessToken });
  return data.members;
}

export async function fetchTeamRoles(
  accessToken: string,
): Promise<{ roles: TeamRole[]; assignableRoles: TeamRole[] }> {
  return request<{ roles: TeamRole[]; assignableRoles: TeamRole[] }>('/team/roles', {
    accessToken,
  });
}

export async function fetchTeamInvites(accessToken: string): Promise<TeamInvite[]> {
  const data = await request<{ invites: TeamInvite[] }>('/team/invites', { accessToken });
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
