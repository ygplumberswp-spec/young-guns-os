import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CartrackError } from '../lib/cartrack.client.js';
import { PROVIDER_REQUEST_TIMEOUT_MS, providerTimeoutSignal } from '../lib/http-timeout.js';
import {
  buildCartrackProviderRefreshState,
  extractCartrackFailedEndpoint,
  formatCartrackProviderError,
  shouldStoreCartrackPosition,
} from './integrations.service.js';

describe('Cartrack timeout resilience', () => {
  it('keeps AbortController timeout at 20s — does not silently raise it', () => {
    assert.equal(PROVIDER_REQUEST_TIMEOUT_MS, 20_000);
    const signal = providerTimeoutSignal();
    assert.equal(signal.aborted, false);
  });

  it('records the failed endpoint on a timeout error (simulates >20s provider)', () => {
    const error = new CartrackError(
      'TIMEOUT',
      `Cartrack request timed out after ${PROVIDER_REQUEST_TIMEOUT_MS}ms`,
      '/vehicles/status',
    );
    assert.equal(error.code, 'TIMEOUT');
    assert.equal(error.endpoint, '/vehicles/status');
    assert.match(error.message, /20000ms/);
  });

  it('formats a provider error with the failed endpoint for honest UI state', () => {
    assert.equal(
      formatCartrackProviderError('Cartrack request timed out after 20000ms', '/vehicles/status'),
      'Cartrack request timed out after 20000ms [/vehicles/status]',
    );
    assert.equal(
      extractCartrackFailedEndpoint('Cartrack request timed out after 20000ms [/vehicles/status]'),
      '/vehicles/status',
    );
  });

  it('returns a degraded cached-snapshot refresh state when a timeout left stored positions', () => {
    const state = buildCartrackProviderRefreshState({
      lastSuccessfulAt: '2026-08-04T12:00:00.000Z',
      lastError: 'Cartrack request timed out after 20000ms [/vehicles/status]',
      positionCount: 2,
      nowMs: Date.parse('2026-08-04T12:05:00.000Z'),
    });

    assert.equal(state.status, 'degraded');
    assert.equal(state.showingCachedSnapshot, true);
    assert.equal(state.failedEndpoint, '/vehicles/status');
    assert.equal(state.dataAgeMs, 5 * 60_000);
    assert.match(state.timeoutMessage ?? '', /timed out/);
  });

  it('returns unavailable when Cartrack failed and no cached snapshot exists', () => {
    const state = buildCartrackProviderRefreshState({
      lastSuccessfulAt: null,
      lastError: 'Cartrack request timed out after 20000ms [/vehicles]',
      positionCount: 0,
      nowMs: Date.now(),
    });

    assert.equal(state.status, 'unavailable');
    assert.equal(state.showingCachedSnapshot, false);
    assert.equal(state.failedEndpoint, '/vehicles');
  });

  it('returns ok when Cartrack responds normally', () => {
    const state = buildCartrackProviderRefreshState({
      lastSuccessfulAt: '2026-08-04T12:00:00.000Z',
      lastError: null,
      positionCount: 2,
      nowMs: Date.parse('2026-08-04T12:01:00.000Z'),
    });

    assert.equal(state.status, 'ok');
    assert.equal(state.showingCachedSnapshot, false);
    assert.equal(state.failedEndpoint, null);
    assert.equal(state.timeoutMessage, null);
  });

  it('still rejects duplicate Cartrack position rows so timeouts do not invent movement', () => {
    const recordedAt = new Date('2026-08-04T12:00:00.000Z');
    assert.equal(
      shouldStoreCartrackPosition({
        incomingRecordedAt: recordedAt,
        latestStoredRecordedAt: recordedAt,
      }),
      false,
    );
  });
});

describe('Cartrack independent endpoint settlement', () => {
  it('keeps successful status data when /vehicles fails (Promise.allSettled)', async () => {
    const statuses = [
      {
        externalVehicleId: 'v-1',
        latitude: -26.1,
        longitude: 28.0,
      },
    ];

    const [vehiclesSettled, statusesSettled] = await Promise.allSettled([
      Promise.reject(new CartrackError('TIMEOUT', 'Cartrack request timed out after 20000ms', '/vehicles')),
      Promise.resolve(statuses),
    ]);

    assert.equal(vehiclesSettled.status, 'rejected');
    assert.equal(statusesSettled.status, 'fulfilled');
    if (statusesSettled.status === 'fulfilled') {
      assert.equal(statusesSettled.value.length, 1);
      assert.equal(statusesSettled.value[0]?.externalVehicleId, 'v-1');
    }

    const failed =
      vehiclesSettled.status === 'rejected' ? vehiclesSettled.reason : null;
    assert.ok(failed instanceof CartrackError);
    assert.equal(failed.endpoint, '/vehicles');
  });

  it('keeps successful vehicle list when /vehicles/status fails', async () => {
    const vehicles = [{ externalVehicleId: 'v-1', externalRegistration: 'ABC123' }];
    const [vehiclesSettled, statusesSettled] = await Promise.allSettled([
      Promise.resolve(vehicles),
      Promise.reject(
        new CartrackError('TIMEOUT', 'Cartrack request timed out after 20000ms', '/vehicles/status'),
      ),
    ]);

    assert.equal(vehiclesSettled.status, 'fulfilled');
    assert.equal(statusesSettled.status, 'rejected');
    if (vehiclesSettled.status === 'fulfilled') {
      assert.equal(vehiclesSettled.value.length, 1);
    }
  });
});

describe('Cartrack sync overlap prevention', () => {
  it('shares one in-flight promise across overlapping pollers', async () => {
    const inflight = new Map<string, Promise<{ id: number }>>();
    let executions = 0;

    async function syncCartrack(companyId: string): Promise<{ id: number }> {
      const existing = inflight.get(companyId);
      if (existing) return existing;

      const run = (async () => {
        executions += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { id: executions };
      })().finally(() => {
        inflight.delete(companyId);
      });

      inflight.set(companyId, run);
      return run;
    }

    const [a, b, c] = await Promise.all([
      syncCartrack('co-1'),
      syncCartrack('co-1'),
      syncCartrack('co-1'),
    ]);

    assert.equal(executions, 1);
    assert.equal(a.id, 1);
    assert.equal(b.id, 1);
    assert.equal(c.id, 1);

    const d = await syncCartrack('co-1');
    assert.equal(executions, 2);
    assert.equal(d.id, 2);
  });
});
