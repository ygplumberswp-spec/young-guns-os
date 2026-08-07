import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OPS_SNAPSHOT_INLINE_DEADLINE_MS } from '@titan/shared';
import { OpsIntelligenceService } from './ops-intelligence.service.js';

/**
 * The Owner dashboard reported "Request timed out" on the Live Fleet Map because a
 * snapshot ran every read serially — including the morning brief twice — and waited on
 * Google routing per job. These tests pin the shape of the repair: one read per source,
 * concurrent reads, a stored snapshot on the second request, and an honest answer rather
 * than an open request when a first evaluation runs long.
 */

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';

type Recorder = {
  /** Reads issued, in order. */
  calls: string[];
  /** Highest number of reads in flight at the same time. */
  peakConcurrency: number;
};

function createStubDb(recorder: Recorder, delayMs: number) {
  let inFlight = 0;

  async function read<T>(label: string, value: T): Promise<T> {
    recorder.calls.push(label);
    inFlight += 1;
    recorder.peakConcurrency = Math.max(recorder.peakConcurrency, inFlight);
    try {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return value;
    } finally {
      inFlight -= 1;
    }
  }

  const countBuilder = (label: string) => ({
    from: () => ({
      where: () => read(label, [{ total: 0 }]),
    }),
  });

  return {
    read,
    db: {
      query: {
        companySchedulingSettings: {
          findFirst: () => read('scheduling_settings', undefined),
        },
        jobs: { findMany: () => read('jobs', []) },
        users: { findMany: () => read('users', []) },
        vehicles: { findMany: () => read('vehicles', []) },
        opsIntelligenceReminderStates: {
          findMany: () => read('reminder_states', []),
          findFirst: () => read('reminder_state', undefined),
        },
        companyDayPlanFollowUps: { findMany: () => read('day_plan_follow_ups', []) },
        companyDayPlans: { findMany: () => read('day_plans', []) },
      },
      select: () => countBuilder('count'),
      insert: () => ({ values: () => read('insert', [{}]) }),
      update: () => ({ set: () => ({ where: () => read('update', [{}]) }) }),
    },
  };
}

function createService(recorder: Recorder, delayMs: number) {
  const { db } = createStubDb(recorder, delayMs);
  const googleMapsService = {
    isConnected: async () => {
      recorder.calls.push('google_maps_connected');
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return false;
    },
  };
  const integrationsService = {
    buildFleetTrackingContext: async () => {
      recorder.calls.push('fleet_tracking_context');
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        cartrackConnected: false,
        connectionDisplayState: 'not_connected',
        lastError: null,
        latestPositions: [],
      };
    },
  };
  const notificationService = { createNotification: async () => undefined };

  return new OpsIntelligenceService(
    db as never,
    googleMapsService as never,
    integrationsService as never,
    notificationService as never,
  );
}

describe('Ops Intelligence snapshot cost and freshness', () => {
  it('builds the morning brief once per evaluation', async () => {
    const recorder: Recorder = { calls: [], peakConcurrency: 0 };
    const service = createService(recorder, 0);

    await service.getSnapshot(COMPANY_ID);

    // The brief's day-plan reads are unique to it; two of each meant it ran twice.
    assert.equal(recorder.calls.filter((call) => call === 'day_plans').length, 1);
    assert.equal(recorder.calls.filter((call) => call === 'day_plan_follow_ups').length, 1);
    assert.equal(recorder.calls.filter((call) => call === 'jobs').length, 2, 'schedule + brief');
  });

  it('reads independent sources concurrently instead of one round trip at a time', async () => {
    const recorder: Recorder = { calls: [], peakConcurrency: 0 };
    const service = createService(recorder, 5);

    await service.getSnapshot(COMPANY_ID);

    assert.ok(
      recorder.peakConcurrency >= 4,
      `expected concurrent reads, peak was ${recorder.peakConcurrency}`,
    );
  });

  it('serves the stored snapshot on the next read without touching any source again', async () => {
    const recorder: Recorder = { calls: [], peakConcurrency: 0 };
    const service = createService(recorder, 0);

    const first = await service.getSnapshot(COMPANY_ID);
    const callsAfterFirst = recorder.calls.length;
    const second = await service.getSnapshot(COMPANY_ID);

    assert.equal(recorder.calls.length, callsAfterFirst, 'second read must not hit the database');
    assert.equal(second.generatedAt, first.generatedAt);
    assert.equal(second.dataAvailable, true);
  });

  it('answers honestly instead of holding the request open when the first evaluation runs long', async () => {
    const recorder: Recorder = { calls: [], peakConcurrency: 0 };
    // Each read alone outlasts the inline deadline.
    const service = createService(recorder, OPS_SNAPSHOT_INLINE_DEADLINE_MS + 200);

    const started = Date.now();
    const snapshot = await service.getSnapshot(COMPANY_ID);
    const elapsed = Date.now() - started;

    assert.ok(
      elapsed < OPS_SNAPSHOT_INLINE_DEADLINE_MS + 150,
      `expected a bounded response, took ${elapsed} ms`,
    );
    assert.equal(snapshot.freshness, 'timed_out');
    assert.equal(snapshot.dataAvailable, false);
    assert.equal(snapshot.refreshing, true);
    assert.equal(snapshot.events.length, 0);
    assert.ok(snapshot.sources.every((source) => source.status === 'timed_out'));
  });

  it('reports every source and marks a freshly computed snapshot live', async () => {
    const recorder: Recorder = { calls: [], peakConcurrency: 0 };
    const service = createService(recorder, 0);

    const snapshot = await service.getSnapshot(COMPANY_ID);

    assert.equal(snapshot.freshness, 'live');
    assert.equal(snapshot.ageSeconds, 0);
    assert.deepEqual(
      snapshot.sources.map((source) => source.key).sort(),
      ['fleet_tracking', 'morning_brief', 'schedule', 'travel_routing'],
    );
    // Cartrack and Google Maps are absent in this fixture — that is reported, not failed.
    const fleet = snapshot.sources.find((source) => source.key === 'fleet_tracking');
    const routing = snapshot.sources.find((source) => source.key === 'travel_routing');
    assert.equal(fleet?.status, 'not_configured');
    assert.equal(routing?.status, 'not_configured');
  });
});
