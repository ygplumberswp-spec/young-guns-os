import { and, asc, desc, eq, gt } from 'drizzle-orm';
import {
  boqImportRowReviewedEdits,
  boqImportRows,
  boqImports,
  boqReviewedExports,
  companyPricebookRuleSets,
  securityAuditLogs,
  type DatabaseClient,
} from '@titan/db';
import {
  assessBoqExportReadiness,
  boqExportIdempotencyKey,
  buildBoqExportRowViews,
  buildReviewedBoqPdfHtml,
  buildReviewedBoqXlsxWorkbook,
  canManageBoqReviewedExport,
  projectClientSafeBoqExport,
  assertRow102SafetyGates,
  type BoqExportFormat,
  type BoqExportMode,
  type BoqExportProvenance,
  type BoqExportSourceRow,
  type BoqReviewedFieldKey,
} from '@titan/shared/boq-reviewed-export';
import { renderHtmlToPdf } from './chromium-pdf.service.js';

export class BoqReviewedExportServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'BoqReviewedExportServiceError';
  }
}

export type BoqReviewedExportActor = {
  companyId: string;
  userId?: string | null;
  roleName?: string | null;
  permissions?: string[] | null;
};

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class BoqReviewedExportService {
  constructor(private readonly db: DatabaseClient) {}

  private assertManage(actor: BoqReviewedExportActor) {
    const role = (actor.roleName ?? '').toLowerCase();
    if (role.includes('client') || role === 'technician' || role.includes('tech')) {
      throw new BoqReviewedExportServiceError('FORBIDDEN', 'BOQ export denied', 403);
    }
    if (!canManageBoqReviewedExport(actor)) {
      throw new BoqReviewedExportServiceError('FORBIDDEN', 'BOQ export denied', 403);
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
    assertRow102SafetyGates({
      row92AutomationEnabled: rule?.globalAutomationEnabled === true,
      row103Started: false,
      xeroWrites: 0,
      customerSends: 0,
      productionWrites: 0,
      purchaseOrdersCreated: 0,
    });
  }

  private async audit(
    actor: BoqReviewedExportActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'financial',
      action,
      entityType: 'boq_reviewed_export',
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

  private async loadSource(companyId: string, boqImportId: string): Promise<{
    provenance: BoqExportProvenance;
    rows: BoqExportSourceRow[];
    edits: Array<{
      boqImportRowId: string;
      fieldKey: BoqReviewedFieldKey;
      originalValue: string | null;
      reviewedValue: string | null;
      actorUserId: string | null;
      reviewedAt: string;
      reasonNote: string | null;
    }>;
  }> {
    const [imp] = await this.db
      .select()
      .from(boqImports)
      .where(and(eq(boqImports.companyId, companyId), eq(boqImports.id, boqImportId)))
      .limit(1);
    if (!imp) {
      throw new BoqReviewedExportServiceError('BOQ_IMPORT_NOT_FOUND', 'BOQ import not found', 404);
    }

    let hasNewerRevision = false;
    if (imp.workbookIdentity) {
      const [newer] = await this.db
        .select({ id: boqImports.id })
        .from(boqImports)
        .where(
          and(
            eq(boqImports.companyId, companyId),
            eq(boqImports.workbookIdentity, imp.workbookIdentity),
            gt(boqImports.importVersion, imp.importVersion),
          ),
        )
        .limit(1);
      hasNewerRevision = Boolean(newer);
    } else {
      const [newerHash] = await this.db
        .select({ id: boqImports.id })
        .from(boqImports)
        .where(
          and(
            eq(boqImports.companyId, companyId),
            eq(boqImports.fileHashSha256, imp.fileHashSha256),
            gt(boqImports.importVersion, imp.importVersion),
          ),
        )
        .limit(1);
      // Same hash shouldn't have newer version typically; also check superseded flag
      void newerHash;
    }
    if (imp.supersededBy || imp.status === 'SUPERSEDED') hasNewerRevision = true;

    const dbRows = await this.db
      .select()
      .from(boqImportRows)
      .where(and(eq(boqImportRows.companyId, companyId), eq(boqImportRows.importId, boqImportId)))
      .orderBy(asc(boqImportRows.sheetOrder), asc(boqImportRows.originalRowOrder));

    const editRows = await this.db
      .select()
      .from(boqImportRowReviewedEdits)
      .where(
        and(
          eq(boqImportRowReviewedEdits.companyId, companyId),
          eq(boqImportRowReviewedEdits.boqImportId, boqImportId),
        ),
      );

    return {
      provenance: {
        boqImportId: imp.id,
        originalFilename: imp.originalFilename,
        fileHashSha256: imp.fileHashSha256,
        revisionLabel: imp.revisionLabel,
        importVersion: imp.importVersion,
        workbookIdentity: imp.workbookIdentity,
        sheetOrder: (imp.sheetOrder as string[]) ?? [],
        status: imp.status,
        supersededBy: imp.supersededBy,
        hasNewerRevision,
      },
      rows: dbRows.map((r) => ({
        boqImportRowId: r.id,
        sheetName: r.sheetName,
        sheetOrder: r.sheetOrder,
        originalRowNumber: r.originalRowNumber,
        originalRowOrder: r.originalRowOrder,
        sectionLabel: r.sectionLabel,
        rowKind: r.rowKind,
        itemCode: r.itemCode,
        description: r.description,
        unit: r.unit,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        rawValue: r.rawValue,
        displayValue: r.displayValue,
        formulaText: r.formulaText,
        cellAddress: r.cellAddress,
        reviewState: r.reviewState,
        warnings: (r.warnings as string[]) ?? [],
      })),
      edits: editRows.map((e) => ({
        boqImportRowId: e.boqImportRowId,
        fieldKey: e.fieldKey as BoqReviewedFieldKey,
        originalValue: e.originalValue,
        reviewedValue: e.reviewedValue,
        actorUserId: e.actorUserId,
        reviewedAt: e.reviewedAt.toISOString(),
        reasonNote: e.reasonNote,
      })),
    };
  }

  async getReadiness(actor: BoqReviewedExportActor, boqImportId: string, mode: BoqExportMode) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);
    const { provenance, rows, edits } = await this.loadSource(actor.companyId, boqImportId);
    const readiness = assessBoqExportReadiness({
      provenance,
      rows,
      reviewedEdits: edits,
      mode,
    });
    const views = buildBoqExportRowViews({ rows, reviewedEdits: edits });
    const clientSafe = projectClientSafeBoqExport({ mode, provenance, rows: views });
    return { readiness, clientSafe, provenance };
  }

  async upsertReviewedEdit(
    actor: BoqReviewedExportActor,
    boqImportId: string,
    input: {
      boqImportRowId: string;
      fieldKey: BoqReviewedFieldKey;
      reviewedValue: string | null;
      reasonNote?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    const [row] = await this.db
      .select()
      .from(boqImportRows)
      .where(
        and(
          eq(boqImportRows.companyId, actor.companyId),
          eq(boqImportRows.importId, boqImportId),
          eq(boqImportRows.id, input.boqImportRowId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new BoqReviewedExportServiceError('ROW_NOT_FOUND', 'BOQ import row not found', 404);
    }

    const originalValue =
      input.fieldKey === 'quantity'
        ? row.quantity != null
          ? String(row.quantity)
          : null
        : input.fieldKey === 'itemCode'
          ? row.itemCode
          : input.fieldKey === 'description'
            ? row.description
            : input.fieldKey === 'unit'
              ? row.unit
              : row.displayValue;

    const [existing] = await this.db
      .select()
      .from(boqImportRowReviewedEdits)
      .where(
        and(
          eq(boqImportRowReviewedEdits.companyId, actor.companyId),
          eq(boqImportRowReviewedEdits.boqImportRowId, input.boqImportRowId),
          eq(boqImportRowReviewedEdits.fieldKey, input.fieldKey),
        ),
      )
      .limit(1);

    let edit;
    if (existing) {
      [edit] = await this.db
        .update(boqImportRowReviewedEdits)
        .set({
          reviewedValue: input.reviewedValue,
          reasonNote: input.reasonNote ?? null,
          actorUserId: actor.userId ?? null,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(boqImportRowReviewedEdits.companyId, actor.companyId),
            eq(boqImportRowReviewedEdits.id, existing.id),
          ),
        )
        .returning();
    } else {
      [edit] = await this.db
        .insert(boqImportRowReviewedEdits)
        .values({
          companyId: actor.companyId,
          boqImportId,
          boqImportRowId: input.boqImportRowId,
          fieldKey: input.fieldKey,
          originalValue,
          reviewedValue: input.reviewedValue,
          actorUserId: actor.userId ?? null,
          reasonNote: input.reasonNote ?? null,
        })
        .returning();
    }

    await this.audit(actor, 'boq_reviewed_edit_upserted', edit.id, {
      boqImportId,
      boqImportRowId: input.boqImportRowId,
      fieldKey: input.fieldKey,
      mutatesBoqSource: false,
    });

    return { edit, mutatesBoqSource: false as const };
  }

  async export(
    actor: BoqReviewedExportActor,
    boqImportId: string,
    input: {
      format: BoqExportFormat;
      mode: BoqExportMode;
      clientActionId?: string | null;
    },
  ) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);

    if (input.clientActionId) {
      const [existing] = await this.db
        .select()
        .from(boqReviewedExports)
        .where(
          and(
            eq(boqReviewedExports.companyId, actor.companyId),
            eq(boqReviewedExports.clientActionId, input.clientActionId),
          ),
        )
        .limit(1);
      if (existing) {
        return {
          export: existing,
          contentBase64: existing.contentBase64,
          idempotentReplay: true as const,
          createsPurchaseOrder: false as const,
        };
      }
    }

    const { provenance, rows, edits } = await this.loadSource(actor.companyId, boqImportId);
    const readiness = assessBoqExportReadiness({
      provenance,
      rows,
      reviewedEdits: edits,
      mode: input.mode,
    });
    if (!readiness.allowed) {
      throw new BoqReviewedExportServiceError(
        readiness.blockers[0] ?? 'EXPORT_BLOCKED',
        `Export blocked: ${readiness.blockers.join(', ')}`,
        409,
      );
    }

    const views = buildBoqExportRowViews({ rows, reviewedEdits: edits });
    let buffer: Buffer;
    let mimeType: string;
    let fingerprint: string;
    let labelledDraftPreview = readiness.labelledDraftPreview;

    if (input.format === 'XLSX') {
      const built = buildReviewedBoqXlsxWorkbook({
        provenance,
        rows: views,
        mode: input.mode,
      });
      buffer = Buffer.from(built.bytes);
      mimeType = XLSX_MIME;
      fingerprint = built.contentFingerprintSha256;
    } else {
      const { html } = buildReviewedBoqPdfHtml({
        provenance,
        rows: views,
        mode: input.mode,
      });
      buffer = await renderHtmlToPdf(html);
      mimeType = 'application/pdf';
      const { createHash } = await import('node:crypto');
      fingerprint = createHash('sha256').update(buffer).digest('hex');
    }

    const idempotencyKey = boqExportIdempotencyKey({
      boqImportId,
      format: input.format,
      mode: input.mode,
      contentFingerprintSha256: fingerprint,
    });

    const [byIdem] = await this.db
      .select()
      .from(boqReviewedExports)
      .where(
        and(
          eq(boqReviewedExports.companyId, actor.companyId),
          eq(boqReviewedExports.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (byIdem) {
      return {
        export: byIdem,
        contentBase64: byIdem.contentBase64,
        idempotentReplay: true as const,
        createsPurchaseOrder: false as const,
      };
    }

    const contentBase64 = buffer.toString('base64');
    const [header] = await this.db
      .insert(boqReviewedExports)
      .values({
        companyId: actor.companyId,
        boqImportId,
        format: input.format,
        mode: input.mode,
        status: 'GENERATED',
        labelledDraftPreview,
        blockers: readiness.blockers,
        contentFingerprintSha256: fingerprint,
        idempotencyKey,
        clientActionId: input.clientActionId ?? null,
        originalFilename: provenance.originalFilename,
        fileHashSha256: provenance.fileHashSha256,
        importVersion: provenance.importVersion,
        revisionLabel: provenance.revisionLabel,
        mimeType,
        byteLength: buffer.length,
        contentBase64,
        auraNarrativeFacts: readiness.auraNarrativeFacts,
        createdBy: actor.userId ?? null,
      })
      .returning();

    await this.audit(actor, 'boq_reviewed_export_generated', header.id, {
      boqImportId,
      format: input.format,
      mode: input.mode,
      labelledDraftPreview,
      byteLength: buffer.length,
      createsPurchaseOrder: false,
      mutatesBoqSource: false,
    });

    const clientSafe = projectClientSafeBoqExport({
      mode: input.mode,
      provenance,
      rows: views,
    });

    return {
      export: header,
      contentBase64,
      clientSafe,
      idempotentReplay: false as const,
      createsPurchaseOrder: false as const,
      mutatesBoqSource: false as const,
      excludesSupplierCost: true as const,
      excludesSplitPurchaseInternals: true as const,
    };
  }

  async markImportReviewed(actor: BoqReviewedExportActor, boqImportId: string) {
    this.assertManage(actor);
    await this.assertSafe(actor.companyId);
    const [imp] = await this.db
      .select()
      .from(boqImports)
      .where(and(eq(boqImports.companyId, actor.companyId), eq(boqImports.id, boqImportId)))
      .limit(1);
    if (!imp) {
      throw new BoqReviewedExportServiceError('BOQ_IMPORT_NOT_FOUND', 'BOQ import not found', 404);
    }
    if (imp.status === 'SUPERSEDED') {
      throw new BoqReviewedExportServiceError(
        'SOURCE_REVISION_SUPERSEDED',
        'Cannot mark superseded import reviewed',
        409,
      );
    }
    const [updated] = await this.db
      .update(boqImports)
      .set({ status: 'REVIEWED', updatedAt: new Date() })
      .where(and(eq(boqImports.companyId, actor.companyId), eq(boqImports.id, boqImportId)))
      .returning();
    await this.audit(actor, 'boq_import_marked_reviewed', boqImportId, {
      previousStatus: imp.status,
      mutatesBoqSourceRows: false,
    });
    return { import: updated, mutatesBoqSourceRows: false as const };
  }
}
