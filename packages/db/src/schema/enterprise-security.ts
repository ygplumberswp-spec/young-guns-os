import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const securityAuditCategoryEnum = pgEnum('security_audit_category', [
  'authentication',
  'authorization',
  'financial',
  'workflow',
  'ai',
  'crm',
  'inventory',
  'fleet',
  'dispatch',
  'quality',
  'communications',
  'personal_workspace',
  'reports',
  'integrations',
  'api',
  'settings',
  'security',
]);

export const securityLoginEventTypeEnum = pgEnum('security_login_event_type', [
  'login_success',
  'login_failed',
  'logout',
  'session_revoked',
  'suspicious',
]);

export const securityRiskLevelEnum = pgEnum('security_risk_level', ['low', 'medium', 'high', 'critical']);

export const securityActionTypeEnum = pgEnum('security_action_type', [
  'security_action',
  'permission_change',
  'integration_lockdown',
  'session_revocation',
  'privacy_request',
]);

export const securityActionStatusEnum = pgEnum('security_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const securityPrivacyRequestTypeEnum = pgEnum('security_privacy_request_type', [
  'data_export',
  'data_deletion',
  'consent_update',
]);

export const securityPrivacyRequestStatusEnum = pgEnum('security_privacy_request_status', [
  'pending',
  'in_review',
  'approved',
  'completed',
  'rejected',
]);

export const securityPermissionGrantTypeEnum = pgEnum('security_permission_grant_type', [
  'temporary',
  'delegated',
  'executive_override',
]);

export const securityTenantPolicies = pgTable('security_tenant_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' })
    .unique(),
  mfaRequired: boolean('mfa_required').notNull().default(false),
  sessionTimeoutMinutes: integer('session_timeout_minutes').notNull().default(480),
  passwordExpiryDays: integer('password_expiry_days'),
  passwordHistoryCount: integer('password_history_count').notNull().default(5),
  maxFailedLoginAttempts: integer('max_failed_login_attempts').notNull().default(5),
  trustedDeviceRequired: boolean('trusted_device_required').notNull().default(false),
  personalWorkspaceIsolation: boolean('personal_workspace_isolation').notNull().default(true),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  popiaReady: boolean('popia_ready').notNull().default(false),
  gdprReady: boolean('gdpr_ready').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityMfaSettings = pgTable('security_mfa_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  totpSecretEncrypted: text('totp_secret_encrypted'),
  backupCodesHashed: jsonb('backup_codes_hashed').$type<string[]>().notNull().default([]),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityTrustedDevices = pgTable('security_trusted_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  deviceLabel: text('device_label').notNull(),
  deviceFingerprint: text('device_fingerprint').notNull(),
  approved: boolean('approved').notNull().default(false),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityWebauthnCredentials = pgTable('security_webauthn_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull(),
  publicKey: text('public_key').notNull(),
  deviceLabel: text('device_label'),
  signCount: integer('sign_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityLoginEvents = pgTable('security_login_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  eventType: securityLoginEventTypeEnum('event_type').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  geoHint: text('geo_hint'),
  riskLevel: securityRiskLevelEnum('risk_level').notNull().default('low'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityPasswordHistory = pgTable('security_password_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityPermissionGrants = pgTable('security_permission_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  grantType: securityPermissionGrantTypeEnum('grant_type').notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  grantedToUserId: uuid('granted_to_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  grantedByUserId: uuid('granted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  approved: boolean('approved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityAuditLogs = pgTable('security_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  category: securityAuditCategoryEnum('category').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  sessionId: uuid('session_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityRiskAlerts = pgTable('security_risk_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  riskLevel: securityRiskLevelEnum('risk_level').notNull(),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  sourceCategory: securityAuditCategoryEnum('source_category'),
  resolved: boolean('resolved').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityActions = pgTable('security_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: securityActionTypeEnum('action_type').notNull(),
  status: securityActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityPrivacyRequests = pgTable('security_privacy_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  requestType: securityPrivacyRequestTypeEnum('request_type').notNull(),
  status: securityPrivacyRequestStatusEnum('status').notNull().default('pending'),
  subject: text('subject').notNull(),
  notes: text('notes'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityFileRecords = pgTable('security_file_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id'),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  contentHash: text('content_hash'),
  scanStatus: text('scan_status').notNull().default('pending'),
  signedUrlExpiresAt: timestamp('signed_url_expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityAiEvents = pgTable('security_ai_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  agentKey: text('agent_key'),
  toolKey: text('tool_key'),
  eventType: text('event_type').notNull(),
  blocked: boolean('blocked').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityCommAccessLogs = pgTable('security_comm_access_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  channel: text('channel').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  consentVerified: boolean('consent_verified').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityWorkspaceSettings = pgTable('security_workspace_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' })
    .unique(),
  businessWorkspaceEncrypted: boolean('business_workspace_encrypted').notNull().default(true),
  personalWorkspaceEncrypted: boolean('personal_workspace_encrypted').notNull().default(true),
  independentAuditTrail: boolean('independent_audit_trail').notNull().default(true),
  independentAiMemory: boolean('independent_ai_memory').notNull().default(true),
  businessAgentPersonalAccess: boolean('business_agent_personal_access').notNull().default(false),
  personalAgentBusinessExposure: boolean('personal_agent_business_exposure').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const securityApiRateCounters = pgTable('security_api_rate_counters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  windowKey: text('window_key').notNull(),
  requestCount: integer('request_count').notNull().default(0),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
});
