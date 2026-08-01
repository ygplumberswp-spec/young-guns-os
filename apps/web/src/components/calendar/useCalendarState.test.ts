import assert from 'node:assert/strict';
import test from 'node:test';
import { CALENDAR_STATE_KEY, type CalendarPersistedState } from './calendar-utils';

test('calendar state sessionStorage round-trip shape', () => {
  const state: CalendarPersistedState = {
    view: 'week',
    anchorDate: '2026-08-01T00:00:00.000Z',
    filters: { suburb: 'Sandton', priority: 'high' },
  };

  const serialized = JSON.stringify(state);
  const parsed = JSON.parse(serialized) as CalendarPersistedState;

  assert.equal(parsed.view, 'week');
  assert.equal(parsed.filters?.suburb, 'Sandton');
  assert.equal(CALENDAR_STATE_KEY.includes('/scheduling'), true);
});
