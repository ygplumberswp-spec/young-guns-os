import {
  boolean,
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
import { boqImportRows, boqImports } from './boq-workbook-import';

export const boqSplitPurchaseProposals = pgTable(
  'boq_split_purchase_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    boqImportId: uuid('boq_import_id')
      .notNull()
      .references(() => boqImports.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('DRAFT'),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    warnings: jsonb('warnings').notNull().default([]),
    auraNarrativeFacts: jsonb('aura_narrative_facts').notNull().default([]),
    supplierSubtotalCents: integer('supplier_subtotal_cents'),
    vatCents: integer('vat_cents'),
    deliveryCents: integer('delivery_cents'),
    totalProposedPurchasingCostCents: integer('total_proposed_purchasing_cost_cents'),
    totalsIncomplete: boolean('totals_incomplete').notNull().default(true),
    missingFields: jsonb('missing_fields').notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUidx: uniqueIndex('boq_split_purchase_proposals_company_idempotency_uidx')
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    clientActionUidx: uniqueIndex('boq_split_purchase_proposals_company_client_action_uidx')
      .on(table.companyId, table.clientActionId)
      .where(sql`${table.clientActionId} IS NOT NULL`),
    companyBoqIdx: index('boq_split_purchase_proposals_company_boq_idx').on(
      table.companyId,
      table.boqImportId,
    ),
  }),
);

export const boqSplitPurchaseProposalLines = pgTable(
  'boq_split_purchase_proposal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => boqSplitPurchaseProposals.id, { onDelete: 'cascade' }),
    boqImportId: uuid('boq_import_id')
      .notNull()
      .references(() => boqImports.id, { onDelete: 'cascade' }),
    boqImportRowId: uuid('boq_import_row_id')
      .notNull()
      .references(() => boqImportRows.id, { onDelete: 'cascade' }),
    offerKey: text('offer_key').notNull(),
    supplierId: uuid('supplier_id'),
    supplierName: text('supplier_name').notNull(),
    supplierDocumentRef: text('supplier_document_ref'),
    row100ProposalKey: text('row100_proposal_key'),
    quantityProposed: numeric('quantity_proposed', { precision: 18, scale: 4 }),
    unitPriceCents: integer('unit_price_cents'),
    vatBasis: text('vat_basis').notNull().default('UNKNOWN'),
    lineSubtotalCents: integer('line_subtotal_cents'),
    lineVatCents: integer('line_vat_cents'),
    deliveryCents: integer('delivery_cents'),
    expectedSupplierCostCents: integer('expected_supplier_cost_cents'),
    mismatchFlags: jsonb('mismatch_flags').notNull().default([]),
    warnings: jsonb('warnings').notNull().default([]),
    isSubstitute: boolean('is_substitute').notNull().default(false),
    sourceEvidence: jsonb('source_evidence').notNull().default({}),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    proposalIdx: index('boq_split_purchase_proposal_lines_proposal_idx').on(
      table.proposalId,
      table.position,
    ),
  }),
);

export type BoqSplitPurchaseProposal = typeof boqSplitPurchaseProposals.$inferSelect;
export type BoqSplitPurchaseProposalLine = typeof boqSplitPurchaseProposalLines.$inferSelect;
