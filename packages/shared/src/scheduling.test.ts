import assert from 'node:assert/strict';
import test from 'node:test';
import { mapCalendarJobDisplayStatus } from './scheduling.js';

test('mapCalendarJobDisplayStatus maps execution phases and delays', () => {
  assert.equal(
    mapCalendarJobDisplayStatus({
      status: 'scheduled',
      assignedUserId: null,
      executionPhase: 'assigned',
      scheduledAt: '2026-08-01T08:00:00.000Z',
    }),
    'Unassigned',
  );

  assert.equal(
    mapCalendarJobDisplayStatus({
      status: 'scheduled',
      assignedUserId: 'tech-1',
      executionPhase: 'en_route',
      scheduledAt: '2026-08-01T08:00:00.000Z',
    }),
    'Travelling',
  );

  assert.equal(
    mapCalendarJobDisplayStatus({
      status: 'cancelled',
      assignedUserId: 'tech-1',
      executionPhase: 'assigned',
      scheduledAt: '2026-08-01T08:00:00.000Z',
    }),
    'Cancelled',
  );
});
