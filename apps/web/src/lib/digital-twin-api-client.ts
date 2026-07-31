import type {
  CreateDigitalTwinActionRequest,
  CreateDigitalTwinScenarioRequest,
  DigitalTwinHeatMapSummary,
  DigitalTwinRecommendationSummary,
  DigitalTwinReplayEventSummary,
  DigitalTwinScenarioComparisonSummary,
  DigitalTwinScenarioSummary,
  DigitalTwinSimulationSummary,
  EnterpriseDigitalTwinDashboard,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as DigitalTwinApiClientError };

export async function fetchDigitalTwinDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseDigitalTwinDashboard }>(
    '/digital-twin/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function fetchDigitalTwinScenarios(accessToken: string) {
  const data = await request<{ scenarios: DigitalTwinScenarioSummary[] }>(
    '/digital-twin/scenarios',
    {
      accessToken,
    },
  );
  return data.scenarios;
}

export async function createDigitalTwinScenario(
  accessToken: string,
  body: CreateDigitalTwinScenarioRequest,
) {
  const data = await request<{ scenario: DigitalTwinScenarioSummary }>('/digital-twin/scenarios', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.scenario;
}

export async function fetchDigitalTwinSimulations(accessToken: string) {
  const data = await request<{ simulations: DigitalTwinSimulationSummary[] }>(
    '/digital-twin/simulations',
    {
      accessToken,
    },
  );
  return data.simulations;
}

export async function runDigitalTwinSimulation(accessToken: string, scenarioId: string) {
  const data = await request<{ simulation: DigitalTwinSimulationSummary }>(
    '/digital-twin/simulations/run',
    {
      accessToken,
      method: 'POST',
      body: { scenarioId },
    },
  );
  return data.simulation;
}

export async function fetchDigitalTwinComparisons(accessToken: string) {
  const data = await request<{ comparisons: DigitalTwinScenarioComparisonSummary[] }>(
    '/digital-twin/comparisons',
    { accessToken },
  );
  return data.comparisons;
}

export async function fetchDigitalTwinHeatMaps(accessToken: string) {
  const data = await request<{ heatMaps: DigitalTwinHeatMapSummary[] }>('/digital-twin/heat-maps', {
    accessToken,
  });
  return data.heatMaps;
}

export async function captureDigitalTwinHeatMaps(accessToken: string) {
  const data = await request<{ heatMaps: DigitalTwinHeatMapSummary[] }>(
    '/digital-twin/heat-maps/capture',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.heatMaps;
}

export async function fetchDigitalTwinReplayEvents(accessToken: string) {
  const data = await request<{ events: DigitalTwinReplayEventSummary[] }>(
    '/digital-twin/replay-events',
    {
      accessToken,
    },
  );
  return data.events;
}

export async function generateDigitalTwinRecommendations(accessToken: string) {
  const data = await request<{ recommendations: DigitalTwinRecommendationSummary[] }>(
    '/digital-twin/recommendations/generate',
    { accessToken, method: 'POST' },
  );
  return data.recommendations;
}

export async function createDigitalTwinAction(
  accessToken: string,
  body: CreateDigitalTwinActionRequest,
) {
  const data = await request<{ action: { id: string } }>('/digital-twin/actions', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.action;
}

export async function captureDigitalTwinSnapshot(accessToken: string, label?: string) {
  const data = await request<{ snapshot: { id: string } }>('/digital-twin/snapshots', {
    accessToken,
    method: 'POST',
    body: { label },
  });
  return data.snapshot;
}
