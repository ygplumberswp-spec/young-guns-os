/**
 * UX-K / UX-048 — deliberate index of Owner enterprise routes that are URL-reachable
 * but were previously absent from primary nav. Listed here so they are not silent orphans.
 */
export type EnterpriseModuleLink = {
  href: string;
  label: string;
  summary: string;
};

export const ENTERPRISE_MODULE_LINKS: EnterpriseModuleLink[] = [
  {
    href: '/sales-intelligence',
    label: 'Sales Intelligence',
    summary: 'Pipeline and sales workspace.',
  },
  {
    href: '/marketing-intelligence',
    label: 'Marketing Intelligence',
    summary: 'Campaign and marketing workspace.',
  },
  {
    href: '/dispatch-intelligence',
    label: 'Dispatch Intelligence',
    summary: 'Advanced dispatch insights.',
  },
  {
    href: '/fleet-intelligence',
    label: 'Fleet Intelligence',
    summary: 'Fleet analytics workspace.',
  },
  {
    href: '/workforce-intelligence',
    label: 'Workforce Intelligence',
    summary: 'Crew and workforce insights.',
  },
  {
    href: '/customer-experience',
    label: 'Customer Experience',
    summary: 'CX and portal experience tools.',
  },
  {
    href: '/service-delivery',
    label: 'Service Delivery',
    summary: 'Delivery operations workspace.',
  },
  {
    href: '/financial-planning',
    label: 'Financial Planning',
    summary: 'Planning and forecast tools.',
  },
  {
    href: '/legal-compliance',
    label: 'Legal & Compliance',
    summary: 'Compliance and legal workspace.',
  },
  {
    href: '/document-ai',
    label: 'Document AI',
    summary: 'Document intelligence tools.',
  },
  {
    href: '/voice-reception',
    label: 'Voice Reception',
    summary: 'Voice reception workspace.',
  },
  {
    href: '/it-operations',
    label: 'IT Operations',
    summary: 'IT operations workspace.',
  },
  {
    href: '/business-evolution',
    label: 'Business Evolution',
    summary: 'Evolution and maturity tools.',
  },
  {
    href: '/business-continuity',
    label: 'Business Continuity',
    summary: 'Continuity and recovery tools.',
  },
  {
    href: '/app-builder',
    label: 'App Builder',
    summary: 'Low-code / app builder surface.',
  },
  {
    href: '/industry-packs',
    label: 'Industry Packs',
    summary: 'Industry pack configuration.',
  },
  {
    href: '/automation-studio',
    label: 'Automation Studio',
    summary: 'Enterprise automation designer.',
  },
  {
    href: '/digital-twin',
    label: 'Digital Twin',
    summary: 'Digital twin workspace.',
  },
  {
    href: '/knowledge',
    label: 'Knowledge Graph',
    summary: 'Knowledge graph workspace.',
  },
  {
    href: '/ai-orchestration',
    label: 'AI Orchestration',
    summary: 'AI orchestration controls.',
  },
  {
    href: '/global-search',
    label: 'Global Search',
    summary: 'Cross-module search.',
  },
  {
    href: '/data-migration',
    label: 'Data Migration',
    summary: 'Import and migration tools.',
  },
  {
    href: '/developers',
    label: 'Developers',
    summary: 'Developer tooling entry.',
  },
  {
    href: '/launch-center',
    label: 'Launch Center',
    summary: 'Launch readiness workspace.',
  },
  {
    href: '/operations',
    label: 'Operations',
    summary: 'Operations overview.',
  },
  {
    href: '/mobile-platform',
    label: 'Mobile Platform',
    summary: 'Mobile platform hub (includes dispatcher console).',
  },
];
