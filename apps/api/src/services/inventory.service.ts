import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  CreateInventoryItemRequest,
  CreateInventoryLocationRequest,
  InventoryItemSummary,
  InventoryLocationSummary,
  InventoryStats,
  InventoryStockLevelSummary,
  SetInventoryStockRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  inventoryItems,
  inventoryLocations,
  inventoryStockLevels,
} from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';

export class InventoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InventoryError';
  }
}

export type AuraInventoryContext = {
  itemCount: number;
  locationCount: number;
  lowStockCount: number;
  totalUnitsOnHand: number;
  locations: Array<{
    id: string;
    name: string;
    code: string | null;
    isDefault: boolean;
  }>;
  items: Array<{
    id: string;
    sku: string;
    name: string;
    status: string;
    unit: string;
    reorderLevel: number;
    totalQuantityOnHand: number;
    isLowStock: boolean;
  }>;
  stockLevels: Array<{
    itemSku: string;
    itemName: string;
    locationName: string;
    quantityOnHand: number;
    isLowStock: boolean;
  }>;
};

export class InventoryService {
  constructor(private readonly db: DatabaseClient) {}

  async listLocations(companyId: string): Promise<InventoryLocationSummary[]> {
    const rows = await this.db.query.inventoryLocations.findMany({
      where: eq(inventoryLocations.companyId, companyId),
      orderBy: [desc(inventoryLocations.isDefault), desc(inventoryLocations.updatedAt)],
    });

    return rows.map(toLocationSummary);
  }

  async createLocation(
    companyId: string,
    input: CreateInventoryLocationRequest,
  ): Promise<InventoryLocationSummary> {
    const name = input.name.trim();

    if (!name) {
      throw new InventoryError('VALIDATION_ERROR', 'Location name is required');
    }

    if (input.isDefault) {
      await this.db
        .update(inventoryLocations)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(inventoryLocations.companyId, companyId));
    }

    const [created] = await this.db
      .insert(inventoryLocations)
      .values({
        companyId,
        name,
        code: input.code?.trim() || null,
        address: input.address?.trim() || null,
        isDefault: input.isDefault ?? false,
      })
      .returning();

    if (!created) {
      throw new InventoryError('INTERNAL_ERROR', 'Unable to create location');
    }

    return toLocationSummary(created);
  }

  async listItems(companyId: string): Promise<InventoryItemSummary[]> {
    const rows = await this.db.query.inventoryItems.findMany({
      where: eq(inventoryItems.companyId, companyId),
      with: { stockLevels: true },
      orderBy: [desc(inventoryItems.updatedAt)],
    });

    return rows.map(toItemSummary);
  }

  async createItem(
    companyId: string,
    input: CreateInventoryItemRequest,
  ): Promise<InventoryItemSummary> {
    const sku = input.sku.trim();
    const name = input.name.trim();

    if (!sku) {
      throw new InventoryError('VALIDATION_ERROR', 'SKU is required');
    }

    if (!name) {
      throw new InventoryError('VALIDATION_ERROR', 'Product name is required');
    }

    const reorderLevel = input.reorderLevel ?? 0;

    if (reorderLevel < 0) {
      throw new InventoryError('VALIDATION_ERROR', 'Reorder level cannot be negative');
    }

    const [created] = await this.db
      .insert(inventoryItems)
      .values({
        companyId,
        sku,
        name,
        description: input.description?.trim() || null,
        unit: input.unit?.trim() || 'each',
        reorderLevel,
        status: input.status ?? 'active',
      })
      .returning();

    if (!created) {
      throw new InventoryError('INTERNAL_ERROR', 'Unable to create product');
    }

    return toItemSummary({ ...created, stockLevels: [] });
  }

  async listStockLevels(companyId: string): Promise<InventoryStockLevelSummary[]> {
    const rows = await this.db.query.inventoryStockLevels.findMany({
      where: eq(inventoryStockLevels.companyId, companyId),
      with: { item: true, location: true },
      orderBy: [desc(inventoryStockLevels.updatedAt)],
    });

    return rows.map(toStockLevelSummary);
  }

  async setStockLevel(
    companyId: string,
    input: SetInventoryStockRequest,
  ): Promise<InventoryStockLevelSummary> {
    if (input.quantityOnHand < 0) {
      throw new InventoryError('VALIDATION_ERROR', 'Quantity on hand cannot be negative');
    }

    await this.ensureItemBelongsToCompany(companyId, input.itemId);
    await this.ensureLocationBelongsToCompany(companyId, input.locationId);

    const existing = await this.db.query.inventoryStockLevels.findFirst({
      where: and(
        eq(inventoryStockLevels.companyId, companyId),
        eq(inventoryStockLevels.itemId, input.itemId),
        eq(inventoryStockLevels.locationId, input.locationId),
      ),
    });

    if (existing) {
      const [updated] = await this.db
        .update(inventoryStockLevels)
        .set({
          quantityOnHand: input.quantityOnHand,
          updatedAt: new Date(),
        })
        .where(eq(inventoryStockLevels.id, existing.id))
        .returning();

      if (!updated) {
        throw new InventoryError('INTERNAL_ERROR', 'Unable to update stock level');
      }

      const row = await this.db.query.inventoryStockLevels.findFirst({
        where: eq(inventoryStockLevels.id, updated.id),
        with: { item: true, location: true },
      });

      if (!row) {
        throw new InventoryError('INTERNAL_ERROR', 'Unable to load updated stock level');
      }

      this.emitStockThresholdIfNeeded(companyId, row);
      return toStockLevelSummary(row);
    }

    const [created] = await this.db
      .insert(inventoryStockLevels)
      .values({
        companyId,
        itemId: input.itemId,
        locationId: input.locationId,
        quantityOnHand: input.quantityOnHand,
      })
      .returning();

    if (!created) {
      throw new InventoryError('INTERNAL_ERROR', 'Unable to create stock level');
    }

    const row = await this.db.query.inventoryStockLevels.findFirst({
      where: eq(inventoryStockLevels.id, created.id),
      with: { item: true, location: true },
    });

    if (!row) {
      throw new InventoryError('INTERNAL_ERROR', 'Unable to load created stock level');
    }

    this.emitStockThresholdIfNeeded(companyId, row);
    return toStockLevelSummary(row);
  }

  private emitStockThresholdIfNeeded(
    companyId: string,
    row: typeof inventoryStockLevels.$inferSelect & {
      item: typeof inventoryItems.$inferSelect | null;
      location: typeof inventoryLocations.$inferSelect | null;
    },
  ): void {
    const item = row.item;
    if (!item || item.status !== 'active' || item.reorderLevel <= 0) {
      return;
    }

    if (row.quantityOnHand > item.reorderLevel) {
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
        locationId: row.locationId,
        locationName: row.location?.name ?? null,
        quantityOnHand: row.quantityOnHand,
        reorderLevel: item.reorderLevel,
      },
    });
  }

  async getStats(companyId: string): Promise<InventoryStats> {
    const [itemCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(eq(inventoryItems.companyId, companyId));

    const [locationCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryLocations)
      .where(eq(inventoryLocations.companyId, companyId));

    const [totalUnitsRow] = await this.db
      .select({ total: sql<number>`coalesce(sum(${inventoryStockLevels.quantityOnHand}), 0)::int` })
      .from(inventoryStockLevels)
      .where(eq(inventoryStockLevels.companyId, companyId));

    const itemRows = await this.db.query.inventoryItems.findMany({
      where: eq(inventoryItems.companyId, companyId),
      with: { stockLevels: true },
    });

    const lowStockCount = itemRows.filter((item) => {
      const total = item.stockLevels.reduce((sum, level) => sum + level.quantityOnHand, 0);
      return item.status === 'active' && item.reorderLevel > 0 && total <= item.reorderLevel;
    }).length;

    return {
      itemCount: itemCountRow?.count ?? 0,
      locationCount: locationCountRow?.count ?? 0,
      lowStockCount,
      totalUnitsOnHand: totalUnitsRow?.total ?? 0,
    };
  }

  async buildAuraContext(companyId: string): Promise<AuraInventoryContext> {
    const stats = await this.getStats(companyId);

    const locationRows = await this.db.query.inventoryLocations.findMany({
      where: eq(inventoryLocations.companyId, companyId),
      orderBy: [desc(inventoryLocations.isDefault), desc(inventoryLocations.updatedAt)],
      limit: 15,
    });

    const itemRows = await this.db.query.inventoryItems.findMany({
      where: eq(inventoryItems.companyId, companyId),
      with: { stockLevels: true },
      orderBy: [desc(inventoryItems.updatedAt)],
      limit: 15,
    });

    const stockRows = await this.db.query.inventoryStockLevels.findMany({
      where: eq(inventoryStockLevels.companyId, companyId),
      with: { item: true, location: true },
      orderBy: [desc(inventoryStockLevels.updatedAt)],
      limit: 20,
    });

    return {
      itemCount: stats.itemCount,
      locationCount: stats.locationCount,
      lowStockCount: stats.lowStockCount,
      totalUnitsOnHand: stats.totalUnitsOnHand,
      locations: locationRows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isDefault: row.isDefault,
      })),
      items: itemRows.map((row) => {
        const totalQuantityOnHand = row.stockLevels.reduce(
          (sum, level) => sum + level.quantityOnHand,
          0,
        );

        return {
          id: row.id,
          sku: row.sku,
          name: row.name,
          status: row.status,
          unit: row.unit,
          reorderLevel: row.reorderLevel,
          totalQuantityOnHand,
          isLowStock:
            row.status === 'active' &&
            row.reorderLevel > 0 &&
            totalQuantityOnHand <= row.reorderLevel,
        };
      }),
      stockLevels: stockRows.map((row) => ({
        itemSku: row.item?.sku ?? 'Unknown',
        itemName: row.item?.name ?? 'Unknown',
        locationName: row.location?.name ?? 'Unknown',
        quantityOnHand: row.quantityOnHand,
        isLowStock:
          row.item?.status === 'active' &&
          (row.item?.reorderLevel ?? 0) > 0 &&
          row.quantityOnHand <= (row.item?.reorderLevel ?? 0),
      })),
    };
  }

  private async ensureItemBelongsToCompany(companyId: string, itemId: string) {
    const item = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, itemId), eq(inventoryItems.companyId, companyId)),
    });

    if (!item) {
      throw new InventoryError('ITEM_NOT_FOUND', 'Product not found');
    }
  }

  private async ensureLocationBelongsToCompany(companyId: string, locationId: string) {
    const location = await this.db.query.inventoryLocations.findFirst({
      where: and(
        eq(inventoryLocations.id, locationId),
        eq(inventoryLocations.companyId, companyId),
      ),
    });

    if (!location) {
      throw new InventoryError('LOCATION_NOT_FOUND', 'Location not found');
    }
  }
}

function toLocationSummary(row: typeof inventoryLocations.$inferSelect): InventoryLocationSummary {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toItemSummary(
  row: typeof inventoryItems.$inferSelect & {
    stockLevels: Array<typeof inventoryStockLevels.$inferSelect>;
  },
): InventoryItemSummary {
  const totalQuantityOnHand = row.stockLevels.reduce((sum, level) => sum + level.quantityOnHand, 0);

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit,
    reorderLevel: row.reorderLevel,
    status: row.status,
    totalQuantityOnHand,
    isLowStock:
      row.status === 'active' && row.reorderLevel > 0 && totalQuantityOnHand <= row.reorderLevel,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStockLevelSummary(
  row: typeof inventoryStockLevels.$inferSelect & {
    item: typeof inventoryItems.$inferSelect | null;
    location: typeof inventoryLocations.$inferSelect | null;
  },
): InventoryStockLevelSummary {
  const reorderLevel = row.item?.reorderLevel ?? 0;

  return {
    id: row.id,
    itemId: row.itemId,
    itemSku: row.item?.sku ?? 'Unknown',
    itemName: row.item?.name ?? 'Unknown',
    itemUnit: row.item?.unit ?? 'each',
    reorderLevel,
    locationId: row.locationId,
    locationName: row.location?.name ?? 'Unknown',
    locationCode: row.location?.code ?? null,
    quantityOnHand: row.quantityOnHand,
    isLowStock:
      row.item?.status === 'active' &&
      reorderLevel > 0 &&
      row.quantityOnHand <= reorderLevel,
    updatedAt: row.updatedAt.toISOString(),
  };
}
