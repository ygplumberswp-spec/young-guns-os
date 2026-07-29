import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const whatsappTemplateCategoryEnum = pgEnum('whatsapp_template_category', [
  'job_booked_confirmation',
  'technician_assigned',
  'technician_on_the_way',
  'job_completed',
  'invoice_sent',
  'payment_reminder',
  'utility',
  'marketing',
]);

export const whatsappTemplateStatusEnum = pgEnum('whatsapp_template_status', [
  'pending',
  'approved',
  'rejected',
]);

export const whatsappTemplates = pgTable('whatsapp_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  externalTemplateId: text('external_template_id'),
  category: whatsappTemplateCategoryEnum('category').notNull().default('utility'),
  language: text('language').notNull().default('en'),
  body: text('body').notNull(),
  variables: jsonb('variables').$type<string[]>().notNull().default([]),
  status: whatsappTemplateStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;
export type NewWhatsappTemplate = typeof whatsappTemplates.$inferInsert;
