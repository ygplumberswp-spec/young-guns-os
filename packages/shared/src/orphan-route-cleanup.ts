/**
 * Phase 252 — orphan / NO-GO / scaffold route cleanup registry.
 * Conservative: prefer HIDE_REDIRECT over REMOVE; finance routes untouched.
 */
export type OrphanRouteDisposition = 'RETAIN_COMPLETE' | 'HIDE_REDIRECT' | 'REMOVE';

export type OrphanRoutePriorStatus = 'NO-GO' | 'HOLD' | 'GO';

export type OrphanRouteEntry = {
  /** Exact path, or prefix rule ending with `/*` (matches nested paths only). */
  path: string;
  disposition: OrphanRouteDisposition;
  redirectTo: string;
  priorStatus: OrphanRoutePriorStatus;
  rationale: string;
};

/** Canonical redirect for decorative enterprise scaffolds. */
export const ENTERPRISE_SCAFFOLD_REDIRECT = '/enterprise-modules';

/** Sidebar-linked staff hrefs (Phase 1) — used for orphan counting only. */
export const SIDEBAR_STAFF_HREFS = [
  '/',
  '/crm',
  '/leads',
  '/jobs',
  '/scheduling',
  '/finance/quotes',
  '/finance/invoices',
  '/finance/payments',
  '/finance/receivables',
  '/finance/payables',
  '/finance/cashflow',
  '/mobile-platform/dispatcher',
  '/fleet',
  '/inventory/products',
  '/documents',
  '/communications/messages',
  '/analytics',
  '/marketing',
  '/aura/agents',
  '/automation',
  '/mission-control',
  '/departments',
  '/procurement',
] as const;

function matchesPathRule(rulePath: string, pathname: string): boolean {
  if (rulePath.endsWith('/*')) {
    const prefix = rulePath.slice(0, -1);
    return pathname.startsWith(prefix) && pathname.length > prefix.length;
  }
  return pathname === rulePath;
}

/** Authoritative disposition table @ Phase 252 (55 NO-GO + duplicate removals). */
export const ORPHAN_ROUTE_ENTRIES: OrphanRouteEntry[] = [
  // REMOVE — duplicate aliases (redirect, do not delete page modules)
  {
    path: '/developers',
    disposition: 'REMOVE',
    redirectTo: '/developer',
    priorStatus: 'NO-GO',
    rationale: 'Duplicate entry point for /developer — consolidate deep links',
  },
  {
    path: '/marketing-intelligence',
    disposition: 'REMOVE',
    redirectTo: '/marketing',
    priorStatus: 'NO-GO',
    rationale: 'Duplicate of /marketing — single marketing workspace',
  },

  // HIDE_REDIRECT — enterprise / decorative scaffolds
  {
    path: '/ai-orchestration',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Decorative AI orchestration shell — no operational API',
  },
  {
    path: '/app-builder',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Low-code scaffold — not staging-ready',
  },
  {
    path: '/asset-equipment',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Asset equipment scaffold — mock data only',
  },
  {
    path: '/asset-intelligence',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Asset intelligence scaffold — mock data only',
  },
  {
    path: '/automation-studio',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/automation',
    priorStatus: 'NO-GO',
    rationale: 'Automation designer scaffold — parent /automation is GO',
  },
  {
    path: '/automation/*',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/automation',
    priorStatus: 'NO-GO',
    rationale: 'Workflow detail/create/execution scaffolds — list hub is GO',
  },
  {
    path: '/business-continuity',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Enterprise continuity scaffold',
  },
  {
    path: '/business-evolution',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Enterprise evolution scaffold',
  },
  {
    path: '/customer-experience',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'CX workspace scaffold',
  },
  {
    path: '/data-migration',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Migration tools scaffold',
  },
  {
    path: '/digital-twin',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Digital twin scaffold',
  },
  {
    path: '/dispatch-intelligence',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/mobile-platform/dispatcher',
    priorStatus: 'NO-GO',
    rationale: 'Dispatch insights scaffold — live dispatch console is GO',
  },
  {
    path: '/document-ai',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Document AI scaffold',
  },
  {
    path: '/documents/categories/new',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/documents/categories',
    priorStatus: 'NO-GO',
    rationale: 'Category create scaffold — list route is GO',
  },
  {
    path: '/documents/job-packs/*',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/documents/job-packs',
    priorStatus: 'NO-GO',
    rationale: 'Job pack detail scaffold — list route is GO',
  },
  {
    path: '/drafts',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/',
    priorStatus: 'NO-GO',
    rationale: 'Drafts inbox scaffold',
  },
  {
    path: '/evolution',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Evolution scaffold (duplicate theme)',
  },
  {
    path: '/financial-planning',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Financial planning scaffold — finance ops routes untouched',
  },
  {
    path: '/fleet-intelligence',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/fleet',
    priorStatus: 'NO-GO',
    rationale: 'Fleet analytics scaffold — fleet list/live-map are GO',
  },
  {
    path: '/go-live',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Go-live checklist scaffold',
  },
  {
    path: '/industry-packs',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Industry pack scaffold',
  },
  {
    path: '/inventory/movements',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/inventory/stock',
    priorStatus: 'NO-GO',
    rationale: 'Stock movements scaffold — stock overview is GO',
  },
  {
    path: '/inventory/products/new',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/inventory/products',
    priorStatus: 'NO-GO',
    rationale: 'Product create scaffold — product list is GO',
  },
  {
    path: '/it-operations',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'IT operations scaffold',
  },
  {
    path: '/knowledge',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Knowledge graph scaffold',
  },
  {
    path: '/launch-center',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Launch center scaffold',
  },
  {
    path: '/legal-compliance',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Legal compliance scaffold',
  },
  {
    path: '/notifications',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/',
    priorStatus: 'NO-GO',
    rationale: 'Notifications hub scaffold — settings notifications is HOLD',
  },
  {
    path: '/operations',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Operations overview scaffold',
  },
  {
    path: '/personal-communications-intelligence',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/communications/messages',
    priorStatus: 'NO-GO',
    rationale: 'Personal comms intelligence scaffold — messages hub is HOLD/GO path',
  },
  {
    path: '/platform',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Platform admin scaffold',
  },
  {
    path: '/procurement/parts-requests',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/procurement',
    priorStatus: 'NO-GO',
    rationale: 'Parts requests scaffold — procurement list is GO',
  },
  {
    path: '/procurement/purchase-orders/*',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/procurement',
    priorStatus: 'NO-GO',
    rationale: 'PO detail/create scaffolds — procurement list is GO',
  },
  {
    path: '/procurement/suppliers/*',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/procurement/suppliers',
    priorStatus: 'NO-GO',
    rationale: 'Supplier detail scaffold — supplier list is GO',
  },
  {
    path: '/quality',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Quality module scaffold',
  },
  {
    path: '/recruiting',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Recruiting scaffold',
  },
  {
    path: '/release',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Release scaffold',
  },
  {
    path: '/release-center',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Release center scaffold',
  },
  {
    path: '/saas-management',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'SaaS management scaffold — platform-owner only',
  },
  {
    path: '/sales-intelligence',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Sales intelligence scaffold',
  },
  {
    path: '/security',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/settings/security',
    priorStatus: 'NO-GO',
    rationale: 'Enterprise security scaffold — settings security is HOLD',
  },
  {
    path: '/service-delivery',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Service delivery scaffold',
  },
  {
    path: '/voice-reception',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Voice reception scaffold',
  },
  {
    path: '/developer',
    disposition: 'HIDE_REDIRECT',
    redirectTo: ENTERPRISE_SCAFFOLD_REDIRECT,
    priorStatus: 'NO-GO',
    rationale: 'Developer portal scaffold',
  },
  {
    path: '/workforce-intelligence',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/scheduling',
    priorStatus: 'NO-GO',
    rationale: 'Workforce intelligence scaffold — scheduling is GO',
  },
  {
    path: '/workforce/day-timeline',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/scheduling',
    priorStatus: 'NO-GO',
    rationale: 'Day timeline scaffold — scheduling is GO',
  },
  {
    path: '/workforce/manager',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/scheduling',
    priorStatus: 'NO-GO',
    rationale: 'Manager workspace scaffold',
  },
  {
    path: '/workforce/self-service',
    disposition: 'HIDE_REDIRECT',
    redirectTo: '/scheduling',
    priorStatus: 'NO-GO',
    rationale: 'Self-service workforce scaffold',
  },
];

export type OrphanRouteCleanupDecision =
  | { disposition: 'RETAIN_COMPLETE' }
  | { disposition: 'HIDE_REDIRECT' | 'REMOVE'; redirectTo: string; entry: OrphanRouteEntry };

/** Resolve cleanup action for a staff pathname (exact + prefix rules). */
export function resolveOrphanRouteCleanup(pathname: string): OrphanRouteCleanupDecision {
  const normalized = pathname.split('?')[0]?.split('#')[0] ?? pathname;
  for (const entry of ORPHAN_ROUTE_ENTRIES) {
    if (matchesPathRule(entry.path, normalized)) {
      return {
        disposition: entry.disposition,
        redirectTo: entry.redirectTo,
        entry,
      };
    }
  }
  return { disposition: 'RETAIN_COMPLETE' };
}

export function isSidebarStaffHref(pathname: string): boolean {
  if ((SIDEBAR_STAFF_HREFS as readonly string[]).includes(pathname)) return true;
  for (const href of SIDEBAR_STAFF_HREFS) {
    if (href !== '/' && pathname.startsWith(`${href}/`)) return true;
  }
  return false;
}

export function countOrphanRouteDispositions(): Record<OrphanRouteDisposition, number> {
  const counts: Record<OrphanRouteDisposition, number> = {
    RETAIN_COMPLETE: 0,
    HIDE_REDIRECT: 0,
    REMOVE: 0,
  };
  for (const entry of ORPHAN_ROUTE_ENTRIES) {
    counts[entry.disposition] += 1;
  }
  return counts;
}
