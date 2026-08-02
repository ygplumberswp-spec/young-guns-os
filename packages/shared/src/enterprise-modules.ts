/**
 * UX-K / Phase 252 — enterprise module index links only to RETAIN_COMPLETE orphan routes.
 * Decorative NO-GO scaffolds redirect via `orphan-route-cleanup` guard.
 */
export type EnterpriseModuleLink = {
  href: string;
  label: string;
  summary: string;
};

export const ENTERPRISE_MODULE_LINKS: EnterpriseModuleLink[] = [
  {
    href: '/mobile-platform',
    label: 'Mobile platform',
    summary: 'Mobile platform hub and dispatcher console.',
  },
  {
    href: '/communications-hub',
    label: 'Communications hub',
    summary: 'Unified communications workspace (Phase 9).',
  },
  {
    href: '/global-search',
    label: 'Global search',
    summary: 'Cross-module search and entity drill-down.',
  },
];
