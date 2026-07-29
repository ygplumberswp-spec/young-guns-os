export type SupplierStatus = 'active' | 'inactive';

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'ordered'
  | 'received'
  | 'completed'
  | 'cancelled';

export type SupplierActivityType = 'note' | 'communication' | 'performance' | 'order' | 'other';

export type ProcurementRecommendationType =
  | 'low_stock'
  | 'fast_moving'
  | 'slow_moving'
  | 'cost_reduction'
  | 'supplier_performance'
  | 'job_demand'
  | 'inventory_risk';

export type ProcurementRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type SupplierSummary = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: SupplierStatus;
  productCount: number;
  purchaseOrderCount: number;
  completedOrderCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SupplierProductSummary = {
  id: string;
  supplierId: string;
  supplierName: string;
  inventoryItemId: string | null;
  inventoryItemName: string | null;
  productName: string;
  supplierSku: string | null;
  unitCostCents: number;
  leadTimeDays: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderItemSummary = {
  id: string;
  inventoryItemId: string | null;
  inventoryItemName: string | null;
  description: string;
  quantity: number;
  unitCostCents: number;
  lineTotalCents: number;
};

export type PurchaseOrderSummary = {
  id: string;
  supplierId: string;
  supplierName: string;
  referenceNumber: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  totalCostCents: number;
  itemCount: number;
  createdByUserId: string | null;
  createdByName: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderDetail = PurchaseOrderSummary & {
  items: PurchaseOrderItemSummary[];
};

export type SupplierActivitySummary = {
  id: string;
  supplierId: string;
  activityType: SupplierActivityType;
  subject: string | null;
  body: string;
  authorUserId: string | null;
  authorName: string | null;
  occurredAt: string;
  createdAt: string;
};

export type ProcurementRecommendationSummary = {
  id: string;
  recommendationType: ProcurementRecommendationType;
  title: string;
  description: string;
  priority: string;
  status: ProcurementRecommendationStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StockIntelligenceSignal = {
  signalType: 'low_stock' | 'zero_stock' | 'slow_moving' | 'fast_moving' | 'inventory_risk';
  itemId: string;
  itemSku: string;
  itemName: string;
  quantityOnHand: number;
  reorderLevel: number;
  priority: string;
  description: string;
};

export type SupplierInsight = {
  supplierId: string;
  supplierName: string;
  insightType: 'performance' | 'cost' | 'lead_time' | 'coverage';
  title: string;
  description: string;
  priority: string;
  context: Record<string, unknown>;
};

export type ProcurementStats = {
  supplierCount: number;
  activeSupplierCount: number;
  purchaseOrderCount: number;
  pendingApprovalCount: number;
  openOrderCount: number;
  lowStockCount: number;
  pendingRecommendationCount: number;
};

export type ProcurementAuraContext = {
  supplierCount: number;
  pendingApprovalCount: number;
  openOrderCount: number;
  lowStockCount: number;
  pendingRecommendationCount: number;
  stockSignals: StockIntelligenceSignal[];
  supplierInsights: SupplierInsight[];
  topRecommendations: Array<{ title: string; recommendationType: ProcurementRecommendationType; priority: string }>;
  summary: string;
};

export type CreateSupplierRequest = {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  status?: SupplierStatus;
};

export type UpdateSupplierRequest = Partial<CreateSupplierRequest>;

export type CreateSupplierProductRequest = {
  supplierId: string;
  inventoryItemId?: string | null;
  productName: string;
  supplierSku?: string | null;
  unitCostCents?: number;
  leadTimeDays?: number | null;
  notes?: string | null;
};

export type UpdateSupplierProductRequest = Partial<Omit<CreateSupplierProductRequest, 'supplierId'>>;

export type CreatePurchaseOrderItemRequest = {
  inventoryItemId?: string | null;
  description: string;
  quantity: number;
  unitCostCents: number;
};

export type CreatePurchaseOrderRequest = {
  supplierId: string;
  referenceNumber?: string;
  notes?: string | null;
  items: CreatePurchaseOrderItemRequest[];
};

export type UpdatePurchaseOrderRequest = {
  notes?: string | null;
  items?: CreatePurchaseOrderItemRequest[];
};

export type UpdatePurchaseOrderStatusRequest = {
  status: PurchaseOrderStatus;
};

export type CreateSupplierActivityRequest = {
  activityType?: SupplierActivityType;
  subject?: string | null;
  body: string;
  occurredAt?: string;
};

export type UpdateProcurementRecommendationRequest = {
  status: ProcurementRecommendationStatus;
};
