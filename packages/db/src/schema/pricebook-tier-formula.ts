import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

/**
 * Row 92 — company-scoped versioned pricebook tier multiplier rule sets.
 * Does not store catalogue prices. Does not auto-apply.
 */
export const companyPricebookRuleSets = pgTable(
  'company_pricebook_rule_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('DRAFT'),
    baseCostType: text('base_cost_type').notNull().default('UNKNOWN'),
    currency: text('currency').notNull().default('ZAR'),
    tiers: jsonb('tiers').$type<unknown[]>().notNull().default([]),
    globalAutomationEnabled: boolean('global_automation_enabled').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyVersionUidx: uniqueIndex('company_pricebook_rule_sets_company_version_uidx').on(
      table.companyId,
      table.version,
    ),
    companyStatusIdx: index('company_pricebook_rule_sets_company_status_idx').on(
      table.companyId,
      table.status,
    ),
  }),
);

export type CompanyPricebookRuleSet = typeof companyPricebookRuleSets.$inferSelect;
export type NewCompanyPricebookRuleSet = typeof companyPricebookRuleSets.$inferInsert;
