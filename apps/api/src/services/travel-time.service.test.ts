import assert from 'node:assert/strict';
import test from 'node:test';
import { TravelTimeService } from './travel-time.service.js';

test('TravelTimeService prefers vehicleOrigin when Maps estimates a route', async () => {
  const service = new TravelTimeService(
    {
      query: {
        integrationConnections: {
          findFirst: async () => ({ id: 'ct-1' }),
        },
        jobs: {
          findFirst: async () => null,
        },
      },
    } as never,
    {
      isConnected: async () => true,
      estimateRoute: async () => ({
        distanceMeters: 12000,
        distanceText: '12 km',
        durationSeconds: 18 * 60,
        durationInTrafficSeconds: 22 * 60,
      }),
    } as never,
  );

  const result = await service.estimateTravelMinutes({
    companyId: 'company-1',
    vehicleOrigin: { latitude: -33.92, longitude: 18.42 },
    destination: { latitude: -33.93, longitude: 18.45 },
    defaultMinutes: 30,
  });

  assert.equal(result.source, 'google_maps');
  assert.equal(result.vehicleOriginUsed, true);
  assert.equal(result.minutes, 22);
  assert.equal(result.cartrackConnected, true);
  assert.equal(result.googleMapsConnected, true);
  assert.equal(result.warning, null);
});

test('TravelTimeService stays honest when GPS exists but Maps is disconnected', async () => {
  const service = new TravelTimeService(
    {
      query: {
        integrationConnections: {
          findFirst: async () => ({ id: 'ct-1' }),
        },
        jobs: {
          findFirst: async () => null,
        },
      },
    } as never,
    {
      isConnected: async () => false,
      estimateRoute: async () => null,
    } as never,
  );

  const result = await service.estimateTravelMinutes({
    companyId: 'company-1',
    vehicleOrigin: { latitude: -33.92, longitude: 18.42 },
    destination: { latitude: -33.93, longitude: 18.45 },
    defaultMinutes: 30,
  });

  assert.equal(result.source, 'default');
  assert.equal(result.minutes, 30);
  assert.equal(result.vehicleOriginUsed, true);
  assert.match(result.warning ?? '', /not invent|default travel|not connected/i);
});
