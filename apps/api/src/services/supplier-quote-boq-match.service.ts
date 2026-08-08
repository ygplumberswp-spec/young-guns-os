import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import {
  boqImportRows,
  boqImports,
  companyPricebookRuleSets,
  securityAuditLogs,
  supplierQuoteBoqMatchProposals,
  supplierQuoteImportLines,
  supplierQuoteImports,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow100SafetyGates,
  canManageSupplierBoqMatching,
  confirmSupplierBoqMatch,
  rejectSupplierBoqMatch,
  resolveSupplierBoqMatches,
  supplierMatchIdempotencyKey,
  type SupplierQuoteLineInput,
  type SupplierVatBasis,
} from '@titan/shared';

export class SupplierQuoteBoqMatchServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'SupplierQuoteBoqMatchServiceError';
  }
}

export type SupplierQuoteBoqMatchActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

export class SupplierQuoteBoqMatchService {
  constructor(private readonly db: DatabaseClient) {}

  private assertManage(actor: SupplierQuoteBoqMatchActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new SupplierQuoteBoqMatchServiceError('FORBIDDEN', 'Supplier BOQ matching denied', 403);
    }
    if (!canManageSupplierBoqMatching(actor)) {
      throw new SupplierQuoteBoqMatchServiceError('FORBIDDEN', 'Supplier BOQ matching denied', 403);
    }
  }

  private async assertRow92Safe(companyId: string) {
    const [rule] = await this.db
      .select({
        globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled,
      })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow100SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row101Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
    });
  }

  private async audit(
    actor: SupplierQuoteBoqMatchActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'supplier_quote_boq_match',
      entityId,
      userId: actor.userId ?? null,
      metadata: {
        ...metadata,
        customerFacing: false,
        catalogueMutation: false,
        quotePriceMutation: false,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async listForBoqImport(actor: SupplierQuoteBoqMatchActor, boqImportId: string) {
    this.assertManage(actor);
    const imports = await this.db
      .select()
      .from(supplierQuoteImports)
      .where(
        and(
          eq(supplierQuoteImports.companyId, actor.companyId),
          eq(supplierQuoteImports.boqImportId, boqImportId),
        ),
      )
      .orderBy(desc(supplierQuoteImports.importedAt))
      .limit(20);
    return { imports };
  }

  async get(actor: SupplierQuoteBoqMatchActor, importId: string) {
    this.assertManage(actor);
    const [imp] = await this.db
      .select()
      .from(supplierQuoteImports)
      .where(
        and(
          eq(supplierQuoteImports.companyId, actor.companyId),
          eq(supplierQuoteImports.id, importId),
        ),
      )
      .limit(1);
    if (!imp) {
      throw new SupplierQuoteBoqMatchServiceError('NOT_FOUND', 'Supplier quote import not found', 404);
    }
    const lines = await this.db
      .select()
      .from(supplierQuoteImportLines)
      .where(
        and(
          eq(supplierQuoteImportLines.companyId, actor.companyId),
          eq(supplierQuoteImportLines.importId, importId),
        ),
      )
      .orderBy(supplierQuoteImportLines.sourceLineOrder);
    const proposals = await this.db
      .select()
      .from(supplierQuoteBoqMatchProposals)
      .where(
        and(
          eq(supplierQuoteBoqMatchProposals.companyId, actor.companyId),
          eq(supplierQuoteBoqMatchProposals.supplierQuoteImportId, importId),
        ),
      );
    return {
      import: imp,
      lines,
      proposals,
      catalogueMutation: false as const,
      quotePriceMutation: false as const,
    };
  }

  /**
   * Ingest structured supplier lines (from fixture / future PDF extract) and propose matches.
   * PDF binary parsing is not required — lines are evidence-backed inputs.
   */
  async matchAgainstBoqImport(
    actor: SupplierQuoteBoqMatchActor,
    input: {
      boqImportId: string;
      originalFilename: string;
      fileHashSha256?: string | null;
      contentBase64?: string | null;
      revisionLabel?: string | null;
      supplierId?: string | null;
      supplierName?: string | null;
      sourceDocumentId?: string | null;
      clientActionId?: string | null;
      supplierLines: SupplierQuoteLineInput[];
      allowSequenceOnlyAttempt?: boolean;
    },
  ) {
    this.assertManage(actor);
    await this.assertRow92Safe(actor.companyId);

    const [boqImp] = await this.db
      .select()
      .from(boqImports)
      .where(
        and(
          eq(boqImports.companyId, actor.companyId),
          eq(boqImports.id, input.boqImportId),
        ),
      )
      .limit(1);
    if (!boqImp) {
      throw new SupplierQuoteBoqMatchServiceError('BOQ_IMPORT_NOT_FOUND', 'BOQ import not found', 404);
    }

    if (input.clientActionId) {
      const [existing] = await this.db
        .select()
        .from(supplierQuoteImports)
        .where(
          and(
            eq(supplierQuoteImports.companyId, actor.companyId),
            eq(supplierQuoteImports.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (existing) {
        const detail = await this.get(actor, existing.id);
        return { ...detail, idempotentReplay: true as const };
      }
    }

    const fileHash =
      input.fileHashSha256 ??
      (input.contentBase64
        ? createHash('sha256').update(Buffer.from(input.contentBase64, 'base64')).digest('hex')
        : createHash('sha256')
            .update(JSON.stringify(input.supplierLines))
            .digest('hex'));

    const idempotencyKey = supplierMatchIdempotencyKey({
      boqImportId: input.boqImportId,
      fileHashSha256: fileHash,
      supplierLineKeys: input.supplierLines.map((l) => l.clientKey),
    });

    const [byIdem] = await this.db
      .select()
      .from(supplierQuoteImports)
      .where(
        and(
          eq(supplierQuoteImports.companyId, actor.companyId),
          eq(supplierQuoteImports.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (byIdem) {
      const detail = await this.get(actor, byIdem.id);
      await this.audit(actor, 'supplier_quote_boq_match_idempotent_replay', byIdem.id, {
        idempotencyKey,
        fileHash,
      });
      return { ...detail, idempotentReplay: true as const };
    }

    const boqRows = await this.db
      .select()
      .from(boqImportRows)
      .where(
        and(
          eq(boqImportRows.companyId, actor.companyId),
          eq(boqImportRows.importId, input.boqImportId),
        ),
      );

    const resolved = resolveSupplierBoqMatches({
      provenance: {
        supplierDocumentId: input.sourceDocumentId ?? null,
        fileHashSha256: fileHash,
        revisionLabel: input.revisionLabel ?? null,
        supplierId: input.supplierId ?? null,
        supplierName: input.supplierName ?? null,
        originalFilename: input.originalFilename,
      },
      boqImportId: input.boqImportId,
      boqRows: boqRows.map((r) => ({
        boqImportRowId: r.id,
        boqImportId: input.boqImportId,
        sheetName: r.sheetName,
        sheetOrder: r.sheetOrder,
        originalRowNumber: r.originalRowNumber,
        originalRowOrder: r.originalRowOrder,
        itemCode: r.itemCode,
        description: r.description,
        unit: r.unit,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        rowKind: r.rowKind,
      })),
      supplierLines: input.supplierLines,
      allowSequenceOnlyAttempt: input.allowSequenceOnlyAttempt,
    });

    const [imp] = await this.db
      .insert(supplierQuoteImports)
      .values({
        companyId: actor.companyId,
        boqImportId: input.boqImportId,
        supplierId: input.supplierId ?? null,
        supplierName: input.supplierName ?? null,
        sourceDocumentId: input.sourceDocumentId ?? null,
        originalFilename: input.originalFilename,
        fileHashSha256: fileHash,
        revisionLabel: input.revisionLabel ?? null,
        status: 'REVIEW_REQUIRED',
        warnings: resolved.warnings,
        auraNarrativeFacts: resolved.auraNarrativeFacts,
        idempotencyKey,
        clientActionId: input.clientActionId ?? null,
        createdBy: actor.userId ?? null,
      })
      .returning();

    const lineIdByKey = new Map<string, string>();
    if (input.supplierLines.length > 0) {
      const inserted = await this.db
        .insert(supplierQuoteImportLines)
        .values(
          input.supplierLines.map((l) => ({
            companyId: actor.companyId,
            importId: imp.id,
            clientKey: l.clientKey,
            sourceLineOrder: l.sourceLineOrder,
            pageNumber: l.pageNumber ?? null,
            supplierSku: l.supplierSku ?? null,
            manufacturerCode: l.manufacturerCode ?? null,
            description: l.description ?? null,
            unit: l.unit ?? null,
            quantity: l.quantity != null ? String(l.quantity) : null,
            packSize: l.packSize != null ? String(l.packSize) : null,
            unitPriceCents: l.unitPriceCents ?? null,
            vatBasis: (l.vatBasis ?? 'UNKNOWN') as SupplierVatBasis,
            currency: l.currency ?? null,
            priceValidTo: l.priceValidTo ?? null,
            sourceReference: l.sourceReference ?? null,
          })),
        )
        .returning();
      for (const row of inserted) lineIdByKey.set(row.clientKey, row.id);
    }

    if (resolved.proposals.length > 0) {
      await this.db.insert(supplierQuoteBoqMatchProposals).values(
        resolved.proposals.map((p) => ({
          companyId: actor.companyId,
          supplierQuoteImportId: imp.id,
          supplierLineId: p.supplierLineClientKey
            ? lineIdByKey.get(p.supplierLineClientKey) ?? null
            : null,
          boqImportId: input.boqImportId,
          boqImportRowId: p.boqImportRowId,
          proposalKey: p.proposalKey,
          matchState: p.matchState,
          signalsUsed: p.signalsUsed,
          confidenceScore: p.confidenceScore,
          warnings: p.warnings,
          supplierSku: p.supplierSku,
          manufacturerCode: p.manufacturerCode,
          description: p.description,
          unit: p.unit,
          quantity: p.quantity != null ? String(p.quantity) : null,
          packSize: p.packSize != null ? String(p.packSize) : null,
          unitPriceCents: p.unitPriceCents,
          vatBasis: p.vatBasis,
          currency: p.currency,
          priceValidTo: p.priceValidTo,
          humanConfirmed: false,
        })),
      );
    }

    await this.audit(actor, 'supplier_quote_boq_match_proposed', imp.id, {
      boqImportId: input.boqImportId,
      fileHash,
      proposalCount: resolved.proposals.length,
      automaticPricing: false,
      catalogueMutation: false,
    });

    const detail = await this.get(actor, imp.id);
    return {
      ...detail,
      idempotentReplay: false as const,
      intelligence: resolved,
    };
  }

  async confirmProposal(
    actor: SupplierQuoteBoqMatchActor,
    importId: string,
    proposalId: string,
  ) {
    this.assertManage(actor);
    await this.assertRow92Safe(actor.companyId);
    const [row] = await this.db
      .select()
      .from(supplierQuoteBoqMatchProposals)
      .where(
        and(
          eq(supplierQuoteBoqMatchProposals.companyId, actor.companyId),
          eq(supplierQuoteBoqMatchProposals.supplierQuoteImportId, importId),
          eq(supplierQuoteBoqMatchProposals.id, proposalId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new SupplierQuoteBoqMatchServiceError('NOT_FOUND', 'Match proposal not found', 404);
    }

    const result = confirmSupplierBoqMatch({
      proposal: {
        proposalKey: row.proposalKey,
        boqImportId: row.boqImportId,
        boqImportRowId: row.boqImportRowId,
        supplierLineClientKey: row.supplierLineId ?? '',
        supplierSourceLineOrder: 0,
        matchState: row.matchState as never,
        signalsUsed: (row.signalsUsed as never) ?? [],
        confidenceScore: row.confidenceScore,
        warnings: (row.warnings as string[]) ?? [],
        supplierSku: row.supplierSku,
        manufacturerCode: row.manufacturerCode,
        description: row.description,
        unit: row.unit,
        quantity: row.quantity != null ? Number(row.quantity) : null,
        packSize: row.packSize != null ? Number(row.packSize) : null,
        unitPriceCents: row.unitPriceCents,
        vatBasis: (row.vatBasis as SupplierVatBasis) ?? 'UNKNOWN',
        currency: row.currency,
        priceValidTo: row.priceValidTo,
        humanConfirmed: row.humanConfirmed,
        mutatesBoqSource: false,
        mutatesCatalogueOrQuotePrice: false,
      },
      actorRole: actor.roleName,
      actorPermissions: actor.permissions,
    });
    if (!result.ok) {
      throw new SupplierQuoteBoqMatchServiceError(result.code, result.code, 400);
    }

    await this.db
      .update(supplierQuoteBoqMatchProposals)
      .set({
        matchState: 'CONFIRMED',
        humanConfirmed: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(supplierQuoteBoqMatchProposals.companyId, actor.companyId),
          eq(supplierQuoteBoqMatchProposals.id, proposalId),
        ),
      );

    await this.audit(actor, 'supplier_quote_boq_match_confirmed', proposalId, {
      importId,
      boqImportRowId: row.boqImportRowId,
      mutatesBoqSource: false,
      mutatesCatalogueOrQuotePrice: false,
    });

    return { confirmed: true as const, mutatesBoqSource: false as const };
  }

  async rejectProposal(
    actor: SupplierQuoteBoqMatchActor,
    importId: string,
    proposalId: string,
  ) {
    this.assertManage(actor);
    await this.assertRow92Safe(actor.companyId);
    const [row] = await this.db
      .select()
      .from(supplierQuoteBoqMatchProposals)
      .where(
        and(
          eq(supplierQuoteBoqMatchProposals.companyId, actor.companyId),
          eq(supplierQuoteBoqMatchProposals.supplierQuoteImportId, importId),
          eq(supplierQuoteBoqMatchProposals.id, proposalId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new SupplierQuoteBoqMatchServiceError('NOT_FOUND', 'Match proposal not found', 404);
    }
    rejectSupplierBoqMatch({
      proposalKey: row.proposalKey,
      boqImportId: row.boqImportId,
      boqImportRowId: row.boqImportRowId,
      supplierLineClientKey: '',
      supplierSourceLineOrder: 0,
      matchState: row.matchState as never,
      signalsUsed: [],
      confidenceScore: 0,
      warnings: [],
      supplierSku: null,
      manufacturerCode: null,
      description: null,
      unit: null,
      quantity: null,
      packSize: null,
      unitPriceCents: null,
      vatBasis: 'UNKNOWN',
      currency: null,
      priceValidTo: null,
      humanConfirmed: false,
      mutatesBoqSource: false,
      mutatesCatalogueOrQuotePrice: false,
    });

    await this.db
      .update(supplierQuoteBoqMatchProposals)
      .set({ matchState: 'REJECTED', humanConfirmed: false, updatedAt: new Date() })
      .where(
        and(
          eq(supplierQuoteBoqMatchProposals.companyId, actor.companyId),
          eq(supplierQuoteBoqMatchProposals.id, proposalId),
        ),
      );

    await this.audit(actor, 'supplier_quote_boq_match_rejected', proposalId, {
      importId,
      mutatesBoqSource: false,
    });

    return { rejected: true as const, mutatesBoqSource: false as const };
  }
}
