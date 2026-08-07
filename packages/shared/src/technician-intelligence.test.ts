import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TECHNICIAN_INTELLIGENCE_GUARANTEES,
  TECHNICIAN_LIFECYCLE_FLOW,
  averageOrNull,
  buildTechnicianAuraInsightDrafts,
  computeCompletionHoursFromEvents,
  computeProductivityScore,
  computeTravelMinutesFromEvents,
  emptyPerformanceMetrics,
  mapExecutionPhaseToLifecycle,
} from './technician-intelligence.js';

describe('technician-intelligence lifecycle mapping', () => {
  it('maps execution phases onto product lifecycle labels', () => {
    assert.equal(mapExecutionPhaseToLifecycle('assigned'), 'assigned');
    assert.equal(mapExecutionPhaseToLifecycle('accepted'), 'accepted');
    assert.equal(mapExecutionPhaseToLifecycle('en_route'), 'travelling');
    assert.equal(mapExecutionPhaseToLifecycle('on_site'), 'arrived');
    assert.equal(mapExecutionPhaseToLifecycle('in_progress'), 'started');
    assert.equal(mapExecutionPhaseToLifecycle('paused'), 'started');
    assert.equal(mapExecutionPhaseToLifecycle('ready_to_complete'), 'started');
    assert.equal(mapExecutionPhaseToLifecycle('completed'), 'completed');
    assert.equal(mapExecutionPhaseToLifecycle(null, 'completed'), 'completed');
  });

  it('keeps the six-step product flow stable', () => {
    assert.deepEqual([...TECHNICIAN_LIFECYCLE_FLOW], [
      'assigned',
      'accepted',
      'travelling',
      'arrived',
      'started',
      'completed',
    ]);
  });
});

describe('technician-intelligence travel and completion timing', () => {
  it('computes travel minutes from real en_route→on_site events only', () => {
    const minutes = computeTravelMinutesFromEvents([
      { toPhase: 'accepted', createdAt: '2026-08-01T08:00:00.000Z' },
      { toPhase: 'en_route', createdAt: '2026-08-01T09:00:00.000Z' },
      { toPhase: 'on_site', createdAt: '2026-08-01T09:35:00.000Z' },
    ]);
    assert.equal(minutes, 35);
  });

  it('returns null travel when endpoints are missing — never invents', () => {
    assert.equal(
      computeTravelMinutesFromEvents([{ toPhase: 'en_route', createdAt: '2026-08-01T09:00:00.000Z' }]),
      null,
    );
    assert.equal(computeTravelMinutesFromEvents([]), null);
  });

  it('computes completion hours from in_progress→completed', () => {
    const hours = computeCompletionHoursFromEvents([
      { toPhase: 'in_progress', createdAt: '2026-08-01T10:00:00.000Z' },
      { toPhase: 'completed', createdAt: '2026-08-01T12:30:00.000Z' },
    ]);
    assert.equal(hours, 2.5);
  });
});

describe('technician-intelligence productivity and insights', () => {
  it('scores productivity from completion rate with callback penalty', () => {
    assert.equal(
      computeProductivityScore({ jobsAssigned: 10, jobsCompleted: 8, callbacks: 1 }),
      75,
    );
    assert.equal(computeProductivityScore({ jobsAssigned: 0, jobsCompleted: 0, callbacks: 0 }), null);
  });

  it('builds draft insights only from real elevated signals', () => {
    const a = emptyPerformanceMetrics('a', 'Alex');
    a.averageTravelMinutes = {
      value: 60,
      unit: 'minutes',
      availability: 'available',
      honestyNote: null,
      sampleSize: 4,
    };
    a.jobsAssigned = { value: 10, unit: 'count', availability: 'available', honestyNote: null, sampleSize: 10 };
    a.jobsCompleted = { value: 9, unit: 'count', availability: 'available', honestyNote: null, sampleSize: 9 };

    const b = emptyPerformanceMetrics('b', 'Blake');
    b.averageTravelMinutes = {
      value: 20,
      unit: 'minutes',
      availability: 'available',
      honestyNote: null,
      sampleSize: 4,
    };
    b.jobsAssigned = { value: 10, unit: 'count', availability: 'available', honestyNote: null, sampleSize: 10 };
    b.jobsCompleted = { value: 9, unit: 'count', availability: 'available', honestyNote: null, sampleSize: 9 };
    b.callbacks = { value: 3, unit: 'count', availability: 'available', honestyNote: null, sampleSize: 3 };

    const drafts = buildTechnicianAuraInsightDrafts({ technicians: [a, b] });
    assert.ok(drafts.some((d) => d.insightType === 'delay' && d.technicianId === 'a'));
    assert.ok(drafts.some((d) => d.insightType === 'trend' && d.technicianId === 'b'));
    assert.equal(TECHNICIAN_INTELLIGENCE_GUARANTEES.autoOperationalChanges, false);
    assert.equal(TECHNICIAN_INTELLIGENCE_GUARANTEES.noDemoData, true);
  });

  it('averages honestly', () => {
    assert.equal(averageOrNull([10, 20, 30]), 20);
    assert.equal(averageOrNull([]), null);
  });
});
