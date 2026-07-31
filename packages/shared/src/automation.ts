export type WorkflowStatus = 'draft' | 'pending_approval' | 'active' | 'paused';

export const WORKFLOW_STATUS_OPTIONS: Array<{ value: WorkflowStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
];

export type BusinessEventType =
  | 'customer.created'
  | 'customer.updated'
  | 'job.created'
  | 'job.scheduled'
  | 'job.status_changed'
  | 'job.completed'
  | 'job.material_used'
  | 'quote.created'
  | 'invoice.created'
  | 'payment.received'
  | 'invoice.overdue'
  | 'inventory.stock_threshold_reached'
  | 'vehicle.status_changed'
  | 'gps.event'
  | 'communication.received'
  | 'whatsapp.message.received'
  | 'quote.accepted'
  | 'lead.created'
  | 'lead.converted'
  | 'dispatch.handoff'
  | 'procurement.purchase_order_approved'
  | 'voice.call.completed'
  | 'support.escalated'
  | 'marketing.campaign.completed'
  | 'scheduled.time'
  | 'webhook.received';

export type WorkflowTriggerType =
  | 'manual'
  | 'job_created'
  | 'job_status_changed'
  | 'job_scheduled'
  | 'job_completed'
  | 'job_material_used'
  | 'customer_created'
  | 'customer_updated'
  | 'quote_created'
  | 'invoice_created'
  | 'payment_received'
  | 'invoice_overdue'
  | 'stock_threshold_reached'
  | 'vehicle_status_changed'
  | 'gps_event'
  | 'communication_received'
  | 'whatsapp_message_received'
  | 'quote_accepted'
  | 'lead_created'
  | 'lead_converted'
  | 'purchase_order_approved'
  | 'voice_call_completed'
  | 'support_escalated'
  | 'marketing_campaign_completed'
  | 'scheduled_time'
  | 'webhook';

export const WORKFLOW_TRIGGER_TYPE_OPTIONS: Array<{ value: WorkflowTriggerType; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'customer_created', label: 'Customer created' },
  { value: 'customer_updated', label: 'Customer updated' },
  { value: 'job_created', label: 'Job created' },
  { value: 'job_scheduled', label: 'Job scheduled' },
  { value: 'job_status_changed', label: 'Job status changed' },
  { value: 'job_completed', label: 'Job completed' },
  { value: 'job_material_used', label: 'Job material used (for future stock decrement)' },
  { value: 'quote_created', label: 'Quote created' },
  { value: 'invoice_created', label: 'Invoice created' },
  { value: 'payment_received', label: 'Payment received' },
  { value: 'invoice_overdue', label: 'Invoice overdue' },
  { value: 'stock_threshold_reached', label: 'Stock threshold reached' },
  { value: 'vehicle_status_changed', label: 'Vehicle status changed' },
  { value: 'gps_event', label: 'GPS event' },
  { value: 'communication_received', label: 'Communication received' },
  { value: 'whatsapp_message_received', label: 'WhatsApp message received' },
  { value: 'quote_accepted', label: 'Quote accepted' },
  { value: 'lead_created', label: 'Lead created' },
  { value: 'lead_converted', label: 'Lead converted' },
  { value: 'purchase_order_approved', label: 'Purchase order approved' },
  { value: 'voice_call_completed', label: 'Voice call completed' },
  { value: 'support_escalated', label: 'Customer support escalated' },
  { value: 'marketing_campaign_completed', label: 'Marketing campaign completed' },
  { value: 'scheduled_time', label: 'Scheduled time trigger' },
  { value: 'webhook', label: 'Webhook trigger' },
];

export type WorkflowActionType =
  | 'log_customer_activity'
  | 'send_communication'
  | 'update_job_status'
  | 'send_whatsapp_template'
  | 'send_whatsapp_draft'
  | 'update_customer'
  | 'assign_job_task'
  | 'send_email_draft'
  | 'create_payment_reminder'
  | 'ask_aura_agent'
  | 'generate_summary'
  | 'create_task'
  | 'assign_user'
  | 'notify_user'
  | 'send_internal_notification'
  | 'create_draft_sms'
  | 'create_draft_customer_response'
  | 'generate_recommendation'
  | 'create_purchase_order_draft'
  | 'generate_report'
  | 'create_follow_up'
  | 'run_ai_agent'
  | 'update_record'
  | 'create_approval_request'
  | 'execute_approved_step';

export const WORKFLOW_ACTION_TYPE_OPTIONS: Array<{ value: WorkflowActionType; label: string }> = [
  { value: 'log_customer_activity', label: 'Create customer activity' },
  { value: 'update_customer', label: 'Update customer (approval required)' },
  { value: 'update_job_status', label: 'Update job status (approval required)' },
  { value: 'assign_job_task', label: 'Assign job task (approval required)' },
  { value: 'send_communication', label: 'Send communication draft' },
  { value: 'send_email_draft', label: 'Create email draft' },
  { value: 'send_whatsapp_template', label: 'Create WhatsApp template draft' },
  { value: 'send_whatsapp_draft', label: 'Create WhatsApp payment reminder draft' },
  { value: 'create_payment_reminder', label: 'Create payment reminder draft' },
  { value: 'ask_aura_agent', label: 'Ask AURA agent for decision' },
  { value: 'generate_summary', label: 'Generate summary' },
  { value: 'create_task', label: 'Create task' },
  { value: 'assign_user', label: 'Assign user (approval required)' },
  { value: 'notify_user', label: 'Notify user' },
  { value: 'send_internal_notification', label: 'Send internal notification' },
  { value: 'create_draft_sms', label: 'Create draft SMS' },
  { value: 'create_draft_customer_response', label: 'Create draft customer response' },
  { value: 'generate_recommendation', label: 'Generate recommendation' },
  { value: 'create_purchase_order_draft', label: 'Create purchase order draft' },
  { value: 'generate_report', label: 'Generate report (approval required)' },
  { value: 'create_follow_up', label: 'Create follow-up draft' },
  { value: 'run_ai_agent', label: 'Run AI agent (approval required)' },
  { value: 'update_record', label: 'Update record (approval required)' },
  { value: 'create_approval_request', label: 'Create approval request' },
  { value: 'execute_approved_step', label: 'Execute approved workflow step' },
];

export type WorkflowConditionOperator =
  'equals' | 'not_equals' | 'exists' | 'not_exists' | 'contains' | 'greater_than' | 'less_than';

export const WORKFLOW_CONDITION_OPERATOR_OPTIONS: Array<{
  value: WorkflowConditionOperator;
  label: string;
}> = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does not equal' },
  { value: 'exists', label: 'Exists' },
  { value: 'not_exists', label: 'Does not exist' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
];

export const WORKFLOW_CONDITION_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'invoice.status', label: 'Invoice status' },
  { value: 'invoice.amountCents', label: 'Invoice amount' },
  { value: 'job.status', label: 'Job status' },
  { value: 'customer.status', label: 'Customer status' },
  { value: 'vehicle.status', label: 'Vehicle status' },
  { value: 'payment.amountCents', label: 'Payment amount' },
];

export type WorkflowExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type WorkflowRunStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'awaiting_approval';

export type WorkflowStepStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'awaiting_approval';

export type WorkflowStepResultStatus =
  'pending' | 'completed' | 'failed' | 'awaiting_approval' | 'approved' | 'rejected';

export const WORKFLOW_EXECUTION_STATUS_OPTIONS: Array<{
  value: WorkflowExecutionStatus;
  label: string;
}> = [
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

export const WORKFLOW_RUN_STATUS_OPTIONS: Array<{ value: WorkflowRunStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
];

export type WorkflowTriggerSummary = {
  id: string;
  triggerType: WorkflowTriggerType;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowActionSummary = {
  id: string;
  actionType: WorkflowActionType;
  sortOrder: number;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowConditionSummary = {
  id: string;
  field: string;
  operator: WorkflowConditionOperator;
  value: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  version: number;
  status: WorkflowStatus;
  triggerCount: number;
  actionCount: number;
  conditionCount: number;
  executionCount: number;
  createdByUserId: string;
  createdByName: string;
  ownerUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowDetail = WorkflowSummary & {
  triggers: WorkflowTriggerSummary[];
  actions: WorkflowActionSummary[];
  conditions: WorkflowConditionSummary[];
  canvasConfig: Record<string, unknown>;
  submittedAt: string | null;
  approvedAt: string | null;
};

export type WorkflowExecutionSummary = {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  triggerType: string;
  status: WorkflowExecutionStatus;
  triggerEntityType: string | null;
  triggerEntityId: string | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  resultSummary: Record<string, unknown> | null;
  createdAt: string;
};

export type WorkflowStepResultSummary = {
  id: string;
  status: WorkflowStepResultStatus;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  requiresApproval: boolean;
  preview: string | null;
  approvedByUserId: string | null;
  executedAt: string | null;
  createdAt: string;
};

export type WorkflowStepSummary = {
  id: string;
  actionType: WorkflowActionType;
  sortOrder: number;
  status: WorkflowStepStatus;
  config: Record<string, unknown>;
  results: WorkflowStepResultSummary[];
  createdAt: string;
};

export type WorkflowRunSummary = {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  triggerEvent: string;
  triggerEntityType: string | null;
  triggerEntityId: string | null;
  status: WorkflowRunStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  isSimulation: boolean;
  errorMessage: string | null;
  createdAt: string;
};

export type WorkflowRunDetail = WorkflowRunSummary & {
  steps: WorkflowStepSummary[];
};

export type AutomationStats = {
  workflowCount: number;
  activeWorkflowCount: number;
  executionCount: number;
  pendingApprovalCount: number;
  runCount: number;
  templateCount: number;
  scheduleCount: number;
};

export type CreateWorkflowTriggerInput = {
  triggerType: WorkflowTriggerType;
  config?: Record<string, unknown>;
};

export type CreateWorkflowActionInput = {
  actionType: WorkflowActionType;
  sortOrder?: number;
  config?: Record<string, unknown>;
};

export type CreateWorkflowConditionInput = {
  field: string;
  operator?: WorkflowConditionOperator;
  value?: string | null;
  sortOrder?: number;
};

export type CreateWorkflowRequest = {
  name: string;
  description?: string | null;
  status?: WorkflowStatus;
  category?: string | null;
  canvasConfig?: Record<string, unknown>;
  triggers?: CreateWorkflowTriggerInput[];
  actions?: CreateWorkflowActionInput[];
  conditions?: CreateWorkflowConditionInput[];
};

export type UpdateWorkflowRequest = {
  name?: string;
  description?: string | null;
  status?: WorkflowStatus;
  category?: string | null;
  canvasConfig?: Record<string, unknown>;
};

export type WorkflowTemplateCategory =
  | 'customer_follow_up'
  | 'invoice_reminder'
  | 'lead_qualification'
  | 'job_completion'
  | 'technician_notification'
  | 'purchase_approval'
  | 'marketing_review'
  | 'executive_reporting'
  | 'custom';

export type WorkflowScheduleType =
  'cron' | 'daily' | 'weekly' | 'monthly' | 'interval' | 'one_time';

export type WorkflowTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  category: WorkflowTemplateCategory;
  templateKey: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowScheduleSummary = {
  id: string;
  workflowId: string;
  scheduleType: WorkflowScheduleType;
  cronExpression: string | null;
  intervalMinutes: number | null;
  runAt: string | null;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type WorkflowSimulationResult = {
  workflowId: string;
  runId: string;
  status: WorkflowRunStatus;
  steps: Array<{
    actionType: WorkflowActionType;
    sortOrder: number;
    preview: string;
    requiresApproval: boolean;
  }>;
  summary: string;
};

export type WorkflowAuditLogSummary = {
  id: string;
  workflowId: string | null;
  workflowRunId: string | null;
  eventType: string;
  nodeKey: string | null;
  message: string;
  metadata: Record<string, unknown>;
  userId: string | null;
  createdAt: string;
};

export type WorkflowStudioAuraContext = {
  stats: AutomationStats;
  templates: Array<{ name: string; category: WorkflowTemplateCategory; templateKey: string }>;
  schedules: Array<{ workflowId: string; scheduleType: WorkflowScheduleType; enabled: boolean }>;
  recentAuditLogs: Array<{ eventType: string; message: string; createdAt: string }>;
  summary: string;
};

export type CreateWorkflowTemplateRequest = {
  name: string;
  description?: string | null;
  category?: WorkflowTemplateCategory;
  templateKey: string;
  definition?: Record<string, unknown>;
  isActive?: boolean;
};

export type UpdateWorkflowTemplateRequest = Partial<CreateWorkflowTemplateRequest>;

export type InstantiateWorkflowTemplateRequest = {
  name: string;
  description?: string | null;
};

export type CreateWorkflowScheduleRequest = {
  workflowId: string;
  scheduleType: WorkflowScheduleType;
  cronExpression?: string | null;
  intervalMinutes?: number | null;
  runAt?: string | null;
  timezone?: string;
  enabled?: boolean;
};

export type UpdateWorkflowScheduleRequest = Partial<
  Omit<CreateWorkflowScheduleRequest, 'workflowId'>
>;

export type SimulateWorkflowRequest = {
  payload?: Record<string, unknown>;
};

export type ReorderWorkflowActionsRequest = {
  actionIds: string[];
};

export type CreateWorkflowTriggerRequest = CreateWorkflowTriggerInput;

export type CreateWorkflowActionRequest = CreateWorkflowActionInput;

export type CreateWorkflowConditionRequest = CreateWorkflowConditionInput;

export type RunWorkflowRequest = {
  payload?: Record<string, unknown>;
};

export const BUSINESS_EVENT_TO_TRIGGER: Record<BusinessEventType, WorkflowTriggerType> = {
  'customer.created': 'customer_created',
  'customer.updated': 'customer_updated',
  'job.created': 'job_created',
  'job.scheduled': 'job_scheduled',
  'job.status_changed': 'job_status_changed',
  'job.completed': 'job_completed',
  'job.material_used': 'job_material_used',
  'quote.created': 'quote_created',
  'invoice.created': 'invoice_created',
  'payment.received': 'payment_received',
  'invoice.overdue': 'invoice_overdue',
  'inventory.stock_threshold_reached': 'stock_threshold_reached',
  'vehicle.status_changed': 'vehicle_status_changed',
  'gps.event': 'gps_event',
  'communication.received': 'communication_received',
  'whatsapp.message.received': 'whatsapp_message_received',
  'quote.accepted': 'quote_accepted',
  'lead.created': 'lead_created',
  'lead.converted': 'lead_converted',
  'dispatch.handoff': 'job_scheduled',
  'procurement.purchase_order_approved': 'purchase_order_approved',
  'voice.call.completed': 'voice_call_completed',
  'support.escalated': 'support_escalated',
  'marketing.campaign.completed': 'marketing_campaign_completed',
  'scheduled.time': 'scheduled_time',
  'webhook.received': 'webhook',
};
