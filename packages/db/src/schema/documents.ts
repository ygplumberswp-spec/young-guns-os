import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { documentCategories } from './document-categories';
import { jobs } from './jobs';
import { users } from './users';

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => documentCategories.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  uploadedByUserId: uuid('uploaded_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  title: text('title').notNull(),
  description: text('description'),
  fileName: text('file_name').notNull(),
  fileType: text('file_type'),
  fileSizeBytes: integer('file_size_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
