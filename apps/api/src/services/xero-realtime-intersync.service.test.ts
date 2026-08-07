import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { xeroTargetedRefreshJobs, xeroWebhookEvents } from '@titan/db';
import { signXeroWebhookPayload } from '../lib/xero-webhook-signing.js';
import { XeroRateBudgetService } from './xero-rate-budget.service.js';
import { XeroRealtimeIntersyncService } from './xero-realtime-intersync.service.js';
import type { XeroSyncService } from './xero-sync.service.js';

const WEBHOOK_KEY = 'test-xero-webhook-key-not-logged';
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = 'tenant-staging-1';

function sign(rawBody: string): string {
  return signXeroWebhookPayload(WEBHOOK_KEY, rawBody);
}

function validInvoiceEnvelope(resourceId = 'inv-1') {
  return JSON.stringify({
    events: [
      {
        resourceUrl: `https://api.xero.com/api.xro/2.0/Invoices/${resourceId}`,
        resourceId,
        eventType: 'UPDATE',
        eventCategory: 'INVOICE',
        tenantId: TENANT_ID,
        tenantType: 'ORGANISATION',
      },
    ],
    firstEventSequence: 1,
    lastEventSequence: 1,
  });
}

function createHarness(options?: { duplicateWebhookInsert?: boolean }) {
  const webhookEvents: Record<string, unknown>[] = [];
  const refreshJobs: Record<string, unknown>[] = [];
  let webhookInsertCount = 0;

  const db = {
    insert: (table: unknown) => ({
      values: async (row: Record<string, unknown>) => {
        if (table === xeroWebhookEvents) {
          webhookInsertCount += 1;
          if (options?.duplicateWebhookInsert && webhookInsertCount > 1) {
            const err = new Error('duplicate key') as Error & { code: string };
            err.code = '23505';
            throw err;
          }
          webhookEvents.push(row);
          return;
        }
        if (table === xeroTargetedRefreshJobs) {
          refreshJobs.push(row);
        }
      },
    }),
    query: {
      integrationConnections: {
        findMany: async () => [
          {
            companyId: COMPANY_ID,
            provider: 'xero',
            status: 'connected',
            config: { tenantId: TENANT_ID },
          },
        ],
      },
      xeroEntityCoverage: { findMany: async () => [] },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),
  } as unknown as import('@titan/db').DatabaseClient;

  const service = XeroRealtimeIntersyncService.create({
    db,
    xeroSyncService: {
      refreshTargetedInvoiceFromXero: async () => ({ failed: false, invoiceId: null }),
    } as unknown as XeroSyncService,
    rateBudget: XeroRateBudgetService.create(db),
    webhookKey: WEBHOOK_KEY,
    webhooksEnabled: true,
  });

  return { service, webhookEvents, refreshJobs };
}

describe('XeroRealtimeIntersyncService.handleWebhook', () => {
  it('1. missing signature → 401', async () => {
    const { service } = createHarness();
    const result = await service.handleWebhook({
      rawBody: validInvoiceEnvelope(),
      headers: {},
    });
    assert.equal(result.status, 401);
  });

  it('2. invalid signature → 401', async () => {
    const { service } = createHarness();
    const result = await service.handleWebhook({
      rawBody: validInvoiceEnvelope(),
      headers: { 'x-xero-signature': 'invalid-signature' },
    });
    assert.equal(result.status, 401);
  });

  it('3. valid signature with malformed JSON → 400', async () => {
    const { service, webhookEvents, refreshJobs } = createHarness();
    const rawBody = 'not-json{{{';
    const result = await service.handleWebhook({
      rawBody,
      headers: { 'x-xero-signature': sign(rawBody) },
    });
    assert.equal(result.status, 400);
    assert.equal(webhookEvents.length, 0);
    assert.equal(refreshJobs.length, 0);
  });

  it('4. valid signature with structurally invalid body → 400', async () => {
    const { service, webhookEvents, refreshJobs } = createHarness();
    const rawBody = JSON.stringify({ events: [{ eventCategory: 'INVOICE' }] });
    const result = await service.handleWebhook({
      rawBody,
      headers: { 'x-xero-signature': sign(rawBody) },
    });
    assert.equal(result.status, 400);
    assert.equal(webhookEvents.length, 0);
    assert.equal(refreshJobs.length, 0);
  });

  it('5. valid empty validation payload → 200', async () => {
    const { service } = createHarness();
    const rawBody = JSON.stringify({ events: [] });
    const result = await service.handleWebhook({
      rawBody,
      headers: { 'x-xero-signature': sign(rawBody) },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { received: 0 });
  });

  it('6. valid supported INVOICE envelope → 200', async () => {
    const { service, webhookEvents, refreshJobs } = createHarness();
    const rawBody = validInvoiceEnvelope();
    const result = await service.handleWebhook({
      rawBody,
      headers: { 'x-xero-signature': sign(rawBody) },
    });
    assert.equal(result.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(webhookEvents.length, 1);
    assert.equal(refreshJobs.length, 1);
  });

  it('7. duplicate event → deduplicated', async () => {
    const harness = createHarness({ duplicateWebhookInsert: true });
    const rawBody = validInvoiceEnvelope();
    const headers = { 'x-xero-signature': sign(rawBody) };

    const first = await harness.service.handleWebhook({ rawBody, headers });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await harness.service.handleWebhook({ rawBody, headers });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(harness.webhookEvents.length, 1);
    assert.equal(harness.refreshJobs.length, 1);
  });

  it('8. unsupported category → 200 without queue', async () => {
    const { service, webhookEvents, refreshJobs } = createHarness();
    const rawBody = JSON.stringify({
      events: [
        {
          resourceUrl: 'https://api.xero.com/api.xro/2.0/Subscriptions/s1',
          resourceId: 's1',
          eventType: 'CREATE',
          eventCategory: 'SUBSCRIPTION',
          tenantId: TENANT_ID,
          tenantType: 'ORGANISATION',
        },
      ],
    });
    const result = await service.handleWebhook({
      rawBody,
      headers: { 'x-xero-signature': sign(rawBody) },
    });
    assert.equal(result.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(webhookEvents.length, 0);
    assert.equal(refreshJobs.length, 0);
  });

  it('9. malformed input creates no event or job rows', async () => {
    const { service, webhookEvents, refreshJobs } = createHarness();
    const rawBody = '[]';
    const result = await service.handleWebhook({
      rawBody,
      headers: { 'x-xero-signature': sign(rawBody) },
    });
    assert.equal(result.status, 400);
    assert.equal(webhookEvents.length, 0);
    assert.equal(refreshJobs.length, 0);
  });

  it('10. responses never include webhook key or raw signature', async () => {
    const { service } = createHarness();
    const rawBody = validInvoiceEnvelope();
    const signature = sign(rawBody);
    const result = await service.handleWebhook({
      rawBody,
      headers: { 'x-xero-signature': signature },
    });
    const serialized = JSON.stringify(result.body);
    assert.doesNotMatch(serialized, new RegExp(WEBHOOK_KEY));
    assert.doesNotMatch(serialized, new RegExp(signature));
  });
});
