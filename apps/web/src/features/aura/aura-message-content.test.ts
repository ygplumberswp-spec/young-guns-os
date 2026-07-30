import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSchema } from 'rehype-sanitize';

test('markdown sanitizer schema blocks script tags', () => {
  assert.equal(defaultSchema.tagNames?.includes('script'), false);
});

test('markdown sanitizer schema allows safe formatting tags', () => {
  for (const tag of ['p', 'strong', 'em', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'code', 'pre', 'a']) {
    assert.ok(defaultSchema.tagNames?.includes(tag), `expected ${tag} to be allowed`);
  }
});
