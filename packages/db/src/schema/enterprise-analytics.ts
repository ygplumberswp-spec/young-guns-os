import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessDashboardTypeEnum, businessReports } from './business-intelligence';
import { companies } from './companies';
import { roles } from './roles';
import { users } from './users';

export const analyticsDataModuleEnum = pgEnum('analytics_data_module', [
  'finance',
  'sales',
  'marketing',
  'operations',
  'dispatch',
  'fleet',
  'inventory',
  'procurement',
  'hr',
  'customer_success',
  'ai',
  'productivity',
]);

export const analyticsPermissionScopeEnum = pgEnum('analytics_permission_scope', [
  'read',
  'write',
  'admin',
]);

export const analyticsPlatformActionTypeEnum = pgEnum('analytics_platform_action_type', [
  'strategic_report',
  'kpi_recommendation',
  'forecast_review',
  'governance_action',
]);

export const analyticsPlatformActionStatusEnum = pgEnum('analytics_platform_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const analyticsDataSnapshots = pgTable('analytics_data_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  module: analyticsDataModuleEnum('module').notNull(),
  snapshotKey: text('snapshot_key').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  recordCount: integer('record_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsDataLineage = pgTable('analytics_data_lineage', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceModule: analyticsDataModuleEnum('source_module').notNull(),
  targetModule: analyticsDataModuleEnum('target_module').notNull(),
  transformation: text('transformation').notNull(),
  recordCount: integer('record_count').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsAggregationCursors = pgTable('analytics_aggregation_cursors', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  module: analyticsDataModuleEnum('module').notNull(),
  cursorKey: text('cursor_key').notNull(),
  lastAggregatedAt: timestamp('last_aggregated_at', { withTimezone: true }),
  state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsDatasetPermissions = pgTable('analytics_dataset_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  datasetKey: text('dataset_key').notNull(),
  permission: analyticsPermissionScopeEnum('permission').notNull().default('read'),
  roleId: uuid('role_id').references(() => roles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsReportPermissions = pgTable('analytics_report_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  reportId: uuid('report_id').references(() => businessReports.id, { onDelete: 'cascade' }),
  templateKey: text('template_key'),
  permission: analyticsPermissionScopeEnum('permission').notNull().default('read'),
  roleId: uuid('role_id').references(() => roles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsAccessAudit = pgTable('analytics_access_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsRetentionPolicies = pgTable('analytics_retention_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  datasetKey: text('dataset_key').notNull(),
  retentionDays: integer('retention_days').notNull().default(365),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsSavedLayouts = pgTable('analytics_saved_layouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  dashboardType: businessDashboardTypeEnum('dashboard_type').notNull(),
  name: text('name').notNull(),
  layout: jsonb('layout').$type<Record<string, unknown>>().notNull().default({}),
  isDefault: boolean('is_default').notNull().default(false),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsPlatformActions = pgTable('analytics_platform_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: analyticsPlatformActionTypeEnum('action_type').notNull(),
  status: analyticsPlatformActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AnalyticsDataSnapshot = typeof analyticsDataSnapshots.$inferSelect;
export type AnalyticsDataLineageRecord = typeof analyticsDataLineage.$inferSelect;
export type AnalyticsAggregationCursor = typeof analyticsAggregationCursors.$inferSelect;
export type AnalyticsDatasetPermission = typeof analyticsDatasetPermissions.$inferSelect;
export type AnalyticsReportPermission = typeof analyticsReportPermissions.$inferSelect;
export type AnalyticsAccessAuditRecord = typeof analyticsAccessAudit.$inferSelect;
export type AnalyticsRetentionPolicy = typeof analyticsRetentionPolicies.$inferSelect;
export type AnalyticsSavedLayout = typeof analyticsSavedLayouts.$inferSelect;
export type AnalyticsPlatformAction = typeof analyticsPlatformActions.$inferSelect;
