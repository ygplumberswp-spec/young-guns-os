import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { assetEquipment } from './asset-equipment';
import { companies } from './companies';
import { customers } from './customers';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { users } from './users';

export const equipmentImportActionEnum = pgEnum('equipment_import_action', [
  'DISCOVERED',
  'EXACT_MATCH',
  'CREATE',
  'UPDATE',
  'UNCHANGED',
  'REVIEW_REQUIRED',
  'SKIP',
  'FAILED',
]);

export const equipmentImportReviewStatusEnum = pgEnum('equipment_import_review_status', [
  'open',
  'deferred',
  'resolved_create',
  'resolved_update',
  'resolved_skip',
  'dismissed',
]);

export const equipmentImportAuditActionEnum = pgEnum('equipment_import_audit_action', [
  'equipment_create',
  'equipment_update',
  'customer_association',
  'property_association',
  'property_unlink',
  'job_service_linkage',
  'lifecycle_change',
  'source_reconciliation',
  'review_resolution',
  'preview',
  'apply_batch',
]);

export const equipmentImportReviews = pgTable(
  'equipment_import_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sourceProvider: text('source_provider').notNull(),
    sourceExternalId: text('source_external_id'),
    sourceFingerprint: text('source_fingerprint').notNull(),
    matchedAssetId: uuid('matched_asset_id').references(() => assetEquipment.id, {
      onDelete: 'set null',
    }),
    proposedCustomerId: uuid('proposed_customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    proposedPropertyId: uuid('proposed_property_id').references(() => cxCustomerProperties.id, {
      onDelete: 'set null',
    }),
    action: equipmentImportActionEnum('action').notNull().default('REVIEW_REQUIRED'),
    status: equipmentImportReviewStatusEnum('status').notNull().default('open'),
    reviewReasons: jsonb('review_reasons').$type<string[]>().notNull().default([]),
    matchReason: text('match_reason'),
    sourcePayload: jsonb('source_payload').$type<Record<string, unknown>>().notNull().default({}),
    previewPayload: jsonb('preview_payload').$type<Record<string, unknown>>().notNull().default({}),
    fieldConflicts: jsonb('field_conflicts')
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    decisionNotes: text('decision_notes'),
    resolvedAssetId: uuid('resolved_asset_id').references(() => assetEquipment.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fingerprintUnique: uniqueIndex('equipment_import_reviews_fingerprint_uidx').on(
      table.companyId,
      table.sourceFingerprint,
    ),
    statusIdx: index('equipment_import_reviews_status_idx').on(table.companyId, table.status),
    sourceIdx: index('equipment_import_reviews_source_idx').on(
      table.companyId,
      table.sourceProvider,
      table.sourceExternalId,
    ),
  }),
);

export const equipmentImportAuditLogs = pgTable(
  'equipment_import_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => assetEquipment.id, { onDelete: 'set null' }),
    reviewId: uuid('review_id').references(() => equipmentImportReviews.id, {
      onDelete: 'set null',
    }),
    action: equipmentImportAuditActionEnum('action').notNull(),
    sourceProvider: text('source_provider'),
    sourceExternalId: text('source_external_id'),
    beforeMetadata: jsonb('before_metadata').$type<Record<string, unknown>>().notNull().default({}),
    afterMetadata: jsonb('after_metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('equipment_import_audit_logs_company_idx').on(
      table.companyId,
      table.createdAt,
    ),
    assetIdx: index('equipment_import_audit_logs_asset_idx').on(table.companyId, table.assetId),
  }),
);
