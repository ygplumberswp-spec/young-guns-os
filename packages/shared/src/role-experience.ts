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

/** Phase 1 — global product organisation sidebar (Settings via header; Search via command palette). */
export const OWNER_STAFF_NAV_ITEMS: NavItemConfig[] = [
  // Core
  {
    href: '/',
    label: 'Dashboard',
    permissions: ['analytics:read', 'executive:read', 'jobs:read', '*'],
  },
  { href: '/crm', label: 'Customers', permissions: ['customers:read', '*'] },
  { href: '/leads', label: 'Leads', permissions: ['leads:read', '*'] },
  { href: '/jobs', label: 'Jobs', permissions: ['jobs:read', '*'] },
  { href: '/scheduling', label: 'Scheduling', permissions: ['dispatch:read', '*'] },
  // Finance — BOQs live under Quotes via FinanceNav
  { href: '/finance/quotes', label: 'Quotes', permissions: ['finance:read', '*'] },
  { href: '/finance/invoices', label: 'Invoices', permissions: ['finance:read', '*'] },
  { href: '/finance/payments', label: 'Payments', permissions: ['finance:read', '*'] },
  {
    href: '/finance/receivables',
    label: NAV_LABELS.receivables,
    permissions: ['finance:read', 'executive:read', '*'],
    experiences: ['company_owner', 'manager', 'platform_owner', 'accountant', 'staff'],
  },
  {
    href: '/finance/payables',
    label: NAV_LABELS.billsAndPayables,
    permissions: ['finance:read', 'executive:read', '*'],
    experiences: ['company_owner', 'manager', 'platform_owner', 'accountant', 'staff'],
  },
  {
    href: '/finance/cashflow',
    label: NAV_LABELS.cashflow,
    permissions: ['finance:read', 'executive:read', '*'],
    experiences: ['company_owner', 'manager', 'platform_owner', 'accountant', 'staff'],
  },
  // Operations — Procurement hidden unless procurement:read permission is granted
  {
    href: '/mobile-platform/dispatcher',
    label: NAV_LABELS.liveDispatch,
    permissions: ['dispatch:read', 'mobile:read', '*'],
    experiences: ['dispatcher', 'company_owner', 'manager', 'platform_owner', 'staff'],
  },
  { href: '/fleet', label: 'Fleet', permissions: ['fleet:read', '*'] },
  { href: '/inventory/products', label: 'Inventory', permissions: ['inventory:read', '*'] },
  { href: '/documents', label: 'Documents', permissions: ['documents:read', '*'] },
  {
    href: '/communications/messages',
    label: 'Communications',
    permissions: ['communications:read', '*'],
  },
  // Intelligence
  { href: '/analytics', label: 'Analytics', permissions: ['analytics:read', '*'] },
  { href: '/marketing', label: 'Marketing', permissions: ['marketing:read', '*'] },
  {
    href: '/aura/agents',
    label: NAV_LABELS.auraTeam,
    permissions: ['agents:read', '*'],
    experiences: [...COMPANY_BUSINESS_EXPERIENCES],
  },
  {
    href: '/automation',
    label: NAV_LABELS.automationCommandCentre,
    permissions: ['automation:read', '*'],
  },
  {
    href: '/mission-control',
    label: NAV_LABELS.companyHealth,
    permissions: ['executive:read', 'ops:read', '*'],
  },
];

/** Procurement is intentionally excluded from default sidebar — direct URL only when enabled. */
export const PROCUREMENT_NAV_ITEM: NavItemConfig = {
  href: '/procurement',
  label: 'Procurement',
  permissions: ['procurement:read', '*'],
};

/** Global search remains header/command-palette only (not sidebar). */
export const GLOBAL_SEARCH_NAV_ITEM: NavItemConfig = {
  href: '/global-search',
  label: 'Search',
  permissions: ['search:read', 'intelligence:read', 'ops:read', '*'],
};

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
  '/fleet/live-map',
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
  '/finance/receivables',
  '/finance/payables',
  '/finance/cashflow',
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
    label: 'Invoices & payments',
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
  '/settings/advanced/platform-health',
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
  '/settings/advanced/platform-health',
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
  '/settings/advanced/platform-health',
  '/release-center',
  '/fleet',
  '/inventory',
  '/mobile-platform',
  '/app-builder',
];

export const TECHNICIAN_ALLOWED_ROUTE_PREFIXES = ['/mobile', '/auth'];
