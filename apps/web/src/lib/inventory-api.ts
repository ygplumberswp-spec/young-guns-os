import type {
  CreateInventoryItemRequest,
  CreateInventoryLocationRequest,
  InventoryItemSummary,
  InventoryLocationSummary,
  InventoryStats,
  InventoryStockLevelSummary,
  InventoryStockMovementSummary,
  InventoryWorkspaceRow,
  SetInventoryStockRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchInventoryStats(accessToken: string): Promise<InventoryStats> {
  return request<InventoryStats>('/inventory/stats', { accessToken });
}

export async function fetchInventoryLocations(
  accessToken: string,
): Promise<InventoryLocationSummary[]> {
  const data = await request<{ locations: InventoryLocationSummary[] }>('/inventory/locations', {
    accessToken,
  });
  return data.locations;
}

export async function createInventoryLocation(
  accessToken: string,
  body: CreateInventoryLocationRequest,
): Promise<InventoryLocationSummary> {
  const data = await request<{ location: InventoryLocationSummary }>('/inventory/locations', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.location;
}

export async function fetchInventoryItems(accessToken: string): Promise<InventoryItemSummary[]> {
  const data = await request<{ items: InventoryItemSummary[] }>('/inventory/items', {
    accessToken,
  });
  return data.items;
}

export async function createInventoryItem(
  accessToken: string,
  body: CreateInventoryItemRequest,
): Promise<InventoryItemSummary> {
  const data = await request<{ item: InventoryItemSummary }>('/inventory/items', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.item;
}

export async function fetchInventoryStock(
  accessToken: string,
): Promise<InventoryStockLevelSummary[]> {
  const data = await request<{ stockLevels: InventoryStockLevelSummary[] }>('/inventory/stock', {
    accessToken,
  });
  return data.stockLevels;
}

export async function fetchInventoryStockMovements(
  accessToken: string,
  filters: { itemId?: string; locationId?: string; jobId?: string } = {},
): Promise<InventoryStockMovementSummary[]> {
  const params = new URLSearchParams();
  if (filters.itemId) params.set('itemId', filters.itemId);
  if (filters.locationId) params.set('locationId', filters.locationId);
  if (filters.jobId) params.set('jobId', filters.jobId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ movements: InventoryStockMovementSummary[] }>(
    `/inventory/movements${query}`,
    { accessToken },
  );
  return data.movements;
}

export async function fetchInventoryWorkspace(
  accessToken: string,
): Promise<InventoryWorkspaceRow[]> {
  const data = await request<{ rows: InventoryWorkspaceRow[] }>('/inventory/workspace', {
    accessToken,
  });
  return data.rows;
}

export async function setInventoryStock(
  accessToken: string,
  body: SetInventoryStockRequest,
): Promise<InventoryStockLevelSummary> {
  const data = await request<{ stockLevel: InventoryStockLevelSummary }>('/inventory/stock', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.stockLevel;
}
