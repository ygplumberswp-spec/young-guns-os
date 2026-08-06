export type MarketingCampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

export type MarketingCampaignType =
  'retention' | 'maintenance' | 'seasonal' | 'engagement' | 'acquisition' | 'custom';

export type MarketingActivityType =
  'email_draft' | 'content' | 'outreach' | 'social_draft' | 'note' | 'other';

export type MarketingRecommendationType =
  | 'maintenance_reminder'
  | 'service_interest'
  | 'follow_up_campaign'
  | 'seasonal'
  | 'retention'
  | 'engagement'
  | 'content';

export type MarketingRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type MarketingSegmentType =
  'high_value' | 'repeat_service' | 'dormant' | 'new_customer' | 'high_engagement' | 'custom';

export const MARKETING_CAMPAIGN_STATUS_OPTIONS: Array<{
  value: MarketingCampaignStatus;
  label: string;
}> = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const MARKETING_CAMPAIGN_TYPE_OPTIONS: Array<{
  value: MarketingCampaignType;
  label: string;
}> = [
  { value: 'retention', label: 'Retention' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'acquisition', label: 'Acquisition' },
  { value: 'custom', label: 'Custom' },
];

export const MARKETING_ACTIVITY_TYPE_OPTIONS: Array<{
  value: MarketingActivityType;
  label: string;
}> = [
  { value: 'email_draft', label: 'Email Draft' },
  { value: 'content', label: 'Content' },
  { value: 'outreach', label: 'Outreach' },
  { value: 'social_draft', label: 'Social Draft' },
  { value: 'note', label: 'Note' },
  { value: 'other', label: 'Other' },
];

export type MarketingSegmentSummary = {
  id: string | null;
  segmentKey: string;
  name: string;
  description: string | null;
  segmentType: MarketingSegmentType;
  customerCount: number;
  isComputed: boolean;
  customers: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  }>;
};

export type MarketingCampaignSummary = {
  id: string;
  name: string;
  description: string | null;
  status: MarketingCampaignStatus;
  campaignType: MarketingCampaignType;
  targetSegmentKey: string | null;
  activityCount: number;
  createdByUserId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketingActivitySummary = {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  customerId: string | null;
  customerName: string | null;
  activityType: MarketingActivityType;
  subject: string | null;
  body: string;
  authorUserId: string;
  authorName: string | null;
  occurredAt: string;
  createdAt: string;
};

export type MarketingRecommendationSummary = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  recommendationType: MarketingRecommendationType;
  title: string;
  description: string;
  priority: string;
  status: MarketingRecommendationStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MarketingContentSuggestion = {
  title: string;
  description: string;
  channel: string;
  targetSegmentKey: string | null;
  messagingGuidance: string;
};

export type MarketingStats = {
  segmentCount: number;
  activeCampaignCount: number;
  activityCount: number;
  pendingRecommendationCount: number;
  computedSegmentCount: number;
};

export type MarketingAuraContext = {
  activeCampaignCount: number;
  pendingRecommendationCount: number;
  topSegments: Array<{
    segmentKey: string;
    name: string;
    customerCount: number;
    segmentType: MarketingSegmentType;
  }>;
  topRecommendations: Array<{
    title: string;
    recommendationType: MarketingRecommendationType;
    priority: string;
  }>;
  contentSuggestions: MarketingContentSuggestion[];
  summary: string;
};

export type CreateMarketingSegmentRequest = {
  segmentKey: string;
  name: string;
  description?: string | null;
  segmentType?: MarketingSegmentType;
  criteria?: Record<string, unknown>;
};

export type UpdateMarketingSegmentRequest = Partial<CreateMarketingSegmentRequest>;

export type CreateMarketingCampaignRequest = {
  name: string;
  description?: string | null;
  status?: MarketingCampaignStatus;
  campaignType?: MarketingCampaignType;
  targetSegmentKey?: string | null;
  config?: Record<string, unknown>;
};

export type UpdateMarketingCampaignRequest = {
  name?: string;
  description?: string | null;
  status?: MarketingCampaignStatus;
  campaignType?: MarketingCampaignType;
  targetSegmentKey?: string | null;
  config?: Record<string, unknown>;
};

export type CreateMarketingActivityRequest = {
  campaignId?: string | null;
  customerId?: string | null;
  activityType?: MarketingActivityType;
  subject?: string | null;
  body: string;
  occurredAt?: string;
};

export type UpdateMarketingRecommendationRequest = {
  status: MarketingRecommendationStatus;
};
