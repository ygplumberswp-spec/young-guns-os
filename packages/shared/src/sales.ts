export type SalesOpportunityStatus = 'open' | 'won' | 'lost' | 'on_hold';

export type SalesOpportunitySource = 'manual' | 'detected' | 'quote' | 'job' | 'customer';

export type SalesOpportunityType =
  | 'recurring_service'
  | 'unconverted_quote'
  | 'incomplete_work'
  | 'maintenance_due'
  | 'high_value_customer'
  | 'follow_up'
  | 'custom';

export type SalesActivityType =
  'call' | 'email' | 'meeting' | 'follow_up' | 'quote_sent' | 'note' | 'other';

export type SalesRecommendationType =
  | 'follow_up'
  | 'quote_conversion'
  | 'maintenance'
  | 'recurring_service'
  | 'high_value'
  | 'engagement';

export type SalesRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export const SALES_OPPORTUNITY_STATUS_OPTIONS: Array<{
  value: SalesOpportunityStatus;
  label: string;
}> = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'on_hold', label: 'On Hold' },
];

export const SALES_OPPORTUNITY_TYPE_OPTIONS: Array<{ value: SalesOpportunityType; label: string }> =
  [
    { value: 'recurring_service', label: 'Recurring Service' },
    { value: 'unconverted_quote', label: 'Unconverted Quote' },
    { value: 'incomplete_work', label: 'Incomplete Work' },
    { value: 'maintenance_due', label: 'Maintenance Due' },
    { value: 'high_value_customer', label: 'High Value Customer' },
    { value: 'follow_up', label: 'Follow-Up' },
    { value: 'custom', label: 'Custom' },
  ];

export const SALES_ACTIVITY_TYPE_OPTIONS: Array<{ value: SalesActivityType; label: string }> = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'quote_sent', label: 'Quote Sent' },
  { value: 'note', label: 'Note' },
  { value: 'other', label: 'Other' },
];

export type SalesPipelineStageSummary = {
  id: string;
  stageKey: string;
  name: string;
  sortOrder: number;
  probabilityPercent: number;
  isClosedWon: boolean;
  isClosedLost: boolean;
  opportunityCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SalesOpportunitySummary = {
  id: string;
  customerId: string;
  customerName: string | null;
  stageId: string | null;
  stageName: string | null;
  opportunityType: SalesOpportunityType;
  source: SalesOpportunitySource;
  status: SalesOpportunityStatus;
  title: string;
  description: string | null;
  estimatedValueCents: number | null;
  currency: string;
  quoteId: string | null;
  jobId: string | null;
  assignedUserId: string | null;
  createdByUserId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesActivitySummary = {
  id: string;
  opportunityId: string | null;
  customerId: string;
  customerName: string | null;
  activityType: SalesActivityType;
  subject: string | null;
  body: string;
  authorUserId: string;
  authorName: string | null;
  occurredAt: string;
  createdAt: string;
};

export type SalesRecommendationSummary = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  recommendationType: SalesRecommendationType;
  title: string;
  description: string;
  priority: string;
  status: SalesRecommendationStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type DetectedSalesOpportunity = {
  opportunityType: SalesOpportunityType;
  customerId: string;
  customerName: string;
  title: string;
  description: string;
  estimatedValueCents: number | null;
  currency: string;
  quoteId: string | null;
  jobId: string | null;
  priority: 'low' | 'medium' | 'high';
  reason: Record<string, unknown>;
};

export type SalesStats = {
  openOpportunityCount: number;
  wonOpportunityCount: number;
  pipelineValueCents: number;
  stageCount: number;
  activityCount: number;
  pendingRecommendationCount: number;
  quoteConversionRatePercent: number | null;
};

export type SalesPipelineMetrics = {
  stages: Array<{
    stageId: string;
    stageKey: string;
    name: string;
    opportunityCount: number;
    totalValueCents: number;
    conversionRatePercent: number | null;
  }>;
  totalOpenValueCents: number;
  wonCount: number;
  lostCount: number;
  winRatePercent: number | null;
};

export type SalesQuoteAssistanceContext = {
  customerId: string;
  customerName: string;
  previousQuotes: Array<{
    id: string;
    quoteNumber: string;
    title: string;
    status: string;
    amountCents: number;
    currency: string;
    createdAt: string;
  }>;
  completedJobs: Array<{
    id: string;
    title: string;
    status: string;
    completedAt: string | null;
  }>;
  totalRevenueCents: number;
  currency: string;
  recommendations: string[];
};

export type SalesAuraContext = {
  openOpportunityCount: number;
  pendingRecommendationCount: number;
  pipelineValueCents: number;
  topOpportunities: Array<{
    id: string;
    title: string;
    customerName: string | null;
    status: SalesOpportunityStatus;
    estimatedValueCents: number | null;
  }>;
  detectedSignals: DetectedSalesOpportunity[];
  summary: string;
};

export type CreateSalesPipelineStageRequest = {
  stageKey: string;
  name: string;
  sortOrder?: number;
  probabilityPercent?: number;
  isClosedWon?: boolean;
  isClosedLost?: boolean;
};

export type UpdateSalesPipelineStageRequest = Partial<CreateSalesPipelineStageRequest>;

export type CreateSalesOpportunityRequest = {
  customerId: string;
  stageId?: string | null;
  opportunityType?: SalesOpportunityType;
  source?: SalesOpportunitySource;
  title: string;
  description?: string | null;
  estimatedValueCents?: number | null;
  currency?: string;
  quoteId?: string | null;
  jobId?: string | null;
  assignedUserId?: string | null;
  detectedReason?: Record<string, unknown>;
};

export type UpdateSalesOpportunityRequest = {
  stageId?: string | null;
  status?: SalesOpportunityStatus;
  title?: string;
  description?: string | null;
  estimatedValueCents?: number | null;
  assignedUserId?: string | null;
};

export type CreateSalesActivityRequest = {
  customerId: string;
  opportunityId?: string | null;
  activityType?: SalesActivityType;
  subject?: string | null;
  body: string;
  occurredAt?: string;
};

export type UpdateSalesRecommendationRequest = {
  status: SalesRecommendationStatus;
};
