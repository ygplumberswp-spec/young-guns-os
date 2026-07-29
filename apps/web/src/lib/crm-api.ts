import type {
  CreateCustomerActivityRequest,
  CreateCustomerRequest,
  CrmStats,
  CustomerDetail,
  CustomerSummary,
  UpdateCustomerRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchCrmStats(accessToken: string): Promise<CrmStats> {
  return request<CrmStats>('/crm/stats', { accessToken });
}

export async function fetchCustomers(accessToken: string): Promise<CustomerSummary[]> {
  const data = await request<{ customers: CustomerSummary[] }>('/crm/customers', {
    accessToken,
  });

  return data.customers;
}

export async function fetchCustomer(accessToken: string, customerId: string): Promise<CustomerDetail> {
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
