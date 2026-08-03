import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const integrationProviderEnum = pgEnum('integration_provider', [
  'cartrack',
  'xero',
  'email',
  'yoco',
  'whatsapp',
  'google_calendar',
  'google_maps',
  'gmail',
  'microsoft_365',
  'resend',
  'custom',
]);

export const integrationConnectionStatusEnum = pgEnum('integration_connection_status', [
  'disconnected',
  'pending',
  'connected',
  'error',
]);

export type IntegrationConnectionConfig = {
  baseUrl?: string;
  tenantId?: string;
  organisationName?: string;
  organisationId?: string;
  baseCurrency?: string;
  lastVerifiedAt?: string;
  authMethod?: 'oauth';
  host?: string;
  port?: number;
  secure?: boolean;
  fromEmail?: string;
  fromName?: string;
  businessName?: string;
  businessId?: string;
  /** SHA-256 prefix of the Yoco secret key (safe identifier; not the secret). */
  keyFingerprint?: string;
  /** Optional Checkout API webhook-list probe result (unknown when list endpoint fails). */
  webhookCapability?: 'available' | 'unavailable' | 'unknown';
  environment?: 'test' | 'live';
  lastCredentialChangeAt?: string;
  /** Google Maps Platform — tenant service flags and defaults. */
  services?: {
    places?: boolean;
    geocoding?: boolean;
    directions?: boolean;
    distanceMatrix?: boolean;
    routes?: boolean;
    mapsJavascript?: boolean;
  };
  defaultRegion?: string;
  defaultLanguage?: string;
  lastValidatedAt?: string | null;
  /** Most recent Google Maps connection probe (stored JSON; shape matches shared GoogleMapsTestResult). */
  lastTest?: {
    ok: boolean;
    message: string;
    testedAt: string;
    servicesChecked: string[];
    serviceResults: Array<{
      service: string;
      status: string;
      message: string;
      keyStatus: string | null;
    }>;
    serverKeyStatus: string;
    browserKeyStatus: string;
  } | null;
  /** Resend — last outbound delivery snapshot for Integrations UI. */
  lastDeliveryAt?: string | null;
  lastDeliveryStatus?: 'sent' | 'delivered' | 'failed' | null;
  lastDeliveryError?: string | null;
  domainCount?: number;
};

export const integrationConnections = pgTable('integration_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  provider: integrationProviderEnum('provider').notNull(),
  status: integrationConnectionStatusEnum('status').notNull().default('disconnected'),
  credentialsEncrypted: text('credentials_encrypted'),
  config: jsonb('config').$type<IntegrationConnectionConfig>().notNull().default({}),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IntegrationConnection = typeof integrationConnections.$inferSelect;
export type NewIntegrationConnection = typeof integrationConnections.$inferInsert;
