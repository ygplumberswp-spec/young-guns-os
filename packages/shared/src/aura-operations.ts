/** AURA Operations Manager — morning/evening summaries from real tenant aggregates only. */

export type AuraOperationsSourceRef = {
  source: string;
  recordIds?: string[];
  count?: number;
  href?: string;
};

export type AuraOperationsRecommendation = {
  id: string;
  reason: string;
  sourceRecords: AuraOperationsSourceRef[];
  impact: string;
  proposedAction: string;
  approvalRequired: boolean;
  priority: 'critical' | 'high' | 'normal';
  href?: string;
};

export type AuraOperationsOwnerAction = {
  id: string;
  title: string;
  count: number;
  href: string;
  priority: 'critical' | 'high' | 'normal';
};

export type AuraOperationsMorningSummary = {
  period: 'morning';
  generatedAt: string;
  jobsToday: number | null;
  unassignedWork: number | null;
  attendance: {
    working: number | null;
    late: number | null;
    missingCheckIn: number | null;
  };
  delays: number | null;
  cashDueCents: number | null;
  overdueDebtors: {
    count: number | null;
    amountCents: number | null;
    currency: string;
  };
  billsDue: {
    count: number | null;
    amountCents: number | null;
    available: boolean;
    currency: string;
  };
  leadFollowUps: number | null;
  quoteFollowUps: number | null;
  stockBlockers: number | null;
  fleetAlerts: number | null;
  missingDocuments: number | null;
  approvals: number | null;
  topOwnerActions: AuraOperationsOwnerAction[];
};

export type AuraOperationsEndOfDaySummary = {
  period: 'end-of-day';
  generatedAt: string;
  jobsCompleted: number | null;
  jobsCarriedOver: number | null;
  invoicedRevenueCents: number | null;
  cashReceivedCents: number | null;
  currency: string;
  overdueChanges: {
    currentCount: number | null;
    currentAmountCents: number | null;
    countDelta: number | null;
    amountCentsDelta: number | null;
    note: string;
  };
  hoursWorked: number | null;
  overtimeHours: number | null;
  missingCloseOut: number | null;
  tomorrowRisks: Array<{
    id: string;
    title: string;
    description: string;
    href?: string;
  }>;
};

export type AuraOperationsSummary = {
  generatedAt: string;
  morning: AuraOperationsMorningSummary;
  endOfDay: AuraOperationsEndOfDaySummary;
  recommendations: AuraOperationsRecommendation[];
  dataSources: string[];
};

export function formatAuraOperationsMetric(value: number | null, suffix = ''): string {
  if (value === null) {
    return '—';
  }
  return `${value}${suffix}`;
}
