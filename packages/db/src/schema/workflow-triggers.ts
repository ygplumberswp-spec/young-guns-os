import { jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { workflows } from './workflows';

export const workflowTriggerTypeEnum = pgEnum('workflow_trigger_type', [
  'manual',
  'job_created',
  'job_status_changed',
  'job_scheduled',
  'job_booked',
  'job_assigned',
  'job_completed',
  'job_material_used',
  'customer_created',
  'customer_updated',
  'quote_created',
  'quote_accepted',
  'invoice_created',
  'payment_received',
  'invoice_overdue',
  'lead_created',
  'lead_converted',
  'stock_threshold_reached',
  'purchase_order_approved',
  'vehicle_status_changed',
  'voice_call_completed',
  'support_escalated',
  'marketing_campaign_completed',
  'maintenance_due',
  'scheduled_time',
  'webhook',
  'gps_event',
  'communication_received',
  'whatsapp_message_received',
]);

export const workflowTriggers = pgTable('workflow_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  triggerType: workflowTriggerTypeEnum('trigger_type').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowTrigger = typeof workflowTriggers.$inferSelect;
export type NewWorkflowTrigger = typeof workflowTriggers.$inferInsert;
