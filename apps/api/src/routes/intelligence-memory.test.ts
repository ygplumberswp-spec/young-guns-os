import test from 'node:test';
import assert from 'node:assert/strict';
import { canWriteCompanyMemory } from '@titan/auth';
import { findDuplicateAuraMemory } from '@titan/shared';
import { MemoryError } from '../services/memory.service.js';

test('canWriteCompanyMemory blocks managers from permanent memory writes', () => {
  assert.equal(
    canWriteCompanyMemory({ roleName: 'Manager', permissions: ['intelligence:write'] }),
    false,
  );
});

test('duplicate memory detection rejects normalized duplicates before save', () => {
  const duplicate = findDuplicateAuraMemory(
    [{ id: 'mem-1', information: 'Always confirm purchase orders' }],
    'always confirm purchase orders.',
  );

  assert.ok(duplicate);
  assert.equal(duplicate.id, 'mem-1');
});

test('MemoryError exposes stable codes for route mapping', () => {
  const duplicate = new MemoryError('DUPLICATE', 'duplicate');
  const forbidden = new MemoryError('FORBIDDEN', 'forbidden');

  assert.equal(duplicate.code, 'DUPLICATE');
  assert.equal(forbidden.code, 'FORBIDDEN');
});
