import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  companyPricebookRuleSets,
  inventoryItems,
  quoteLineItems,
  quoteLinePriceOverrides,
  quotes,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  QuotePriceOverrideError,
  assertOverrideExecutable,
  assertRow92UnchangedByOverride,
  assertCataloguePriceUnchangedByOverride,
  assertSourceCostUnchangedByOverride,
  buildQuotePriceOverrideAuditEvent,
  buildQuotePriceOverridePreview,
  canApproveQuotePriceOverride,
  canProposeQuotePriceOverride,
  pricingConfigFromQuoteRow,
  parseRuleTiers,
  resolvePricebookSellPrice,
  type PricebookBaseCostType,
  type PricebookRuleStatus,
  type QuotePriceOverrideBaselineSource,
  type QuotePriceOverrideRecord,
  type QuotePriceOverrideStatus,
  type QuoteStatus,
} from '@titan/shared';
import type { FinanceService } from './finance.service.js';
import { FinanceError } from './finance.service.js';

export class QuotePriceOverrideServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'QuotePriceOverrideServiceError';
  }
}

export type QuotePriceOverrideActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

function mapSharedError(error: unknown): never {
  if (error instanceof QuotePriceOverrideError) {
    const status =
      error.code === 'PRICE_OVERRIDE_FORBIDDEN' || error.code === 'PRICE_OVERRIDE_CROSS_TENANT'
        ? 403
        : error.code === 'PRICE_OVERRIDE_NOT_FOUND'
          ? 404
          : 400;
    throw new QuotePriceOverrideServiceError(error.code, error.message, status);
  }
  throw error;
}

function rowToRecord(row: typeof quoteLinePriceOverrides.$inferSelect): QuotePriceOverrideRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    quoteId: row.quoteId,
    status: row.status as QuotePriceOverrideStatus,
    reason: row.reason,
    previewHash: row.previewHash,
    quoteUpdatedAt:
      row.quoteUpdatedAt instanceof Date
        ? row.quoteUpdatedAt.toISOString()
        : String(row.quoteUpdatedAt),
    lineIds: (row.lineIds as string[]) ?? [],
    baselineSnapshot: (row.baselineSnapshot as QuotePriceOverrideRecord['baselineSnapshot']) ?? [],
    proposedSellByLineId: (row.proposedSellByLineId as Record<string, number>) ?? {},
    beforeTotalCents: row.beforeTotalCents,
    afterTotalCents: row.afterTotalCents,
    priceRuleSetId: row.priceRuleSetId ?? null,
    priceRuleVersion: row.priceRuleVersion ?? null,
    proposedBy: row.proposedBy ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt?.toISOString?.() ?? null,
    executedAt: row.executedAt?.toISOString?.() ?? null,
    executedBy: row.executedBy ?? null,
    rejectedBy: row.rejectedBy ?? null,
    rejectedAt: row.rejectedAt?.toISOString?.() ?? null,
    cancelReason: row.cancelReason ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? null,
  };
}

export class QuotePriceOverrideService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly financeService: FinanceService,
  ) {}

  private assertPropose(actor: QuotePriceOverrideActor) {
    if (!canProposeQuotePriceOverride(actor)) {
      throw new QuotePriceOverrideServiceError(
        'PRICE_OVERRIDE_FORBIDDEN',
        'Not permitted to propose quote price overrides',
        403,
      );
    }
  }

  private assertApprove(actor: QuotePriceOverrideActor) {
    if (!canApproveQuotePriceOverride(actor)) {
      throw new QuotePriceOverrideServiceError(
        'PRICE_OVERRIDE_FORBIDDEN',
        'Only Owner may approve quote price overrides',
        403,
      );
    }
  }

  private async audit(
    actor: QuotePriceOverrideActor,
    eventType: Parameters<typeof buildQuotePriceOverrideAuditEvent>[0]['eventType'],
    record: QuotePriceOverrideRecord,
    extra?: Record<string, unknown>,
  ) {
    const event = buildQuotePriceOverrideAuditEvent({
      eventType,
      companyId: actor.companyId,
      quoteId: record.quoteId,
      overrideId: record.id,
      actorId: actor.userId ?? null,
      lineIds: record.lineIds,
      baselineTotalCents: record.beforeTotalCents,
      overrideTotalCents: record.afterTotalCents,
      reason: record.reason,
      previewHash: record.previewHash,
      metadata: extra,
    });
    await this.db.insert(securityAuditLogs).values({
      companyId: event.companyId,
      category: 'financial',
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      userId: actor.userId ?? null,
      metadata: event.metadata,
    });
  }

  private async loadQuoteBundle(companyId: string, quoteId: string) {
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)),
    });
    if (!quote) {
      throw new QuotePriceOverrideServiceError('PRICE_OVERRIDE_NOT_FOUND', 'Quote not found', 404);
    }
    const lines = await this.db
      .select()
      .from(quoteLineItems)
      .where(and(eq(quoteLineItems.quoteId, quoteId), eq(quoteLineItems.companyId, companyId)))
      .orderBy(quoteLineItems.position);
    return { quote, lines };
  }

  private async latestRow92(companyId: string) {
    const rows = await this.db
      .select()
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    return rows[0] ?? null;
  }

  async listForQuote(actor: QuotePriceOverrideActor, quoteId: string) {
    this.assertPropose(actor);
    const rows = await this.db
      .select()
      .from(quoteLinePriceOverrides)
      .where(
        and(
          eq(quoteLinePriceOverrides.companyId, actor.companyId),
          eq(quoteLinePriceOverrides.quoteId, quoteId),
        ),
      )
      .orderBy(desc(quoteLinePriceOverrides.createdAt));
    return { overrides: rows.map(rowToRecord) };
  }

  async preview(
    actor: QuotePriceOverrideActor,
    input: {
      quoteId: string;
      reason: string;
      lines: Array<{
        lineId: string;
        targetSellPriceCents?: number | null;
        targetMultiplier?: number | null;
      }>;
    },
  ) {
    this.assertPropose(actor);
    try {
      const { quote, lines } = await this.loadQuoteBundle(actor.companyId, input.quoteId);
      const selectedIds = new Set(input.lines.map((l) => l.lineId));
      const selected = lines.filter((l) => selectedIds.has(l.id));
      if (selected.length !== input.lines.length) {
        throw new QuotePriceOverrideServiceError(
          'PRICE_OVERRIDE_NO_LINES',
          'One or more selected lines were not found on this quote',
          400,
        );
      }

      const rule = await this.latestRow92(actor.companyId);
      const row92Comparison: Record<string, number | null> = {};
      for (const line of selected) {
        if (rule && line.unitCostCents > 0 && rule.baseCostType !== 'UNKNOWN') {
          const resolved = resolvePricebookSellPrice({
            baseCostCents: line.unitCostCents,
            ruleSet: {
              id: rule.id,
              companyId: rule.companyId,
              name: rule.name,
              version: rule.version,
              status: rule.status as PricebookRuleStatus,
              baseCostType: rule.baseCostType as PricebookBaseCostType,
              currency: rule.currency,
              tiers: parseRuleTiers(rule.tiers),
              globalAutomationEnabled: false,
            },
            costProvenance: {
              source: 'quote_line.unit_cost_cents',
              isDiscountedNet: true,
              alreadyDiscounted: true,
            },
          });
          row92Comparison[line.id] = resolved.ok ? resolved.sellPriceExVatCents : null;
        } else {
          row92Comparison[line.id] = null;
        }
      }

      const targets = new Map(input.lines.map((l) => [l.lineId, l]));
      const preview = buildQuotePriceOverridePreview({
        companyId: actor.companyId,
        quoteId: quote.id,
        quoteStatus: quote.status as QuoteStatus,
        quoteIsImmutable: quote.isImmutable,
        quoteUpdatedAt: quote.updatedAt,
        xeroQuoteId: quote.xeroQuoteId,
        issuedAt: quote.issuedAt,
        reason: input.reason,
        pricingConfig: pricingConfigFromQuoteRow(quote),
        discountCents: quote.discountCents,
        defaultVatRateBps: 1500,
        priceRuleSetId: rule?.id ?? null,
        priceRuleVersion: rule?.version ?? null,
        row92ComparisonSellCentsByLineId: row92Comparison,
        allQuoteLines: lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          unitCostCents: l.unitCostCents,
          category: l.category,
          vatRateBps: l.vatRateBps,
          customerVisible: l.customerVisible,
          catalogueItemId: l.catalogueItemId,
          ygpCode: l.ygpCode,
          catalogueCategory: l.catalogueCategory,
        })),
        lines: selected.map((l) => {
          const t = targets.get(l.id)!;
          return {
            lineId: l.id,
            baselineSellPriceCents: l.unitPriceCents,
            baselineSource: 'QUOTE_LINE_SELL' as QuotePriceOverrideBaselineSource,
            catalogueItemId: l.catalogueItemId,
            quantity: l.quantity,
            description: l.description,
            category: l.category,
            vatRateBps: l.vatRateBps,
            unitCostCents: l.unitCostCents,
            customerVisible: l.customerVisible,
            targetSellPriceCents: t.targetSellPriceCents,
            targetMultiplier: t.targetMultiplier,
          };
        }),
      });
      return {
        preview,
        warnings: preview.hasBelowKnownCostWarning
          ? ['OVERRIDE_BELOW_KNOWN_COST']
          : ([] as string[]),
        row92Status: rule?.status ?? null,
        row92AutomationEnabled: false,
      };
    } catch (error) {
      mapSharedError(error);
    }
  }

  async propose(
    actor: QuotePriceOverrideActor,
    input: {
      quoteId: string;
      reason: string;
      lines: Array<{
        lineId: string;
        targetSellPriceCents?: number | null;
        targetMultiplier?: number | null;
      }>;
    },
  ) {
    const { preview, warnings } = await this.preview(actor, input);
    const [inserted] = await this.db
      .insert(quoteLinePriceOverrides)
      .values({
        companyId: actor.companyId,
        quoteId: input.quoteId,
        status: 'DRAFT_PROPOSAL',
        reason: preview.reason,
        previewHash: preview.previewHash,
        quoteUpdatedAt: new Date(preview.quoteUpdatedAt),
        lineIds: preview.lines.map((l) => l.lineId),
        baselineSnapshot: preview.lines,
        proposedSellByLineId: Object.fromEntries(
          preview.lines.map((l) => [l.lineId, l.overrideSellPriceCents]),
        ),
        beforeTotalCents: preview.beforeTotalCents,
        afterTotalCents: preview.afterTotalCents,
        priceRuleSetId: preview.priceRuleSetId,
        priceRuleVersion: preview.priceRuleVersion,
        proposedBy: actor.userId ?? null,
      })
      .returning();

    const record = rowToRecord(inserted!);
    await this.audit(actor, 'price_override_proposed', record, { warnings });
    return { override: record, preview, warnings };
  }

  async approve(actor: QuotePriceOverrideActor, overrideId: string) {
    this.assertApprove(actor);
    const row = await this.db.query.quoteLinePriceOverrides.findFirst({
      where: and(
        eq(quoteLinePriceOverrides.id, overrideId),
        eq(quoteLinePriceOverrides.companyId, actor.companyId),
      ),
    });
    if (!row) {
      throw new QuotePriceOverrideServiceError('PRICE_OVERRIDE_NOT_FOUND', 'Override not found', 404);
    }
    const { quote } = await this.loadQuoteBundle(actor.companyId, row.quoteId);
    if (quote.updatedAt.toISOString() !== row.quoteUpdatedAt.toISOString()) {
      await this.db
        .update(quoteLinePriceOverrides)
        .set({ status: 'STALE', updatedAt: new Date() })
        .where(eq(quoteLinePriceOverrides.id, row.id));
      throw new QuotePriceOverrideServiceError(
        'PRICE_OVERRIDE_STALE_APPROVAL',
        'Quote changed after proposal — re-propose required',
        409,
      );
    }
    if (row.status !== 'DRAFT_PROPOSAL') {
      throw new QuotePriceOverrideServiceError(
        'PRICE_OVERRIDE_INVALID_STATUS',
        `Cannot approve override in status ${row.status}`,
        400,
      );
    }
    const [updated] = await this.db
      .update(quoteLinePriceOverrides)
      .set({
        status: 'OWNER_APPROVED',
        approvedBy: actor.userId ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(quoteLinePriceOverrides.id, overrideId),
          eq(quoteLinePriceOverrides.companyId, actor.companyId),
          eq(quoteLinePriceOverrides.status, 'DRAFT_PROPOSAL'),
        ),
      )
      .returning();
    if (!updated) {
      throw new QuotePriceOverrideServiceError(
        'PRICE_OVERRIDE_INVALID_STATUS',
        'Override was not in DRAFT_PROPOSAL state',
        409,
      );
    }
    const record = rowToRecord(updated);
    await this.audit(actor, 'price_override_approved', record);
    return { override: record };
  }

  async reject(actor: QuotePriceOverrideActor, overrideId: string) {
    this.assertApprove(actor);
    const [updated] = await this.db
      .update(quoteLinePriceOverrides)
      .set({
        status: 'REJECTED',
        rejectedBy: actor.userId ?? null,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(quoteLinePriceOverrides.id, overrideId),
          eq(quoteLinePriceOverrides.companyId, actor.companyId),
          inArray(quoteLinePriceOverrides.status, ['DRAFT_PROPOSAL', 'OWNER_APPROVED']),
        ),
      )
      .returning();
    if (!updated) {
      throw new QuotePriceOverrideServiceError(
        'PRICE_OVERRIDE_INVALID_STATUS',
        'Override cannot be rejected in its current status',
        400,
      );
    }
    const record = rowToRecord(updated);
    await this.audit(actor, 'price_override_rejected', record);
    return { override: record };
  }

  async execute(actor: QuotePriceOverrideActor, overrideId: string) {
    this.assertApprove(actor);
    const row = await this.db.query.quoteLinePriceOverrides.findFirst({
      where: and(
        eq(quoteLinePriceOverrides.id, overrideId),
        eq(quoteLinePriceOverrides.companyId, actor.companyId),
      ),
    });
    if (!row) {
      throw new QuotePriceOverrideServiceError('PRICE_OVERRIDE_NOT_FOUND', 'Override not found', 404);
    }
    const record = rowToRecord(row);
    const { quote, lines } = await this.loadQuoteBundle(actor.companyId, row.quoteId);

    // Capture catalogue/cost before for mutation guards (selected catalogue items only).
    const catalogueIds = lines
      .map((l) => l.catalogueItemId)
      .filter((id): id is string => Boolean(id));
    const catalogueBefore =
      catalogueIds.length > 0
        ? await this.db
            .select({
              id: inventoryItems.id,
              sell: inventoryItems.sellPriceCents,
              cost: inventoryItems.unitCostCents,
            })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.companyId, actor.companyId),
                inArray(inventoryItems.id, catalogueIds),
              ),
            )
        : [];
    const ruleBefore = await this.latestRow92(actor.companyId);

    try {
      const gate = assertOverrideExecutable({
        record,
        quoteId: quote.id,
        companyId: actor.companyId,
        currentQuoteUpdatedAt: quote.updatedAt,
        expectedPreviewHash: record.previewHash,
      });
      if (!gate.ok) {
        // Idempotent success
        await this.audit(actor, 'price_override_executed', record, { idempotent: true });
        return {
          override: record,
          idempotent: true as const,
          quoteTotalCents: quote.totalCents,
        };
      }
    } catch (error) {
      if (error instanceof QuotePriceOverrideError) {
        await this.audit(actor, 'price_override_execution_blocked', record, {
          code: error.code,
          message: error.message,
        });
      }
      mapSharedError(error);
    }

    const proposed = record.proposedSellByLineId;
    const updateLines = lines.map((l) => ({
      category: l.category as
        | 'materials'
        | 'labour'
        | 'travel'
        | 'scope'
        | 'other'
        | undefined,
      description: l.description,
      quantity: Number(l.quantity),
      unitPriceCents: proposed[l.id] ?? l.unitPriceCents,
      unitCostCents: l.unitCostCents,
      vatRateBps: l.vatRateBps,
      isOptional: l.isOptional,
      optionTier: l.optionTier,
      customerVisible: l.customerVisible,
      catalogueItemId: l.catalogueItemId,
      ygpCode: l.ygpCode,
      catalogueCategory: l.catalogueCategory,
    }));

    let updatedQuote;
    try {
      updatedQuote = await this.financeService.updateQuote(
        {
          companyId: actor.companyId,
          userId: actor.userId ?? undefined,
          permissions: actor.permissions ?? ['finance:write', '*'],
          roleName: actor.roleName ?? 'Owner',
        },
        quote.id,
        { lineItems: updateLines },
      );
    } catch (error) {
      if (error instanceof FinanceError) {
        await this.audit(actor, 'price_override_execution_blocked', record, {
          code: error.code,
          message: error.message,
        });
        throw new QuotePriceOverrideServiceError(error.code, error.message, 400);
      }
      throw error;
    }

    const [executed] = await this.db
      .update(quoteLinePriceOverrides)
      .set({
        status: 'EXECUTED',
        executedBy: actor.userId ?? null,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(quoteLinePriceOverrides.id, overrideId),
          eq(quoteLinePriceOverrides.companyId, actor.companyId),
          eq(quoteLinePriceOverrides.status, 'OWNER_APPROVED'),
        ),
      )
      .returning();

    if (!executed) {
      // Race: another executor won — treat as idempotent if already EXECUTED
      const again = await this.db.query.quoteLinePriceOverrides.findFirst({
        where: eq(quoteLinePriceOverrides.id, overrideId),
      });
      if (again?.status === 'EXECUTED') {
        const idempotent = rowToRecord(again);
        await this.audit(actor, 'price_override_executed', idempotent, { idempotent: true });
        return {
          override: idempotent,
          idempotent: true as const,
          quoteTotalCents: updatedQuote.totalCents,
        };
      }
      throw new QuotePriceOverrideServiceError(
        'PRICE_OVERRIDE_INVALID_STATUS',
        'Failed to mark override executed',
        409,
      );
    }

    const ruleAfter = await this.latestRow92(actor.companyId);
    if (ruleBefore || ruleAfter) {
      assertRow92UnchangedByOverride({
        before: {
          version: ruleBefore?.version ?? 1,
          status: (ruleBefore?.status as 'DRAFT') ?? 'DRAFT',
          globalAutomationEnabled: false,
        },
        after: {
          version: ruleAfter?.version ?? 1,
          status: (ruleAfter?.status as 'DRAFT') ?? 'DRAFT',
          globalAutomationEnabled: ruleAfter?.globalAutomationEnabled === true,
        },
      });
    }

    if (catalogueBefore.length > 0) {
      const catalogueAfter = await this.db
        .select({
          id: inventoryItems.id,
          sell: inventoryItems.sellPriceCents,
          cost: inventoryItems.unitCostCents,
        })
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.companyId, actor.companyId),
            inArray(
              inventoryItems.id,
              catalogueBefore.map((c) => c.id),
            ),
          ),
        );
      for (const before of catalogueBefore) {
        const after = catalogueAfter.find((c) => c.id === before.id);
        if (!after) continue;
        assertCataloguePriceUnchangedByOverride({
          beforeSellCents: before.sell,
          afterSellCents: after.sell,
        });
        assertSourceCostUnchangedByOverride({
          beforeCostCents: before.cost,
          afterCostCents: after.cost,
        });
      }
    }

    const finalRecord = rowToRecord(executed);
    await this.audit(actor, 'price_override_executed', finalRecord, {
      quoteTotalCents: updatedQuote.totalCents,
    });
    return {
      override: finalRecord,
      idempotent: false as const,
      quoteTotalCents: updatedQuote.totalCents,
    };
  }

  /** READ-ONLY staging audit helpers */
  async stagingAudit(companyId: string) {
    const statusCounts = await this.db
      .select({
        status: quotes.status,
        n: sql<number>`count(*)::int`,
      })
      .from(quotes)
      .where(eq(quotes.companyId, companyId))
      .groupBy(quotes.status);
    const [{ totalQuotes }] = await this.db
      .select({ totalQuotes: sql<number>`count(*)::int` })
      .from(quotes)
      .where(eq(quotes.companyId, companyId));
    const [{ overrideRows }] = await this.db
      .select({ overrideRows: sql<number>`count(*)::int` })
      .from(quoteLinePriceOverrides)
      .where(eq(quoteLinePriceOverrides.companyId, companyId));
    return {
      totalQuotes: totalQuotes ?? 0,
      statusCounts,
      overrideRows: overrideRows ?? 0,
    };
  }
}
