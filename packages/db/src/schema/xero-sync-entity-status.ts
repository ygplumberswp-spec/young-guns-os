import { pgEnum } from 'drizzle-orm/pg-core';

export const xeroSyncEntityStatusEnum = pgEnum('xero_sync_entity_status', [
  'pending',
  'synced',
  'failed',
  'out_of_sync',
]);

export const xeroSyncLogActionEnum = pgEnum('xero_sync_log_action', [
  'push',
  'pull',
  'update',
  'link',
]);

export const xeroSyncLogStatusEnum = pgEnum('xero_sync_log_status', ['success', 'failed']);

export const xeroSyncEntityTypeEnum = pgEnum('xero_sync_entity_type', [
  'customer',
  'quote',
  'invoice',
  'payment',
  'bank_transaction',
]);
