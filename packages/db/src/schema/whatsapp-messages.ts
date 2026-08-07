import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';
import { whatsappTemplateCategoryEnum, whatsappTemplates } from './whatsapp-templates';

export const whatsappMessageDirectionEnum = pgEnum('whatsapp_message_direction', [
  'incoming',
  'outgoing',
]);

export const whatsappDeliveryStatusEnum = pgEnum('whatsapp_delivery_status', [
  'draft',
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
]);

export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    direction: whatsappMessageDirectionEnum('direction').notNull(),
    messageContent: text('message_content').notNull(),
    externalMessageId: text('external_message_id'),
    deliveryStatus: whatsappDeliveryStatusEnum('delivery_status').notNull().default('pending'),
    templateId: uuid('template_id').references(() => whatsappTemplates.id, { onDelete: 'set null' }),
    notificationCategory: whatsappTemplateCategoryEnum('notification_category'),
    isDraft: boolean('is_draft').notNull().default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('whatsapp_messages_company_id_idx').on(table.companyId),
    index('whatsapp_messages_customer_id_idx').on(table.customerId),
    index('whatsapp_messages_external_message_id_idx').on(table.externalMessageId),
    uniqueIndex('whatsapp_messages_company_external_uidx')
      .on(table.companyId, table.externalMessageId)
      .where(sql`${table.externalMessageId} IS NOT NULL`),
  ],
);

export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsappMessage = typeof whatsappMessages.$inferInsert;
