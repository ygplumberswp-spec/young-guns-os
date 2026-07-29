import { doublePrecision, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationConnections } from './integration-connections';
import { vehicles } from './vehicles';

export const gpsPositions = pgTable('gps_positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  externalVehicleId: text('external_vehicle_id').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  speedKmh: doublePrecision('speed_kmh'),
  heading: doublePrecision('heading'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
});

export type GpsPosition = typeof gpsPositions.$inferSelect;
export type NewGpsPosition = typeof gpsPositions.$inferInsert;
