import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { jobs } from './jobs';
import { quotes } from './quotes';

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'paid',
  'partial',
  'overdue',
  'cancelled',
]);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  invoiceNumber: text('invoice_number').notNull(),
  title: text('title').notNull(),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  amountCents: integer('amount_cents').notNull(),
  amountPaidCents: integer('amount_paid_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  notes: text('notes'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
