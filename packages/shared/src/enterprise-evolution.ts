export type EvolutionLearningSourceType =
  | 'user_approval'
  | 'user_correction'
  | 'completed_job'
  | 'customer_feedback'
  | 'technician_performance'
  | 'financial_outcome'
  | 'workflow_history'
  | 'ai_interaction'
  | 'business_decision';

export type EvolutionLearningStatus = 'pending_approval' | 'approved' | 'rejected' | 'rolled_back';

export type EvolutionPatternType =
  | 'operational_trend'
  | 'customer_behaviour'
  | 'technician_strength'
  | 'inventory_demand'
  | 'fleet_utilization'
  | 'seasonal_change'
  | 'financial_anomaly'
  | 'business_risk';

export type EvolutionRecommendationCategory =
  | 'scheduling'
  | 'dispatch'
  | 'fleet'
  | 'inventory'
  | 'procurement'
  | 'pricing'
  | 'marketing'
  | 'finance'
  | 'workforce'
  | 'customer_success'
  | 'ai_prompts'
  | 'automation';

export type EvolutionRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type EvolutionOptimizationStatus =
  'suggested' | 'pending_approval' | 'approved' | 'rejected' | 'deployed' | 'rolled_back';

export type EvolutionTimelineEventType =
  | 'system_improvement'
  | 'ai_learning'
  | 'workflow_improvement'
  | 'kpi_improvement'
  | 'business_growth'
  | 'optimization_history';

export type EvolutionLearningEventSummary = {
  id: string;
  sourceType: EvolutionLearningSourceType;
  status: EvolutionLearningStatus;
  title: string;
  summary: string;
  confidenceScore: number | null;
  sourceModule: string | null;
  requiresApproval: boolean;
  approvedAt: string | null;
  createdAt: string;
};

export type EvolutionLearningAuditSummary = {
  id: string;
  learningEventId: string | null;
  actionType: string;
  description: string;
  performedAt: string;
};

export type EvolutionModelVersionSummary = {
  id: string;
  versionLabel: string;
  description: string | null;
  confidenceScore: number | null;
  learningEventCount: number;
  isActive: boolean;
  createdAt: string;
};

export type EvolutionPatternSummary = {
  id: string;
  patternType: EvolutionPatternType;
  title: string;
  description: string;
  confidenceScore: number | null;
  detectedAt: string;
};

export type EvolutionRecommendationSummary = {
  id: string;
  category: EvolutionRecommendationCategory;
  title: string;
  recommendation: string;
  priority: string;
  status: EvolutionRecommendationStatus;
  confidenceScore: number | null;
  estimatedImpact: string | null;
  createdAt: string;
};

export type EvolutionOptimizationStudioSummary = {
  id: string;
  title: string;
  description: string;
  status: EvolutionOptimizationStatus;
  estimatedImpact: string | null;
  riskAssessment: string | null;
  costAnalysis: string | null;
  confidenceScore: number | null;
  recommendationId: string | null;
  deployedAt: string | null;
  createdAt: string;
};

export type EvolutionTimelineEventSummary = {
  id: string;
  eventType: EvolutionTimelineEventType;
  title: string;
  description: string | null;
  sourceModule: string | null;
  impactSummary: string | null;
  eventAt: string;
};

export type EvolutionSafeLearningPolicySummary = {
  id: string;
  sourceType: EvolutionLearningSourceType;
  requiresApproval: boolean;
  allowRollback: boolean;
  minConfidenceScore: number | null;
};

export type EnterpriseEvolutionDashboard = {
  summary: string;
  optimizationScore: number | null;
  learningProgressPercent: number | null;
  aiConfidenceScore: number | null;
  recommendationAcceptanceRate: number | null;
  learningEventCount: number;
  approvedLearningCount: number;
  patternCount: number;
  pendingRecommendationCount: number;
  pendingOptimizationCount: number;
  recentLearningEvents: EvolutionLearningEventSummary[];
  patterns: EvolutionPatternSummary[];
  recommendations: EvolutionRecommendationSummary[];
  optimizations: EvolutionOptimizationStudioSummary[];
  timelineEvents: EvolutionTimelineEventSummary[];
  modelVersions: EvolutionModelVersionSummary[];
};

export type EnterpriseEvolutionAuraContext = {
  summary: string;
  optimizationScore: number | null;
  learningProgressPercent: number | null;
  aiConfidenceScore: number | null;
  pendingRecommendationCount: number;
  pendingOptimizationCount: number;
  patternCount: number;
};

export type CreateEvolutionOptimizationRequest = {
  title: string;
  description: string;
  recommendationId?: string | null;
  estimatedImpact?: string | null;
  riskAssessment?: string | null;
  costAnalysis?: string | null;
  payload?: Record<string, unknown>;
};

export type UpdateEvolutionOptimizationRequest = {
  status?: EvolutionOptimizationStatus;
};

export type ApproveEvolutionLearningRequest = {
  learningEventId: string;
};

export type RollbackEvolutionLearningRequest = {
  learningEventId: string;
};

export type UpdateEvolutionSafeLearningPolicyRequest = {
  sourceType: EvolutionLearningSourceType;
  requiresApproval?: boolean;
  allowRollback?: boolean;
  minConfidenceScore?: number | null;
};

export type UpdateEvolutionRecommendationRequest = {
  status?: EvolutionRecommendationStatus;
};
