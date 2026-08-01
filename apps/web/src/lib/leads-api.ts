import type {
  BulkOperationSummary,
  ConvertLeadRequest,
  ConvertLeadResult,
  CreateLeadRequest,
  LeadDetail,
  LeadDuplicateCheckResult,
  LeadSourceSummary,
  LeadStats,
  LeadSummary,
  LeadStatus,
  UpdateLeadRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchLeads(
  accessToken: string,
  query: {
    q?: string;
    status?: LeadStatus;
    sourceId?: string;
    serviceType?: string;
    assignedUserId?: string;
    overdueOnly?: boolean;
  } = {},
): Promise<LeadSummary[]> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.sourceId) params.set('sourceId', query.sourceId);
  if (query.serviceType) params.set('serviceType', query.serviceType);
  if (query.assignedUserId) params.set('assignedUserId', query.assignedUserId);
  if (query.overdueOnly) params.set('overdueOnly', '1');
  const qs = params.toString();
  const data = await request<{ leads: LeadSummary[] }>(`/leads${qs ? `?${qs}` : ''}`, {
    accessToken,
  });
  return data.leads;
}

export async function fetchLeadDetail(accessToken: string, leadId: string): Promise<LeadDetail> {
  const data = await request<{ lead: LeadDetail }>(`/leads/${leadId}`, { accessToken });
  return data.lead;
}

export async function fetchLeadStats(accessToken: string): Promise<LeadStats> {
  const data = await request<{ stats: LeadStats }>('/leads/stats', { accessToken });
  return data.stats;
}

export async function fetchLeadSources(accessToken: string): Promise<LeadSourceSummary[]> {
  const data = await request<{ sources: LeadSourceSummary[] }>('/leads/sources', {
    accessToken,
  });
  return data.sources;
}

export async function checkLeadDuplicates(
  accessToken: string,
  body: {
    contactName?: string | null;
    companyName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    street?: string | null;
    suburb?: string | null;
    excludeLeadId?: string | null;
  },
): Promise<LeadDuplicateCheckResult> {
  return request<LeadDuplicateCheckResult>('/leads/duplicates/check', {
    accessToken,
    method: 'POST',
    body,
  });
}

export async function createLead(
  accessToken: string,
  body: CreateLeadRequest,
): Promise<{ lead: LeadSummary; warnings: string[] }> {
  return request<{ lead: LeadSummary; warnings: string[] }>('/leads', {
    accessToken,
    method: 'POST',
    body,
  });
}

export async function updateLead(
  accessToken: string,
  leadId: string,
  body: UpdateLeadRequest,
): Promise<LeadSummary> {
  const data = await request<{ lead: LeadSummary }>(`/leads/${leadId}`, {
    accessToken,
    method: 'PATCH',
    body,
  });
  return data.lead;
}

export async function deleteLead(accessToken: string, leadId: string): Promise<void> {
  await request<Record<string, never>>(`/leads/${leadId}`, {
    accessToken,
    method: 'DELETE',
  });
}

export async function bulkLeads(
  accessToken: string,
  body: {
    ids: string[];
    action: 'archive' | 'delete' | 'set_status' | 'assign';
    status?: LeadStatus;
    assignedUserId?: string | null;
    typedConfirmation?: string;
  },
): Promise<BulkOperationSummary> {
  return request<BulkOperationSummary>('/leads/bulk', {
    accessToken,
    method: 'POST',
    body,
  });
}

export async function convertLead(
  accessToken: string,
  leadId: string,
  body: ConvertLeadRequest,
): Promise<ConvertLeadResult> {
  const data = await request<{ conversion: ConvertLeadResult }>(`/leads/${leadId}/convert`, {
    accessToken,
    method: 'POST',
    body,
  });
  return data.conversion;
}
