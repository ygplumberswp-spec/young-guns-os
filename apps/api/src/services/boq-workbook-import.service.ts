import { and, desc, eq } from 'drizzle-orm';
import {
  boqImportRows,
  boqImportSheets,
  boqImports,
  companyPricebookRuleSets,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  assertRow99SafetyGates,
  canonicalizeBoqWorkbookImport,
  canManageBoqWorkbookImport,
  hashBoqWorkbookBytes,
  linkBoqImportToBoqTenderScenario,
  parseBoqXlsxWorkbook,
  resolveBoqImportRevision,
} from '@titan/shared/boq-workbook-import';

export class BoqWorkbookImportServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'BoqWorkbookImportServiceError';
  }
}

export type BoqWorkbookImportActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

export class BoqWorkbookImportService {
  constructor(private readonly db: DatabaseClient) {}

  private assertManage(actor: BoqWorkbookImportActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new BoqWorkbookImportServiceError('FORBIDDEN', 'BOQ workbook import denied', 403);
    }
    if (!canManageBoqWorkbookImport(actor)) {
      throw new BoqWorkbookImportServiceError('FORBIDDEN', 'BOQ workbook import denied', 403);
    }
  }

  private async assertRow92Safe(companyId: string) {
    const [rule] = await this.db
      .select({
        status: companyPricebookRuleSets.status,
        globalAutomationEnabled: companyPricebookRuleSets.globalAutomationEnabled,
      })
      .from(companyPricebookRuleSets)
      .where(eq(companyPricebookRuleSets.companyId, companyId))
      .orderBy(desc(companyPricebookRuleSets.version))
      .limit(1);
    assertRow99SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row100Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
    });
  }

  private async audit(
    actor: BoqWorkbookImportActor,
    action: string,
    importId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'boq_import',
      entityId: importId,
      userId: actor.userId ?? null,
      metadata: {
        ...metadata,
        customerFacing: false,
        automaticPricing: false,
        supplierMatching: false,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async list(actor: BoqWorkbookImportActor) {
    this.assertManage(actor);
    const rows = await this.db
      .select()
      .from(boqImports)
      .where(eq(boqImports.companyId, actor.companyId))
      .orderBy(desc(boqImports.importedAt))
      .limit(100);
    return { imports: rows };
  }

  async get(actor: BoqWorkbookImportActor, importId: string) {
    this.assertManage(actor);
    const [imp] = await this.db
      .select()
      .from(boqImports)
      .where(and(eq(boqImports.companyId, actor.companyId), eq(boqImports.id, importId)))
      .limit(1);
    if (!imp) {
      throw new BoqWorkbookImportServiceError('NOT_FOUND', 'BOQ import not found', 404);
    }
    const sheets = await this.db
      .select()
      .from(boqImportSheets)
      .where(
        and(
          eq(boqImportSheets.companyId, actor.companyId),
          eq(boqImportSheets.importId, importId),
        ),
      )
      .orderBy(boqImportSheets.sheetOrder);
    const rows = await this.db
      .select()
      .from(boqImportRows)
      .where(
        and(eq(boqImportRows.companyId, actor.companyId), eq(boqImportRows.importId, importId)),
      )
      .orderBy(boqImportRows.sheetOrder, boqImportRows.originalRowOrder);
    return {
      import: imp,
      sheets,
      rows,
      automaticPricing: false as const,
      supplierMatching: false as const,
    };
  }

  /**
   * Import workbook bytes into immutable snapshot tables.
   * Same hash → idempotent replay. Changed hash → new revision (prior not rewritten).
   */
  async importWorkbook(
    actor: BoqWorkbookImportActor,
    input: {
      originalFilename: string;
      bytes: Buffer;
      revisionLabel?: string | null;
      sourceDocumentId?: string | null;
      clientActionId?: string | null;
      storageKey?: string | null;
      mimeType?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertRow92Safe(actor.companyId);

    if (input.clientActionId) {
      const [byAction] = await this.db
        .select()
        .from(boqImports)
        .where(
          and(
            eq(boqImports.companyId, actor.companyId),
            eq(boqImports.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (byAction) {
        const detail = await this.get(actor, byAction.id);
        return { ...detail, idempotentReplay: true as const };
      }
    }

    const fileHash = hashBoqWorkbookBytes(input.bytes);
    const existingSame = await this.db
      .select()
      .from(boqImports)
      .where(
        and(eq(boqImports.companyId, actor.companyId), eq(boqImports.fileHashSha256, fileHash)),
      )
      .orderBy(desc(boqImports.importVersion))
      .limit(1);

    if (existingSame[0] && existingSame[0].status !== 'SUPERSEDED') {
      const detail = await this.get(actor, existingSame[0].id);
      await this.audit(actor, 'boq_workbook_import_idempotent_replay', existingSame[0].id, {
        fileHash,
        importVersion: existingSame[0].importVersion,
      });
      return { ...detail, idempotentReplay: true as const };
    }

    const [latestAny] = await this.db
      .select()
      .from(boqImports)
      .where(eq(boqImports.companyId, actor.companyId))
      .orderBy(desc(boqImports.importVersion))
      .limit(1);

    const revision = resolveBoqImportRevision({
      previousFileHash: latestAny?.fileHashSha256 ?? null,
      nextFileHash: fileHash,
      previousImportVersion: latestAny?.importVersion ?? 0,
    });

    const parsed = parseBoqXlsxWorkbook(input.bytes);
    const canonical = canonicalizeBoqWorkbookImport(parsed);

    const [imp] = await this.db
      .insert(boqImports)
      .values({
        companyId: actor.companyId,
        sourceDocumentId: input.sourceDocumentId ?? null,
        originalFilename: input.originalFilename,
        fileHashSha256: fileHash,
        revisionLabel: input.revisionLabel ?? `v${revision.importVersion}`,
        importVersion: revision.importVersion,
        workbookIdentity: parsed.workbookIdentity,
        mimeType:
          input.mimeType ??
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        storageKey: input.storageKey ?? null,
        status: canonical.reviewState,
        sheetOrder: canonical.sheetOrder,
        warnings: canonical.warnings,
        auraNarrativeFacts: canonical.auraNarrativeFacts,
        clientActionId: input.clientActionId ?? null,
        createdBy: actor.userId ?? null,
      })
      .returning();

    // Supersede prior different-hash imports (history preserved as SUPERSEDED)
    if (latestAny && latestAny.fileHashSha256 !== fileHash && latestAny.status !== 'SUPERSEDED') {
      await this.db
        .update(boqImports)
        .set({ status: 'SUPERSEDED', supersededBy: imp.id, updatedAt: new Date() })
        .where(
          and(eq(boqImports.companyId, actor.companyId), eq(boqImports.id, latestAny.id)),
        );
    }

    const sheetIdByOrder = new Map<number, string>();
    for (const sheetName of canonical.sheetOrder) {
      const order = canonical.sheetOrder.indexOf(sheetName);
      const [sheet] = await this.db
        .insert(boqImportSheets)
        .values({
          companyId: actor.companyId,
          importId: imp.id,
          sheetName,
          sheetOrder: order,
        })
        .returning();
      sheetIdByOrder.set(order, sheet.id);
    }

    if (canonical.rows.length > 0) {
      await this.db.insert(boqImportRows).values(
        canonical.rows.map((row) => ({
          companyId: actor.companyId,
          importId: imp.id,
          sheetId: sheetIdByOrder.get(row.sheetOrder)!,
          sheetName: row.sheetName,
          sheetOrder: row.sheetOrder,
          originalRowNumber: row.originalRowNumber,
          originalRowOrder: row.originalRowOrder,
          sectionLabel: row.sectionLabel,
          sectionKnown: row.sectionKnown,
          rowKind: row.rowKind,
          itemCode: row.itemCode,
          description: row.description,
          unit: row.unit,
          quantity: row.quantity != null ? String(row.quantity) : null,
          rawValue: row.rawValue,
          displayValue: row.displayValue,
          formulaText: row.formulaText,
          cellAddress: row.cellAddress,
          warnings: row.warnings,
          reviewState: row.reviewState,
        })),
      );
    }

    await this.audit(actor, 'boq_workbook_imported', imp.id, {
      fileHash,
      importVersion: imp.importVersion,
      sheetCount: canonical.sheetOrder.length,
      rowCount: canonical.rows.length,
      revisionAction: revision.action,
      formulasRecalculated: false,
      automaticPricing: false,
      supplierMatching: false,
    });

    const detail = await this.get(actor, imp.id);
    return {
      ...detail,
      idempotentReplay: false as const,
      intelligence: canonical,
      tenderLink: linkBoqImportToBoqTenderScenario({
        boqImportId: imp.id,
        tenderReference: input.revisionLabel ?? null,
      }),
    };
  }
}
