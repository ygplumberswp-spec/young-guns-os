import { hasAnyPermission } from '@titan/auth/browser';
import type { PurchaseOrderDeliveryStatus, PurchaseOrderStatus } from '@titan/shared';

export function canAccessProcurement(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['procurement:read', 'procurement:write', 'inventory:read']);
}

export function canManageProcurement(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['procurement:write']);
}

export function canAuthorizeMaterials(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['jobs:write']);
}

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  ordered: 'Ordered',
  received: 'Received',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function formatPurchaseOrderStatus(status: PurchaseOrderStatus): string {
  return STATUS_LABELS[status] ?? status;
}

const STATUS_PILL_CLASS: Record<PurchaseOrderStatus, string> = {
  draft: 'status-pill--pending',
  pending_approval: 'status-pill--attention',
  approved: 'status-pill--provider_required',
  ordered: 'status-pill--provider_required',
  received: 'status-pill--active',
  completed: 'status-pill--active',
  cancelled: 'status-pill--error',
};

export function purchaseOrderStatusPillClass(status: PurchaseOrderStatus): string {
  return `status-pill ${STATUS_PILL_CLASS[status] ?? 'status-pill--pending'}`;
}

const DELIVERY_LABELS: Record<PurchaseOrderDeliveryStatus, string> = {
  not_started: 'Not started',
  partial: 'Partially delivered',
  delivered: 'Delivered',
};

export function formatDeliveryStatus(status: PurchaseOrderDeliveryStatus): string {
  return DELIVERY_LABELS[status] ?? status;
}

const DELIVERY_PILL_CLASS: Record<PurchaseOrderDeliveryStatus, string> = {
  not_started: 'status-pill--pending',
  partial: 'status-pill--attention',
  delivered: 'status-pill--active',
};

export function deliveryStatusPillClass(status: PurchaseOrderDeliveryStatus): string {
  return `status-pill ${DELIVERY_PILL_CLASS[status] ?? 'status-pill--pending'}`;
}

const MATERIAL_STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  approved: 'Approved',
  used: 'Used',
  partially_fulfilled: 'Partially fulfilled',
  returned: 'Returned',
  wasted: 'Wasted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export function formatMaterialLineStatus(status: string): string {
  return MATERIAL_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

const MATERIAL_STATUS_PILL_CLASS: Record<string, string> = {
  requested: 'status-pill--attention',
  approved: 'status-pill--provider_required',
  used: 'status-pill--active',
  partially_fulfilled: 'status-pill--attention',
  returned: 'status-pill--pending',
  wasted: 'status-pill--error',
  rejected: 'status-pill--error',
  cancelled: 'status-pill--pending',
};

export function materialLineStatusPillClass(status: string): string {
  return `status-pill ${MATERIAL_STATUS_PILL_CLASS[status] ?? 'status-pill--pending'}`;
}
