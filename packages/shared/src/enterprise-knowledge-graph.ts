import type { KnowledgeStats } from './knowledge.js';

export type KnowledgeGraphEntityType =
  | 'customer'
  | 'job'
  | 'asset'
  | 'invoice'
  | 'inventory'
  | 'vehicle'
  | 'technician'
  | 'supplier'
  | 'document'
  | 'communication'
  | 'workflow'
  | 'ai_agent'
  | 'integration'
  | 'quote'
  | 'payment'
  | 'analytics_report'
  | 'digital_twin_snapshot'
  | 'organizational_memory';

export type KnowledgeGraphRelationshipType =
  | 'assigned_to'
  | 'belongs_to'
  | 'related_to'
  | 'depends_on'
  | 'created_by'
  | 'linked_document'
  | 'communicated_with'
  | 'executed_by'
  | 'connected_to'
  | 'parent_of'
  | 'child_of';

export type OrganizationalMemoryType =
  | 'business_decision'
  | 'sop'
  | 'policy'
  | 'customer_history'
  | 'technician_knowledge'
  | 'ai_insight'
  | 'lesson_learned'
  | 'meeting_summary'
  | 'project_history';

export type KnowledgeClassificationLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export type KnowledgeGraphActionType =
  | 'knowledge_summary'
  | 'documentation_improvement'
  | 'relationship_insight'
  | 'governance_recommendation'
  | 'executive_knowledge_report';

export type KnowledgeGraphActionStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type KnowledgeGraphRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type KnowledgeGraphEntitySummary = {
  id: string;
  entityType: KnowledgeGraphEntityType;
  sourceEntityId: string;
  label: string;
  summary: string | null;
  classification: KnowledgeClassificationLevel;
  indexedAt: string;
};

export type KnowledgeGraphRelationshipSummary = {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: KnowledgeGraphRelationshipType;
  label: string | null;
  sourceLabel: string | null;
  targetLabel: string | null;
};

export type OrganizationalMemorySummary = {
  id: string;
  memoryType: OrganizationalMemoryType;
  title: string;
  summary: string | null;
  classification: KnowledgeClassificationLevel;
  versionNumber: number;
  createdAt: string;
};

export type KnowledgeSemanticSearchResult = {
  resultType:
    'graph_entity' | 'organizational_memory' | 'knowledge_article' | 'sop' | 'policy' | 'document';
  id: string;
  title: string;
  summary: string | null;
  entityType: string | null;
  relevanceScore: number;
  searchMode: 'keyword' | 'semantic' | 'hybrid';
};

export type KnowledgeSavedSearchSummary = {
  id: string;
  name: string;
  query: string;
  filters: Record<string, unknown>;
  createdAt: string;
};

export type KnowledgeSearchActivitySummary = {
  id: string;
  query: string;
  resultCount: number;
  searchMode: string;
  searchedAt: string;
};

export type KnowledgeGovernanceSummary = {
  policies: Array<{
    id: string;
    name: string;
    classification: KnowledgeClassificationLevel;
    retentionDays: number | null;
    enabled: boolean;
  }>;
  auditEntryCount: number;
  classifiedEntityCount: number;
};

export type KnowledgeGraphRecommendationSummary = {
  id: string;
  title: string;
  recommendation: string;
  priority: string;
  status: KnowledgeGraphRecommendationStatus;
  createdAt: string;
};

export type KnowledgeGraphPlatformActionSummary = {
  id: string;
  actionType: KnowledgeGraphActionType;
  status: KnowledgeGraphActionStatus;
  subject: string;
  recommendation: string;
  createdAt: string;
};

export type KnowledgeGraphCoverage = {
  entityTypeCounts: Record<string, number>;
  relationshipCount: number;
  indexedDocumentCount: number;
  memoryEntryCount: number;
  coveragePercent: number | null;
  semanticIndexCount: number;
};

export type EnterpriseKnowledgeGraphDashboard = {
  summary: string;
  knowledgeStats: KnowledgeStats;
  entityCount: number;
  relationshipCount: number;
  memoryEntryCount: number;
  indexedCount: number;
  searchActivityCount: number;
  coverage: KnowledgeGraphCoverage;
  recentEntities: KnowledgeGraphEntitySummary[];
  recentRelationships: KnowledgeGraphRelationshipSummary[];
  recentMemory: OrganizationalMemorySummary[];
  recommendations: KnowledgeGraphRecommendationSummary[];
  pendingActionCount: number;
};

export type EnterpriseKnowledgeGraphAuraContext = {
  summary: string;
  entityCount: number;
  relationshipCount: number;
  memoryEntryCount: number;
  indexedCount: number;
  pendingRecommendationCount: number;
  pendingActionCount: number;
};

export type SemanticSearchRequest = {
  query: string;
  entityTypes?: KnowledgeGraphEntityType[];
  limit?: number;
  mode?: 'keyword' | 'semantic' | 'hybrid';
};

export type CreateOrganizationalMemoryRequest = {
  memoryType: OrganizationalMemoryType;
  title: string;
  content: string;
  summary?: string | null;
  classification?: KnowledgeClassificationLevel;
  requiredPermissions?: string[];
  relatedEntityIds?: string[];
};

export type CreateKnowledgeSavedSearchRequest = {
  name: string;
  query: string;
  filters?: Record<string, unknown>;
};

export type CreateKnowledgeGraphActionRequest = {
  actionType: KnowledgeGraphActionType;
  subject: string;
  recommendation: string;
  payload?: Record<string, unknown>;
};

export type TraverseKnowledgeGraphRequest = {
  entityId: string;
  depth?: number;
};

export type KnowledgeGraphTraversalResult = {
  rootEntity: KnowledgeGraphEntitySummary;
  relationships: KnowledgeGraphRelationshipSummary[];
  connectedEntities: KnowledgeGraphEntitySummary[];
};
