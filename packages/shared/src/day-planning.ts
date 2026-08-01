import type { Recommendation } from './intelligence.js';

export const DAY_PLAN_CATEGORIES = [
  { value: 'marketing', label: 'Marketing', section: 'marketing' },
  { value: 'communications', label: 'Communications', section: 'communications' },
  { value: 'operations', label: 'Operations', section: 'jobs' },
  { value: 'finance', label: 'Finance', section: 'finance' },
  { value: 'other', label: 'Other', section: 'top_priorities' },
] as const;

export type DayPlanCategory = (typeof DAY_PLAN_CATEGORIES)[number]['value'];

export type DayPlanPriority = 'normal' | 'high';

/** Stored statuses — `active` displays as Planned in UI. */
export type DayPlanStatus = 'active' | 'completed' | 'archived';

export type DayPlanSource = 'manual' | 'aura_suggested' | 'business_rule';

export type DayPlanSummary = {
  id: string;
  planDate: string;
  content: string;
  task: string;
  department: string | null;
  category: DayPlanCategory | null;
  priority: DayPlanPriority;
  status: DayPlanStatus;
  assignedUserId: string | null;
  assignedAgentRole: string | null;
  dueTime: string | null;
  progressPct: number;
  approvalRequired: boolean;
  source: DayPlanSource;
  businessRuleId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DayPlanSectionKey =
  | 'top_priorities'
  | 'communications'
  | 'sales'
  | 'marketing'
  | 'jobs'
  | 'finance'
  | 'team'
  | 'completed';

export type DayPlanTodayResponse = {
  planDate: string;
  sections: Record<DayPlanSectionKey, DayPlanSummary[]>;
  summary: {
    completed: number;
    running: number;
    blocked: number;
    approvals: number;
    deadlineRisks: number;
    total: number;
  };
  endOfDayReview: {
    completed: DayPlanSummary[];
    notCompleted: DayPlanSummary[];
  };
};

export type DayPlanMorningSuggestion = {
  task: string;
  department: string | null;
  category: DayPlanCategory | null;
  priority: DayPlanPriority;
  source: 'aura_suggested';
  evidence: string;
};

export type CreateDayPlanRequest = {
  content: string;
  planDate?: string;
  department?: string;
  category?: DayPlanCategory;
  priority?: DayPlanPriority;
  assignedUserId?: string;
  assignedAgentRole?: string;
  dueTime?: string;
  approvalRequired?: boolean;
  source?: DayPlanSource;
  businessRuleId?: string;
};

export type UpdateDayPlanRequest = {
  content?: string;
  department?: string | null;
  category?: DayPlanCategory | null;
  priority?: DayPlanPriority;
  status?: DayPlanStatus;
  assignedUserId?: string | null;
  assignedAgentRole?: string | null;
  dueTime?: string | null;
  progressPct?: number;
  approvalRequired?: boolean;
};

export const DAY_PLAN_INPUT_PLACEHOLDERS = [
  'What must the company focus on today?',
  'Today emails/marketing should be pushed more',
  'Today all WhatsApps should be answered',
] as const;

export const DAY_PLAN_SECTION_LABELS: Record<DayPlanSectionKey, string> = {
  top_priorities: 'Top priorities',
  communications: 'Communications',
  sales: 'Sales',
  marketing: 'Marketing',
  jobs: 'Jobs',
  finance: 'Finance',
  team: 'Team',
  completed: 'Completed today',
};

/** Normalize plan text for duplicate detection within a tenant/day. */
export function normalizeDayPlanText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[.!?;,]+$/, '');
}

export function isDuplicateDayPlan(
  existing: Pick<DayPlanSummary, 'content'>,
  candidate: string,
): boolean {
  const normalizedCandidate = normalizeDayPlanText(candidate);
  if (!normalizedCandidate) {
    return false;
  }
  return normalizeDayPlanText(existing.content) === normalizedCandidate;
}

export function findDuplicateDayPlan(
  plans: Array<Pick<DayPlanSummary, 'id' | 'content'>>,
  candidate: string,
): Pick<DayPlanSummary, 'id' | 'content'> | null {
  return plans.find((plan) => isDuplicateDayPlan(plan, candidate)) ?? null;
}

export function resolveDayPlanSection(
  item: Pick<DayPlanSummary, 'category' | 'department' | 'priority' | 'status'>,
): DayPlanSectionKey {
  if (item.status === 'completed') {
    return 'completed';
  }

  if (item.category) {
    const match = DAY_PLAN_CATEGORIES.find((entry) => entry.value === item.category);
    if (match) {
      return match.section as DayPlanSectionKey;
    }
  }

  const department = item.department?.toLowerCase() ?? '';
  if (department.includes('sales')) return 'sales';
  if (department.includes('market')) return 'marketing';
  if (department.includes('finance')) return 'finance';
  if (department.includes('comm')) return 'communications';
  if (department.includes('team') || department.includes('hr')) return 'team';
  if (department.includes('job') || department.includes('ops')) return 'jobs';

  return item.priority === 'high' ? 'top_priorities' : 'top_priorities';
}

/** Local calendar date YYYY-MM-DD for the browser or Node runtime. */
export function localPlanDateIso(reference = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  const day = String(reference.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDayPlanDisplayDate(planDate: string): string {
  const [year, month, day] = planDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export type DashboardSummaryCounts = {
  jobsToday: number;
  priorities: number;
  followUpsNeedingReview: number;
};

export type DashboardUrgentItem = {
  id: string;
  title: string;
  description: string;
  priority: 'urgent' | 'blocked';
  category: string;
};

export type DashboardSummary = DashboardSummaryCounts & {
  urgentItems: DashboardUrgentItem[];
};

export type DayPlanFollowUpStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'declined'
  | 'assigned'
  | 'completed';

export type DayPlanFollowUpPriority = 'low' | 'medium' | 'high';

export type DayPlanFollowUpItem = {
  id: string;
  customerId: string;
  customerName: string;
  reason: string;
  responsibleAgent: string | null;
  priority: DayPlanFollowUpPriority;
  status: DayPlanFollowUpStatus;
  nextAction: string | null;
  planDate: string;
  isDraftRecommendation: boolean;
  mergedSourceCount: number;
};

export type DayPlanFollowUpAction =
  | 'review'
  | 'edit'
  | 'approve'
  | 'decline'
  | 'assign'
  | 'complete';

export type UpdateDayPlanFollowUpRequest = {
  action: DayPlanFollowUpAction;
  reason?: string;
  nextAction?: string;
  responsibleAgent?: string;
  priority?: DayPlanFollowUpPriority;
  assignedUserId?: string;
};

/** Merge customer follow-up recommendations into one item per customer_id. */
export function dedupeFollowUpRecommendations(
  recommendations: Recommendation[],
): Map<string, Recommendation & { mergedSourceCount: number }> {
  const byCustomer = new Map<string, Recommendation & { mergedSourceCount: number }>();

  for (const recommendation of recommendations) {
    if (recommendation.category !== 'customer_follow_up') {
      continue;
    }

    if (recommendation.entityType !== 'customer' || !recommendation.entityId) {
      continue;
    }

    const existing = byCustomer.get(recommendation.entityId);
    if (!existing) {
      byCustomer.set(recommendation.entityId, { ...recommendation, mergedSourceCount: 1 });
      continue;
    }

    const mergedPriority =
      recommendation.priority === 'high' || existing.priority === 'high'
        ? 'high'
        : recommendation.priority === 'medium' || existing.priority === 'medium'
          ? 'medium'
          : 'low';

    byCustomer.set(recommendation.entityId, {
      ...existing,
      priority: mergedPriority,
      description:
        existing.description === recommendation.description
          ? existing.description
          : `${existing.description} · ${recommendation.description}`,
      mergedSourceCount: existing.mergedSourceCount + 1,
    });
  }

  return byCustomer;
}

export function mapRecommendationPriority(
  priority: Recommendation['priority'],
): DayPlanFollowUpPriority {
  if (priority === 'high') {
    return 'high';
  }
  if (priority === 'low') {
    return 'low';
  }
  return 'medium';
}

export function countFollowUpsNeedingReview(items: Pick<DayPlanFollowUpItem, 'status'>[]): number {
  return items.filter((item) => item.status === 'draft' || item.status === 'pending_review').length;
}

export function buildDashboardSummaryLine(counts: DashboardSummaryCounts): string {
  const parts = [
    `${counts.jobsToday} job${counts.jobsToday === 1 ? '' : 's'} today`,
    `${counts.priorities} priorit${counts.priorities === 1 ? 'y' : 'ies'}`,
    `${counts.followUpsNeedingReview} follow-up${counts.followUpsNeedingReview === 1 ? '' : 's'} need review`,
  ];
  return parts.join(' · ');
}

export function displayDayPlanStatus(status: DayPlanStatus): string {
  if (status === 'active') return 'Planned';
  if (status === 'completed') return 'Completed';
  return 'Archived';
}
