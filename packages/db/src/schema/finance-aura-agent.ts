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
import { customers } from './customers';
import { invoices } from './invoices';
import { jobs } from './jobs';
import { payments } from './payments';
import { users } from './users';

/**
 * Finance AURA Agent Foundation — recommendations, insights, alerts.
 * Owner approval required before any financial mutation path.
 * No auto-execute. Grounded in real TITAN finance records only.
 */

export const finAuraRecommendationKindEnum = pgEnum('fin_aura_recommendation_kind', [
  'collections',
  'cashflow',
  'receivables_review',
  'payment_follow_up',
  'xero_reconciliation',
  'job_profitability_review',
  'owner_decision',
  'aura_handoff',
]);

export const finAuraRecommendationStatusEnum = pgEnum('fin_aura_recommendation_status', [
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const finAuraInsightKindEnum = pgEnum('fin_aura_insight_kind', [
  'receivables_summary',
  'payments_summary',
  'overdue_concentration',
  'xero_link_status',
  'job_invoice_linkage',
  'business_financial_context',
]);

export const finAuraAlertKindEnum = pgEnum('fin_aura_alert_kind', [
  'overdue_invoices',
  'outstanding_receivables',
  'no_recent_payments',
  'xero_disconnected',
  'unlinked_job_invoices',
]);

export const finAuraAlertSeverityEnum = pgEnum('fin_aura_alert_severity', [
  'info',
  'warning',
  'critical',
]);

export const finAuraAlertStatusEnum = pgEnum('fin_aura_alert_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const finAuraRecommendations = pgTable('fin_aura_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: finAuraRecommendationKindEnum('kind').notNull(),
  status: finAuraRecommendationStatusEnum('status').notNull().default('pending_approval'),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  sourceInvoiceId: uuid('source_invoice_id').references(() => invoices.id, {
    onDelete: 'set null',
  }),
  sourcePaymentId: uuid('source_payment_id').references(() => payments.id, {
    onDelete: 'set null',
  }),
  sourceJobId: uuid('source_job_id').references(() => jobs.id, { onDelete: 'set null' }),
  sourceCustomerId: uuid('source_customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false — never auto-execute financial mutations. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const finAuraInsights = pgTable('fin_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: finAuraInsightKindEnum('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  metricLabel: text('metric_label'),
  /** Null when unavailable — never invent. */
  metricValueCents: integer('metric_value_cents'),
  currency: text('currency'),
  sourceInvoiceCount: integer('source_invoice_count').notNull().default(0),
  sourcePaymentCount: integer('source_payment_count').notNull().default(0),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const finAuraAlerts = pgTable('fin_aura_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: finAuraAlertKindEnum('kind').notNull(),
  severity: finAuraAlertSeverityEnum('severity').notNull().default('info'),
  status: finAuraAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  relatedInvoiceId: uuid('related_invoice_id').references(() => invoices.id, {
    onDelete: 'set null',
  }),
  relatedCustomerId: uuid('related_customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  amountCents: integer('amount_cents'),
  currency: text('currency'),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
