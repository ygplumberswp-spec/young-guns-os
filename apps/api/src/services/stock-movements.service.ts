import { and, eq } from 'drizzle-orm';
import type { InventoryStockMovementSummary, InventoryStockMovementType } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { inventoryItems, inventoryLocations, inventoryStockLevels, inventoryStockMovements } from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';

export class StockMovementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StockMovementError';
  }
}

type Tx = Parameters<Parameters<DatabaseClient['transaction']>[0]>[0];
export type DbOrTx = DatabaseClient | Tx;

export type ApplyStockMovementInput = {
  companyId: string;
  itemId: string;
  locationId: string;
  movementType: InventoryStockMovementType;
  /** Positive to increase stock (receipt, return_to_stock), negative to decrease (issue, waste). */
  quantityDelta: number;
  unitCostCents?: number;
  jobId?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderItemId?: string | null;
  jobMaterialLineId?: string | null;
  reason?: string | null;
  notes?: string | null;
  clientActionId?: string | null;
  recordedByUserId?: string | null;
};

/**
 * Concurrency-safe stock ledger. All stock quantity changes across inventory, procurement
 * receipts and job material issue/return flows go through `applyMovement` so that
 * `inventory_stock_levels.quantity_on_hand` and the `inventory_stock_movements` ledger
 * never drift out of sync, even under concurrent requests for the same item+location.
 */
export class StockMovementsService {
  constructor(private readonly db: DatabaseClient) {}

  async applyMovement(
    dbOrTx: DbOrTx,
    input: ApplyStockMovementInput,
  ): Promise<InventoryStockMovementSummary> {
    if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
      throw new StockMovementError('VALIDATION_ERROR', 'Quantity delta must be a non-zero number');
    }

    if (input.clientActionId) {
      const existing = await dbOrTx.query.inventoryStockMovements.findFirst({
        where: and(
          eq(inventoryStockMovements.companyId, input.companyId),
          eq(inventoryStockMovements.clientActionId, input.clientActionId),
        ),
      });
      if (existing) {
        return toMovementSummary(existing, true);
      }
    }

    try {
      return await dbOrTx.transaction(async (tx) => {
        const item = await tx.query.inventoryItems.findFirst({
          where: and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.companyId, input.companyId)),
        });
        if (!item) {
          throw new StockMovementError('ITEM_NOT_FOUND', 'Inventory item not found');
        }

        const location = await tx.query.inventoryLocations.findFirst({
          where: and(
            eq(inventoryLocations.id, input.locationId),
            eq(inventoryLocations.companyId, input.companyId),
          ),
        });
        if (!location) {
          throw new StockMovementError('LOCATION_NOT_FOUND', 'Inventory location not found');
        }

        await tx
          .insert(inventoryStockLevels)
          .values({
            companyId: input.companyId,
            itemId: input.itemId,
            locationId: input.locationId,
            quantityOnHand: 0,
          })
          .onConflictDoNothing({
            target: [inventoryStockLevels.companyId, inventoryStockLevels.itemId, inventoryStockLevels.locationId],
          });

        const [levelRow] = await tx
          .select()
          .from(inventoryStockLevels)
          .where(
            and(
              eq(inventoryStockLevels.companyId, input.companyId),
              eq(inventoryStockLevels.itemId, input.itemId),
              eq(inventoryStockLevels.locationId, input.locationId),
            ),
          )
          .for('update');

        if (!levelRow) {
          throw new StockMovementError('INTERNAL_ERROR', 'Unable to lock stock level row');
        }

        const quantityBefore = levelRow.quantityOnHand;
        const quantityAfter = quantityBefore + input.quantityDelta;

        if (quantityAfter < 0) {
          throw new StockMovementError(
            'INSUFFICIENT_STOCK',
            `Insufficient stock for ${item.name} at ${location.name}: have ${quantityBefore}, requested ${Math.abs(
              input.quantityDelta,
            )}`,
          );
        }

        await tx
          .update(inventoryStockLevels)
          .set({ quantityOnHand: quantityAfter, updatedAt: new Date() })
          .where(eq(inventoryStockLevels.id, levelRow.id));

        const [movement] = await tx
          .insert(inventoryStockMovements)
          .values({
            companyId: input.companyId,
            itemId: input.itemId,
            locationId: input.locationId,
            movementType: input.movementType,
            quantityDelta: input.quantityDelta,
            quantityBefore,
            quantityAfter,
            unitCostCents: input.unitCostCents ?? item.unitCostCents ?? 0,
            jobId: input.jobId ?? null,
            purchaseOrderId: input.purchaseOrderId ?? null,
            purchaseOrderItemId: input.purchaseOrderItemId ?? null,
            jobMaterialLineId: input.jobMaterialLineId ?? null,
            reason: input.reason?.trim() || null,
            notes: input.notes?.trim() || null,
            clientActionId: input.clientActionId?.trim() || null,
            recordedByUserId: input.recordedByUserId ?? null,
          })
          .returning();

        if (!movement) {
          throw new StockMovementError('INTERNAL_ERROR', 'Unable to record stock movement');
        }

        this.emitStockThresholdIfNeeded(input.companyId, item, location, quantityAfter);

        return toMovementSummary(movement, false);
      });
    } catch (error) {
      if (isUniqueViolation(error) && input.clientActionId) {
        const existing = await dbOrTx.query.inventoryStockMovements.findFirst({
          where: and(
            eq(inventoryStockMovements.companyId, input.companyId),
            eq(inventoryStockMovements.clientActionId, input.clientActionId),
          ),
        });
        if (existing) {
          return toMovementSummary(existing, true);
        }
      }
      throw error;
    }
  }

  async listMovements(
    companyId: string,
    filters: { itemId?: string; locationId?: string; jobId?: string } = {},
  ): Promise<InventoryStockMovementSummary[]> {
    const conditions = [eq(inventoryStockMovements.companyId, companyId)];
    if (filters.itemId) conditions.push(eq(inventoryStockMovements.itemId, filters.itemId));
    if (filters.locationId) conditions.push(eq(inventoryStockMovements.locationId, filters.locationId));
    if (filters.jobId) conditions.push(eq(inventoryStockMovements.jobId, filters.jobId));

    const rows = await this.db.query.inventoryStockMovements.findMany({
      where: and(...conditions),
      with: { item: true, location: true },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 200,
    });

    return rows.map((row) => toMovementSummary(row, false));
  }

  private emitStockThresholdIfNeeded(
    companyId: string,
    item: typeof inventoryItems.$inferSelect,
    location: typeof inventoryLocations.$inferSelect,
    quantityAfter: number,
  ): void {
    if (item.status !== 'active' || item.reorderLevel <= 0 || quantityAfter > item.reorderLevel) {
      return;
    }

    emitBusinessEvent({
      companyId,
      eventType: 'inventory.stock_threshold_reached',
      entityType: 'inventory_item',
      entityId: item.id,
      payload: {
        itemId: item.id,
        itemName: item.name,
        locationId: location.id,
        locationName: location.name,
        quantityOnHand: quantityAfter,
        reorderLevel: item.reorderLevel,
      },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505');
}

function toMovementSummary(
  row: typeof inventoryStockMovements.$inferSelect & {
    item?: typeof inventoryItems.$inferSelect | null;
    location?: typeof inventoryLocations.$inferSelect | null;
  },
  idempotentReplay: boolean,
): InventoryStockMovementSummary {
  return {
    id: row.id,
    itemId: row.itemId,
    itemSku: row.item?.sku ?? null,
    itemName: row.item?.name ?? null,
    locationId: row.locationId,
    locationName: row.location?.name ?? null,
    movementType: row.movementType,
    quantityDelta: row.quantityDelta,
    quantityBefore: row.quantityBefore,
    quantityAfter: row.quantityAfter,
    unitCostCents: row.unitCostCents,
    jobId: row.jobId,
    purchaseOrderId: row.purchaseOrderId,
    jobMaterialLineId: row.jobMaterialLineId,
    reason: row.reason,
    clientActionId: row.clientActionId,
    createdAt: row.createdAt.toISOString(),
    ...(idempotentReplay ? { idempotentReplay: true } : {}),
  };
}
