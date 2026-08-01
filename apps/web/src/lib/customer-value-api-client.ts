import type {
  CustomerSummary,
  CustomerValueClassificationSummary,
  CustomerValueMetrics,
} from '@titan/shared';
import { request } from './api-client';

export type CustomerWithValueClassification = CustomerSummary & {
  valueClassification: CustomerValueClassificationSummary;
};

export async function fetchCustomerValueMetrics(accessToken: string): Promise<CustomerValueMetrics> {
  return request<CustomerValueMetrics>('/customers/value-metrics', { accessToken });
}

export async function fetchCustomersWithClassification(
  accessToken: string,
  search?: string,
): Promise<CustomerWithValueClassification[]> {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('q', search.trim());
  const qs = params.toString();
  const data = await request<{ customers: CustomerWithValueClassification[] }>(
    `/customers${qs ? `?${qs}` : ''}`,
    { accessToken },
  );
  return data.customers;
}

export async function fetchCustomersByClassification(
  accessToken: string,
  classification: string,
  search?: string,
): Promise<CustomerWithValueClassification[]> {
  const params = new URLSearchParams({ classification });
  if (search?.trim()) params.set('q', search.trim());
  const data = await request<{ customers: CustomerWithValueClassification[] }>(
    `/customers?${params.toString()}`,
    { accessToken },
  );
  return data.customers;
}
