import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { emitBusinessEvent } from '../lib/automation-events.js';
import type {
  CreatePurchaseOrderRequest,
  CreateSupplierActivityRequest,
  CreateSupplierProductRequest,
  CreateSupplierRequest,
  ProcurementAuraContext,
  ProcurementRecommendationSummary,
  ProcurementStats,
  PurchaseOrderDetail,
  PurchaseOrderSummary,
  ReceivePurchaseOrderRequest,
  StockIntelligenceSignal,
  SupplierActivitySummary,
  SupplierInsight,
  SupplierProductSummary,
  SupplierSummary,
  UpdateProcurementRecommendationRequest,
  UpdatePurchaseOrderRequest,
  UpdatePurchaseOrderStatusRequest,
  UpdateSupplierProductRequest,
  UpdateSupplierRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  inventoryStockMovements,
  jobs,
  procurementRecommendations,
  purchaseOrderItems,
  purchaseOrders,
  supplierActivities,
  supplierProducts,
  suppliers,
  users,
} from '@titan/db';
import type { InventoryService } from './inventory.service.js';
import type { StockMovementsService } from './stock-movements.service.js';
import { StockMovementError } from './stock-movements.service.js';

export class ProcurementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProcurementError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

type ProcurementServiceDeps = {
  db: DatabaseClient;
  inventoryService: InventoryService;
  stockMovementsService: StockMovementsService;
};

export class ProcurementService {
  constructor(private readonly deps: ProcurementServiceDeps) {}

  async getStats(companyId: string): Promise<ProcurementStats> {
    const [inventoryStats, supplierRows, orderRows, recommendations] = await Promise.all([
      this.deps.inventoryService.getStats(companyId),
      this.deps.db.query.suppliers.findMany({ where: eq(suppliers.companyId, companyId) }),
      this.deps.db.query.purchaseOrders.findMany({
        where: eq(purchaseOrders.companyId, companyId),
      }),
      this.listRecommendations(companyId),
    ]);

    return {
      supplierCount: supplierRows.length,
      activeSupplierCount: supplierRows.filter((row) => row.status === 'active').length,
      purchaseOrderCount: orderRows.length,
      pendingApprovalCount: orderRows.filter((row) => row.status === 'pending_approval').length,
      openOrderCount: orderRows.filter((row) =>
        ['approved', 'ordered', 'received'].includes(row.status),
      ).length,
      lowStockCount: inventoryStats.lowStockCount,
      pendingRecommendationCount: recommendations.filter((row) => row.status === 'pending').length,
    };
  }

  async listSuppliers(companyId: string): Promise<SupplierSummary[]> {
    const rows = await this.deps.db.query.suppliers.findMany({
      where: eq(suppliers.companyId, companyId),
      with: { products: true, purchaseOrders: true },
      orderBy: [desc(suppliers.updatedAt)],
    });

    return rows.map(toSupplierSummary);
  }

  async getSupplier(companyId: string, supplierId: string): Promise<SupplierSummary | null> {
    const row = await this.deps.db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId)),
      with: { products: true, purchaseOrders: true },
    });

    return row ? toSupplierSummary(row) : null;
  }

  async createSupplier(companyId: string, input: CreateSupplierRequest): Promise<SupplierSummary> {
    const name = input.name.trim();
    if (!name) {
      throw new ProcurementError('VALIDATION_ERROR', 'Supplier name is required');
    }

    const [created] = await this.deps.db
      .insert(suppliers)
      .values({
        companyId,
        name,
        contactName: input.contactName?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        status: input.status ?? 'active',
        supplierCode: input.supplierCode?.trim() || null,
        category: input.category?.trim() || null,
        sourceProvider: input.sourceProvider?.trim() || null,
        sourceExternalId: input.sourceExternalId?.trim() || null,
      })
      .returning();

    if (!created) {
      throw new ProcurementError('INTERNAL_ERROR', 'Unable to create supplier');
    }

    const detail = await this.getSupplier(companyId, created.id);
    return detail!;
  }

  async updateSupplier(
    companyId: string,
    supplierId: string,
    input: UpdateSupplierRequest,
  ): Promise<SupplierSummary> {
    await this.ensureSupplier(companyId, supplierId);

    await this.deps.db
      .update(suppliers)
      .set({
        name: input.name?.trim(),
        contactName:
          input.contactName !== undefined ? input.contactName?.trim() || null : undefined,
        email: input.email !== undefined ? input.email?.trim() || null : undefined,
        phone: input.phone !== undefined ? input.phone?.trim() || null : undefined,
        address: input.address !== undefined ? input.address?.trim() || null : undefined,
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId)));

    const detail = await this.getSupplier(companyId, supplierId);
    return detail!;
  }

  async listSupplierProducts(companyId: string): Promise<SupplierProductSummary[]> {
    const rows = await this.deps.db.query.supplierProducts.findMany({
      where: eq(supplierProducts.companyId, companyId),
      with: { supplier: true, inventoryItem: true },
      orderBy: [desc(supplierProducts.updatedAt)],
    });

    return rows.map(toSupplierProductSummary);
  }

  async createSupplierProduct(
    companyId: string,
    input: CreateSupplierProductRequest,
  ): Promise<SupplierProductSummary> {
    await this.ensureSupplier(companyId, input.supplierId);

    if (input.inventoryItemId) {
      await this.ensureInventoryItem(companyId, input.inventoryItemId);
    }

    const productName = input.productName.trim();
    if (!productName) {
      throw new ProcurementError('VALIDATION_ERROR', 'Product name is required');
    }

    const [created] = await this.deps.db
      .insert(supplierProducts)
      .values({
        companyId,
        supplierId: input.supplierId,
        inventoryItemId: input.inventoryItemId ?? null,
        productName,
        supplierSku: input.supplierSku?.trim() || null,
        unitCostCents: input.unitCostCents ?? 0,
        leadTimeDays: input.leadTimeDays ?? null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    if (!created) {
      throw new ProcurementError('INTERNAL_ERROR', 'Unable to create supplier product');
    }

    const row = await this.deps.db.query.supplierProducts.findFirst({
      where: eq(supplierProducts.id, created.id),
      with: { supplier: true, inventoryItem: true },
    });

    return toSupplierProductSummary(row!);
  }

  async updateSupplierProduct(
    companyId: string,
    productId: string,
    input: UpdateSupplierProductRequest,
  ): Promise<SupplierProductSummary> {
    const existing = await this.deps.db.query.supplierProducts.findFirst({
      where: and(eq(supplierProducts.id, productId), eq(supplierProducts.companyId, companyId)),
    });

    if (!existing) {
      throw new ProcurementError('NOT_FOUND', 'Supplier product not found');
    }

    if (input.inventoryItemId) {
      await this.ensureInventoryItem(companyId, input.inventoryItemId);
    }

    await this.deps.db
      .update(supplierProducts)
      .set({
        inventoryItemId:
          input.inventoryItemId !== undefined ? (input.inventoryItemId ?? null) : undefined,
        productName: input.productName?.trim(),
        supplierSku:
          input.supplierSku !== undefined ? input.supplierSku?.trim() || null : undefined,
        unitCostCents: input.unitCostCents,
        leadTimeDays: input.leadTimeDays !== undefined ? input.leadTimeDays : undefined,
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(supplierProducts.id, productId));

    const row = await this.deps.db.query.supplierProducts.findFirst({
      where: eq(supplierProducts.id, productId),
      with: { supplier: true, inventoryItem: true },
    });

    return toSupplierProductSummary(row!);
  }

  async listSupplierActivities(
    companyId: string,
    supplierId: string,
  ): Promise<SupplierActivitySummary[]> {
    await this.ensureSupplier(companyId, supplierId);

    const rows = await this.deps.db.query.supplierActivities.findMany({
      where: and(
        eq(supplierActivities.companyId, companyId),
        eq(supplierActivities.supplierId, supplierId),
      ),
      with: { author: true },
      orderBy: [desc(supplierActivities.occurredAt)],
    });

    return rows.map(toSupplierActivitySummary);
  }

  async addSupplierActivity(
    scope: TenantScope,
    supplierId: string,
    input: CreateSupplierActivityRequest,
  ): Promise<SupplierActivitySummary> {
    await this.ensureSupplier(scope.companyId, supplierId);

    const [created] = await this.deps.db
      .insert(supplierActivities)
      .values({
        companyId: scope.companyId,
        supplierId,
        activityType: input.activityType ?? 'note',
        subject: input.subject?.trim() || null,
        body: input.body.trim(),
        authorUserId: scope.userId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      })
      .returning();

    if (!created) {
      throw new ProcurementError('INTERNAL_ERROR', 'Unable to create supplier activity');
    }

    const row = await this.deps.db.query.supplierActivities.findFirst({
      where: eq(supplierActivities.id, created.id),
      with: { author: true },
    });

    return toSupplierActivitySummary(row!);
  }

  async listPurchaseOrders(companyId: string): Promise<PurchaseOrderSummary[]> {
    const rows = await this.deps.db.query.purchaseOrders.findMany({
      where: eq(purchaseOrders.companyId, companyId),
      with: {
        supplier: true,
        createdBy: true,
        approvedBy: true,
        items: true,
        job: true,
        destinationLocation: true,
      },
      orderBy: [desc(purchaseOrders.updatedAt)],
    });

    return rows.map(toPurchaseOrderSummary);
  }

  async getPurchaseOrder(
    companyId: string,
    purchaseOrderId: string,
  ): Promise<PurchaseOrderDetail | null> {
    const row = await this.deps.db.query.purchaseOrders.findFirst({
      where: and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)),
      with: {
        supplier: true,
        createdBy: true,
        approvedBy: true,
        items: { with: { inventoryItem: true } },
        job: true,
        destinationLocation: true,
      },
    });

    return row ? toPurchaseOrderDetail(row) : null;
  }

  async createPurchaseOrder(
    scope: TenantScope,
    input: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderDetail> {
    if (input.clientActionId) {
      const existing = await this.deps.db.query.purchaseOrders.findFirst({
        where: and(
          eq(purchaseOrders.companyId, scope.companyId),
          eq(purchaseOrders.clientActionId, input.clientActionId),
        ),
      });
      if (existing) {
        const detail = await this.getPurchaseOrder(scope.companyId, existing.id);
        if (detail) return detail;
      }
    }

    await this.ensureSupplier(scope.companyId, input.supplierId);

    if (!input.items.length) {
      throw new ProcurementError(
        'VALIDATION_ERROR',
        'At least one purchase order item is required',
      );
    }

    for (const item of input.items) {
      if (item.inventoryItemId) {
        await this.ensureInventoryItem(scope.companyId, item.inventoryItemId);
      }
    }

    let jobNumber: string | null = null;
    if (input.jobId) {
      const job = await this.deps.db.query.jobs.findFirst({
        where: and(eq(jobs.id, input.jobId), eq(jobs.companyId, scope.companyId)),
      });
      if (!job) {
        throw new ProcurementError('NOT_FOUND', 'Job not found');
      }
      jobNumber = job.jobNumber;
    }

    if (input.destinationLocationId) {
      await this.deps.inventoryService.ensureLocationBelongsToCompany(
        scope.companyId,
        input.destinationLocationId,
      );
    }

    const [countRow] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.companyId, scope.companyId));

    const referenceNumber =
      input.referenceNumber?.trim() || `PO-${String((countRow?.count ?? 0) + 1).padStart(4, '0')}`;

    const jobReference = input.jobReference?.trim() || jobNumber || null;

    const totalCostCents = input.items.reduce(
      (sum, item) => sum + item.quantity * item.unitCostCents,
      0,
    );

    const [created] = await this.deps.db
      .insert(purchaseOrders)
      .values({
        companyId: scope.companyId,
        supplierId: input.supplierId,
        referenceNumber,
        notes: input.notes?.trim() || null,
        totalCostCents,
        status: 'draft',
        jobId: input.jobId ?? null,
        jobReference,
        destinationLocationId: input.destinationLocationId ?? null,
        clientActionId: input.clientActionId?.trim() || null,
        createdByUserId: scope.userId,
      })
      .returning();

    if (!created) {
      throw new ProcurementError('INTERNAL_ERROR', 'Unable to create purchase order');
    }

    await this.deps.db.insert(purchaseOrderItems).values(
      input.items.map((item) => ({
        companyId: scope.companyId,
        purchaseOrderId: created.id,
        inventoryItemId: item.inventoryItemId ?? null,
        description: item.description.trim(),
        quantity: item.quantity,
        unitCostCents: item.unitCostCents,
        lineTotalCents: item.quantity * item.unitCostCents,
      })),
    );

    const detail = await this.getPurchaseOrder(scope.companyId, created.id);
    return detail!;
  }

  /**
   * Receives stock against a purchase order. Idempotent on `clientActionId`: replaying the
   * same receipt (e.g. after a network retry) is a no-op. Only lines linked to an inventory
   * item move stock — the stock movement ledger is the sole authority for on-hand quantity.
   */
  async receivePurchaseOrder(
    scope: TenantScope,
    purchaseOrderId: string,
    input: ReceivePurchaseOrderRequest,
  ): Promise<PurchaseOrderDetail> {
    const existing = await this.getPurchaseOrder(scope.companyId, purchaseOrderId);
    if (!existing) {
      throw new ProcurementError('NOT_FOUND', 'Purchase order not found');
    }

    if (!['approved', 'ordered', 'received'].includes(existing.status)) {
      throw new ProcurementError(
        'INVALID_STATUS',
        `Purchase order in status ${existing.status} cannot be received`,
      );
    }

    if (!input.lines.length) {
      throw new ProcurementError('VALIDATION_ERROR', 'At least one receipt line is required');
    }

    await this.deps.inventoryService.ensureLocationBelongsToCompany(
      scope.companyId,
      input.destinationLocationId,
    );

    const lineClientActionIds = input.lines.map(
      (line) => `${input.clientActionId}:${line.purchaseOrderItemId}`,
    );
    const alreadyApplied = await this.deps.db.query.inventoryStockMovements.findFirst({
      where: and(
        eq(inventoryStockMovements.companyId, scope.companyId),
        eq(inventoryStockMovements.purchaseOrderId, purchaseOrderId),
        inArray(inventoryStockMovements.clientActionId, lineClientActionIds),
      ),
    });
    if (alreadyApplied) {
      return existing;
    }

    const itemRows = await this.deps.db.query.purchaseOrderItems.findMany({
      where: and(
        eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId),
        eq(purchaseOrderItems.companyId, scope.companyId),
      ),
    });
    const itemsById = new Map(itemRows.map((row) => [row.id, row]));

    for (const line of input.lines) {
      const item = itemsById.get(line.purchaseOrderItemId);
      if (!item) {
        throw new ProcurementError('NOT_FOUND', 'Purchase order item not found');
      }
      if (line.quantityReceived <= 0) {
        throw new ProcurementError('VALIDATION_ERROR', 'Quantity received must be greater than zero');
      }
      const remaining = item.quantity - item.quantityReceived;
      if (line.quantityReceived > remaining) {
        throw new ProcurementError(
          'VALIDATION_ERROR',
          `Cannot receive more than the remaining ordered quantity for "${item.description}" (${remaining} remaining)`,
        );
      }
    }

    try {
      await this.deps.db.transaction(async (tx) => {
        for (const line of input.lines) {
          const item = itemsById.get(line.purchaseOrderItemId)!;
          const lineClientActionId = `${input.clientActionId}:${line.purchaseOrderItemId}`;

          if (item.inventoryItemId) {
            await this.deps.stockMovementsService.applyMovement(tx, {
              companyId: scope.companyId,
              itemId: item.inventoryItemId,
              locationId: input.destinationLocationId,
              movementType: 'receipt',
              quantityDelta: line.quantityReceived,
              unitCostCents: item.unitCostCents,
              purchaseOrderId,
              purchaseOrderItemId: item.id,
              clientActionId: lineClientActionId,
              recordedByUserId: scope.userId,
              reason: 'purchase_order_receipt',
            });
          }

          await tx
            .update(purchaseOrderItems)
            .set({
              quantityReceived: item.quantityReceived + line.quantityReceived,
              updatedAt: new Date(),
            })
            .where(eq(purchaseOrderItems.id, item.id));
        }

        const refreshedItems = await tx.query.purchaseOrderItems.findMany({
          where: eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId),
        });

        const allFullyReceived = refreshedItems.every(
          (row) => row.quantityReceived >= row.quantity,
        );
        const anyReceived = refreshedItems.some((row) => row.quantityReceived > 0);

        const now = new Date();
        await tx
          .update(purchaseOrders)
          .set({
            deliveryStatus: allFullyReceived ? 'delivered' : anyReceived ? 'partial' : 'not_started',
            status: existing.status === 'completed' ? existing.status : 'received',
            receivedAt: existing.receivedAt ? new Date(existing.receivedAt) : now,
            updatedAt: now,
          })
          .where(eq(purchaseOrders.id, purchaseOrderId));
      });
    } catch (error) {
      if (error instanceof StockMovementError) {
        throw new ProcurementError(error.code, error.message);
      }
      throw error;
    }

    emitBusinessEvent({
      companyId: scope.companyId,
      eventType: 'procurement.purchase_order_approved',
      entityType: 'purchase_order',
      entityId: purchaseOrderId,
      payload: {
        purchaseOrder: { id: purchaseOrderId, status: 'received' },
        receivedLines: input.lines,
      },
      actorUserId: scope.userId,
    });

    const detail = await this.getPurchaseOrder(scope.companyId, purchaseOrderId);
    return detail!;
  }

  async updatePurchaseOrder(
    companyId: string,
    purchaseOrderId: string,
    input: UpdatePurchaseOrderRequest,
  ): Promise<PurchaseOrderDetail> {
    const existing = await this.getPurchaseOrder(companyId, purchaseOrderId);
    if (!existing) {
      throw new ProcurementError('NOT_FOUND', 'Purchase order not found');
    }

    if (existing.status !== 'draft') {
      throw new ProcurementError('INVALID_STATUS', 'Only draft purchase orders can be edited');
    }

    if (input.items) {
      if (!input.items.length) {
        throw new ProcurementError(
          'VALIDATION_ERROR',
          'At least one purchase order item is required',
        );
      }

      await this.deps.db
        .delete(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));

      await this.deps.db.insert(purchaseOrderItems).values(
        input.items.map((item) => ({
          companyId,
          purchaseOrderId,
          inventoryItemId: item.inventoryItemId ?? null,
          description: item.description.trim(),
          quantity: item.quantity,
          unitCostCents: item.unitCostCents,
          lineTotalCents: item.quantity * item.unitCostCents,
        })),
      );
    }

    const totalCostCents =
      input.items?.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0) ??
      existing.totalCostCents;

    await this.deps.db
      .update(purchaseOrders)
      .set({
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
        totalCostCents,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, purchaseOrderId));

    const detail = await this.getPurchaseOrder(companyId, purchaseOrderId);
    return detail!;
  }

  async updatePurchaseOrderStatus(
    scope: TenantScope,
    purchaseOrderId: string,
    input: UpdatePurchaseOrderStatusRequest,
  ): Promise<PurchaseOrderDetail> {
    const existing = await this.getPurchaseOrder(scope.companyId, purchaseOrderId);
    if (!existing) {
      throw new ProcurementError('NOT_FOUND', 'Purchase order not found');
    }

    const now = new Date();
    const updates: Partial<typeof purchaseOrders.$inferInsert> = {
      status: input.status,
      updatedAt: now,
    };

    const allowedTransitions: Record<string, PurchaseOrderSummary['status'][]> = {
      // Owner/manager may approve a draft directly (pending_approval optional).
      draft: ['pending_approval', 'approved', 'cancelled'],
      pending_approval: ['approved', 'draft', 'cancelled'],
      approved: ['ordered', 'cancelled'],
      ordered: ['received', 'cancelled'],
      // Stock receipt is applied via receivePurchaseOrder; status→received alone does not invent stock.
      received: ['completed'],
      completed: [],
      cancelled: [],
    };

    if (!allowedTransitions[existing.status]?.includes(input.status)) {
      throw new ProcurementError(
        'INVALID_STATUS',
        `Cannot transition purchase order from ${existing.status} to ${input.status}`,
      );
    }

    if (input.status === 'approved') {
      updates.approvedByUserId = scope.userId;
      updates.approvedAt = now;
    }
    if (input.status === 'ordered') {
      updates.orderedAt = now;
    }
    if (input.status === 'received') {
      updates.receivedAt = now;
    }
    if (input.status === 'completed') {
      updates.completedAt = now;
    }
    if (input.status === 'cancelled') {
      updates.cancelledAt = now;
      updates.cancelReason = input.cancelReason?.trim() || null;
    }

    await this.deps.db
      .update(purchaseOrders)
      .set(updates)
      .where(eq(purchaseOrders.id, purchaseOrderId));

    if (input.status === 'approved') {
      emitBusinessEvent({
        companyId: scope.companyId,
        eventType: 'procurement.purchase_order_approved',
        entityType: 'purchase_order',
        entityId: purchaseOrderId,
        payload: { purchaseOrder: { id: purchaseOrderId, status: 'approved' } },
        actorUserId: scope.userId,
      });
    }

    if (input.status === 'ordered' || input.status === 'approved') {
      await this.deps.db.insert(supplierActivities).values({
        companyId: scope.companyId,
        supplierId: existing.supplierId,
        activityType: 'order',
        subject: `Purchase order ${existing.referenceNumber}`,
        body: `Purchase order ${existing.referenceNumber} moved to ${input.status}.`,
        authorUserId: scope.userId,
        occurredAt: now,
      });
    }

    const detail = await this.getPurchaseOrder(scope.companyId, purchaseOrderId);
    return detail!;
  }

  async getStockIntelligence(companyId: string): Promise<StockIntelligenceSignal[]> {
    const items = await this.deps.inventoryService.listItems(companyId);
    const signals: StockIntelligenceSignal[] = [];

    for (const item of items) {
      if (item.status !== 'active') {
        continue;
      }

      if (item.totalQuantityOnHand === 0) {
        signals.push({
          signalType: 'zero_stock',
          itemId: item.id,
          itemSku: item.sku,
          itemName: item.name,
          quantityOnHand: 0,
          reorderLevel: item.reorderLevel,
          priority: 'high',
          description: `${item.name} (${item.sku}) is out of stock.`,
        });
        continue;
      }

      if (item.isLowStock) {
        signals.push({
          signalType: 'low_stock',
          itemId: item.id,
          itemSku: item.sku,
          itemName: item.name,
          quantityOnHand: item.totalQuantityOnHand,
          reorderLevel: item.reorderLevel,
          priority: 'high',
          description: `${item.name} (${item.sku}) is at or below reorder level (${item.totalQuantityOnHand}/${item.reorderLevel}).`,
        });
      }

      if (item.totalQuantityOnHand > item.reorderLevel * 4 && item.reorderLevel > 0) {
        signals.push({
          signalType: 'slow_moving',
          itemId: item.id,
          itemSku: item.sku,
          itemName: item.name,
          quantityOnHand: item.totalQuantityOnHand,
          reorderLevel: item.reorderLevel,
          priority: 'low',
          description: `${item.name} (${item.sku}) has high on-hand quantity relative to reorder level — review slow-moving stock.`,
        });
      }
    }

    const fastMoving = items
      .filter((item) => item.status === 'active' && item.reorderLevel > 0 && item.isLowStock)
      .slice(0, 5);

    for (const item of fastMoving) {
      if (
        !signals.some((signal) => signal.itemId === item.id && signal.signalType === 'low_stock')
      ) {
        continue;
      }
      signals.push({
        signalType: 'fast_moving',
        itemId: item.id,
        itemSku: item.sku,
        itemName: item.name,
        quantityOnHand: item.totalQuantityOnHand,
        reorderLevel: item.reorderLevel,
        priority: 'medium',
        description: `${item.name} (${item.sku}) appears fast-moving — reorder may be needed soon.`,
      });
    }

    return signals.slice(0, 20);
  }

  async getSupplierInsights(companyId: string): Promise<SupplierInsight[]> {
    const supplierRows = await this.deps.db.query.suppliers.findMany({
      where: eq(suppliers.companyId, companyId),
      with: { products: true, purchaseOrders: true },
      orderBy: [desc(suppliers.updatedAt)],
    });

    const insights: SupplierInsight[] = [];

    for (const supplier of supplierRows) {
      const completed = supplier.purchaseOrders.filter((row) => row.status === 'completed');
      const cancelled = supplier.purchaseOrders.filter((row) => row.status === 'cancelled');
      const totalOrders = supplier.purchaseOrders.length;

      if (totalOrders >= 2) {
        const completionRate = Math.round((completed.length / totalOrders) * 100);
        insights.push({
          supplierId: supplier.id,
          supplierName: supplier.name,
          insightType: 'performance',
          title: `${supplier.name} completion rate`,
          description: `${completed.length}/${totalOrders} purchase orders completed (${completionRate}%).`,
          priority: completionRate < 50 ? 'high' : 'medium',
          context: {
            completedCount: completed.length,
            totalOrders,
            cancelledCount: cancelled.length,
          },
        });
      }

      if (supplier.products.length > 0) {
        const avgCost =
          supplier.products.reduce((sum, product) => sum + product.unitCostCents, 0) /
          supplier.products.length;
        insights.push({
          supplierId: supplier.id,
          supplierName: supplier.name,
          insightType: 'cost',
          title: `${supplier.name} product costs`,
          description: `${supplier.products.length} linked product(s); average unit cost ${(avgCost / 100).toFixed(2)}.`,
          priority: 'low',
          context: {
            productCount: supplier.products.length,
            averageUnitCostCents: Math.round(avgCost),
          },
        });
      }

      const leadTimes = supplier.products
        .map((product) => product.leadTimeDays)
        .filter((value): value is number => value !== null && value > 0);

      if (leadTimes.length > 0) {
        const avgLead = Math.round(
          leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length,
        );
        insights.push({
          supplierId: supplier.id,
          supplierName: supplier.name,
          insightType: 'lead_time',
          title: `${supplier.name} lead time`,
          description: `Average lead time ${avgLead} day(s) across linked products.`,
          priority: avgLead >= 14 ? 'medium' : 'low',
          context: { averageLeadTimeDays: avgLead },
        });
      }
    }

    const uncoveredItems = await this.deps.inventoryService.listItems(companyId);
    const linkedItemIds = new Set(
      supplierRows.flatMap((supplier) =>
        supplier.products.map((product) => product.inventoryItemId).filter(Boolean),
      ),
    );
    const uncovered = uncoveredItems.filter(
      (item) => item.status === 'active' && item.isLowStock && !linkedItemIds.has(item.id),
    );

    if (uncovered.length > 0) {
      insights.push({
        supplierId: '',
        supplierName: 'Coverage gap',
        insightType: 'coverage',
        title: 'Low-stock items without supplier links',
        description: `${uncovered.length} low-stock item(s) have no supplier product mapping.`,
        priority: 'high',
        context: { itemIds: uncovered.slice(0, 10).map((item) => item.id) },
      });
    }

    return insights.slice(0, 15);
  }

  async listRecommendations(companyId: string): Promise<ProcurementRecommendationSummary[]> {
    const rows = await this.deps.db.query.procurementRecommendations.findMany({
      where: and(
        eq(procurementRecommendations.companyId, companyId),
        inArray(procurementRecommendations.status, ['pending', 'accepted']),
      ),
      orderBy: [desc(procurementRecommendations.updatedAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async generateRecommendations(companyId: string): Promise<ProcurementRecommendationSummary[]> {
    const [stockSignals, supplierInsights, jobStats] = await Promise.all([
      this.getStockIntelligence(companyId),
      this.getSupplierInsights(companyId),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobs)
        .where(
          and(
            eq(jobs.companyId, companyId),
            inArray(jobs.status, ['new', 'scheduled', 'in_progress']),
          ),
        ),
    ]);

    const signals: Array<{
      recommendationType: ProcurementRecommendationSummary['recommendationType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    for (const signal of stockSignals
      .filter((row) => ['low_stock', 'zero_stock', 'inventory_risk'].includes(row.signalType))
      .slice(0, 8)) {
      signals.push({
        recommendationType: signal.signalType === 'zero_stock' ? 'inventory_risk' : 'low_stock',
        title: `Reorder — ${signal.itemName}`,
        description: signal.description,
        priority: signal.priority,
        context: {
          itemId: signal.itemId,
          itemSku: signal.itemSku,
          quantityOnHand: signal.quantityOnHand,
        },
      });
    }

    for (const signal of stockSignals
      .filter((row) => row.signalType === 'slow_moving')
      .slice(0, 4)) {
      signals.push({
        recommendationType: 'slow_moving',
        title: `Slow-moving — ${signal.itemName}`,
        description: signal.description,
        priority: signal.priority,
        context: { itemId: signal.itemId },
      });
    }

    for (const signal of stockSignals
      .filter((row) => row.signalType === 'fast_moving')
      .slice(0, 4)) {
      signals.push({
        recommendationType: 'fast_moving',
        title: `Fast-moving — ${signal.itemName}`,
        description: signal.description,
        priority: signal.priority,
        context: { itemId: signal.itemId },
      });
    }

    for (const insight of supplierInsights.slice(0, 6)) {
      signals.push({
        recommendationType:
          insight.insightType === 'performance' ? 'supplier_performance' : 'cost_reduction',
        title: insight.title,
        description: insight.description,
        priority: insight.priority,
        context: insight.context,
      });
    }

    const activeJobs = jobStats[0]?.count ?? 0;
    if (activeJobs >= 5 && stockSignals.some((row) => row.signalType === 'low_stock')) {
      signals.push({
        recommendationType: 'job_demand',
        title: 'Job demand vs inventory pressure',
        description: `${activeJobs} active job(s) with low-stock signals — review procurement needs before scheduling delays.`,
        priority: 'high',
        context: { activeJobCount: activeJobs },
      });
    }

    const created: ProcurementRecommendationSummary[] = [];
    for (const signal of signals.slice(0, 15)) {
      const [row] = await this.deps.db
        .insert(procurementRecommendations)
        .values({
          companyId,
          recommendationType: signal.recommendationType,
          title: signal.title,
          description: signal.description,
          priority: signal.priority,
          context: signal.context,
        })
        .returning();

      if (row) {
        created.push(toRecommendationSummary(row));
      }
    }

    return created;
  }

  async updateRecommendation(
    companyId: string,
    recommendationId: string,
    input: UpdateProcurementRecommendationRequest,
  ): Promise<ProcurementRecommendationSummary> {
    const existing = await this.deps.db.query.procurementRecommendations.findFirst({
      where: and(
        eq(procurementRecommendations.id, recommendationId),
        eq(procurementRecommendations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new ProcurementError('NOT_FOUND', 'Procurement recommendation not found');
    }

    await this.deps.db
      .update(procurementRecommendations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(procurementRecommendations.id, recommendationId));

    const row = await this.deps.db.query.procurementRecommendations.findFirst({
      where: eq(procurementRecommendations.id, recommendationId),
    });

    return toRecommendationSummary(row!);
  }

  async buildAuraContext(companyId: string): Promise<ProcurementAuraContext> {
    const [stats, stockSignals, supplierInsights, recommendations] = await Promise.all([
      this.getStats(companyId),
      this.getStockIntelligence(companyId),
      this.getSupplierInsights(companyId),
      this.listRecommendations(companyId),
    ]);

    return {
      supplierCount: stats.supplierCount,
      pendingApprovalCount: stats.pendingApprovalCount,
      openOrderCount: stats.openOrderCount,
      lowStockCount: stats.lowStockCount,
      pendingRecommendationCount: stats.pendingRecommendationCount,
      stockSignals: stockSignals.slice(0, 8),
      supplierInsights: supplierInsights.slice(0, 6),
      topRecommendations: recommendations.slice(0, 8).map((row) => ({
        title: row.title,
        recommendationType: row.recommendationType,
        priority: row.priority,
      })),
      summary: `${stats.supplierCount} supplier(s), ${stats.openOrderCount} open order(s), ${stats.lowStockCount} low-stock item(s), ${stats.pendingApprovalCount} PO(s) pending approval.`,
    };
  }

  private async ensureSupplier(companyId: string, supplierId: string): Promise<void> {
    const supplier = await this.deps.db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId)),
    });

    if (!supplier) {
      throw new ProcurementError('NOT_FOUND', 'Supplier not found');
    }
  }

  private async ensureInventoryItem(companyId: string, itemId: string): Promise<void> {
    const items = await this.deps.inventoryService.listItems(companyId);
    if (!items.some((item) => item.id === itemId)) {
      throw new ProcurementError('NOT_FOUND', 'Inventory item not found');
    }
  }
}

function toSupplierSummary(
  row: typeof suppliers.$inferSelect & {
    products: Array<typeof supplierProducts.$inferSelect>;
    purchaseOrders: Array<typeof purchaseOrders.$inferSelect>;
  },
): SupplierSummary {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    status: row.status,
    supplierCode: row.supplierCode ?? null,
    category: row.category ?? null,
    sourceProvider: row.sourceProvider ?? null,
    sourceExternalId: row.sourceExternalId ?? null,
    productCount: row.products.length,
    purchaseOrderCount: row.purchaseOrders.length,
    completedOrderCount: row.purchaseOrders.filter((order) => order.status === 'completed').length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSupplierProductSummary(
  row: typeof supplierProducts.$inferSelect & {
    supplier: typeof suppliers.$inferSelect | null;
    inventoryItem: { name: string } | null;
  },
): SupplierProductSummary {
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? 'Unknown',
    inventoryItemId: row.inventoryItemId,
    inventoryItemName: row.inventoryItem?.name ?? null,
    productName: row.productName,
    supplierSku: row.supplierSku,
    unitCostCents: row.unitCostCents,
    leadTimeDays: row.leadTimeDays,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSupplierActivitySummary(
  row: typeof supplierActivities.$inferSelect & {
    author: typeof users.$inferSelect | null;
  },
): SupplierActivitySummary {
  return {
    id: row.id,
    supplierId: row.supplierId,
    activityType: row.activityType,
    subject: row.subject,
    body: row.body,
    authorUserId: row.authorUserId,
    authorName: row.author ? `${row.author.firstName} ${row.author.lastName}`.trim() : null,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toPurchaseOrderSummary(
  row: typeof purchaseOrders.$inferSelect & {
    supplier: typeof suppliers.$inferSelect | null;
    createdBy: typeof users.$inferSelect | null;
    approvedBy: typeof users.$inferSelect | null;
    items: Array<typeof purchaseOrderItems.$inferSelect>;
    job?: { jobNumber: string | null } | null;
    destinationLocation?: { name: string } | null;
  },
): PurchaseOrderSummary {
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? 'Unknown',
    referenceNumber: row.referenceNumber,
    status: row.status,
    notes: row.notes,
    totalCostCents: row.totalCostCents,
    itemCount: row.items.length,
    jobId: row.jobId,
    jobNumber: row.job?.jobNumber ?? null,
    jobReference: row.jobReference,
    destinationLocationId: row.destinationLocationId,
    destinationLocationName: row.destinationLocation?.name ?? null,
    deliveryStatus: (row.deliveryStatus as PurchaseOrderSummary['deliveryStatus']) ?? 'not_started',
    cancelReason: row.cancelReason,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy
      ? `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim()
      : null,
    approvedByUserId: row.approvedByUserId,
    approvedByName: row.approvedBy
      ? `${row.approvedBy.firstName} ${row.approvedBy.lastName}`.trim()
      : null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    orderedAt: row.orderedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPurchaseOrderDetail(
  row: typeof purchaseOrders.$inferSelect & {
    supplier: typeof suppliers.$inferSelect | null;
    createdBy: typeof users.$inferSelect | null;
    approvedBy: typeof users.$inferSelect | null;
    items: Array<
      typeof purchaseOrderItems.$inferSelect & {
        inventoryItem: { name: string } | null;
      }
    >;
    job?: { jobNumber: string | null } | null;
    destinationLocation?: { name: string } | null;
  },
): PurchaseOrderDetail {
  return {
    ...toPurchaseOrderSummary(row),
    items: row.items.map((item) => ({
      id: item.id,
      inventoryItemId: item.inventoryItemId,
      inventoryItemName: item.inventoryItem?.name ?? null,
      description: item.description,
      quantity: item.quantity,
      quantityReceived: item.quantityReceived,
      unitCostCents: item.unitCostCents,
      lineTotalCents: item.lineTotalCents,
    })),
  };
}

function toRecommendationSummary(
  row: typeof procurementRecommendations.$inferSelect,
): ProcurementRecommendationSummary {
  return {
    id: row.id,
    recommendationType: row.recommendationType,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    context: (row.context as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
