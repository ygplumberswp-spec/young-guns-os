import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { jobs } from './jobs';
import { suppliers } from './procurement';
import { users } from './users';
import { vehicles } from './vehicles';

export const assetTypeEnum = pgEnum('asset_type', [
  'vehicle',
  'machinery',
  'tool',
  'equipment',
  'office_asset',
  'it_equipment',
  'rented_asset',
]);

export const assetStatusEnum = pgEnum('asset_status', [
  'active',
  'inactive',
  'maintenance',
  'retired',
  'disposed',
  'out_of_service',
]);

export const assetConditionEnum = pgEnum('asset_condition', [
  'excellent',
  'good',
  'fair',
  'poor',
  'critical',
]);

export const assetLifecycleEventTypeEnum = pgEnum('asset_lifecycle_event_type', [
  'acquisition',
  'assignment',
  'transfer',
  'maintenance',
  'repair',
  'calibration',
  'warranty',
  'retirement',
  'disposal',
]);

export const assetScheduleTypeEnum = pgEnum('asset_schedule_type', [
  'recurring',
  'usage_based',
  'inspection_reminder',
  'warranty_reminder',
  'service_interval',
]);

export const assetMaintenanceTypeEnum = pgEnum('asset_maintenance_type', [
  'planned',
  'emergency',
  'corrective',
  'preventative',
]);

export const assetMaintenanceStatusEnum = pgEnum('asset_maintenance_status', [
  'scheduled',
  'pending_approval',
  'approved',
  'in_progress',
  'completed',
  'cancelled',
]);

export const assetInspectionTypeEnum = pgEnum('asset_inspection_type', [
  'safety',
  'vehicle',
  'equipment',
  'toolbox',
  'compliance',
]);

export const assetInspectionStatusEnum = pgEnum('asset_inspection_status', [
  'scheduled',
  'in_progress',
  'passed',
  'failed',
  'overdue',
]);

export const assetCalibrationStatusEnum = pgEnum('asset_calibration_status', [
  'valid',
  'expiring',
  'expired',
  'not_required',
]);

export const assetCostTypeEnum = pgEnum('asset_cost_type', [
  'maintenance',
  'repair',
  'downtime',
  'replacement',
  'warranty_recovery',
]);

export const assetActionTypeEnum = pgEnum('asset_action_type', [
  'maintenance_action',
  'replacement_recommendation',
]);

export const assetActionStatusEnum = pgEnum('asset_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const assetEquipment = pgTable('asset_equipment', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetType: assetTypeEnum('asset_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  serialNumber: text('serial_number'),
  barcodeReference: text('barcode_reference'),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  purchaseDate: timestamp('purchase_date', { withTimezone: true }),
  warrantyExpiresAt: timestamp('warranty_expires_at', { withTimezone: true }),
  depreciationReference: text('depreciation_reference'),
  assignedTechnicianId: uuid('assigned_technician_id').references(() => users.id, { onDelete: 'set null' }),
  branchKey: text('branch_key'),
  status: assetStatusEnum('status').notNull().default('active'),
  condition: assetConditionEnum('condition').notNull().default('good'),
  locationText: text('location_text'),
  photoDocumentIds: jsonb('photo_document_ids').$type<string[]>().notNull().default([]),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetLifecycleEvents = pgTable('asset_lifecycle_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  eventType: assetLifecycleEventTypeEnum('event_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetMaintenanceSchedules = pgTable('asset_maintenance_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  scheduleType: assetScheduleTypeEnum('schedule_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  intervalDays: integer('interval_days'),
  intervalUsageHours: integer('interval_usage_hours'),
  nextDueAt: timestamp('next_due_at', { withTimezone: true }),
  lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetMaintenanceRecords = pgTable('asset_maintenance_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  maintenanceType: assetMaintenanceTypeEnum('maintenance_type').notNull(),
  status: assetMaintenanceStatusEnum('status').notNull().default('pending_approval'),
  title: text('title').notNull(),
  description: text('description'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  assignedTechnicianId: uuid('assigned_technician_id').references(() => users.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  labourCostCents: integer('labour_cost_cents').notNull().default(0),
  partsCostCents: integer('parts_cost_cents').notNull().default(0),
  totalCostCents: integer('total_cost_cents').notNull().default(0),
  downtimeHours: numeric('downtime_hours', { precision: 8, scale: 2 }),
  notes: text('notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetInspections = pgTable('asset_inspections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  inspectionType: assetInspectionTypeEnum('inspection_type').notNull(),
  status: assetInspectionStatusEnum('status').notNull().default('scheduled'),
  checklist: jsonb('checklist').$type<Array<{ item: string; passed: boolean | null }>>().notNull().default([]),
  findings: text('findings'),
  photoDocumentIds: jsonb('photo_document_ids').$type<string[]>().notNull().default([]),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  inspectorUserId: uuid('inspector_user_id').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetCalibrations = pgTable('asset_calibrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  certificationName: text('certification_name').notNull(),
  calibratedAt: timestamp('calibrated_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  testingHistory: jsonb('testing_history').$type<Array<{ testedAt: string; result: string }>>().notNull().default([]),
  complianceStatus: assetCalibrationStatusEnum('compliance_status').notNull().default('valid'),
  renewalRecommendation: text('renewal_recommendation'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetMaintenanceCosts = pgTable('asset_maintenance_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  maintenanceRecordId: uuid('maintenance_record_id').references(() => assetMaintenanceRecords.id, {
    onDelete: 'set null',
  }),
  costType: assetCostTypeEnum('cost_type').notNull(),
  amountCents: integer('amount_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetMaintenanceActions = pgTable('asset_maintenance_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assetEquipment.id, { onDelete: 'set null' }),
  actionType: assetActionTypeEnum('action_type').notNull(),
  status: assetActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AssetEquipment = typeof assetEquipment.$inferSelect;
export type AssetLifecycleEvent = typeof assetLifecycleEvents.$inferSelect;
export type AssetMaintenanceSchedule = typeof assetMaintenanceSchedules.$inferSelect;
export type AssetMaintenanceRecord = typeof assetMaintenanceRecords.$inferSelect;
export type AssetInspection = typeof assetInspections.$inferSelect;
export type AssetCalibration = typeof assetCalibrations.$inferSelect;
export type AssetMaintenanceCost = typeof assetMaintenanceCosts.$inferSelect;
export type AssetMaintenanceAction = typeof assetMaintenanceActions.$inferSelect;
