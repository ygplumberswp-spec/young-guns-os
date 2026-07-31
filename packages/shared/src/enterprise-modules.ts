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
    label: 'Sales intelligence',
    summary: 'Pipeline and sales workspace.',
  },
  {
    href: '/marketing-intelligence',
    label: 'Marketing intelligence',
    summary: 'Campaign and marketing workspace.',
  },
  {
    href: '/dispatch-intelligence',
    label: 'Dispatch intelligence',
    summary: 'Advanced dispatch insights.',
  },
  {
    href: '/fleet-intelligence',
    label: 'Fleet intelligence',
    summary: 'Fleet analytics workspace.',
  },
  {
    href: '/workforce-intelligence',
    label: 'Workforce intelligence',
    summary: 'Crew and workforce insights.',
  },
  {
    href: '/customer-experience',
    label: 'Customer experience',
    summary: 'CX and portal experience tools.',
  },
  {
    href: '/service-delivery',
    label: 'Service delivery',
    summary: 'Delivery operations workspace.',
  },
  {
    href: '/financial-planning',
    label: 'Financial planning',
    summary: 'Planning and forecast tools.',
  },
  {
    href: '/legal-compliance',
    label: 'Legal & compliance',
    summary: 'Compliance and legal workspace.',
  },
  {
    href: '/document-ai',
    label: 'Document AI',
    summary: 'Document intelligence tools.',
  },
  {
    href: '/voice-reception',
    label: 'Voice reception',
    summary: 'Voice reception workspace.',
  },
  {
    href: '/it-operations',
    label: 'IT operations',
    summary: 'IT operations workspace.',
  },
  {
    href: '/business-evolution',
    label: 'Business evolution',
    summary: 'Evolution and maturity tools.',
  },
  {
    href: '/business-continuity',
    label: 'Business continuity',
    summary: 'Continuity and recovery tools.',
  },
  {
    href: '/app-builder',
    label: 'App builder',
    summary: 'Low-code / app builder surface.',
  },
  {
    href: '/industry-packs',
    label: 'Industry packs',
    summary: 'Industry pack configuration.',
  },
  {
    href: '/automation-studio',
    label: 'Automation studio',
    summary: 'Enterprise automation designer.',
  },
  {
    href: '/digital-twin',
    label: 'Digital twin',
    summary: 'Digital twin workspace.',
  },
  {
    href: '/knowledge',
    label: 'Knowledge graph',
    summary: 'Knowledge graph workspace.',
  },
  {
    href: '/ai-orchestration',
    label: 'AI orchestration',
    summary: 'AI orchestration controls.',
  },
  {
    href: '/global-search',
    label: 'Global search',
    summary: 'Cross-module search.',
  },
  {
    href: '/data-migration',
    label: 'Data migration',
    summary: 'Import and migration tools.',
  },
  {
    href: '/developers',
    label: 'Developers',
    summary: 'Developer tooling entry.',
  },
  {
    href: '/launch-center',
    label: 'Launch center',
    summary: 'Launch readiness workspace.',
  },
  {
    href: '/operations',
    label: 'Operations',
    summary: 'Operations overview.',
  },
  {
    href: '/mobile-platform',
    label: 'Mobile platform',
    summary: 'Mobile platform hub (includes dispatcher console).',
  },
];
