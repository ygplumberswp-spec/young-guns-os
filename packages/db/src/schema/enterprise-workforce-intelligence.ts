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
import { companies } from './companies';
import { jobs } from './jobs';
import { users } from './users';

export const wiProviderCategoryEnum = pgEnum('wi_provider_category', [
  'payroll',
  'hr',
  'accounting',
  'timekeeping',
]);

export const wiProviderTypeEnum = pgEnum('wi_provider_type', [
  'sage_payroll',
  'sage_business_cloud',
  'xero_payroll',
  'quickbooks_payroll',
  'payspace',
  'simplepay',
  'bamboohr',
  'deel',
  'workday',
  'sap_successfactors',
  'zoho_people',
  'employment_hero',
  'microsoft_dynamics',
  'csv_import_export',
  'sftp',
  'generic_rest',
  'webhook',
  'custom',
]);

export const wiAdapterStatusEnum = pgEnum('wi_adapter_status', [
  'active',
  'inactive',
  'testing',
  'error',
]);

export const wiSyncDirectionEnum = pgEnum('wi_sync_direction', [
  'inbound',
  'outbound',
  'bidirectional',
]);

export const wiLifecycleStageEnum = pgEnum('wi_lifecycle_stage', [
  'candidate',
  'applicant',
  'interview',
  'offer',
  'pre_employment',
  'onboarding',
  'active',
  'probation',
  'role_change',
  'promotion',
  'transfer',
  'suspension',
  'leave',
  'offboarding',
  'termination',
  'alumni',
]);

export const wiLifecycleStatusEnum = pgEnum('wi_lifecycle_status', [
  'draft',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const wiTimesheetStatusEnum = pgEnum('wi_timesheet_status', [
  'draft',
  'submitted',
  'approved',
  'corrected',
]);

export const wiLeaveStatusEnum = pgEnum('wi_leave_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

export const wiPayrollPrepStatusEnum = pgEnum('wi_payroll_prep_status', [
  'draft',
  'pending_approval',
  'approved',
  'exported',
  'failed',
]);

export const wiHrDraftTypeEnum = pgEnum('wi_hr_draft_type', [
  'termination',
  'suspension',
  'role_change',
  'payroll_export',
  'offboarding',
  'disciplinary',
  'onboarding_plan',
  'development_plan',
  'performance_report',
  'hr_communication',
  'payroll_exception_summary',
  'training_recommendation',
  'technician_match',
]);

export const wiHrDraftStatusEnum = pgEnum('wi_hr_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const wiOnboardingTaskStatusEnum = pgEnum('wi_onboarding_task_status', [
  'pending',
  'in_progress',
  'completed',
  'skipped',
]);

export const wiPlatformConfig = pgTable('wi_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  globalPolicies: jsonb('global_policies').$type<Record<string, unknown>>().notNull().default({}),
  providerAdapterTemplates: jsonb('provider_adapter_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  jurisdictionTemplates: jsonb('jurisdiction_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  leavePolicyDefaults: jsonb('leave_policy_defaults')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  performanceRules: jsonb('performance_rules')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  privacyPolicies: jsonb('privacy_policies').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiWorkforceCategories = pgTable('wi_workforce_categories', {
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

export const wiWorkforceProfiles = pgTable('wi_workforce_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => wiWorkforceCategories.id, {
    onDelete: 'set null',
  }),
  customCategoryName: text('custom_category_name'),
  employeeNumber: text('employee_number'),
  employmentType: text('employment_type'),
  jobTitle: text('job_title'),
  department: text('department'),
  branch: text('branch'),
  managerUserId: uuid('manager_user_id').references(() => users.id, { onDelete: 'set null' }),
  startDate: date('start_date'),
  contractStatus: text('contract_status'),
  workingHours: jsonb('working_hours').$type<Record<string, unknown>>().notNull().default({}),
  contactDetails: jsonb('contact_details').$type<Record<string, unknown>>().notNull().default({}),
  emergencyContact: jsonb('emergency_contact')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  assignedVehicleId: uuid('assigned_vehicle_id'),
  assignedTools: jsonb('assigned_tools').$type<string[]>().notNull().default([]),
  assignedEquipment: jsonb('assigned_equipment').$type<string[]>().notNull().default([]),
  payrollProviderRef: text('payroll_provider_ref'),
  accountingProviderRef: text('accounting_provider_ref'),
  lifecycleStage: wiLifecycleStageEnum('lifecycle_stage').notNull().default('active'),
  jurisdictionConfig: jsonb('jurisdiction_config')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiProviderAdapters = pgTable('wi_provider_adapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerCategory: wiProviderCategoryEnum('provider_category').notNull(),
  providerType: wiProviderTypeEnum('provider_type').notNull(),
  providerKey: text('provider_key').notNull(),
  name: text('name').notNull(),
  status: wiAdapterStatusEnum('status').notNull().default('inactive'),
  isPrimary: boolean('is_primary').notNull().default(false),
  endpointUrl: text('endpoint_url'),
  credentialsVaultKey: text('credentials_vault_key'),
  syncDirection: wiSyncDirectionEnum('sync_direction').notNull().default('bidirectional'),
  syncFrequencyMinutes: integer('sync_frequency_minutes'),
  fieldMappings: jsonb('field_mappings').$type<Record<string, unknown>>().notNull().default({}),
  leaveTypeMappings: jsonb('leave_type_mappings')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  earningCodeMappings: jsonb('earning_code_mappings')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  deductionCodeMappings: jsonb('deduction_code_mappings')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  lastTestAt: timestamp('last_test_at', { withTimezone: true }),
  lastTestStatus: text('last_test_status'),
  lastTestMessage: text('last_test_message'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiProviderEmployeeMappings = pgTable('wi_provider_employee_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerAdapterId: uuid('provider_adapter_id')
    .notNull()
    .references(() => wiProviderAdapters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  externalEmployeeId: text('external_employee_id').notNull(),
  mappingMetadata: jsonb('mapping_metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiLifecycleStageHistory = pgTable('wi_lifecycle_stage_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  stage: wiLifecycleStageEnum('stage').notNull(),
  status: wiLifecycleStatusEnum('status').notNull().default('executed'),
  title: text('title').notNull(),
  description: text('description'),
  effectiveDate: date('effective_date'),
  responsibleUserId: uuid('responsible_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiOnboardingWorkflows = pgTable('wi_onboarding_workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: wiLifecycleStatusEnum('status').notNull().default('draft'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiOnboardingTasks = pgTable('wi_onboarding_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => wiOnboardingWorkflows.id, { onDelete: 'cascade' }),
  taskKey: text('task_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: wiOnboardingTaskStatusEnum('status').notNull().default('pending'),
  responsibleUserId: uuid('responsible_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiTimesheets = pgTable('wi_timesheets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: wiTimesheetStatusEnum('status').notNull().default('draft'),
  standardHours: numeric('standard_hours', { precision: 8, scale: 2 }).notNull().default('0'),
  overtimeHours: numeric('overtime_hours', { precision: 8, scale: 2 }).notNull().default('0'),
  travelHours: numeric('travel_hours', { precision: 8, scale: 2 }).notNull().default('0'),
  standbyHours: numeric('standby_hours', { precision: 8, scale: 2 }).notNull().default('0'),
  breakHours: numeric('break_hours', { precision: 8, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  clockInAt: timestamp('clock_in_at', { withTimezone: true }),
  clockOutAt: timestamp('clock_out_at', { withTimezone: true }),
  gpsMetadata: jsonb('gps_metadata').$type<Record<string, unknown>>().notNull().default({}),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiTimesheetCorrections = pgTable('wi_timesheet_corrections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  timesheetId: uuid('timesheet_id')
    .notNull()
    .references(() => wiTimesheets.id, { onDelete: 'cascade' }),
  fieldName: text('field_name').notNull(),
  originalValue: text('original_value').notNull(),
  correctedValue: text('corrected_value').notNull(),
  reason: text('reason').notNull(),
  approverUserId: uuid('approver_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  correctedAt: timestamp('corrected_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiLeaveCategories = pgTable('wi_leave_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  categoryKey: text('category_key').notNull(),
  description: text('description'),
  accrualRules: jsonb('accrual_rules').$type<Record<string, unknown>>().notNull().default({}),
  isPaid: boolean('is_paid').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiLeaveBalances = pgTable('wi_leave_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => wiLeaveCategories.id, { onDelete: 'cascade' }),
  balanceDays: numeric('balance_days', { precision: 8, scale: 2 }).notNull().default('0'),
  accruedDays: numeric('accrued_days', { precision: 8, scale: 2 }).notNull().default('0'),
  usedDays: numeric('used_days', { precision: 8, scale: 2 }).notNull().default('0'),
  asOfDate: date('as_of_date').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiLeaveApplications = pgTable('wi_leave_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => wiLeaveCategories.id, { onDelete: 'cascade' }),
  status: wiLeaveStatusEnum('status').notNull().default('pending'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  daysRequested: numeric('days_requested', { precision: 8, scale: 2 }).notNull(),
  reason: text('reason'),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  approverUserId: uuid('approver_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiPayrollPeriods = pgTable('wi_payroll_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: wiPayrollPrepStatusEnum('status').notNull().default('draft'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiPayrollPreparationBatches = pgTable('wi_payroll_preparation_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  payrollPeriodId: uuid('payroll_period_id')
    .notNull()
    .references(() => wiPayrollPeriods.id, { onDelete: 'cascade' }),
  providerAdapterId: uuid('provider_adapter_id').references(() => wiProviderAdapters.id, {
    onDelete: 'set null',
  }),
  status: wiPayrollPrepStatusEnum('status').notNull().default('draft'),
  validationSummary: jsonb('validation_summary')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  exceptionCount: integer('exception_count').notNull().default(0),
  earningsTotalCents: integer('earnings_total_cents').notNull().default(0),
  deductionsTotalCents: integer('deductions_total_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  exportedAt: timestamp('exported_at', { withTimezone: true }),
  exportReference: text('export_reference'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiPayrollExportLogs = pgTable('wi_payroll_export_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id')
    .notNull()
    .references(() => wiPayrollPreparationBatches.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  message: text('message'),
  providerResponse: jsonb('provider_response')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiTrainingCourses = pgTable('wi_training_courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  courseKey: text('course_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  providerName: text('provider_name'),
  isRequired: boolean('is_required').notNull().default(false),
  costCents: integer('cost_cents'),
  currency: text('currency').default('USD'),
  skillsGained: jsonb('skills_gained').$type<string[]>().notNull().default([]),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiTechnicianPerformanceSnapshots = pgTable('wi_technician_performance_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  jobsCompleted: integer('jobs_completed').notNull().default(0),
  jobsAssigned: integer('jobs_assigned').notNull().default(0),
  firstTimeFixRate: numeric('first_time_fix_rate', { precision: 5, scale: 2 }),
  averageJobDurationHours: numeric('average_job_duration_hours', { precision: 8, scale: 2 }),
  onTimeArrivalRate: numeric('on_time_arrival_rate', { precision: 5, scale: 2 }),
  reworkCount: integer('rework_count').notNull().default(0),
  callbackCount: integer('callback_count').notNull().default(0),
  customerSatisfactionAvg: numeric('customer_satisfaction_avg', { precision: 5, scale: 2 }),
  revenueContributionCents: integer('revenue_contribution_cents'),
  grossMarginContributionCents: integer('gross_margin_contribution_cents'),
  supportingEvidence: jsonb('supporting_evidence')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  explanation: text('explanation'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiHrActionDrafts = pgTable('wi_hr_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  draftType: wiHrDraftTypeEnum('draft_type').notNull(),
  status: wiHrDraftStatusEnum('status').notNull().default('draft'),
  subject: text('subject').notNull(),
  description: text('description'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiAnalyticsSnapshots = pgTable('wi_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  headcount: integer('headcount').notNull().default(0),
  contractorCount: integer('contractor_count').notNull().default(0),
  turnoverRate: numeric('turnover_rate', { precision: 5, scale: 2 }),
  absenceRate: numeric('absence_rate', { precision: 5, scale: 2 }),
  overtimeHours: numeric('overtime_hours', { precision: 10, scale: 2 }),
  capacityUtilization: numeric('capacity_utilization', { precision: 5, scale: 2 }),
  labourCostCents: integer('labour_cost_cents').notNull().default(0),
  certificationRiskCount: integer('certification_risk_count').notNull().default(0),
  payrollExceptionCount: integer('payroll_exception_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wiAuditLogs = pgTable('wi_audit_logs', {
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

export type WiPlatformConfig = typeof wiPlatformConfig.$inferSelect;
export type WiWorkforceCategory = typeof wiWorkforceCategories.$inferSelect;
export type WiWorkforceProfile = typeof wiWorkforceProfiles.$inferSelect;
export type WiProviderAdapter = typeof wiProviderAdapters.$inferSelect;
export type WiTimesheet = typeof wiTimesheets.$inferSelect;
export type WiLeaveApplication = typeof wiLeaveApplications.$inferSelect;
export type WiPayrollPreparationBatch = typeof wiPayrollPreparationBatches.$inferSelect;
export type WiHrActionDraft = typeof wiHrActionDrafts.$inferSelect;
export type WiAnalyticsSnapshot = typeof wiAnalyticsSnapshots.$inferSelect;
