import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  buildSfForecastSnapshot,
  buildSfReorderRecommendationDraft,
  canAccessStockForecasting,
  canApproveStockForecasting,
  canManageStockForecastingSettings,
  canWriteStockForecasting,
  computeAvgDailyDemand,
  computeDaysOfCover,
  computeSeasonalDemand,
  computeShortageRisk,
  computeTrend,
  defaultSfSettings,
  listSfAuraConnections,
  SF_PRODUCT_COPY,
  SF_SEASONAL_LOOKBACK_DAYS,
  suggestedForecastReorderQty,
  suggestedReorderByDate,
  unavailableSeasonalDemand,
  type AcknowledgeSfInsightRequest,
  type CreateSfAuraInsightRequest,
  type DecideSfRecommendationRequest,
  type RefreshSfForecastsRequest,
  type SfAuraInsightSummary,
  type SfDashboard,
  type SfItemForecastSummary,
  type SfRecommendationKind,
  type SfReorderRecommendationSummary,
  type SfSeasonalDemand,
  type SfSettings,
  type SfUsageTrendPoint,
  type UpdateSfSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  iiAlertDrafts,
  inventoryItems,
  inventoryStockLevels,
  inventoryStockMovements,
  opsRecurringMaintenancePlans,
  piPurchaseRecommendations,
  securityAuditLogs,
  sfAuraInsights,
  sfItemForecasts,
  sfReorderRecommendations,
  sfSettings,
  supplierProducts,
  suppliers,
} from '@titan/db';
import { ProcurementError, type ProcurementService } from './procurement.service.js';

export class StockForecastingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StockForecastingError';
  }
}

export type SfActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function numOrNull(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export type StockForecastingServiceDeps = {
  db: DatabaseClient;
  procurementService: ProcurementService;
};

export class StockForecastingService {
  private readonly db: DatabaseClient;
  private readonly procurementService: ProcurementService;

  constructor(deps: StockForecastingServiceDeps) {
    this.db = deps.db;
    this.procurementService = deps.procurementService;
  }

  private assertRead(actor: SfActor): void {
    if (!canAccessStockForecasting(actor)) {
      throw new StockForecastingError(
        'FORBIDDEN',
        'Stock Forecasting requires inventory or procurement access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: SfActor): void {
    this.assertRead(actor);
    if (!canWriteStockForecasting(actor)) {
      throw new StockForecastingError(
        'FORBIDDEN',
        'Write actions require inventory:write or procurement:write.',
      );
    }
  }

  private assertApprove(actor: SfActor): void {
    this.assertWrite(actor);
    if (!canApproveStockForecasting(actor)) {
      throw new StockForecastingError(
        'FORBIDDEN',
        'Only Company Owner may approve stock forecasting reorder recommendations.',
      );
    }
  }

  private assertManageSettings(actor: SfActor): void {
    this.assertWrite(actor);
    if (!canManageStockForecastingSettings(actor)) {
      throw new StockForecastingError(
        'FORBIDDEN',
        'Only Company Owner may change Stock Forecasting sensitive settings.',
      );
    }
  }

  private async recordAudit(
    actor: SfActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'stock_forecasting',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoReorder: false,
        autoPurchase: false,
        inventedDemand: false,
      },
    });
  }

  private toSettings(row: typeof sfSettings.$inferSelect): SfSettings {
    return defaultSfSettings({
      id: row.id,
      forecastingEnabled: row.forecastingEnabled,
      recommendationsEnabled: row.recommendationsEnabled,
      minIssueEvents: row.minIssueEvents,
      windowDays: row.windowDays,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private parseSeasonal(raw: unknown): SfSeasonalDemand {
    if (!raw || typeof raw !== 'object') {
      return unavailableSeasonalDemand(
        'Seasonal snapshot missing — unavailable (not invented).',
      );
    }
    const s = raw as Partial<SfSeasonalDemand>;
    if (s.availability === 'available' || s.availability === 'unavailable') {
      return {
        availability: s.availability,
        method: s.method === 'month_over_year' || s.method === 'quarter_compare' ? s.method : 'unavailable',
        currentPeriodKey: s.currentPeriodKey ?? null,
        priorPeriodKey: s.priorPeriodKey ?? null,
        currentPeriodConsumed: s.currentPeriodConsumed ?? null,
        priorPeriodConsumed: s.priorPeriodConsumed ?? null,
        index: s.index ?? null,
        direction: s.direction ?? 'unavailable',
        rationale: s.rationale ?? 'Seasonal snapshot stored without rationale.',
        assumptions: Array.isArray(s.assumptions) ? s.assumptions : [],
      };
    }
    return unavailableSeasonalDemand(
      'Seasonal snapshot incomplete — unavailable (not invented).',
    );
  }

  private toForecast(
    row: typeof sfItemForecasts.$inferSelect,
    item?: { sku: string; name: string } | null,
  ): SfItemForecastSummary {
    return {
      id: row.id,
      inventoryItemId: row.inventoryItemId,
      sku: item?.sku ?? 'unknown',
      name: item?.name ?? 'Unknown item',
      availability: row.availability === 'available' ? 'available' : 'unavailable',
      quantityOnHand: row.quantityOnHand,
      reorderLevel: row.reorderLevel,
      windowDays: row.windowDays,
      issueEventCount: row.issueEventCount,
      totalConsumed: row.totalConsumed,
      avgDailyDemand: numOrNull(row.avgDailyDemand),
      projectedDaysOfCover: numOrNull(row.projectedDaysOfCover),
      suggestedReorderQty: row.suggestedReorderQty,
      suggestedReorderBy: row.suggestedReorderBy,
      leadTimeDays: row.leadTimeDays,
      shortageRisk: row.shortageRisk,
      trend: row.trend,
      seasonal: this.parseSeasonal(row.seasonal),
      assumptions: Array.isArray(row.assumptions) ? row.assumptions : [],
      rationale: row.rationale,
      jobLinkedConsumption: row.jobLinkedConsumption,
      maintenanceSignalCount: row.maintenanceSignalCount,
      sourceAlertId: row.sourceAlertId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toRecommendation(
    row: typeof sfReorderRecommendations.$inferSelect,
  ): SfReorderRecommendationSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      inventoryItemId: row.inventoryItemId,
      supplierId: row.supplierId,
      forecastId: row.forecastId,
      suggestedQuantity: row.suggestedQuantity,
      suggestedReorderBy: row.suggestedReorderBy,
      whyNeeded: row.whyNeeded,
      whenToBuy: row.whenToBuy,
      whatToBuy: row.whatToBuy,
      expectedUsage: row.expectedUsage || 'Expected usage unavailable.',
      sourceProcurementRecommendationId: row.sourceProcurementRecommendationId,
      draftPurchaseOrderId: row.draftPurchaseOrderId,
      autoReorder: false,
      autoPurchase: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof sfAuraInsights.$inferSelect): SfAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceForecastId: row.sourceForecastId,
      sourceRecommendationId: row.sourceRecommendationId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async ensureSettings(actor: SfActor): Promise<SfSettings> {
    const existing = await this.db.query.sfSettings.findFirst({
      where: eq(sfSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(sfSettings)
      .values({
        companyId: actor.companyId,
        autoReorderEnabled: false,
        autoPurchaseEnabled: false,
        forecastingEnabled: true,
        recommendationsEnabled: true,
        minIssueEvents: 3,
        windowDays: 30,
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private async loadUsageTrends(
    companyId: string,
    windowDays: number,
  ): Promise<SfUsageTrendPoint[]> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const movements = await this.db.query.inventoryStockMovements.findMany({
      where: and(
        eq(inventoryStockMovements.companyId, companyId),
        gte(inventoryStockMovements.createdAt, since),
        inArray(inventoryStockMovements.movementType, ['issue', 'waste']),
      ),
      orderBy: [desc(inventoryStockMovements.createdAt)],
      limit: 2000,
    });

    const byDay = new Map<string, number>();
    for (const m of movements) {
      const day = m.createdAt.toISOString().slice(0, 10);
      const consumed = Math.max(0, -m.quantityDelta);
      byDay.set(day, (byDay.get(day) ?? 0) + consumed);
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, consumed]) => ({ day, consumed }));
  }

  async getDashboard(actor: SfActor): Promise<SfDashboard> {
    this.assertRead(actor);
    const settings = await this.ensureSettings(actor);

    const [forecastRows, recommendationRows, insightRows, items, trends] = await Promise.all([
      this.db.query.sfItemForecasts.findMany({
        where: eq(sfItemForecasts.companyId, actor.companyId),
        orderBy: [desc(sfItemForecasts.createdAt)],
        limit: 100,
      }),
      this.db.query.sfReorderRecommendations.findMany({
        where: eq(sfReorderRecommendations.companyId, actor.companyId),
        orderBy: [desc(sfReorderRecommendations.createdAt)],
        limit: 50,
      }),
      this.db.query.sfAuraInsights.findMany({
        where: eq(sfAuraInsights.companyId, actor.companyId),
        orderBy: [desc(sfAuraInsights.createdAt)],
        limit: 50,
      }),
      this.db.query.inventoryItems.findMany({
        where: eq(inventoryItems.companyId, actor.companyId),
        limit: 200,
      }),
      this.loadUsageTrends(actor.companyId, settings.windowDays),
    ]);

    const itemById = new Map(items.map((i) => [i.id, i]));
    const forecasts = forecastRows.map((row) =>
      this.toForecast(row, itemById.get(row.inventoryItemId) ?? null),
    );

    // Prefer latest forecast per item for snapshot
    const latestByItem = new Map<string, SfItemForecastSummary>();
    for (const f of forecasts) {
      if (!latestByItem.has(f.inventoryItemId)) latestByItem.set(f.inventoryItemId, f);
    }
    const latest = [...latestByItem.values()];
    const forecastableCount = latest.filter((f) => f.availability === 'available').length;
    const unavailableCount = latest.filter((f) => f.availability === 'unavailable').length;
    const highRiskCount = latest.filter((f) => f.shortageRisk === 'high').length;

    const forecastSnap = buildSfForecastSnapshot({
      itemCount: items.length,
      forecastableCount,
      unavailableCount: items.length === 0 ? 0 : unavailableCount || items.length - forecastableCount,
      highRiskCount,
    });

    const recommendations = recommendationRows.map((r) => this.toRecommendation(r));
    const pendingApprovals = recommendations.filter(
      (r) => r.status === 'draft' || r.status === 'pending_approval',
    ).length;

    const [maintenanceRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(opsRecurringMaintenancePlans)
      .where(
        and(
          eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
          eq(opsRecurringMaintenancePlans.status, 'active'),
        ),
      );

    const [supplierRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(suppliers)
      .where(eq(suppliers.companyId, actor.companyId));

    let summary: string;
    if (forecastSnap.availability === 'unavailable') {
      summary =
        'Stock Forecasting is ready. Demand forecasts stay unavailable until real issue/waste history meets the minimum — never invented. Recommendations only; Owner approval required.';
    } else {
      summary = `Forecasts available for ${forecastableCount} item(s); ${highRiskCount} high shortage risk. Reorder drafts never auto-purchase.`;
    }

    return {
      summary,
      productClarification: { ...SF_PRODUCT_COPY },
      policy: {
        autoReorderEnabled: false,
        autoPurchaseEnabled: false,
        requiresOwnerApproval: true,
        inventedDemand: false,
      },
      forecast: forecastSnap,
      itemForecasts: forecasts,
      recommendations,
      usageTrends: trends,
      auraInsights: insightRows.map((i) => this.toInsight(i)),
      auraConnections: listSfAuraConnections(),
      settings,
      pendingApprovals,
      maintenancePlanCount: maintenanceRow?.count ?? 0,
      supplierLinkCount: supplierRow?.count ?? 0,
    };
  }

  async refreshForecasts(
    actor: SfActor,
    input: RefreshSfForecastsRequest = {},
  ): Promise<{
    createdForecasts: number;
    createdRecommendations: number;
    forecasts: SfItemForecastSummary[];
    recommendations: SfReorderRecommendationSummary[];
  }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.forecastingEnabled) {
      throw new StockForecastingError(
        'INVALID_STATE',
        'Forecasting is disabled in Stock Forecasting settings.',
      );
    }

    const windowDays = Math.min(90, Math.max(7, input.windowDays ?? settings.windowDays));
    const minIssueEvents = settings.minIssueEvents;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const mid = new Date(Date.now() - (windowDays / 2) * 24 * 60 * 60 * 1000);

    const seasonalSince = new Date(Date.now() - SF_SEASONAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const [items, levels, movements, seasonalMovements, alerts, products, maintenanceCountRow, piRecs] =
      await Promise.all([
        this.db.query.inventoryItems.findMany({
          where: eq(inventoryItems.companyId, actor.companyId),
          limit: 200,
        }),
        this.db.query.inventoryStockLevels.findMany({
          where: eq(inventoryStockLevels.companyId, actor.companyId),
        }),
        this.db.query.inventoryStockMovements.findMany({
          where: and(
            eq(inventoryStockMovements.companyId, actor.companyId),
            gte(inventoryStockMovements.createdAt, since),
            inArray(inventoryStockMovements.movementType, ['issue', 'waste']),
          ),
          limit: 5000,
        }),
        this.db.query.inventoryStockMovements.findMany({
          where: and(
            eq(inventoryStockMovements.companyId, actor.companyId),
            gte(inventoryStockMovements.createdAt, seasonalSince),
            inArray(inventoryStockMovements.movementType, ['issue', 'waste']),
          ),
          limit: 8000,
        }),
        this.db.query.iiAlertDrafts.findMany({
          where: and(
            eq(iiAlertDrafts.companyId, actor.companyId),
            inArray(iiAlertDrafts.status, ['draft', 'pending_approval', 'approved', 'acknowledged']),
          ),
          orderBy: [desc(iiAlertDrafts.createdAt)],
          limit: 200,
        }),
        this.db.query.supplierProducts.findMany({
          where: eq(supplierProducts.companyId, actor.companyId),
          limit: 1000,
        }),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(opsRecurringMaintenancePlans)
          .where(
            and(
              eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
              eq(opsRecurringMaintenancePlans.status, 'active'),
            ),
          )
          .then((rows) => rows[0]),
        this.db.query.piPurchaseRecommendations.findMany({
          where: and(
            eq(piPurchaseRecommendations.companyId, actor.companyId),
            inArray(piPurchaseRecommendations.status, [
              'draft',
              'pending_approval',
              'approved',
              'accepted',
            ]),
          ),
          orderBy: [desc(piPurchaseRecommendations.createdAt)],
          limit: 200,
        }),
      ]);

    const maintenanceSignalCount = maintenanceCountRow?.count ?? 0;
    const onHandByItem = new Map<string, number>();
    for (const level of levels) {
      onHandByItem.set(level.itemId, (onHandByItem.get(level.itemId) ?? 0) + level.quantityOnHand);
    }

    const leadByItem = new Map<string, { leadTimeDays: number; supplierId: string }>();
    for (const p of products) {
      if (!p.inventoryItemId || p.leadTimeDays == null) continue;
      const existing = leadByItem.get(p.inventoryItemId);
      if (!existing || p.leadTimeDays < existing.leadTimeDays) {
        leadByItem.set(p.inventoryItemId, {
          leadTimeDays: p.leadTimeDays,
          supplierId: p.supplierId,
        });
      }
    }

    const alertByItem = new Map<string, string>();
    for (const a of alerts) {
      if (a.inventoryItemId && !alertByItem.has(a.inventoryItemId)) {
        alertByItem.set(a.inventoryItemId, a.id);
      }
    }

    const piRecByItem = new Map<string, string>();
    for (const r of piRecs) {
      if (r.inventoryItemId && !piRecByItem.has(r.inventoryItemId)) {
        piRecByItem.set(r.inventoryItemId, r.id);
      }
    }

    const createdForecasts: SfItemForecastSummary[] = [];
    const createdRecommendations: SfReorderRecommendationSummary[] = [];
    const recStatus = input.submitRecommendationsForApproval ? 'pending_approval' : 'draft';

    for (const item of items) {
      if (item.status !== 'active') continue;

      const itemMovements = movements.filter((m) => m.itemId === item.id);
      const totalConsumed = itemMovements.reduce(
        (sum, m) => sum + Math.max(0, -m.quantityDelta),
        0,
      );
      const issueEventCount = itemMovements.filter((m) => Math.max(0, -m.quantityDelta) > 0).length;
      const jobLinkedConsumption = itemMovements
        .filter((m) => m.jobId)
        .reduce((sum, m) => sum + Math.max(0, -m.quantityDelta), 0);

      const firstHalf = itemMovements
        .filter((m) => m.createdAt < mid)
        .reduce((sum, m) => sum + Math.max(0, -m.quantityDelta), 0);
      const secondHalf = itemMovements
        .filter((m) => m.createdAt >= mid)
        .reduce((sum, m) => sum + Math.max(0, -m.quantityDelta), 0);

      const demand = computeAvgDailyDemand({
        totalConsumed,
        windowDays,
        issueEventCount,
        minIssueEvents,
      });
      const quantityOnHand = onHandByItem.get(item.id) ?? 0;
      const lead = leadByItem.get(item.id) ?? null;
      const cover = computeDaysOfCover({
        quantityOnHand,
        avgDailyDemand: demand.avgDailyDemand,
      });
      const risk = computeShortageRisk({
        availability: demand.availability,
        quantityOnHand,
        reorderLevel: item.reorderLevel,
        projectedDaysOfCover: cover,
        leadTimeDays: lead?.leadTimeDays ?? null,
      });
      const trend = computeTrend({
        firstHalfConsumed: firstHalf,
        secondHalfConsumed: secondHalf,
        availability: demand.availability,
      });
      const suggestedQty = suggestedForecastReorderQty({
        quantityOnHand,
        reorderLevel: item.reorderLevel,
        avgDailyDemand: demand.avgDailyDemand,
        leadTimeDays: lead?.leadTimeDays ?? null,
      });
      const reorderBy = suggestedReorderByDate({
        projectedDaysOfCover: cover,
        leadTimeDays: lead?.leadTimeDays ?? null,
      });

      const seasonal = computeSeasonalDemand({
        points: seasonalMovements
          .filter((m) => m.itemId === item.id)
          .map((m) => ({
            at: m.createdAt,
            consumed: Math.max(0, -m.quantityDelta),
          })),
      });

      const assumptions = [
        `Lookback window: ${windowDays} day(s).`,
        `Minimum issue/waste events required: ${minIssueEvents}.`,
        `Consumption counted from movement types issue and waste only (quantityDelta < 0).`,
        lead
          ? `Supplier lead time: ${lead.leadTimeDays} day(s) from real supplier_products.`
          : 'Supplier lead time unavailable — timing uses cover only when demand is available.',
        jobLinkedConsumption > 0
          ? `${jobLinkedConsumption} unit(s) of consumption linked to real jobs.`
          : 'No job-linked consumption in window.',
        maintenanceSignalCount > 0
          ? `${maintenanceSignalCount} active recurring maintenance plan(s) present (context only — no invented parts BOM).`
          : 'No active recurring maintenance plans — maintenance demand signal absent.',
        `Seasonal lookback: ${SF_SEASONAL_LOOKBACK_DAYS} day(s) — ${seasonal.rationale}`,
        'No invented demand. Forecast unavailable when history is insufficient.',
      ];

      const [forecastRow] = await this.db
        .insert(sfItemForecasts)
        .values({
          companyId: actor.companyId,
          inventoryItemId: item.id,
          availability: demand.availability,
          quantityOnHand,
          reorderLevel: item.reorderLevel,
          windowDays,
          issueEventCount,
          totalConsumed,
          avgDailyDemand: demand.avgDailyDemand != null ? String(demand.avgDailyDemand) : null,
          projectedDaysOfCover: cover != null ? String(cover) : null,
          suggestedReorderQty: suggestedQty,
          suggestedReorderBy: reorderBy,
          leadTimeDays: lead?.leadTimeDays ?? null,
          shortageRisk: risk,
          trend,
          seasonal,
          assumptions,
          rationale: demand.rationale,
          jobLinkedConsumption,
          maintenanceSignalCount,
          sourceAlertId: alertByItem.get(item.id) ?? null,
          createdByUserId: actor.userId,
          metadata: {
            firstHalfConsumed: firstHalf,
            secondHalfConsumed: secondHalf,
            seasonalMethod: seasonal.method,
          },
        })
        .returning();

      const summary = this.toForecast(forecastRow, item);
      createdForecasts.push(summary);

      await this.recordAudit(actor, 'sf_forecast_created', forecastRow.id, {
        inventoryItemId: item.id,
        availability: demand.availability,
        shortageRisk: risk,
      });

      const shouldRecommend =
        settings.recommendationsEnabled &&
        demand.availability === 'available' &&
        (risk === 'high' || risk === 'watch' || (suggestedQty != null && suggestedQty > 0));

      if (shouldRecommend) {
        let kind: SfRecommendationKind = 'reorder';
        if (risk === 'high' && (cover == null || cover <= (lead?.leadTimeDays ?? 3))) {
          kind = 'buy_now';
        } else if (risk === 'high' || risk === 'watch') {
          kind = 'buy_soon';
        } else if (jobLinkedConsumption > 0) {
          kind = 'job_demand';
        } else if (maintenanceSignalCount > 0) {
          kind = 'maintenance_demand';
        } else {
          kind = 'watch';
        }

        const draft = buildSfReorderRecommendationDraft({
          kind,
          sku: item.sku,
          name: item.name,
          suggestedQuantity: suggestedQty,
          suggestedReorderBy: reorderBy,
          shortageRisk: risk,
          avgDailyDemand: demand.avgDailyDemand,
          projectedDaysOfCover: cover,
          leadTimeDays: lead?.leadTimeDays ?? null,
          seasonal,
          assumptions,
        });

        const [recRow] = await this.db
          .insert(sfReorderRecommendations)
          .values({
            companyId: actor.companyId,
            kind: draft.kind,
            status: recStatus,
            title: draft.title,
            body: draft.body,
            inventoryItemId: item.id,
            supplierId: lead?.supplierId ?? null,
            forecastId: forecastRow.id,
            suggestedQuantity: suggestedQty,
            suggestedReorderBy: reorderBy,
            whyNeeded: draft.whyNeeded,
            whenToBuy: draft.whenToBuy,
            whatToBuy: draft.whatToBuy,
            expectedUsage: draft.expectedUsage,
            sourceProcurementRecommendationId: piRecByItem.get(item.id) ?? null,
            autoReorder: false,
            autoPurchase: false,
            createdByUserId: actor.userId,
            metadata: { shortageRisk: risk, seasonalDirection: seasonal.direction },
          })
          .returning();

        createdRecommendations.push(this.toRecommendation(recRow));
        await this.recordAudit(actor, 'sf_recommendation_created', recRow.id, {
          inventoryItemId: item.id,
          status: recStatus,
          purchaseOrderCreated: false,
        });
      }
    }

    return {
      createdForecasts: createdForecasts.length,
      createdRecommendations: createdRecommendations.length,
      forecasts: createdForecasts,
      recommendations: createdRecommendations,
    };
  }

  async decideRecommendation(
    actor: SfActor,
    recommendationId: string,
    input: DecideSfRecommendationRequest,
  ): Promise<SfReorderRecommendationSummary> {
    this.assertApprove(actor);

    const existing = await this.db.query.sfReorderRecommendations.findFirst({
      where: and(
        eq(sfReorderRecommendations.id, recommendationId),
        eq(sfReorderRecommendations.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new StockForecastingError('NOT_FOUND', 'Reorder recommendation not found.');
    }

    if (input.decision === 'reject') {
      if (!['draft', 'pending_approval', 'approved'].includes(existing.status)) {
        throw new StockForecastingError(
          'INVALID_STATE',
          `Recommendation is already ${existing.status}.`,
        );
      }
      const [updated] = await this.db
        .update(sfReorderRecommendations)
        .set({
          status: 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNotes: input.notes ?? null,
          autoReorder: false,
          autoPurchase: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sfReorderRecommendations.id, recommendationId),
            eq(sfReorderRecommendations.companyId, actor.companyId),
          ),
        )
        .returning();
      await this.recordAudit(actor, 'sf_recommendation_rejected', updated.id, {
        decision: 'reject',
        purchaseOrderCreated: false,
        stockMutated: false,
      });
      return this.toRecommendation(updated);
    }

    if (input.decision === 'approve') {
      if (!['draft', 'pending_approval'].includes(existing.status)) {
        throw new StockForecastingError(
          'INVALID_STATE',
          `Recommendation is already ${existing.status}.`,
        );
      }
      const [updated] = await this.db
        .update(sfReorderRecommendations)
        .set({
          status: 'approved',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNotes: input.notes ?? null,
          autoReorder: false,
          autoPurchase: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sfReorderRecommendations.id, recommendationId),
            eq(sfReorderRecommendations.companyId, actor.companyId),
          ),
        )
        .returning();
      await this.recordAudit(actor, 'sf_recommendation_approved', updated.id, {
        decision: 'approve',
        purchaseOrderCreated: false,
        stockMutated: false,
      });
      return this.toRecommendation(updated);
    }

    // accept — Owner only; optionally create draft PO via Procurement (never ordered)
    if (!['draft', 'pending_approval', 'approved'].includes(existing.status)) {
      throw new StockForecastingError(
        'INVALID_STATE',
        `Cannot accept recommendation in status ${existing.status}.`,
      );
    }

    let draftPurchaseOrderId = existing.draftPurchaseOrderId;
    if (input.createDraftPurchaseOrder) {
      if (!existing.supplierId) {
        throw new StockForecastingError(
          'INVALID_STATE',
          'Cannot create a draft purchase order without a linked real supplier on the recommendation.',
        );
      }
      const quantity =
        existing.suggestedQuantity && existing.suggestedQuantity > 0
          ? existing.suggestedQuantity
          : 1;
      let itemName = 'Stock forecasting recommended item';
      if (existing.inventoryItemId) {
        const item = await this.db.query.inventoryItems.findFirst({
          where: and(
            eq(inventoryItems.id, existing.inventoryItemId),
            eq(inventoryItems.companyId, actor.companyId),
          ),
        });
        if (item) itemName = `${item.sku} — ${item.name}`;
      }
      try {
        const po = await this.procurementService.createPurchaseOrder(
          { companyId: actor.companyId, userId: actor.userId },
          {
            supplierId: existing.supplierId,
            notes: `Draft from Stock Forecasting recommendation ${existing.id}. Not ordered. Owner PO approval still required to execute.`,
            items: [
              {
                inventoryItemId: existing.inventoryItemId,
                description: itemName,
                quantity,
                unitCostCents: 0,
              },
            ],
            clientActionId: `sf-rec-${existing.id}`,
          },
        );
        draftPurchaseOrderId = po.id;
      } catch (error) {
        if (error instanceof ProcurementError) {
          throw new StockForecastingError(error.code, error.message);
        }
        throw error;
      }
    }

    const [updated] = await this.db
      .update(sfReorderRecommendations)
      .set({
        status: 'accepted',
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        draftPurchaseOrderId,
        autoReorder: false,
        autoPurchase: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sfReorderRecommendations.id, recommendationId),
          eq(sfReorderRecommendations.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, 'sf_recommendation_accepted', updated.id, {
      decision: 'accept',
      draftPurchaseOrderId,
      ordered: false,
      purchaseOrderCreated: Boolean(draftPurchaseOrderId),
      stockMutated: false,
      autoPurchase: false,
    });

    return this.toRecommendation(updated);
  }

  async updateSettings(
    actor: SfActor,
    input: UpdateSfSettingsRequest,
  ): Promise<SfSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const [updated] = await this.db
      .update(sfSettings)
      .set({
        forecastingEnabled: input.forecastingEnabled,
        recommendationsEnabled: input.recommendationsEnabled,
        minIssueEvents:
          input.minIssueEvents != null
            ? Math.min(50, Math.max(1, input.minIssueEvents))
            : undefined,
        windowDays:
          input.windowDays != null ? Math.min(90, Math.max(7, input.windowDays)) : undefined,
        notes: input.notes === undefined ? undefined : input.notes,
        autoReorderEnabled: false,
        autoPurchaseEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(sfSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'sf_settings_updated', updated.id, {
      forecastingEnabled: updated.forecastingEnabled,
      recommendationsEnabled: updated.recommendationsEnabled,
    });

    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: SfActor,
    input: CreateSfAuraInsightRequest,
  ): Promise<SfAuraInsightSummary> {
    this.assertWrite(actor);

    const [created] = await this.db
      .insert(sfAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title.trim(),
        insight: input.insight.trim(),
        href: input.href?.trim() || null,
        sourceForecastId: input.sourceForecastId ?? null,
        sourceRecommendationId: input.sourceRecommendationId ?? null,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'sf_aura_insight_created', created.id, {
      target: input.target,
    });

    return this.toInsight(created);
  }

  async acknowledgeInsight(
    actor: SfActor,
    insightId: string,
    input: AcknowledgeSfInsightRequest,
  ): Promise<SfAuraInsightSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.sfAuraInsights.findFirst({
      where: and(eq(sfAuraInsights.id, insightId), eq(sfAuraInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new StockForecastingError('NOT_FOUND', 'AURA insight not found.');
    }

    const [updated] = await this.db
      .update(sfAuraInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(sfAuraInsights.id, insightId), eq(sfAuraInsights.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, 'sf_aura_insight_acknowledged', updated.id, {
      status: input.status,
    });

    return this.toInsight(updated);
  }
}
