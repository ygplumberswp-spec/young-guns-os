export const BUSINESS_RULE_TYPES = [
  { value: 'always_follow', label: 'Always follow' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'approval', label: 'Requires approval' },
] as const;

export type BusinessRuleType = (typeof BUSINESS_RULE_TYPES)[number]['value'];

export const BUSINESS_RULE_CATEGORIES = [
  { value: 'company_wide', label: 'Company-wide' },
  { value: 'finance', label: 'Finance' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operations', label: 'Operations' },
  { value: 'customers', label: 'Customers' },
  { value: 'workforce_payroll', label: 'Workforce & payroll' },
  { value: 'fleet', label: 'Fleet' },
  { value: 'stock_suppliers', label: 'Stock & suppliers' },
  { value: 'compliance', label: 'Compliance' },
] as const;

export type BusinessRuleCategory = (typeof BUSINESS_RULE_CATEGORIES)[number]['value'];

export type BusinessRuleStatus = 'active' | 'paused' | 'archived';

export type BusinessRuleTaskStatus = 'pending' | 'completed' | 'skipped' | 'cancelled';

export type BusinessRuleSummary = {
  id: string;
  name: string;
  department: string | null;
  instruction: string;
  ruleType: BusinessRuleType;
  category: BusinessRuleCategory;
  frequencyCron: string | null;
  assignedAgentRole: string | null;
  approvalRequired: boolean;
  approvalType: string | null;
  status: BusinessRuleStatus;
  nextScheduledAt: string | null;
  lastCompletedAt: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateBusinessRuleRequest = {
  name: string;
  department?: string;
  instruction: string;
  ruleType?: BusinessRuleType;
  category?: BusinessRuleCategory;
  frequencyCron?: string | null;
  assignedAgentRole?: string | null;
  approvalRequired?: boolean;
  approvalType?: string | null;
};

export type UpdateBusinessRuleRequest = {
  name?: string;
  department?: string | null;
  instruction?: string;
  ruleType?: BusinessRuleType;
  category?: BusinessRuleCategory;
  frequencyCron?: string | null;
  assignedAgentRole?: string | null;
  approvalRequired?: boolean;
  approvalType?: string | null;
  status?: BusinessRuleStatus;
};

/** Normalize instruction text for duplicate detection within a tenant. */
export function normalizeBusinessRuleInstruction(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[.!?;,]+$/, '');
}

export function isDuplicateBusinessRule(
  existing: Pick<BusinessRuleSummary, 'instruction'>,
  candidate: string,
): boolean {
  const normalized = normalizeBusinessRuleInstruction(candidate);
  if (!normalized) {
    return false;
  }
  return normalizeBusinessRuleInstruction(existing.instruction) === normalized;
}

export function findDuplicateBusinessRule(
  rules: Array<Pick<BusinessRuleSummary, 'id' | 'instruction'>>,
  candidate: string,
): Pick<BusinessRuleSummary, 'id' | 'instruction'> | null {
  return rules.find((rule) => isDuplicateBusinessRule(rule, candidate)) ?? null;
}

/** Simple schedule matcher — daily, weekly:monday, monthly:25. Full cron deferred. */
export function isBusinessRuleDueOnDate(frequencyCron: string | null | undefined, dateIso: string): boolean {
  if (!frequencyCron?.trim()) {
    return true;
  }

  const normalized = frequencyCron.trim().toLowerCase();
  if (normalized === 'daily') {
    return true;
  }

  const day = Number(dateIso.split('-')[2]);
  const date = new Date(`${dateIso}T12:00:00`);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  if (normalized.startsWith('monthly:')) {
    const targetDay = Number(normalized.slice('monthly:'.length));
    return Number.isFinite(targetDay) && targetDay === day;
  }

  if (normalized.startsWith('weekly:')) {
    const targetWeekday = normalized.slice('weekly:'.length);
    return weekday.startsWith(targetWeekday.slice(0, 3));
  }

  return false;
}
