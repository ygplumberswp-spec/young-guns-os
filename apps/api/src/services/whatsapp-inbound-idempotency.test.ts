/**
 * LIVE-001E — WhatsApp inbound idempotency regression.
 * Same Meta webhook message.id delivered twice → one stored business message.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { WhatsappService } from './whatsapp.service.js';
import type { WhatsappWebhookPayload } from '../lib/whatsapp.client.js';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = join(apiRoot, '../..');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function sampleInboundPayload(externalMessageId: string): WhatsappWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-number-staging-1',
              },
              contacts: [{ profile: { name: 'Owner Test' }, wa_id: '27820000001' }],
              messages: [
                {
                  from: '27820000001',
                  id: externalMessageId,
                  timestamp: '1723000000',
                  type: 'text',
                  text: { body: 'TITAN inbound verification' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

type StoredMessage = {
  id: string;
  companyId: string;
  customerId: string | null;
  direction: string;
  messageContent: string;
  externalMessageId: string | null;
  deliveryStatus: string;
  deliveredAt: Date | null;
};

describe('WhatsApp inbound idempotency contracts (LIVE-001E)', () => {
  it('webhook insert uses onConflictDoNothing on (companyId, externalMessageId)', () => {
    const service = read(join(apiRoot, 'src/services/whatsapp.service.ts'));
    assert.ok(service.includes('onConflictDoNothing'));
    assert.ok(service.includes('whatsappMessages.companyId'));
    assert.ok(service.includes('whatsappMessages.externalMessageId'));
    assert.ok(service.includes('inserted.length === 0'));
  });

  it('hub business WhatsApp index uses onConflictDoNothing for Meta message.id', () => {
    const service = read(join(apiRoot, 'src/services/communications-platform.service.ts'));
    assert.ok(service.includes('indexBusinessWhatsappInbound'));
    assert.ok(service.includes('onConflictDoNothing'));
    assert.ok(service.includes('commPlatformInboxIndex.externalMessageId'));
    assert.ok(service.includes("source: 'meta_cloud_api_webhook'"));
    assert.ok(service.includes('autoSend: false'));
  });

  it('migration 0192 adds partial unique indexes without deleting history', () => {
    const sql = read(
      join(repoRoot, 'packages/db/drizzle/0192_whatsapp_inbound_idempotency.sql'),
    );
    assert.ok(sql.includes('whatsapp_messages_company_external_uidx'));
    assert.ok(sql.includes('comm_platform_inbox_company_kind_external_uidx'));
    assert.ok(sql.includes('not auto-cleaned'));
    // No mutating DML — comments may say "delete" but statements must not.
    assert.doesNotMatch(sql, /^\s*DELETE\b/im);
    assert.doesNotMatch(sql, /^\s*UPDATE\b/im);
  });

  it('journal registers 0192_whatsapp_inbound_idempotency', () => {
    const journal = read(join(repoRoot, 'packages/db/drizzle/meta/_journal.json'));
    assert.ok(journal.includes('0192_whatsapp_inbound_idempotency'));
  });

  it('AURA send policy remains draft → approve → execute (no auto customer reply)', () => {
    const shared = read(
      join(repoRoot, 'packages/shared/src/communication-aura-intelligence.ts'),
    );
    assert.ok(shared.includes('autoSendEnabled: false'));
    assert.ok(shared.includes('draftApproveExecute: true'));
    const aura = read(
      join(apiRoot, 'src/services/communication-aura-intelligence.service.ts'),
    );
    assert.ok(aura.includes('Approval does not send'));
    assert.ok(aura.includes('autoSend: false'));
  });
});

describe('WhatsApp inbound double-delivery (LIVE-001E)', () => {
  it('same webhook message.id twice → one stored row and processed=1 then 0', async () => {
    const messages: StoredMessage[] = [];
    let seq = 0;
    const externalMessageId = 'wamid.LIVE001E_PROOF_001';

    const findExisting = async () =>
      messages.find(
        (m) => m.companyId === 'company-1' && m.externalMessageId === externalMessageId,
      );

    const db = {
      query: {
        whatsappConnections: {
          findFirst: async () => ({
            id: 'conn-1',
            companyId: 'company-1',
            phoneNumberId: 'phone-number-staging-1',
            status: 'connected',
          }),
        },
        whatsappMessages: {
          findFirst: async () => findExisting(),
        },
        customers: {
          findMany: async () => [],
        },
      },
      insert: () => ({
        values: (row: {
          companyId: string;
          customerId: string | null;
          direction: string;
          messageContent: string;
          externalMessageId: string;
          deliveryStatus: string;
          deliveredAt: Date;
        }) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (
                messages.some(
                  (m) =>
                    m.companyId === row.companyId &&
                    m.externalMessageId === row.externalMessageId,
                )
              ) {
                return [];
              }
              const stored: StoredMessage = {
                id: `msg-${++seq}`,
                companyId: row.companyId,
                customerId: row.customerId,
                direction: row.direction,
                messageContent: row.messageContent,
                externalMessageId: row.externalMessageId,
                deliveryStatus: row.deliveryStatus,
                deliveredAt: row.deliveredAt,
              };
              messages.push(stored);
              return [{ id: stored.id }];
            },
          }),
        }),
      }),
    };

    const service = WhatsappService.create({
      db: db as never,
      apiPublicUrl: 'http://localhost:3000',
      runtime: {
        whatsappEnabled: true,
        webhooksEnabled: true,
        outboundMessagesEnabled: false,
      },
    });

    const payload = sampleInboundPayload(externalMessageId);
    const first = await service.handleWebhook(payload);
    const second = await service.handleWebhook(payload);

    assert.equal(first.processed, 1);
    assert.equal(second.processed, 0);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.externalMessageId, externalMessageId);
    assert.equal(messages[0]?.direction, 'incoming');
    assert.equal(messages[0]?.messageContent, 'TITAN inbound verification');
  });

  it('concurrent race: findFirst miss + unique conflict → still one row', async () => {
    const messages: StoredMessage[] = [];
    let seq = 0;
    const externalMessageId = 'wamid.LIVE001E_RACE_001';

    const db = {
      query: {
        whatsappConnections: {
          findFirst: async () => ({
            id: 'conn-1',
            companyId: 'company-1',
            phoneNumberId: 'phone-number-staging-1',
            status: 'connected',
          }),
        },
        whatsappMessages: {
          // Simulate race: both deliveries miss the pre-check
          findFirst: async () => undefined,
        },
        customers: {
          findMany: async () => [],
        },
      },
      insert: () => ({
        values: (row: {
          companyId: string;
          customerId: string | null;
          direction: string;
          messageContent: string;
          externalMessageId: string;
          deliveryStatus: string;
          deliveredAt: Date;
        }) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (
                messages.some(
                  (m) =>
                    m.companyId === row.companyId &&
                    m.externalMessageId === row.externalMessageId,
                )
              ) {
                return [];
              }
              const stored: StoredMessage = {
                id: `msg-${++seq}`,
                companyId: row.companyId,
                customerId: row.customerId,
                direction: row.direction,
                messageContent: row.messageContent,
                externalMessageId: row.externalMessageId,
                deliveryStatus: row.deliveryStatus,
                deliveredAt: row.deliveredAt,
              };
              messages.push(stored);
              return [{ id: stored.id }];
            },
          }),
        }),
      }),
    };

    const service = WhatsappService.create({
      db: db as never,
      apiPublicUrl: 'http://localhost:3000',
      runtime: {
        whatsappEnabled: true,
        webhooksEnabled: true,
        outboundMessagesEnabled: false,
      },
    });

    const payload = sampleInboundPayload(externalMessageId);
    const [a, b] = await Promise.all([
      service.handleWebhook(payload),
      service.handleWebhook(payload),
    ]);

    assert.equal(a.processed + b.processed, 1);
    assert.equal(messages.length, 1);
  });
});
