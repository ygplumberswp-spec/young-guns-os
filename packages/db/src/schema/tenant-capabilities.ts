import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { agentProfiles } from './agent-profiles';
import { agentKeyEnum } from './agent-profiles';

export const tenantCapabilityTypeEnum = pgEnum('tenant_capability_type', [
  'tenant_configuration',
  'code_backed',
]);

export const tenantCapabilityStatusEnum = pgEnum('tenant_capability_status', [
  'draft',
  'awaiting_approval',
  'testing',
  'active',
  'attention_required',
  'disabled',
  'archived',
  'failed_deployment',
]);

export const tenantCapabilityTestResultEnum = pgEnum('tenant_capability_test_result', [
  'passed',
  'passed_with_warnings',
  'failed',
]);

export const tenantCapabilities = pgTable(
  'tenant_capabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    department: text('department').notNull(),
    purpose: text('purpose').notNull(),
    capabilityType: tenantCapabilityTypeEnum('capability_type')
      .notNull()
      .default('tenant_configuration'),
    status: tenantCapabilityStatusEnum('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    baseAgentKey: agentKeyEnum('base_agent_key'),
    extendsAgentKey: agentKeyEnum('extends_agent_key'),
    agentProfileId: uuid('agent_profile_id').references(() => agentProfiles.id, {
      onDelete: 'set null',
    }),
    proposal: jsonb('proposal').$type<Record<string, unknown>>().notNull().default({}),
    configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
    approvalPolicy: jsonb('approval_policy').$type<Record<string, unknown>>().notNull().default({}),
    riskLevel: text('risk_level').notNull().default('low'),
    providerRequirements: jsonb('provider_requirements').$type<unknown[]>().notNull().default([]),
    healthState: jsonb('health_state').$type<Record<string, unknown>>().notNull().default({}),
    capabilityTags: jsonb('capability_tags').$type<string[]>().notNull().default([]),
    appBuilderRequestId: uuid('app_builder_request_id'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'no action' }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'no action',
    }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companySlugUnique: uniqueIndex('tenant_capabilities_company_slug_unique').on(
      table.companyId,
      table.slug,
    ),
  }),
);

export const tenantCapabilityVersions = pgTable('tenant_capability_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  capabilityId: uuid('capability_id')
    .notNull()
    .references(() => tenantCapabilities.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  status: tenantCapabilityStatusEnum('status').notNull(),
  proposal: jsonb('proposal').$type<Record<string, unknown>>().notNull().default({}),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
  changeSummary: text('change_summary'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantCapabilityTests = pgTable('tenant_capability_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  capabilityId: uuid('capability_id')
    .notNull()
    .references(() => tenantCapabilities.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  result: tenantCapabilityTestResultEnum('result').notNull(),
  summary: text('summary').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  testedByUserId: uuid('tested_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantCapabilityAuditLog = pgTable('tenant_capability_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  capabilityId: uuid('capability_id').references(() => tenantCapabilities.id, {
    onDelete: 'set null',
  }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TenantCapability = typeof tenantCapabilities.$inferSelect;
export type NewTenantCapability = typeof tenantCapabilities.$inferInsert;
