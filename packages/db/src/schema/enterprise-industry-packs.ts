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
import { companies } from './companies';
import { users } from './users';

export const ipWorkflowStatusEnum = pgEnum('ip_workflow_status', [
  'draft',
  'review',
  'pending_approval',
  'approved',
  'published',
  'archived',
  'cancelled',
]);

export const ipPackStatusEnum = pgEnum('ip_pack_status', [
  'available',
  'installed',
  'disabled',
  'deprecated',
  'uninstalled',
]);

export const ipTemplateTypeEnum = pgEnum('ip_template_type', [
  'job',
  'inspection',
  'workflow',
  'form',
  'checklist',
  'labour',
  'quote',
  'invoice',
  'report',
]);

export const ipCertificateTypeEnum = pgEnum('ip_certificate_type', [
  'compliance',
  'installation',
  'service',
  'maintenance',
  'inspection',
  'completion',
  'custom',
]);

export const ipCertificateStatusEnum = pgEnum('ip_certificate_status', [
  'draft',
  'pending_approval',
  'issued',
  'revoked',
  'expired',
]);

export const ipKnowledgeStatusEnum = pgEnum('ip_knowledge_status', [
  'draft',
  'pending_approval',
  'approved',
  'published',
  'archived',
]);

export const ipAlertSeverityEnum = pgEnum('ip_alert_severity', ['info', 'warning', 'critical']);

export const ipAlertStatusEnum = pgEnum('ip_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const ipPlatformConfig = pgTable('ip_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  marketplacePolicy: jsonb('marketplace_policy').$type<Record<string, unknown>>().notNull().default({}),
  compliancePolicy: jsonb('compliance_policy').$type<Record<string, unknown>>().notNull().default({}),
  certificatePolicy: jsonb('certificate_policy').$type<Record<string, unknown>>().notNull().default({}),
  packBuilderPolicy: jsonb('pack_builder_policy').$type<Record<string, unknown>>().notNull().default({}),
  analyticsPolicy: jsonb('analytics_policy').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipPackCatalog = pgTable('ip_pack_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  packKey: text('pack_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  industryCategory: text('industry_category').notNull(),
  version: text('version').notNull().default('1.0.0'),
  isSystemPack: boolean('is_system_pack').notNull().default(false),
  isCustomPack: boolean('is_custom_pack').notNull().default(false),
  licensingModel: text('licensing_model'),
  compatibility: jsonb('compatibility').$type<Record<string, unknown>>().notNull().default({}),
  capabilities: jsonb('capabilities').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: ipWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipPackInstallations = pgTable('ip_pack_installations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packCatalogId: uuid('pack_catalog_id')
    .notNull()
    .references(() => ipPackCatalog.id, { onDelete: 'cascade' }),
  installedVersion: text('installed_version').notNull(),
  status: ipPackStatusEnum('status').notNull().default('installed'),
  installedByUserId: uuid('installed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  installedAt: timestamp('installed_at', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipPackVersions = pgTable('ip_pack_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  packCatalogId: uuid('pack_catalog_id')
    .notNull()
    .references(() => ipPackCatalog.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  releaseNotes: text('release_notes'),
  changelog: jsonb('changelog').$type<Record<string, unknown>>().notNull().default({}),
  compatibility: jsonb('compatibility').$type<Record<string, unknown>>().notNull().default({}),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipPackDependencies = pgTable('ip_pack_dependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  packCatalogId: uuid('pack_catalog_id')
    .notNull()
    .references(() => ipPackCatalog.id, { onDelete: 'cascade' }),
  dependencyPackKey: text('dependency_pack_key').notNull(),
  dependencyVersion: text('dependency_version'),
  required: boolean('required').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipTemplates = pgTable('ip_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packCatalogId: uuid('pack_catalog_id').references(() => ipPackCatalog.id, { onDelete: 'set null' }),
  templateKey: text('template_key').notNull(),
  templateType: ipTemplateTypeEnum('template_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  workflowStatus: ipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipComplianceFrameworks = pgTable('ip_compliance_frameworks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packCatalogId: uuid('pack_catalog_id').references(() => ipPackCatalog.id, { onDelete: 'set null' }),
  frameworkKey: text('framework_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  countryCode: text('country_code'),
  industryCategory: text('industry_category'),
  regulatoryBody: text('regulatory_body'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: ipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipComplianceRequirements = pgTable('ip_compliance_requirements', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  frameworkId: uuid('framework_id')
    .notNull()
    .references(() => ipComplianceFrameworks.id, { onDelete: 'cascade' }),
  requirementKey: text('requirement_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  requirementType: text('requirement_type'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipCertificates = pgTable('ip_certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packCatalogId: uuid('pack_catalog_id').references(() => ipPackCatalog.id, { onDelete: 'set null' }),
  certificateKey: text('certificate_key').notNull(),
  certificateType: ipCertificateTypeEnum('certificate_type').notNull(),
  title: text('title').notNull(),
  status: ipCertificateStatusEnum('status').notNull().default('draft'),
  jobId: uuid('job_id'),
  customerId: uuid('customer_id'),
  issuedByUserId: uuid('issued_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  sourceWorkReference: text('source_work_reference'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipKnowledgeArticles = pgTable('ip_knowledge_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packCatalogId: uuid('pack_catalog_id').references(() => ipPackCatalog.id, { onDelete: 'set null' }),
  articleKey: text('article_key').notNull(),
  title: text('title').notNull(),
  articleType: text('article_type').notNull(),
  content: text('content'),
  status: ipKnowledgeStatusEnum('status').notNull().default('draft'),
  version: text('version').notNull().default('1.0.0'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipKnowledgeVersions = pgTable('ip_knowledge_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id')
    .notNull()
    .references(() => ipKnowledgeArticles.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  content: text('content'),
  changeSummary: text('change_summary'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipEquipmentCatalog = pgTable('ip_equipment_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packCatalogId: uuid('pack_catalog_id').references(() => ipPackCatalog.id, { onDelete: 'set null' }),
  equipmentKey: text('equipment_key').notNull(),
  manufacturer: text('manufacturer'),
  model: text('model'),
  category: text('category'),
  specifications: jsonb('specifications').$type<Record<string, unknown>>().notNull().default({}),
  serviceIntervals: jsonb('service_intervals').$type<Record<string, unknown>>().notNull().default({}),
  replacementParts: jsonb('replacement_parts').$type<Record<string, unknown>>().notNull().default({}),
  attachments: jsonb('attachments').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: ipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipMaterialLibraries = pgTable('ip_material_libraries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packCatalogId: uuid('pack_catalog_id').references(() => ipPackCatalog.id, { onDelete: 'set null' }),
  materialKey: text('material_key').notNull(),
  name: text('name').notNull(),
  category: text('category'),
  unit: text('unit'),
  specifications: jsonb('specifications').$type<Record<string, unknown>>().notNull().default({}),
  bundles: jsonb('bundles').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: ipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipAssetTypes = pgTable('ip_asset_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packCatalogId: uuid('pack_catalog_id').references(() => ipPackCatalog.id, { onDelete: 'set null' }),
  assetTypeKey: text('asset_type_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  fieldDefinitions: jsonb('field_definitions').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: ipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipPackExtensions = pgTable('ip_pack_extensions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packCatalogId: uuid('pack_catalog_id')
    .notNull()
    .references(() => ipPackCatalog.id, { onDelete: 'cascade' }),
  extensionType: text('extension_type').notNull(),
  extensionKey: text('extension_key').notNull(),
  name: text('name').notNull(),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: ipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipAnalyticsSnapshots = pgTable('ip_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipIndustryAlerts = pgTable('ip_industry_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: ipAlertSeverityEnum('severity').notNull().default('warning'),
  status: ipAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  packCatalogId: uuid('pack_catalog_id').references(() => ipPackCatalog.id, { onDelete: 'set null' }),
  sourceModule: text('source_module'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipActionDrafts = pgTable('ip_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  packCatalogId: uuid('pack_catalog_id').references(() => ipPackCatalog.id, { onDelete: 'set null' }),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  workflowStatus: ipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipAuditLogs = pgTable('ip_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IpPlatformConfig = typeof ipPlatformConfig.$inferSelect;
export type IpPackCatalog = typeof ipPackCatalog.$inferSelect;
export type IpPackInstallation = typeof ipPackInstallations.$inferSelect;
export type IpTemplate = typeof ipTemplates.$inferSelect;
export type IpComplianceFramework = typeof ipComplianceFrameworks.$inferSelect;
export type IpCertificate = typeof ipCertificates.$inferSelect;
export type IpKnowledgeArticle = typeof ipKnowledgeArticles.$inferSelect;
export type IpEquipmentCatalogEntry = typeof ipEquipmentCatalog.$inferSelect;
export type IpIndustryAlert = typeof ipIndustryAlerts.$inferSelect;
