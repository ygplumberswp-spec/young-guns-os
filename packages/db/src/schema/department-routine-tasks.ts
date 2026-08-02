import { boolean, date, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const departmentRoutineTaskStatusEnum = pgEnum('department_routine_task_status', [
  'pending',
  'in_progress',
  'completed',
  'overdue',
  'blocked',
  'awaiting_approval',
  'skipped',
]);

export const departmentRoutineTaskCadenceEnum = pgEnum('department_routine_task_cadence', [
  'daily',
  'weekly',
  'monthly',
]);

export const departmentRoutineTaskHandoffStatusEnum = pgEnum(
  'department_routine_task_handoff_status',
  ['pending', 'completed'],
);

export const departmentRoutineTaskAuditEventEnum = pgEnum(
  'department_routine_task_audit_event',
  [
    'created',
    'status_changed',
    'completed',
    'skipped',
    'handoff',
    'approval_requested',
    'approved',
    'rejected',
  ],
);

export const departmentRoutineTasks = pgTable('department_routine_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  departmentId: text('department_id').notNull(),
  routineKey: text('routine_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  href: text('href').notNull(),
  cadence: departmentRoutineTaskCadenceEnum('cadence').notNull(),
  accountableOwner: text('accountable_owner').notNull(),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  dueDate: date('due_date').notNull(),
  periodStart: date('period_start').notNull(),
  status: departmentRoutineTaskStatusEnum('status').notNull().default('pending'),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  approvalGateId: text('approval_gate_id'),
  handoffToDepartmentId: text('handoff_to_department_id'),
  handoffStatus: departmentRoutineTaskHandoffStatusEnum('handoff_status'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  skippedAt: timestamp('skipped_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const departmentRoutineTaskAuditLogs = pgTable('department_routine_task_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id')
    .notNull()
    .references(() => departmentRoutineTasks.id, { onDelete: 'cascade' }),
  eventType: departmentRoutineTaskAuditEventEnum('event_type').notNull(),
  fromStatus: departmentRoutineTaskStatusEnum('from_status'),
  toStatus: departmentRoutineTaskStatusEnum('to_status'),
  message: text('message').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DepartmentRoutineTask = typeof departmentRoutineTasks.$inferSelect;
export type NewDepartmentRoutineTask = typeof departmentRoutineTasks.$inferInsert;
export type DepartmentRoutineTaskAuditLog = typeof departmentRoutineTaskAuditLogs.$inferSelect;
export type NewDepartmentRoutineTaskAuditLog =
  typeof departmentRoutineTaskAuditLogs.$inferInsert;
