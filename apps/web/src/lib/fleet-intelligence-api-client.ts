import type {
  CreateFleetActionRequest,
  CreateFleetOperatingCostRequest,
  FleetActionSummary,
  FleetCostAnalytics,
  FleetDriverBehaviourSummary,
  FleetExecutiveDashboard,
  FleetMonthlyReportSummary,
  FleetOperatingCostSummary,
  FleetPerformanceAnalytics,
  FleetRecommendationSummary,
  FleetTripSummary,
  FleetVehicleUtilizationSummary,
  GenerateFleetMonthlyReportRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as FleetIntelligenceApiClientError };

export async function fetchFleetDashboard(accessToken: string) {
  const data = await request<{ dashboard: FleetExecutiveDashboard }>(
    '/fleet-intelligence/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function fetchTripHistory(accessToken: string, vehicleId?: string) {
  const query = vehicleId ? `?vehicleId=${encodeURIComponent(vehicleId)}` : '';
  const data = await request<{ trips: FleetTripSummary[] }>(`/fleet-intelligence/trips${query}`, {
    accessToken,
  });
  return data.trips;
}

export async function fetchMonthlyReports(accessToken: string) {
  const data = await request<{ reports: FleetMonthlyReportSummary[] }>(
    '/fleet-intelligence/monthly-reports',
    {
      accessToken,
    },
  );
  return data.reports;
}

export async function generateMonthlyReport(
  accessToken: string,
  body: GenerateFleetMonthlyReportRequest,
) {
  const data = await request<{ report: FleetMonthlyReportSummary }>(
    '/fleet-intelligence/monthly-reports/generate',
    {
      accessToken,
      method: 'POST',
      body,
    },
  );
  return data.report;
}

export async function fetchDriverBehaviour(accessToken: string) {
  const data = await request<{ events: FleetDriverBehaviourSummary[] }>(
    '/fleet-intelligence/behaviour',
    {
      accessToken,
    },
  );
  return data.events;
}

export async function analyzeDriverBehaviour(accessToken: string) {
  const data = await request<{ events: FleetDriverBehaviourSummary[] }>(
    '/fleet-intelligence/behaviour/analyze',
    {
      accessToken,
      method: 'POST',
      body: {},
    },
  );
  return data.events;
}

export async function fetchVehicleUtilization(accessToken: string) {
  const data = await request<{ utilization: FleetVehicleUtilizationSummary[] }>(
    '/fleet-intelligence/utilization',
    {
      accessToken,
    },
  );
  return data.utilization;
}

export async function fetchFleetCosts(accessToken: string) {
  const data = await request<{ costs: FleetOperatingCostSummary[]; analytics: FleetCostAnalytics }>(
    '/fleet-intelligence/costs',
    { accessToken },
  );
  return data;
}

export async function createOperatingCost(
  accessToken: string,
  body: CreateFleetOperatingCostRequest,
) {
  const data = await request<{ cost: FleetOperatingCostSummary }>('/fleet-intelligence/costs', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.cost;
}

export async function fetchFleetPerformance(accessToken: string) {
  const data = await request<{ performance: FleetPerformanceAnalytics }>(
    '/fleet-intelligence/performance',
    {
      accessToken,
    },
  );
  return data.performance;
}

export async function fetchFleetRecommendations(accessToken: string) {
  const data = await request<{ recommendations: FleetRecommendationSummary[] }>(
    '/fleet-intelligence/recommendations',
    {
      accessToken,
    },
  );
  return data.recommendations;
}

export async function generateFleetRecommendations(accessToken: string) {
  const data = await request<{ recommendations: FleetRecommendationSummary[] }>(
    '/fleet-intelligence/recommendations/generate',
    { accessToken, method: 'POST', body: {} },
  );
  return data.recommendations;
}

export async function fetchFleetActions(accessToken: string) {
  const data = await request<{ actions: FleetActionSummary[] }>('/fleet-intelligence/actions', {
    accessToken,
  });
  return data.actions;
}

export async function createFleetAction(accessToken: string, body: CreateFleetActionRequest) {
  const data = await request<{ action: FleetActionSummary }>('/fleet-intelligence/actions', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.action;
}
