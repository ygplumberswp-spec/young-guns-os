import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { workflows } from './workflows';

export const workflowWebhooks = pgTable('workflow_webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  webhookKey: text('webhook_key').notNull(),
  secretHash: text('secret_hash').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowWebhook = typeof workflowWebhooks.$inferSelect;
export type NewWorkflowWebhook = typeof workflowWebhooks.$inferInsert;
