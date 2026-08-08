import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';
import { jobs } from './jobs';
import { suppliers, purchaseOrders, purchaseOrderItems } from './procurement';
import {
  jobProcurementChainLinks,
  jobProcurementChains,
  jobProcurementDeliveryEvidence,
  jobProcurementSupplierInvoiceEvidence,
} from './job-procurement-chain';

export const materialQuantityReconciliations = pgTable(
  'material_quantity_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    chainId: uuid('chain_id').references(() => jobProcurementChains.id, { onDelete: 'set null' }),
    chainLinkId: uuid('chain_link_id').references(() => jobProcurementChainLinks.id, {
      onDelete: 'set null',
    }),
    materialKey: text('material_key').notNull(),
    unit: text('unit'),
    quotedQty: numeric('quoted_qty', { precision: 18, scale: 4 }),
    orderedQty: numeric('ordered_qty', { precision: 18, scale: 4 }),
    receivedQty: numeric('received_qty', { precision: 18, scale: 4 }),
    usedQty: numeric('used_qty', { precision: 18, scale: 4 }),
    returnedToSupplierQty: numeric('returned_to_supplier_qty', { precision: 18, scale: 4 }),
    returnedToStockQty: numeric('returned_to_stock_qty', { precision: 18, scale: 4 }),
    wastedQty: numeric('wasted_qty', { precision: 18, scale: 4 }),
    unaccountedQty: numeric('unaccounted_qty', { precision: 18, scale: 4 }),
    status: text('status').notNull().default('INCOMPLETE'),
    warnings: jsonb('warnings').notNull().default([]),
    quoteBaselineUnchanged: boolean('quote_baseline_unchanged').notNull().default(true),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUidx: uniqueIndex('material_qty_recon_company_idempotency_uidx')
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    companyJobIdx: index('material_qty_recon_company_job_idx').on(table.companyId, table.jobId),
  }),
);

export const materialSupplierReturnEvents = pgTable(
  'material_supplier_return_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    chainId: uuid('chain_id').references(() => jobProcurementChains.id, { onDelete: 'set null' }),
    chainLinkId: uuid('chain_link_id').references(() => jobProcurementChainLinks.id, {
      onDelete: 'set null',
    }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    purchaseOrderLineId: uuid('purchase_order_line_id').references(() => purchaseOrderItems.id, {
      onDelete: 'set null',
    }),
    supplierInvoiceEvidenceId: uuid('supplier_invoice_evidence_id').references(
      () => jobProcurementSupplierInvoiceEvidence.id,
      { onDelete: 'set null' },
    ),
    deliveryEvidenceId: uuid('delivery_evidence_id').references(
      () => jobProcurementDeliveryEvidence.id,
      { onDelete: 'set null' },
    ),
    materialKey: text('material_key').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unit: text('unit'),
    reason: text('reason'),
    sourceDocumentRef: text('source_document_ref'),
    deletesOriginalReceipt: boolean('deletes_original_receipt').notNull().default(false),
    jpeSourceId: text('jpe_source_id'),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUidx: uniqueIndex('material_supplier_return_events_idempotency_uidx')
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  }),
);

export const materialSupplierCreditEvents = pgTable(
  'material_supplier_credit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    chainId: uuid('chain_id').references(() => jobProcurementChains.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    relatedReturnEventId: uuid('related_return_event_id').references(
      () => materialSupplierReturnEvents.id,
      { onDelete: 'set null' },
    ),
    relatedInvoiceEvidenceId: uuid('related_invoice_evidence_id').references(
      () => jobProcurementSupplierInvoiceEvidence.id,
      { onDelete: 'set null' },
    ),
    creditNoteRef: text('credit_note_ref'),
    sourceDocumentRef: text('source_document_ref'),
    amountCents: integer('amount_cents').notNull(),
    vatBasis: text('vat_basis'),
    creditDate: date('credit_date'),
    xeroCreditNoteId: text('xero_credit_note_id'),
    xeroStatus: text('xero_status').notNull().default('SUPPLIER_CREDIT_NOT_LINKED'),
    jpeSourceId: text('jpe_source_id'),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUidx: uniqueIndex('material_supplier_credit_events_idempotency_uidx')
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  }),
);

export const materialWasteEvents = pgTable(
  'material_waste_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    chainId: uuid('chain_id').references(() => jobProcurementChains.id, { onDelete: 'set null' }),
    chainLinkId: uuid('chain_link_id').references(() => jobProcurementChainLinks.id, {
      onDelete: 'set null',
    }),
    materialKey: text('material_key').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unit: text('unit'),
    reason: text('reason'),
    sourceEvidenceRef: text('source_evidence_ref'),
    jpeSourceId: text('jpe_source_id'),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUidx: uniqueIndex('material_waste_events_idempotency_uidx')
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  }),
);

export const materialReturnToStockEvents = pgTable(
  'material_return_to_stock_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    chainId: uuid('chain_id').references(() => jobProcurementChains.id, { onDelete: 'set null' }),
    chainLinkId: uuid('chain_link_id').references(() => jobProcurementChainLinks.id, {
      onDelete: 'set null',
    }),
    materialKey: text('material_key').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unit: text('unit'),
    stockMovementId: uuid('stock_movement_id'),
    jpeSourceId: text('jpe_source_id'),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUidx: uniqueIndex('material_return_to_stock_events_idempotency_uidx')
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  }),
);

export type MaterialQuantityReconciliation = typeof materialQuantityReconciliations.$inferSelect;
export type MaterialSupplierReturnEvent = typeof materialSupplierReturnEvents.$inferSelect;
export type MaterialSupplierCreditEvent = typeof materialSupplierCreditEvents.$inferSelect;
export type MaterialWasteEvent = typeof materialWasteEvents.$inferSelect;
export type MaterialReturnToStockEvent = typeof materialReturnToStockEvents.$inferSelect;
