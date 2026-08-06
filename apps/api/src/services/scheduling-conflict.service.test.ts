import assert from 'node:assert/strict';
import test from 'node:test';
import {
  intervalsOverlap,
  isOutsideBusinessHours,
  resolveEffectiveEnd,
} from './scheduling-conflict.service.js';

test('resolveEffectiveEnd adds duration travel and buffer', () => {
  const start = new Date('2026-08-01T08:00:00.000Z');
  const end = new Date('2026-08-01T09:00:00.000Z');
  const effective = resolveEffectiveEnd(start, end, 30, 15);
  assert.equal(effective.toISOString(), '2026-08-01T09:45:00.000Z');
});

test('intervalsOverlap detects overlapping ranges', () => {
  const aStart = new Date('2026-08-01T08:00:00.000Z');
  const aEnd = new Date('2026-08-01T10:00:00.000Z');
  const bStart = new Date('2026-08-01T09:00:00.000Z');
  const bEnd = new Date('2026-08-01T11:00:00.000Z');
  assert.equal(intervalsOverlap(aStart, aEnd, bStart, bEnd), true);
  assert.equal(
    intervalsOverlap(aStart, aEnd, new Date('2026-08-01T10:00:00.000Z'), bEnd),
    false,
  );
});

test('isOutsideBusinessHours flags early and late slots', () => {
  const start = new Date(2026, 7, 1, 6, 30);
  const end = new Date(2026, 7, 1, 7, 30);
  assert.equal(isOutsideBusinessHours(start, end, 7, 18), true);

  const okStart = new Date(2026, 7, 1, 8, 0);
  const okEnd = new Date(2026, 7, 1, 9, 0);
  assert.equal(isOutsideBusinessHours(okStart, okEnd, 7, 18), false);
});
