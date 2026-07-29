import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationConnections } from './integration-connections';
import { vehicles } from './vehicles';

export const integrationMappingStatusEnum = pgEnum('integration_mapping_status', [
  'unmapped',
  'mapped',
  'ignored',
]);

export const integrationVehicleMappings = pgTable('integration_vehicle_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  externalVehicleId: text('external_vehicle_id').notNull(),
  externalRegistration: text('external_registration'),
  externalName: text('external_name'),
  status: integrationMappingStatusEnum('status').notNull().default('unmapped'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IntegrationVehicleMapping = typeof integrationVehicleMappings.$inferSelect;
export type NewIntegrationVehicleMapping = typeof integrationVehicleMappings.$inferInsert;
