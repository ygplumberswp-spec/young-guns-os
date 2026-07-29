export type TeamRole = {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
};

export type TeamMember = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type TeamInvite = {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
};

export type CreateTeamInviteRequest = {
  email: string;
  roleId: string;
};

export type CreateTeamInviteResponse = {
  invite: TeamInvite;
  inviteUrl: string;
};

export type AcceptInviteRequest = {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
};

export type InvitePreview = {
  email: string;
  companyName: string;
  roleName: string;
  expiresAt: string;
};
