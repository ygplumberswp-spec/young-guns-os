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

/* -------------------------------------------------------------------------- */
/* Consolidated navigation (UX final pass)                                     */
/* -------------------------------------------------------------------------- */

/**
 * The sidebar lists business modules, not every page. Each module has one
 * landing page in the sidebar; its supporting pages stay in the registry below
 * and surface inside the module instead.
 *
 * Nothing is removed by this grouping. Every page keeps its route, its own
 * permissions and its place in the registry — the same permission filter runs
 * before a page appears anywhere, so moving an item out of the sidebar can
 * never make it visible to someone who could not already open it.
 */
export type NavModuleId =
  | 'dashboard'
  | 'search'
  | 'customers'
  | 'leads'
  | 'jobs'
  | 'schedule'
  | 'quotes'
  | 'invoices'
  | 'payments'
  | 'inventory'
  | 'suppliers'
  | 'fleet'
  | 'documents'
  | 'communications'
  | 'team'
  | 'marketing'
  | 'reports'
  | 'aura'
  | 'integrations'
  | 'settings';

/** Sidebar order. Groups are applied on top of this by the web layer. */
export const NAV_MODULE_ORDER: NavModuleId[] = [
  'dashboard',
  'search',
  'customers',
  'leads',
  'jobs',
  'schedule',
  'quotes',
  'invoices',
  'payments',
  'inventory',
  'suppliers',
  'fleet',
  'documents',
  'communications',
  'team',
  'marketing',
  'reports',
  'aura',
  'integrations',
  'settings',
];

/** The one page per module that appears in the main sidebar. */
export const NAV_MODULE_PRIMARY_HREF: Record<NavModuleId, string> = {
  dashboard: '/',
  search: '/global-search',
  customers: '/crm',
  leads: '/leads',
  jobs: '/jobs',
  schedule: '/scheduling',
  quotes: '/finance/quotes',
  invoices: '/finance/invoices',
  payments: '/finance/payments',
  inventory: '/inventory/products',
  suppliers: '/procurement/suppliers',
  fleet: '/fleet',
  documents: '/documents',
  communications: '/communications/messages',
  team: '/settings/team',
  marketing: '/marketing',
  reports: '/analytics',
  aura: '/aura',
  integrations: '/integrations',
  settings: '/settings/company',
};

/** Plain-language name for the module, used by the in-module navigation. */
export const NAV_MODULE_LABELS: Record<NavModuleId, string> = {
  dashboard: 'Dashboard',
  search: 'Search',
  customers: 'Customers',
  leads: 'Leads',
  jobs: 'Jobs',
  schedule: 'Schedule',
  quotes: 'Quotes',
  invoices: 'Invoices',
  payments: 'Payments',
  inventory: 'Inventory',
  suppliers: 'Suppliers',
  fleet: 'Fleet',
  documents: 'Documents',
  communications: 'Communications',
  team: 'Team',
  marketing: 'Marketing',
  reports: 'Reports',
  aura: 'AURA',
  integrations: 'Integrations',
  settings: 'Settings',
};

/**
 * Which module each page belongs to. A page listed here that is not its
 * module's landing page appears inside that module rather than in the sidebar.
 */
export const NAV_MODULE_BY_HREF: Record<string, NavModuleId> = {
  '/': 'dashboard',
  '/mission-control': 'dashboard',
  '/executive-command-centre': 'dashboard',
  '/smart-notifications': 'dashboard',

  '/global-search': 'search',

  '/crm': 'customers',
  '/customer-360-intelligence': 'customers',
  '/property-intelligence': 'customers',
  '/customer-engagement-intelligence': 'customers',
  '/homeshield-experience': 'customers',

  '/leads': 'leads',
  '/sales-intelligence-agent': 'leads',
  '/sales-followup-intelligence': 'leads',
  '/sales-analytics-intelligence': 'leads',

  '/jobs': 'jobs',
  '/recurring-maintenance': 'jobs',

  '/scheduling': 'schedule',
  '/mobile-platform/dispatcher': 'schedule',
  '/dispatch-intelligence': 'schedule',
  '/technician-intelligence': 'schedule',

  '/finance/quotes': 'quotes',
  '/finance/invoices': 'invoices',
  '/finance/payments': 'payments',
  '/finance/boq': 'payments',

  '/inventory/products': 'inventory',
  '/inventory-intelligence': 'inventory',
  '/stock-forecasting': 'inventory',

  '/procurement/suppliers': 'suppliers',
  '/procurement': 'suppliers',
  '/procurement-intelligence': 'suppliers',

  '/fleet': 'fleet',
  '/vehicle-intelligence': 'fleet',
  '/fleet-ai-recommendations': 'fleet',
  '/driver-intelligence': 'fleet',

  '/documents': 'documents',
  '/document-intelligence': 'documents',
  '/compliance-intelligence': 'documents',

  '/communications/messages': 'communications',
  '/email-centre': 'communications',
  '/communication-timeline': 'communications',
  '/communication-aura-intelligence': 'communications',
  '/voice-ai-receptionist': 'communications',
  '/call-intelligence': 'communications',

  '/settings/team': 'team',
  '/hr-employee-intelligence': 'team',
  '/recruitment-performance-intelligence': 'team',
  '/payroll-timesheet-intelligence': 'team',

  '/marketing': 'marketing',
  '/marketing-agent': 'marketing',
  '/marketing-intelligence': 'marketing',
  '/social-media-integrations': 'marketing',
  '/facebook-business': 'marketing',
  '/content-reputation-intelligence': 'marketing',
  '/market-intelligence': 'marketing',

  '/analytics': 'reports',

  '/aura': 'aura',
  '/aura/agents': 'aura',
  '/aura/command-centre': 'aura',
  '/aura/evolution': 'aura',
  '/aura-agent-network': 'aura',
  '/automation': 'aura',
  '/workflow-automation': 'aura',

  '/integrations': 'integrations',

  '/settings/company': 'settings',
  '/security': 'settings',
  '/security-monitoring': 'settings',
  '/industry-templates': 'settings',
  '/enterprise-modules': 'settings',
  '/platform-health': 'settings',
  '/release-center': 'settings',
  '/saas-management': 'settings',
};

const NAV_PRIMARY_HREFS: ReadonlySet<string> = new Set(Object.values(NAV_MODULE_PRIMARY_HREF));

export function isPrimaryNavHref(href: string): boolean {
  return NAV_PRIMARY_HREFS.has(href);
}

/**
 * Which module a location belongs to. Falls back to the longest mapped prefix
 * so a detail page such as `/finance/quotes/123` still resolves to Quotes.
 */
export function resolveNavModuleForHref(href: string): NavModuleId | null {
  const direct = NAV_MODULE_BY_HREF[href];
  if (direct) return direct;

  let bestMatch: NavModuleId | null = null;
  let bestLength = 0;
  for (const [candidate, moduleId] of Object.entries(NAV_MODULE_BY_HREF)) {
    if (candidate === '/') continue;
    if (href === candidate || href.startsWith(`${candidate}/`)) {
      if (candidate.length > bestLength) {
        bestLength = candidate.length;
        bestMatch = moduleId;
      }
    }
  }
  return bestMatch;
}

/**
 * The sidebar: one landing page per module, in module order. Input must
 * already be permission-filtered, so a module the user cannot open simply
 * does not appear.
 */
export function selectPrimaryNavItems(items: NavItemConfig[]): NavItemConfig[] {
  const byHref = new Map(items.map((item) => [item.href, item] as const));
  const primary: NavItemConfig[] = [];
  for (const moduleId of NAV_MODULE_ORDER) {
    const item = byHref.get(NAV_MODULE_PRIMARY_HREF[moduleId]);
    if (item) primary.push(item);
  }
  return primary;
}

/**
 * The supporting pages inside one module — everything that used to sit in the
 * sidebar under its own entry. Input must already be permission-filtered.
 */
export function selectModuleToolItems(
  items: NavItemConfig[],
  moduleId: NavModuleId,
): NavItemConfig[] {
  const primaryHref = NAV_MODULE_PRIMARY_HREF[moduleId];
  return items.filter(
    (item) => item.href !== primaryHref && NAV_MODULE_BY_HREF[item.href] === moduleId,
  );
}

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
  {
    href: '/inventory-intelligence',
    label: 'Inventory Intelligence',
    permissions: ['inventory:read', 'procurement:read', 'agents:read', '*'],
  },
  // Suppliers is the module landing page. `/procurement` is the purchase order
  // list, so it is named for what it actually shows. Both keep the same
  // permissions they have always had.
  { href: '/procurement/suppliers', label: 'Suppliers', permissions: ['procurement:read', '*'] },
  { href: '/procurement', label: 'Purchase Orders', permissions: ['procurement:read', '*'] },
  {
    href: '/procurement-intelligence',
    label: 'Procurement Intelligence',
    permissions: ['inventory:read', 'procurement:read', 'agents:read', '*'],
  },
  {
    href: '/stock-forecasting',
    label: 'Stock Forecasting',
    permissions: ['inventory:read', 'procurement:read', 'agents:read', '*'],
  },
  {
    href: '/hr-employee-intelligence',
    label: 'Employee Intelligence',
    permissions: ['*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/recruitment-performance-intelligence',
    label: 'Recruitment & Performance',
    permissions: ['workforce:read', 'recruiting:read', '*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  { href: '/fleet', label: 'Fleet', permissions: ['fleet:read', '*'] },
  {
    href: '/vehicle-intelligence',
    label: 'Vehicle Intelligence',
    permissions: [
      'fleet:read',
      'fleet:write',
      'fleet_intelligence:read',
      'fleet_intelligence:write',
      'agents:read',
      '*',
    ],
  },
  {
    href: '/fleet-ai-recommendations',
    label: 'Fleet AI Recommendations',
    permissions: [
      'fleet:read',
      'fleet:write',
      'fleet_intelligence:read',
      'fleet_intelligence:write',
      'agents:read',
      '*',
    ],
  },
  {
    href: '/driver-intelligence',
    label: 'Driver Intelligence',
    permissions: ['fleet:read', 'fleet_intelligence:read', 'agents:read', '*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },

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
  {
    href: '/communication-aura-intelligence',
    label: 'Communication AURA',
    permissions: ['communications:read', 'communications_intelligence:read', '*'],
  },
  { href: '/documents', label: 'Documents', permissions: ['documents:read', '*'] },
  { href: '/analytics', label: 'Analytics', permissions: ['analytics:read', '*'] },
  { href: '/marketing', label: 'Marketing', permissions: ['marketing:read', '*'] },
  {
    href: '/marketing-agent',
    label: 'Marketing Agent',
    permissions: [
      'marketing:read',
      'marketing_intelligence:read',
      'agents:read',
      '*',
    ],
  },
  {
    href: '/social-media-integrations',
    label: 'Social Media',
    permissions: [
      'marketing:read',
      'marketing_intelligence:read',
      'integrations:read',
      'agents:read',
      '*',
    ],
  },
  {
    href: '/facebook-business',
    label: 'Facebook Business',
    permissions: [
      'marketing:read',
      'marketing_intelligence:read',
      'integrations:read',
      'agents:read',
      '*',
    ],
  },
  {
    href: '/content-reputation-intelligence',
    label: 'Content & Reputation',
    permissions: [
      'marketing:read',
      'marketing_intelligence:read',
      'agents:read',
      '*',
    ],
  },
  {
    href: '/payroll-timesheet-intelligence',
    label: 'Payroll & Timesheets',
    permissions: ['*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/voice-ai-receptionist',
    label: 'Voice AI Receptionist',
    permissions: [
      'voice:read',
      'voice:write',
      'voice_reception:read',
      'voice_reception:write',
      'voice_reception:manage',
      'communications:read',
      'communications:write',
      'communications:manage',
      'agents:read',
      '*',
    ],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/call-intelligence',
    label: 'Call Intelligence',
    permissions: ['communications:read', 'crm:read', 'customers:read', 'agents:read', '*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/sales-intelligence-agent',
    label: 'Sales Intelligence Agent',
    permissions: ['sales:read', 'sales:write', 'sales_intelligence:read', 'leads:read', 'agents:read', '*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/sales-followup-intelligence',
    label: 'Sales Follow-up Intelligence',
    permissions: [
      'sales:read',
      'sales:write',
      'sales_intelligence:read',
      'leads:read',
      'quotes:read',
      'agents:read',
      '*',
    ],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/sales-analytics-intelligence',
    label: 'Sales Analytics Intelligence',
    permissions: [
      'sales:read',
      'sales:write',
      'sales_intelligence:read',
      'leads:read',
      'analytics:read',
      'agents:read',
      '*',
    ],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/customer-360-intelligence',
    label: 'Customer 360 Intelligence',
    permissions: [
      'customers:read',
      'customers:write',
      'customer_experience:read',
      'customer_experience:write',
      'communications:read',
      'communications:write',
      'communications:manage',
      '*',
    ],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/property-intelligence',
    label: 'Property Intelligence',
    permissions: [
      'customers:read',
      'customers:write',
      'jobs:read',
      'documents:read',
      'ops:read',
      'agents:read',
      '*',
    ],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/document-intelligence',
    label: 'Document Intelligence',
    permissions: ['documents:read', 'documents:write', 'agents:read', '*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/compliance-intelligence',
    label: 'Compliance Intelligence',
    permissions: [
      'legal_compliance:read',
      'legal_compliance:write',
      'legal_compliance:manage',
      'documents:read',
      'documents:write',
      'agents:read',
      '*',
    ],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    // Owner only — exposes revenue, profit, cash, payroll and strategy data.
    // Consolidates the executive view instead of adding more Intelligence entries.
    href: '/executive-command-centre',
    label: 'Executive Command Centre',
    permissions: ['executive:read', '*'],
    experiences: ['company_owner', 'platform_owner'],
  },
  {
    // Every staff experience may open it — the API decides what the feed holds,
    // and finance, payroll, security and strategy categories stay Owner only.
    href: '/smart-notifications',
    label: 'Smart Notifications',
    permissions: ['notifications:read', 'notifications:write', 'notifications:manage', '*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    // Marketing staff may open it, but the API shows them approved insights
    // only, and pricing, supplier cost and strategy topics stay Owner only.
    href: '/market-intelligence',
    label: 'Market Intelligence',
    permissions: ['marketing:read', 'marketing:write', 'marketing:manage', '*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/aura/agents',
    label: NAV_LABELS.auraTeam,
    permissions: ['agents:read', '*'],
    experiences: [...COMPANY_BUSINESS_EXPERIENCES],
  },
  { href: '/automation', label: NAV_LABELS.automationCommandCentre, permissions: ['automation:read', '*'] },
  {
    href: '/workflow-automation',
    label: NAV_LABELS.workflowAutomation,
    permissions: ['automation:read', 'ops:read', 'ops:manage', '*'],
  },
  {
    href: '/recurring-maintenance',
    label: NAV_LABELS.recurringMaintenance,
    permissions: [
      'asset_equipment:read',
      'asset_lifecycle:read',
      'ops:read',
      'ops:manage',
      '*',
    ],
  },
  {
    href: '/homeshield-experience',
    label: 'HomeShield Experience',
    permissions: [
      'customers:read',
      'customers:write',
      'portal:read',
      'portal:manage',
      'agents:read',
      'finance:read',
      'finance:write',
      '*',
    ],
  },
  {
    href: '/customer-engagement-intelligence',
    label: 'Customer Engagement Intelligence',
    permissions: ['customers:read', 'customers:write', 'portal:read', 'communications:read', 'agents:read', '*'],
    experiences: ['company_owner', 'platform_owner', 'staff'],
  },
  {
    href: '/mission-control',
    label: NAV_LABELS.companyHealth,
    permissions: ['executive:read', 'ops:read', '*'],
  },
  { href: '/integrations', label: 'Integrations', permissions: ['integrations:read', '*'] },
  { href: '/security', label: 'Security', permissions: ['security:read', '*'] },
  {
    href: '/security-monitoring',
    label: 'Security Monitoring',
    permissions: ['security:read', '*'],
  },
  {
    href: '/industry-templates',
    label: 'Industry Templates',
    permissions: ['company:manage', 'settings:write', '*'],
  },
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
  {
    href: '/aura/command-centre',
    label: NAV_LABELS.auraCommandCentre,
    permissions: ['agents:read', 'intelligence:read', 'agents:write', 'intelligence:write', '*'],
    experiences: [...COMPANY_BUSINESS_EXPERIENCES],
  },
  {
    href: '/aura-agent-network',
    label: NAV_LABELS.auraAgentNetwork,
    permissions: ['agents:read', 'agents:write', 'agents:manage', 'orchestration:read', 'orchestration:write', '*'],
    experiences: [...COMPANY_BUSINESS_EXPERIENCES],
  },
  {
    href: '/aura/evolution',
    label: NAV_LABELS.auraEvolution,
    permissions: ['agents:read', 'intelligence:read', 'agents:write', 'intelligence:write', '*'],
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
  '/communication-aura-intelligence',
  '/documents',
  '/mobile-platform/dispatcher',
  '/dispatch-intelligence',
  '/technician-intelligence',
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
    href: '/mobile/schedule',
    label: 'Schedule',
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
  // YG-CUTOVER-001E: Performance removed from Technician nav — productivity/analytics
  // is not required for job execution. Personal self-view route may remain for owners.
  {
    href: '/mobile/notifications',
    label: 'Notifications',
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
  {
    href: '/my/homeshield',
    label: 'HomeShield',
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
  '/communications-hub',
  '/communications-intelligence',
  '/email-centre',
  '/documents',
  '/dispatch',
  '/scheduling',
  '/finance',
  '/financial-planning',
  '/inventory',
  '/procurement',
  '/fleet',
  '/fleet-intelligence',
  '/analytics',
  '/marketing',
  '/sales-intelligence',
  '/platform',
  '/saas-management',
  '/mission-control',
  '/integrations',
  '/security',
  '/security-monitoring',
  '/industry-templates',
  '/settings',
  '/aura',
  '/automation',
  '/workflow-automation',
  '/recurring-maintenance',
  '/release',
  '/go-live',
  '/release-center',
  '/launch-center',
  '/platform-health',
  '/executive',
  '/recruiting',
  '/quality',
  '/operations',
  '/workforce',
  '/workforce-intelligence',
  '/enterprise-modules',
  '/global-search',
  '/technician-intelligence',
  '/mobile-platform',
  '/app-builder',
];

export const DISPATCHER_BLOCKED_ROUTE_PREFIXES = [
  '/aura',
  '/security',
  '/security-monitoring',
  '/industry-templates',
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
