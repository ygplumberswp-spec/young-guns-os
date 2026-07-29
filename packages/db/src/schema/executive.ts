import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const executiveAlertTypeEnum = pgEnum('executive_alert_type', [
  'revenue_decline',
  'unpaid_invoices',
  'low_margin',
  'capacity_issue',
  'customer_risk',
  'stock_risk',
  'operational_issue',
  'growth_opportunity',
]);

export const executiveAlertStatusEnum = pgEnum('executive_alert_status', [
  'pending',
  'acknowledged',
  'dismissed',
]);

export const executiveRecommendationTypeEnum = pgEnum('executive_recommendation_type', [
  'growth',
  'cost_optimization',
  'operational_improvement',
  'customer_retention',
  'strategic',
]);

export const executiveRecommendationStatusEnum = pgEnum('executive_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const executiveReportTypeEnum = pgEnum('executive_report_type', [
  'daily_summary',
  'weekly_review',
  'monthly_review',
]);

export const businessHealthTrendEnum = pgEnum('business_health_trend', [
  'improving',
  'stable',
  'declining',
  'unknown',
]);

export const businessHealthSnapshots = pgTable('business_health_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  overallScore: integer('overall_score').notNull(),
  trend: businessHealthTrendEnum('trend').notNull().default('unknown'),
  components: jsonb('components').$type<Record<string, unknown>>().notNull().default({}),
  summary: text('summary').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const executiveAlerts = pgTable('executive_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: executiveAlertTypeEnum('alert_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: executiveAlertStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const executiveRecommendations = pgTable('executive_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationType: executiveRecommendationTypeEnum('recommendation_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: executiveRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const executiveReports = pgTable('executive_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  reportType: executiveReportTypeEnum('report_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BusinessHealthSnapshot = typeof businessHealthSnapshots.$inferSelect;
export type ExecutiveAlert = typeof executiveAlerts.$inferSelect;
export type ExecutiveRecommendation = typeof executiveRecommendations.$inferSelect;
export type ExecutiveReport = typeof executiveReports.$inferSelect;
