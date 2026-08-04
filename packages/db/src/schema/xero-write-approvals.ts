import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const xeroWriteApprovalStatusEnum = pgEnum('xero_write_approval_status', [
  'pending',
  'approved',
  'rejected',
  'executed',
  'expired',
]);

export const xeroWriteApprovals = pgTable('xero_write_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  writeOperation: text('write_operation').notNull(),
  status: xeroWriteApprovalStatusEnum('status').notNull().default('pending'),
  idempotencyKey: text('idempotency_key').notNull(),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type XeroWriteApproval = typeof xeroWriteApprovals.$inferSelect;
export type NewXeroWriteApproval = typeof xeroWriteApprovals.$inferInsert;
