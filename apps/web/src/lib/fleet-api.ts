import type {
  CreateVehicleRequest,
  FleetOwnerDriversResponse,
  FleetOwnerEventsResponse,
  FleetLiveMapSnapshot,
  FleetStats,
  FleetOwnerTripsResponse,
  JobAssignee,
  UpdateVehicleRequest,
  VehicleDetail,
  VehicleSummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchFleetLiveMap(accessToken: string): Promise<FleetLiveMapSnapshot> {
  return request<FleetLiveMapSnapshot>('/fleet/live-map', { accessToken });
}

export async function fetchFleetTrips(
  accessToken: string,
  params?: { from?: string; to?: string },
): Promise<FleetOwnerTripsResponse> {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return request<FleetOwnerTripsResponse>(`/fleet/trips${suffix}`, { accessToken });
}

export async function fetchFleetDrivers(accessToken: string): Promise<FleetOwnerDriversResponse> {
  return request<FleetOwnerDriversResponse>('/fleet/drivers', { accessToken });
}

export async function fetchFleetEvents(accessToken: string): Promise<FleetOwnerEventsResponse> {
  return request<FleetOwnerEventsResponse>('/fleet/events', { accessToken });
}

export async function fetchFleetStats(accessToken: string): Promise<FleetStats> {
  return request<FleetStats>('/fleet/stats', { accessToken });
}

export async function fetchFleetAssignees(accessToken: string): Promise<JobAssignee[]> {
  const data = await request<{ assignees: JobAssignee[] }>('/fleet/assignees', { accessToken });
  return data.assignees;
}

export async function fetchVehicles(accessToken: string): Promise<VehicleSummary[]> {
  const data = await request<{ vehicles: VehicleSummary[] }>('/fleet/vehicles', { accessToken });
  return data.vehicles;
}

export async function fetchVehicle(accessToken: string, vehicleId: string): Promise<VehicleDetail> {
  const data = await request<{ vehicle: VehicleDetail }>(`/fleet/vehicles/${vehicleId}`, {
    accessToken,
  });
  return data.vehicle;
}

export async function createVehicle(
  accessToken: string,
  body: CreateVehicleRequest,
): Promise<VehicleDetail> {
  const data = await request<{ vehicle: VehicleDetail }>('/fleet/vehicles', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.vehicle;
}

export async function updateVehicle(
  accessToken: string,
  vehicleId: string,
  body: UpdateVehicleRequest,
): Promise<VehicleDetail> {
  const data = await request<{ vehicle: VehicleDetail }>(`/fleet/vehicles/${vehicleId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.vehicle;
}
