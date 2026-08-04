export type PortalAccessPermission =
  | 'portal.dashboard:read'
  | 'portal.jobs:read'
  | 'portal.quotes:read'
  | 'portal.invoices:read'
  | 'portal.documents:read'
  | 'portal.communications:read'
  | 'portal.appointments:read'
  | 'portal.knowledge:read'
  | 'portal.notifications:read'
  | 'portal.payments:read';

export const PORTAL_ACCESS_PERMISSION_OPTIONS: Array<{
  value: PortalAccessPermission;
  label: string;
  description: string;
}> = [
  {
    value: 'portal.dashboard:read',
    label: 'Dashboard',
    description: 'View the customer portal home dashboard.',
  },
  {
    value: 'portal.jobs:read',
    label: 'Jobs',
    description: 'View jobs linked to the customer account.',
  },
  {
    value: 'portal.quotes:read',
    label: 'Quotes',
    description: 'View quotes linked to the customer account.',
  },
  {
    value: 'portal.invoices:read',
    label: 'Invoices',
    description: 'View invoices linked to the customer account.',
  },
  {
    value: 'portal.documents:read',
    label: 'Documents',
    description: 'View document metadata linked to the customer account.',
  },
  {
    value: 'portal.communications:read',
    label: 'Communications',
    description: 'View communication history linked to the customer account.',
  },
  {
    value: 'portal.appointments:read',
    label: 'Appointments',
    description: 'View scheduled appointments linked to customer jobs.',
  },
  {
    value: 'portal.knowledge:read',
    label: 'Knowledge & Self-Service',
    description: 'Search customer-visible knowledge articles and SOPs.',
  },
  {
    value: 'portal.notifications:read',
    label: 'Notifications',
    description: 'View customer portal notifications and preferences.',
  },
  {
    value: 'portal.payments:read',
    label: 'Payments',
    description: 'View payment history linked to customer invoices.',
  },
];

export const DEFAULT_PORTAL_ACCESS_PERMISSIONS: PortalAccessPermission[] = [
  'portal.dashboard:read',
  'portal.jobs:read',
  'portal.quotes:read',
  'portal.invoices:read',
];

export type PortalUserSummary = {
  id: string;
  customerId: string;
  customerName: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  permissionCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalUserDetail = PortalUserSummary & {
  permissions: PortalAccessPermission[];
};

export type PortalAuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyId: string;
  companyName: string;
  customerId: string;
  customerName: string;
  permissions: PortalAccessPermission[];
};

export type PortalAuthSession = {
  accessToken: string;
  expiresIn: number;
};

export type PortalLoginRequest = {
  email: string;
  password: string;
};

export type PortalDashboardResponse = {
  customerName: string;
  companyName: string;
  permissions: PortalAccessPermission[];
  sections: Array<{
    key: string;
    label: string;
    enabled: boolean;
    itemCount: number;
  }>;
};

export type PortalStats = {
  portalUserCount: number;
  activePortalUserCount: number;
  linkedCustomerCount: number;
};

export type CreatePortalUserRequest = {
  customerId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  permissions?: PortalAccessPermission[];
};

export type UpdatePortalUserRequest = {
  email?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  permissions?: PortalAccessPermission[];
};

export type PortalUserInviteSummary = {
  id: string;
  customerId: string;
  email: string;
  permissions: PortalAccessPermission[];
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
};

export type PortalInvitePreview = {
  email: string;
  companyName: string;
  customerName: string;
  expiresAt: string;
};

export type CreatePortalUserInviteResponse = {
  invite: PortalUserInviteSummary;
  inviteUrl: string;
};

export type AcceptPortalInviteRequest = {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
};

export type CustomerPortalAccessSummary = {
  portalUser: PortalUserSummary | null;
  pendingInvite: PortalUserInviteSummary | null;
};

export function isPortalAccessPermission(value: string): value is PortalAccessPermission {
  return PORTAL_ACCESS_PERMISSION_OPTIONS.some((option) => option.value === value);
}
