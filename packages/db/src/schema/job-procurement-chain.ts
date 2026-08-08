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
import { quotes } from './quotes';
import { suppliers } from './procurement';
import { purchaseOrderItems, purchaseOrders } from './procurement';
import { boqImportRows, boqImports } from './boq-workbook-import';
import {
  boqSplitPurchaseProposalLines,
  boqSplitPurchaseProposals,
} from './boq-supplier-comparison';
import { xeroBills } from './xero-financial-history';

export const jobProcurementChains = pgTable(
  'job_procurement_chains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    boqImportId: uuid('boq_import_id').references(() => boqImports.id, { onDelete: 'set null' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    splitProposalId: uuid('split_proposal_id').references(() => boqSplitPurchaseProposals.id, {
      onDelete: 'set null',
    }),
    purchasePath: text('purchase_path').notNull().default('DIRECT_TO_JOB'),
    status: text('status').notNull().default('DRAFT'),
    warnings: jsonb('warnings').notNull().default([]),
    auraNarrativeFacts: jsonb('aura_narrative_facts').notNull().default([]),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUidx: uniqueIndex('job_procurement_chains_company_idempotency_uidx')
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    clientActionUidx: uniqueIndex('job_procurement_chains_company_client_action_uidx')
      .on(table.companyId, table.clientActionId)
      .where(sql`${table.clientActionId} IS NOT NULL`),
    companyJobIdx: index('job_procurement_chains_company_job_idx').on(table.companyId, table.jobId),
  }),
);

export const jobProcurementChainLinks = pgTable(
  'job_procurement_chain_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    chainId: uuid('chain_id')
      .notNull()
      .references(() => jobProcurementChains.id, { onDelete: 'cascade' }),
    boqImportRowId: uuid('boq_import_row_id').references(() => boqImportRows.id, {
      onDelete: 'set null',
    }),
    quoteLineId: uuid('quote_line_id'),
    splitProposalLineId: uuid('split_proposal_line_id').references(
      () => boqSplitPurchaseProposalLines.id,
      { onDelete: 'set null' },
    ),
    row100ProposalKey: text('row100_proposal_key'),
    offerKey: text('offer_key'),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    purchaseOrderLineId: uuid('purchase_order_line_id').references(() => purchaseOrderItems.id, {
      onDelete: 'set null',
    }),
    deliveryEvidenceId: uuid('delivery_evidence_id'),
    supplierInvoiceEvidenceId: uuid('supplier_invoice_evidence_id'),
    xeroBillId: uuid('xero_bill_id').references(() => xeroBills.id, { onDelete: 'set null' }),
    xeroInvoiceId: text('xero_invoice_id'),
    stockMovementId: uuid('stock_movement_id'),
    materialUseTransactionId: text('material_use_transaction_id'),
    jpeSourceType: text('jpe_source_type'),
    jpeSourceId: text('jpe_source_id'),
    costAuthority: text('cost_authority'),
    quantity: numeric('quantity', { precision: 18, scale: 4 }),
    unitPriceCents: integer('unit_price_cents'),
    lineCostCents: integer('line_cost_cents'),
    vatBasis: text('vat_basis'),
    warnings: jsonb('warnings').notNull().default([]),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chainIdx: index('job_procurement_chain_links_chain_idx').on(table.chainId, table.position),
    jpeUidx: uniqueIndex('job_procurement_chain_links_jpe_uidx')
      .on(table.companyId, table.jpeSourceType, table.jpeSourceId)
      .where(sql`${table.jpeSourceId} IS NOT NULL AND ${table.jpeSourceType} IS NOT NULL`),
  }),
);

export const jobProcurementDeliveryEvidence = pgTable('job_procurement_delivery_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  chainId: uuid('chain_id')
    .notNull()
    .references(() => jobProcurementChains.id, { onDelete: 'cascade' }),
  chainLinkId: uuid('chain_link_id').references(() => jobProcurementChainLinks.id, {
    onDelete: 'set null',
  }),
  purchaseOrderId: uuid('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  purchaseOrderLineId: uuid('purchase_order_line_id')
    .notNull()
    .references(() => purchaseOrderItems.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  deliveredQuantity: numeric('delivered_quantity', { precision: 18, scale: 4 }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  deliveryReference: text('delivery_reference'),
  isPartial: boolean('is_partial').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobProcurementSupplierInvoiceEvidence = pgTable(
  'job_procurement_supplier_invoice_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    chainId: uuid('chain_id')
      .notNull()
      .references(() => jobProcurementChains.id, { onDelete: 'cascade' }),
    chainLinkId: uuid('chain_link_id').references(() => jobProcurementChainLinks.id, {
      onDelete: 'set null',
    }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    purchaseOrderLineId: uuid('purchase_order_line_id').references(() => purchaseOrderItems.id, {
      onDelete: 'set null',
    }),
    deliveryEvidenceId: uuid('delivery_evidence_id').references(
      () => jobProcurementDeliveryEvidence.id,
      { onDelete: 'set null' },
    ),
    invoiceNumber: text('invoice_number'),
    invoiceDate: date('invoice_date'),
    sourceDocumentRef: text('source_document_ref'),
    lineQuantity: numeric('line_quantity', { precision: 18, scale: 4 }),
    lineCostCents: integer('line_cost_cents'),
    vatBasis: text('vat_basis'),
    missingFields: jsonb('missing_fields').notNull().default([]),
    warnings: jsonb('warnings').notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export type JobProcurementChain = typeof jobProcurementChains.$inferSelect;
export type JobProcurementChainLink = typeof jobProcurementChainLinks.$inferSelect;
export type JobProcurementDeliveryEvidence = typeof jobProcurementDeliveryEvidence.$inferSelect;
export type JobProcurementSupplierInvoiceEvidence =
  typeof jobProcurementSupplierInvoiceEvidence.$inferSelect;
