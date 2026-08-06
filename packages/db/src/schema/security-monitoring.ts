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

/**
 * Security Monitoring (Department 18).
 *
 * These tables hold only the monitoring layer's own state: Owner controls,
 * triage decisions, incident records, approval-gated recommendations and an
 * append-only trail. The evidence itself stays in the existing enterprise
 * security tables, which this department reads and never writes.
 */

export const secmonCategoryEnum = pgEnum('secmon_category', [
  'failed_authentication',
  'login_activity',
  'suspicious_session',
  'permission_change',
  'privileged_action',
  'data_access',
  'integration_security',
  'unusual_api_activity',
  'cross_tenant_attempt',
  'ai_guardrail',
  'policy_posture',
]);

export const secmonSeverityEnum = pgEnum('secmon_severity', ['critical', 'high', 'medium', 'low', 'info']);

export const secmonTriageStateEnum = pgEnum('secmon_triage_state', [
  'new',
  'acknowledged',
  'investigating',
  'resolved',
  'false_positive',
]);

export const secmonIncidentStatusEnum = pgEnum('secmon_incident_status', [
  'open',
  'investigating',
  'contained',
  'resolved',
  'closed',
]);

export const secmonRecommendedActionEnum = pgEnum('secmon_recommended_action', [
  'review_account',
  'review_permission_grant',
  'review_session',
  'review_integration',
  'review_api_client',
  'tighten_policy',
  'contact_user',
]);

export const secmonActionDecisionEnum = pgEnum('secmon_action_decision', [
  'pending',
  'approved',
  'rejected',
]);

export const secmonEventKindEnum = pgEnum('secmon_event_kind', [
  'dashboard_viewed',
  'settings_updated',
  'signal_triaged',
  'incident_opened',
  'incident_updated',
  'recommendation_generated',
  'recommendation_decided',
  'access_denied',
]);

/** Owner-controlled monitoring window and noise controls. */
export const secmonSettings = pgTable('secmon_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' })
    .unique(),
  lookbackDays: integer('lookback_days').notNull().default(30),
  failedLoginThreshold: integer('failed_login_threshold').notNull().default(5),
  severityFloor: secmonSeverityEnum('severity_floor').notNull().default('low'),
  groupDuplicates: boolean('group_duplicates').notNull().default(true),
  /** Always false. This department may recommend but never remediate. */
  autoRemediationEnabled: boolean('auto_remediation_enabled').notNull().default(false),
  /** Always false. Credentials are monitored but never returned. */
  exposeSecretsEnabled: boolean('expose_secrets_enabled').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Triage recorded against a derived signal. The signal itself is recomputed
 * from evidence on every read; only the human decision is stored.
 */
export const secmonSignalStates = pgTable('secmon_signal_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  signalKey: text('signal_key').notNull(),
  category: secmonCategoryEnum('category').notNull(),
  triage: secmonTriageStateEnum('triage').notNull().default('new'),
  note: text('note'),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A named incident an Owner or security admin opened over one or more signals. */
export const secmonIncidents = pgTable('secmon_incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  reference: text('reference').notNull(),
  title: text('title').notNull(),
  status: secmonIncidentStatusEnum('status').notNull().default('open'),
  severity: secmonSeverityEnum('severity').notNull().default('medium'),
  category: secmonCategoryEnum('category').notNull(),
  summary: text('summary').notNull(),
  linkedSignalKeys: jsonb('linked_signal_keys').$type<string[]>().notNull().default([]),
  openedByUserId: uuid('opened_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

/**
 * An AURA recommendation awaiting an Owner decision. Approving one records the
 * decision only; no account, permission, credential or integration is changed.
 */
export const secmonActionDrafts = pgTable('secmon_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationKey: text('recommendation_key').notNull(),
  category: secmonCategoryEnum('category').notNull(),
  action: secmonRecommendedActionEnum('action').notNull(),
  severity: secmonSeverityEnum('severity').notNull().default('medium'),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  evidence: jsonb('evidence').$type<Record<string, unknown>[]>().notNull().default([]),
  decision: secmonActionDecisionEnum('decision').notNull().default('pending'),
  decisionNote: text('decision_note'),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  /** Always false. Approval is a record, never an execution. */
  executed: boolean('executed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only trail for this department. Rows are inserted, never updated. */
export const secmonAuditEvents = pgTable('secmon_audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  eventKind: secmonEventKindEnum('event_kind').notNull(),
  category: secmonCategoryEnum('category'),
  subjectKey: text('subject_key'),
  /** Already redacted before insert. Never holds a credential or a raw address. */
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SecmonSettingsRow = typeof secmonSettings.$inferSelect;
export type NewSmSettingsRow = typeof secmonSettings.$inferInsert;
export type SecmonSignalStateRow = typeof secmonSignalStates.$inferSelect;
export type NewSmSignalStateRow = typeof secmonSignalStates.$inferInsert;
export type SecmonIncidentRow = typeof secmonIncidents.$inferSelect;
export type NewSmIncidentRow = typeof secmonIncidents.$inferInsert;
export type SecmonActionDraftRow = typeof secmonActionDrafts.$inferSelect;
export type NewSmActionDraftRow = typeof secmonActionDrafts.$inferInsert;
export type SecmonAuditEventRow = typeof secmonAuditEvents.$inferSelect;
export type NewSmAuditEventRow = typeof secmonAuditEvents.$inferInsert;
