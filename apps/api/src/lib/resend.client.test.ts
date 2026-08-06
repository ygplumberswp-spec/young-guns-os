import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResendClient, ResendError } from './resend.client.js';

describe('ResendClient', () => {
  it('verifies credentials via GET /domains', async () => {
    const calls: string[] = [];
    const client = new ResendClient({
      apiKey: 're_test_key',
      fetchImpl: async (input, init) => {
        calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
        return new Response(JSON.stringify({ data: [{ id: 'd1', name: 'example.com' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const result = await client.testConnection();
    assert.equal(result.connected, true);
    assert.equal(result.domainCount, 1);
    assert.equal(calls[0], 'GET https://api.resend.com/domains');
  });

  it('sends email via POST /emails and returns id', async () => {
    const client = new ResendClient({
      apiKey: 're_test_key',
      fetchImpl: async (input, init) => {
        assert.equal(String(input), 'https://api.resend.com/emails');
        assert.equal(init?.method, 'POST');
        const body = JSON.parse(String(init?.body));
        assert.equal(body.from, 'TITAN <ops@example.com>');
        assert.deepEqual(body.to, ['customer@example.com']);
        assert.equal(body.subject, 'Quote ready');
        return new Response(JSON.stringify({ id: 'email_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const result = await client.sendEmail({
      from: 'TITAN <ops@example.com>',
      to: 'customer@example.com',
      subject: 'Quote ready',
      html: '<p>Hello</p>',
      tags: [{ name: 'titan_purpose', value: 'customer_quote' }],
    });

    assert.equal(result.id, 'email_123');
  });

  it('maps 401 to AUTH_FAILED', async () => {
    const client = new ResendClient({
      apiKey: 're_bad',
      fetchImpl: async () =>
        new Response(JSON.stringify({ message: 'API key is invalid' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    await assert.rejects(
      () => client.testConnection(),
      (error: unknown) => {
        assert.ok(error instanceof ResendError);
        assert.equal(error.code, 'AUTH_FAILED');
        return true;
      },
    );
  });
});
