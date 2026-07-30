import type { PortalAccessPermission } from './portal.js';

export type StaffExperience = 'platform_owner' | 'technician' | 'dispatcher' | 'staff';

export type NavItemConfig = {
  href: string;
  label: string;
  permissions?: string[];
  experiences?: StaffExperience[];
  portalPermission?: PortalAccessPermission;
};

export const OWNER_STAFF_NAV_ITEMS: NavItemConfig[] = [
  { href: '/', label: 'Dashboard', permissions: ['analytics:read', 'executive:read', 'jobs:read', '*'] },
  { href: '/crm', label: 'Customers', permissions: ['customers:read', '*'] },
  { href: '/leads', label: 'Leads', permissions: ['leads:read', '*'] },
  { href: '/jobs', label: 'Jobs', permissions: ['jobs:read', '*'] },
  { href: '/scheduling', label: 'Scheduling', permissions: ['dispatch:read', '*'] },
  { href: '/finance/quotes', label: 'Quotes', permissions: ['finance:read', '*'] },
  { href: '/finance/invoices', label: 'Invoices', permissions: ['finance:read', '*'] },
  { href: '/finance/payments', label: 'Payments', permissions: ['finance:read', '*'] },
  { href: '/finance/quotes', label: 'Finance', permissions: ['finance:read', '*'] },
  { href: '/inventory/products', label: 'Inventory', permissions: ['inventory:read', '*'] },
  { href: '/fleet', label: 'Fleet', permissions: ['fleet:read', '*'] },
  { href: '/communications/messages', label: 'Communications', permissions: ['communications:read', '*'] },
  { href: '/documents', label: 'Documents', permissions: ['documents:read', '*'] },
  { href: '/analytics', label: 'Analytics', permissions: ['analytics:read', '*'] },
  { href: '/marketing', label: 'Marketing', permissions: ['marketing:read', '*'] },
  { href: '/aura/agents', label: 'AURA Capabilities', permissions: ['agents:read', '*'], experiences: ['platform_owner', 'staff'] },
  { href: '/automation', label: 'Automations', permissions: ['automation:read', '*'] },
  { href: '/mission-control', label: 'Mission Control', permissions: ['executive:read', 'ops:read', '*'] },
  { href: '/integrations', label: 'Integrations', permissions: ['integrations:read', '*'] },
  { href: '/security', label: 'Security', permissions: ['security:read', '*'] },
  { href: '/platform-health', label: 'Platform Health', permissions: ['platform_health:read', '*'] },
  { href: '/release-center', label: 'Release Center', permissions: ['release_center:read', '*'] },
  { href: '/saas-management', label: 'SaaS Management', permissions: ['saas:read', 'saas:manage', '*'] },
  { href: '/settings/company', label: 'Settings', permissions: ['settings:manage', 'company:manage', '*'], experiences: ['platform_owner', 'staff'] },
  { href: '/settings/team', label: 'Users & Access', permissions: ['users:read', 'users:manage', '*'] },
  { href: '/aura', label: 'Owner AI Chat', permissions: ['agents:read', 'intelligence:read', '*'], experiences: ['platform_owner', 'staff'] },
];

/** Dispatcher operational navigation — no platform admin, AURA owner chat or SaaS controls. */
export const DISPATCHER_ALLOWED_HREFS = new Set([
  '/',
  '/crm',
  '/leads',
  '/jobs',
  '/scheduling',
  '/finance/quotes',
  '/finance/invoices',
  '/finance/payments',
  '/communications/messages',
  '/documents',
  '/mobile-platform/dispatcher',
  '/settings/team',
]);

export const TECHNICIAN_NAV_ITEMS: NavItemConfig[] = [
  { href: '/mobile', label: 'Today', experiences: ['technician', 'platform_owner'] },
  { href: '/mobile/jobs', label: 'My Jobs', experiences: ['technician', 'platform_owner'] },
  { href: '/mobile/route', label: 'Navigation', experiences: ['technician', 'platform_owner'] },
  { href: '/mobile/inventory', label: 'Parts Used', experiences: ['technician', 'platform_owner'] },
  { href: '/mobile/time', label: 'Timesheets', experiences: ['technician', 'platform_owner'] },
  { href: '/mobile/notifications', label: 'Messages', experiences: ['technician', 'platform_owner'] },
  { href: '/mobile/sync', label: 'Offline Sync', experiences: ['technician', 'platform_owner'] },
];

export const CLIENT_PORTAL_NAV_ITEMS: NavItemConfig[] = [
  { href: '/portal', label: 'Home', portalPermission: 'portal.dashboard:read' },
  { href: '/portal/appointments', label: 'Book Job', portalPermission: 'portal.appointments:read' },
  { href: '/portal/jobs', label: 'My Jobs', portalPermission: 'portal.jobs:read' },
  { href: '/portal/quotes', label: 'Quotes', portalPermission: 'portal.quotes:read' },
  { href: '/portal/finance', label: 'Invoices', portalPermission: 'portal.invoices:read' },
  { href: '/portal/finance', label: 'Payments', portalPermission: 'portal.payments:read' },
  { href: '/portal/communications', label: 'Messages', portalPermission: 'portal.communications:read' },
  { href: '/portal/documents', label: 'Documents', portalPermission: 'portal.documents:read' },
  { href: '/portal/assets', label: 'Properties / Equipment', portalPermission: 'portal.dashboard:read' },
  { href: '/portal/jobs', label: 'Technician Tracking', portalPermission: 'portal.jobs:read' },
  { href: '/portal/profile', label: 'Profile', portalPermission: 'portal.dashboard:read' },
];

/** Owner-only URL prefixes technicians must never access. */
export const OWNER_ONLY_ROUTE_PREFIXES = [
  '/crm',
  '/leads',
  '/jobs',
  '/communications',
  '/documents',
  '/dispatch',
  '/scheduling',
  '/finance',
  '/inventory',
  '/fleet',
  '/analytics',
  '/marketing',
  '/platform',
  '/saas-management',
  '/mission-control',
  '/integrations',
  '/security',
  '/settings',
  '/aura',
  '/automation',
  '/release',
  '/go-live',
  '/release-center',
  '/launch-center',
  '/platform-health',
  '/executive',
  '/recruiting',
  '/quality',
  '/operations',
  '/mobile-platform',
  '/saas-management',
  '/platform',
  '/app-builder',
  '/mission-control',
  '/marketing',
  '/analytics',
];

export const DISPATCHER_BLOCKED_ROUTE_PREFIXES = [
  '/aura',
  '/security',
  '/platform-health',
  '/release-center',
  '/saas-management',
  '/integrations',
  '/mission-control',
  '/marketing',
  '/analytics',
  '/automation',
  '/app-builder',
];

export const TECHNICIAN_ALLOWED_ROUTE_PREFIXES = ['/mobile', '/auth'];
