import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { customers } from './customers';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { invoices } from './invoices';
import { jobs } from './jobs';
import { payments } from './payments';
import { quotes } from './quotes';
import { users } from './users';

export const titanDocumentTypeEnum = pgEnum('titan_document_type', ['invoice', 'quote', 'report']);

/** Report variants: service, inspection and maintenance share one engine. */
export const titanReportKindEnum = pgEnum('titan_report_kind', [
  'service',
  'inspection',
  'maintenance',
]);

export const titanDocumentStatusEnum = pgEnum('titan_document_status', [
  'draft',
  'in_review',
  'issued',
  'superseded',
  'cancelled',
]);

/**
 * A rendered document over an existing invoice/quote/job. It owns presentation
 * and narrative content only — money always comes from the linked finance row,
 * and Xero remains the financial source of truth.
 */
export const titanDocuments = pgTable(
  'titan_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    documentType: titanDocumentTypeEnum('document_type').notNull(),
    /** Set only when `document_type` is `report`. */
    reportKind: titanReportKindEnum('report_kind'),
    status: titanDocumentStatusEnum('status').notNull().default('draft'),
    /** Increments on each issued revision; payment links are scoped to it. */
    version: integer('version').notNull().default(1),
    supersedesDocumentId: uuid('supersedes_document_id'),
    documentNumber: text('document_number').notNull(),
    title: text('title').notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
      onDelete: 'set null',
    }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'cascade' }),
    /** Ordered section model — see shared `DocumentSection`. */
    sections: jsonb('sections').$type<unknown[]>().notNull().default([]),
    /** Ordered photo references — see shared `DocumentPhoto`. Bytes stay in job evidence. */
    photos: jsonb('photos').$type<unknown[]>().notNull().default([]),
    /** Owner-authored wording that is not a section payload (notes, warranty text). */
    content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),
    /** Certificate of Compliance evidence record, when one is genuinely attached. */
    cocDocumentationId: uuid('coc_documentation_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    issuedByUserId: uuid('issued_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    clientActionId: text('client_action_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTypeIdx: index('titan_documents_company_type_idx').on(
      table.companyId,
      table.documentType,
      table.status,
    ),
    invoiceIdx: index('titan_documents_invoice_idx').on(table.companyId, table.invoiceId),
    quoteIdx: index('titan_documents_quote_idx').on(table.companyId, table.quoteId),
    numberUnique: uniqueIndex('titan_documents_number_version_unique').on(
      table.companyId,
      table.documentNumber,
      table.version,
    ),
  }),
);

/** Immutable snapshot written whenever a document is issued or superseded. */
export const titanDocumentVersions = pgTable(
  'titan_document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => titanDocuments.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: titanDocumentStatusEnum('status').notNull(),
    /** Full document state at the moment of the snapshot. */
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull().default({}),
    changeSummary: text('change_summary'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentVersionUnique: uniqueIndex('titan_document_versions_unique').on(
      table.documentId,
      table.version,
    ),
  }),
);

export const paymentLinkProviderEnum = pgEnum('payment_link_provider', ['yoco']);

export const paymentLinkStatusEnum = pgEnum('payment_link_status', [
  'prepared',
  'active',
  'superseded',
  'paid',
  'cancelled',
  'failed',
]);

/**
 * One Yoco payment link per invoice version and outstanding balance.
 *
 * The partial unique index below is the database-level guarantee that an invoice
 * cannot end up with two live links inviting different amounts.
 */
export const invoicePaymentLinks = pgTable(
  'invoice_payment_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    documentId: uuid('document_id').references(() => titanDocuments.id, { onDelete: 'set null' }),
    provider: paymentLinkProviderEnum('provider').notNull().default('yoco'),
    status: paymentLinkStatusEnum('status').notNull().default('prepared'),
    /** Invoice document version this link was authorised against. */
    documentVersion: integer('document_version').notNull().default(1),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    /** Yoco payment-link id. Null while the record is only `prepared`. */
    providerPaymentLinkId: text('provider_payment_link_id'),
    providerOrderId: text('provider_order_id'),
    /** Hosted pay.yoco.com URL. Never populated with anything else. */
    paymentUrl: text('payment_url'),
    providerStatus: text('provider_status'),
    /** Stable key preventing duplicate creation for the same version and balance. */
    idempotencyKey: text('idempotency_key').notNull(),
    /** Correlates the prepare, approve and create steps in security_audit_logs. */
    auditCorrelationId: text('audit_correlation_id').notNull(),
    reference: text('reference'),
    description: text('description'),
    lastError: text('last_error'),
    preparedByUserId: uuid('prepared_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    supersededByLinkId: uuid('superseded_by_link_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex('invoice_payment_links_idempotency_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    /** At most one live link per invoice — enforced by the database, not by code. */
    oneLiveLinkPerInvoice: uniqueIndex('invoice_payment_links_one_live_per_invoice')
      .on(table.invoiceId)
      .where(sql`status in ('prepared', 'active')`),
    providerLinkUnique: uniqueIndex('invoice_payment_links_provider_link_unique').on(
      table.provider,
      table.providerPaymentLinkId,
    ),
    companyStatusIdx: index('invoice_payment_links_company_status_idx').on(
      table.companyId,
      table.status,
    ),
  }),
);

export const paymentLinkEventTypeEnum = pgEnum('payment_link_event_type', [
  'prepared',
  'approved',
  'created',
  'creation_failed',
  'regenerated',
  'superseded',
  'cancelled',
  'webhook_payment_created',
  'webhook_rejected',
]);

/** Append-only lifecycle trail for a payment link, in addition to security audit logs. */
export const invoicePaymentLinkEvents = pgTable(
  'invoice_payment_link_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    paymentLinkId: uuid('payment_link_id').references(() => invoicePaymentLinks.id, {
      onDelete: 'cascade',
    }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
    eventType: paymentLinkEventTypeEnum('event_type').notNull(),
    auditCorrelationId: text('audit_correlation_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    amountCents: integer('amount_cents'),
    detail: text('detail'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    linkIdx: index('invoice_payment_link_events_link_idx').on(table.companyId, table.paymentLinkId),
  }),
);

/**
 * Verified Yoco webhook deliveries, keyed on the provider event id so a retry
 * is processed exactly once.
 */
export const yocoWebhookDeliveries = pgTable(
  'yoco_webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Yoco event id from the webhook body. */
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    providerPaymentId: text('provider_payment_id'),
    providerPaymentLinkId: text('provider_payment_link_id'),
    paymentLinkId: uuid('payment_link_id').references(() => invoicePaymentLinks.id, {
      onDelete: 'set null',
    }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    amountCents: integer('amount_cents'),
    currency: text('currency'),
    signatureVerified: boolean('signature_verified').notNull().default(false),
    /** True only when the delivery caused a state change; retries stay false. */
    applied: boolean('applied').notNull().default(false),
    rejectionReason: text('rejection_reason'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    eventUnique: uniqueIndex('yoco_webhook_deliveries_event_unique').on(
      table.companyId,
      table.providerEventId,
    ),
    paymentUnique: uniqueIndex('yoco_webhook_deliveries_payment_unique').on(
      table.companyId,
      table.providerPaymentId,
    ),
  }),
);

export type TitanDocumentRow = typeof titanDocuments.$inferSelect;
export type NewTitanDocument = typeof titanDocuments.$inferInsert;
export type TitanDocumentVersionRow = typeof titanDocumentVersions.$inferSelect;
export type InvoicePaymentLink = typeof invoicePaymentLinks.$inferSelect;
export type NewInvoicePaymentLink = typeof invoicePaymentLinks.$inferInsert;
export type InvoicePaymentLinkEvent = typeof invoicePaymentLinkEvents.$inferSelect;
export type YocoWebhookDelivery = typeof yocoWebhookDeliveries.$inferSelect;
