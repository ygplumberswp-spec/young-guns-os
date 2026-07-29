import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agentKeyEnum, agentProfiles } from './agent-profiles';
import { agentRuns } from './agent-runs';
import { companies } from './companies';
import { users } from './users';

export const agentTaskStatusEnum = pgEnum('agent_task_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const agentTaskTypeEnum = pgEnum('agent_task_type', [
  'create_customer_note',
  'update_job_status',
  'send_whatsapp_draft',
  'create_candidate',
  'update_candidate_status',
  'draft_job_ad',
  'draft_interview_questions',
  'store_memory',
  'draft_hiring_recommendation',
  'draft_sales_follow_up',
  'draft_quote_recommendation',
  'draft_marketing_campaign',
  'draft_marketing_content',
  'draft_lead_follow_up',
  'draft_lead_handoff',
  'draft_follow_up_from_call',
  'draft_appointment_request_from_call',
  'draft_lead_from_call',
  'draft_customer_note_from_call',
  'draft_customer_response',
  'draft_appointment_update',
  'draft_invoice_explanation',
  'draft_service_information_response',
  'draft_recruitment_action',
  'draft_candidate_communication',
  'draft_interview_request',
  'draft_training_plan',
  'draft_purchase_order',
  'draft_executive_action',
  'draft_finance_action',
  'draft_knowledge_article',
  'draft_business_report',
  'draft_workflow',
  'draft_integration_action',
  'draft_customer_request',
  'draft_mobile_request',
  'draft_quality_action',
  'draft_quality_review',
  'draft_payroll_recommendation',
  'draft_customer_reply',
  'draft_follow_up',
  'draft_maintenance_action',
  'draft_asset_replacement',
  'draft_prompt_update',
  'draft_provider_configuration',
  'draft_dispatch_action',
  'draft_callback_action',
  'draft_fleet_action',
  'draft_vehicle_replacement',
  'draft_business_action',
  'draft_security_action',
  'draft_integration_repair',
  'draft_strategic_report',
  'draft_workflow_improvement',
]);

export const agentTasks = pgTable('agent_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  agentProfileId: uuid('agent_profile_id').references(() => agentProfiles.id, {
    onDelete: 'set null',
  }),
  agentKey: agentKeyEnum('agent_key').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  taskType: agentTaskTypeEnum('task_type').notNull(),
  status: agentTaskStatusEnum('status').notNull().default('pending_approval'),
  approvalRequired: boolean('approval_required').notNull().default(true),
  preview: text('preview').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb('result').$type<Record<string, unknown>>(),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AgentTask = typeof agentTasks.$inferSelect;
export type NewAgentTask = typeof agentTasks.$inferInsert;
