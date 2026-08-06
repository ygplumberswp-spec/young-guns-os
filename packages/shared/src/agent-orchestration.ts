import type { AgentKey } from './agents.js';
import type { BusinessEventType } from './automation.js';

export type OrchestrationStatus = 'draft' | 'active' | 'paused';

export type OrchestrationRunStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval' | 'cancelled';

export type OrchestrationStepStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'awaiting_approval';

export type OrchestrationStepMode = 'sequential' | 'parallel';

export type OrchestrationApprovalStatus = 'pending' | 'approved' | 'rejected';

export type OrchestrationLogLevel = 'info' | 'warn' | 'error';

export const ORCHESTRATION_STATUS_OPTIONS: Array<{ value: OrchestrationStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
];

export const ORCHESTRATION_RUN_STATUS_OPTIONS: Array<{
  value: OrchestrationRunStatus;
  label: string;
}> = [
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const ORCHESTRATION_EVENT_OPTIONS: Array<{ value: BusinessEventType; label: string }> = [
  { value: 'customer.created', label: 'New Customer Created' },
  { value: 'customer.updated', label: 'Customer Updated' },
  { value: 'job.created', label: 'New Job Booked' },
  { value: 'job.scheduled', label: 'Job Scheduled' },
  { value: 'job.status_changed', label: 'Job Status Changed' },
  { value: 'job.completed', label: 'Job Completed' },
  { value: 'quote.created', label: 'Quote Created' },
  { value: 'invoice.created', label: 'Invoice Created' },
  { value: 'payment.received', label: 'Payment Received' },
  { value: 'invoice.overdue', label: 'Invoice Overdue' },
  { value: 'inventory.stock_threshold_reached', label: 'Stock Threshold Reached' },
  { value: 'vehicle.status_changed', label: 'Vehicle Event Detected' },
  { value: 'gps.event', label: 'GPS Event Detected' },
  { value: 'communication.received', label: 'Customer Communication Received' },
  { value: 'whatsapp.message.received', label: 'WhatsApp Message Received' },
];

export type OrchestrationStepSummary = {
  id: string;
  agentKey: AgentKey;
  stepKey: string;
  name: string;
  executionMode: OrchestrationStepMode;
  parallelGroupKey: string | null;
  sortOrder: number;
  requestTemplate: string;
  capabilityRequest: string | null;
  requiresApproval: boolean;
  handoffKeys: string[];
};

export type OrchestrationTriggerSummary = {
  id: string;
  eventType: BusinessEventType;
  enabled: boolean;
  conditionConfig: Record<string, unknown>;
};

export type OrchestrationSummary = {
  id: string;
  name: string;
  description: string | null;
  status: OrchestrationStatus;
  requiresApproval: boolean;
  stepCount: number;
  triggerCount: number;
  runCount: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrchestrationDetail = OrchestrationSummary & {
  steps: OrchestrationStepSummary[];
  triggers: OrchestrationTriggerSummary[];
};

export type OrchestrationRunStepSummary = {
  id: string;
  stepKey: string;
  agentKey: AgentKey;
  agentRunId: string | null;
  executionMode: OrchestrationStepMode;
  parallelGroupKey: string | null;
  sortOrder: number;
  status: OrchestrationStepStatus;
  requiresApproval: boolean;
  contextIn: Record<string, unknown>;
  contextOut: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type OrchestrationRunSummary = {
  id: string;
  orchestrationId: string | null;
  orchestrationName: string | null;
  triggerEvent: string | null;
  triggerEntityType: string | null;
  triggerEntityId: string | null;
  status: OrchestrationRunStatus;
  initiatedByUserId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type OrchestrationRunDetail = OrchestrationRunSummary & {
  context: Record<string, unknown>;
  steps: OrchestrationRunStepSummary[];
  logs: OrchestrationLogSummary[];
};

export type OrchestrationApprovalSummary = {
  id: string;
  runId: string;
  runStepId: string;
  orchestrationName: string | null;
  stepKey: string;
  agentKey: AgentKey;
  status: OrchestrationApprovalStatus;
  preview: string;
  payload: Record<string, unknown>;
  requestedByUserId: string | null;
  decidedByUserId: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type OrchestrationLogSummary = {
  id: string;
  runId: string;
  runStepId: string | null;
  logLevel: OrchestrationLogLevel;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CreateOrchestrationRequest = {
  name: string;
  description?: string | null;
  status?: OrchestrationStatus;
  requiresApproval?: boolean;
  config?: Record<string, unknown>;
};

export type UpdateOrchestrationRequest = {
  name?: string;
  description?: string | null;
  status?: OrchestrationStatus;
  requiresApproval?: boolean;
  config?: Record<string, unknown>;
};

export type CreateOrchestrationStepRequest = {
  agentKey: AgentKey;
  stepKey: string;
  name: string;
  executionMode?: OrchestrationStepMode;
  parallelGroupKey?: string | null;
  sortOrder?: number;
  requestTemplate: string;
  capabilityRequest?: string | null;
  requiresApproval?: boolean;
  handoffKeys?: string[];
  config?: Record<string, unknown>;
};

export type CreateOrchestrationTriggerRequest = {
  eventType: BusinessEventType;
  enabled?: boolean;
  conditionConfig?: Record<string, unknown>;
};

export type RunOrchestrationRequest = {
  payload?: Record<string, unknown>;
};

export type OrchestrationAuraContext = {
  activeOrchestrationCount: number;
  activeRunCount: number;
  pendingApprovalCount: number;
  recentRuns: Array<{
    id: string;
    orchestrationName: string | null;
    status: OrchestrationRunStatus;
    triggerEvent: string | null;
    startedAt: string | null;
  }>;
};
