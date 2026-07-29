import type { AgentKey } from './agents.js';

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentTaskStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type AgentTaskType =
  | 'create_customer_note'
  | 'update_job_status'
  | 'send_whatsapp_draft'
  | 'create_candidate'
  | 'update_candidate_status'
  | 'draft_job_ad'
  | 'draft_interview_questions'
  | 'store_memory'
  | 'draft_hiring_recommendation'
  | 'draft_sales_follow_up'
  | 'draft_quote_recommendation'
  | 'draft_marketing_campaign'
  | 'draft_marketing_content'
  | 'draft_lead_follow_up'
  | 'draft_lead_handoff'
  | 'draft_follow_up_from_call'
  | 'draft_appointment_request_from_call'
  | 'draft_lead_from_call'
  | 'draft_customer_note_from_call'
  | 'draft_customer_response'
  | 'draft_appointment_update'
  | 'draft_invoice_explanation'
  | 'draft_service_information_response'
  | 'draft_recruitment_action'
  | 'draft_candidate_communication'
  | 'draft_interview_request'
  | 'draft_training_plan'
  | 'draft_purchase_order'
  | 'draft_executive_action'
  | 'draft_finance_action'
  | 'draft_knowledge_article'
  | 'draft_business_report'
  | 'draft_workflow'
  | 'draft_integration_action'
  | 'draft_customer_request'
  | 'draft_mobile_request'
  | 'draft_quality_action'
  | 'draft_quality_review'
  | 'draft_payroll_recommendation'
  | 'draft_customer_reply'
  | 'draft_follow_up'
  | 'draft_maintenance_action'
  | 'draft_asset_replacement'
  | 'draft_prompt_update'
  | 'draft_provider_configuration'
  | 'draft_dispatch_action'
  | 'draft_callback_action'
  | 'draft_fleet_action'
  | 'draft_vehicle_replacement'
  | 'draft_business_action'
  | 'draft_security_action'
  | 'draft_integration_repair'
  | 'draft_strategic_report'
  | 'draft_workflow_improvement';

export const AGENT_RUN_STATUS_OPTIONS: Array<{ value: AgentRunStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export const AGENT_TASK_STATUS_OPTIONS: Array<{ value: AgentTaskStatus; label: string }> = [
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'executed', label: 'Executed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const AGENT_TASK_TYPE_OPTIONS: Array<{ value: AgentTaskType; label: string }> = [
  { value: 'create_customer_note', label: 'Create customer note' },
  { value: 'update_job_status', label: 'Update job status' },
  { value: 'send_whatsapp_draft', label: 'Send WhatsApp draft' },
  { value: 'create_candidate', label: 'Create candidate' },
  { value: 'update_candidate_status', label: 'Update candidate status' },
  { value: 'draft_job_ad', label: 'Draft job advert' },
  { value: 'draft_interview_questions', label: 'Draft interview questions' },
  { value: 'store_memory', label: 'Store company memory' },
  { value: 'draft_hiring_recommendation', label: 'Draft hiring recommendation' },
  { value: 'draft_sales_follow_up', label: 'Draft sales follow-up' },
  { value: 'draft_quote_recommendation', label: 'Draft quote recommendation' },
  { value: 'draft_marketing_campaign', label: 'Draft marketing campaign' },
  { value: 'draft_marketing_content', label: 'Draft marketing content' },
  { value: 'draft_lead_follow_up', label: 'Draft lead follow-up' },
  { value: 'draft_lead_handoff', label: 'Draft sales handoff' },
  { value: 'draft_follow_up_from_call', label: 'Draft follow-up from call' },
  { value: 'draft_appointment_request_from_call', label: 'Draft appointment request from call' },
  { value: 'draft_lead_from_call', label: 'Draft lead from call' },
  { value: 'draft_customer_note_from_call', label: 'Draft customer note from call' },
  { value: 'draft_customer_response', label: 'Draft customer response' },
  { value: 'draft_appointment_update', label: 'Draft appointment update' },
  { value: 'draft_invoice_explanation', label: 'Draft invoice explanation' },
  { value: 'draft_service_information_response', label: 'Draft service information response' },
  { value: 'draft_recruitment_action', label: 'Draft recruitment action' },
  { value: 'draft_candidate_communication', label: 'Draft candidate communication' },
  { value: 'draft_interview_request', label: 'Draft interview request' },
  { value: 'draft_training_plan', label: 'Draft training plan' },
  { value: 'draft_purchase_order', label: 'Draft purchase order' },
  { value: 'draft_executive_action', label: 'Draft executive action' },
  { value: 'draft_finance_action', label: 'Draft finance action' },
  { value: 'draft_knowledge_article', label: 'Draft knowledge article' },
  { value: 'draft_business_report', label: 'Draft business report' },
  { value: 'draft_workflow', label: 'Draft workflow' },
  { value: 'draft_integration_action', label: 'Draft integration action' },
  { value: 'draft_customer_request', label: 'Draft customer request' },
  { value: 'draft_mobile_request', label: 'Draft mobile workforce request' },
  { value: 'draft_quality_action', label: 'Draft quality action' },
  { value: 'draft_quality_review', label: 'Draft quality review' },
  { value: 'draft_payroll_recommendation', label: 'Draft payroll recommendation' },
  { value: 'draft_customer_reply', label: 'Draft customer reply' },
  { value: 'draft_follow_up', label: 'Draft follow-up' },
  { value: 'draft_maintenance_action', label: 'Draft maintenance action' },
  { value: 'draft_asset_replacement', label: 'Draft asset replacement' },
  { value: 'draft_prompt_update', label: 'Draft prompt update' },
  { value: 'draft_provider_configuration', label: 'Draft provider configuration' },
  { value: 'draft_dispatch_action', label: 'Draft dispatch action' },
  { value: 'draft_callback_action', label: 'Draft callback action' },
  { value: 'draft_fleet_action', label: 'Draft fleet action' },
  { value: 'draft_vehicle_replacement', label: 'Draft vehicle replacement' },
  { value: 'draft_business_action', label: 'Draft business action' },
  { value: 'draft_security_action', label: 'Draft security action' },
  { value: 'draft_integration_repair', label: 'Draft integration repair' },
  { value: 'draft_strategic_report', label: 'Draft strategic report' },
  { value: 'draft_workflow_improvement', label: 'Draft workflow improvement' },
];

export type AgentRunSummary = {
  id: string;
  agentProfileId: string | null;
  agentKey: AgentKey;
  agentName: string;
  userId: string;
  userName: string;
  request: string;
  response: string | null;
  toolsUsed: string[];
  status: AgentRunStatus;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  taskCount: number;
};

export type AgentRunDetail = AgentRunSummary & {
  tasks: AgentTaskSummary[];
};

export type AgentTaskSummary = {
  id: string;
  agentRunId: string | null;
  agentProfileId: string | null;
  agentKey: AgentKey;
  agentName: string;
  userId: string;
  userName: string;
  taskType: AgentTaskType;
  status: AgentTaskStatus;
  approvalRequired: boolean;
  preview: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RunAgentRequest = {
  request: string;
  agentKey?: AgentKey;
  agentProfileId?: string;
  conversationId?: string;
  pageContext?: {
    customerId?: string;
    jobId?: string;
    vehicleId?: string;
    workflowId?: string;
    integrationProvider?: string;
    knowledgeQuery?: string;
    schedulingView?: boolean;
  };
};

export type RunAgentResponse = {
  run: AgentRunDetail;
  assistantMessage: string;
  pendingTasks: AgentTaskSummary[];
};

export type UpdateAgentTaskRequest = {
  preview?: string;
  payload?: Record<string, unknown>;
};

export type AgentToolExecutionResult = {
  toolKey: string;
  success: boolean;
  summary: string;
  data?: Record<string, unknown>;
};
