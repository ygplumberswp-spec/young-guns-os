import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { jobs } from './jobs';
import { leads } from './leads';
import { users } from './users';

export const quoteStatusEnum = pgEnum('quote_status', [
  'draft',
  'internal_review',
  'approved_for_sending',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'superseded',
  'converted',
  'cancelled',
]);

export const quoteLineCategoryEnum = pgEnum('quote_line_category', [
  'scope',
  'labour',
  'materials',
  'travel',
  'equipment',
  'subcontractor',
  'overhead',
  'contingency',
  'warranty',
  'discount',
  'other',
]);

export const companyFinanceSettings = pgTable('company_finance_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  defaultVatRateBps: integer('default_vat_rate_bps').notNull().default(1500),
  profitFloorMarginBps: integer('profit_floor_margin_bps').notNull().default(2000),
  allowBelowFloorWithOverride: boolean('allow_below_floor_with_override').notNull().default(true),
  currency: text('currency').notNull().default('ZAR'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  boqDocumentId: uuid('boq_document_id'),
  estimatorUserId: uuid('estimator_user_id').references(() => users.id, { onDelete: 'set null' }),
  rootQuoteId: uuid('root_quote_id'),
  supersedesQuoteId: uuid('supersedes_quote_id'),
  versionNumber: integer('version_number').notNull().default(1),
  isImmutable: boolean('is_immutable').notNull().default(false),
  quoteNumber: text('quote_number').notNull(),
  title: text('title').notNull(),
  status: quoteStatusEnum('status').notNull().default('draft'),
  amountCents: integer('amount_cents').notNull(),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  vatCents: integer('vat_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  estimatedCostCents: integer('estimated_cost_cents').notNull().default(0),
  grossProfitCents: integer('gross_profit_cents').notNull().default(0),
  markupBps: integer('markup_bps').notNull().default(0),
  marginBps: integer('margin_bps').notNull().default(0),
  profitFloorCents: integer('profit_floor_cents').notNull().default(0),
  targetPriceCents: integer('target_price_cents').notNull().default(0),
  belowFloorOverride: boolean('below_floor_override').notNull().default(false),
  belowFloorReason: text('below_floor_reason'),
  belowFloorAuthorizedBy: uuid('below_floor_authorized_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  currency: text('currency').notNull().default('ZAR'),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  scopeOfWork: text('scope_of_work'),
  exclusions: text('exclusions'),
  assumptions: text('assumptions'),
  customerNotes: text('customer_notes'),
  internalNotes: text('internal_notes'),
  paymentTerms: text('payment_terms'),
  depositPercent: integer('deposit_percent'),
  optionTier: text('option_tier'),
  notes: text('notes'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  declinedAt: timestamp('declined_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  xeroQuoteId: text('xero_quote_id'),
  xeroQuoteNumber: text('xero_quote_number'),
  clientActionId: text('client_action_id'),
  /** Import provenance — set on Xero pull; never invents financial values. */
  sourceProvider: text('source_provider'),
  sourceExternalId: text('source_external_id'),
  sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
  sourceImportJobId: uuid('source_import_job_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quoteLineItems = pgTable('quote_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  category: quoteLineCategoryEnum('category').notNull().default('other'),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull().default('1'),
  unitPriceCents: integer('unit_price_cents').notNull().default(0),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  vatRateBps: integer('vat_rate_bps').notNull().default(1500),
  lineSubtotalCents: integer('line_subtotal_cents').notNull().default(0),
  lineVatCents: integer('line_vat_cents').notNull().default(0),
  lineTotalCents: integer('line_total_cents').notNull().default(0),
  lineCostCents: integer('line_cost_cents').notNull().default(0),
  isOptional: boolean('is_optional').notNull().default(false),
  optionTier: text('option_tier'),
  accountCode: text('account_code'),
  sourceExternalId: text('source_external_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quoteAcceptances = pgTable('quote_acceptances', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id'),
  clientActionId: text('client_action_id').notNull(),
  decision: text('decision').notNull(),
  acceptedVersionNumber: integer('accepted_version_number').notNull(),
  accepterName: text('accepter_name'),
  accepterEmail: text('accepter_email'),
  acknowledgementJson: jsonb('acknowledgement_json')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  declineReason: text('decline_reason'),
  changeRequestMessage: text('change_request_message'),
  evidencePayload: jsonb('evidence_payload').$type<Record<string, unknown>>().notNull().default({}),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type QuoteLineItem = typeof quoteLineItems.$inferSelect;
export type QuoteAcceptance = typeof quoteAcceptances.$inferSelect;
export type CompanyFinanceSettings = typeof companyFinanceSettings.$inferSelect;
