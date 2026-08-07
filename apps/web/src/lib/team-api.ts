import type {
  CreateTeamInviteRequest,
  CreateTeamInviteResponse,
  InvitePreview,
  TeamInvite,
  TeamMember,
  TeamRole,
  TechnicianPayrollProfileSummary,
  TechnicianPayrollTermSummary,
  TechnicianPeriodWageBreakdown,
  UserHardDeleteEligibility,
} from '@titan/shared';
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
): Promise<{
  roles: TeamRole[];
  assignableRoles: TeamRole[];
  manuallyAssignableRoles: TeamRole[];
}> {
  return request<{
    roles: TeamRole[];
    assignableRoles: TeamRole[];
    manuallyAssignableRoles: TeamRole[];
  }>('/team/roles', {
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

export async function updateTeamMemberRole(
  accessToken: string,
  memberId: string,
  roleId: string,
): Promise<TeamMember> {
  const data = await request<{ member: TeamMember }>(`/team/members/${memberId}/role`, {
    method: 'PATCH',
    accessToken,
    body: { roleId },
  });
  return data.member;
}

export async function removeTeamMemberAccess(
  accessToken: string,
  memberId: string,
): Promise<TeamMember> {
  const data = await request<{ member: TeamMember }>(`/team/members/${memberId}/remove-access`, {
    method: 'POST',
    accessToken,
  });
  return data.member;
}

export async function fetchTeamMemberDeleteEligibility(
  accessToken: string,
  memberId: string,
): Promise<UserHardDeleteEligibility> {
  const data = await request<{ eligibility: UserHardDeleteEligibility }>(
    `/team/members/${memberId}/delete-eligibility`,
    { accessToken },
  );
  return data.eligibility;
}

export async function hardDeleteTeamMember(
  accessToken: string,
  memberId: string,
  confirmation: string,
): Promise<{ deleted: true; memberId: string }> {
  return request<{ deleted: true; memberId: string }>(`/team/members/${memberId}`, {
    method: 'DELETE',
    accessToken,
    body: { confirmation },
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

export async function fetchTechnicianPayrollProfile(
  accessToken: string,
  memberId: string,
): Promise<TechnicianPayrollProfileSummary> {
  const data = await request<{ profile: TechnicianPayrollProfileSummary }>(
    `/team/members/${memberId}/payroll`,
    { accessToken },
  );
  return data.profile;
}

export async function createTechnicianPayrollTerm(
  accessToken: string,
  memberId: string,
  body: NonNullable<CreateTeamInviteRequest['payrollSetup']>,
): Promise<TechnicianPayrollTermSummary> {
  const data = await request<{ term: TechnicianPayrollTermSummary }>(
    `/team/members/${memberId}/payroll/terms`,
    { method: 'POST', accessToken, body },
  );
  return data.term;
}

export async function fetchTechnicianPeriodWages(
  accessToken: string,
  memberId: string,
  periodStart: string,
  periodEnd: string,
): Promise<TechnicianPeriodWageBreakdown> {
  const data = await request<{ wages: TechnicianPeriodWageBreakdown }>(
    `/team/members/${memberId}/payroll/period-wages?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`,
    { accessToken },
  );
  return data.wages;
}
