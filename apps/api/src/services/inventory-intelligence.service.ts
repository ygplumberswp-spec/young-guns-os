import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  buildInvIntelStockSnapshot,
  buildInvIntelUsageSnapshot,
  buildShortageAlertDraft,
  buildUsageSignalDraft,
  canAccessInventoryIntelligence,
  canApproveInventoryIntelligenceDrafts,
  canManageInventoryIntelligenceSettings,
  canWriteInventoryIntelligence,
  defaultInvIntelSettings,
  INV_INTEL_PRODUCT_COPY,
  listInvIntelAuraConnections,
  type AcknowledgeInvIntelInsightRequest,
  type CreateInvIntelAuraInsightRequest,
  type DecideInvIntelAlertRequest,
  type InvIntelAlertDraftSummary,
  type InvIntelAuraInsightSummary,
  type InvIntelDashboard,
  type InvIntelMaterialUsageRow,
  type InvIntelMovementRow,
  type InvIntelSettings,
  type InvIntelStockRow,
  type InvIntelUsageSignalSummary,
  type InvIntelWarehouseRow,
  type RefreshInvIntelAlertsRequest,
  type RefreshInvIntelUsageRequest,
  type UpdateInvIntelSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  iiAlertDrafts,
  iiAuraInsights,
  iiSettings,
  iiUsageSignals,
  inventoryItems,
  inventoryLocations,
  inventoryStockLevels,
  inventoryStockMovements,
  jobMaterialLines,
  purchaseOrders,
  securityAuditLogs,
  suppliers,
} from '@titan/db';

export class InventoryIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InventoryIntelligenceError';
  }
}

export type InvIntelActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class InventoryIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: InvIntelActor): void {
    if (!canAccessInventoryIntelligence(actor)) {
      throw new InventoryIntelligenceError(
        'FORBIDDEN',
        'Inventory Intelligence requires inventory or procurement access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: InvIntelActor): void {
    this.assertRead(actor);
    if (!canWriteInventoryIntelligence(actor)) {
      throw new InventoryIntelligenceError(
        'FORBIDDEN',
        'Write actions require inventory:write or procurement:write.',
      );
    }
  }

  private assertApprove(actor: InvIntelActor): void {
    this.assertWrite(actor);
    if (!canApproveInventoryIntelligenceDrafts(actor)) {
      throw new InventoryIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may approve inventory intelligence alert drafts.',
      );
    }
  }

  private assertManageSettings(actor: InvIntelActor): void {
    this.assertWrite(actor);
    if (!canManageInventoryIntelligenceSettings(actor)) {
      throw new InventoryIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may change Inventory Intelligence sensitive settings.',
      );
    }
  }

  private async recordAudit(
    actor: InvIntelActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'inventory_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoReorder: false,
        autoStockMutation: false,
      },
    });
  }

  private toAlert(row: typeof iiAlertDrafts.$inferSelect): InvIntelAlertDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      inventoryItemId: row.inventoryItemId,
      locationId: row.locationId,
      quantityOnHand: row.quantityOnHand,
      reorderLevel: row.reorderLevel,
      autoReorder: false,
      autoStockMutation: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toUsageSignal(row: typeof iiUsageSignals.$inferSelect): InvIntelUsageSignalSummary {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      inventoryItemId: row.inventoryItemId,
      jobId: row.jobId,
      purchaseOrderId: row.purchaseOrderId,
      movementCount: row.movementCount,
      netQuantityDelta: row.netQuantityDelta,
      windowDays: row.windowDays,
      availability: row.availability === 'available' ? 'available' : 'unavailable',
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toInsight(row: typeof iiAuraInsights.$inferSelect): InvIntelAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceAlertId: row.sourceAlertId,
      sourceUsageSignalId: row.sourceUsageSignalId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSettings(row: typeof iiSettings.$inferSelect): InvIntelSettings {
    return defaultInvIntelSettings({
      id: row.id,
      alertDraftsEnabled: row.alertDraftsEnabled,
      usageSignalsEnabled: row.usageSignalsEnabled,
      shortageThresholdMode: row.shortageThresholdMode,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async ensureSettings(actor: InvIntelActor): Promise<InvIntelSettings> {
    const existing = await this.db.query.iiSettings.findFirst({
      where: eq(iiSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(iiSettings)
      .values({
        companyId: actor.companyId,
        autoReorderEnabled: false,
        autoStockMutationEnabled: false,
        alertDraftsEnabled: true,
        usageSignalsEnabled: true,
        shortageThresholdMode: 'reorder_level',
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private async loadStockRows(companyId: string): Promise<InvIntelStockRow[]> {
    const items = await this.db.query.inventoryItems.findMany({
      where: eq(inventoryItems.companyId, companyId),
      orderBy: [desc(inventoryItems.updatedAt)],
      limit: 200,
    });
    if (items.length === 0) return [];

    const levels = await this.db.query.inventoryStockLevels.findMany({
      where: eq(inventoryStockLevels.companyId, companyId),
      with: { location: true },
    });

    const byItem = new Map<string, typeof levels>();
    for (const level of levels) {
      const list = byItem.get(level.itemId) ?? [];
      list.push(level);
      byItem.set(level.itemId, list);
    }

    return items.map((item) => {
      const itemLevels = byItem.get(item.id) ?? [];
      const totalQuantityOnHand = itemLevels.reduce((sum, row) => sum + row.quantityOnHand, 0);
      return {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        status: item.status,
        reorderLevel: item.reorderLevel,
        totalQuantityOnHand,
        isLowStock:
          item.status === 'active' &&
          item.reorderLevel > 0 &&
          totalQuantityOnHand <= item.reorderLevel,
        locationBreakdown: itemLevels.map((row) => ({
          locationId: row.locationId,
          locationName: row.location?.name ?? 'Unknown location',
          locationType: row.location?.locationType ?? 'other',
          quantityOnHand: row.quantityOnHand,
        })),
      };
    });
  }

  private async loadWarehouses(companyId: string): Promise<InvIntelWarehouseRow[]> {
    const locations = await this.db.query.inventoryLocations.findMany({
      where: eq(inventoryLocations.companyId, companyId),
      orderBy: [desc(inventoryLocations.isDefault), desc(inventoryLocations.updatedAt)],
    });
    if (locations.length === 0) return [];

    const levels = await this.db.query.inventoryStockLevels.findMany({
      where: eq(inventoryStockLevels.companyId, companyId),
    });

    return locations.map((loc) => {
      const locLevels = levels.filter((l) => l.locationId === loc.id);
      return {
        locationId: loc.id,
        name: loc.name,
        code: loc.code,
        locationType: loc.locationType,
        isDefault: loc.isDefault,
        vehicleId: loc.vehicleId,
        distinctItemCount: new Set(locLevels.map((l) => l.itemId)).size,
        totalUnitsOnHand: locLevels.reduce((sum, l) => sum + l.quantityOnHand, 0),
      };
    });
  }

  private async loadRecentMovements(companyId: string): Promise<InvIntelMovementRow[]> {
    const rows = await this.db.query.inventoryStockMovements.findMany({
      where: eq(inventoryStockMovements.companyId, companyId),
      with: { item: true, location: true },
      orderBy: [desc(inventoryStockMovements.createdAt)],
      limit: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      itemSku: row.item?.sku ?? 'unknown',
      itemName: row.item?.name ?? 'Unknown item',
      locationId: row.locationId,
      locationName: row.location?.name ?? 'Unknown location',
      movementType: row.movementType,
      quantityDelta: row.quantityDelta,
      quantityAfter: row.quantityAfter,
      jobId: row.jobId,
      purchaseOrderId: row.purchaseOrderId,
      recordedByUserId: row.recordedByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async loadMaterialUsage(companyId: string): Promise<InvIntelMaterialUsageRow[]> {
    const rows = await this.db.query.jobMaterialLines.findMany({
      where: eq(jobMaterialLines.companyId, companyId),
      with: { inventoryItem: true },
      orderBy: [desc(jobMaterialLines.createdAt)],
      limit: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      inventoryItemId: row.inventoryItemId,
      itemSku: row.inventoryItem?.sku ?? null,
      itemName: row.inventoryItem?.name ?? null,
      quantity: Number(row.quantity),
      materialSource: row.materialSource,
      status: row.status,
      locationId: row.locationId,
      stockMovementId: row.stockMovementId,
      recordedByUserId: row.recordedByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getDashboard(actor: InvIntelActor): Promise<InvIntelDashboard> {
    this.assertRead(actor);

    const settings = await this.ensureSettings(actor);
    const [stockRows, warehouses, recentMovements, materialUsage, alerts, usageSignals, insights] =
      await Promise.all([
        this.loadStockRows(actor.companyId),
        this.loadWarehouses(actor.companyId),
        this.loadRecentMovements(actor.companyId),
        this.loadMaterialUsage(actor.companyId),
        this.db.query.iiAlertDrafts.findMany({
          where: eq(iiAlertDrafts.companyId, actor.companyId),
          orderBy: [desc(iiAlertDrafts.createdAt)],
          limit: 50,
        }),
        this.db.query.iiUsageSignals.findMany({
          where: eq(iiUsageSignals.companyId, actor.companyId),
          orderBy: [desc(iiUsageSignals.createdAt)],
          limit: 50,
        }),
        this.db.query.iiAuraInsights.findMany({
          where: eq(iiAuraInsights.companyId, actor.companyId),
          orderBy: [desc(iiAuraInsights.createdAt)],
          limit: 50,
        }),
      ]);

    const [supplierCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(suppliers)
      .where(eq(suppliers.companyId, actor.companyId));

    const [openPoRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.companyId, actor.companyId),
          inArray(purchaseOrders.status, ['draft', 'pending_approval', 'approved', 'ordered']),
        ),
      );

    const lowStockCount = stockRows.filter((r) => r.isLowStock).length;
    const totalUnitsOnHand = stockRows.reduce((sum, r) => sum + r.totalQuantityOnHand, 0);
    const jobsWithUsage = new Set(materialUsage.map((m) => m.jobId)).size;

    const stock = buildInvIntelStockSnapshot({
      itemCount: stockRows.length,
      locationCount: warehouses.length,
      lowStockCount,
      totalUnitsOnHand,
    });
    const usage = buildInvIntelUsageSnapshot({
      movementCount: recentMovements.length,
      materialLineCount: materialUsage.length,
      jobsWithUsage,
    });

    const alertSummaries = alerts.map((a) => this.toAlert(a));
    const pendingApprovals = alertSummaries.filter(
      (a) => a.status === 'draft' || a.status === 'pending_approval',
    ).length;

    let summary: string;
    if (stock.availability === 'unavailable' && usage.availability === 'unavailable') {
      summary =
        'Inventory Intelligence is ready. No real stock or usage records yet — levels and patterns stay unavailable (not invented).';
    } else {
      summary = `Real inventory signals: ${stock.itemCount} item(s), ${stock.locationCount} location(s), ${stock.lowStockCount} low-stock, ${usage.movementCount} recent movement(s). Alert drafts never auto-reorder.`;
    }

    return {
      summary,
      productClarification: { ...INV_INTEL_PRODUCT_COPY },
      policy: {
        autoReorderEnabled: false,
        autoStockMutationEnabled: false,
        requiresOwnerApproval: true,
        fakeStock: false,
      },
      stock,
      usage,
      warehouses,
      stockRows,
      recentMovements,
      materialUsage,
      alertDrafts: alertSummaries,
      usageSignals: usageSignals.map((s) => this.toUsageSignal(s)),
      auraInsights: insights.map((i) => this.toInsight(i)),
      auraConnections: listInvIntelAuraConnections(),
      settings,
      pendingApprovals,
      supplierLinkCount: supplierCountRow?.count ?? 0,
      openPurchaseOrderCount: openPoRow?.count ?? 0,
    };
  }

  async refreshAlertDrafts(
    actor: InvIntelActor,
    input: RefreshInvIntelAlertsRequest = {},
  ): Promise<{ created: number; alerts: InvIntelAlertDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.alertDraftsEnabled) {
      throw new InventoryIntelligenceError(
        'INVALID_STATE',
        'Alert drafts are disabled in Inventory Intelligence settings.',
      );
    }

    const stockRows = await this.loadStockRows(actor.companyId);
    const created: InvIntelAlertDraftSummary[] = [];
    const status = input.submitForApproval ? 'pending_approval' : 'draft';

    for (const row of stockRows) {
      if (row.status !== 'active') continue;

      const qualifiesZero = row.totalQuantityOnHand <= 0;
      const qualifiesReorder =
        settings.shortageThresholdMode === 'reorder_level' &&
        row.reorderLevel > 0 &&
        row.totalQuantityOnHand <= row.reorderLevel;

      if (!qualifiesZero && !qualifiesReorder) continue;

      const existingOpen = await this.db.query.iiAlertDrafts.findFirst({
        where: and(
          eq(iiAlertDrafts.companyId, actor.companyId),
          eq(iiAlertDrafts.inventoryItemId, row.itemId),
          inArray(iiAlertDrafts.status, ['draft', 'pending_approval']),
        ),
      });
      if (existingOpen) continue;

      const primaryLoc = row.locationBreakdown[0];
      const draft = buildShortageAlertDraft({
        sku: row.sku,
        name: row.name,
        quantityOnHand: row.totalQuantityOnHand,
        reorderLevel: row.reorderLevel,
        locationName: primaryLoc?.locationName ?? null,
      });

      const [inserted] = await this.db
        .insert(iiAlertDrafts)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status,
          title: draft.title,
          body: draft.body,
          inventoryItemId: row.itemId,
          locationId: primaryLoc?.locationId ?? null,
          quantityOnHand: row.totalQuantityOnHand,
          reorderLevel: row.reorderLevel,
          autoReorder: false,
          autoStockMutation: false,
          createdByUserId: actor.userId,
          metadata: { source: 'real_stock_levels' },
        })
        .returning();

      created.push(this.toAlert(inserted));
      await this.recordAudit(actor, 'ii_alert_draft_created', inserted.id, {
        kind: draft.kind,
        inventoryItemId: row.itemId,
        quantityOnHand: row.totalQuantityOnHand,
        reorderLevel: row.reorderLevel,
      });
    }

    return { created: created.length, alerts: created };
  }

  async decideAlertDraft(
    actor: InvIntelActor,
    alertId: string,
    input: DecideInvIntelAlertRequest,
  ): Promise<InvIntelAlertDraftSummary> {
    this.assertApprove(actor);

    const existing = await this.db.query.iiAlertDrafts.findFirst({
      where: and(eq(iiAlertDrafts.id, alertId), eq(iiAlertDrafts.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new InventoryIntelligenceError('NOT_FOUND', 'Alert draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new InventoryIntelligenceError(
        'INVALID_STATE',
        `Alert draft is already ${existing.status}.`,
      );
    }

    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'acknowledge'
          ? 'acknowledged'
          : 'rejected';

    const [updated] = await this.db
      .update(iiAlertDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoReorder: false,
        autoStockMutation: false,
        updatedAt: new Date(),
      })
      .where(and(eq(iiAlertDrafts.id, alertId), eq(iiAlertDrafts.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `ii_alert_draft_${nextStatus}`, updated.id, {
      decision: input.decision,
      notes: input.notes ?? null,
      purchaseOrderCreated: false,
      stockMutated: false,
    });

    return this.toAlert(updated);
  }

  async refreshUsageSignals(
    actor: InvIntelActor,
    input: RefreshInvIntelUsageRequest = {},
  ): Promise<{ created: number; signals: InvIntelUsageSignalSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.usageSignalsEnabled) {
      throw new InventoryIntelligenceError(
        'INVALID_STATE',
        'Usage signals are disabled in Inventory Intelligence settings.',
      );
    }

    const windowDays = Math.min(Math.max(input.windowDays ?? 30, 1), 90);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const movements = await this.db.query.inventoryStockMovements.findMany({
      where: and(
        eq(inventoryStockMovements.companyId, actor.companyId),
        gte(inventoryStockMovements.createdAt, since),
      ),
      with: { item: true },
      orderBy: [desc(inventoryStockMovements.createdAt)],
      limit: 500,
    });

    if (movements.length === 0) {
      return { created: 0, signals: [] };
    }

    const byItem = new Map<
      string,
      {
        sku: string;
        name: string;
        net: number;
        count: number;
        jobId: string | null;
        purchaseOrderId: string | null;
        kinds: Set<string>;
      }
    >();

    for (const m of movements) {
      const entry = byItem.get(m.itemId) ?? {
        sku: m.item?.sku ?? 'unknown',
        name: m.item?.name ?? 'Unknown item',
        net: 0,
        count: 0,
        jobId: m.jobId,
        purchaseOrderId: m.purchaseOrderId,
        kinds: new Set<string>(),
      };
      entry.net += m.quantityDelta;
      entry.count += 1;
      entry.kinds.add(m.movementType);
      if (!entry.jobId && m.jobId) entry.jobId = m.jobId;
      if (!entry.purchaseOrderId && m.purchaseOrderId) entry.purchaseOrderId = m.purchaseOrderId;
      byItem.set(m.itemId, entry);
    }

    const created: InvIntelUsageSignalSummary[] = [];

    for (const [itemId, agg] of byItem) {
      if (agg.count < 1) continue;

      let kind: InvIntelUsageSignalSummary['kind'] = 'net_consumption';
      if (agg.kinds.has('issue') && agg.net < 0) kind = 'job_issue';
      else if (agg.kinds.has('return_to_stock')) kind = 'job_return';
      else if (agg.kinds.has('receipt')) kind = 'po_receipt';
      else if (agg.kinds.has('waste')) kind = 'waste';
      else if (agg.kinds.has('adjustment') || agg.kinds.has('correction')) kind = 'adjustment';

      const draft = buildUsageSignalDraft({
        kind,
        sku: agg.sku,
        name: agg.name,
        netQuantityDelta: agg.net,
        movementCount: agg.count,
        windowDays,
        jobId: agg.jobId,
      });

      const [inserted] = await this.db
        .insert(iiUsageSignals)
        .values({
          companyId: actor.companyId,
          kind,
          title: draft.title,
          body: draft.body,
          inventoryItemId: itemId,
          jobId: agg.jobId,
          purchaseOrderId: agg.purchaseOrderId,
          movementCount: agg.count,
          netQuantityDelta: agg.net,
          windowDays,
          availability: 'available',
          createdByUserId: actor.userId,
          metadata: { source: 'real_stock_movements', windowDays },
        })
        .returning();

      created.push(this.toUsageSignal(inserted));
      await this.recordAudit(actor, 'ii_usage_signal_created', inserted.id, {
        inventoryItemId: itemId,
        movementCount: agg.count,
        netQuantityDelta: agg.net,
        windowDays,
      });
    }

    return { created: created.length, signals: created };
  }

  async updateSettings(
    actor: InvIntelActor,
    input: UpdateInvIntelSettingsRequest,
  ): Promise<InvIntelSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const patch: Partial<typeof iiSettings.$inferInsert> = {
      autoReorderEnabled: false,
      autoStockMutationEnabled: false,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    if (input.alertDraftsEnabled !== undefined) patch.alertDraftsEnabled = input.alertDraftsEnabled;
    if (input.usageSignalsEnabled !== undefined) {
      patch.usageSignalsEnabled = input.usageSignalsEnabled;
    }
    if (input.shortageThresholdMode !== undefined) {
      patch.shortageThresholdMode = input.shortageThresholdMode;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const [updated] = await this.db
      .update(iiSettings)
      .set(patch)
      .where(eq(iiSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'ii_settings_updated', updated.id, {
      alertDraftsEnabled: updated.alertDraftsEnabled,
      usageSignalsEnabled: updated.usageSignalsEnabled,
      shortageThresholdMode: updated.shortageThresholdMode,
    });

    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: InvIntelActor,
    input: CreateInvIntelAuraInsightRequest,
  ): Promise<InvIntelAuraInsightSummary> {
    this.assertWrite(actor);

    if (input.sourceAlertId) {
      const alert = await this.db.query.iiAlertDrafts.findFirst({
        where: and(
          eq(iiAlertDrafts.id, input.sourceAlertId),
          eq(iiAlertDrafts.companyId, actor.companyId),
        ),
      });
      if (!alert) {
        throw new InventoryIntelligenceError('NOT_FOUND', 'Source alert draft not found.');
      }
    }

    if (input.sourceUsageSignalId) {
      const signal = await this.db.query.iiUsageSignals.findFirst({
        where: and(
          eq(iiUsageSignals.id, input.sourceUsageSignalId),
          eq(iiUsageSignals.companyId, actor.companyId),
        ),
      });
      if (!signal) {
        throw new InventoryIntelligenceError('NOT_FOUND', 'Source usage signal not found.');
      }
    }

    const [inserted] = await this.db
      .insert(iiAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title.trim(),
        insight: input.insight.trim(),
        href: input.href?.trim() || null,
        sourceAlertId: input.sourceAlertId ?? null,
        sourceUsageSignalId: input.sourceUsageSignalId ?? null,
        createdByUserId: actor.userId,
        metadata: { invented: false },
      })
      .returning();

    await this.recordAudit(actor, 'ii_aura_insight_created', inserted.id, {
      target: input.target,
    });

    return this.toInsight(inserted);
  }

  async acknowledgeInsight(
    actor: InvIntelActor,
    insightId: string,
    input: AcknowledgeInvIntelInsightRequest,
  ): Promise<InvIntelAuraInsightSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.iiAuraInsights.findFirst({
      where: and(eq(iiAuraInsights.id, insightId), eq(iiAuraInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new InventoryIntelligenceError('NOT_FOUND', 'AURA insight not found.');
    }

    const [updated] = await this.db
      .update(iiAuraInsights)
      .set({ status: input.status, updatedAt: new Date() })
      .where(and(eq(iiAuraInsights.id, insightId), eq(iiAuraInsights.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `ii_aura_insight_${input.status}`, updated.id, {
      status: input.status,
    });

    return this.toInsight(updated);
  }
}
