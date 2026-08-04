import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { jobs } from './jobs';
import { quoteLineItems, quotes } from './quotes';

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'paid',
  'partial',
  'overdue',
  'cancelled',
]);

export const invoiceStageEnum = pgEnum('invoice_stage', [
  'deposit',
  'progress',
  'final',
  'standard',
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
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  quoteVersionNumber: integer('quote_version_number'),
  stage: invoiceStageEnum('stage').notNull().default('standard'),
  /** Legacy + displayable internal identifier — never invent a Xero number here. */
  invoiceNumber: text('invoice_number').notNull(),
  internalNumber: text('internal_number'),
  xeroInvoiceNumber: text('xero_invoice_number'),
  xeroReference: text('xero_reference'),
  numberAuthority: text('number_authority').notNull().default('internal_pending_xero'),
  /** Legacy DB column — not user-facing (Phase J-6). Application always sets customer name or ''. */
  title: text('title').notNull().default(''),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  amountCents: integer('amount_cents').notNull(),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  vatCents: integer('vat_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  amountPaidCents: integer('amount_paid_cents').notNull().default(0),
  currency: text('currency').notNull().default('ZAR'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  paymentTerms: text('payment_terms'),
  billingName: text('billing_name'),
  billingEmail: text('billing_email'),
  billingPhone: text('billing_phone'),
  billingAddress: text('billing_address'),
  siteAddress: text('site_address'),
  postalAddress: text('postal_address'),
  notes: text('notes'),
  cancelReason: text('cancel_reason'),
  clientActionId: text('client_action_id'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  /** Import provenance — set on Xero pull; never invents financial values. */
  sourceProvider: text('source_provider'),
  sourceExternalId: text('source_external_id'),
  sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
  sourceImportJobId: uuid('source_import_job_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceLineItems = pgTable('invoice_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  quoteLineItemId: uuid('quote_line_item_id').references(() => quoteLineItems.id, {
    onDelete: 'set null',
  }),
  position: integer('position').notNull().default(0),
  category: text('category').notNull().default('other'),
  description: text('description').notNull(),
  quantity: text('quantity').notNull().default('1'),
  unitPriceCents: integer('unit_price_cents').notNull().default(0),
  vatRateBps: integer('vat_rate_bps').notNull().default(1500),
  lineSubtotalCents: integer('line_subtotal_cents').notNull().default(0),
  lineVatCents: integer('line_vat_cents').notNull().default(0),
  lineTotalCents: integer('line_total_cents').notNull().default(0),
  accountCode: text('account_code'),
  sourceExternalId: text('source_external_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
