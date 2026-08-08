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
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { jobs } from './jobs';
import { users } from './users';
import { purchaseOrderItems, purchaseOrders, suppliers } from './procurement';
import { jobProcurementSupplierInvoiceEvidence } from './job-procurement-chain';

export const multiJobSupplierInvoices = pgTable('multi_job_supplier_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  supplierInvoiceEvidenceId: uuid('supplier_invoice_evidence_id').references(
    () => jobProcurementSupplierInvoiceEvidence.id,
    { onDelete: 'set null' },
  ),
  sourceDocumentRef: text('source_document_ref'),
  sourceDocumentHash: text('source_document_hash'),
  invoiceNumber: text('invoice_number'),
  invoiceDate: date('invoice_date'),
  netAmountCents: integer('net_amount_cents'),
  vatAmountCents: integer('vat_amount_cents'),
  vatBasis: text('vat_basis'),
  grossAmountCents: integer('gross_amount_cents'),
  knownXeroBillId: text('known_xero_bill_id'),
  knownXeroInvoiceId: text('known_xero_invoice_id'),
  xeroLinkStatus: text('xero_link_status').notNull().default('XERO_BILL_NOT_LINKED'),
  immutableSource: boolean('immutable_source').notNull().default(true),
  balanceStatus: text('balance_status').notNull().default('UNALLOCATED'),
  warnings: jsonb('warnings').notNull().default([]),
  idempotencyKey: text('idempotency_key'),
  clientActionId: text('client_action_id'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const multiJobSupplierInvoiceLines = pgTable('multi_job_supplier_invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => multiJobSupplierInvoices.id, { onDelete: 'cascade' }),
  lineOrder: integer('line_order').notNull().default(1),
  itemCode: text('item_code'),
  description: text('description'),
  quantity: numeric('quantity', { precision: 18, scale: 4 }),
  unit: text('unit'),
  netAmountCents: integer('net_amount_cents'),
  vatAmountCents: integer('vat_amount_cents'),
  vatBasis: text('vat_basis'),
  grossAmountCents: integer('gross_amount_cents'),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
    onDelete: 'set null',
  }),
  purchaseOrderLineId: uuid('purchase_order_line_id').references(() => purchaseOrderItems.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const multiJobSupplierInvoiceAllocations = pgTable(
  'multi_job_supplier_invoice_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => multiJobSupplierInvoices.id, { onDelete: 'cascade' }),
    invoiceLineId: uuid('invoice_line_id').references(() => multiJobSupplierInvoiceLines.id, {
      onDelete: 'set null',
    }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    purchaseOrderLineId: uuid('purchase_order_line_id').references(() => purchaseOrderItems.id, {
      onDelete: 'set null',
    }),
    allocationKey: text('allocation_key').notNull(),
    allocationNetCents: integer('allocation_net_cents').notNull(),
    allocationVatCents: integer('allocation_vat_cents'),
    allocationGrossCents: integer('allocation_gross_cents'),
    allocationQuantity: numeric('allocation_quantity', { precision: 18, scale: 4 }),
    reason: text('reason'),
    reviewStatus: text('review_status').notNull().default('DRAFT'),
    warnings: jsonb('warnings').notNull().default([]),
    jpeSourceId: text('jpe_source_id'),
    jpePosted: boolean('jpe_posted').notNull().default(false),
    supersededByAllocationId: uuid('superseded_by_allocation_id'),
    correctionOfAllocationId: uuid('correction_of_allocation_id'),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const multiJobSupplierInvoiceAllocationCorrections = pgTable(
  'multi_job_supplier_invoice_allocation_corrections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => multiJobSupplierInvoices.id, { onDelete: 'cascade' }),
    priorAllocationId: uuid('prior_allocation_id')
      .notNull()
      .references(() => multiJobSupplierInvoiceAllocations.id, { onDelete: 'cascade' }),
    newAllocationId: uuid('new_allocation_id').references(
      () => multiJobSupplierInvoiceAllocations.id,
      { onDelete: 'set null' },
    ),
    correctionKey: text('correction_key').notNull(),
    reverseAmountCents: integer('reverse_amount_cents').notNull(),
    reason: text('reason').notNull(),
    preservesHistory: boolean('preserves_history').notNull().default(true),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export type MultiJobSupplierInvoice = typeof multiJobSupplierInvoices.$inferSelect;
export type MultiJobSupplierInvoiceLine = typeof multiJobSupplierInvoiceLines.$inferSelect;
export type MultiJobSupplierInvoiceAllocation =
  typeof multiJobSupplierInvoiceAllocations.$inferSelect;
export type MultiJobSupplierInvoiceAllocationCorrection =
  typeof multiJobSupplierInvoiceAllocationCorrections.$inferSelect;
