import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signN8nPayload, verifyN8nSignature } from './n8n-signing.js';

describe('n8n-signing (UX-J)', () => {
  it('verifies signatures and rejects stale/invalid', () => {
    const secret = 'test-secret';
    const timestamp = new Date().toISOString();
    const correlationId = 'corr-abc';
    const body = '{"ok":true}';
    const signature = signN8nPayload(secret, timestamp, correlationId, body);
    assert.equal(
      verifyN8nSignature({ secret, timestamp, correlationId, body, signature }).ok,
      true,
    );
    assert.equal(
      verifyN8nSignature({
        secret,
        timestamp,
        correlationId,
        body,
        signature: 'deadbeef',
      }).ok,
      false,
    );
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const staleSig = signN8nPayload(secret, stale, correlationId, body);
    assert.equal(
      verifyN8nSignature({
        secret,
        timestamp: stale,
        correlationId,
        body,
        signature: staleSig,
      }).ok,
      false,
    );
  });
});
