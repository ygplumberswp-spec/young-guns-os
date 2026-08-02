import type {
  CorporateDepartmentDetailResponse,
  CorporateDepartmentHubResponse,
  CorporateDepartmentId,
  DepartmentRoutineTaskAuditRecord,
  DepartmentRoutineTaskListResponse,
  DepartmentRoutineTaskRecord,
  DepartmentRoutineTaskStatus,
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

export async function fetchDepartmentRoutineTasks(
  accessToken: string,
  departmentId: CorporateDepartmentId,
): Promise<DepartmentRoutineTaskListResponse> {
  return request<DepartmentRoutineTaskListResponse>(
    `/corporate-departments/${departmentId}/tasks`,
    { accessToken },
  );
}

export async function fetchDepartmentTaskAudit(
  accessToken: string,
  taskId: string,
): Promise<DepartmentRoutineTaskAuditRecord[]> {
  return request<DepartmentRoutineTaskAuditRecord[]>(
    `/corporate-departments/tasks/${taskId}/audit`,
    { accessToken },
  );
}

export async function generateDepartmentRoutineTasks(
  accessToken: string,
): Promise<{ created: number; total: number }> {
  return request<{ created: number; total: number }>('/corporate-departments/tasks/generate', {
    accessToken,
    method: 'POST',
  });
}

export async function completeDepartmentTask(
  accessToken: string,
  taskId: string,
): Promise<DepartmentRoutineTaskRecord> {
  return request<DepartmentRoutineTaskRecord>(`/corporate-departments/tasks/${taskId}/complete`, {
    accessToken,
    method: 'POST',
  });
}

export async function skipDepartmentTask(
  accessToken: string,
  taskId: string,
  reason?: string,
): Promise<DepartmentRoutineTaskRecord> {
  return request<DepartmentRoutineTaskRecord>(`/corporate-departments/tasks/${taskId}/skip`, {
    accessToken,
    method: 'POST',
    body: reason ? { reason } : undefined,
  });
}

export async function approveDepartmentTask(
  accessToken: string,
  taskId: string,
): Promise<DepartmentRoutineTaskRecord> {
  return request<DepartmentRoutineTaskRecord>(`/corporate-departments/tasks/${taskId}/approve`, {
    accessToken,
    method: 'POST',
  });
}

export async function handoffDepartmentTask(
  accessToken: string,
  taskId: string,
  note?: string,
): Promise<DepartmentRoutineTaskRecord> {
  return request<DepartmentRoutineTaskRecord>(`/corporate-departments/tasks/${taskId}/handoff`, {
    accessToken,
    method: 'POST',
    body: note ? { note } : undefined,
  });
}

export async function updateDepartmentTaskStatus(
  accessToken: string,
  taskId: string,
  status: DepartmentRoutineTaskStatus,
  note?: string,
): Promise<DepartmentRoutineTaskRecord> {
  return request<DepartmentRoutineTaskRecord>(`/corporate-departments/tasks/${taskId}/status`, {
    accessToken,
    method: 'PATCH',
    body: { status, note },
  });
}
