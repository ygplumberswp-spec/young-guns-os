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
import { users } from './users';

export const fpWorkflowStatusEnum = pgEnum('fp_workflow_status', [
  'draft',
  'review',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const fpBudgetStatusEnum = pgEnum('fp_budget_status', [
  'draft',
  'review',
  'pending_approval',
  'active',
  'superseded',
  'archived',
]);

export const fpBudgetPeriodEnum = pgEnum('fp_budget_period', [
  'annual',
  'monthly',
  'quarterly',
  'rolling',
]);

export const fpForecastTypeEnum = pgEnum('fp_forecast_type', [
  'base',
  'optimistic',
  'conservative',
  'custom',
]);

export const fpAdapterStatusEnum = pgEnum('fp_adapter_status', ['active', 'inactive', 'testing', 'error']);

export const fpAccountingProviderTypeEnum = pgEnum('fp_accounting_provider_type', [
  'xero',
  'quickbooks',
  'sage',
  'zoho_books',
  'dynamics',
  'sap',
  'netsuite',
  'freshbooks',
  'wave',
  'odoo',
  'csv_import',
  'sftp',
  'generic_rest',
  'webhook',
  'custom',
]);

export const fpBankingProviderTypeEnum = pgEnum('fp_banking_provider_type', [
  'open_banking',
  'bank_api',
  'payment_gateway',
  'statement_feed',
  'csv_import',
  'ofx_import',
  'sftp',
  'manual_upload',
  'generic_rest',
  'webhook',
  'custom',
]);

export const fpAlertSeverityEnum = pgEnum('fp_alert_severity', ['info', 'warning', 'critical']);

export const fpAlertStatusEnum = pgEnum('fp_alert_status', ['open', 'acknowledged', 'resolved', 'dismissed']);

export const fpTargetStatusEnum = pgEnum('fp_target_status', [
  'draft',
  'active',
  'at_risk',
  'achieved',
  'missed',
  'archived',
]);

export const fpPlatformConfig = pgTable('fp_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  financeStandards: jsonb('finance_standards').$type<Record<string, unknown>>().notNull().default({}),
  providerAdapterTemplates: jsonb('provider_adapter_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  currencyStandards: jsonb('currency_standards').$type<Record<string, unknown>>().notNull().default({}),
  planningTemplates: jsonb('planning_templates').$type<Record<string, unknown>>().notNull().default({}),
  kpiTemplates: jsonb('kpi_templates').$type<Record<string, unknown>>().notNull().default({}),
  riskThresholds: jsonb('risk_thresholds').$type<Record<string, unknown>>().notNull().default({}),
  allocationMethods: jsonb('allocation_methods').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpPlanningCategories = pgTable('fp_planning_categories', {
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

export const fpEntities = pgTable('fp_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  entityKey: text('entity_key').notNull(),
  entityType: text('entity_type'),
  currency: text('currency'),
  taxJurisdiction: text('tax_jurisdiction'),
  parentEntityId: uuid('parent_entity_id'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpBudgets = pgTable('fp_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').references(() => fpEntities.id, { onDelete: 'set null' }),
  categoryId: uuid('category_id').references(() => fpPlanningCategories.id, { onDelete: 'set null' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  budgetPeriod: fpBudgetPeriodEnum('budget_period').notNull().default('annual'),
  status: fpBudgetStatusEnum('status').notNull().default('draft'),
  workflowStatus: fpWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  currency: text('currency').notNull().default('ZAR'),
  version: integer('version').notNull().default(1),
  assumptions: text('assumptions'),
  notes: text('notes'),
  totalAmountCents: integer('total_amount_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpBudgetVersions = pgTable('fp_budget_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  budgetId: uuid('budget_id')
    .notNull()
    .references(() => fpBudgets.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  status: fpBudgetStatusEnum('status').notNull().default('draft'),
  workflowStatus: fpWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  assumptions: text('assumptions'),
  notes: text('notes'),
  totalAmountCents: integer('total_amount_cents'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpBudgetLines = pgTable('fp_budget_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  budgetId: uuid('budget_id')
    .notNull()
    .references(() => fpBudgets.id, { onDelete: 'cascade' }),
  budgetVersionId: uuid('budget_version_id').references(() => fpBudgetVersions.id, { onDelete: 'set null' }),
  lineKey: text('line_key').notNull(),
  description: text('description').notNull(),
  department: text('department'),
  branch: text('branch'),
  project: text('project'),
  costCentre: text('cost_centre'),
  plannedAmountCents: integer('planned_amount_cents').notNull().default(0),
  actualAmountCents: integer('actual_amount_cents').notNull().default(0),
  forecastAmountCents: integer('forecast_amount_cents'),
  varianceAmountCents: integer('variance_amount_cents'),
  currency: text('currency').notNull().default('ZAR'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpForecasts = pgTable('fp_forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').references(() => fpEntities.id, { onDelete: 'set null' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  forecastType: fpForecastTypeEnum('forecast_type').notNull().default('base'),
  workflowStatus: fpWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  currency: text('currency').notNull().default('ZAR'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  assumptions: jsonb('assumptions').$type<Record<string, unknown>>().notNull().default({}),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  isSimulation: boolean('is_simulation').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpForecastSnapshots = pgTable('fp_forecast_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  forecastId: uuid('forecast_id')
    .notNull()
    .references(() => fpForecasts.id, { onDelete: 'cascade' }),
  forecastType: fpForecastTypeEnum('forecast_type').notNull().default('base'),
  revenueCents: integer('revenue_cents').notNull().default(0),
  expenseCents: integer('expense_cents').notNull().default(0),
  netPositionCents: integer('net_position_cents').notNull().default(0),
  varianceFromBudgetCents: integer('variance_from_budget_cents'),
  varianceFromPriorCents: integer('variance_from_prior_cents'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  assumptions: jsonb('assumptions').$type<Record<string, unknown>>().notNull().default({}),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpCashFlowProjections = pgTable('fp_cash_flow_projections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').references(() => fpEntities.id, { onDelete: 'set null' }),
  projectionDate: date('projection_date').notNull(),
  periodType: text('period_type').notNull().default('daily'),
  openingBalanceCents: integer('opening_balance_cents').notNull().default(0),
  expectedInflowCents: integer('expected_inflow_cents').notNull().default(0),
  expectedOutflowCents: integer('expected_outflow_cents').notNull().default(0),
  closingBalanceCents: integer('closing_balance_cents').notNull().default(0),
  cashRunwayDays: integer('cash_runway_days'),
  minimumThresholdCents: integer('minimum_threshold_cents'),
  workingCapitalCents: integer('working_capital_cents'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  dataFreshness: timestamp('data_freshness', { withTimezone: true }),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpTreasuryAccounts = pgTable('fp_treasury_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').references(() => fpEntities.id, { onDelete: 'set null' }),
  bankingProviderId: uuid('banking_provider_id'),
  accountName: text('account_name').notNull(),
  accountNumberMasked: text('account_number_masked'),
  bankName: text('bank_name'),
  currency: text('currency').notNull().default('ZAR'),
  currentBalanceCents: integer('current_balance_cents'),
  availableBalanceCents: integer('available_balance_cents'),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpScenarios = pgTable('fp_scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').references(() => fpEntities.id, { onDelete: 'set null' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  scenarioType: text('scenario_type').notNull(),
  workflowStatus: fpWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  isSimulation: boolean('is_simulation').notNull().default(true),
  assumptions: jsonb('assumptions').$type<Record<string, unknown>>().notNull().default({}),
  cashImpactCents: integer('cash_impact_cents'),
  profitImpactCents: integer('profit_impact_cents'),
  marginImpactPercent: numeric('margin_impact_percent', { precision: 7, scale: 2 }),
  workingCapitalImpactCents: integer('working_capital_impact_cents'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  baselineComparison: jsonb('baseline_comparison').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpScenarioLines = pgTable('fp_scenario_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  scenarioId: uuid('scenario_id')
    .notNull()
    .references(() => fpScenarios.id, { onDelete: 'cascade' }),
  lineKey: text('line_key').notNull(),
  description: text('description').notNull(),
  impactType: text('impact_type'),
  amountCents: integer('amount_cents').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpFinancialTargets = pgTable('fp_financial_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').references(() => fpEntities.id, { onDelete: 'set null' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  targetKey: text('target_key').notNull(),
  title: text('title').notNull(),
  targetType: text('target_type').notNull(),
  status: fpTargetStatusEnum('status').notNull().default('draft'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  targetValue: numeric('target_value', { precision: 18, scale: 4 }),
  currentValue: numeric('current_value', { precision: 18, scale: 4 }),
  unit: text('unit'),
  currency: text('currency'),
  progressPercent: numeric('progress_percent', { precision: 7, scale: 2 }),
  supportingRecords: jsonb('supporting_records').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpFinancialAlerts = pgTable('fp_financial_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: fpAlertSeverityEnum('severity').notNull().default('warning'),
  status: fpAlertStatusEnum('status').notNull().default('open'),
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

export const fpAccountingProviderAdapters = pgTable('fp_accounting_provider_adapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').references(() => fpEntities.id, { onDelete: 'set null' }),
  providerType: fpAccountingProviderTypeEnum('provider_type').notNull(),
  name: text('name').notNull(),
  status: fpAdapterStatusEnum('status').notNull().default('inactive'),
  syncDirection: text('sync_direction').notNull().default('bidirectional'),
  syncFrequency: text('sync_frequency'),
  accountMappings: jsonb('account_mappings').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpBankingProviderAdapters = pgTable('fp_banking_provider_adapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').references(() => fpEntities.id, { onDelete: 'set null' }),
  providerType: fpBankingProviderTypeEnum('provider_type').notNull(),
  name: text('name').notNull(),
  status: fpAdapterStatusEnum('status').notNull().default('inactive'),
  accountMappings: jsonb('account_mappings').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  refreshSchedule: text('refresh_schedule'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpProfitabilitySnapshots = pgTable('fp_profitability_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').references(() => fpEntities.id, { onDelete: 'set null' }),
  dimensionType: text('dimension_type').notNull(),
  dimensionId: uuid('dimension_id'),
  dimensionName: text('dimension_name'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  revenueCents: integer('revenue_cents').notNull().default(0),
  directCostCents: integer('direct_cost_cents').notNull().default(0),
  grossProfitCents: integer('gross_profit_cents').notNull().default(0),
  marginPercent: numeric('margin_percent', { precision: 7, scale: 2 }),
  allocationMethod: text('allocation_method'),
  formula: text('formula'),
  sourceTransactions: jsonb('source_transactions').$type<Record<string, unknown>>().notNull().default({}),
  exceptions: jsonb('exceptions').$type<unknown[]>().notNull().default([]),
  dataFreshness: timestamp('data_freshness', { withTimezone: true }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpPlanningActionDrafts = pgTable('fp_planning_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  workflowStatus: fpWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  requiresHumanReview: boolean('requires_human_review').notNull().default(true),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpAnalyticsSnapshots = pgTable('fp_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  activeBudgetCount: integer('active_budget_count').notNull().default(0),
  activeForecastCount: integer('active_forecast_count').notNull().default(0),
  cashPositionCents: integer('cash_position_cents').notNull().default(0),
  cashRunwayDays: integer('cash_runway_days'),
  overdueReceivableCents: integer('overdue_receivable_cents').notNull().default(0),
  upcomingPayableCents: integer('upcoming_payable_cents').notNull().default(0),
  openAlertCount: integer('open_alert_count').notNull().default(0),
  budgetVarianceCents: integer('budget_variance_cents').notNull().default(0),
  currency: text('currency').notNull().default('ZAR'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fpAuditLogs = pgTable('fp_audit_logs', {
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

export type FpPlatformConfig = typeof fpPlatformConfig.$inferSelect;
export type FpBudget = typeof fpBudgets.$inferSelect;
export type FpForecast = typeof fpForecasts.$inferSelect;
export type FpScenario = typeof fpScenarios.$inferSelect;
export type FpFinancialAlert = typeof fpFinancialAlerts.$inferSelect;
export type FpAnalyticsSnapshot = typeof fpAnalyticsSnapshots.$inferSelect;
