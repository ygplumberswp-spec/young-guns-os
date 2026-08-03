export type ParentRouteEntry = {
  match: RegExp;
  fallback: string | ((path: string) => string);
};

/** Routes where back navigates to a parent (not self). Order matters — first match wins. */
export const PARENT_ROUTE_ENTRIES: ParentRouteEntry[] = [
  // Finance
  { match: /^\/finance\/quotes\/new$/, fallback: '/finance/quotes' },
  {
    match: /^\/finance\/quotes\/([^/]+)\/edit$/,
    fallback: (path) => {
      const id = path.split('/')[3];
      return id ? `/finance/quotes/${id}` : '/finance/quotes';
    },
  },
  { match: /^\/finance\/quotes\/[^/]+$/, fallback: '/finance/quotes' },
  { match: /^\/finance\/invoices\/new$/, fallback: '/finance/invoices' },
  { match: /^\/finance\/invoices\/[^/]+$/, fallback: '/finance/invoices' },
  { match: /^\/finance\/payments\/new$/, fallback: '/finance/payments' },
  { match: /^\/finance\/payments\/[^/]+$/, fallback: '/finance/payments' },
  { match: /^\/finance\/boq\/new$/, fallback: '/finance/boq' },
  { match: /^\/finance\/boq\/[^/]+$/, fallback: '/finance/boq' },

  // Jobs & schedule
  { match: /^\/jobs\/new$/, fallback: '/jobs' },
  { match: /^\/jobs\/[^/]+$/, fallback: '/jobs' },
  { match: /^\/workforce\/day-timeline$/, fallback: '/scheduling' },

  // CRM & leads
  { match: /^\/crm\/new$/, fallback: '/crm' },
  { match: /^\/crm\/duplicates$/, fallback: '/crm' },
  { match: /^\/crm\/[^/]+$/, fallback: '/crm' },
  { match: /^\/leads\/new$/, fallback: '/leads' },
  { match: /^\/leads\/[^/]+$/, fallback: '/leads' },

  // Procurement & inventory
  { match: /^\/procurement\/purchase-orders\/new$/, fallback: '/procurement' },
  { match: /^\/procurement\/purchase-orders\/[^/]+$/, fallback: '/procurement' },
  { match: /^\/procurement\/suppliers\/[^/]+$/, fallback: '/procurement/suppliers' },
  { match: /^\/procurement\/parts-requests$/, fallback: '/procurement' },
  { match: /^\/inventory\/products\/new$/, fallback: '/inventory/products' },
  { match: /^\/inventory\/movements$/, fallback: '/inventory/stock' },

  // Fleet
  { match: /^\/fleet\/new$/, fallback: '/fleet' },
  { match: /^\/fleet\/[^/]+$/, fallback: '/fleet' },

  // Documents
  { match: /^\/documents\/new$/, fallback: '/documents' },
  { match: /^\/documents\/categories\/new$/, fallback: '/documents/categories' },
  { match: /^\/documents\/categories$/, fallback: '/documents' },
  { match: /^\/documents\/job-packs\/[^/]+$/, fallback: '/documents/job-packs' },
  { match: /^\/documents\/job-packs$/, fallback: '/documents' },
  { match: /^\/documents\/completion-reports\/[^/]+$/, fallback: '/documents/completion-reports' },
  { match: /^\/documents\/completion-reports$/, fallback: '/documents' },
  { match: /^\/documents\/[^/]+$/, fallback: '/documents' },

  // Communications
  { match: /^\/communications\/templates\/new$/, fallback: '/communications/templates' },
  { match: /^\/communications\/messages\/new$/, fallback: '/communications/messages' },

  // Automation & agents
  { match: /^\/automation\/new$/, fallback: '/automation' },
  { match: /^\/automation\/executions$/, fallback: '/automation' },
  { match: /^\/automation\/n8n$/, fallback: '/automation' },
  { match: /^\/automation\/[^/]+$/, fallback: '/automation' },
  { match: /^\/aura\/capabilities\/create$/, fallback: '/aura/agents' },
  { match: /^\/aura\/agents\/new$/, fallback: '/aura/agents' },
  { match: /^\/aura\/agents\/executions$/, fallback: '/aura/agents' },
  { match: /^\/aura\/agents\/[^/]+$/, fallback: '/aura/agents' },
  { match: /^\/aura\/business-rules$/, fallback: '/aura' },
  { match: /^\/aura\/todays-plan$/, fallback: '/aura' },

  // Settings (hub is company profile — `/settings` redirects there)
  { match: /^\/settings\/advanced\/[^/]+$/, fallback: '/settings/company' },
  { match: /^\/settings\/company$/, fallback: '/' },
  { match: /^\/settings\/[^/]+$/, fallback: '/settings/company' },

  // Integrations sub-pages (nested routes before single-segment)
  { match: /^\/integrations\/xero\/write-approvals$/, fallback: '/integrations/xero' },
  {
    match: /^\/integrations\/[^/]+\/[^/]+$/,
    fallback: (path) => {
      const parts = path.split('/').filter(Boolean);
      return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : '/integrations';
    },
  },
  { match: /^\/integrations\/[^/]+$/, fallback: '/integrations' },

  // Workforce sub-pages
  { match: /^\/workforce\/manager$/, fallback: '/workforce-intelligence' },
  { match: /^\/workforce\/self-service$/, fallback: '/workforce-intelligence' },

  // Mobile platform
  { match: /^\/mobile-platform\/dispatcher$/, fallback: '/mobile-platform' },

  // Drafts workspace
  { match: /^\/drafts$/, fallback: '/' },

  // Global search (opened from header — return home)
  { match: /^\/global-search$/, fallback: '/' },

  // Mobile field app (nested under /mobile)
  { match: /^\/mobile\/jobs\/[^/]+$/, fallback: '/mobile/jobs' },
  { match: /^\/mobile\/jobs$/, fallback: '/mobile' },
  { match: /^\/mobile\/(route|inventory|time|notifications|sync)$/, fallback: '/mobile' },
];

/** Top-level module landing pages — used for last-module memory and layout hints. */
export const MODULE_ROOT_PATHS = new Set([
  '/',
  '/jobs',
  '/crm',
  '/scheduling',
  '/leads',
  '/marketing',
  '/marketing-intelligence',
  '/marketing-agent',
  '/finance-aura-agent',
  '/finance-reporting-forecast',
  '/finance-cashflow-profit',
  '/procurement-intelligence',
  '/stock-forecasting',
  '/social-media-integrations',
  '/finance/quotes',
  '/finance/invoices',
  '/finance/payments',
  '/finance/boq',
  '/procurement',
  '/procurement/suppliers',
  '/inventory/products',
  '/inventory/stock',
  '/inventory-intelligence',
  '/fleet',
  '/documents',
  '/communications/templates',
  '/communications/messages',
  '/automation',
  '/aura',
  '/aura/agents',
  '/aura/command-centre',
  '/aura/evolution',
  '/aura-agent-network',
  '/settings',
  '/integrations',
  '/analytics',
  '/quality',
  '/notifications',
  '/global-search',
  '/dispatch-intelligence',
  '/technician-intelligence',
  '/workflow-automation',
  '/recurring-maintenance',
  '/homeshield-experience',
  '/customer-engagement-intelligence',
  '/fleet-intelligence',
  '/fleet-ai-recommendations',
  '/driver-intelligence',
  '/vehicle-intelligence',
  '/sales-intelligence',
  '/hr-employee-intelligence',
  '/recruitment-performance-intelligence',
  '/payroll-timesheet-intelligence',
  '/workforce-intelligence',
  '/platform',
  '/operations',
  '/mission-control',
  '/knowledge',
  '/digital-twin',
  '/automation-studio',
  '/enterprise-modules',
  '/security',
  '/recruiting',
  '/evolution',
  '/platform-health',
  '/launch-center',
  '/release-center',
  '/go-live',
  '/release',
  '/data-migration',
  '/mobile-platform',
  '/communications-hub',
  '/email-centre',
  '/communication-timeline',
  '/customer-experience',
  '/asset-intelligence',
  '/asset-equipment',
  '/legal-compliance',
  '/financial-planning',
  '/service-delivery',
  '/it-operations',
  '/business-evolution',
  '/app-builder',
  '/industry-packs',
  '/developers',
  '/developer',
  '/saas-management',
  '/voice-reception',
  '/voice-ai-receptionist',
  '/call-intelligence',
  '/sales-intelligence-agent',
  '/sales-followup-intelligence',
  '/document-ai',
  '/business-continuity',
  '/communications-intelligence',
  '/personal-communications-intelligence',
  '/personal-whatsapp-intelligence',
  '/personal-whatsapp-connection',
  '/communication-aura-intelligence',
  '/ai-orchestration',
]);

/** Auth, portal, and other surfaces with custom navigation — never show Titan back. */
export const BACK_BUTTON_EXCLUDED_PREFIXES = [
  '/auth',
  '/my',
  '/portal',
  '/dev/',
];

export const LAST_MODULE_STORAGE_KEY = 'titan:last-module';

export function resolveSmartBackFallback(pathname: string): string {
  for (const entry of PARENT_ROUTE_ENTRIES) {
    if (entry.match.test(pathname)) {
      return typeof entry.fallback === 'function' ? entry.fallback(pathname) : entry.fallback;
    }
  }
  return '/';
}

export function isBackButtonExcluded(pathname: string): boolean {
  if (BACK_BUTTON_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  return false;
}

/** Show back on every staff page except the main dashboard home. */
export function shouldShowBackButton(pathname: string): boolean {
  if (isBackButtonExcluded(pathname)) return false;
  if (pathname === '/') return false;
  return true;
}

export function rememberLastModule(pathname: string): void {
  if (typeof window === 'undefined') return;
  if (pathname === '/' || isBackButtonExcluded(pathname)) return;
  if (MODULE_ROOT_PATHS.has(pathname)) {
    try {
      sessionStorage.setItem(LAST_MODULE_STORAGE_KEY, pathname);
    } catch {
      // ignore quota errors
    }
  }
}

export function readLastModule(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(LAST_MODULE_STORAGE_KEY);
  } catch {
    return null;
  }
}
