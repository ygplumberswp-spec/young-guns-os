import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { inventoryItems } from './inventory-items';
import { jobs } from './jobs';
import { suppliers } from './procurement';
import { users } from './users';

export const qualityComebackTypeEnum = pgEnum('quality_comeback_type', [
  'callback',
  'revisit',
  'warranty_visit',
  'quality_inspection',
]);

export const qualityComebackStatusEnum = pgEnum('quality_comeback_status', [
  'open',
  'investigating',
  'resolved',
  'closed',
  'cancelled',
]);

export const qualityRootCauseEnum = pgEnum('quality_root_cause', [
  'installation_error',
  'workmanship',
  'wrong_diagnosis',
  'incorrect_materials',
  'defective_materials',
  'manufacturer_defect',
  'customer_misuse',
  'unrelated_new_fault',
  'wear_and_tear',
  'warranty',
  'unknown',
]);

export const qualityActionTypeEnum = pgEnum('quality_action_type', [
  'coaching',
  'retraining',
  'warning',
  'labour_recovery',
  'material_recovery',
  'payroll_recommendation',
]);

export const qualityActionStatusEnum = pgEnum('quality_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const qualityComebacks = pgTable('quality_comebacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  comebackType: qualityComebackTypeEnum('comeback_type').notNull(),
  status: qualityComebackStatusEnum('status').notNull().default('open'),
  originalJobId: uuid('original_job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'restrict' }),
  comebackJobId: uuid('comeback_job_id').references(() => jobs.id, { onDelete: 'set null' }),
  originalTechnicianId: uuid('original_technician_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  currentTechnicianId: uuid('current_technician_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  branchKey: text('branch_key'),
  reason: text('reason').notNull(),
  resolution: text('resolution'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  labourHours: numeric('labour_hours', { precision: 8, scale: 2 }),
  photoDocumentIds: jsonb('photo_document_ids').$type<string[]>().notNull().default([]),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const qualityRootCauseAnalyses = pgTable('quality_root_cause_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  comebackId: uuid('comeback_id')
    .notNull()
    .references(() => qualityComebacks.id, { onDelete: 'cascade' }),
  classification: qualityRootCauseEnum('classification').notNull(),
  notes: text('notes'),
  auraRecommendedCause: qualityRootCauseEnum('aura_recommended_cause'),
  auraConfidence: numeric('aura_confidence', { precision: 5, scale: 2 }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const qualityCostEntries = pgTable('quality_cost_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  comebackId: uuid('comeback_id')
    .notNull()
    .references(() => qualityComebacks.id, { onDelete: 'cascade' }),
  labourCostCents: integer('labour_cost_cents').notNull().default(0),
  materialCostCents: integer('material_cost_cents').notNull().default(0),
  travelCostCents: integer('travel_cost_cents').notNull().default(0),
  totalComebackCostCents: integer('total_comeback_cost_cents').notNull().default(0),
  warrantyCostCents: integer('warranty_cost_cents').notNull().default(0),
  supplierRecoveryCents: integer('supplier_recovery_cents').notNull().default(0),
  companyLossCents: integer('company_loss_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const qualityWarrantyClaims = pgTable('quality_warranty_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  comebackId: uuid('comeback_id').references(() => qualityComebacks.id, { onDelete: 'set null' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  status: qualityComebackStatusEnum('status').notNull().default('open'),
  claimNumber: text('claim_number'),
  description: text('description').notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const qualitySupplierDefects = pgTable('quality_supplier_defects', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  comebackId: uuid('comeback_id').references(() => qualityComebacks.id, { onDelete: 'set null' }),
  defectDescription: text('defect_description').notNull(),
  isRecurring: boolean('is_recurring').notNull().default(false),
  warrantyClaimId: uuid('warranty_claim_id').references(() => qualityWarrantyClaims.id, {
    onDelete: 'set null',
  }),
  replacementCount: integer('replacement_count').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const qualityActions = pgTable('quality_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: qualityActionTypeEnum('action_type').notNull(),
  status: qualityActionStatusEnum('status').notNull().default('pending_approval'),
  technicianId: uuid('technician_id').references(() => users.id, { onDelete: 'set null' }),
  comebackId: uuid('comeback_id').references(() => qualityComebacks.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type QualityComeback = typeof qualityComebacks.$inferSelect;
export type QualityRootCauseAnalysis = typeof qualityRootCauseAnalyses.$inferSelect;
export type QualityCostEntry = typeof qualityCostEntries.$inferSelect;
export type QualityWarrantyClaim = typeof qualityWarrantyClaims.$inferSelect;
export type QualitySupplierDefect = typeof qualitySupplierDefects.$inferSelect;
export type QualityAction = typeof qualityActions.$inferSelect;
