import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideMapCameraAction,
  resolveContextKey,
  resolveFollowId,
} from './map-camera-policy.js';

describe('map camera policy — no auto-recenter on live marker updates', () => {
  it('recenters on initial load only', () => {
    assert.equal(
      decideMapCameraAction({
        didInitialCamera: false,
        previousContextKey: undefined,
        cameraContextKey: 'fleet-dispatch',
      }),
      'initial',
    );
  });

  it('does not recenter when markers would refresh under a stable context', () => {
    assert.equal(
      decideMapCameraAction({
        didInitialCamera: true,
        previousContextKey: 'fleet-dispatch',
        cameraContextKey: 'fleet-dispatch',
        followMarkerId: null,
        locateToken: 0,
        previousLocateToken: 0,
      }),
      'none',
    );
  });

  it('recenters when contextKey / cameraContextKey changes (e.g. selected job)', () => {
    assert.equal(
      decideMapCameraAction({
        didInitialCamera: true,
        previousContextKey: 'job-a',
        contextKey: 'job-b',
      }),
      'context_change',
    );
    assert.equal(
      decideMapCameraAction({
        didInitialCamera: true,
        previousContextKey: 'job-a',
        cameraContextKey: 'job-b',
      }),
      'context_change',
    );
  });

  it('auto-follows only when followVehicleId / followMarkerId is set', () => {
    assert.equal(
      decideMapCameraAction({
        didInitialCamera: true,
        previousContextKey: 'fleet',
        cameraContextKey: 'fleet',
        followVehicleId: 'vehicle-42',
      }),
      'follow_vehicle',
    );
    assert.equal(
      decideMapCameraAction({
        didInitialCamera: true,
        previousContextKey: 'fleet',
        cameraContextKey: 'fleet',
        followMarkerId: null,
      }),
      'none',
    );
  });

  it('honors locateToken increments without requiring follow mode', () => {
    assert.equal(
      decideMapCameraAction({
        didInitialCamera: true,
        previousContextKey: 'fleet',
        cameraContextKey: 'fleet',
        locateToken: 2,
        previousLocateToken: 1,
      }),
      'locate',
    );
  });

  it('resolves prop aliases consistently', () => {
    assert.equal(resolveContextKey({ contextKey: 'a', cameraContextKey: 'b' }), 'a');
    assert.equal(resolveContextKey({ cameraContextKey: 'b' }), 'b');
    assert.equal(resolveFollowId({ followVehicleId: 'v1', followMarkerId: 'm1' }), 'v1');
    assert.equal(resolveFollowId({ followMarkerId: 'm1' }), 'm1');
  });
});
