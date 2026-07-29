import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { recruitingCandidates } from './recruiting-candidates';
import { users } from './users';

export const candidateActivityTypeEnum = pgEnum('candidate_activity_type', [
  'note',
  'screening',
  'interview',
  'assessment',
  'communication',
  'status_change',
  'other',
]);

export const workforceRecommendationTypeEnum = pgEnum('workforce_recommendation_type', [
  'staffing',
  'training',
  'recruitment',
  'capacity',
  'skill_gap',
  'performance',
]);

export const workforceRecommendationStatusEnum = pgEnum('workforce_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const candidateActivities = pgTable('candidate_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => recruitingCandidates.id, { onDelete: 'cascade' }),
  activityType: candidateActivityTypeEnum('activity_type').notNull().default('note'),
  subject: text('subject'),
  body: text('body').notNull(),
  authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const employeeSkills = pgTable('employee_skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  skillKey: text('skill_key').notNull(),
  skillName: text('skill_name').notNull(),
  proficiency: text('proficiency').notNull().default('intermediate'),
  experienceYears: integer('experience_years'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const certifications = pgTable('certifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  certificationKey: text('certification_key').notNull(),
  name: text('name').notNull(),
  issuer: text('issuer'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trainingRecords = pgTable('training_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  trainingKey: text('training_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('planned'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workforceRecommendations = pgTable('workforce_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationType: workforceRecommendationTypeEnum('recommendation_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: workforceRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CandidateActivity = typeof candidateActivities.$inferSelect;
export type EmployeeSkill = typeof employeeSkills.$inferSelect;
export type Certification = typeof certifications.$inferSelect;
export type TrainingRecord = typeof trainingRecords.$inferSelect;
export type WorkforceRecommendation = typeof workforceRecommendations.$inferSelect;
