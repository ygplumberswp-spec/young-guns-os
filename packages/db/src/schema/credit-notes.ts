import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { invoices } from './invoices';
import { jobs } from './jobs';
import { users } from './users';
import { xeroWriteApprovals } from './xero-write-approvals';

export const creditNoteStatusEnum = pgEnum('credit_note_status', [
  'draft',
  'pending_approval',
  'approved',
  'approved_awaiting_provider_write',
  'executed',
  'failed',
  'cancelled',
]);

export const creditNotes = pgTable('credit_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  status: creditNoteStatusEnum('status').notNull().default('draft'),
  reason: text('reason').notNull(),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  vatCents: integer('vat_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  invoiceBalancePreviewCents: integer('invoice_balance_preview_cents'),
  providerReference: text('provider_reference'),
  xeroWriteApprovalId: uuid('xero_write_approval_id').references(() => xeroWriteApprovals.id, {
    onDelete: 'set null',
  }),
  idempotencyKey: text('idempotency_key'),
  errorState: jsonb('error_state').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const creditNoteLineItems = pgTable('credit_note_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  creditNoteId: uuid('credit_note_id')
    .notNull()
    .references(() => creditNotes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  description: text('description').notNull(),
  quantity: text('quantity').notNull().default('1'),
  unitPriceCents: integer('unit_price_cents').notNull().default(0),
  vatRateBps: integer('vat_rate_bps').notNull().default(1500),
  lineSubtotalCents: integer('line_subtotal_cents').notNull().default(0),
  lineVatCents: integer('line_vat_cents').notNull().default(0),
  lineTotalCents: integer('line_total_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CreditNote = typeof creditNotes.$inferSelect;
export type NewCreditNote = typeof creditNotes.$inferInsert;
export type CreditNoteLineItem = typeof creditNoteLineItems.$inferSelect;
