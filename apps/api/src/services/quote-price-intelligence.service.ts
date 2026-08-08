import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  companyFinanceSettings,
  companyPricebookRuleSets,
  quoteCostComponents,
  quoteLineItems,
  quotes,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow97SafetyGates,
  resolvePricebookSellPrice,
  resolveQuotePriceIntelligence,
  summarizeQuoteCost,
  YOUNG_GUNS_DRAFT_TIER_FORMULA,
  type PricebookRuleSet,
  type QuoteCostComponentType,
  type QuoteCostProvenance,
  type QuoteCostVatBasis,
  type QuotePriceIntelligenceResult,
} from '@titan/shared';

export class QuotePriceIntelligenceServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'QuotePriceIntelligenceServiceError';
  }
}

export type QuotePriceIntelActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

function canView(actor: QuotePriceIntelActor): boolean {
  const role = (actor.roleName ?? '').toLowerCase();
  if (role.includes('client') || role.includes('technician') || role.includes('tech')) {
    return false;
  }
  const perms = actor.permissions ?? [];
  return perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write');
}

export class QuotePriceIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertView(actor: QuotePriceIntelActor) {
    if (!canView(actor)) {
      throw new QuotePriceIntelligenceServiceError(
        'FORBIDDEN',
        'Quote price intelligence access denied',
        403,
      );
    }
  }

  async getIntelligence(
    actor: QuotePriceIntelActor,
    quoteId: string,
  ): Promise<
    QuotePriceIntelligenceResult & {
      quoteId: string;
      quoteNumber: string;
      readOnly: true;
      customerAmountMutated: false;
    }
  > {
    this.assertView(actor);

    const [quote] = await this.db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        subtotalCents: quotes.subtotalCents,
        scenario: quotes.scenario,
      })
      .from(quotes)
      .where(and(eq(quotes.companyId, actor.companyId), eq(quotes.id, quoteId)))
      .limit(1);

    if (!quote) {
      throw new QuotePriceIntelligenceServiceError('QUOTE_NOT_FOUND', 'Quote not found', 404);
    }

    const components = await this.db
      .select()
      .from(quoteCostComponents)
      .where(
        and(
          eq(quoteCostComponents.companyId, actor.companyId),
          eq(quoteCostComponents.quoteId, quoteId),
        ),
      );

    const costSummary =
      components.length > 0
        ? summarizeQuoteCost({
            components: components.map((c) => ({
              componentType: c.componentType as QuoteCostComponentType,
              totalCostCents: c.totalCostCents,
              provenance: c.provenance as QuoteCostProvenance,
              vatBasis: c.vatBasis as QuoteCostVatBasis,
            })),
            sellExVatCents: quote.subtotalCents,
          })
        : {
            materialsCostCents: null,
            labourCostCents: null,
            wastageCostCents: null,
            travelCostCents: null,
            callOutCostCents: null,
            equipmentCostCents: null,
            subcontractorCostCents: null,
            preliminariesCostCents: null,
            otherDirectCostCents: null,
            estimatedDirectCostCents: null,
            overheadCostCents: null,
            contingencyCostCents: null,
            warrantyProvisionCents: null,
            totalEstimatedCostCents: null,
            sellExVatCents: quote.subtotalCents,
            multiplier: null,
            markupBps: null,
            grossMarginBps: null,
            estimatedGrossProfitCents: null,
            confidence: 'INSUFFICIENT_INFORMATION' as const,
            warnings: ['COST_ESTIMATE_INCOMPLETE' as const],
            costEstimateIncomplete: true,
            overheadConfigured: false,
            wastageConfigured: false,
          };

    const [settings] = await this.db
      .select({
        profitFloorMarginBps: companyFinanceSettings.profitFloorMarginBps,
      })
      .from(companyFinanceSettings)
      .where(eq(companyFinanceSettings.companyId, actor.companyId))
      .limit(1);

    const [rule] = await this.db
      .select({
        status: companyPricebookRuleSets.status,
        globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled,
        tiers: companyPricebookRuleSets.tiers,
        name: companyPricebookRuleSets.name,
        version: companyPricebookRuleSets.version,
        baseCostType: companyPricebookRuleSets.baseCostType,
        currency: companyPricebookRuleSets.currency,
      })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, actor.companyId))
      .limit(1);

    assertRow97SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
    });

    let row92DraftPreviewSellExVatCents: number | null = null;
    if (
      rule &&
      rule.status === 'DRAFT' &&
      rule.globalAutomationEnabled !== true &&
      costSummary.totalEstimatedCostCents != null &&
      !costSummary.costEstimateIncomplete
    ) {
      const ruleSet: PricebookRuleSet = {
        ...YOUNG_GUNS_DRAFT_TIER_FORMULA,
        id: 'row92-preview',
        companyId: actor.companyId,
        name: rule.name ?? YOUNG_GUNS_DRAFT_TIER_FORMULA.name,
        version: rule.version ?? 1,
        status: 'DRAFT',
        globalAutomationEnabled: false,
        baseCostType: (rule.baseCostType as PricebookRuleSet['baseCostType']) ?? 'UNIT_COST_CENTS',
        currency: rule.currency ?? 'ZAR',
        tiers:
          (rule.tiers as PricebookRuleSet['tiers'] | null) ?? YOUNG_GUNS_DRAFT_TIER_FORMULA.tiers,
      };
      const preview = resolvePricebookSellPrice({
        baseCostCents: costSummary.totalEstimatedCostCents,
        ruleSet,
      });
      if (preview.ok) {
        row92DraftPreviewSellExVatCents = preview.sellPriceExVatCents;
      }
    }

    const lineCats = await this.db
      .select({ catalogueItemId: quoteLineItems.catalogueItemId })
      .from(quoteLineItems)
      .where(
        and(
          eq(quoteLineItems.companyId, actor.companyId),
          eq(quoteLineItems.quoteId, quoteId),
        ),
      );
    const catalogueIds = [
      ...new Set(
        lineCats.map((l) => l.catalogueItemId).filter((id): id is string => Boolean(id)),
      ),
    ];

    let exactComparableSellExVatCents: number[] = [];
    let comparableBasis: string | null = null;
    if (quote.scenario && catalogueIds.length > 0) {
      const peers = await this.db
        .select({
          id: quotes.id,
          subtotalCents: quotes.subtotalCents,
        })
        .from(quotes)
        .where(
          and(
            eq(quotes.companyId, actor.companyId),
            eq(quotes.scenario, quote.scenario),
            inArray(quotes.status, ['accepted', 'converted']),
            sql`${quotes.id} <> ${quoteId}`,
          ),
        )
        .limit(50);

      for (const peer of peers) {
        const peerLines = await this.db
          .select({ catalogueItemId: quoteLineItems.catalogueItemId })
          .from(quoteLineItems)
          .where(
            and(
              eq(quoteLineItems.companyId, actor.companyId),
              eq(quoteLineItems.quoteId, peer.id),
            ),
          );
        const peerCats = new Set(peerLines.map((l) => l.catalogueItemId).filter(Boolean));
        const overlap = catalogueIds.every((id) => peerCats.has(id));
        if (overlap && peer.subtotalCents > 0) {
          exactComparableSellExVatCents.push(peer.subtotalCents);
        }
      }
      if (exactComparableSellExVatCents.length > 0) {
        comparableBasis = 'exact_scenario_and_catalogue_item_set';
      }
    }

    let hasRow93Override = false;
    try {
      const overrideCount = await this.db.execute(sql`
        SELECT count(*)::int AS c
        FROM quote_line_price_overrides
        WHERE company_id = ${actor.companyId}
          AND quote_id = ${quoteId}
          AND status IN ('OWNER_APPROVED', 'EXECUTED')
      `);
      const rows = overrideCount as unknown as Array<{ c: number }>;
      hasRow93Override = Number(rows?.[0]?.c ?? 0) > 0;
    } catch {
      hasRow93Override = false;
    }

    const intelligence = resolveQuotePriceIntelligence({
      currentSellExVatCents: quote.subtotalCents,
      costSummary,
      profitFloorMarginBps: settings?.profitFloorMarginBps ?? null,
      row92DraftPreviewSellExVatCents,
      row92RuleStatus: rule?.status ?? null,
      row92GlobalAutomationEnabled: rule?.globalAutomationEnabled ?? false,
      exactComparableSellExVatCents,
      comparableBasis,
      hasRow93Override,
    });

    return {
      ...intelligence,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      readOnly: true,
      customerAmountMutated: false,
    };
  }
}
