import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { invoices } from './invoices';
import { users } from './users';

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
  currency: text('currency').notNull().default('ZAR'),
  method: paymentMethodEnum('method').notNull().default('other'),
  reference: text('reference'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),
  clientActionId: text('client_action_id'),
  xeroPaymentId: text('xero_payment_id'),
  xeroPaymentStatus: text('xero_payment_status'),
  /** Yoco Checkout payment id (`p_…`) — idempotency for webhook-ingested payments. */
  yocoPaymentId: text('yoco_payment_id'),
  recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  /** Import provenance — set on Xero pull; never invents financial values. */
  sourceProvider: text('source_provider'),
  sourceExternalId: text('source_external_id'),
  sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
  sourceImportJobId: uuid('source_import_job_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentReceipts = pgTable('payment_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  receiptNumber: text('receipt_number').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentReceipt = typeof paymentReceipts.$inferSelect;
