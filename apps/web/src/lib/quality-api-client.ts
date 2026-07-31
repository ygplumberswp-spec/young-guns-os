import type {
  CreateQualityActionRequest,
  CreateQualityComebackRequest,
  CreateQualityCostEntryRequest,
  CreateQualityRootCauseRequest,
  CreateQualitySupplierDefectRequest,
  CreateQualityWarrantyClaimRequest,
  QualityActionSummary,
  QualityComebackSummary,
  QualityCostEntrySummary,
  QualityExecutiveDashboard,
  QualityRootCauseAnalysisSummary,
  QualitySupplierIntelligence,
  QualityTechnicianIntelligence,
  QualityWarrantyClaimSummary,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as QualityApiClientError };

export async function fetchQualityDashboard(accessToken: string) {
  const data = await request<{ dashboard: QualityExecutiveDashboard }>('/quality/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchQualityComebacks(accessToken: string) {
  const data = await request<{ comebacks: QualityComebackSummary[] }>('/quality/comebacks', {
    accessToken,
  });
  return data.comebacks;
}

export async function fetchQualityComeback(accessToken: string, id: string) {
  const data = await request<{ comeback: QualityComebackSummary }>(`/quality/comebacks/${id}`, {
    accessToken,
  });
  return data.comeback;
}

export async function createQualityComeback(
  accessToken: string,
  body: CreateQualityComebackRequest,
) {
  const data = await request<{ comeback: QualityComebackSummary }>('/quality/comebacks', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.comeback;
}

export async function fetchQualityRootCause(accessToken: string, comebackId: string) {
  const data = await request<{ analysis: QualityRootCauseAnalysisSummary | null }>(
    `/quality/comebacks/${comebackId}/root-cause`,
    { accessToken },
  );
  return data.analysis;
}

export async function createQualityRootCause(
  accessToken: string,
  comebackId: string,
  body: CreateQualityRootCauseRequest,
) {
  const data = await request<{ analysis: QualityRootCauseAnalysisSummary }>(
    `/quality/comebacks/${comebackId}/root-cause`,
    { accessToken, method: 'POST', body },
  );
  return data.analysis;
}

export async function createQualityCostEntry(
  accessToken: string,
  comebackId: string,
  body: CreateQualityCostEntryRequest,
) {
  const data = await request<{ cost: QualityCostEntrySummary }>(
    `/quality/comebacks/${comebackId}/costs`,
    { accessToken, method: 'POST', body },
  );
  return data.cost;
}

export async function fetchQualityWarrantyClaims(accessToken: string) {
  const data = await request<{ claims: QualityWarrantyClaimSummary[] }>('/quality/warranty', {
    accessToken,
  });
  return data.claims;
}

export async function createQualityWarrantyClaim(
  accessToken: string,
  body: CreateQualityWarrantyClaimRequest,
) {
  const data = await request<{ claim: QualityWarrantyClaimSummary }>('/quality/warranty', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.claim;
}

export async function fetchQualityTechnicianIntelligence(accessToken: string) {
  const data = await request<{ intelligence: QualityTechnicianIntelligence }>(
    '/quality/technicians',
    {
      accessToken,
    },
  );
  return data.intelligence;
}

export async function fetchQualitySupplierIntelligence(accessToken: string) {
  const data = await request<{ intelligence: QualitySupplierIntelligence }>('/quality/suppliers', {
    accessToken,
  });
  return data.intelligence;
}

export async function createQualitySupplierDefect(
  accessToken: string,
  body: CreateQualitySupplierDefectRequest,
) {
  const data = await request<{ defect: unknown }>('/quality/suppliers/defects', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.defect;
}

export async function fetchQualityActions(accessToken: string) {
  const data = await request<{ actions: QualityActionSummary[] }>('/quality/actions', {
    accessToken,
  });
  return data.actions;
}

export async function createQualityAction(accessToken: string, body: CreateQualityActionRequest) {
  const data = await request<{ action: QualityActionSummary }>('/quality/actions', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.action;
}
