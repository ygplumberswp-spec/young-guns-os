import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  buildPiCostComparison,
  buildPiPurchaseSnapshot,
  buildPiSupplierSnapshot,
  buildPurchaseRecommendationDraft,
  canAccessProcurementIntelligence,
  canApproveProcurementIntelligence,
  canManageProcurementIntelligenceSettings,
  canWriteProcurementIntelligence,
  defaultPiSettings,
  listPiAuraConnections,
  PI_PRODUCT_COPY,
  suggestedReorderQuantity,
  type AcknowledgePiInsightRequest,
  type CreatePiAuraInsightRequest,
  type DecidePiRecommendationRequest,
  type PiAuraInsightSummary,
  type PiCostComparisonLine,
  type PiCostComparisonSummary,
  type PiDashboard,
  type PiPricingRecordSummary,
  type PiPurchaseHistoryRow,
  type PiPurchaseRecommendationSummary,
  type PiSettings,
  type PiSupplierProfileSummary,
  type RefreshPiCostComparisonsRequest,
  type RefreshPiRecommendationsRequest,
  type UpdatePiSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  iiAlertDrafts,
  inventoryItems,
  inventoryStockLevels,
  piAuraInsights,
  piCostComparisons,
  piPurchaseRecommendations,
  piSettings,
  purchaseOrders,
  securityAuditLogs,
  supplierPriceCatalogueItems,
  supplierProducts,
  suppliers,
} from '@titan/db';
import type { ProcurementService } from './procurement.service.js';
import { ProcurementError } from './procurement.service.js';

export class ProcurementIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProcurementIntelligenceError';
  }
}

export type PiActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type ServiceDeps = {
  db: DatabaseClient;
  procurementService: ProcurementService;
};

export class ProcurementIntelligenceService {
  constructor(private readonly deps: ServiceDeps) {}

  private get db() {
    return this.deps.db;
  }

  private assertRead(actor: PiActor): void {
    if (!canAccessProcurementIntelligence(actor)) {
      throw new ProcurementIntelligenceError(
        'FORBIDDEN',
        'Supplier & Procurement Intelligence requires inventory or procurement access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: PiActor): void {
    this.assertRead(actor);
    if (!canWriteProcurementIntelligence(actor)) {
      throw new ProcurementIntelligenceError(
        'FORBIDDEN',
        'Write actions require inventory:write or procurement:write.',
      );
    }
  }

  private assertApprove(actor: PiActor): void {
    this.assertWrite(actor);
    if (!canApproveProcurementIntelligence(actor)) {
      throw new ProcurementIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may approve / accept procurement intelligence recommendations or execute purchase follow-ups.',
      );
    }
  }

  private assertManageSettings(actor: PiActor): void {
    this.assertWrite(actor);
    if (!canManageProcurementIntelligenceSettings(actor)) {
      throw new ProcurementIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may change Procurement Intelligence sensitive settings.',
      );
    }
  }

  private async recordAudit(
    actor: PiActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'procurement_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoPurchase: false,
      },
    });
  }

  private toRecommendation(
    row: typeof piPurchaseRecommendations.$inferSelect,
  ): PiPurchaseRecommendationSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      supplierId: row.supplierId,
      inventoryItemId: row.inventoryItemId,
      suggestedQuantity: row.suggestedQuantity,
      estimatedUnitCostCents: row.estimatedUnitCostCents,
      estimatedTotalCostCents: row.estimatedTotalCostCents,
      sourceInventoryAlertId: row.sourceInventoryAlertId,
      draftPurchaseOrderId: row.draftPurchaseOrderId,
      autoPurchase: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toCostComparison(row: typeof piCostComparisons.$inferSelect): PiCostComparisonSummary {
    const lines = Array.isArray(row.lines) ? (row.lines as PiCostComparisonLine[]) : [];
    return {
      id: row.id,
      title: row.title,
      productKey: row.productKey,
      inventoryItemId: row.inventoryItemId,
      availability: row.availability === 'available' ? 'available' : 'unavailable',
      lowestUnitCostCents: row.lowestUnitCostCents,
      highestUnitCostCents: row.highestUnitCostCents,
      savingsOpportunityCents: row.savingsOpportunityCents,
      lineCount: row.lineCount,
      lines,
      rationale: row.rationale,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toInsight(row: typeof piAuraInsights.$inferSelect): PiAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceRecommendationId: row.sourceRecommendationId,
      sourceCostComparisonId: row.sourceCostComparisonId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSettings(row: typeof piSettings.$inferSelect): PiSettings {
    return defaultPiSettings({
      id: row.id,
      recommendationsEnabled: row.recommendationsEnabled,
      costComparisonsEnabled: row.costComparisonsEnabled,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async ensureSettings(actor: PiActor): Promise<PiSettings> {
    const existing = await this.db.query.piSettings.findFirst({
      where: eq(piSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(piSettings)
      .values({
        companyId: actor.companyId,
        autoPurchaseEnabled: false,
        recommendationsEnabled: true,
        costComparisonsEnabled: true,
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private async loadSupplierProfiles(companyId: string): Promise<PiSupplierProfileSummary[]> {
    const rows = await this.db.query.suppliers.findMany({
      where: eq(suppliers.companyId, companyId),
      with: { products: true, purchaseOrders: true },
      orderBy: [desc(suppliers.updatedAt)],
      limit: 100,
    });

    const catalogue = await this.db.query.supplierPriceCatalogueItems.findMany({
      where: and(
        eq(supplierPriceCatalogueItems.companyId, companyId),
        eq(supplierPriceCatalogueItems.isActive, true),
      ),
    });

    const catalogueBySupplier = new Map<string, number>();
    for (const item of catalogue) {
      if (!item.supplierId) continue;
      catalogueBySupplier.set(item.supplierId, (catalogueBySupplier.get(item.supplierId) ?? 0) + 1);
    }

    return rows.map((row) => {
      const pos = row.purchaseOrders ?? [];
      const completed = pos.filter((p) => p.status === 'completed');
      const totalSpendCents = completed.reduce((sum, p) => sum + (p.totalCostCents ?? 0), 0);
      const lastOrder = [...pos].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0];
      return {
        supplierId: row.id,
        name: row.name,
        status: row.status,
        contactName: row.contactName,
        email: row.email,
        phone: row.phone,
        productCount: row.products?.length ?? 0,
        purchaseOrderCount: pos.length,
        completedOrderCount: completed.length,
        pendingApprovalCount: pos.filter((p) => p.status === 'pending_approval').length,
        totalSpendCents,
        lastOrderAt: lastOrder?.createdAt.toISOString() ?? null,
        pricingRecordCount: row.products?.length ?? 0,
        cataloguePriceCount: catalogueBySupplier.get(row.id) ?? 0,
      };
    });
  }

  private async loadPurchaseHistory(companyId: string): Promise<PiPurchaseHistoryRow[]> {
    const rows = await this.db.query.purchaseOrders.findMany({
      where: eq(purchaseOrders.companyId, companyId),
      with: { supplier: true, items: true },
      orderBy: [desc(purchaseOrders.createdAt)],
      limit: 50,
    });

    return rows.map((row) => ({
      purchaseOrderId: row.id,
      referenceNumber: row.referenceNumber,
      supplierId: row.supplierId,
      supplierName: row.supplier?.name ?? 'Unknown supplier',
      status: row.status,
      totalCostCents: row.totalCostCents,
      itemCount: row.items?.length ?? 0,
      orderedAt: row.orderedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async loadPricingRecords(companyId: string): Promise<PiPricingRecordSummary[]> {
    const [products, catalogue] = await Promise.all([
      this.db.query.supplierProducts.findMany({
        where: eq(supplierProducts.companyId, companyId),
        with: { supplier: true },
        orderBy: [desc(supplierProducts.updatedAt)],
        limit: 100,
      }),
      this.db.query.supplierPriceCatalogueItems.findMany({
        where: and(
          eq(supplierPriceCatalogueItems.companyId, companyId),
          eq(supplierPriceCatalogueItems.isActive, true),
        ),
        orderBy: [desc(supplierPriceCatalogueItems.updatedAt)],
        limit: 100,
      }),
    ]);

    const supplierIds = [
      ...new Set(catalogue.map((c) => c.supplierId).filter((id): id is string => Boolean(id))),
    ];
    const supplierRows =
      supplierIds.length === 0
        ? []
        : await this.db.query.suppliers.findMany({
            where: and(eq(suppliers.companyId, companyId), inArray(suppliers.id, supplierIds)),
          });
    const supplierNameById = new Map(supplierRows.map((s) => [s.id, s.name]));

    const productRows: PiPricingRecordSummary[] = products.map((p) => ({
      id: p.id,
      source: 'supplier_product',
      supplierId: p.supplierId,
      supplierName: p.supplier?.name ?? null,
      productName: p.productName,
      supplierSku: p.supplierSku,
      inventoryItemId: p.inventoryItemId,
      unitCostCents: p.unitCostCents,
      leadTimeDays: p.leadTimeDays,
      isActive: true,
      updatedAt: p.updatedAt.toISOString(),
    }));

    const catalogueRows: PiPricingRecordSummary[] = catalogue.map((c) => ({
      id: c.id,
      source: 'price_catalogue',
      supplierId: c.supplierId,
      supplierName: c.supplierId ? (supplierNameById.get(c.supplierId) ?? null) : null,
      productName: c.description,
      supplierSku: c.canonicalCode,
      inventoryItemId: null,
      unitCostCents: c.unitCostCents,
      leadTimeDays: null,
      isActive: c.isActive,
      updatedAt: c.updatedAt.toISOString(),
    }));

    return [...productRows, ...catalogueRows]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 100);
  }

  async getDashboard(actor: PiActor): Promise<PiDashboard> {
    this.assertRead(actor);
    const settings = await this.ensureSettings(actor);

    const [
      supplierProfiles,
      purchaseHistory,
      pricingRecords,
      comparisons,
      recommendations,
      insights,
      inventoryAlerts,
    ] = await Promise.all([
      this.loadSupplierProfiles(actor.companyId),
      this.loadPurchaseHistory(actor.companyId),
      this.loadPricingRecords(actor.companyId),
      this.db.query.piCostComparisons.findMany({
        where: eq(piCostComparisons.companyId, actor.companyId),
        orderBy: [desc(piCostComparisons.createdAt)],
        limit: 50,
      }),
      this.db.query.piPurchaseRecommendations.findMany({
        where: eq(piPurchaseRecommendations.companyId, actor.companyId),
        orderBy: [desc(piPurchaseRecommendations.createdAt)],
        limit: 50,
      }),
      this.db.query.piAuraInsights.findMany({
        where: eq(piAuraInsights.companyId, actor.companyId),
        orderBy: [desc(piAuraInsights.createdAt)],
        limit: 50,
      }),
      this.db.query.iiAlertDrafts.findMany({
        where: eq(iiAlertDrafts.companyId, actor.companyId),
        orderBy: [desc(iiAlertDrafts.createdAt)],
        limit: 50,
      }),
    ]);

    const activeSupplierCount = supplierProfiles.filter((s) => s.status === 'active').length;
    const pendingApprovalCount = purchaseHistory.filter((p) => p.status === 'pending_approval')
      .length;
    const openOrderCount = purchaseHistory.filter((p) =>
      ['approved', 'ordered', 'received'].includes(p.status),
    ).length;
    const completedOrderCount = purchaseHistory.filter((p) => p.status === 'completed').length;
    const totalSpendCents = purchaseHistory
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + p.totalCostCents, 0);

    const suppliersSnap = buildPiSupplierSnapshot({
      supplierCount: supplierProfiles.length,
      activeSupplierCount,
      pricingRecordCount: pricingRecords.length,
    });
    const purchasesSnap = buildPiPurchaseSnapshot({
      purchaseOrderCount: purchaseHistory.length,
      pendingApprovalCount,
      openOrderCount,
      completedOrderCount,
      totalSpendCents,
    });

    const recommendationSummaries = recommendations.map((r) => this.toRecommendation(r));
    const pendingApprovals = recommendationSummaries.filter(
      (r) => r.status === 'draft' || r.status === 'pending_approval',
    ).length;

    let summary: string;
    if (suppliersSnap.availability === 'unavailable' && purchasesSnap.availability === 'unavailable') {
      summary =
        'Supplier & Procurement Intelligence is ready. No real suppliers or purchase orders yet — profiles, history, and prices stay unavailable (not invented).';
    } else {
      summary = `Real procurement signals: ${suppliersSnap.supplierCount} supplier(s), ${purchasesSnap.purchaseOrderCount} PO(s), ${pricingRecords.length} pricing record(s). Recommendation drafts never auto-purchase.`;
    }

    return {
      summary,
      productClarification: { ...PI_PRODUCT_COPY },
      policy: {
        autoPurchaseEnabled: false,
        requiresOwnerApproval: true,
        fakeSuppliers: false,
        fakePrices: false,
      },
      suppliers: suppliersSnap,
      purchases: purchasesSnap,
      supplierProfiles,
      purchaseHistory,
      pricingRecords,
      costComparisons: comparisons.map((c) => this.toCostComparison(c)),
      recommendations: recommendationSummaries,
      auraInsights: insights.map((i) => this.toInsight(i)),
      auraConnections: listPiAuraConnections(),
      settings,
      pendingApprovals,
      inventoryAlertLinkCount: inventoryAlerts.length,
    };
  }

  async refreshCostComparisons(
    actor: PiActor,
    input: RefreshPiCostComparisonsRequest = {},
  ): Promise<{ created: number; comparisons: PiCostComparisonSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.costComparisonsEnabled) {
      throw new ProcurementIntelligenceError(
        'INVALID_STATE',
        'Cost comparisons are disabled in Procurement Intelligence settings.',
      );
    }

    const pricing = await this.loadPricingRecords(actor.companyId);
    const groups = new Map<string, PiCostComparisonLine[]>();

    for (const row of pricing) {
      const key = (input.productKey?.trim() || row.productName || row.supplierSku || 'item')
        .toLowerCase()
        .slice(0, 120);
      if (input.productKey && !key.includes(input.productKey.trim().toLowerCase())) {
        continue;
      }
      if (!row.supplierId) continue;
      const list = groups.get(key) ?? [];
      list.push({
        supplierId: row.supplierId,
        supplierName: row.supplierName ?? 'Unknown supplier',
        unitCostCents: row.unitCostCents,
        source: row.source,
        productName: row.productName,
        leadTimeDays: row.leadTimeDays,
      });
      groups.set(key, list);
    }

    const created: PiCostComparisonSummary[] = [];
    for (const [productKey, lines] of groups) {
      const built = buildPiCostComparison({ productKey, lines });
      const [row] = await this.db
        .insert(piCostComparisons)
        .values({
          companyId: actor.companyId,
          title: built.title,
          productKey: built.productKey,
          inventoryItemId: built.inventoryItemId,
          availability: built.availability,
          lowestUnitCostCents: built.lowestUnitCostCents,
          highestUnitCostCents: built.highestUnitCostCents,
          savingsOpportunityCents: built.savingsOpportunityCents,
          lineCount: built.lineCount,
          lines: built.lines,
          rationale: built.rationale,
          createdByUserId: actor.userId,
        })
        .returning();
      created.push(this.toCostComparison(row));
    }

    await this.recordAudit(actor, 'pi_cost_comparisons_refreshed', actor.companyId, {
      created: created.length,
      productKeyFilter: input.productKey ?? null,
    });

    return { created: created.length, comparisons: created };
  }

  async refreshRecommendations(
    actor: PiActor,
    input: RefreshPiRecommendationsRequest = {},
  ): Promise<{ created: number; recommendations: PiPurchaseRecommendationSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.recommendationsEnabled) {
      throw new ProcurementIntelligenceError(
        'INVALID_STATE',
        'Purchase recommendations are disabled in Procurement Intelligence settings.',
      );
    }

    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const created: PiPurchaseRecommendationSummary[] = [];

    const items = await this.db.query.inventoryItems.findMany({
      where: eq(inventoryItems.companyId, actor.companyId),
      limit: 200,
    });
    const levels = await this.db.query.inventoryStockLevels.findMany({
      where: eq(inventoryStockLevels.companyId, actor.companyId),
    });
    const qtyByItem = new Map<string, number>();
    for (const level of levels) {
      qtyByItem.set(level.itemId, (qtyByItem.get(level.itemId) ?? 0) + level.quantityOnHand);
    }

    const products = await this.db.query.supplierProducts.findMany({
      where: eq(supplierProducts.companyId, actor.companyId),
      with: { supplier: true },
    });

    const alerts = await this.db.query.iiAlertDrafts.findMany({
      where: and(
        eq(iiAlertDrafts.companyId, actor.companyId),
        inArray(iiAlertDrafts.status, ['draft', 'pending_approval', 'approved']),
      ),
      orderBy: [desc(iiAlertDrafts.createdAt)],
      limit: 50,
    });

    for (const item of items) {
      if (item.status !== 'active' || item.reorderLevel <= 0) continue;
      const onHand = qtyByItem.get(item.id) ?? 0;
      if (onHand > item.reorderLevel) continue;

      const linked = products.find((p) => p.inventoryItemId === item.id);
      const qty = suggestedReorderQuantity({
        quantityOnHand: onHand,
        reorderLevel: item.reorderLevel,
      });
      const unitCost = linked?.unitCostCents ?? null;
      const draft = buildPurchaseRecommendationDraft({
        kind: 'reorder_follow_up',
        sku: item.sku,
        name: item.name,
        supplierName: linked?.supplier?.name ?? null,
        quantityOnHand: onHand,
        reorderLevel: item.reorderLevel,
        suggestedQuantity: qty,
        unitCostCents: unitCost,
      });

      const sourceAlert =
        alerts.find((a) => a.inventoryItemId === item.id) ??
        alerts.find((a) => a.kind === 'below_reorder' || a.kind === 'zero_stock' || a.kind === 'shortage');

      const [row] = await this.db
        .insert(piPurchaseRecommendations)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status,
          title: draft.title,
          body: draft.body,
          supplierId: linked?.supplierId ?? null,
          inventoryItemId: item.id,
          suggestedQuantity: qty,
          estimatedUnitCostCents: unitCost,
          estimatedTotalCostCents:
            unitCost != null && qty != null ? unitCost * qty : null,
          sourceInventoryAlertId: sourceAlert?.id ?? null,
          autoPurchase: false,
          createdByUserId: actor.userId,
        })
        .returning();
      created.push(this.toRecommendation(row));
    }

    // Cost-saving drafts from multi-supplier pricing (real rows only)
    const pricing = await this.loadPricingRecords(actor.companyId);
    const byName = new Map<string, typeof pricing>();
    for (const row of pricing) {
      const key = row.productName.toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(row);
      byName.set(key, list);
    }
    for (const [, rows] of byName) {
      const supplierIds = new Set(rows.map((r) => r.supplierId).filter(Boolean));
      if (supplierIds.size < 2) continue;
      const sorted = [...rows].sort((a, b) => a.unitCostCents - b.unitCostCents);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (!best || !worst || best.unitCostCents >= worst.unitCostCents) continue;
      const draft = buildPurchaseRecommendationDraft({
        kind: 'cost_saving',
        name: best.productName,
        supplierName: best.supplierName,
        unitCostCents: best.unitCostCents,
      });
      const [row] = await this.db
        .insert(piPurchaseRecommendations)
        .values({
          companyId: actor.companyId,
          kind: 'cost_saving',
          status,
          title: draft.title,
          body: draft.body,
          supplierId: best.supplierId,
          inventoryItemId: best.inventoryItemId,
          estimatedUnitCostCents: best.unitCostCents,
          autoPurchase: false,
          createdByUserId: actor.userId,
          metadata: {
            highestUnitCostCents: worst.unitCostCents,
            savingsOpportunityCents: worst.unitCostCents - best.unitCostCents,
          },
        })
        .returning();
      created.push(this.toRecommendation(row));
    }

    await this.recordAudit(actor, 'pi_recommendations_refreshed', actor.companyId, {
      created: created.length,
      submitForApproval: Boolean(input.submitForApproval),
      autoPurchase: false,
    });

    return { created: created.length, recommendations: created };
  }

  async decideRecommendation(
    actor: PiActor,
    recommendationId: string,
    input: DecidePiRecommendationRequest,
  ): Promise<PiPurchaseRecommendationSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.piPurchaseRecommendations.findFirst({
      where: and(
        eq(piPurchaseRecommendations.id, recommendationId),
        eq(piPurchaseRecommendations.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new ProcurementIntelligenceError('NOT_FOUND', 'Purchase recommendation not found');
    }

    if (input.decision === 'reject') {
      this.assertApprove(actor);
      const [updated] = await this.db
        .update(piPurchaseRecommendations)
        .set({
          status: 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNotes: input.notes ?? null,
          autoPurchase: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(piPurchaseRecommendations.id, recommendationId),
            eq(piPurchaseRecommendations.companyId, actor.companyId),
          ),
        )
        .returning();
      await this.recordAudit(actor, 'pi_recommendation_rejected', recommendationId, {
        decision: 'reject',
      });
      return this.toRecommendation(updated);
    }

    if (input.decision === 'approve') {
      this.assertApprove(actor);
      if (!['draft', 'pending_approval'].includes(existing.status)) {
        throw new ProcurementIntelligenceError(
          'INVALID_STATE',
          `Cannot approve recommendation in status ${existing.status}`,
        );
      }
      const [updated] = await this.db
        .update(piPurchaseRecommendations)
        .set({
          status: 'approved',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNotes: input.notes ?? null,
          autoPurchase: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(piPurchaseRecommendations.id, recommendationId),
            eq(piPurchaseRecommendations.companyId, actor.companyId),
          ),
        )
        .returning();
      await this.recordAudit(actor, 'pi_recommendation_approved', recommendationId, {
        decision: 'approve',
        purchaseOrderCreated: false,
      });
      return this.toRecommendation(updated);
    }

    // accept — Owner only; optionally create draft PO (never ordered)
    this.assertApprove(actor);
    if (!['draft', 'pending_approval', 'approved'].includes(existing.status)) {
      throw new ProcurementIntelligenceError(
        'INVALID_STATE',
        `Cannot accept recommendation in status ${existing.status}`,
      );
    }

    let draftPurchaseOrderId = existing.draftPurchaseOrderId;
    if (input.createDraftPurchaseOrder) {
      if (!existing.supplierId) {
        throw new ProcurementIntelligenceError(
          'INVALID_STATE',
          'Cannot create a draft purchase order without a linked real supplier on the recommendation.',
        );
      }
      const quantity = existing.suggestedQuantity && existing.suggestedQuantity > 0
        ? existing.suggestedQuantity
        : 1;
      const unitCost = existing.estimatedUnitCostCents ?? 0;
      let itemName = 'Recommended purchase item';
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
        const po = await this.deps.procurementService.createPurchaseOrder(
          { companyId: actor.companyId, userId: actor.userId },
          {
            supplierId: existing.supplierId,
            notes: `Draft from Procurement Intelligence recommendation ${existing.id}. Not ordered. Owner PO approval still required to execute.`,
            items: [
              {
                inventoryItemId: existing.inventoryItemId,
                description: itemName,
                quantity,
                unitCostCents: unitCost,
              },
            ],
            clientActionId: `pi-rec-${existing.id}`,
          },
        );
        draftPurchaseOrderId = po.id;
      } catch (error) {
        if (error instanceof ProcurementError) {
          throw new ProcurementIntelligenceError(error.code, error.message);
        }
        throw error;
      }
    }

    const [updated] = await this.db
      .update(piPurchaseRecommendations)
      .set({
        status: 'accepted',
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        draftPurchaseOrderId,
        autoPurchase: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(piPurchaseRecommendations.id, recommendationId),
          eq(piPurchaseRecommendations.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, 'pi_recommendation_accepted', recommendationId, {
      decision: 'accept',
      draftPurchaseOrderId,
      ordered: false,
      autoPurchase: false,
    });

    return this.toRecommendation(updated);
  }

  async updateSettings(actor: PiActor, input: UpdatePiSettingsRequest): Promise<PiSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const [updated] = await this.db
      .update(piSettings)
      .set({
        recommendationsEnabled: input.recommendationsEnabled,
        costComparisonsEnabled: input.costComparisonsEnabled,
        notes: input.notes === undefined ? undefined : input.notes,
        autoPurchaseEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(piSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'pi_settings_updated', updated.id, {
      recommendationsEnabled: updated.recommendationsEnabled,
      costComparisonsEnabled: updated.costComparisonsEnabled,
      autoPurchaseEnabled: false,
    });

    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: PiActor,
    input: CreatePiAuraInsightRequest,
  ): Promise<PiAuraInsightSummary> {
    this.assertWrite(actor);

    if (input.sourceRecommendationId) {
      const rec = await this.db.query.piPurchaseRecommendations.findFirst({
        where: and(
          eq(piPurchaseRecommendations.id, input.sourceRecommendationId),
          eq(piPurchaseRecommendations.companyId, actor.companyId),
        ),
      });
      if (!rec) {
        throw new ProcurementIntelligenceError('NOT_FOUND', 'Source recommendation not found');
      }
    }
    if (input.sourceCostComparisonId) {
      const cmp = await this.db.query.piCostComparisons.findFirst({
        where: and(
          eq(piCostComparisons.id, input.sourceCostComparisonId),
          eq(piCostComparisons.companyId, actor.companyId),
        ),
      });
      if (!cmp) {
        throw new ProcurementIntelligenceError('NOT_FOUND', 'Source cost comparison not found');
      }
    }

    const [row] = await this.db
      .insert(piAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title.trim(),
        insight: input.insight.trim(),
        href: input.href?.trim() || null,
        sourceRecommendationId: input.sourceRecommendationId ?? null,
        sourceCostComparisonId: input.sourceCostComparisonId ?? null,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'pi_aura_insight_created', row.id, {
      target: row.target,
    });

    return this.toInsight(row);
  }

  async acknowledgeInsight(
    actor: PiActor,
    insightId: string,
    input: AcknowledgePiInsightRequest,
  ): Promise<PiAuraInsightSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.piAuraInsights.findFirst({
      where: and(eq(piAuraInsights.id, insightId), eq(piAuraInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new ProcurementIntelligenceError('NOT_FOUND', 'AURA insight not found');
    }

    const [updated] = await this.db
      .update(piAuraInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(eq(piAuraInsights.id, insightId), eq(piAuraInsights.companyId, actor.companyId)),
      )
      .returning();

    await this.recordAudit(actor, 'pi_aura_insight_acknowledged', insightId, {
      status: input.status,
    });

    return this.toInsight(updated);
  }
}
