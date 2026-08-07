import { pgEnum } from 'drizzle-orm/pg-core';

export const jobExecutionPhaseEnum = pgEnum('job_execution_phase', [
  'assigned',
  'accepted',
  'en_route',
  'on_site',
  'in_progress',
  'paused',
  'awaiting_customer',
  'awaiting_parts',
  'awaiting_approval',
  'work_continues',
  'ready_to_complete',
  'completed',
]);

export const jobCrewRoleEnum = pgEnum('job_crew_role', [
  'crew_leader',
  'driver',
  'qualified',
  'semi_skilled',
  'assistant',
]);

export const jobMaterialSourceEnum = pgEnum('job_material_source', [
  'vehicle_stock',
  'warehouse_stock',
  'supplier_purchase',
  'customer_supplied',
]);

export const jobMaterialLineStatusEnum = pgEnum('job_material_line_status', [
  'requested',
  'approved',
  'used',
  'partially_fulfilled',
  'returned',
  'wasted',
  'rejected',
  'cancelled',
]);

export const jobVariationStatusEnum = pgEnum('job_variation_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

export const jobMaterialStockVarianceStatusEnum = pgEnum('job_material_stock_variance_status', [
  'none',
  'review_required',
  'resolved',
]);
