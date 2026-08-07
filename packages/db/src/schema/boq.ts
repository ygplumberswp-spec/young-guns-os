import { integer, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { jobs } from './jobs';
import { quotes } from './quotes';

export const boqStatusEnum = pgEnum('boq_status', [
  'draft',
  'in_review',
  'approved',
  'converted',
  'cancelled',
]);

export const boqDocuments = pgTable('boq_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  boqNumber: text('boq_number').notNull(),
  title: text('title').notNull(),
  status: boqStatusEnum('status').notNull().default('draft'),
  sourceFilename: text('source_filename'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const boqLineItems = pgTable('boq_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  boqDocumentId: uuid('boq_document_id')
    .notNull()
    .references(() => boqDocuments.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  section: text('section'),
  itemNumber: text('item_number'),
  description: text('description').notNull(),
  unit: text('unit'),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull().default('1'),
  unitCostCents: integer('unit_cost_cents'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BoqDocument = typeof boqDocuments.$inferSelect;
export type BoqLineItem = typeof boqLineItems.$inferSelect;
