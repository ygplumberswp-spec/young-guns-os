import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldExpandAuraMemoryOnEnter,
  shouldSaveAuraMemoryOnEnter,
} from './aura-quick-memory.js';

test('Enter saves without shift', () => {
  assert.equal(shouldSaveAuraMemoryOnEnter({ key: 'Enter', shiftKey: false }), true);
  assert.equal(shouldSaveAuraMemoryOnEnter({ key: 'Enter', shiftKey: true }), false);
});

test('Shift+Enter expands instead of saving', () => {
  assert.equal(shouldExpandAuraMemoryOnEnter({ key: 'Enter', shiftKey: true }), true);
  assert.equal(shouldExpandAuraMemoryOnEnter({ key: 'Enter', shiftKey: false }), false);
});
