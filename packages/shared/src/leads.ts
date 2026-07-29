export type LeadStatus = 'new' | 'qualified' | 'contacted' | 'opportunity' | 'converted' | 'lost';

export type LeadActivityType = 'call' | 'email' | 'meeting' | 'follow_up' | 'note' | 'handoff' | 'other';

export type LeadRecommendationType =
  | 'follow_up'
  | 'qualification'
  | 'handoff'
  | 'engagement'
  | 'conversion'
  | 'retention';

export type LeadRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export const LEAD_STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

export const LEAD_ACTIVITY_TYPE_OPTIONS: Array<{ value: LeadActivityType; label: string }> = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'note', label: 'Note' },
  { value: 'handoff', label: 'Sales handoff' },
  { value: 'other', label: 'Other' },
];

export type LeadSourceSummary = {
  id: string;
  sourceKey: string;
  name: string;
  description: string | null;
  enabled: boolean;
  leadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LeadSummary = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  sourceId: string | null;
  sourceName: string | null;
  status: LeadStatus;
  title: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  score: number;
  assignedUserId: string | null;
  notes: string | null;
  convertedAt: string | null;
  lostAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadActivitySummary = {
  id: string;
  leadId: string;
  activityType: LeadActivityType;
  subject: string | null;
  body: string;
  authorUserId: string;
  authorName: string | null;
  occurredAt: string;
  createdAt: string;
};

export type LeadScoreSummary = {
  id: string;
  leadId: string;
  score: number;
  signals: Record<string, unknown>;
  scoredAt: string;
  createdAt: string;
};

export type LeadRecommendationSummary = {
  id: string;
  leadId: string | null;
  leadTitle: string | null;
  recommendationType: LeadRecommendationType;
  title: string;
  description: string;
  priority: string;
  status: LeadRecommendationStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type LeadPipelineMetrics = {
  stages: Array<{
    status: LeadStatus;
    count: number;
    averageScore: number;
  }>;
  totalActive: number;
  convertedCount: number;
  lostCount: number;
  conversionRatePercent: number | null;
};

export type AcquisitionInsight = {
  insightType: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  context: Record<string, unknown>;
};

export type LeadScoringResult = {
  leadId: string;
  score: number;
  signals: Record<string, unknown>;
  summary: string;
};

export type SalesHandoffPreview = {
  leadId: string;
  leadTitle: string;
  contactName: string;
  currentScore: number;
  suggestedOpportunityTitle: string;
  suggestedOpportunityType: string;
  requiresApproval: true;
};

export type LeadAuraContext = {
  activeLeadCount: number;
  qualifiedLeadCount: number;
  pendingRecommendationCount: number;
  averageScore: number;
  topLeads: Array<{
    id: string;
    title: string;
    contactName: string;
    status: LeadStatus;
    score: number;
  }>;
  acquisitionInsights: AcquisitionInsight[];
  summary: string;
};

export type LeadStats = {
  totalLeadCount: number;
  activeLeadCount: number;
  qualifiedLeadCount: number;
  convertedLeadCount: number;
  sourceCount: number;
  pendingRecommendationCount: number;
  crmLeadCustomerCount: number;
};

export type CreateLeadSourceRequest = {
  sourceKey: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
};

export type UpdateLeadSourceRequest = Partial<CreateLeadSourceRequest>;

export type CreateLeadRequest = {
  customerId?: string | null;
  sourceId?: string | null;
  status?: LeadStatus;
  title: string;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  assignedUserId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateLeadRequest = {
  customerId?: string | null;
  sourceId?: string | null;
  status?: LeadStatus;
  title?: string;
  contactName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  assignedUserId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateLeadActivityRequest = {
  activityType?: LeadActivityType;
  subject?: string | null;
  body: string;
  occurredAt?: string;
};

export type UpdateLeadRecommendationRequest = {
  status: LeadRecommendationStatus;
};
