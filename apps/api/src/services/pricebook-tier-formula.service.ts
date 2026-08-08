import { and, desc, eq, sql } from 'drizzle-orm';
import {
  companyPricebookRuleSets,
  inventoryItems,
  quotes,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  YOUNG_GUNS_DRAFT_TIER_FORMULA,
  assertPricebookRuleActivationAllowed,
  assertPricebookRuleMayApplyToCatalogue,
  assertRow92GlobalAutomationDisabled,
  assertRow92NoRealPriceChanges,
  buildBulkImpactPreview,
  buildPricebookRuleAuditEvent,
  buildYoungGunsDraftRuleSet,
  canConfigurePricebookRules,
  canPreviewPricebookRules,
  isYoungGunsFinanceTenant,
  nextRuleVersion,
  parseRuleTiers,
  resolvePricebookSellPrice,
  ruleConfigFingerprint,
  serializeRuleTiers,
  validatePricebookRuleSet,
  type PricebookBaseCostType,
  type PricebookRuleSet,
  type PricebookRuleStatus,
  type PricebookTier,
  PRICEBOOK_TIER_ROYAL_CAPE,
} from '@titan/shared';

export class PricebookTierFormulaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'PricebookTierFormulaError';
  }
}

export type PricebookTierActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

function rowToRuleSet(row: typeof companyPricebookRuleSets.$inferSelect): PricebookRuleSet {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    version: row.version,
    status: row.status as PricebookRuleStatus,
    baseCostType: row.baseCostType as PricebookBaseCostType,
    currency: row.currency,
    tiers: parseRuleTiers(row.tiers),
    globalAutomationEnabled: row.globalAutomationEnabled === true,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    createdBy: row.createdBy ?? null,
    approvedAt: row.approvedAt?.toISOString?.() ?? null,
    activatedAt: row.activatedAt?.toISOString?.() ?? null,
    retiredAt: row.retiredAt?.toISOString?.() ?? null,
  };
}

export class PricebookTierFormulaService {
  constructor(private readonly db: DatabaseClient) {}

  private assertCanConfigure(actor: PricebookTierActor) {
    if (!canConfigurePricebookRules(actor)) {
      throw new PricebookTierFormulaError(
        'FORBIDDEN',
        'Only Owner may configure pricebook tier rules',
        403,
      );
    }
  }

  private assertCanPreview(actor: PricebookTierActor) {
    if (!canPreviewPricebookRules(actor)) {
      throw new PricebookTierFormulaError(
        'FORBIDDEN',
        'Pricebook tier preview denied for this role',
        403,
      );
    }
  }

  private async audit(
    actor: PricebookTierActor,
    eventType: Parameters<typeof buildPricebookRuleAuditEvent>[0]['eventType'],
    ruleSetId: string,
    before: unknown,
    after: unknown,
    reason?: string,
  ) {
    const event = buildPricebookRuleAuditEvent({
      eventType,
      companyId: actor.companyId,
      ruleSetId,
      actorId: actor.userId ?? null,
      before,
      after,
      reason: reason ?? null,
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

  /** Latest draft/inactive/active rule for company, or in-memory YG draft template. */
  async getRuleSet(actor: PricebookTierActor): Promise<{
    ruleSet: PricebookRuleSet;
    persisted: boolean;
    globalAutomationEnabled: false;
    message: string;
  }> {
    this.assertCanPreview(actor);
    const rows = await this.db
      .select()
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, actor.companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);

    if (rows[0]) {
      const ruleSet = rowToRuleSet(rows[0]);
      assertRow92GlobalAutomationDisabled(ruleSet.globalAutomationEnabled);
      return {
        ruleSet: { ...ruleSet, globalAutomationEnabled: false },
        persisted: true,
        globalAutomationEnabled: false,
        message: 'Global automatic pricing is OFF',
      };
    }

    // YG formula is Young Guns configuration only — never a SaaS-wide default.
    if (isYoungGunsFinanceTenant(actor.companyId)) {
      const draft = buildYoungGunsDraftRuleSet(actor.companyId);
      return {
        ruleSet: draft,
        persisted: false,
        globalAutomationEnabled: false,
        message:
          'Global automatic pricing is OFF — unsaved Young Guns DRAFT template (not ACTIVE)',
      };
    }

    const emptyDraft: PricebookRuleSet = {
      id: 'unsaved-empty',
      companyId: actor.companyId,
      name: 'Pricebook Tier Formula',
      version: 1,
      status: 'DRAFT',
      baseCostType: 'UNKNOWN',
      currency: 'ZAR',
      tiers: [],
      globalAutomationEnabled: false,
    };
    return {
      ruleSet: emptyDraft,
      persisted: false,
      globalAutomationEnabled: false,
      message:
        'Global automatic pricing is OFF — no tenant rule configured (YG formula is not a SaaS default)',
    };
  }

  async saveDraft(
    actor: PricebookTierActor,
    input: {
      name?: string;
      tiers: PricebookTier[];
      baseCostType?: PricebookBaseCostType;
      status?: 'DRAFT' | 'INACTIVE';
    },
  ): Promise<{ ruleSet: PricebookRuleSet; created: boolean; unchanged: boolean }> {
    this.assertCanConfigure(actor);

    const current = await this.getRuleSet(actor);
    const status = input.status ?? 'DRAFT';
    const candidate: PricebookRuleSet = {
      id: current.persisted ? current.ruleSet.id : 'pending',
      companyId: actor.companyId,
      name: input.name?.trim() || YOUNG_GUNS_DRAFT_TIER_FORMULA.name,
      version: current.persisted ? current.ruleSet.version : 1,
      status,
      baseCostType: input.baseCostType ?? YOUNG_GUNS_DRAFT_TIER_FORMULA.baseCostType,
      currency: 'ZAR',
      tiers: input.tiers,
      globalAutomationEnabled: false,
      createdBy: actor.userId ?? null,
    };

    const validation = validatePricebookRuleSet(candidate);
    if (!validation.ok) {
      throw new PricebookTierFormulaError(
        validation.code ?? 'PRICE_RULE_INVALID',
        validation.message,
        400,
      );
    }

    if (current.persisted) {
      const same =
        ruleConfigFingerprint(current.ruleSet) ===
        ruleConfigFingerprint({ ...candidate, status: candidate.status });
      if (same) {
        return { ruleSet: current.ruleSet, created: false, unchanged: true };
      }

      // Versioned update: retire conceptual mutation by inserting next version as DRAFT/INACTIVE
      // and leaving prior row as RETIRED when it was a draft save of different config.
      const newVersion = nextRuleVersion(current.ruleSet.version);
      if (current.ruleSet.status === 'DRAFT' || current.ruleSet.status === 'INACTIVE') {
        await this.db
          .update(companyPricebookRuleSets)
          .set({
            status: 'RETIRED',
            retiredAt: new Date(),
            updatedAt: new Date(),
            globalAutomationEnabled: false,
          })
          .where(
            and(
              eq(companyPricebookRuleSets.id, current.ruleSet.id),
              eq(companyPricebookRuleSets.companyId, actor.companyId),
            ),
          );
      }

      const [inserted] = await this.db
        .insert(companyPricebookRuleSets)
        .values({
          companyId: actor.companyId,
          name: candidate.name,
          version: newVersion,
          status,
          baseCostType: candidate.baseCostType,
          currency: 'ZAR',
          tiers: serializeRuleTiers(candidate.tiers) as unknown[],
          globalAutomationEnabled: false,
          createdBy: actor.userId ?? null,
        })
        .returning();

      const ruleSet = rowToRuleSet(inserted!);
      await this.audit(
        actor,
        'price_rule_updated',
        ruleSet.id,
        current.ruleSet,
        ruleSet,
        'draft save — automation OFF',
      );
      return { ruleSet, created: false, unchanged: false };
    }

    const [inserted] = await this.db
      .insert(companyPricebookRuleSets)
      .values({
        companyId: actor.companyId,
        name: candidate.name,
        version: 1,
        status,
        baseCostType: candidate.baseCostType,
        currency: 'ZAR',
        tiers: serializeRuleTiers(candidate.tiers) as unknown[],
        globalAutomationEnabled: false,
        createdBy: actor.userId ?? null,
      })
      .returning();

    const ruleSet = rowToRuleSet(inserted!);
    await this.audit(actor, 'price_rule_created', ruleSet.id, null, ruleSet, 'initial draft');
    return { ruleSet, created: true, unchanged: false };
  }

  async previewBaseCost(
    actor: PricebookTierActor,
    input: {
      baseCostCents: number | null;
      isDiscountedNet?: boolean;
      costSource?: string;
    },
  ) {
    this.assertCanPreview(actor);
    const { ruleSet } = await this.getRuleSet(actor);
    const result = resolvePricebookSellPrice({
      baseCostCents: input.baseCostCents,
      ruleSet: { ...ruleSet, globalAutomationEnabled: false },
      costProvenance: {
        source: input.costSource ?? ruleSet.baseCostType,
        isDiscountedNet: input.isDiscountedNet === true,
        alreadyDiscounted: input.isDiscountedNet === true,
      },
    });
    await this.audit(
      actor,
      'price_rule_previewed',
      ruleSet.id,
      null,
      {
        baseCostCents: input.baseCostCents,
        ok: result.ok,
        proposed: result.ok ? result.sellPriceExVatCents : null,
        code: result.ok ? null : result.code,
      },
      'single base-cost preview — not applied',
    );
    return {
      result,
      ruleStatus: ruleSet.status,
      ruleVersion: ruleSet.version,
      globalAutomationEnabled: false as const,
      applied: 0 as const,
    };
  }

  async bulkImpactPreview(actor: PricebookTierActor) {
    this.assertCanPreview(actor);
    const { ruleSet } = await this.getRuleSet(actor);

    const items = await this.db
      .select({
        id: inventoryItems.id,
        sku: inventoryItems.sku,
        name: inventoryItems.name,
        sellPriceCents: inventoryItems.sellPriceCents,
        unitCostCents: inventoryItems.unitCostCents,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.companyId, actor.companyId))
      .limit(500);

    // Honest cost provenance: unit_cost_cents alone is NOT confirmed net-discounted.
    const preview = buildBulkImpactPreview({
      ruleSet: { ...ruleSet, globalAutomationEnabled: false },
      items: items.map((item) => ({
        itemId: item.id,
        itemCode: item.sku,
        name: item.name,
        currentSellCents: item.sellPriceCents,
        baseCostCents: item.unitCostCents > 0 ? item.unitCostCents : null,
        costSource: 'inventory_items.unit_cost_cents',
        // Without explicit net-discount provenance, do not claim isDiscountedNet.
        isDiscountedNet: false,
      })),
    });

    assertRow92NoRealPriceChanges(preview.applied);
    await this.audit(
      actor,
      'price_rule_previewed',
      ruleSet.id,
      null,
      {
        catalogueRows: items.length,
        proposedCount: preview.proposedCount,
        applied: 0,
      },
      'bulk impact preview — READ ONLY',
    );

    return {
      ...preview,
      catalogueRowCount: items.length,
      applied: 0 as const,
      globalAutomationEnabled: false as const,
      note:
        items.length === 0
          ? 'YG catalogue count is 0 — bulk preview correctly empty; no catalogue rows invented'
          : 'unit_cost_cents lacks confirmed net-discount provenance — REVIEW_REQUIRED until cost authority confirmed',
    };
  }

  async attemptActivation(actor: PricebookTierActor, ownerConfirmationToken?: string | null) {
    this.assertCanConfigure(actor);
    const { ruleSet } = await this.getRuleSet(actor);
    const blocked = assertPricebookRuleActivationAllowed({
      status: ruleSet.status,
      ownerConfirmationToken: ownerConfirmationToken ?? undefined,
      row92ActivationAuthorised: false,
    });
    await this.audit(
      actor,
      'price_rule_activation_blocked',
      ruleSet.id,
      ruleSet,
      null,
      blocked.ok ? undefined : blocked.message,
    );
    if (!blocked.ok) {
      throw new PricebookTierFormulaError(blocked.code, blocked.message, 403);
    }
    // Unreachable in Row 92 — keep apply guard anyway.
    const apply = assertPricebookRuleMayApplyToCatalogue(ruleSet);
    if (!apply.ok) {
      throw new PricebookTierFormulaError(apply.code, apply.message, 403);
    }
    throw new PricebookTierFormulaError(
      'PRICEBOOK_RULE_OWNER_CONFIRMATION_REQUIRED',
      'Row 92 does not authorise activation',
      403,
    );
  }

  /** READ-ONLY Royal Cape + safety snapshot for staging proof. */
  async stagingSafetySnapshot(companyId: string) {
    const [ygCatalogue] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(eq(inventoryItems.companyId, companyId));

    const [rc] = await this.db
      .select({
        id: quotes.id,
        totalCents: quotes.totalCents,
        xeroQuoteId: quotes.xeroQuoteId,
        quoteNumber: quotes.quoteNumber,
        customerId: quotes.customerId,
        jobId: quotes.jobId,
        pricingPresentationMode: quotes.pricingPresentationMode,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, companyId),
          eq(quotes.id, PRICEBOOK_TIER_ROYAL_CAPE.royalCapeQuoteId),
        ),
      )
      .limit(1);

    return {
      ygCatalogueCount: ygCatalogue?.count ?? 0,
      royalCape: rc ?? null,
      expectedRoyalCapeTotalCents: PRICEBOOK_TIER_ROYAL_CAPE.expectedTotalCents,
    };
  }
}
