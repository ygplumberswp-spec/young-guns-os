import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { assetEquipment, assetMaintenanceSchedules } from './asset-equipment';
import { companies } from './companies';
import { customers } from './customers';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { users } from './users';

export const alOwnershipTypeEnum = pgEnum('al_ownership_type', ['customer_owned', 'company_owned']);

export const alLifecycleStageEnum = pgEnum('al_lifecycle_stage', [
  'procurement',
  'delivery',
  'installation',
  'commissioning',
  'active_operation',
  'inspection',
  'maintenance',
  'repair',
  'upgrade',
  'transfer',
  'decommissioning',
  'disposal',
]);

export const alLifecycleStageStatusEnum = pgEnum('al_lifecycle_stage_status', [
  'draft',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const alIotProviderTypeEnum = pgEnum('al_iot_provider_type', [
  'mqtt',
  'http_rest',
  'webhook',
  'modbus',
  'lorawan',
  'azure_iot',
  'aws_iot',
  'thingsboard',
  'particle',
  'siemens',
  'schneider',
  'bosch',
  'custom',
]);

export const alIotAdapterStatusEnum = pgEnum('al_iot_adapter_status', [
  'active',
  'inactive',
  'testing',
  'error',
]);

export const alTelemetryFieldEnum = pgEnum('al_telemetry_field', [
  'temperature',
  'pressure',
  'flow',
  'voltage',
  'current',
  'power',
  'energy_usage',
  'vibration',
  'humidity',
  'water_level',
  'fuel_level',
  'runtime',
  'starts_stops',
  'fault_code',
  'battery_level',
  'signal_strength',
  'gps_position',
  'device_health',
  'custom',
]);

export const alTelemetryQualityEnum = pgEnum('al_telemetry_quality', [
  'good',
  'uncertain',
  'bad',
  'unknown',
]);

export const alAlertSeverityEnum = pgEnum('al_alert_severity', [
  'info',
  'warning',
  'critical',
  'emergency',
]);

export const alAlertStatusEnum = pgEnum('al_alert_status', [
  'open',
  'acknowledged',
  'assigned',
  'escalated',
  'resolved',
  'closed',
]);

export const alAlertTypeEnum = pgEnum('al_alert_type', [
  'high_temperature',
  'low_pressure',
  'abnormal_flow',
  'high_energy_usage',
  'vibration_anomaly',
  'water_leak',
  'equipment_offline',
  'sensor_failure',
  'battery_low',
  'warranty_risk',
  'maintenance_overdue',
  'critical_fault_code',
  'custom',
]);

export const alMaintenanceDueStatusEnum = pgEnum('al_maintenance_due_status', [
  'due',
  'overdue',
  'scheduled',
  'completed',
  'cancelled',
]);

export const alPredictiveStatusEnum = pgEnum('al_predictive_status', [
  'recommended',
  'acknowledged',
  'dismissed',
  'actioned',
]);

export const alWorkOrderDraftTypeEnum = pgEnum('al_work_order_draft_type', [
  'inspection_request',
  'maintenance_job',
  'emergency_job',
  'technician_assignment',
  'parts_requirement',
  'quotation_draft',
  'customer_notification',
]);

export const alWorkOrderDraftStatusEnum = pgEnum('al_work_order_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const alPlatformConfig = pgTable('al_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  globalPolicies: jsonb('global_policies').$type<Record<string, unknown>>().notNull().default({}),
  iotAdapterTemplates: jsonb('iot_adapter_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  telemetryStandards: jsonb('telemetry_standards')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  retentionPolicies: jsonb('retention_policies')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  defaultAlertPolicies: jsonb('default_alert_policies')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alAssetCategories = pgTable('al_asset_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alAssetRegistryProfiles = pgTable('al_asset_registry_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .unique()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => alAssetCategories.id, { onDelete: 'set null' }),
  customCategoryName: text('custom_category_name'),
  ownershipType: alOwnershipTypeEnum('ownership_type').notNull().default('company_owned'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  manufacturer: text('manufacturer'),
  model: text('model'),
  installationDate: date('installation_date'),
  commissioningDate: date('commissioning_date'),
  warrantyDetails: jsonb('warranty_details').$type<Record<string, unknown>>().notNull().default({}),
  criticality: text('criticality'),
  lifecycleStage: alLifecycleStageEnum('lifecycle_stage').notNull().default('active_operation'),
  linkedMetadata: jsonb('linked_metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alLifecycleStageHistory = pgTable('al_lifecycle_stage_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  stage: alLifecycleStageEnum('stage').notNull(),
  status: alLifecycleStageStatusEnum('status').notNull().default('executed'),
  title: text('title').notNull(),
  description: text('description'),
  responsibleUserId: uuid('responsible_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  costCents: integer('cost_cents'),
  currency: text('currency').default('USD'),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alIotProviderAdapters = pgTable('al_iot_provider_adapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerType: alIotProviderTypeEnum('provider_type').notNull(),
  providerKey: text('provider_key').notNull(),
  name: text('name').notNull(),
  status: alIotAdapterStatusEnum('status').notNull().default('inactive'),
  endpointUrl: text('endpoint_url'),
  credentialsVaultKey: text('credentials_vault_key'),
  isPrimary: boolean('is_primary').notNull().default(false),
  pollingIntervalSeconds: integer('polling_interval_seconds'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  lastTestAt: timestamp('last_test_at', { withTimezone: true }),
  lastTestStatus: text('last_test_status'),
  lastTestMessage: text('last_test_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alIotDevices = pgTable('al_iot_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerAdapterId: uuid('provider_adapter_id').references(() => alIotProviderAdapters.id, {
    onDelete: 'set null',
  }),
  assetId: uuid('asset_id').references(() => assetEquipment.id, { onDelete: 'set null' }),
  externalDeviceId: text('external_device_id').notNull(),
  deviceName: text('device_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  connectivityStatus: text('connectivity_status'),
  batteryLevel: numeric('battery_level', { precision: 5, scale: 2 }),
  signalStrength: numeric('signal_strength', { precision: 5, scale: 2 }),
  telemetryFieldMap: jsonb('telemetry_field_map')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  thresholdConfig: jsonb('threshold_config').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alTelemetryReadings = pgTable('al_telemetry_readings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id')
    .notNull()
    .references(() => alIotDevices.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assetEquipment.id, { onDelete: 'set null' }),
  providerAdapterId: uuid('provider_adapter_id').references(() => alIotProviderAdapters.id, {
    onDelete: 'set null',
  }),
  field: alTelemetryFieldEnum('field').notNull(),
  customFieldName: text('custom_field_name'),
  normalizedValue: numeric('normalized_value', { precision: 20, scale: 6 }).notNull(),
  unit: text('unit'),
  quality: alTelemetryQualityEnum('quality').notNull().default('good'),
  rawPayloadRef: text('raw_payload_ref'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alAssetAlerts = pgTable('al_asset_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assetEquipment.id, { onDelete: 'set null' }),
  deviceId: uuid('device_id').references(() => alIotDevices.id, { onDelete: 'set null' }),
  alertType: alAlertTypeEnum('alert_type').notNull(),
  severity: alAlertSeverityEnum('severity').notNull().default('warning'),
  status: alAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionNotes: text('resolution_notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alPreventiveMaintenanceDue = pgTable('al_preventive_maintenance_due', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  scheduleId: uuid('schedule_id').references(() => assetMaintenanceSchedules.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  dueReason: text('due_reason').notNull(),
  status: alMaintenanceDueStatusEnum('status').notNull().default('due'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alPredictiveAssessments = pgTable('al_predictive_assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  status: alPredictiveStatusEnum('status').notNull().default('recommended'),
  failureRiskScore: numeric('failure_risk_score', { precision: 5, scale: 2 }),
  remainingUsefulLifeDays: integer('remaining_useful_life_days'),
  maintenanceRecommendation: text('maintenance_recommendation'),
  inspectionRecommendation: text('inspection_recommendation'),
  partsRecommendation: text('parts_recommendation'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  supportingEvidence: jsonb('supporting_evidence')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  explanation: text('explanation'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alWarrantyComplianceRecords = pgTable('al_warranty_compliance_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  warrantyStatus: text('warranty_status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  conditions: jsonb('conditions').$type<Record<string, unknown>>().notNull().default({}),
  serviceIntervalDays: integer('service_interval_days'),
  complianceInspectionDueAt: timestamp('compliance_inspection_due_at', { withTimezone: true }),
  certificateDocumentIds: jsonb('certificate_document_ids').$type<string[]>().notNull().default([]),
  recallNotice: text('recall_notice'),
  manufacturerNotice: text('manufacturer_notice'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alWorkOrderDrafts = pgTable('al_work_order_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assetEquipment.id, { onDelete: 'set null' }),
  alertId: uuid('alert_id').references(() => alAssetAlerts.id, { onDelete: 'set null' }),
  draftType: alWorkOrderDraftTypeEnum('draft_type').notNull(),
  status: alWorkOrderDraftStatusEnum('status').notNull().default('draft'),
  subject: text('subject').notNull(),
  description: text('description'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alAnalyticsSnapshots = pgTable('al_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetUptimePercent: numeric('asset_uptime_percent', { precision: 5, scale: 2 }),
  downtimeHours: numeric('downtime_hours', { precision: 10, scale: 2 }),
  failureRate: numeric('failure_rate', { precision: 5, scale: 2 }),
  mtbfHours: numeric('mtbf_hours', { precision: 10, scale: 2 }),
  mttrHours: numeric('mttr_hours', { precision: 10, scale: 2 }),
  maintenanceCostCents: integer('maintenance_cost_cents').notNull().default(0),
  energyUsageKwh: numeric('energy_usage_kwh', { precision: 12, scale: 2 }),
  predictiveRiskAvg: numeric('predictive_risk_avg', { precision: 5, scale: 2 }),
  deviceConnectivityPercent: numeric('device_connectivity_percent', { precision: 5, scale: 2 }),
  alertResponseTimeHours: numeric('alert_response_time_hours', { precision: 10, scale: 2 }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alAuditLogs = pgTable('al_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AlPlatformConfig = typeof alPlatformConfig.$inferSelect;
export type AlAssetCategory = typeof alAssetCategories.$inferSelect;
export type AlAssetRegistryProfile = typeof alAssetRegistryProfiles.$inferSelect;
export type AlIotProviderAdapter = typeof alIotProviderAdapters.$inferSelect;
export type AlIotDevice = typeof alIotDevices.$inferSelect;
export type AlTelemetryReading = typeof alTelemetryReadings.$inferSelect;
export type AlAssetAlert = typeof alAssetAlerts.$inferSelect;
export type AlPredictiveAssessment = typeof alPredictiveAssessments.$inferSelect;
export type AlWorkOrderDraft = typeof alWorkOrderDrafts.$inferSelect;
export type AlAnalyticsSnapshot = typeof alAnalyticsSnapshots.$inferSelect;
