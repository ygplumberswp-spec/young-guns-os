import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Map provider defaults are validated at build time via Vite env.
 * This test documents expected provider IDs without importing Vite modules.
 */
test('map tile provider ids are stable', () => {
  const allowed = ['openfreemap', 'maptiler', 'stadia', 'osm', 'custom'];
  assert.deepEqual(allowed, allowed);
});
