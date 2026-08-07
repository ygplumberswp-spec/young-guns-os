/**
 * AURA-TRAIN-001 — Canonical source-of-truth, role access, and tool-class contracts.
 * AURA must consume these authorities; it must not invent competing finance/ops truth.
 */

import type { AiRoutingCategory } from './ai-orchestration.js';

export type AuraToolClass = 'read' | 'draft' | 'approval_required' | 'execute';

export type AuraTruthCompleteness =
  | 'verified'
  | 'provisional'
  | 'incomplete'
  | 'unavailable';

export type AuraSourceOfTruthDomain =
  | 'customers'
  | 'properties'
  | 'jobs'
  | 'quotes_invoices'
  | 'payments'
  | 'job_profitability'
  | 'cash'
  | 'owner_finance'
  | 'budget'
  | 'growth'
  | 'bank_evidence'
  | 'fleet'
  | 'communications'
  | 'documents'
  | 'workforce'
  | 'brand_profile';

export type AuraSourceOfTruthEntry = {
  domain: AuraSourceOfTruthDomain;
  authority: string;
  serviceOrModule: string;
  notes: string;
  ownerAccess: boolean;
  adminAccess: boolean;
  technicianAccess: 'assigned_work_only' | 'none';
  clientAccess: 'own_records_only' | 'none';
};

/** Canonical registry — do not invent parallel calculation engines in prompts. */
export const AURA_SOURCE_OF_TRUTH_REGISTRY: readonly AuraSourceOfTruthEntry[] = [
  {
    domain: 'customers',
    authority: 'CRM',
    serviceOrModule: 'CrmService',
    notes: 'Customer list/profile authority',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'assigned_work_only',
    clientAccess: 'own_records_only',
  },
  {
    domain: 'properties',
    authority: 'Property / CRM property records',
    serviceOrModule: 'CrmService / Property intelligence',
    notes: 'Site/property authority for authorised actors',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'assigned_work_only',
    clientAccess: 'own_records_only',
  },
  {
    domain: 'jobs',
    authority: 'Jobs / Dispatch',
    serviceOrModule: 'JobsService / SchedulingService',
    notes: 'Job status, assignment, schedule',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'assigned_work_only',
    clientAccess: 'own_records_only',
  },
  {
    domain: 'quotes_invoices',
    authority: 'Finance document engine',
    serviceOrModule: 'FinanceService / Document engine',
    notes: 'Quotes and invoices — never invent balances',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'none',
    clientAccess: 'own_records_only',
  },
  {
    domain: 'payments',
    authority: 'Payments / Xero sync (when connected)',
    serviceOrModule: 'FinanceService / XeroSyncService',
    notes: 'Recognised payments only from stored records',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'none',
    clientAccess: 'own_records_only',
  },
  {
    domain: 'job_profitability',
    authority: 'JPE',
    serviceOrModule: 'ProfitAnalyticsService / JobCostControlService',
    notes: 'Known gross profit from JPE snapshots — incomplete ≠ zero',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'none',
    clientAccess: 'none',
  },
  {
    domain: 'cash',
    authority: 'CASH-001',
    serviceOrModule: 'CashControlService',
    notes: 'Cash in/out and unexplained amounts; bank evidence dependent',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'none',
    clientAccess: 'none',
  },
  {
    domain: 'owner_finance',
    authority: 'FIN-001 Owner Financial Command',
    serviceOrModule: 'OwnerFinancialCommandService',
    notes: 'Composes CASH + JPE + receivables — no second ledger',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'none',
    clientAccess: 'none',
  },
  {
    domain: 'budget',
    authority: 'FIN-004 Budget Control',
    serviceOrModule: 'BudgetControlService',
    notes: 'Budget vs actual from approved plans',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'none',
    clientAccess: 'none',
  },
  {
    domain: 'growth',
    authority: 'GROWTH-001',
    serviceOrModule: 'GrowthPlannerService',
    notes: 'Jobs required / target status — live source backed',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'none',
    clientAccess: 'none',
  },
  {
    domain: 'bank_evidence',
    authority: 'BANK',
    serviceOrModule: 'BankTransactionControlService',
    notes: 'Bank rows are evidence; no connection ≠ zero spending',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'none',
    clientAccess: 'none',
  },
  {
    domain: 'fleet',
    authority: 'Cartrack / TITAN stored positions',
    serviceOrModule: 'FleetService / FleetIntelligenceService',
    notes: 'Stale/unavailable GPS must be stated honestly',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'assigned_work_only',
    clientAccess: 'none',
  },
  {
    domain: 'communications',
    authority: 'Communications Hub',
    serviceOrModule: 'CommunicationsPlatformService / WhatsappService',
    notes: 'Draft → Approve → Execute; never silent send',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'assigned_work_only',
    clientAccess: 'own_records_only',
  },
  {
    domain: 'documents',
    authority: 'Document engine',
    serviceOrModule: 'DocumentsService',
    notes: 'Metadata/authority only — no OCR/BANK-003 in AURA-TRAIN',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'assigned_work_only',
    clientAccess: 'own_records_only',
  },
  {
    domain: 'workforce',
    authority: 'Workforce / time',
    serviceOrModule: 'WorkforceService / MobileWorkforceService',
    notes: 'Technicians see own time/jobs only',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'assigned_work_only',
    clientAccess: 'none',
  },
  {
    domain: 'brand_profile',
    authority: 'Company preferences / future Brand Profile',
    serviceOrModule: 'Company preferences.aiTone + notes (Creative Studio later)',
    notes: 'Groundwork only — no campaign generation in AURA-TRAIN-001',
    ownerAccess: true,
    adminAccess: true,
    technicianAccess: 'none',
    clientAccess: 'none',
  },
] as const;

export type AuraRoleAccessRole = 'Owner' | 'Admin' | 'Technician' | 'Client';

export type AuraRoleAccessRule = {
  role: AuraRoleAccessRole;
  mayAccessCompanyFinance: boolean;
  mayAccessOwnerDashboards: boolean;
  mayAccessCrmLists: boolean;
  mayAccessIntegrations: boolean;
  jobScope: 'company' | 'assigned_only' | 'own_client_only' | 'none';
  communicationsPolicy: 'draft_approve_execute' | 'field_notes_only' | 'own_thread_only' | 'none';
};

export const AURA_ROLE_ACCESS_MATRIX: readonly AuraRoleAccessRule[] = [
  {
    role: 'Owner',
    mayAccessCompanyFinance: true,
    mayAccessOwnerDashboards: true,
    mayAccessCrmLists: true,
    mayAccessIntegrations: true,
    jobScope: 'company',
    communicationsPolicy: 'draft_approve_execute',
  },
  {
    role: 'Admin',
    mayAccessCompanyFinance: true,
    mayAccessOwnerDashboards: false,
    mayAccessCrmLists: true,
    mayAccessIntegrations: true,
    jobScope: 'company',
    communicationsPolicy: 'draft_approve_execute',
  },
  {
    role: 'Technician',
    mayAccessCompanyFinance: false,
    mayAccessOwnerDashboards: false,
    mayAccessCrmLists: false,
    mayAccessIntegrations: false,
    jobScope: 'assigned_only',
    communicationsPolicy: 'field_notes_only',
  },
  {
    role: 'Client',
    mayAccessCompanyFinance: false,
    mayAccessOwnerDashboards: false,
    mayAccessCrmLists: false,
    mayAccessIntegrations: false,
    jobScope: 'own_client_only',
    communicationsPolicy: 'own_thread_only',
  },
] as const;

export function getAuraRoleAccessRule(roleName: string): AuraRoleAccessRule | null {
  const normalized = roleName.trim();
  if (normalized === 'Owner' || normalized === 'Platform Owner' || normalized === 'Company Owner') {
    return AURA_ROLE_ACCESS_MATRIX.find((r) => r.role === 'Owner') ?? null;
  }
  if (normalized === 'Admin' || normalized === 'Office' || normalized === 'Dispatcher') {
    return AURA_ROLE_ACCESS_MATRIX.find((r) => r.role === 'Admin') ?? null;
  }
  if (normalized === 'Technician') {
    return AURA_ROLE_ACCESS_MATRIX.find((r) => r.role === 'Technician') ?? null;
  }
  if (normalized === 'Client') {
    return AURA_ROLE_ACCESS_MATRIX.find((r) => r.role === 'Client') ?? null;
  }
  return null;
}

/** Technician forbidden prompt themes — server policies must match. */
export const AURA_TECHNICIAN_FORBIDDEN_TOPICS: readonly RegExp[] = [
  /\b(profit|margin|payroll|wage|salary|bank transaction|owner dashboard|cash control|operating profit|budget|growth planner|sales pipeline|crm list|customer database|integration settings)\b/i,
];

export function isTechnicianForbiddenAuraTopic(message: string): boolean {
  return AURA_TECHNICIAN_FORBIDDEN_TOPICS.some((pattern) => pattern.test(message));
}

export type AuraEntityMatch = {
  id: string;
  label: string;
  kind: 'customer' | 'job' | 'invoice' | 'vehicle' | 'payment';
};

export type AuraEntityResolution =
  | { status: 'none'; query: string }
  | { status: 'unique'; query: string; match: AuraEntityMatch }
  | { status: 'ambiguous'; query: string; candidates: AuraEntityMatch[] };

/** Never guess — unique or ask. */
export function resolveAuraEntityMatches(
  query: string,
  matches: readonly AuraEntityMatch[],
): AuraEntityResolution {
  const trimmed = query.trim();
  if (!trimmed || matches.length === 0) {
    return { status: 'none', query: trimmed };
  }
  if (matches.length === 1) {
    return { status: 'unique', query: trimmed, match: matches[0]! };
  }
  return { status: 'ambiguous', query: trimmed, candidates: [...matches] };
}

/**
 * Extract a likely customer/job name from Owner/Admin phrasing.
 * Returns null when no entity probe is warranted.
 */
export function extractAuraEntityQuery(message: string): string | null {
  const text = message.trim();
  if (!text) return null;

  const possessive = text.match(
    /\b(?:with|about|for|on)\s+([A-Za-z][A-Za-z'’-]+(?:\s+[A-Za-z][A-Za-z'’-]+){0,2})(?:'s)?\s+(?:job|jobs|quote|invoice|account|property)\b/i,
  );
  if (possessive?.[1]) {
    return possessive[1].replace(/'s$/i, '').trim();
  }

  const namedCustomer = text.match(
    /\b(?:customer|client|account)\s+([A-Za-z][A-Za-z0-9'’.\-]+(?:\s+[A-Za-z][A-Za-z0-9'’.\-]+){0,2})\b/i,
  );
  if (namedCustomer?.[1]) {
    const candidate = namedCustomer[1].trim();
    if (!/^(the|my|our|this|that|a|an)$/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function mapCashCompletenessToAuraTruth(
  completeness: string | null | undefined,
): AuraTruthCompleteness {
  const value = (completeness ?? '').toUpperCase();
  if (value === 'VERIFIED' || value === 'COMPLETE') return 'verified';
  if (value === 'PROVISIONAL') return 'provisional';
  if (value === 'INCOMPLETE' || value === 'PARTIAL') return 'incomplete';
  if (!value) return 'unavailable';
  return 'incomplete';
}

export function classifyAuraToolClass(input: {
  toolKey: string;
  requiresApproval?: boolean;
  executable?: boolean;
}): AuraToolClass {
  const key = input.toolKey.toLowerCase();
  if (input.requiresApproval) {
    if (key.startsWith('draft_') || key.includes('draft')) return 'draft';
    return 'approval_required';
  }
  if (
    key.startsWith('read_') ||
    key.startsWith('search_') ||
    key.startsWith('analyze_') ||
    key.startsWith('summarize_') ||
    key.startsWith('score_') ||
    key.startsWith('validate_') ||
    key.startsWith('simulate_')
  ) {
    return 'read';
  }
  if (input.executable === false) return 'read';
  return 'execute';
}

/** Prefer business_analysis for finance/ops; summarization only for overview. */
export function resolveAuraRoutingCategory(domains: readonly string[]): AiRoutingCategory {
  if (domains.some((d) => d === 'ownerFinance' || d === 'finance' || d === 'financeIntelligence')) {
    return 'business_analysis';
  }
  if (domains.some((d) => d === 'jobs' || d === 'scheduling' || d === 'fleet' || d === 'dispatchIntelligence')) {
    return 'business_analysis';
  }
  if (domains.some((d) => d === 'sales' || d === 'leads' || d === 'crm')) {
    return 'business_analysis';
  }
  if (domains.length <= 1 && domains[0] === 'agents') {
    return 'summarization';
  }
  return 'business_analysis';
}
