import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { workflows } from './workflows';

export const workflowConditionOperatorEnum = pgEnum('workflow_condition_operator', [
  'equals',
  'not_equals',
  'exists',
  'not_exists',
  'contains',
  'greater_than',
  'less_than',
]);

export const workflowConditions = pgTable('workflow_conditions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),
  operator: workflowConditionOperatorEnum('operator').notNull().default('equals'),
  value: text('value'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowCondition = typeof workflowConditions.$inferSelect;
export type NewWorkflowCondition = typeof workflowConditions.$inferInsert;
