export type InventoryItemStatus = 'active' | 'inactive';

export type InventoryLocationType = 'warehouse' | 'van' | 'other';

export type InventoryStockMovementType =
  | 'receipt'
  | 'issue'
  | 'return_to_stock'
  | 'adjustment'
  | 'correction'
  | 'waste';

export const INVENTORY_ITEM_STATUS_OPTIONS: Array<{ value: InventoryItemStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const INVENTORY_LOCATION_TYPE_OPTIONS: Array<{
  value: InventoryLocationType;
  label: string;
}> = [
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'van', label: 'Van / Vehicle' },
  { value: 'other', label: 'Other' },
];

export const INVENTORY_UNIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'each', label: 'Each' },
  { value: 'box', label: 'Box' },
  { value: 'case', label: 'Case' },
  { value: 'kg', label: 'Kilogram' },
  { value: 'lb', label: 'Pound' },
  { value: 'm', label: 'Meter' },
  { value: 'ft', label: 'Foot' },
];

export type InventoryLocationSummary = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  locationType: InventoryLocationType;
  vehicleId: string | null;
  vehicleLabel: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryItemSummary = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorderLevel: number;
  unitCostCents: number | null;
  sellPriceCents: number | null;
  status: InventoryItemStatus;
  totalQuantityOnHand: number;
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryStockLevelSummary = {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  itemUnit: string;
  reorderLevel: number;
  locationId: string;
  locationName: string;
  locationCode: string | null;
  locationType: InventoryLocationType;
  quantityOnHand: number;
  isLowStock: boolean;
  updatedAt: string;
};

export type InventoryStockMovementSummary = {
  id: string;
  itemId: string;
  itemSku: string | null;
  itemName: string | null;
  locationId: string;
  locationName: string | null;
  movementType: InventoryStockMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCostCents: number;
  jobId: string | null;
  purchaseOrderId: string | null;
  jobMaterialLineId: string | null;
  reason: string | null;
  clientActionId: string | null;
  createdAt: string;
  idempotentReplay?: boolean;
};

export type InventoryStats = {
  itemCount: number;
  locationCount: number;
  vanLocationCount: number;
  lowStockCount: number;
  totalUnitsOnHand: number;
};

export type CreateInventoryLocationRequest = {
  name: string;
  code?: string | null;
  address?: string | null;
  locationType?: InventoryLocationType;
  vehicleId?: string | null;
  isDefault?: boolean;
};

export type CreateInventoryItemRequest = {
  sku: string;
  name: string;
  description?: string | null;
  unit?: string;
  reorderLevel?: number;
  unitCostCents?: number;
  sellPriceCents?: number;
  status?: InventoryItemStatus;
};

export type SetInventoryStockRequest = {
  itemId: string;
  locationId: string;
  quantityOnHand: number;
  clientActionId?: string | null;
  reason?: string | null;
};
