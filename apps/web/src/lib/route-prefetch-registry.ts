import {
  hasAnyPermission,
  resolveStaffExperience,
  type StaffExperience,
} from '@titan/auth/browser';
import type { PortalAccessPermission, QueryCacheScope } from '@titan/shared';
import type { AuthUser, PortalAuthUser } from '@titan/shared';
import { scheduleBackgroundTask } from './background-scheduler';
import { prefetchDataQueries } from './data-prefetch';
import { preloadDelayMs, shouldAllowBackgroundPreload } from './network-awareness';
import { recordNavPrefetch } from './nav-performance';

export type PreloadPriority = 1 | 2 | 3;

export type RoutePrefetchEntry = {
  path: string;
  load: () => Promise<unknown>;
  permissions?: string[];
  experiences?: StaffExperience[];
  portalPermission?: PortalAccessPermission;
  priority: PreloadPriority;
  dataQueries?: string[];
  safeToPreload: boolean;
  expensive?: boolean;
};

export type StaffPreloadContext = {
  kind: 'staff';
  user: Pick<AuthUser, 'id' | 'companyId' | 'roleName' | 'permissions'>;
  accessToken: string;
  scope: QueryCacheScope;
};

export type PortalPreloadContext = {
  kind: 'portal';
  user: PortalAuthUser;
  accessToken: string;
  scope: QueryCacheScope;
};

export type PreloadContext = StaffPreloadContext | PortalPreloadContext;

const prefetchedRoutes = new Set<string>();
let idlePreloadStarted = false;

const STAFF_ROUTE_REGISTRY: RoutePrefetchEntry[] = [
  {
    path: '/',
    load: () => import('../pages/dashboard/DashboardPage'),
    permissions: ['analytics:read', 'executive:read', 'jobs:read', '*'],
    priority: 1,
    dataQueries: ['crm/stats', 'jobs/stats', 'finance/stats'],
    safeToPreload: true,
  },
  {
    path: '/crm',
    load: () => import('../pages/crm/CustomerListPage'),
    permissions: ['customers:read', '*'],
    priority: 1,
    dataQueries: ['crm/customers'],
    safeToPreload: true,
  },
  {
    path: '/jobs',
    load: () => import('../pages/jobs/JobListPage'),
    permissions: ['jobs:read', '*'],
    priority: 1,
    dataQueries: ['jobs/list'],
    safeToPreload: true,
  },
  {
    path: '/payroll-timesheet-intelligence',
    load: () =>
      import('../pages/payroll-timesheet-intelligence/PayrollTimesheetIntelligencePage'),
    permissions: ['*'],
    experiences: ['platform_owner', 'company_owner', 'staff'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/scheduling',
    load: () => import('../pages/scheduling/SchedulingPage'),
    permissions: ['dispatch:read', '*'],
    priority: 1,
    dataQueries: ['jobs/list'],
    safeToPreload: true,
  },
  {
    path: '/finance/quotes',
    load: () => import('../pages/finance/QuoteListPage'),
    permissions: ['finance:read', '*'],
    priority: 2,
    dataQueries: ['finance/quotes'],
    safeToPreload: true,
  },
  {
    path: '/finance/invoices',
    load: () => import('../pages/finance/InvoiceListPage'),
    permissions: ['finance:read', '*'],
    priority: 2,
    dataQueries: ['finance/invoices'],
    safeToPreload: true,
  },
  {
    path: '/finance/payments',
    load: () => import('../pages/finance/PaymentListPage'),
    permissions: ['finance:read', '*'],
    priority: 2,
    dataQueries: ['finance/payments'],
    safeToPreload: true,
  },
  {
    path: '/settings/team',
    load: () => import('../pages/settings/TeamSettingsPage'),
    permissions: ['users:read', 'users:manage', '*'],
    priority: 2,
    dataQueries: ['team/members', 'team/roles'],
    safeToPreload: true,
  },
  {
    path: '/leads',
    load: () => import('../pages/leads/LeadListPage'),
    permissions: ['leads:read', 'leads:write', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff', 'dispatcher'],
    priority: 1,
    dataQueries: ['leads/list', 'leads/stats'],
    safeToPreload: true,
  },
  {
    path: '/leads/new',
    load: () => import('../pages/leads/LeadCreatePage'),
    permissions: ['leads:write', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'dispatcher'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/communications/messages',
    load: () => import('../pages/communications/MessageListPage'),
    permissions: ['communications:read', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff', 'dispatcher'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/email-centre',
    load: () => import('../pages/email-centre/EmailCentrePage'),
    permissions: ['communications:read', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff', 'dispatcher'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/communication-timeline',
    load: () => import('../pages/communication-timeline/CommunicationTimelinePage'),
    permissions: ['communications:read', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff', 'dispatcher'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/communication-aura-intelligence',
    load: () =>
      import('../pages/communication-aura-intelligence/CommunicationAuraIntelligencePage'),
    permissions: ['communications:read', 'communications_intelligence:read', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff', 'dispatcher'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/marketing-agent',
    load: () => import('../pages/marketing-agent/MarketingAgentPage'),
    permissions: ['marketing:read', 'marketing_intelligence:read', 'agents:read', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/finance-aura-agent',
    load: () => import('../pages/finance-aura-agent/FinanceAuraAgentPage'),
    permissions: ['finance:read', 'finance:write', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/finance-reporting-forecast',
    load: () => import('../pages/finance-reporting-forecast/FinanceReportingForecastPage'),
    permissions: ['finance:read', 'finance:write', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/finance-cashflow-profit',
    load: () => import('../pages/finance-cashflow-profit/FinanceCashflowProfitPage'),
    permissions: ['finance:read', 'finance:write', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/hr-employee-intelligence',
    load: () => import('../pages/hr-employee-intelligence/HrEmployeeIntelligencePage'),
    permissions: ['*'],
    experiences: ['platform_owner', 'company_owner', 'staff'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/vehicle-intelligence',
    load: () => import('../pages/vehicle-intelligence/VehicleIntelligencePage'),
    permissions: [
      'fleet:read',
      'fleet:write',
      'fleet_intelligence:read',
      'fleet_intelligence:write',
      'agents:read',
      '*',
    ],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff', 'dispatcher'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/fleet-ai-recommendations',
    load: () => import('../pages/fleet-ai-recommendations/FleetAiRecommendationsPage'),
  },

  {
    path: '/inventory-intelligence',
    load: () => import('../pages/inventory-intelligence/InventoryIntelligencePage'),
    permissions: ['inventory:read', 'procurement:read', 'agents:read', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/stock-forecasting',
    load: () => import('../pages/stock-forecasting/StockForecastingPage'),
    permissions: ['inventory:read', 'procurement:read', 'agents:read', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/social-media-integrations',
    load: () =>
      import('../pages/social-media-integrations/SocialMediaIntegrationsPage'),
    permissions: [
      'marketing:read',
      'marketing_intelligence:read',
      'integrations:read',
      'agents:read',
      '*',
    ],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff'],
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/aura/agents',
    load: () => import('../pages/agents/AgentDashboardPage'),
    permissions: ['agents:read', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff'],
    priority: 3,
    dataQueries: ['agents/stats', 'tenant-capabilities/list'],
    safeToPreload: true,
  },
  {
    path: '/mission-control',
    load: () => import('../pages/mission-control/MissionControlPage'),
    permissions: ['executive:read', 'ops:read', 'intelligence:read', '*'],
    priority: 3,
    dataQueries: ['mission-control/dashboard'],
    safeToPreload: true,
    expensive: true,
  },
  {
    path: '/integrations',
    load: () => import('../pages/integrations/IntegrationsDashboardPage'),
    permissions: ['integrations:read', '*'],
    priority: 3,
    dataQueries: ['integrations/hub-dashboard'],
    safeToPreload: true,
  },
  {
    path: '/aura',
    load: () => import('../pages/aura/AuraPage'),
    permissions: ['agents:read', 'intelligence:read', '*'],
    experiences: ['platform_owner', 'company_owner', 'manager', 'staff'],
    priority: 3,
    safeToPreload: true,
  },
];

const TECHNICIAN_ROUTE_REGISTRY: RoutePrefetchEntry[] = [
  {
    path: '/mobile',
    load: () => import('../pages/mobile/MobileDashboardPage'),
    priority: 1,
    dataQueries: ['mobile/workforce-dashboard'],
    safeToPreload: true,
  },
  {
    path: '/mobile/jobs',
    load: () => import('../pages/mobile/MobileJobsPage'),
    priority: 1,
    dataQueries: ['mobile/jobs'],
    safeToPreload: true,
  },
  {
    path: '/mobile/route',
    load: () => import('../pages/mobile/MobileRoutePage'),
    priority: 2,
    safeToPreload: true,
  },
  {
    path: '/mobile/notifications',
    load: () => import('../pages/mobile/MobileNotificationsPage'),
    priority: 2,
    dataQueries: ['mobile/notifications'],
    safeToPreload: true,
  },
  {
    path: '/mobile/inventory',
    load: () => import('../pages/mobile/MobileInventoryPage'),
    priority: 3,
    safeToPreload: true,
  },
  {
    path: '/mobile/time',
    load: () => import('../pages/mobile/MobileTimePage'),
    priority: 3,
    safeToPreload: true,
  },
];

const PORTAL_ROUTE_REGISTRY: RoutePrefetchEntry[] = [
  {
    path: '/my',
    load: () => import('../pages/portal/PortalDashboardPage'),
    portalPermission: 'portal.dashboard:read',
    priority: 1,
    dataQueries: ['portal/dashboard'],
    safeToPreload: true,
  },
  {
    path: '/my/appointments',
    load: () => import('../pages/portal/PortalAppointmentsPage'),
    portalPermission: 'portal.appointments:read',
    priority: 1,
    dataQueries: ['portal/appointments'],
    safeToPreload: true,
  },
  {
    path: '/my/jobs',
    load: () => import('../pages/portal/PortalJobsPage'),
    portalPermission: 'portal.jobs:read',
    priority: 1,
    dataQueries: ['portal/jobs'],
    safeToPreload: true,
  },
  {
    path: '/my/quotes',
    load: () => import('../pages/portal/PortalQuotesPage'),
    portalPermission: 'portal.quotes:read',
    priority: 2,
    dataQueries: ['portal/quotes'],
    safeToPreload: true,
  },
  {
    path: '/my/finance',
    load: () => import('../pages/portal/PortalFinancePage'),
    portalPermission: 'portal.invoices:read',
    priority: 2,
    dataQueries: ['portal/finance'],
    safeToPreload: true,
  },
  {
    path: '/my/documents',
    load: () => import('../pages/portal/PortalDocumentsPage'),
    portalPermission: 'portal.documents:read',
    priority: 3,
    safeToPreload: true,
  },
  {
    path: '/my/communications',
    load: () => import('../pages/portal/PortalCommunicationsPage'),
    portalPermission: 'portal.communications:read',
    priority: 2,
    dataQueries: ['portal/communications'],
    safeToPreload: true,
  },
];

function resolveStaffRegistry(context: StaffPreloadContext): RoutePrefetchEntry[] {
  const experience = resolveStaffExperience({
    roleName: context.user.roleName,
    permissions: context.user.permissions,
  });

  if (experience === 'technician') {
    return TECHNICIAN_ROUTE_REGISTRY;
  }

  return STAFF_ROUTE_REGISTRY.filter((entry) => canPrefetchStaffRoute(entry, context, experience));
}

export function canPrefetchStaffRoute(
  entry: RoutePrefetchEntry,
  context: StaffPreloadContext,
  experience: StaffExperience = resolveStaffExperience({
    roleName: context.user.roleName,
    permissions: context.user.permissions,
  }),
): boolean {
  if (!entry.safeToPreload) return false;
  if (entry.experiences && !entry.experiences.includes(experience)) return false;
  if (entry.permissions && !hasAnyPermission(context.user.permissions, entry.permissions))
    return false;

  if (experience === 'dispatcher') {
    const allowed = new Set([
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
      '/settings/team',
    ]);
    if (!allowed.has(entry.path)) return false;
  }

  return true;
}

export function canPrefetchPortalRoute(
  entry: RoutePrefetchEntry,
  context: PortalPreloadContext,
): boolean {
  if (!entry.safeToPreload) return false;
  if (entry.portalPermission && !context.user.permissions.includes(entry.portalPermission)) {
    return false;
  }
  return true;
}

function registryForContext(context: PreloadContext): RoutePrefetchEntry[] {
  if (context.kind === 'portal') {
    return PORTAL_ROUTE_REGISTRY.filter((entry) => canPrefetchPortalRoute(entry, context));
  }
  return resolveStaffRegistry(context);
}

function findRouteEntry(path: string, context: PreloadContext): RoutePrefetchEntry | undefined {
  const registry = registryForContext(context);
  return registry.find(
    (entry) => entry.path === path || (path.startsWith(`${entry.path}/`) && entry.path !== '/'),
  );
}

export function prefetchNavIntent(path: string, context: PreloadContext | null): void {
  if (!context || !shouldAllowBackgroundPreload()) {
    return;
  }

  const entry = findRouteEntry(path, context);
  if (!entry) {
    return;
  }

  const dedupeKey = `route:${context.kind}:${context.scope.actorId}:${entry.path}`;
  scheduleBackgroundTask(
    dedupeKey,
    entry.expensive ? 'expensive' : 'background',
    async (signal) => {
      if (signal.aborted) return;
      await prefetchRouteChunk(entry.path, entry.load);
      if (signal.aborted) return;
      if (entry.dataQueries?.length) {
        prefetchDataQueries(entry.dataQueries, context, signal);
      }
      recordNavPrefetch(entry.path, 'intent');
    },
  );
}

async function prefetchRouteChunk(path: string, load: () => Promise<unknown>): Promise<void> {
  if (prefetchedRoutes.has(path)) {
    return;
  }
  prefetchedRoutes.add(path);
  await load();
}

export function resetRoutePrefetchState(): void {
  prefetchedRoutes.clear();
  idlePreloadStarted = false;
}

export function startIdleRoutePreload(context: PreloadContext, currentPath: string): void {
  if (idlePreloadStarted || !shouldAllowBackgroundPreload()) {
    return;
  }

  idlePreloadStarted = true;

  const run = () => {
    const registry = registryForContext(context)
      .filter((entry) => entry.path !== currentPath)
      .sort((a, b) => a.priority - b.priority);

    for (const entry of registry) {
      const dedupeKey = `idle-route:${context.kind}:${context.scope.actorId}:${entry.path}`;
      scheduleBackgroundTask(
        dedupeKey,
        entry.expensive ? 'expensive' : 'background',
        async (signal) => {
          if (signal.aborted) return;
          await prefetchRouteChunk(entry.path, entry.load);
          if (signal.aborted || !entry.dataQueries?.length) return;
          prefetchDataQueries(entry.dataQueries, context, signal);
          recordNavPrefetch(entry.path, 'idle');
        },
      );
    }
  };

  const delay = preloadDelayMs();
  const start = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => run(), { timeout: 4_000 });
      return;
    }
    setTimeout(run, Math.max(delay, 1_500));
  };

  setTimeout(start, Math.max(delay, 800));
}

/** @deprecated Use prefetchNavIntent with context */
export function prefetchOwnerRoute(href: string): void {
  void href;
}

export function scheduleDashboardBackgroundPrep(context: StaffPreloadContext): void {
  if (!shouldAllowBackgroundPreload()) return;

  scheduleBackgroundTask(
    `dashboard-prep:${context.scope.actorId}`,
    'background',
    async (signal) => {
      if (signal.aborted) return;
      const queries = [
        'crm/customers',
        'jobs/list',
        'finance/quotes',
        'finance/invoices',
        'team/members',
      ];
      prefetchDataQueries(queries, context, signal);
    },
  );
}
