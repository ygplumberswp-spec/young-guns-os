import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';

export const siWorkflowStatusEnum = pgEnum('si_workflow_status', [
  'draft',
  'review',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const siAdapterStatusEnum = pgEnum('si_adapter_status', ['active', 'inactive', 'testing', 'error']);

export const siCrmProviderTypeEnum = pgEnum('si_crm_provider_type', [
  'salesforce',
  'hubspot',
  'zoho_crm',
  'dynamics',
  'pipedrive',
  'freshsales',
  'monday',
  'odoo',
  'copper',
  'insightly',
  'sap',
  'oracle_cx',
  'csv_import',
  'sftp',
  'generic_rest',
  'webhook',
  'custom',
]);

export const siAlertSeverityEnum = pgEnum('si_alert_severity', ['info', 'warning', 'critical']);

export const siAlertStatusEnum = pgEnum('si_alert_status', ['open', 'acknowledged', 'resolved', 'dismissed']);

export const siTargetStatusEnum = pgEnum('si_target_status', [
  'draft',
  'active',
  'at_risk',
  'achieved',
  'missed',
  'archived',
]);

export const siCommissionStatusEnum = pgEnum('si_commission_status', [
  'draft',
  'calculated',
  'pending_approval',
  'approved',
  'disputed',
  'exported',
  'cancelled',
]);

export const siPlatformConfig = pgTable('si_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  salesStandards: jsonb('sales_standards').$type<Record<string, unknown>>().notNull().default({}),
  providerAdapterTemplates: jsonb('provider_adapter_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  pipelineTemplates: jsonb('pipeline_templates').$type<Record<string, unknown>>().notNull().default({}),
  playbookTemplates: jsonb('playbook_templates').$type<Record<string, unknown>>().notNull().default({}),
  targetTemplates: jsonb('target_templates').$type<Record<string, unknown>>().notNull().default({}),
  forecastMethodology: jsonb('forecast_methodology').$type<Record<string, unknown>>().notNull().default({}),
  attributionStandards: jsonb('attribution_standards').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siSalesCategories = pgTable('si_sales_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  categoryKey: text('category_key').notNull(),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siTerritories = pgTable('si_territories', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  territoryKey: text('territory_key').notNull(),
  territoryType: text('territory_type'),
  branch: text('branch'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siSalesTeams = pgTable('si_sales_teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  teamKey: text('team_key').notNull(),
  territoryId: uuid('territory_id').references(() => siTerritories.id, { onDelete: 'set null' }),
  leaderUserId: uuid('leader_user_id').references(() => users.id, { onDelete: 'set null' }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siCrmProviderAdapters = pgTable('si_crm_provider_adapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerType: siCrmProviderTypeEnum('provider_type').notNull(),
  name: text('name').notNull(),
  status: siAdapterStatusEnum('status').notNull().default('inactive'),
  syncDirection: text('sync_direction').notNull().default('bidirectional'),
  syncFrequency: text('sync_frequency'),
  fieldMappings: jsonb('field_mappings').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siPipelines = pgTable('si_pipelines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  pipelineKey: text('pipeline_key').notNull(),
  pipelineType: text('pipeline_type'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siPipelineStages = pgTable('si_pipeline_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  pipelineId: uuid('pipeline_id')
    .notNull()
    .references(() => siPipelines.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  stageKey: text('stage_key').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  probabilityPercent: numeric('probability_percent', { precision: 5, scale: 2 }),
  entryRequirements: jsonb('entry_requirements').$type<Record<string, unknown>>().notNull().default({}),
  exitRequirements: jsonb('exit_requirements').$type<Record<string, unknown>>().notNull().default({}),
  slaHours: integer('sla_hours'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siLeadDeduplicationCandidates = pgTable('si_lead_deduplication_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  primaryLeadId: uuid('primary_lead_id'),
  duplicateLeadId: uuid('duplicate_lead_id'),
  matchScore: numeric('match_score', { precision: 5, scale: 2 }),
  matchReason: text('match_reason'),
  status: text('status').notNull().default('pending'),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siLeadMergeRecords = pgTable('si_lead_merge_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  survivingLeadId: uuid('surviving_lead_id'),
  mergedLeadId: uuid('merged_lead_id'),
  mergeReason: text('merge_reason').notNull(),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  sourceHistory: jsonb('source_history').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siPlaybooks = pgTable('si_playbooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  playbookKey: text('playbook_key').notNull(),
  playbookType: text('playbook_type'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siPlaybookSteps = pgTable('si_playbook_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  playbookId: uuid('playbook_id')
    .notNull()
    .references(() => siPlaybooks.id, { onDelete: 'cascade' }),
  stepKey: text('step_key').notNull(),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  required: boolean('required').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siForecasts = pgTable('si_forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  forecastType: text('forecast_type').notNull().default('pipeline'),
  workflowStatus: siWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  currency: text('currency').notNull().default('ZAR'),
  pipelineValueCents: integer('pipeline_value_cents'),
  weightedPipelineCents: integer('weighted_pipeline_cents'),
  commitCents: integer('commit_cents'),
  bestCaseCents: integer('best_case_cents'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  assumptions: jsonb('assumptions').$type<Record<string, unknown>>().notNull().default({}),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  isSimulation: boolean('is_simulation').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siForecastSnapshots = pgTable('si_forecast_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  forecastId: uuid('forecast_id')
    .notNull()
    .references(() => siForecasts.id, { onDelete: 'cascade' }),
  pipelineValueCents: integer('pipeline_value_cents').notNull().default(0),
  weightedPipelineCents: integer('weighted_pipeline_cents').notNull().default(0),
  commitCents: integer('commit_cents').notNull().default(0),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  assumptions: jsonb('assumptions').$type<Record<string, unknown>>().notNull().default({}),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siSalesTargets = pgTable('si_sales_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  teamId: uuid('team_id').references(() => siSalesTeams.id, { onDelete: 'set null' }),
  targetKey: text('target_key').notNull(),
  title: text('title').notNull(),
  targetType: text('target_type').notNull(),
  status: siTargetStatusEnum('status').notNull().default('draft'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  targetValue: numeric('target_value', { precision: 18, scale: 4 }),
  currentValue: numeric('current_value', { precision: 18, scale: 4 }),
  unit: text('unit'),
  currency: text('currency'),
  progressPercent: numeric('progress_percent', { precision: 7, scale: 2 }),
  formula: text('formula'),
  supportingRecords: jsonb('supporting_records').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siAccounts = pgTable('si_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  accountType: text('account_type'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  territoryId: uuid('territory_id').references(() => siTerritories.id, { onDelete: 'set null' }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siAccountPlans = pgTable('si_account_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id')
    .notNull()
    .references(() => siAccounts.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  workflowStatus: siWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  goals: jsonb('goals').$type<Record<string, unknown>>().notNull().default({}),
  stakeholders: jsonb('stakeholders').$type<unknown[]>().notNull().default([]),
  actionPlan: jsonb('action_plan').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siRenewalRecords = pgTable('si_renewal_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => siAccounts.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  renewalType: text('renewal_type'),
  renewalDate: date('renewal_date'),
  noticePeriodDays: integer('notice_period_days'),
  currentValueCents: integer('current_value_cents'),
  proposedValueCents: integer('proposed_value_cents'),
  renewalProbability: numeric('renewal_probability', { precision: 5, scale: 2 }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  workflowStatus: siWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siCustomerGrowthSnapshots = pgTable('si_customer_growth_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  opportunityType: text('opportunity_type').notNull(),
  title: text('title').notNull(),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  supportingEvidence: jsonb('supporting_evidence').$type<Record<string, unknown>>().notNull().default({}),
  limitations: text('limitations'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siRetentionRiskSnapshots = pgTable('si_retention_risk_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  riskLevel: text('risk_level').notNull(),
  riskFactors: jsonb('risk_factors').$type<unknown[]>().notNull().default([]),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  supportingEvidence: jsonb('supporting_evidence').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siPricingRules = pgTable('si_pricing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  ruleKey: text('rule_key').notNull(),
  ruleType: text('rule_type').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siDiscountPolicies = pgTable('si_discount_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  policyKey: text('policy_key').notNull(),
  maxDiscountPercent: numeric('max_discount_percent', { precision: 7, scale: 2 }),
  marginFloorPercent: numeric('margin_floor_percent', { precision: 7, scale: 2 }),
  approvalThresholdPercent: numeric('approval_threshold_percent', { precision: 7, scale: 2 }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siDiscountRequests = pgTable('si_discount_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  discountPercent: numeric('discount_percent', { precision: 7, scale: 2 }),
  discountAmountCents: integer('discount_amount_cents'),
  reason: text('reason'),
  marginImpactPercent: numeric('margin_impact_percent', { precision: 7, scale: 2 }),
  workflowStatus: siWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siCommissionPlans = pgTable('si_commission_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  planKey: text('plan_key').notNull(),
  formula: text('formula'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siCommissionEntries = pgTable('si_commission_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => siCommissionPlans.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: siCommissionStatusEnum('status').notNull().default('draft'),
  amountCents: integer('amount_cents').notNull().default(0),
  formula: text('formula'),
  sourceTransactions: jsonb('source_transactions').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: siWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siQualificationAnalyses = pgTable('si_qualification_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id'),
  recommendation: text('recommendation'),
  priority: text('priority'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  supportingEvidence: jsonb('supporting_evidence').$type<Record<string, unknown>>().notNull().default({}),
  limitations: text('limitations'),
  requiresHumanReview: boolean('requires_human_review').notNull().default(true),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siWinLossRecords = pgTable('si_win_loss_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id'),
  outcome: text('outcome').notNull(),
  reason: text('reason'),
  competitor: text('competitor'),
  priceImpact: text('price_impact'),
  customerFeedback: text('customer_feedback'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siRevenueLeakageFindings = pgTable('si_revenue_leakage_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  findingType: text('finding_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  estimatedAmountCents: integer('estimated_amount_cents'),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siPartnerProfiles = pgTable('si_partner_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  partnerType: text('partner_type'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siReferralRecords = pgTable('si_referral_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  partnerId: uuid('partner_id').references(() => siPartnerProfiles.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'),
  revenueCents: integer('revenue_cents'),
  commissionCents: integer('commission_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siTenders = pgTable('si_tenders', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  tenderNumber: text('tender_number'),
  deadline: timestamp('deadline', { withTimezone: true }),
  status: text('status').notNull().default('draft'),
  workflowStatus: siWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  evaluationOutcome: text('evaluation_outcome'),
  winLossReason: text('win_loss_reason'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siSalesAlerts = pgTable('si_sales_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: siAlertSeverityEnum('severity').notNull().default('warning'),
  status: siAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  sourceEntityId: uuid('source_entity_id'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siSalesActionDrafts = pgTable('si_sales_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  workflowStatus: siWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  requiresHumanReview: boolean('requires_human_review').notNull().default(true),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siAnalyticsSnapshots = pgTable('si_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  pipelineValueCents: integer('pipeline_value_cents').notNull().default(0),
  weightedPipelineCents: integer('weighted_pipeline_cents').notNull().default(0),
  openOpportunityCount: integer('open_opportunity_count').notNull().default(0),
  activeLeadCount: integer('active_lead_count').notNull().default(0),
  openAlertCount: integer('open_alert_count').notNull().default(0),
  renewalExposureCents: integer('renewal_exposure_cents').notNull().default(0),
  revenueLeakageCents: integer('revenue_leakage_cents').notNull().default(0),
  currency: text('currency').notNull().default('ZAR'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siAuditLogs = pgTable('si_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SiPlatformConfig = typeof siPlatformConfig.$inferSelect;
export type SiPipeline = typeof siPipelines.$inferSelect;
export type SiForecast = typeof siForecasts.$inferSelect;
export type SiSalesAlert = typeof siSalesAlerts.$inferSelect;
export type SiAnalyticsSnapshot = typeof siAnalyticsSnapshots.$inferSelect;
