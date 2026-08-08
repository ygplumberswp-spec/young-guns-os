import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const bankProductionConnectGateDecisions = pgTable(
  'bank_production_connect_gate_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    environment: text('environment').notNull(),
    status: text('status').notNull(),
    allowed: boolean('allowed').notNull().default(false),
    mode: text('mode').notNull(),
    missingEvidence: jsonb('missing_evidence').notNull().default([]),
    bypassAttempted: boolean('bypass_attempted').notNull().default(false),
    evidence: jsonb('evidence').notNull().default({}),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    moneyMovement: integer('money_movement').notNull().default(0),
    connectsFnb: boolean('connects_fnb').notNull().default(false),
    requestsCredentials: boolean('requests_credentials').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('bank_prod_gate_company_idx').on(table.companyId, table.createdAt),
  }),
);

export type BankProductionConnectGateDecision =
  typeof bankProductionConnectGateDecisions.$inferSelect;
