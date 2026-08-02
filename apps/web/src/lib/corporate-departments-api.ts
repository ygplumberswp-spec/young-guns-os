import type {
  CorporateDepartmentDetailResponse,
  CorporateDepartmentHubResponse,
  CorporateDepartmentId,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchCorporateDepartmentHub(
  accessToken: string,
): Promise<CorporateDepartmentHubResponse> {
  return request<CorporateDepartmentHubResponse>('/corporate-departments/hub', { accessToken });
}

export async function fetchCorporateDepartmentDetail(
  accessToken: string,
  departmentId: CorporateDepartmentId,
): Promise<CorporateDepartmentDetailResponse> {
  return request<CorporateDepartmentDetailResponse>(`/corporate-departments/${departmentId}`, {
    accessToken,
  });
}
