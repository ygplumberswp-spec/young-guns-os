export type InventoryItemStatus = 'active' | 'inactive';

export const INVENTORY_ITEM_STATUS_OPTIONS: Array<{ value: InventoryItemStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
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
  quantityOnHand: number;
  isLowStock: boolean;
  updatedAt: string;
};

export type InventoryStats = {
  itemCount: number;
  locationCount: number;
  lowStockCount: number;
  totalUnitsOnHand: number;
};

export type CreateInventoryLocationRequest = {
  name: string;
  code?: string | null;
  address?: string | null;
  isDefault?: boolean;
};

export type CreateInventoryItemRequest = {
  sku: string;
  name: string;
  description?: string | null;
  unit?: string;
  reorderLevel?: number;
  status?: InventoryItemStatus;
};

export type SetInventoryStockRequest = {
  itemId: string;
  locationId: string;
  quantityOnHand: number;
};
