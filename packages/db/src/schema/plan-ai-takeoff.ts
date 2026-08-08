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
import { planEstimateItems, planEstimates } from './plan-estimates';

export const planEstimateAiTakeoffs = pgTable(
  'plan_estimate_ai_takeoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    estimateId: uuid('estimate_id')
      .notNull()
      .references(() => planEstimates.id, { onDelete: 'cascade' }),
    sourceDocumentId: uuid('source_document_id'),
    sourceRevisionLabel: text('source_revision_label'),
    scaleStatus: text('scale_status').notNull().default('SCALE_NOT_PROVIDED'),
    scaleProvenance: text('scale_provenance'),
    status: text('status').notNull().default('READY_FOR_REVIEW'),
    providerPath: text('provider_path').notNull().default('AURA_STRUCTURED_EVIDENCE_CANDIDATES'),
    idempotencyKey: text('idempotency_key'),
    humanReviewRequired: boolean('human_review_required').notNull().default(true),
    humanReviewReasons: jsonb('human_review_reasons').notNull().default([]),
    ambiguityFlags: jsonb('ambiguity_flags').notNull().default([]),
    warnings: jsonb('warnings').notNull().default([]),
    auraNarrativeFacts: jsonb('aura_narrative_facts').notNull().default([]),
    evidenceSummary: jsonb('evidence_summary').notNull().default({}),
    revisionMeta: jsonb('revision_meta').notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    estimateIdx: index('plan_estimate_ai_takeoffs_estimate_idx').on(
      table.companyId,
      table.estimateId,
    ),
    idempotencyUidx: uniqueIndex('plan_estimate_ai_takeoffs_idempotency_uidx')
      .on(table.companyId, table.estimateId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  }),
);

export const planEstimateAiTakeoffItems = pgTable(
  'plan_estimate_ai_takeoff_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    takeoffId: uuid('takeoff_id')
      .notNull()
      .references(() => planEstimateAiTakeoffs.id, { onDelete: 'cascade' }),
    estimateId: uuid('estimate_id')
      .notNull()
      .references(() => planEstimates.id, { onDelete: 'cascade' }),
    clientKey: text('client_key').notNull(),
    pointType: text('point_type').notNull(),
    subtypeLabel: text('subtype_label'),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }),
    unit: text('unit').notNull().default('each'),
    isLengthMeasurement: boolean('is_length_measurement').notNull().default(false),
    quantityOrigin: text('quantity_origin').notNull(),
    pageReference: text('page_reference'),
    annotationRef: text('annotation_ref'),
    supportingText: text('supporting_text'),
    lifecycle: text('lifecycle').notNull().default('AI_DRAFT'),
    row94Confidence: text('row94_confidence').notNull().default('REVIEW_REQUIRED'),
    providerConfidence: text('provider_confidence').notNull().default('NONE'),
    ambiguityFlags: jsonb('ambiguity_flags').notNull().default([]),
    measurementAllowed: boolean('measurement_allowed').notNull().default(true),
    evidence: jsonb('evidence').notNull().default({}),
    blockedReasons: jsonb('blocked_reasons').notNull().default([]),
    humanConfirmed: boolean('human_confirmed').notNull().default(false),
    entersCanonicalEstimate: boolean('enters_canonical_estimate').notNull().default(false),
    canonicalItemId: uuid('canonical_item_id').references(() => planEstimateItems.id, {
      onDelete: 'set null',
    }),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    takeoffIdx: index('plan_estimate_ai_takeoff_items_takeoff_idx').on(
      table.companyId,
      table.takeoffId,
    ),
    estimateIdx: index('plan_estimate_ai_takeoff_items_estimate_idx').on(
      table.companyId,
      table.estimateId,
    ),
  }),
);

export type PlanEstimateAiTakeoff = typeof planEstimateAiTakeoffs.$inferSelect;
export type PlanEstimateAiTakeoffItem = typeof planEstimateAiTakeoffItems.$inferSelect;
