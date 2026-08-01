/**
 * Canonical enterprise UX labels — single source for nav renames and page titles.
 * Phase 1 hardening: premium enterprise naming without route changes.
 */

export const UX_NAV_LABELS = {
  liveDispatch: 'Live Dispatch',
  marketing: 'Marketing',
  auraTeam: 'AURA Team',
  auraExecutiveChat: 'AURA Executive Chat',
  automationCommandCentre: 'Automation Command Centre',
  companyHealth: 'Company Health',
  teamAndAccess: 'Team & Access',
  settings: 'Settings',
  search: 'Search',
} as const;

/** Maps legacy nav labels to canonical labels (for tests and migrations). */
export const UX_NAV_RENAME_MAP: Record<string, string> = {
  'Dispatcher console': UX_NAV_LABELS.liveDispatch,
  'AURA Capabilities': UX_NAV_LABELS.auraTeam,
  'Owner AI Chat': UX_NAV_LABELS.auraExecutiveChat,
  Automations: UX_NAV_LABELS.automationCommandCentre,
  'Mission Control': UX_NAV_LABELS.companyHealth,
  'Users & Access': UX_NAV_LABELS.teamAndAccess,
};

export const UX_INVENTORY_LABELS = {
  products: 'Products',
  stock: 'Stock',
  stockHistory: 'Stock history',
} as const;

export const UX_BREADCRUMB_ROOTS: Record<string, string> = {
  finance: 'Finance',
  jobs: 'Jobs',
  inventory: 'Inventory',
  analytics: 'Analytics',
  settings: 'Settings',
  automation: UX_NAV_LABELS.automationCommandCentre,
  aura: 'AURA',
};
