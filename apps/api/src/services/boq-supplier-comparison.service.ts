import { and, asc, desc, eq } from 'drizzle-orm';
import {
  boqImportRows,
  boqImports,
  boqSplitPurchaseProposalLines,
  boqSplitPurchaseProposals,
  companyPricebookRuleSets,
  securityAuditLogs,
  supplierQuoteBoqMatchProposals,
  supplierQuoteImportLines,
  supplierQuoteImports,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow101SafetyGates,
  buildSplitPurchaseProposal,
  canManageBoqSupplierComparison,
  resolveBoqSupplierComparison,
  splitPurchaseIdempotencyKey,
  suggestEligibleCheapestSelection,
  type BoqSupplierOfferInput,
  type SplitPurchaseProposalStatus,
  type SplitPurchaseSelectionInput,
  type SupplierBoqMatchState,
  type SupplierVatBasis,
} from '@titan/shared';

export class BoqSupplierComparisonServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'BoqSupplierComparisonServiceError';
  }
}

export type BoqSupplierComparisonActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

function isSubstituteProposal(
  matchState: string,
  signalsUsed: string[] | null,
  warnings: string[] | null,
): boolean {
  const signals = signalsUsed ?? [];
  const warns = (warnings ?? []).map((w) => w.toUpperCase());
  if (warns.some((w) => w.includes('SUBSTITUTE'))) return true;
  if (matchState === 'EXACT' || matchState === 'HIGH_CONFIDENCE' || matchState === 'CONFIRMED') {
    return false;
  }
  // Weak description-only candidates are treated as substitutes pending human review.
  return signals.includes('DESCRIPTION_ONLY_WEAK');
}

export class BoqSupplierComparisonService {
  constructor(private readonly db: DatabaseClient) {}

  private assertManage(actor: BoqSupplierComparisonActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new BoqSupplierComparisonServiceError('FORBIDDEN', 'Supplier comparison denied', 403);
    }
    if (!canManageBoqSupplierComparison(actor)) {
      throw new BoqSupplierComparisonServiceError('FORBIDDEN', 'Supplier comparison denied', 403);
    }
  }

  private async assertSafe(companyId: string) {
    const [rule] = await this.db
      .select({
        globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled,
      })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow101SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row102Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
      purchaseOrdersCreated: 0,
    });
  }

  private async audit(
    actor: BoqSupplierComparisonActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'boq_split_purchase_proposal',
      entityId,
      userId: actor.userId ?? null,
      metadata: {
        ...metadata,
        customerFacing: false,
        createsPurchaseOrder: false,
        createsXeroBill: false,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async loadComparison(companyId: string, boqImportId: string) {
    const [boqImp] = await this.db
      .select()
      .from(boqImports)
      .where(and(eq(boqImports.companyId, companyId), eq(boqImports.id, boqImportId)))
      .limit(1);
    if (!boqImp) {
      throw new BoqSupplierComparisonServiceError('BOQ_IMPORT_NOT_FOUND', 'BOQ import not found', 404);
    }

    const rows = await this.db
      .select()
      .from(boqImportRows)
      .where(and(eq(boqImportRows.companyId, companyId), eq(boqImportRows.importId, boqImportId)));

    const matchImports = await this.db
      .select()
      .from(supplierQuoteImports)
      .where(
        and(
          eq(supplierQuoteImports.companyId, companyId),
          eq(supplierQuoteImports.boqImportId, boqImportId),
        ),
      );

    const offersByBoqRowId: Record<string, BoqSupplierOfferInput[]> = {};
    for (const mi of matchImports) {
      const proposals = await this.db
        .select({
          proposal: supplierQuoteBoqMatchProposals,
          line: supplierQuoteImportLines,
        })
        .from(supplierQuoteBoqMatchProposals)
        .leftJoin(
          supplierQuoteImportLines,
          eq(supplierQuoteBoqMatchProposals.supplierLineId, supplierQuoteImportLines.id),
        )
        .where(
          and(
            eq(supplierQuoteBoqMatchProposals.companyId, companyId),
            eq(supplierQuoteBoqMatchProposals.supplierQuoteImportId, mi.id),
          ),
        );

      for (const { proposal: p, line } of proposals) {
        if (!p.boqImportRowId || p.matchState === 'REJECTED' || p.matchState === 'UNMATCHED') {
          continue;
        }
        const signals = (p.signalsUsed as string[] | null) ?? [];
        const warnings = (p.warnings as string[] | null) ?? [];
        const offer: BoqSupplierOfferInput = {
          offerKey: `${mi.id}:${p.proposalKey}`,
          supplierId: mi.supplierId,
          supplierName: mi.supplierName ?? 'Unknown supplier',
          supplierDocumentId: mi.sourceDocumentId,
          supplierDocumentRef: mi.originalFilename,
          fileHashSha256: mi.fileHashSha256,
          sourceLineOrder: line?.sourceLineOrder ?? 0,
          supplierSku: p.supplierSku,
          description: p.description,
          unit: p.unit,
          quantity: p.quantity != null ? Number(p.quantity) : null,
          packSize: p.packSize != null ? Number(p.packSize) : null,
          unitPriceCents: p.unitPriceCents,
          vatBasis: (p.vatBasis as SupplierVatBasis) ?? 'UNKNOWN',
          currency: p.currency,
          deliveryCents: null,
          deliveryKnown: false,
          validTo: p.priceValidTo,
          exclusions: null,
          isSubstitute: isSubstituteProposal(p.matchState, signals, warnings),
          matchState: p.matchState as SupplierBoqMatchState,
          matchConfidenceScore: p.confidenceScore,
          row100ProposalKey: p.proposalKey,
        };
        const list = offersByBoqRowId[p.boqImportRowId] ?? [];
        list.push(offer);
        offersByBoqRowId[p.boqImportRowId] = list;
      }
    }

    const comparison = resolveBoqSupplierComparison({
      boqImportId,
      boqRows: rows.map((r) => ({
        boqImportRowId: r.id,
        boqImportId,
        sheetName: r.sheetName,
        originalRowNumber: r.originalRowNumber,
        itemCode: r.itemCode,
        description: r.description,
        unit: r.unit,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        rowKind: r.rowKind,
      })),
      offersByBoqRowId,
    });

    return {
      comparison,
      matchImportCount: matchImports.length,
      purchaseOrdersCreated: 0 as const,
      xeroBillsCreated: 0 as const,
    };
  }

  async getComparison(actor: BoqSupplierComparisonActor, boqImportId: string) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);
    const result = await this.loadComparison(actor.companyId, boqImportId);
    await this.audit(actor, 'boq_supplier_comparison_viewed', boqImportId, {
      rowCount: result.comparison.rows.length,
      supplierQuoteImportCount: result.matchImportCount,
    });
    return result;
  }

  async listProposals(actor: BoqSupplierComparisonActor, boqImportId: string) {
    this.assertManage(actor);
    const headers = await this.db
      .select()
      .from(boqSplitPurchaseProposals)
      .where(
        and(
          eq(boqSplitPurchaseProposals.companyId, actor.companyId),
          eq(boqSplitPurchaseProposals.boqImportId, boqImportId),
        ),
      )
      .orderBy(desc(boqSplitPurchaseProposals.createdAt));
    return {
      proposals: headers,
      createsPurchaseOrder: false as const,
      createsXeroBill: false as const,
    };
  }

  async createSplitPurchaseProposal(
    actor: BoqSupplierComparisonActor,
    boqImportId: string,
    input: {
      selections?: SplitPurchaseSelectionInput[];
      preferEligibleCheapest?: boolean;
      clientActionId?: string | null;
      status?: SplitPurchaseProposalStatus;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    if (input.clientActionId) {
      const [existing] = await this.db
        .select()
        .from(boqSplitPurchaseProposals)
        .where(
          and(
            eq(boqSplitPurchaseProposals.companyId, actor.companyId),
            eq(boqSplitPurchaseProposals.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (existing) {
        const detail = await this.getProposal(actor, existing.id);
        return { ...detail, idempotentReplay: true as const };
      }
    }

    const { comparison } = await this.loadComparison(actor.companyId, boqImportId);

    let selections = input.selections ?? [];
    if (input.preferEligibleCheapest || selections.length === 0) {
      selections = comparison.rows
        .map((row) => suggestEligibleCheapestSelection(row))
        .filter((s): s is SplitPurchaseSelectionInput => Boolean(s));
    }

    const proposal = buildSplitPurchaseProposal({
      boqImportId,
      comparison,
      selections,
      status: input.status,
    });

    const idempotencyKey = splitPurchaseIdempotencyKey({
      boqImportId,
      selectionKeys: selections.map((s) => `${s.boqImportRowId}:${s.offerKey}`),
    });

    const [byIdem] = await this.db
      .select()
      .from(boqSplitPurchaseProposals)
      .where(
        and(
          eq(boqSplitPurchaseProposals.companyId, actor.companyId),
          eq(boqSplitPurchaseProposals.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (byIdem) {
      const detail = await this.getProposal(actor, byIdem.id);
      return { ...detail, idempotentReplay: true as const };
    }

    const [header] = await this.db
      .insert(boqSplitPurchaseProposals)
      .values({
        companyId: actor.companyId,
        boqImportId,
        status: proposal.status,
        idempotencyKey,
        clientActionId: input.clientActionId ?? null,
        warnings: proposal.warnings,
        auraNarrativeFacts: proposal.auraNarrativeFacts,
        supplierSubtotalCents: proposal.totals.supplierSubtotalCents,
        vatCents: proposal.totals.vatCents,
        deliveryCents: proposal.totals.deliveryCents,
        totalProposedPurchasingCostCents: proposal.totals.totalProposedPurchasingCostCents,
        totalsIncomplete: proposal.totals.incomplete,
        missingFields: proposal.totals.missingFields,
        createdBy: actor.userId ?? null,
      })
      .returning();

    if (proposal.lines.length > 0) {
      await this.db.insert(boqSplitPurchaseProposalLines).values(
        proposal.lines.map((line, index) => ({
          companyId: actor.companyId,
          proposalId: header.id,
          boqImportId,
          boqImportRowId: line.boqImportRowId,
          offerKey: line.offerKey,
          supplierId: line.supplierId,
          supplierName: line.supplierName,
          supplierDocumentRef: line.supplierDocumentRef,
          row100ProposalKey: line.row100ProposalKey,
          quantityProposed: line.quantityProposed != null ? String(line.quantityProposed) : null,
          unitPriceCents: line.unitPriceCents,
          vatBasis: line.vatBasis,
          lineSubtotalCents: line.lineSubtotalCents,
          lineVatCents: line.lineVatCents,
          deliveryCents: line.deliveryCents,
          expectedSupplierCostCents: line.expectedSupplierCostCents,
          mismatchFlags: line.mismatchFlags,
          warnings: line.warnings,
          isSubstitute: line.isSubstitute,
          sourceEvidence: line.sourceEvidence,
          position: index,
        })),
      );
    }

    await this.audit(actor, 'boq_split_purchase_proposal_created', header.id, {
      boqImportId,
      lineCount: proposal.lines.length,
      createsPurchaseOrder: false,
      totalsIncomplete: proposal.totals.incomplete,
    });

    const detail = await this.getProposal(actor, header.id);
    return {
      ...detail,
      idempotentReplay: false as const,
      intelligence: proposal,
      comparison,
    };
  }

  async updateProposal(
    actor: BoqSupplierComparisonActor,
    proposalId: string,
    input: {
      selections?: SplitPurchaseSelectionInput[];
      status?: SplitPurchaseProposalStatus;
      clientActionId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    const [header] = await this.db
      .select()
      .from(boqSplitPurchaseProposals)
      .where(
        and(
          eq(boqSplitPurchaseProposals.companyId, actor.companyId),
          eq(boqSplitPurchaseProposals.id, proposalId),
        ),
      )
      .limit(1);
    if (!header) {
      throw new BoqSupplierComparisonServiceError('NOT_FOUND', 'Proposal not found', 404);
    }

    if (input.selections) {
      const { comparison } = await this.loadComparison(actor.companyId, header.boqImportId);
      const proposal = buildSplitPurchaseProposal({
        boqImportId: header.boqImportId,
        comparison,
        selections: input.selections,
        status: input.status,
      });

      await this.db
        .delete(boqSplitPurchaseProposalLines)
        .where(
          and(
            eq(boqSplitPurchaseProposalLines.companyId, actor.companyId),
            eq(boqSplitPurchaseProposalLines.proposalId, proposalId),
          ),
        );

      if (proposal.lines.length > 0) {
        await this.db.insert(boqSplitPurchaseProposalLines).values(
          proposal.lines.map((line, index) => ({
            companyId: actor.companyId,
            proposalId,
            boqImportId: header.boqImportId,
            boqImportRowId: line.boqImportRowId,
            offerKey: line.offerKey,
            supplierId: line.supplierId,
            supplierName: line.supplierName,
            supplierDocumentRef: line.supplierDocumentRef,
            row100ProposalKey: line.row100ProposalKey,
            quantityProposed: line.quantityProposed != null ? String(line.quantityProposed) : null,
            unitPriceCents: line.unitPriceCents,
            vatBasis: line.vatBasis,
            lineSubtotalCents: line.lineSubtotalCents,
            lineVatCents: line.lineVatCents,
            deliveryCents: line.deliveryCents,
            expectedSupplierCostCents: line.expectedSupplierCostCents,
            mismatchFlags: line.mismatchFlags,
            warnings: line.warnings,
            isSubstitute: line.isSubstitute,
            sourceEvidence: line.sourceEvidence,
            position: index,
          })),
        );
      }

      await this.db
        .update(boqSplitPurchaseProposals)
        .set({
          status: proposal.status,
          warnings: proposal.warnings,
          auraNarrativeFacts: proposal.auraNarrativeFacts,
          supplierSubtotalCents: proposal.totals.supplierSubtotalCents,
          vatCents: proposal.totals.vatCents,
          deliveryCents: proposal.totals.deliveryCents,
          totalProposedPurchasingCostCents: proposal.totals.totalProposedPurchasingCostCents,
          totalsIncomplete: proposal.totals.incomplete,
          missingFields: proposal.totals.missingFields,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(boqSplitPurchaseProposals.companyId, actor.companyId),
            eq(boqSplitPurchaseProposals.id, proposalId),
          ),
        );
    } else if (input.status) {
      await this.db
        .update(boqSplitPurchaseProposals)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(boqSplitPurchaseProposals.companyId, actor.companyId),
            eq(boqSplitPurchaseProposals.id, proposalId),
          ),
        );
    }

    await this.audit(actor, 'boq_split_purchase_proposal_updated', proposalId, {
      boqImportId: header.boqImportId,
      status: input.status ?? null,
      editedSelections: Boolean(input.selections),
      createsPurchaseOrder: false,
    });

    return this.getProposal(actor, proposalId);
  }

  async getProposal(actor: BoqSupplierComparisonActor, proposalId: string) {
    this.assertManage(actor);
    const [header] = await this.db
      .select()
      .from(boqSplitPurchaseProposals)
      .where(
        and(
          eq(boqSplitPurchaseProposals.companyId, actor.companyId),
          eq(boqSplitPurchaseProposals.id, proposalId),
        ),
      )
      .limit(1);
    if (!header) {
      throw new BoqSupplierComparisonServiceError('NOT_FOUND', 'Proposal not found', 404);
    }
    const lines = await this.db
      .select()
      .from(boqSplitPurchaseProposalLines)
      .where(
        and(
          eq(boqSplitPurchaseProposalLines.companyId, actor.companyId),
          eq(boqSplitPurchaseProposalLines.proposalId, proposalId),
        ),
      )
      .orderBy(asc(boqSplitPurchaseProposalLines.position));
    return {
      proposal: header,
      lines,
      createsPurchaseOrder: false as const,
      createsXeroBill: false as const,
      mutatesBoqSource: false as const,
      mutatesCatalogueOrQuotePrice: false as const,
    };
  }
}
