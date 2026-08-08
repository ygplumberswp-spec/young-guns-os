import { boolean, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customerPeople } from './customer-360';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { users } from './users';

/**
 * Row 84 — Property / Site 360
 * Links Row 83 customer_people to a specific property/site.
 * Does not create a parallel people table.
 */

export const propertySiteContactRoleEnum = pgEnum('property_site_contact_role', [
  'primary',
  'project',
  'access',
  'other',
]);

export const propertySiteContacts = pgTable('property_site_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => cxCustomerProperties.id, { onDelete: 'cascade' }),
  personId: uuid('person_id')
    .notNull()
    .references(() => customerPeople.id, { onDelete: 'cascade' }),
  role: propertySiteContactRoleEnum('role').notNull().default('other'),
  isPrimary: boolean('is_primary').notNull().default(false),
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PropertySiteContact = typeof propertySiteContacts.$inferSelect;
export type NewPropertySiteContact = typeof propertySiteContacts.$inferInsert;
