import type {
  AssetEquipmentSummary,
  AssetExecutiveDashboard,
  AssetInspectionSummary,
  AssetMaintenanceActionSummary,
  AssetMaintenanceRecordSummary,
  AssetMaintenanceScheduleSummary,
  CreateAssetEquipmentRequest,
  CreateAssetMaintenanceActionRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as AssetEquipmentApiClientError };

export async function fetchAssetEquipmentDashboard(accessToken: string) {
  const data = await request<{ dashboard: AssetExecutiveDashboard }>('/asset-equipment/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchAssetRegister(accessToken: string) {
  const data = await request<{ assets: AssetEquipmentSummary[] }>('/asset-equipment/assets', { accessToken });
  return data.assets;
}

export async function fetchAssetMaintenanceRecords(accessToken: string) {
  const data = await request<{ records: AssetMaintenanceRecordSummary[] }>('/asset-equipment/maintenance', {
    accessToken,
  });
  return data.records;
}

export async function fetchAssetMaintenanceSchedules(accessToken: string) {
  const data = await request<{ schedules: AssetMaintenanceScheduleSummary[] }>('/asset-equipment/schedules', {
    accessToken,
  });
  return data.schedules;
}

export async function fetchAssetInspections(accessToken: string) {
  const data = await request<{ inspections: AssetInspectionSummary[] }>('/asset-equipment/inspections', {
    accessToken,
  });
  return data.inspections;
}

export async function fetchAssetActions(accessToken: string) {
  const data = await request<{ actions: AssetMaintenanceActionSummary[] }>('/asset-equipment/actions', {
    accessToken,
  });
  return data.actions;
}

export async function createAssetEquipment(accessToken: string, body: CreateAssetEquipmentRequest) {
  const data = await request<{ asset: AssetEquipmentSummary }>('/asset-equipment/assets', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.asset;
}

export async function createAssetAction(accessToken: string, body: CreateAssetMaintenanceActionRequest) {
  const data = await request<{ action: AssetMaintenanceActionSummary }>('/asset-equipment/actions', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.action;
}
