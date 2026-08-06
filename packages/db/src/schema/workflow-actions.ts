import { integer, jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { workflows } from './workflows';

export const workflowActionTypeEnum = pgEnum('workflow_action_type', [
  'log_customer_activity',
  'send_communication',
  'update_job_status',
  'send_whatsapp_template',
  'send_whatsapp_draft',
  'update_customer',
  'assign_job_task',
  'send_email_draft',
  'create_payment_reminder',
  'ask_aura_agent',
  'generate_summary',
  'create_task',
  'assign_user',
  'notify_user',
  'send_internal_notification',
  'create_draft_sms',
  'create_draft_customer_response',
  'generate_recommendation',
  'create_purchase_order_draft',
  'generate_report',
  'create_follow_up',
  'trigger_aura_suggestion',
  'run_ai_agent',
  'update_record',
  'create_approval_request',
  'execute_approved_step',
]);

export const workflowActions = pgTable('workflow_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  actionType: workflowActionTypeEnum('action_type').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowAction = typeof workflowActions.$inferSelect;
export type NewWorkflowAction = typeof workflowActions.$inferInsert;
