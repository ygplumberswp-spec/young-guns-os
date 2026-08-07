import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const routeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'enterprise-unified-communications.ts'),
  'utf8',
);

describe('enterprise unified communications API envelope', () => {
  it('wraps success responses in { data: ... }', () => {
    const successPatterns = [
      'res.json({ data: { dashboard } })',
      'res.json({ data: { context } })',
      'res.json({ data: { center } })',
      'res.json({ data: { timeline } })',
      'res.status(201).json({ data: { provider } })',
      'res.status(201).json({ data: { campaign } })',
      'res.status(201).json({ data: { notification } })',
      'res.json({ data: { snapshot } })',
      'res.json({ data: { config } })',
    ];

    for (const pattern of successPatterns) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('wraps errors in { error: { code, message } }', () => {
    assert.ok(routeSource.includes('res.status(status).json({ error: { code: error.code, message: error.message } })'));
    assert.ok(routeSource.includes("res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } })"));
  });
});
