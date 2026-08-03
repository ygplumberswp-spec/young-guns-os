import type { PortalAccessPermission } from './portal.js';
import { NAV_LABELS } from './nav-labels.js';

export type StaffExperience =
  | 'platform_owner'
  | 'company_owner'
  | 'manager'
  | 'dispatcher'
  | 'accountant'
  | 'technician'
  | 'client'
  | 'staff';

export type NavItemConfig = {
  href: string;
  label: string;
  permissions?: string[];
  experiences?: StaffExperience[];
  portalPermission?: PortalAccessPermission;
  /** Client portal: visible when the user has any listed permission. */
  portalPermissions?: PortalAccessPermission[];
};

/** Experiences that receive the full company Business OS nav (subject to permissions). */
export const COMPANY_BUSINESS_EXPERIENCES: StaffExperience[] = [
  'platform_owner',
  'company_owner',
  'manager',
  'staff',
];

export const OWNER_STAFF_NAV_ITEMS: NavItemConfig[] = [
  {
    href: '/',
    label: 'Dashboard',
    permissions: ['analytics:read', 'executive:read', 'jobs:read', '*'],
  },
  {
    href: '/global-search',
    label: 'Search',
    permissions: ['search:read', 'intelligence:read', 'ops:read', '*'],
  },
  { href: '/crm', label: 'Customers', permissions: ['customers:read', '*'] },
  { href: '/leads', label: 'Leads', permissions: ['leads:read', '*'] },
  { href: '/jobs', label: 'Jobs', permissions: ['jobs:read', '*'] },
  { href: '/scheduling', label: 'Scheduling', permissions: ['dispatch:read', '*'] },
  { href: '/finance/quotes', label: 'Quotes', permissions: ['finance:read', '*'] },
  { href: '/finance/invoices', label: 'Invoices', permissions: ['finance:read', '*'] },
  { href: '/finance/payments', label: 'Payments', permissions: ['finance:read', '*'] },
  // UX-K / UX-050 — removed duplicate label "Finance" that reused Quotes href.
  { href: '/inventory/products', label: 'Inventory', permissions: ['inventory:read', '*'] },
  { href: '/procurement', label: 'Procurement', permissions: ['procurement:read', '*'] },
  { href: '/fleet', label: 'Fleet', permissions: ['fleet:read', '*'] },
  {
    href: '/mobile-platform/dispatcher',
    label: NAV_LABELS.liveDispatch,
    permissions: ['dispatch:read', 'mobile:read', '*'],
    experiences: ['dispatcher', 'company_owner', 'manager', 'platform_owner', 'staff'],
  },
  {
    href: '/communications/messages',
    label: 'Communications',
    permissions: ['communications:read', '*'],
  },
  {
    href: '/email-centre',
    label: 'Email Centre',
    permissions: ['communications:read', '*'],
  },
  {
    href: '/communication-timeline',
    label: 'Communication Timeline',
    permissions: ['communications:read', '*'],
  },
  { href: '/documents', label: 'Documents', permissions: ['documents:read', '*'] },
  { href: '/analytics', label: 'Analytics', permissions: ['analytics:read', '*'] },
  { href: '/marketing', label: 'Marketing', permissions: ['marketing:read', '*'] },
  {
    href: '/aura/agents',
    label: NAV_LABELS.auraTeam,
    permissions: ['agents:read', '*'],
    experiences: [...COMPANY_BUSINESS_EXPERIENCES],
  },
  { href: '/automation', label: NAV_LABELS.automationCommandCentre, permissions: ['automation:read', '*'] },
  {
    href: '/mission-control',
    label: NAV_LABELS.companyHealth,
    permissions: ['executive:read', 'ops:read', '*'],
  },
  { href: '/integrations', label: 'Integrations', permissions: ['integrations:read', '*'] },
  { href: '/security', label: 'Security', permissions: ['security:read', '*'] },
  {
    href: '/enterprise-modules',
    label: 'Enterprise Modules',
    permissions: ['company:manage', 'ops:read', 'executive:read', '*'],
    experiences: ['platform_owner'],
  },
  {
    href: '/platform-health',
    label: 'Platform Health',
    permissions: ['platform_health:read', 'platform:cross_tenant', '*'],
    experiences: ['platform_owner'],
  },
  {
    href: '/release-center',
    label: 'Release Center',
    permissions: ['release_center:read', 'platform:cross_tenant', '*'],
    experiences: ['platform_owner'],
  },
  {
    href: '/saas-management',
    label: 'SaaS Management',
    permissions: ['saas:read', 'saas:manage', 'platform:cross_tenant', '*'],
    experiences: ['platform_owner'],
  },
  {
    href: '/settings/company',
    label: 'Settings',
    permissions: ['settings:manage', 'company:manage', '*'],
    experiences: [...COMPANY_BUSINESS_EXPERIENCES],
  },
  {
    href: '/settings/team',
    label: NAV_LABELS.teamAndAccess,
    permissions: ['users:read', 'users:manage', '*'],
  },
  {
    href: '/aura',
    label: NAV_LABELS.auraExecutiveChat,
    permissions: ['agents:read', 'intelligence:read', '*'],
    experiences: [...COMPANY_BUSINESS_EXPERIENCES],
  },
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
  '/email-centre',
  '/communication-timeline',
  '/documents',
  '/mobile-platform/dispatcher',
  '/dispatch-intelligence',
  '/settings/team',
]);

/** Accountant finance-focused navigation. */
export const ACCOUNTANT_ALLOWED_HREFS = new Set([
  '/',
  '/crm',
  '/finance/quotes',
  '/finance/invoices',
  '/finance/payments',
  '/documents',
  '/integrations',
  '/analytics',
]);

export const TECHNICIAN_NAV_ITEMS: NavItemConfig[] = [
  {
    href: '/mobile',
    label: 'Today',
    experiences: ['technician', 'platform_owner', 'company_owner'],
  },
  {
    href: '/mobile/jobs',
    label: 'My Jobs',
    experiences: ['technician', 'platform_owner', 'company_owner'],
  },
  {
    href: '/mobile/route',
    label: 'Navigation',
    experiences: ['technician', 'platform_owner', 'company_owner'],
  },
  {
    href: '/mobile/inventory',
    label: 'Parts Used',
    experiences: ['technician', 'platform_owner', 'company_owner'],
  },
  {
    href: '/mobile/time',
    label: 'Timesheets',
    experiences: ['technician', 'platform_owner', 'company_owner'],
  },
  {
    href: '/mobile/notifications',
    label: 'Messages',
    experiences: ['technician', 'platform_owner', 'company_owner'],
  },
  {
    href: '/mobile/sync',
    label: 'Offline Sync',
    experiences: ['technician', 'platform_owner', 'company_owner'],
  },
];

/** Canonical client nav uses `/my/*` (POR-007). `/portal/*` remains a redirect alias. */
export const CLIENT_PORTAL_NAV_ITEMS: NavItemConfig[] = [
  { href: '/my', label: 'Home', portalPermission: 'portal.dashboard:read' },
  { href: '/my/appointments', label: 'Book Job', portalPermission: 'portal.appointments:read' },
  { href: '/my/jobs', label: 'My Jobs', portalPermission: 'portal.jobs:read' },
  { href: '/my/quotes', label: 'Quotes', portalPermission: 'portal.quotes:read' },
  {
    href: '/my/finance',
    label: 'Invoices & Payments',
    portalPermissions: ['portal.invoices:read', 'portal.payments:read'],
  },
  {
    href: '/my/communications',
    label: 'Messages',
    portalPermission: 'portal.communications:read',
  },
  { href: '/my/documents', label: 'Documents', portalPermission: 'portal.documents:read' },
  {
    href: '/my/assets',
    label: 'Properties / Equipment',
    portalPermission: 'portal.dashboard:read',
  },
  { href: '/my/profile', label: 'Profile', portalPermission: 'portal.dashboard:read' },
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
  '/procurement',
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
  '/app-builder',
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

export const ACCOUNTANT_BLOCKED_ROUTE_PREFIXES = [
  '/scheduling',
  '/dispatch',
  '/leads',
  '/marketing',
  '/aura',
  '/automation',
  '/mission-control',
  '/settings/team',
  '/saas-management',
  '/platform-health',
  '/release-center',
  '/fleet',
  '/inventory',
  '/mobile-platform',
  '/app-builder',
];

export const TECHNICIAN_ALLOWED_ROUTE_PREFIXES = ['/mobile', '/auth'];
