import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

/**
 * Effective-dated technician compensation terms.
 * Monthly salary is private payroll truth; derived hourly cost feeds job labour allocation only.
 */
export const technicianPayrollTerms = pgTable(
  'technician_payroll_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    monthlySalaryCents: integer('monthly_salary_cents').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    /** Inclusive end date; null means open-ended current term. */
    effectiveTo: date('effective_to'),
    workingDaysPerWeek: numeric('working_days_per_week', { precision: 4, scale: 2 })
      .notNull()
      .default('5'),
    workingHoursPerDay: numeric('working_hours_per_day', { precision: 4, scale: 2 })
      .notNull()
      .default('8'),
    overtimeDailyThresholdHours: numeric('overtime_daily_threshold_hours', {
      precision: 4,
      scale: 2,
    })
      .notNull()
      .default('8'),
    /** 15000 = 1.5× */
    overtimeMultiplierBps: integer('overtime_multiplier_bps').notNull().default(15000),
    payrollReference: text('payroll_reference'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserIdx: index('technician_payroll_terms_company_user_idx').on(
      table.companyId,
      table.userId,
    ),
    companyUserFromIdx: index('technician_payroll_terms_company_user_from_idx').on(
      table.companyId,
      table.userId,
      table.effectiveFrom,
    ),
  }),
);

export type TechnicianPayrollTerm = typeof technicianPayrollTerms.$inferSelect;
export type NewTechnicianPayrollTerm = typeof technicianPayrollTerms.$inferInsert;
