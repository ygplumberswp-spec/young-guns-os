export type GsEntityType =
  | 'customer'
  | 'lead'
  | 'contact'
  | 'job'
  | 'quote'
  | 'invoice'
  | 'payment'
  | 'purchase_order'
  | 'supplier'
  | 'inventory'
  | 'asset'
  | 'vehicle'
  | 'technician'
  | 'property'
  | 'document'
  | 'ocr_content'
  | 'knowledge_article'
  | 'communication'
  | 'email'
  | 'whatsapp'
  | 'note'
  | 'task'
  | 'calendar_event'
  | 'ai_conversation'
  | 'audit_log'
  | 'automation'
  | 'industry_pack'
  | 'other';

export type GsSearchMode = 'keyword' | 'fuzzy' | 'natural_language' | 'hybrid';

export type GsFeedScope = 'personal' | 'team' | 'company' | 'department' | 'ai' | 'system';

export type GsTimelineEventType =
  | 'lead_created'
  | 'quote_sent'
  | 'quote_accepted'
  | 'job_booked'
  | 'technician_assigned'
  | 'vehicle_dispatched'
  | 'work_completed'
  | 'invoice_issued'
  | 'payment_received'
  | 'whatsapp_conversation'
  | 'email_history'
  | 'document_uploaded'
  | 'ai_interaction'
  | 'note_added'
  | 'task_created'
  | 'calendar_event'
  | 'communication'
  | 'automation_run'
  | 'other';

export type GsPlatformConfigSummary = {
  searchPolicy: Record<string, unknown>;
  timelinePolicy: Record<string, unknown>;
  feedPolicy: Record<string, unknown>;
  indexPolicy: Record<string, unknown>;
  auditRetentionDays: number;
};

export type GsSearchResultSummary = {
  entityType: GsEntityType;
  sourceModule: string;
  sourceEntityId: string;
  title: string;
  summary: string | null;
  relevanceScore: number;
  searchMode: GsSearchMode;
  metadata: Record<string, unknown>;
};

export type GsSavedSearchSummary = {
  id: string;
  name: string;
  query: string;
  searchMode: GsSearchMode;
  filters: Record<string, unknown>;
  entityTypes: string[];
  createdAt: string;
};

export type GsRecentSearchSummary = {
  id: string;
  query: string;
  searchMode: GsSearchMode;
  resultCount: number;
  searchedAt: string;
};

export type GsSearchSuggestionSummary = {
  id: string;
  suggestionText: string;
  suggestionType: string;
  entityType: GsEntityType | null;
  createdAt: string;
};

export type GsTimelineEntrySummary = {
  id: string;
  entityType: GsEntityType;
  entityId: string;
  eventType: GsTimelineEventType;
  title: string;
  description: string | null;
  sourceModule: string;
  sourceEntityId: string | null;
  occurredAt: string;
};

export type GsRelationshipLinkSummary = {
  id: string;
  fromEntityType: GsEntityType;
  fromEntityId: string;
  toEntityType: GsEntityType;
  toEntityId: string;
  relationshipType: string;
  sourceModule: string;
  createdAt: string;
};

export type GsActivityFeedItemSummary = {
  id: string;
  feedScope: GsFeedScope;
  eventType: string;
  moduleKey: string;
  title: string;
  description: string | null;
  entityType: GsEntityType | null;
  entityId: string | null;
  occurredAt: string;
};

export type GsActivityFeedConfigSummary = {
  id: string;
  feedScope: GsFeedScope;
  name: string;
  filters: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

export type GsSearchAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  createdAt: string;
};

export type GsAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type GsAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type GsActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  createdAt: string;
};

export type GsSearchHealthSummary = {
  indexStatus: string;
  indexedCount: number;
  pendingIndexCount: number;
  failedIndexCount: number;
  timelineEntryCount: number;
  activityFeedCount: number;
  relationshipLinkCount: number;
};

export type EnterpriseGlobalSearchDashboard = {
  summary: string;
  platformConfig: GsPlatformConfigSummary;
  searchHealth: GsSearchHealthSummary;
  recentSearches: GsRecentSearchSummary[];
  savedSearches: GsSavedSearchSummary[];
  searchSuggestions: GsSearchSuggestionSummary[];
  timelinePreview: GsTimelineEntrySummary[];
  activityFeedPreview: GsActivityFeedItemSummary[];
  relationshipPreview: GsRelationshipLinkSummary[];
  analytics: GsAnalyticsSummary | null;
  recentAlerts: GsSearchAlertSummary[];
  openAlertCount: number;
  overallSearchHealthStatus: string;
};

export type EnterpriseGlobalSearchAuraContext = {
  summary: string;
  indexedCount: number;
  failedIndexCount: number;
  openAlertCount: number;
  overallSearchHealthStatus: string;
};

export type UpdateGsPlatformConfigRequest = {
  searchPolicy?: Record<string, unknown>;
  timelinePolicy?: Record<string, unknown>;
  feedPolicy?: Record<string, unknown>;
  indexPolicy?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type GsGlobalSearchRequest = {
  query: string;
  searchMode?: GsSearchMode;
  entityTypes?: GsEntityType[];
  filters?: Record<string, unknown>;
  limit?: number;
};

export type CreateGsSavedSearchRequest = {
  name: string;
  query: string;
  searchMode?: GsSearchMode;
  filters?: Record<string, unknown>;
  entityTypes?: string[];
};

export type GsTimelineQueryRequest = {
  entityType: GsEntityType;
  entityId: string;
  limit?: number;
};

export type GsActivityFeedQueryRequest = {
  feedScope?: GsFeedScope;
  moduleKey?: string;
  eventType?: string;
  userId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

export type GsRelationshipQueryRequest = {
  entityType: GsEntityType;
  entityId: string;
  limit?: number;
};

export type CreateGsActivityFeedConfigRequest = {
  feedScope?: GsFeedScope;
  name: string;
  filters?: Record<string, unknown>;
  enabled?: boolean;
};

export type CreateGsActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type CreateGsSearchSuggestionRequest = {
  suggestionText: string;
  suggestionType?: string;
  entityType?: GsEntityType;
  metadata?: Record<string, unknown>;
};
