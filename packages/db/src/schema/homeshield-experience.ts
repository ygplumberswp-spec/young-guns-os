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
import { users } from './users';
import { opsRecurringMaintenancePlans } from './recurring-maintenance';
/**
 * HomeShield Customer Experience — membership plans, subscriptions, benefits,
 * reminders, renewal opportunity drafts, outreach drafts. Extends recurring
 * maintenance / portal / communications; never auto-bills.
 */
export const hsPlanStatusEnum = pgEnum('hs_plan_status', [
    'draft',
    'active',
    'paused',
    'archived',
]);
export const hsSubscriptionStatusEnum = pgEnum('hs_subscription_status', [
    'draft',
    'active',
    'paused',
    'past_due',
    'cancelled',
    'expired',
]);
export const hsBillingIntervalEnum = pgEnum('hs_billing_interval', [
    'monthly',
    'quarterly',
    'annual',
    'custom',
]);
export const hsReminderStatusEnum = pgEnum('hs_reminder_status', [
    'pending',
    'acknowledged',
    'dismissed',
    'snoozed',
    'cancelled',
]);
export const hsRenewalStatusEnum = pgEnum('hs_renewal_status', [
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled',
    'executed',
]);
export const hsOutreachStatusEnum = pgEnum('hs_outreach_status', [
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'executed',
    'cancelled',
]);
export const hsSettings = pgTable('hs_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
        .notNull()
        .references(() => companies.id, { onDelete: 'cascade' }),
    /** Invariant: always false. */
    autoBillingEnabled: boolean('auto_billing_enabled').notNull().default(false),
    /** Invariant: always false. */
    autoChargeEnabled: boolean('auto_charge_enabled').notNull().default(false),
    renewalDraftsEnabled: boolean('renewal_drafts_enabled').notNull().default(true),
    outreachDraftsEnabled: boolean('outreach_drafts_enabled').notNull().default(true),
    reminderDraftsEnabled: boolean('reminder_drafts_enabled').notNull().default(true),
    notes: text('notes'),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
        onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const hsMembershipPlans = pgTable('hs_membership_plans', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
        .notNull()
        .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    billingInterval: hsBillingIntervalEnum('billing_interval').notNull().default('annual'),
    priceCents: integer('price_cents').notNull().default(0),
    currency: text('currency').notNull().default('ZAR'),
    status: hsPlanStatusEnum('status').notNull().default('draft'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
        onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const hsSubscriptions = pgTable('hs_subscriptions', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
        .notNull()
        .references(() => companies.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
        .notNull()
        .references(() => hsMembershipPlans.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
        .notNull()
        .references(() => customers.id, { onDelete: 'cascade' }),
    status: hsSubscriptionStatusEnum('status').notNull().default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    renewsAt: timestamp('renews_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Invariant: always false. */
    autoBilling: boolean('auto_billing').notNull().default(false),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
        onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const hsBenefits = pgTable('hs_benefits', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
        .notNull()
        .references(() => companies.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => hsMembershipPlans.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
        onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const hsServiceReminders = pgTable('hs_service_reminders', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
        .notNull()
        .references(() => companies.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => hsSubscriptions.id, {
        onDelete: 'set null',
    }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    maintenancePlanId: uuid('maintenance_plan_id').references(() => opsRecurringMaintenancePlans.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    remindAt: timestamp('remind_at', { withTimezone: true }).notNull(),
    status: hsReminderStatusEnum('status').notNull().default('pending'),
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
export const hsRenewalOpportunities = pgTable('hs_renewal_opportunities', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
        .notNull()
        .references(() => companies.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => hsSubscriptions.id, {
        onDelete: 'set null',
    }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    planId: uuid('plan_id').references(() => hsMembershipPlans.id, { onDelete: 'set null' }),
    status: hsRenewalStatusEnum('status').notNull().default('draft'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Invariant: always false. */
    autoBilling: boolean('auto_billing').notNull().default(false),
    /** Invariant: always false in this layer. */
    billingCharged: boolean('billing_charged').notNull().default(false),
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
export const hsOutreachDrafts = pgTable('hs_outreach_drafts', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
        .notNull()
        .references(() => companies.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    subscriptionId: uuid('subscription_id').references(() => hsSubscriptions.id, {
        onDelete: 'set null',
    }),
    renewalOpportunityId: uuid('renewal_opportunity_id').references(() => hsRenewalOpportunities.id, { onDelete: 'set null' }),
    status: hsOutreachStatusEnum('status').notNull().default('draft'),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    emailDraftId: uuid('email_draft_id'),
    /** Invariant: always false. */
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
export const hsAuraKindEnum = pgEnum('hs_aura_kind', [
    'renewal_opportunity',
    'maintenance_opportunity',
    'customer_value',
    'retention',
]);
export const hsAuraStatusEnum = pgEnum('hs_aura_status', [
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled',
    'acknowledged',
]);
export const hsAuraInsights = pgTable('hs_aura_insights', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
        .notNull()
        .references(() => companies.id, { onDelete: 'cascade' }),
    kind: hsAuraKindEnum('kind').notNull(),
    status: hsAuraStatusEnum('status').notNull().default('draft'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    subscriptionId: uuid('subscription_id').references(() => hsSubscriptions.id, {
        onDelete: 'set null',
    }),
    planId: uuid('plan_id').references(() => hsMembershipPlans.id, { onDelete: 'set null' }),
    maintenancePlanId: uuid('maintenance_plan_id').references(() => opsRecurringMaintenancePlans.id, { onDelete: 'set null' }),
    /** Invariant: always false. */
    autoBilling: boolean('auto_billing').notNull().default(false),
    /** Invariant: always false. */
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
