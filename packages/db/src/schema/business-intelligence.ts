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

export const businessKpiKeyEnum = pgEnum('business_kpi_key', [
  'revenue',
  'gross_profit',
  'net_profit',
  'cash_flow',
  'job_completion_rate',
  'technician_utilization',
  'customer_retention',
  'quote_conversion',
  'lead_conversion',
  'marketing_roi',
  'inventory_turnover',
  'procurement_costs',
  'customer_satisfaction',
  'automation_savings',
  'fleet_efficiency',
  'ai_performance',
]);

export const businessDashboardTypeEnum = pgEnum('business_dashboard_type', [
  'executive',
  'finance',
  'operations',
  'sales',
  'marketing',
  'workforce',
  'fleet',
  'customer_support',
  'branch',
  'personal',
  'dispatch',
  'procurement',
  'hr',
  'inventory',
  'ai',
]);

export const businessReportStatusEnum = pgEnum('business_report_status', [
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'generated',
  'archived',
]);

export const businessInsightTypeEnum = pgEnum('business_insight_type', [
  'business_trend',
  'operational_bottleneck',
  'revenue_opportunity',
  'cost_optimization',
  'customer_behavior',
  'workforce_efficiency',
  'procurement_optimization',
  'automation_effectiveness',
]);

export const businessInsightStatusEnum = pgEnum('business_insight_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const predictiveForecastTypeEnum = pgEnum('predictive_forecast_type', [
  'revenue',
  'workload',
  'inventory_demand',
  'staffing',
  'cash_flow',
  'customer_churn',
  'demand',
  'lead_scoring',
  'risk',
]);

export const businessKpis = pgTable('business_kpis', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kpiKey: businessKpiKeyEnum('kpi_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  targetValue: integer('target_value'),
  unit: text('unit').notNull().default('count'),
  isActive: boolean('is_active').notNull().default(true),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessKpiSnapshots = pgTable('business_kpi_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kpiId: uuid('kpi_id')
    .notNull()
    .references(() => businessKpis.id, { onDelete: 'cascade' }),
  kpiKey: businessKpiKeyEnum('kpi_key').notNull(),
  value: integer('value').notNull(),
  previousValue: integer('previous_value'),
  changePercent: integer('change_percent'),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessDashboards = pgTable('business_dashboards', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  dashboardType: businessDashboardTypeEnum('dashboard_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dashboardWidgets = pgTable('dashboard_widgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  dashboardId: uuid('dashboard_id')
    .notNull()
    .references(() => businessDashboards.id, { onDelete: 'cascade' }),
  widgetKey: text('widget_key').notNull(),
  title: text('title').notNull(),
  kpiKey: businessKpiKeyEnum('kpi_key'),
  position: integer('position').notNull().default(0),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const biReportTemplates = pgTable('report_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  templateKey: text('template_key').notNull(),
  modules: jsonb('modules').$type<string[]>().notNull().default([]),
  defaultFilters: jsonb('default_filters').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessReports = pgTable('business_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').references(() => biReportTemplates.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  status: businessReportStatusEnum('status').notNull().default('draft'),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  scheduleCron: text('schedule_cron'),
  lastGeneratedAt: timestamp('last_generated_at', { withTimezone: true }),
  exportMetadata: jsonb('export_metadata').$type<Record<string, unknown>>().notNull().default({}),
  resultSummary: text('result_summary'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessInsights = pgTable('business_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  insightType: businessInsightTypeEnum('insight_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: businessInsightStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const predictiveForecasts = pgTable('predictive_forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  forecastType: predictiveForecastTypeEnum('forecast_type').notNull(),
  horizonStart: timestamp('horizon_start', { withTimezone: true }).notNull(),
  horizonEnd: timestamp('horizon_end', { withTimezone: true }).notNull(),
  forecastValue: integer('forecast_value').notNull(),
  confidencePercent: integer('confidence_percent'),
  summary: text('summary').notNull(),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BusinessKpi = typeof businessKpis.$inferSelect;
export type BusinessKpiSnapshot = typeof businessKpiSnapshots.$inferSelect;
export type BusinessDashboard = typeof businessDashboards.$inferSelect;
export type DashboardWidget = typeof dashboardWidgets.$inferSelect;
export type BiReportTemplate = typeof biReportTemplates.$inferSelect;
export type BusinessReport = typeof businessReports.$inferSelect;
export type BusinessInsight = typeof businessInsights.$inferSelect;
export type PredictiveForecast = typeof predictiveForecasts.$inferSelect;
