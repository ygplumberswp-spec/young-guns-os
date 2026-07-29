import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { portalUsers } from './portal-users';

export const portalUserPermissions = pgTable('portal_user_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id')
    .notNull()
    .references(() => portalUsers.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PortalUserPermission = typeof portalUserPermissions.$inferSelect;
export type NewPortalUserPermission = typeof portalUserPermissions.$inferInsert;
