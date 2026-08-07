import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { createXeroWebhookRouter } from './xero-webhook.js';
import { signXeroWebhookPayload } from '../lib/xero-webhook-signing.js';
import { XeroRealtimeIntersyncService } from '../services/xero-realtime-intersync.service.js';
import type { XeroSyncService } from '../services/xero-sync.service.js';
import { XeroRateBudgetService } from '../services/xero-rate-budget.service.js';
import { xeroTargetedRefreshJobs, xeroWebhookEvents } from '@titan/db';

const WEBHOOK_KEY = 'route-test-xero-webhook-key-not-logged';

function sign(rawBody: string): string {
  return signXeroWebhookPayload(WEBHOOK_KEY, rawBody);
}

function buildApp() {
  const webhookEvents: unknown[] = [];
  const refreshJobs: unknown[] = [];

  const db = {
    insert: (table: unknown) => ({
      values: async (row: unknown) => {
        if (table === xeroWebhookEvents) webhookEvents.push(row);
        if (table === xeroTargetedRefreshJobs) refreshJobs.push(row);
      },
    }),
    query: {
      integrationConnections: { findMany: async () => [] },
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
    xeroSyncService: {} as XeroSyncService,
    rateBudget: XeroRateBudgetService.create(db),
    webhookKey: WEBHOOK_KEY,
    webhooksEnabled: true,
  });

  const app = express();
  app.use(
    '/api/v1/webhooks/xero',
    express.raw({ type: 'application/json', limit: '1mb' }),
    (req, _res, next) => {
      const buf = req.body;
      (req as { rawBody?: string }).rawBody = Buffer.isBuffer(buf) ? buf.toString('utf8') : '';
      next();
    },
    createXeroWebhookRouter({ xeroRealtimeIntersyncService: service }),
  );

  return { app, webhookEvents, refreshJobs };
}

async function post(app: express.Express, body: string, signature?: string) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (signature) headers['x-xero-signature'] = signature;
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/webhooks/xero`, {
      method: 'POST',
      headers,
      body,
    });
    const payload = (await response.json()) as Record<string, unknown>;
    return { status: response.status, payload };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('Xero webhook HTTP route', () => {
  it('returns 401 for missing signature without 500 from JSON parser', async () => {
    const { app } = buildApp();
    const result = await post(app, 'not-json{{{');
    assert.equal(result.status, 401);
  });

  it('returns 400 for valid signature with malformed JSON', async () => {
    const { app, webhookEvents, refreshJobs } = buildApp();
    const rawBody = 'not-json{{{';
    const result = await post(app, rawBody, sign(rawBody));
    assert.equal(result.status, 400);
    assert.equal(webhookEvents.length, 0);
    assert.equal(refreshJobs.length, 0);
  });

  it('returns 200 for empty validation envelope', async () => {
    const { app } = buildApp();
    const rawBody = JSON.stringify({ events: [] });
    const result = await post(app, rawBody, sign(rawBody));
    assert.equal(result.status, 200);
  });
});
