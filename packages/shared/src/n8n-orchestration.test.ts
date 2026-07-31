import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMinimumN8nPayload,
  buildN8nSignaturePayload,
  deriveN8nCapabilityState,
  isAllowedN8nBaseUrl,
  nextN8nRetryAt,
  sanitizeN8nErrorMessage,
} from './n8n-orchestration.js';

describe('n8n-orchestration (UX-J)', () => {
  it('allows only loopback base URLs', () => {
    assert.equal(isAllowedN8nBaseUrl('http://127.0.0.1:5678'), true);
    assert.equal(isAllowedN8nBaseUrl('http://localhost:5678/webhook'), true);
    assert.equal(isAllowedN8nBaseUrl('https://n8n.example.com'), false);
    assert.equal(isAllowedN8nBaseUrl('https://cloud.n8n.io'), false);
  });

  it('never claims connected without verified status', () => {
    assert.equal(
      deriveN8nCapabilityState({ status: 'configured_unverified', hasCredentials: true }),
      'configured_unverified',
    );
    assert.equal(
      deriveN8nCapabilityState({ status: 'not_configured', hasCredentials: false }),
      'not_configured',
    );
    assert.equal(
      deriveN8nCapabilityState({ status: 'connected_usable', hasCredentials: true }),
      'connected_usable',
    );
  });

  it('strips secrets from outbound payloads', () => {
    const body = buildMinimumN8nPayload({
      companyId: 'c1',
      correlationId: 'corr-1',
      externalWorkflowKey: 'wf-1',
      triggerEvent: 'job.completed',
      workflowVersion: 1,
      payload: {
        jobId: 'j1',
        apiKey: 'secret',
        password: 'x',
        summary: 'ok',
      },
    });
    assert.equal((body.payload as Record<string, unknown>).jobId, 'j1');
    assert.equal((body.payload as Record<string, unknown>).apiKey, undefined);
    assert.equal((body.payload as Record<string, unknown>).password, undefined);
  });

  it('builds stable signature payload shape', () => {
    assert.equal(buildN8nSignaturePayload('t', 'c', '{}'), 't.c.{}');
  });

  it('sanitizes credential-like error text', () => {
    const cleaned = sanitizeN8nErrorMessage('failed api_key=abc123 token: xyz');
    assert.match(cleaned ?? '', /REDACTED/);
    assert.doesNotMatch(cleaned ?? '', /abc123/);
  });

  it('computes retry backoff', () => {
    const first = nextN8nRetryAt(0, 1_000_000);
    assert.ok(first);
    assert.equal(first!.getTime(), 1_000_000 + 2_000);
  });
});
