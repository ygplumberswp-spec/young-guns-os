import {
  boolean,
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

/**
 * Row 83 — CURRENT Customer 360
 * First-class people/contacts under a canonical company customer,
 * plus non-destructive associations to related Xero/source customer rows.
 */

export const customerPersonStatusEnum = pgEnum('customer_person_status', ['active', 'inactive']);

export const customerSourceAssociationStatusEnum = pgEnum('customer_source_association_status', [
  'active',
  'removed',
]);

export const customerPeople = pgTable('customer_people', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  displayName: text('display_name').notNull(),
  roleTitle: text('role_title'),
  email: text('email'),
  phone: text('phone'),
  mobile: text('mobile'),
  isPrimary: boolean('is_primary').notNull().default(false),
  isBillingContact: boolean('is_billing_contact').notNull().default(false),
  isSiteContact: boolean('is_site_contact').notNull().default(false),
  emailAllowed: boolean('email_allowed').notNull().default(true),
  smsAllowed: boolean('sms_allowed').notNull().default(true),
  whatsappAllowed: boolean('whatsapp_allowed').notNull().default(true),
  phoneAllowed: boolean('phone_allowed').notNull().default(true),
  preferredContactMethod: text('preferred_contact_method'),
  consentStatus: text('consent_status').notNull().default('unknown'),
  consentSource: text('consent_source'),
  consentCapturedAt: timestamp('consent_captured_at', { withTimezone: true }),
  status: customerPersonStatusEnum('status').notNull().default('active'),
  notes: text('notes'),
  sourceProvider: text('source_provider'),
  sourceExternalId: text('source_external_id'),
  linkedSourceCustomerId: uuid('linked_source_customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerSourceAssociations = pgTable('customer_source_associations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  canonicalCustomerId: uuid('canonical_customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  sourceCustomerId: uuid('source_customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  personId: uuid('person_id').references(() => customerPeople.id, { onDelete: 'set null' }),
  associationRole: text('association_role').notNull().default('related_person'),
  status: customerSourceAssociationStatusEnum('status').notNull().default('active'),
  reason: text('reason'),
  sourceProvider: text('source_provider'),
  sourceExternalId: text('source_external_id'),
  preservesFinancialOwnership: boolean('preserves_financial_ownership').notNull().default(true),
  destructiveMerge: boolean('destructive_merge').notNull().default(false),
  xeroWrite: boolean('xero_write').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  removedByUserId: uuid('removed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
});

export type CustomerPerson = typeof customerPeople.$inferSelect;
export type NewCustomerPerson = typeof customerPeople.$inferInsert;
export type CustomerSourceAssociation = typeof customerSourceAssociations.$inferSelect;
export type NewCustomerSourceAssociation = typeof customerSourceAssociations.$inferInsert;
