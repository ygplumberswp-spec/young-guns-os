import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { inventoryItems } from './inventory-items';
import {
  jobCrewRoleEnum,
  jobExecutionPhaseEnum,
  jobMaterialLineStatusEnum,
  jobMaterialSourceEnum,
  jobVariationStatusEnum,
} from './job-execution-enums';
import { inventoryLocations } from './inventory-locations';
import { jobs } from './jobs';
import { mobileJobInventoryUsage } from './mobile-workforce';
import { users } from './users';
import { vehicles } from './vehicles';

export {
  jobCrewRoleEnum,
  jobExecutionPhaseEnum,
  jobMaterialLineStatusEnum,
  jobMaterialSourceEnum,
  jobVariationStatusEnum,
} from './job-execution-enums';

export const jobCrewMembers = pgTable('job_crew_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  crewRole: jobCrewRoleEnum('crew_role').notNull().default('assistant'),
  isPrimary: boolean('is_primary').notNull().default(false),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  unassignedAt: timestamp('unassigned_at', { withTimezone: true }),
  assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobVehicleAssignments = pgTable('job_vehicle_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'restrict' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  unassignedAt: timestamp('unassigned_at', { withTimezone: true }),
  assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobWorkflowEvents = pgTable('job_workflow_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  fromPhase: jobExecutionPhaseEnum('from_phase'),
  toPhase: jobExecutionPhaseEnum('to_phase'),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  reason: text('reason'),
  clientActionId: text('client_action_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobVariations = pgTable('job_variations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  status: jobVariationStatusEnum('status').notNull().default('pending'),
  title: text('title').notNull(),
  siteCondition: text('site_condition').notNull(),
  explanation: text('explanation').notNull(),
  labourEffect: text('labour_effect'),
  materialEffect: text('material_effect'),
  proposedScope: text('proposed_scope'),
  photoDocIds: jsonb('photo_doc_ids').$type<string[]>().notNull().default([]),
  authorizedByUserId: uuid('authorized_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  authorizationNotes: text('authorization_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobCompletionSnapshots = pgTable('job_completion_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  completedByUserId: uuid('completed_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobMaterialLines = pgTable('job_material_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  recordedByUserId: uuid('recorded_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unit: text('unit').notNull().default('ea'),
  materialSource: jobMaterialSourceEnum('material_source').notNull(),
  status: jobMaterialLineStatusEnum('status').notNull().default('used'),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  inventoryUsageId: uuid('inventory_usage_id').references(() => mobileJobInventoryUsage.id, {
    onDelete: 'set null',
  }),
  locationId: uuid('location_id').references(() => inventoryLocations.id, {
    onDelete: 'set null',
  }),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  fulfilledQuantity: numeric('fulfilled_quantity', { precision: 12, scale: 3 }),
  quotedQuantity: numeric('quoted_quantity', { precision: 12, scale: 3 }),
  clientActionId: text('client_action_id'),
  stockMovementId: uuid('stock_movement_id'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  returnReason: text('return_reason'),
  supplierReference: text('supplier_reference'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Multi-day work sessions — one canonical job, Visit 1..N. */
export const jobVisitStatusEnum = pgEnum('job_visit_status', ['open', 'closed']);
export const jobVisitCloseReasonEnum = pgEnum('job_visit_close_reason', [
  'still_busy',
  'completed',
  'rescheduled',
  'cancelled',
]);

export const jobVisits = pgTable('job_visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  visitNumber: integer('visit_number').notNull(),
  status: jobVisitStatusEnum('status').notNull().default('open'),
  technicianUserId: uuid('technician_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  labourMinutes: integer('labour_minutes').notNull().default(0),
  travelMinutes: integer('travel_minutes').notNull().default(0),
  notes: text('notes'),
  workCompletedSummary: text('work_completed_summary'),
  remainingWorkSummary: text('remaining_work_summary'),
  closeReason: jobVisitCloseReasonEnum('close_reason'),
  materialCount: integer('material_count').notNull().default(0),
  photoCount: integer('photo_count').notNull().default(0),
  slipCount: integer('slip_count').notNull().default(0),
  clientActionId: text('client_action_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type JobCrewMember = typeof jobCrewMembers.$inferSelect;
export type JobVehicleAssignment = typeof jobVehicleAssignments.$inferSelect;
export type JobWorkflowEvent = typeof jobWorkflowEvents.$inferSelect;
export type JobVariation = typeof jobVariations.$inferSelect;
export type JobCompletionSnapshot = typeof jobCompletionSnapshots.$inferSelect;
export type JobMaterialLine = typeof jobMaterialLines.$inferSelect;
export type JobVisit = typeof jobVisits.$inferSelect;
