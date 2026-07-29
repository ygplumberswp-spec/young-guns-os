import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { invoices } from './invoices';

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'card',
  'bank_transfer',
  'other',
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'restrict' }),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  method: paymentMethodEnum('method').notNull().default('other'),
  reference: text('reference'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
