import type { AutomationStats, WorkflowRunSummary, WorkflowStudioAuraContext, WorkflowSummary } from './automation.js';

export type AutomationStudioNodeType =
  | 'trigger'
  | 'action'
  | 'condition'
  | 'delay'
  | 'approval'
  | 'parallel'
  | 'loop'
  | 'webhook'
  | 'ai_agent'
  | 'custom';

export type AutomationApprovalType = 'single' | 'multi_level' | 'department' | 'executive' | 'delegated';

export type AutomationApprovalStatus = 'pending' | 'approved' | 'rejected' | 'delegated' | 'cancelled';

export type AutomationStudioActionType =
  | 'workflow_improvement'
  | 'automation_recommendation'
  | 'bottleneck_fix'
  | 'performance_optimization';

export type AutomationStudioActionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type AutomationRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type AutomationTestRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AutomationStudioVersionSummary = {
  id: string;
  workflowId: string;
  versionNumber: number;
  changeSummary: string | null;
  createdAt: string;
};

export type AutomationStudioVariableSummary = {
  id: string;
  workflowId: string;
  variableKey: string;
  label: string;
  variableType: string;
  defaultValue: string | null;
  required: boolean;
};

export type AutomationStudioNodeSummary = {
  id: string;
  workflowId: string;
  nodeKey: string;
  nodeType: AutomationStudioNodeType;
  title: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
};

export type AutomationStudioConnectionSummary = {
  id: string;
  workflowId: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  conditionExpression: string | null;
};

export type AutomationStudioDesignerSummary = {
  workflowId: string;
  nodes: AutomationStudioNodeSummary[];
  connections: AutomationStudioConnectionSummary[];
  variables: AutomationStudioVariableSummary[];
  canvasConfig: Record<string, unknown>;
};

export type AutomationStudioApprovalChainSummary = {
  id: string;
  workflowId: string;
  approvalType: AutomationApprovalType;
  levels: Array<Record<string, unknown>>;
  enabled: boolean;
};

export type AutomationStudioApprovalRecordSummary = {
  id: string;
  workflowId: string;
  workflowRunId: string | null;
  approvalType: AutomationApprovalType;
  status: AutomationApprovalStatus;
  approverUserId: string | null;
  comment: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type AutomationStudioTestRunSummary = {
  id: string;
  workflowId: string;
  status: AutomationTestRunStatus;
  resultSummary: string | null;
  simulationRunId: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type AutomationStudioMonitoringSummary = {
  runningCount: number;
  completedCount: number;
  failedCount: number;
  queueDepth: number;
  successRatePercent: number | null;
  avgDurationMs: number | null;
  pendingApprovalCount: number;
};

export type AutomationStudioRecommendationSummary = {
  id: string;
  workflowId: string | null;
  title: string;
  recommendation: string;
  priority: string;
  status: AutomationRecommendationStatus;
  createdAt: string;
};

export type AutomationStudioPlatformActionSummary = {
  id: string;
  actionType: AutomationStudioActionType;
  status: AutomationStudioActionStatus;
  subject: string;
  recommendation: string;
  workflowId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type EnterpriseAutomationStudioDashboard = {
  summary: string;
  stats: AutomationStats;
  studio: WorkflowStudioAuraContext;
  monitoring: AutomationStudioMonitoringSummary;
  workflows: WorkflowSummary[];
  recentRuns: WorkflowRunSummary[];
  recommendations: AutomationStudioRecommendationSummary[];
  pendingActionCount: number;
};

export type EnterpriseAutomationAuraContext = {
  summary: string;
  workflowCount: number;
  activeWorkflowCount: number;
  pendingApprovalCount: number;
  failedRunCount: number;
  recommendationCount: number;
};

export type SaveAutomationDesignerRequest = {
  nodes: Array<{
    nodeKey: string;
    nodeType: AutomationStudioNodeType;
    title: string;
    positionX?: number;
    positionY?: number;
    config?: Record<string, unknown>;
  }>;
  connections: Array<{
    sourceNodeKey: string;
    targetNodeKey: string;
    conditionExpression?: string | null;
    metadata?: Record<string, unknown>;
  }>;
  variables?: Array<{
    variableKey: string;
    label: string;
    variableType?: string;
    defaultValue?: string | null;
    required?: boolean;
    validation?: Record<string, unknown>;
  }>;
  canvasConfig?: Record<string, unknown>;
};

export type CreateAutomationStudioVersionRequest = {
  changeSummary?: string | null;
};

export type CreateAutomationStudioActionRequest = {
  actionType: AutomationStudioActionType;
  subject: string;
  recommendation: string;
  workflowId?: string | null;
  payload?: Record<string, unknown>;
};

export type RunAutomationTestRequest = {
  inputPayload?: Record<string, unknown>;
};

export type CreateAutomationApprovalChainRequest = {
  approvalType: AutomationApprovalType;
  levels?: Array<Record<string, unknown>>;
  enabled?: boolean;
};
