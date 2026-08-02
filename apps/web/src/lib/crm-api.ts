import type {
  CreateCustomerActivityRequest,
  CreateCustomerPropertyRequest,
  CreateCustomerRequest,
  CrmStats,
  CustomerDetail,
  CustomerDuplicateCandidateSummary,
  CustomerMergePreview,
  CustomerMergeRequest,
  CustomerMergeResult,
  CustomerPropertySummary,
  CustomerSummary,
  UpdateCustomerPropertyRequest,
  UpdateCustomerRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchCrmStats(accessToken: string): Promise<CrmStats> {
  return request<CrmStats>('/crm/stats', { accessToken });
}

export async function fetchCustomers(
  accessToken: string,
  search?: string,
): Promise<CustomerSummary[]> {
  const query = search?.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  const data = await request<{ customers: CustomerSummary[] }>(`/crm/customers${query}`, {
    accessToken,
  });

  return data.customers;
}

export async function fetchCustomer(
  accessToken: string,
  customerId: string,
): Promise<CustomerDetail> {
  const data = await request<{ customer: CustomerDetail }>(`/crm/customers/${customerId}`, {
    accessToken,
  });

  return data.customer;
}

export async function createCustomer(
  accessToken: string,
  body: CreateCustomerRequest,
): Promise<CustomerDetail> {
  const data = await request<{ customer: CustomerDetail }>('/crm/customers', {
    method: 'POST',
    accessToken,
    body,
  });

  return data.customer;
}

export async function updateCustomer(
  accessToken: string,
  customerId: string,
  body: UpdateCustomerRequest,
): Promise<CustomerDetail> {
  const data = await request<{ customer: CustomerDetail }>(`/crm/customers/${customerId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });

  return data.customer;
}

export async function deleteCustomer(accessToken: string, customerId: string): Promise<void> {
  await request<Record<string, never>>(`/crm/customers/${customerId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function addCustomerActivity(
  accessToken: string,
  customerId: string,
  body: CreateCustomerActivityRequest,
): Promise<CustomerDetail> {
  const data = await request<{ customer: CustomerDetail }>(
    `/crm/customers/${customerId}/activities`,
    {
      method: 'POST',
      accessToken,
      body,
    },
  );

  return data.customer;
}

export async function fetchCustomerProperties(
  accessToken: string,
  customerId: string,
): Promise<CustomerPropertySummary[]> {
  const data = await request<{ properties: CustomerPropertySummary[] }>(
    `/crm/customers/${customerId}/properties`,
    { accessToken },
  );
  return data.properties;
}

export async function createCustomerProperty(
  accessToken: string,
  customerId: string,
  body: CreateCustomerPropertyRequest,
): Promise<CustomerPropertySummary> {
  const data = await request<{ property: CustomerPropertySummary }>(
    `/crm/customers/${customerId}/properties`,
    { method: 'POST', accessToken, body },
  );
  return data.property;
}

export async function updateCustomerProperty(
  accessToken: string,
  customerId: string,
  propertyId: string,
  body: UpdateCustomerPropertyRequest,
): Promise<CustomerPropertySummary> {
  const data = await request<{ property: CustomerPropertySummary }>(
    `/crm/customers/${customerId}/properties/${propertyId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.property;
}

export async function fetchCustomerDuplicateCandidates(
  accessToken: string,
): Promise<CustomerDuplicateCandidateSummary[]> {
  const data = await request<{ candidates: CustomerDuplicateCandidateSummary[] }>(
    '/crm/customers/duplicates',
    { accessToken },
  );
  return data.candidates;
}

export async function scanCustomerDuplicates(
  accessToken: string,
): Promise<CustomerDuplicateCandidateSummary[]> {
  const data = await request<{ candidates: CustomerDuplicateCandidateSummary[] }>(
    '/crm/customers/duplicates/scan',
    { method: 'POST', accessToken, body: {} },
  );
  return data.candidates;
}

export async function previewCustomerDuplicateMerge(
  accessToken: string,
  body: {
    leftCustomerId: string;
    rightCustomerId: string;
    candidateId?: string | null;
  },
): Promise<CustomerMergePreview> {
  const data = await request<{ preview: CustomerMergePreview }>(
    '/crm/customers/duplicates/preview',
    { method: 'POST', accessToken, body },
  );
  return data.preview;
}

export async function decideCustomerDuplicate(
  accessToken: string,
  body: CustomerMergeRequest,
): Promise<CustomerMergeResult> {
  const data = await request<{ result: CustomerMergeResult }>(
    '/crm/customers/duplicates/decide',
    { method: 'POST', accessToken, body },
  );
  return data.result;
}
