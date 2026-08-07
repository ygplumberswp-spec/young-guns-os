/**
 * Department 21 — Plug-and-play company signup / setup / import wizard.
 * Orchestrates existing company, SaaS plans, team, data-migration, and integration APIs.
 * No demo data. No parallel tenant/import systems.
 */

import type { SaasSubscriptionPlanSummary } from './enterprise-saas-platform.js';

export type SaasOnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'ready'
  | 'active'
  | 'needs_attention';

export type SaasOnboardingStepId =
  | 'company'
  | 'plan'
  | 'team'
  | 'import'
  | 'integrations'
  | 'operations'
  | 'review';

export const SAAS_ONBOARDING_STEPS: Array<{
  id: SaasOnboardingStepId;
  label: string;
  order: number;
}> = [
  { id: 'company', label: 'Company', order: 1 },
  { id: 'plan', label: 'Plan', order: 2 },
  { id: 'team', label: 'Team', order: 3 },
  { id: 'import', label: 'Import', order: 4 },
  { id: 'integrations', label: 'Integrations', order: 5 },
  { id: 'operations', label: 'Operations', order: 6 },
  { id: 'review', label: 'Review', order: 7 },
];

export type SaasOnboardingStepState = 'pending' | 'in_progress' | 'complete' | 'skipped' | 'attention';

export type SaasTradeType =
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'construction'
  | 'maintenance'
  | 'landscaping'
  | 'other';

export const SAAS_TRADE_TYPES: Array<{ value: SaasTradeType; label: string }> = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'construction', label: 'Construction' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'other', label: 'Other trade / service business' },
];

export type SaasOnboardingChecklist = {
  company: SaasOnboardingStepState;
  plan: SaasOnboardingStepState;
  team: SaasOnboardingStepState;
  import: SaasOnboardingStepState;
  integrations: SaasOnboardingStepState;
  operations: SaasOnboardingStepState;
  review: SaasOnboardingStepState;
};

import type { SaasOnboardingPlanBillingState } from './saas-billing-checkout.js';
export type { SaasOnboardingPlanBillingState };

export type SaasOnboardingIntegrationItem = {
  providerKey: string;
  label: string;
  category: string;
  status:
    | 'connected'
    | 'not_connected'
    | 'action_required'
    | 'authorisation_expired'
    | 'syncing'
    | 'error'
    | 'unavailable'
    | 'skipped';
  href: string;
  unavailableReason?: string | null;
};

export type SaasOnboardingImportEntity = {
  entityType: string;
  label: string;
  supported: boolean;
  note?: string;
  latestJobId?: string | null;
  latestStatus?: string | null;
  importedCount?: number;
  failedCount?: number;
  attentionCount?: number;
};

export type SaasOnboardingAuraTip = {
  id: string;
  severity: 'info' | 'warning';
  message: string;
};

export type SaasOnboardingTeamSummary = {
  ownerCount: number;
  adminOfficeCount: number;
  technicianCount: number;
  clientCount: number;
  seats: {
    adminOfficeUsed: number;
    technicianUsed: number;
    totalUsed: number;
    adminOfficeIncluded: number | null;
    technicianIncluded: number | null;
  };
};

export type SaasOnboardingState = {
  companyId: string;
  companyName: string;
  status: SaasOnboardingStatus;
  currentStep: SaasOnboardingStepId;
  checklist: SaasOnboardingChecklist;
  completionPercent: number;
  lastActivityAt: string | null;
  tradeType: SaasTradeType | null;
  plan: SaasSubscriptionPlanSummary | null;
  /** Canonical active plans for selection (from Platform Owner catalog). */
  availablePlans: SaasSubscriptionPlanSummary[];
  planBillingState: SaasOnboardingPlanBillingState;
  team: SaasOnboardingTeamSummary;
  imports: SaasOnboardingImportEntity[];
  integrations: SaasOnboardingIntegrationItem[];
  operationsConfigured: boolean;
  brandingConfigured: boolean;
  reviewReady: boolean;
  attentionRequired: string[];
  auraTips: SaasOnboardingAuraTip[];
  /** Platform Owner metadata only — never grants cross-tenant business content. */
  platformMetadata?: {
    createdAt: string;
    integrationsConnectedCount: number;
    importAttentionCount: number;
  };
};

export type SaasOnboardingCompanyDetailsInput = {
  companyName: string;
  tradingName?: string | null;
  registrationNumber?: string | null;
  vatNumber?: string | null;
  mainPhone?: string | null;
  mainEmail?: string | null;
  website?: string | null;
  country?: string | null;
  timezone?: string | null;
  currency?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  tradeType?: SaasTradeType | null;
  logoUrl?: string | null;
};

export type SaasOnboardingSelectPlanInput = {
  planId: string;
};

export type SaasOnboardingInviteInput = {
  email: string;
  roleId: string;
  firstName?: string;
  lastName?: string;
  mobile?: string | null;
  payrollSetup?: {
    monthlySalaryCents: number;
    effectiveFrom: string;
    workingDaysPerWeek?: number;
    workingHoursPerDay?: number;
    overtimeDailyThresholdHours?: number;
    overtimeMultiplierBps?: number;
  } | null;
};

export type SaasOnboardingOperationsInput = {
  timezone?: string | null;
  currency?: string | null;
  workingDays?: string[] | null;
  operatingHoursStart?: string | null;
  operatingHoursEnd?: string | null;
  technicianStandardStartTime?: string | null;
  defaultVatEnabled?: boolean | null;
  notificationPreferences?: Record<string, unknown> | null;
};

export type SaasOnboardingSkipIntegrationInput = {
  providerKey: string;
  reason?: string | null;
};

export type SaasOnboardingAdvanceInput = {
  step: SaasOnboardingStepId;
  markComplete?: boolean;
  markSkipped?: boolean;
};

export function defaultOnboardingChecklist(): SaasOnboardingChecklist {
  return {
    company: 'pending',
    plan: 'pending',
    team: 'pending',
    import: 'pending',
    integrations: 'pending',
    operations: 'pending',
    review: 'pending',
  };
}

export function computeOnboardingCompletionPercent(checklist: SaasOnboardingChecklist): number {
  const values = Object.values(checklist);
  if (values.length === 0) return 0;
  const done = values.filter((state) => state === 'complete' || state === 'skipped').length;
  return Math.round((done / values.length) * 100);
}

/** Entities the wizard surfaces — only those with safe canonical import execute support. */
export const SAAS_ONBOARDING_IMPORT_ENTITIES: SaasOnboardingImportEntity[] = [
  { entityType: 'customer', label: 'Customers', supported: true },
  {
    entityType: 'property',
    label: 'Properties / Sites',
    supported: true,
    note: 'Safe historical site import with customer match + duplicate review.',
  },
  {
    entityType: 'contact',
    label: 'Contacts',
    supported: true,
    note: 'Links onto the customer contact fields (no separate contacts archive).',
  },
  { entityType: 'supplier', label: 'Suppliers', supported: true },
  {
    entityType: 'inventory',
    label: 'Inventory / Materials',
    supported: true,
    note: 'Physical stock on hand only — not services, labour, or direct purchases.',
  },
  {
    entityType: 'price_book',
    label: 'Price Book',
    supported: true,
    note: 'Catalogue sell prices only — never creates stock on hand; does not overwrite current pricing on match.',
  },
  {
    entityType: 'job',
    label: 'Jobs',
    supported: true,
    note: 'Historical jobs retain original job numbers and feed one Job 360 archive.',
  },
  {
    entityType: 'quote',
    label: 'Quotes',
    supported: true,
    note: 'Preserves original quote numbers; prefers existing Xero-imported quotes when matched.',
  },
  {
    entityType: 'invoice',
    label: 'Invoices',
    supported: true,
    note: 'Preserves original invoice numbers; prefers existing Xero-imported invoices when matched.',
  },
];

export const SAAS_ONBOARDING_INTEGRATION_CATALOG: Array<{
  providerKey: string;
  label: string;
  category: string;
  href: string;
}> = [
  { providerKey: 'xero', label: 'Xero', category: 'Accounting', href: '/integrations/xero' },
  { providerKey: 'yoco', label: 'Yoco', category: 'Payments', href: '/integrations/yoco' },
  {
    providerKey: 'google_maps',
    label: 'Google Maps',
    category: 'Maps',
    href: '/integrations/google-maps',
  },
  { providerKey: 'cartrack', label: 'Cartrack', category: 'Fleet', href: '/integrations/cartrack' },
  {
    providerKey: 'gmail',
    label: 'Gmail',
    category: 'Email',
    href: '/communications-hub',
  },
  {
    providerKey: 'whatsapp',
    label: 'WhatsApp Business',
    category: 'Communications',
    href: '/integrations/whatsapp',
  },
];
