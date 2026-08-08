import type {
  CreateCustomerPersonRequest,
  CreateCustomerSourceAssociationRequest,
  Customer360Workspace,
  CustomerPerson,
  CustomerSourceAssociation,
  UpdateCustomerPersonRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchCustomer360Workspace(
  accessToken: string,
  customerId: string,
  opts: { limit?: number; offset?: number; order?: 'newest' | 'oldest' } = {},
): Promise<Customer360Workspace> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.order) params.set('order', opts.order);
  const qs = params.toString();
  const data = await request<{ workspace: Customer360Workspace }>(
    `/customer-360/customers/${customerId}/workspace${qs ? `?${qs}` : ''}`,
    { accessToken },
  );
  return data.workspace;
}

export async function createCustomer360Person(
  accessToken: string,
  customerId: string,
  body: CreateCustomerPersonRequest,
): Promise<CustomerPerson> {
  const data = await request<{ person: CustomerPerson }>(
    `/customer-360/customers/${customerId}/people`,
    { accessToken, method: 'POST', body },
  );
  return data.person;
}

export async function updateCustomer360Person(
  accessToken: string,
  customerId: string,
  personId: string,
  body: UpdateCustomerPersonRequest,
): Promise<CustomerPerson> {
  const data = await request<{ person: CustomerPerson }>(
    `/customer-360/customers/${customerId}/people/${personId}`,
    { accessToken, method: 'PATCH', body },
  );
  return data.person;
}

export async function createCustomer360Association(
  accessToken: string,
  customerId: string,
  body: CreateCustomerSourceAssociationRequest,
): Promise<CustomerSourceAssociation> {
  const data = await request<{ association: CustomerSourceAssociation }>(
    `/customer-360/customers/${customerId}/associations`,
    { accessToken, method: 'POST', body },
  );
  return data.association;
}

export async function removeCustomer360Association(
  accessToken: string,
  customerId: string,
  associationId: string,
): Promise<void> {
  await request(`/customer-360/customers/${customerId}/associations/${associationId}`, {
    accessToken,
    method: 'DELETE',
  });
}
