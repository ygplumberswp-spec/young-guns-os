import type { MissionControlModuleSnapshot, MissionControlRecommendationSummary } from '@titan/shared';

export type CompanyHealthFocusArea = {
  id: string;
  label: string;
  modules: string[];
  manageHref: string;
  impactHint: string;
};

/** Owner-facing business health focus areas — excludes platform/technical modules. */
export const COMPANY_HEALTH_FOCUS_AREAS: CompanyHealthFocusArea[] = [
  {
    id: 'cash_flow',
    label: 'Cash flow',
    modules: ['finance'],
    manageHref: '/finance/invoices',
    impactHint: 'Affects billing, collections, and working capital.',
  },
  {
    id: 'jobs_delivery',
    label: 'Jobs & service delivery',
    modules: ['jobs', 'service_delivery', 'dispatch', 'operations'],
    manageHref: '/jobs',
    impactHint: 'Affects customer commitments and field capacity.',
  },
  {
    id: 'customers_leads',
    label: 'Customers & leads',
    modules: ['customers', 'sales_intelligence', 'sales', 'crm'],
    manageHref: '/leads',
    impactHint: 'Affects pipeline, conversion, and repeat business.',
  },
  {
    id: 'team_performance',
    label: 'Team performance',
    modules: ['workforce', 'technicians', 'aura'],
    manageHref: '/settings/team',
    impactHint: 'Affects scheduling load, quality, and response times.',
  },
  {
    id: 'fleet',
    label: 'Fleet',
    modules: ['fleet'],
    manageHref: '/fleet',
    impactHint: 'Affects travel time, fuel cost, and on-site reliability.',
  },
  {
    id: 'stock',
    label: 'Stock',
    modules: ['inventory'],
    manageHref: '/inventory/products',
    impactHint: 'Affects job completion and emergency call-outs.',
  },
  {
    id: 'compliance',
    label: 'Compliance',
    modules: ['security', 'legal_compliance'],
    manageHref: '/security',
    impactHint: 'Affects audit readiness and operational risk.',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    modules: ['integrations'],
    manageHref: '/integrations',
    impactHint: 'Affects data sync with Xero, payments, and third-party tools.',
  },
];

const TECHNICAL_MODULES = new Set([
  'knowledge_graph',
  'digital_twin',
  'developer_platform',
  'public_developer_platform',
  'data_migration',
  'release_management',
  'production_launch',
  'release_center',
  'launch_center',
  'industry_packs',
  'saas_management',
  'business_continuity',
  'app_builder',
  'platform_health',
  'it_operations',
  'business_evolution',
  'document_ai',
  'global_search',
  'notifications',
  'voice_reception',
  'marketing_intelligence',
]);

export function isTechnicalModule(module: string): boolean {
  return TECHNICAL_MODULES.has(module) || module.startsWith('tenant_capability:');
}

export function resolveFocusAreaSnapshot(
  area: CompanyHealthFocusArea,
  snapshots: MissionControlModuleSnapshot[],
): MissionControlModuleSnapshot | null {
  for (const moduleKey of area.modules) {
    const match = snapshots.find((s) => s.module === moduleKey);
    if (match) return match;
  }
  return null;
}

export function findAreaRecommendation(
  area: CompanyHealthFocusArea,
  recommendations: MissionControlRecommendationSummary[],
): MissionControlRecommendationSummary | null {
  const haystack = area.label.toLowerCase();
  return (
    recommendations.find((rec) => {
      const text = `${rec.title} ${rec.recommendation}`.toLowerCase();
      return area.modules.some((m) => text.includes(m.replace(/_/g, ' '))) || text.includes(haystack);
    }) ?? recommendations.find((rec) => rec.status === 'pending') ??
    null
  );
}

export function businessImpactForStatus(status: string, impactHint: string): string {
  if (status === 'critical' || status === 'attention_required') {
    return `Immediate attention required. ${impactHint}`;
  }
  if (status === 'warning') {
    return `Monitor closely. ${impactHint}`;
  }
  if (status === 'healthy') {
    return `Operating normally. ${impactHint}`;
  }
  return impactHint;
}
