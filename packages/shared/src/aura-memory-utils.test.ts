import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findDuplicateAuraMemory,
  isDuplicateAuraMemory,
  normalizeAuraMemoryText,
} from './aura-memory-utils.js';

test('normalizeAuraMemoryText trims, lowercases, and collapses whitespace', () => {
  assert.equal(normalizeAuraMemoryText('  Always   confirm   POs.  '), 'always confirm pos');
});

test('isDuplicateAuraMemory matches normalized variants', () => {
  assert.equal(
    isDuplicateAuraMemory({ information: 'Always confirm POs' }, 'always confirm pos.'),
    true,
  );
  assert.equal(
    isDuplicateAuraMemory({ information: 'Always confirm POs' }, 'Require deposit on new jobs'),
    false,
  );
});

test('findDuplicateAuraMemory returns first normalized match', () => {
  const duplicate = findDuplicateAuraMemory(
    [
      { id: '1', information: 'Call before dispatch' },
      { id: '2', information: 'Always confirm POs' },
    ],
    'ALWAYS   confirm pos',
  );

  assert.equal(duplicate?.id, '2');
});
