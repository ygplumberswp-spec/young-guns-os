import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OWNER_ONLY_ROUTE_PREFIXES } from './role-experience.js';

describe('technician route protection', () => {
  it('blocks technicians from operational owner modules', () => {
    for (const prefix of ['/jobs', '/communications', '/documents', '/dispatch']) {
      assert.equal(
        OWNER_ONLY_ROUTE_PREFIXES.some((blocked) => prefix.startsWith(blocked) || blocked === prefix),
        true,
        `expected ${prefix} to be blocked`,
      );
    }
  });
});
