import type { ScheduledJobEvent } from './scheduling.js';

export type IntelligenceGreeting = {
  message: string;
  generatedAt: string;
};

export type IntelligenceDashboard = {
  greeting: IntelligenceGreeting;
  todaysJobs: {
    count: number;
    items: Array<{
      id: string;
      title: string;
      status: string;
      customerName: string;
      scheduledAt: string | null;
    }>;
  };
  upcomingSchedule: {
    count: number;
    items: ScheduledJobEvent[];
  };
  revenue: {
    revenueMtdCents: number;
    currency: string;
    openQuoteCount: number;
    invoiceCount: number;
    paymentCount: number;
  };
  outstandingInvoices: {
    count: number;
    totalOutstandingCents: number;
    currency: string;
    items: Array<{
      id: string;
      invoiceNumber: string;
      customerName: string;
      status: string;
      amountCents: number;
      amountPaidCents: number;
      dueDate: string | null;
    }>;
  };
  customerFollowUps: {
    count: number;
    items: Array<{
      id: string;
      name: string;
      lastActivityAt: string | null;
      daysSinceContact: number | null;
    }>;
  };
  pendingApprovals: {
    count: number;
    agentTaskCount: number;
    workflowStepCount: number;
    whatsappDraftCount: number;
  };
  automationFailures: {
    count: number;
    items: Array<{
      id: string;
      workflowName: string | null;
      triggerEvent: string;
      errorMessage: string | null;
      startedAt: string;
    }>;
  };
  fleetIssues: {
    count: number;
    items: Array<{
      id: string;
      name: string;
      status: string;
      licensePlate: string;
    }>;
  };
  lowStockCount: number;
  schedulingConflicts: number;
};

export type RecommendationCategory =
  | 'customer_follow_up'
  | 'invoice_payment'
  | 'inventory'
  | 'fleet'
  | 'scheduling'
  | 'automation'
  | 'recruiting'
  | 'general';

export type RecommendationPriority = 'low' | 'medium' | 'high';

export type Recommendation = {
  id: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  description: string;
  actionHint: string | null;
  entityType: string | null;
  entityId: string | null;
};

export type RecommendationsResponse = {
  recommendations: Recommendation[];
  generatedAt: string;
};

export type AuraMemoryCategory = 'business_rule' | 'preference' | 'process' | 'note';

export const AURA_MEMORY_CATEGORY_OPTIONS: Array<{ value: AuraMemoryCategory; label: string }> = [
  { value: 'business_rule', label: 'Business rule' },
  { value: 'preference', label: 'Preference' },
  { value: 'process', label: 'Process' },
  { value: 'note', label: 'Note' },
];

export type AuraMemorySummary = {
  id: string;
  category: AuraMemoryCategory;
  information: string;
  importance: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAuraMemoryRequest = {
  category?: AuraMemoryCategory;
  information: string;
  importance?: number;
};

export type UpdateAuraMemoryRequest = {
  category?: AuraMemoryCategory;
  information?: string;
  importance?: number;
};
