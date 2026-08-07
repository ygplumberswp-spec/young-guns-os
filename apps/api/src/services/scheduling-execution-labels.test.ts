import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatSchedulingCrewLabel,
  formatSchedulingVehicleLabel,
} from './scheduling-execution-labels.js';

test('formatSchedulingCrewLabel joins up to two names and truncates the rest', () => {
  assert.equal(formatSchedulingCrewLabel([]), null);
  assert.equal(formatSchedulingCrewLabel(['Alex Smith']), 'Alex Smith');
  assert.equal(formatSchedulingCrewLabel(['Alex Smith', 'Jamie Lee']), 'Alex Smith, Jamie Lee');
  assert.equal(
    formatSchedulingCrewLabel(['Alex Smith', 'Jamie Lee', 'Chris Jones']),
    'Alex Smith, Jamie Lee +1',
  );
});

test('formatSchedulingVehicleLabel prefers name and plate', () => {
  assert.equal(formatSchedulingVehicleLabel('Van 1', 'CA 123'), 'Van 1 (CA 123)');
  assert.equal(formatSchedulingVehicleLabel('Van 1', ''), 'Van 1');
});
