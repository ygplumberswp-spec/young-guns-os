import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { documents } from './documents';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { invoices } from './invoices';
import { jobs } from './jobs';
import { boqDocuments } from './boq';
import { quotes } from './quotes';
import { users } from './users';

export const completionReportStatusEnum = pgEnum('completion_report_status', [
  'draft',
  'generated',
  'ready_to_send',
  'sent',
  'cancelled',
]);

export const completionReports = pgTable('completion_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  boqDocumentId: uuid('boq_document_id').references(() => boqDocuments.id, {
    onDelete: 'set null',
  }),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  reportNumber: text('report_number').notNull(),
  title: text('title').notNull(),
  status: completionReportStatusEnum('status').notNull().default('draft'),
  includedSections: jsonb('included_sections').$type<string[]>().notNull().default([]),
  sectionPayload: jsonb('section_payload').$type<Record<string, unknown>>().notNull().default({}),
  htmlBody: text('html_body'),
  mapAvailability: text('map_availability').notNull().default('unavailable_no_coordinates'),
  mapPlaceUrl: text('map_place_url'),
  notes: text('notes'),
  emailDraftId: text('email_draft_id'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  clientActionId: text('client_action_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompletionReport = typeof completionReports.$inferSelect;
export type NewCompletionReport = typeof completionReports.$inferInsert;
