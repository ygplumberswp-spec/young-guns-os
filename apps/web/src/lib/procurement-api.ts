import type {
  CreatePurchaseOrderRequest,
  CreateSupplierActivityRequest,
  CreateSupplierProductRequest,
  CreateSupplierRequest,
  ProcurementStats,
  PurchaseOrderDetail,
  PurchaseOrderSummary,
  ReceivePurchaseOrderRequest,
  SupplierActivitySummary,
  SupplierProductSummary,
  SupplierSummary,
  UpdatePurchaseOrderRequest,
  UpdatePurchaseOrderStatusRequest,
  UpdateSupplierProductRequest,
  UpdateSupplierRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchProcurementStats(accessToken: string): Promise<ProcurementStats> {
  const data = await request<{ stats: ProcurementStats }>('/procurement/stats', { accessToken });
  return data.stats;
}

export async function fetchSuppliers(accessToken: string): Promise<SupplierSummary[]> {
  const data = await request<{ suppliers: SupplierSummary[] }>('/procurement/suppliers', {
    accessToken,
  });
  return data.suppliers;
}

export async function createSupplier(
  accessToken: string,
  body: CreateSupplierRequest,
): Promise<SupplierSummary> {
  const data = await request<{ supplier: SupplierSummary }>('/procurement/suppliers', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.supplier;
}

export async function updateSupplier(
  accessToken: string,
  supplierId: string,
  body: UpdateSupplierRequest,
): Promise<SupplierSummary> {
  const data = await request<{ supplier: SupplierSummary }>(
    `/procurement/suppliers/${supplierId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.supplier;
}

export async function fetchSupplierActivities(
  accessToken: string,
  supplierId: string,
): Promise<SupplierActivitySummary[]> {
  const data = await request<{ activities: SupplierActivitySummary[] }>(
    `/procurement/suppliers/${supplierId}/activities`,
    { accessToken },
  );
  return data.activities;
}

export async function createSupplierActivity(
  accessToken: string,
  supplierId: string,
  body: CreateSupplierActivityRequest,
): Promise<SupplierActivitySummary> {
  const data = await request<{ activity: SupplierActivitySummary }>(
    `/procurement/suppliers/${supplierId}/activities`,
    { method: 'POST', accessToken, body },
  );
  return data.activity;
}

export async function fetchSupplierProducts(
  accessToken: string,
): Promise<SupplierProductSummary[]> {
  const data = await request<{ products: SupplierProductSummary[] }>(
    '/procurement/supplier-products',
    { accessToken },
  );
  return data.products;
}

export async function createSupplierProduct(
  accessToken: string,
  body: CreateSupplierProductRequest,
): Promise<SupplierProductSummary> {
  const data = await request<{ product: SupplierProductSummary }>(
    '/procurement/supplier-products',
    { method: 'POST', accessToken, body },
  );
  return data.product;
}

export async function updateSupplierProduct(
  accessToken: string,
  productId: string,
  body: UpdateSupplierProductRequest,
): Promise<SupplierProductSummary> {
  const data = await request<{ product: SupplierProductSummary }>(
    `/procurement/supplier-products/${productId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.product;
}

export async function fetchPurchaseOrders(accessToken: string): Promise<PurchaseOrderSummary[]> {
  const data = await request<{ purchaseOrders: PurchaseOrderSummary[] }>(
    '/procurement/purchase-orders',
    { accessToken },
  );
  return data.purchaseOrders;
}

export async function fetchPurchaseOrder(
  accessToken: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderDetail> {
  const data = await request<{ purchaseOrder: PurchaseOrderDetail }>(
    `/procurement/purchase-orders/${purchaseOrderId}`,
    { accessToken },
  );
  return data.purchaseOrder;
}

export async function createPurchaseOrder(
  accessToken: string,
  body: CreatePurchaseOrderRequest,
): Promise<PurchaseOrderDetail> {
  const data = await request<{ purchaseOrder: PurchaseOrderDetail }>(
    '/procurement/purchase-orders',
    { method: 'POST', accessToken, body },
  );
  return data.purchaseOrder;
}

export async function updatePurchaseOrder(
  accessToken: string,
  purchaseOrderId: string,
  body: UpdatePurchaseOrderRequest,
): Promise<PurchaseOrderDetail> {
  const data = await request<{ purchaseOrder: PurchaseOrderDetail }>(
    `/procurement/purchase-orders/${purchaseOrderId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.purchaseOrder;
}

export async function updatePurchaseOrderStatus(
  accessToken: string,
  purchaseOrderId: string,
  body: UpdatePurchaseOrderStatusRequest,
): Promise<PurchaseOrderDetail> {
  const data = await request<{ purchaseOrder: PurchaseOrderDetail }>(
    `/procurement/purchase-orders/${purchaseOrderId}/status`,
    { method: 'PATCH', accessToken, body },
  );
  return data.purchaseOrder;
}

export async function receivePurchaseOrder(
  accessToken: string,
  purchaseOrderId: string,
  body: ReceivePurchaseOrderRequest,
): Promise<PurchaseOrderDetail> {
  const data = await request<{ purchaseOrder: PurchaseOrderDetail }>(
    `/procurement/purchase-orders/${purchaseOrderId}/receive`,
    { method: 'POST', accessToken, body },
  );
  return data.purchaseOrder;
}

export function newClientActionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
