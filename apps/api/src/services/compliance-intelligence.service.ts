import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  buildCmiAuditSnapshot,
  buildCmiChecksSnapshot,
  buildCmiCocSnapshot,
  buildCmiComplianceRiskDraft,
  buildCmiExpiryAlertDraft,
  buildCmiExpirySnapshot,
  buildCmiMissingDocDraft,
  buildCmiSansSnapshot,
  canAccessComplianceIntelligence,
  canApproveComplianceIntelligenceDrafts,
  canManageComplianceIntelligenceSettings,
  canWriteComplianceIntelligence,
  CMI_PRODUCT_COPY,
  cmiDaysUntil,
  defaultCmiSettings,
  isOpenCocWorkflowStatus,
  listCmiAuraConnections,
  type AcknowledgeCmiExpiryRequest,
  type AcknowledgeCmiInsightRequest,
  type CreateCmiAuditPackRequest,
  type CreateCmiAuraInsightRequest,
  type CmiAuditPrepPackSummary,
  type CmiAuraInsightSummary,
  type CmiComplianceCheckSummary,
  type CmiCocWorkflowSummary,
  type CmiDashboard,
  type CmiExpiryItemSummary,
  type CmiRecommendationDraftSummary,
  type CmiSansStandardSummary,
  type CmiSettings,
  type DecideCmiRecommendationRequest,
  type RefreshCmiRecommendationsRequest,
  type RunCmiChecksRequest,
  type UpdateCmiCocWorkflowStatusRequest,
  type UpdateCmiSettingsRequest,
  type UpsertCmiCocWorkflowRequest,
  type UpsertCmiSansStandardRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  assetEquipment,
  cmiAuditPrepPacks,
  cmiAuraInsights,
  cmiCocWorkflows,
  cmiComplianceChecks,
  cmiExpiryItems,
  cmiRecommendationDrafts,
  cmiSansStandards,
  cmiSettings,
  customers,
  cxCustomerProperties,
  diDocumentProfiles,
  documents,
  jobs,
  lcComplianceRecords,
  lcInsurancePolicies,
  securityAuditLogs,
} from '@titan/db';

/**
 * Compliance Intelligence (Department 14)
 *
 * Extends real documents / DI profiles / legal compliance / properties / jobs / equipment.
 * Never invents compliance records. Never auto-certifies.
 */

export class ComplianceIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ComplianceIntelligenceError';
  }
}

export type CmiActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class ComplianceIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: CmiActor): void {
    if (!canAccessComplianceIntelligence(actor)) {
      throw new ComplianceIntelligenceError(
        'FORBIDDEN',
        'Compliance Intelligence requires legal_compliance or documents access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: CmiActor): void {
    this.assertRead(actor);
    if (!canWriteComplianceIntelligence(actor)) {
      throw new ComplianceIntelligenceError(
        'FORBIDDEN',
        'Write actions require legal_compliance:write/manage or documents:write.',
      );
    }
  }

  private assertApprove(actor: CmiActor): void {
    this.assertWrite(actor);
    if (!canApproveComplianceIntelligenceDrafts(actor)) {
      throw new ComplianceIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may approve compliance intelligence recommendation drafts.',
      );
    }
  }

  private assertManageSettings(actor: CmiActor): void {
    this.assertWrite(actor);
    if (!canManageComplianceIntelligenceSettings(actor)) {
      throw new ComplianceIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may change Compliance Intelligence settings.',
      );
    }
  }

  private async recordAudit(
    actor: CmiActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'compliance_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoCertificationEnabled: false,
        inventComplianceRecordsEnabled: false,
        autoExecuteActionsEnabled: false,
        autoExecuted: false,
        fakeComplianceRecords: false,
      },
    });
  }

  private async ensureSettings(actor: CmiActor): Promise<CmiSettings> {
    const existing = await this.db.query.cmiSettings.findFirst({
      where: eq(cmiSettings.companyId, actor.companyId),
    });
    if (existing) {
      return defaultCmiSettings({
        id: existing.id,
        sansTrackingEnabled: existing.sansTrackingEnabled,
        cocWorkflowsEnabled: existing.cocWorkflowsEnabled,
        complianceChecksEnabled: existing.complianceChecksEnabled,
        expiryTrackingEnabled: existing.expiryTrackingEnabled,
        auditPrepEnabled: existing.auditPrepEnabled,
        reminderLeadDays: existing.reminderLeadDays,
        notes: existing.notes,
        updatedAt: existing.updatedAt.toISOString(),
      });
    }
    const [created] = await this.db
      .insert(cmiSettings)
      .values({
        companyId: actor.companyId,
        autoCertificationEnabled: false,
        inventComplianceRecordsEnabled: false,
        autoExecuteActionsEnabled: false,
        updatedByUserId: actor.userId,
      })
      .returning();
    return defaultCmiSettings({
      id: created.id,
      sansTrackingEnabled: created.sansTrackingEnabled,
      cocWorkflowsEnabled: created.cocWorkflowsEnabled,
      complianceChecksEnabled: created.complianceChecksEnabled,
      expiryTrackingEnabled: created.expiryTrackingEnabled,
      auditPrepEnabled: created.auditPrepEnabled,
      reminderLeadDays: created.reminderLeadDays,
      notes: created.notes,
      updatedAt: created.updatedAt.toISOString(),
    });
  }

  private toRecommendation(
    row: typeof cmiRecommendationDrafts.$inferSelect,
  ): CmiRecommendationDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      documentId: row.documentId,
      jobId: row.jobId,
      propertyId: row.propertyId,
      equipmentId: row.equipmentId,
      cocWorkflowId: row.cocWorkflowId,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof cmiAuraInsights.$inferSelect): CmiAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceRecommendationId: row.sourceRecommendationId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toCheck(row: typeof cmiComplianceChecks.$inferSelect): CmiComplianceCheckSummary {
    return {
      id: row.id,
      kind: row.kind,
      result: row.result,
      title: row.title,
      detail: row.detail,
      documentId: row.documentId,
      jobId: row.jobId,
      propertyId: row.propertyId,
      equipmentId: row.equipmentId,
      cocWorkflowId: row.cocWorkflowId,
      certificationDecision: false,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toExpiry(row: typeof cmiExpiryItems.$inferSelect): CmiExpiryItemSummary {
    return {
      id: row.id,
      source: row.source,
      status: row.status,
      title: row.title,
      expiresAt: row.expiresAt.toISOString(),
      daysUntilExpiry: cmiDaysUntil(row.expiresAt.toISOString()),
      documentId: row.documentId,
      cocWorkflowId: row.cocWorkflowId,
      equipmentId: row.equipmentId,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    };
  }

  private async loadSans(companyId: string): Promise<CmiSansStandardSummary[]> {
    const rows = await this.db.query.cmiSansStandards.findMany({
      where: eq(cmiSansStandards.companyId, companyId),
      orderBy: [desc(cmiSansStandards.updatedAt)],
      limit: 100,
    });
    const workflows = await this.db.query.cmiCocWorkflows.findMany({
      where: eq(cmiCocWorkflows.companyId, companyId),
      columns: { sansStandardId: true },
    });
    const counts = new Map<string, number>();
    for (const w of workflows) {
      if (!w.sansStandardId) continue;
      counts.set(w.sansStandardId, (counts.get(w.sansStandardId) ?? 0) + 1);
    }
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      status: row.status,
      notes: row.notes,
      linkedWorkflowCount: counts.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async loadWorkflows(companyId: string): Promise<CmiCocWorkflowSummary[]> {
    const rows = await this.db.query.cmiCocWorkflows.findMany({
      where: eq(cmiCocWorkflows.companyId, companyId),
      orderBy: [desc(cmiCocWorkflows.updatedAt)],
      limit: 100,
    });
    if (rows.length === 0) return [];

    const docIds = [...new Set(rows.map((r) => r.documentId).filter(Boolean))] as string[];
    const jobIds = [...new Set(rows.map((r) => r.jobId).filter(Boolean))] as string[];
    const propertyIds = [...new Set(rows.map((r) => r.propertyId).filter(Boolean))] as string[];
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean))] as string[];
    const sansIds = [...new Set(rows.map((r) => r.sansStandardId).filter(Boolean))] as string[];

    const [docs, jobRows, props, custs, sans] = await Promise.all([
      docIds.length
        ? this.db.query.documents.findMany({
            where: and(eq(documents.companyId, companyId), inArray(documents.id, docIds)),
            columns: { id: true, title: true },
          })
        : Promise.resolve([]),
      jobIds.length
        ? this.db.query.jobs.findMany({
            where: and(eq(jobs.companyId, companyId), inArray(jobs.id, jobIds)),
            columns: { id: true, title: true },
          })
        : Promise.resolve([]),
      propertyIds.length
        ? this.db.query.cxCustomerProperties.findMany({
            where: and(
              eq(cxCustomerProperties.companyId, companyId),
              inArray(cxCustomerProperties.id, propertyIds),
            ),
            columns: { id: true, propertyName: true },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.db.query.customers.findMany({
            where: and(eq(customers.companyId, companyId), inArray(customers.id, customerIds)),
            columns: { id: true, name: true },
          })
        : Promise.resolve([]),
      sansIds.length
        ? this.db.query.cmiSansStandards.findMany({
            where: and(
              eq(cmiSansStandards.companyId, companyId),
              inArray(cmiSansStandards.id, sansIds),
            ),
            columns: { id: true, code: true },
          })
        : Promise.resolve([]),
    ]);

    const docMap = new Map(docs.map((d) => [d.id, d.title]));
    const jobMap = new Map(jobRows.map((j) => [j.id, j.title]));
    const propMap = new Map(props.map((p) => [p.id, p.propertyName]));
    const custMap = new Map(custs.map((c) => [c.id, c.name]));
    const sansMap = new Map(sans.map((s) => [s.id, s.code]));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      autoCertified: false as const,
      documentId: row.documentId,
      documentTitle: row.documentId ? (docMap.get(row.documentId) ?? null) : null,
      jobId: row.jobId,
      jobTitle: row.jobId ? (jobMap.get(row.jobId) ?? null) : null,
      propertyId: row.propertyId,
      propertyName: row.propertyId ? (propMap.get(row.propertyId) ?? null) : null,
      customerId: row.customerId,
      customerName: row.customerId ? (custMap.get(row.customerId) ?? null) : null,
      sansStandardId: row.sansStandardId,
      sansCode: row.sansStandardId ? (sansMap.get(row.sansStandardId) ?? null) : null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getDashboard(actor: CmiActor): Promise<CmiDashboard> {
    this.assertRead(actor);
    const settings = await this.ensureSettings(actor);
    const companyId = actor.companyId;

    const [sansStandards, cocWorkflows, checks, expiryRows, packs, drafts, insights] =
      await Promise.all([
        this.loadSans(companyId),
        this.loadWorkflows(companyId),
        this.db.query.cmiComplianceChecks.findMany({
          where: eq(cmiComplianceChecks.companyId, companyId),
          orderBy: [desc(cmiComplianceChecks.createdAt)],
          limit: 100,
        }),
        this.db.query.cmiExpiryItems.findMany({
          where: eq(cmiExpiryItems.companyId, companyId),
          orderBy: [desc(cmiExpiryItems.expiresAt)],
          limit: 100,
        }),
        this.db.query.cmiAuditPrepPacks.findMany({
          where: eq(cmiAuditPrepPacks.companyId, companyId),
          orderBy: [desc(cmiAuditPrepPacks.updatedAt)],
          limit: 50,
        }),
        this.db.query.cmiRecommendationDrafts.findMany({
          where: eq(cmiRecommendationDrafts.companyId, companyId),
          orderBy: [desc(cmiRecommendationDrafts.createdAt)],
          limit: 100,
        }),
        this.db.query.cmiAuraInsights.findMany({
          where: eq(cmiAuraInsights.companyId, companyId),
          orderBy: [desc(cmiAuraInsights.createdAt)],
          limit: 50,
        }),
      ]);

    const complianceChecks = checks.map((c) => this.toCheck(c));
    const expiryItems = expiryRows.map((e) => this.toExpiry(e));
    const auditPacks: CmiAuditPrepPackSummary[] = packs.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      scopeNote: p.scopeNote,
      documentCount: p.documentIds.length,
      checkCount: p.checkIds.length,
      gapCount: p.gapCount,
      readiness: p.readinessAvailable ? 'available' : 'unavailable',
      readinessRationale: p.readinessRationale,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
    const recommendationDrafts = drafts.map((d) => this.toRecommendation(d));
    const auraInsights = insights.map((i) => this.toInsight(i));

    const openWorkflows = cocWorkflows.filter((w) => isOpenCocWorkflowStatus(w.status));
    const issuedCount = cocWorkflows.filter((w) => w.status === 'issued').length;
    const expiredWorkflows = cocWorkflows.filter((w) => w.status === 'expired').length;
    const passCount = complianceChecks.filter((c) => c.result === 'pass').length;
    const failCount = complianceChecks.filter((c) => c.result === 'fail').length;
    const incompleteCount = complianceChecks.filter((c) => c.result === 'incomplete').length;
    const openExpiry = expiryItems.filter((e) => e.status === 'open');
    const expiringSoon = openExpiry.filter(
      (e) => e.daysUntilExpiry != null && e.daysUntilExpiry >= 0 && e.daysUntilExpiry <= settings.reminderLeadDays,
    );
    const expiredItems = openExpiry.filter((e) => e.daysUntilExpiry != null && e.daysUntilExpiry < 0);
    const readyPacks = auditPacks.filter((p) => p.status === 'ready_for_review').length;
    const pendingApprovals = recommendationDrafts.filter((d) =>
      ['draft', 'pending_approval'].includes(d.status),
    ).length;

    const sans = buildCmiSansSnapshot({ trackedCount: sansStandards.length });
    const coc = buildCmiCocSnapshot({
      openWorkflowCount: openWorkflows.length,
      issuedCount,
      expiredCount: expiredWorkflows,
      totalCount: cocWorkflows.length,
    });
    const checksSnap = buildCmiChecksSnapshot({
      passCount,
      failCount,
      incompleteCount,
      totalCount: complianceChecks.length,
    });
    const expiry = buildCmiExpirySnapshot({
      openCount: openExpiry.length,
      expiringSoonCount: expiringSoon.length,
      expiredCount: expiredItems.length,
      sourceCount: expiryItems.length,
    });
    const audit = buildCmiAuditSnapshot({
      packCount: auditPacks.length,
      readyCount: readyPacks,
    });

    return {
      summary: `Compliance Intelligence — ${sans.trackedCount} SANS tracked; ${coc.openWorkflowCount} open COC workflows; ${checksSnap.failCount} failed checks; ${expiry.openCount} open expiries; ${pendingApprovals} draft(s) awaiting Owner. Never auto-certifies.`,
      productClarification: {
        legalComplianceOps: CMI_PRODUCT_COPY.legalComplianceOps,
        documentIntelligenceOps: CMI_PRODUCT_COPY.documentIntelligenceOps,
        thisLayer: CMI_PRODUCT_COPY.thisLayer,
      },
      policy: {
        autoCertificationEnabled: false,
        inventComplianceRecordsEnabled: false,
        autoExecuteActionsEnabled: false,
        requiresOwnerApproval: true,
        fakeComplianceRecords: false,
      },
      sans,
      coc,
      checks: checksSnap,
      expiry,
      audit,
      sansStandards,
      cocWorkflows,
      complianceChecks,
      expiryItems,
      auditPacks,
      recommendationDrafts,
      auraInsights,
      auraConnections: listCmiAuraConnections(),
      settings,
      pendingApprovals,
    };
  }

  async upsertSansStandard(
    actor: CmiActor,
    input: UpsertCmiSansStandardRequest,
  ): Promise<CmiSansStandardSummary> {
    this.assertWrite(actor);
    const code = input.code.trim().toUpperCase();
    const title = input.title.trim();
    if (!code || !title) {
      throw new ComplianceIntelligenceError('VALIDATION_ERROR', 'SANS code and title are required.');
    }

    const existing = await this.db.query.cmiSansStandards.findFirst({
      where: and(eq(cmiSansStandards.companyId, actor.companyId), eq(cmiSansStandards.code, code)),
    });

    let row: typeof cmiSansStandards.$inferSelect;
    if (existing) {
      const [updated] = await this.db
        .update(cmiSansStandards)
        .set({
          title,
          status: input.status ?? existing.status,
          notes: input.notes === undefined ? existing.notes : input.notes,
          updatedAt: new Date(),
        })
        .where(
          and(eq(cmiSansStandards.id, existing.id), eq(cmiSansStandards.companyId, actor.companyId)),
        )
        .returning();
      row = updated;
      await this.recordAudit(actor, 'cmi_sans_standard_updated', row.id, { code });
    } else {
      const [inserted] = await this.db
        .insert(cmiSansStandards)
        .values({
          companyId: actor.companyId,
          code,
          title,
          status: input.status ?? 'tracked',
          notes: input.notes ?? null,
          createdByUserId: actor.userId,
          metadata: { source: 'company_entered' },
        })
        .returning();
      row = inserted;
      await this.recordAudit(actor, 'cmi_sans_standard_created', row.id, { code });
    }

    const list = await this.loadSans(actor.companyId);
    const match = list.find((s) => s.id === row.id);
    if (!match) throw new ComplianceIntelligenceError('NOT_FOUND', 'SANS standard not found after save.');
    return match;
  }

  async upsertCocWorkflow(
    actor: CmiActor,
    input: UpsertCmiCocWorkflowRequest,
  ): Promise<CmiCocWorkflowSummary> {
    this.assertWrite(actor);
    const title = input.title.trim();
    if (!title) {
      throw new ComplianceIntelligenceError('VALIDATION_ERROR', 'COC workflow title is required.');
    }

    if (input.documentId) {
      const doc = await this.db.query.documents.findFirst({
        where: and(eq(documents.id, input.documentId), eq(documents.companyId, actor.companyId)),
      });
      if (!doc) {
        throw new ComplianceIntelligenceError('NOT_FOUND', 'Document not found in this company.');
      }
    }
    if (input.jobId) {
      const job = await this.db.query.jobs.findFirst({
        where: and(eq(jobs.id, input.jobId), eq(jobs.companyId, actor.companyId)),
      });
      if (!job) throw new ComplianceIntelligenceError('NOT_FOUND', 'Job not found in this company.');
    }
    if (input.propertyId) {
      const property = await this.db.query.cxCustomerProperties.findFirst({
        where: and(
          eq(cxCustomerProperties.id, input.propertyId),
          eq(cxCustomerProperties.companyId, actor.companyId),
        ),
      });
      if (!property) {
        throw new ComplianceIntelligenceError('NOT_FOUND', 'Property not found in this company.');
      }
    }
    if (input.customerId) {
      const customer = await this.db.query.customers.findFirst({
        where: and(eq(customers.id, input.customerId), eq(customers.companyId, actor.companyId)),
      });
      if (!customer) {
        throw new ComplianceIntelligenceError('NOT_FOUND', 'Customer not found in this company.');
      }
    }
    if (input.sansStandardId) {
      const sans = await this.db.query.cmiSansStandards.findFirst({
        where: and(
          eq(cmiSansStandards.id, input.sansStandardId),
          eq(cmiSansStandards.companyId, actor.companyId),
        ),
      });
      if (!sans) {
        throw new ComplianceIntelligenceError('NOT_FOUND', 'SANS standard not found in this company.');
      }
    }

    let expiresAt: Date | null = null;
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt);
      if (!Number.isFinite(expiresAt.getTime())) {
        throw new ComplianceIntelligenceError('VALIDATION_ERROR', 'Invalid expiresAt.');
      }
    }

    const [inserted] = await this.db
      .insert(cmiCocWorkflows)
      .values({
        companyId: actor.companyId,
        title,
        status: input.status ?? 'intake',
        autoCertified: false,
        documentId: input.documentId ?? null,
        jobId: input.jobId ?? null,
        propertyId: input.propertyId ?? null,
        customerId: input.customerId ?? null,
        sansStandardId: input.sansStandardId ?? null,
        expiresAt,
        notes: input.notes ?? null,
        createdByUserId: actor.userId,
        metadata: { source: 'compliance_intelligence', autoCertified: false },
      })
      .returning();

    await this.recordAudit(actor, 'cmi_coc_workflow_created', inserted.id, {
      status: inserted.status,
      documentId: inserted.documentId,
      autoCertified: false,
    });

    const list = await this.loadWorkflows(actor.companyId);
    const match = list.find((w) => w.id === inserted.id);
    if (!match) throw new ComplianceIntelligenceError('NOT_FOUND', 'COC workflow not found after create.');
    return match;
  }

  async updateCocWorkflowStatus(
    actor: CmiActor,
    workflowId: string,
    input: UpdateCmiCocWorkflowStatusRequest,
  ): Promise<CmiCocWorkflowSummary> {
    this.assertWrite(actor);
    if (input.status === 'issued') {
      this.assertApprove(actor);
    }

    const existing = await this.db.query.cmiCocWorkflows.findFirst({
      where: and(eq(cmiCocWorkflows.id, workflowId), eq(cmiCocWorkflows.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new ComplianceIntelligenceError('NOT_FOUND', 'COC workflow not found.');
    }

    const [updated] = await this.db
      .update(cmiCocWorkflows)
      .set({
        status: input.status,
        autoCertified: false,
        notes: input.notes === undefined ? existing.notes : input.notes.trim() || null,
        updatedAt: new Date(),
        metadata: {
          ...(existing.metadata ?? {}),
          lastStatusChangeBy: actor.userId,
          lastStatus: input.status,
          autoCertified: false,
          note: 'Status change is recorded only — never an automatic certification decision.',
        },
      })
      .where(
        and(eq(cmiCocWorkflows.id, workflowId), eq(cmiCocWorkflows.companyId, actor.companyId)),
      )
      .returning();

    await this.recordAudit(actor, 'cmi_coc_workflow_status_updated', updated.id, {
      status: updated.status,
      autoCertified: false,
      certificationDecision: false,
    });

    const list = await this.loadWorkflows(actor.companyId);
    const match = list.find((w) => w.id === updated.id);
    if (!match) throw new ComplianceIntelligenceError('NOT_FOUND', 'COC workflow not found after update.');
    return match;
  }

  async runComplianceChecks(
    actor: CmiActor,
    input: RunCmiChecksRequest = {},
  ): Promise<{ created: number; checks: CmiComplianceCheckSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.complianceChecksEnabled) {
      throw new ComplianceIntelligenceError(
        'INVALID_STATE',
        'Compliance checks are disabled in settings.',
      );
    }

    const created: CmiComplianceCheckSummary[] = [];
    const companyId = actor.companyId;

    const docConditions = [eq(documents.companyId, companyId)];
    if (input.jobId) docConditions.push(eq(documents.jobId, input.jobId));
    if (input.documentId) docConditions.push(eq(documents.id, input.documentId));
    const docs = await this.db.query.documents.findMany({
      where: and(...docConditions),
      limit: 250,
    });

    let diProfiles: Array<typeof diDocumentProfiles.$inferSelect> = [];
    try {
      diProfiles = await this.db.query.diDocumentProfiles.findMany({
        where: eq(diDocumentProfiles.companyId, companyId),
      });
    } catch {
      diProfiles = [];
    }
    const diByDoc = new Map(diProfiles.map((p) => [p.documentId, p]));

    const workflowConditions = [eq(cmiCocWorkflows.companyId, companyId)];
    if (input.jobId) workflowConditions.push(eq(cmiCocWorkflows.jobId, input.jobId));
    if (input.propertyId) workflowConditions.push(eq(cmiCocWorkflows.propertyId, input.propertyId));
    const workflows = await this.db.query.cmiCocWorkflows.findMany({
      where: and(...workflowConditions),
    });

    const jobsWithDocs = new Map<string, { hasCoc: boolean; docCount: number }>();
    for (const doc of docs) {
      if (!doc.jobId) continue;
      const entry = jobsWithDocs.get(doc.jobId) ?? { hasCoc: false, docCount: 0 };
      entry.docCount += 1;
      const profile = diByDoc.get(doc.id);
      if (profile?.documentType === 'coc' || /coc|compliance|certificate/i.test(doc.title)) {
        entry.hasCoc = true;
      }
      jobsWithDocs.set(doc.jobId, entry);
    }

    let checkBudget = 0;
    for (const [jobId, info] of jobsWithDocs) {
      if (checkBudget >= 20) break;
      if (input.jobId && jobId !== input.jobId) continue;
      const result = info.hasCoc ? 'pass' : 'fail';
      const draft = {
        kind: 'coc_present' as const,
        result: result as 'pass' | 'fail',
        title: info.hasCoc ? 'COC evidence present on job' : 'COC evidence missing on job',
        detail: info.hasCoc
          ? `Job has ${info.docCount} real document(s) including COC/certificate signal. Informational only — not a certification.`
          : `Job has ${info.docCount} real document(s) but no COC/certificate profile or title signal. Informational only — not a certification.`,
      };
      const [inserted] = await this.db
        .insert(cmiComplianceChecks)
        .values({
          companyId,
          kind: draft.kind,
          result: draft.result,
          title: draft.title,
          detail: draft.detail,
          jobId,
          certificationDecision: false,
          createdByUserId: actor.userId,
          metadata: { source: 'real_job_documents', hasCoc: info.hasCoc },
        })
        .returning();
      created.push(this.toCheck(inserted));
      checkBudget += 1;
    }

    for (const workflow of workflows.slice(0, 10)) {
      if (checkBudget >= 30) break;
      const sansResult = workflow.sansStandardId ? 'pass' : 'incomplete';
      const [inserted] = await this.db
        .insert(cmiComplianceChecks)
        .values({
          companyId,
          kind: 'sans_linked',
          result: sansResult,
          title: sansResult === 'pass' ? 'SANS linked on COC workflow' : 'SANS not linked on COC workflow',
          detail:
            sansResult === 'pass'
              ? 'Workflow links a company-tracked SANS standard. Not a certification decision.'
              : 'Workflow has no SANS standard linked yet. Incomplete — not invented, not certified.',
          documentId: workflow.documentId,
          jobId: workflow.jobId,
          propertyId: workflow.propertyId,
          cocWorkflowId: workflow.id,
          certificationDecision: false,
          createdByUserId: actor.userId,
          metadata: { source: 'real_coc_workflow' },
        })
        .returning();
      created.push(this.toCheck(inserted));
      checkBudget += 1;

      if (workflow.expiresAt) {
        const days = cmiDaysUntil(workflow.expiresAt.toISOString());
        const unexpired = days >= 0 ? 'pass' : 'fail';
        const [expCheck] = await this.db
          .insert(cmiComplianceChecks)
          .values({
            companyId,
            kind: 'coc_unexpired',
            result: unexpired,
            title: unexpired === 'pass' ? 'COC workflow unexpired' : 'COC workflow expired',
            detail: `Workflow expiry ${workflow.expiresAt.toISOString()} (${days} day(s)). Informational only — never auto-renews or auto-certifies.`,
            documentId: workflow.documentId,
            jobId: workflow.jobId,
            propertyId: workflow.propertyId,
            cocWorkflowId: workflow.id,
            certificationDecision: false,
            createdByUserId: actor.userId,
            metadata: { source: 'real_coc_workflow_expiry', daysUntilExpiry: days },
          })
          .returning();
        created.push(this.toCheck(expCheck));
        checkBudget += 1;
      }
    }

    if (input.propertyId || checkBudget < 30) {
      const propertyDocs = docs.filter((d) => {
        const profile = diByDoc.get(d.id);
        return input.propertyId
          ? profile?.propertyId === input.propertyId
          : Boolean(profile?.propertyId);
      });
      if (propertyDocs.length === 0 && input.propertyId) {
        const [inserted] = await this.db
          .insert(cmiComplianceChecks)
          .values({
            companyId,
            kind: 'property_docs',
            result: 'incomplete',
            title: 'No property-linked documents',
            detail:
              'No real DI profiles linked to this property yet. Incomplete — not invented.',
            propertyId: input.propertyId,
            certificationDecision: false,
            createdByUserId: actor.userId,
            metadata: { source: 'real_property_document_gap' },
          })
          .returning();
        created.push(this.toCheck(inserted));
      }
    }

    const insurance = await this.db.query.lcInsurancePolicies.findMany({
      where: eq(lcInsurancePolicies.companyId, companyId),
      limit: 20,
    });
    const [insCheck] = await this.db
      .insert(cmiComplianceChecks)
      .values({
        companyId,
        kind: 'insurance_present',
        result: insurance.length > 0 ? 'pass' : 'unavailable',
        title:
          insurance.length > 0
            ? 'Insurance policies present'
            : 'Insurance policies unavailable',
        detail:
          insurance.length > 0
            ? `${insurance.length} real LC insurance policy row(s). Informational only.`
            : 'No real LC insurance policy rows — unavailable (not invented).',
        certificationDecision: false,
        createdByUserId: actor.userId,
        metadata: { source: 'lc_insurance_policies', count: insurance.length },
      })
      .returning();
    created.push(this.toCheck(insCheck));

    for (const check of created) {
      await this.recordAudit(actor, 'cmi_compliance_check_created', check.id, {
        kind: check.kind,
        result: check.result,
        certificationDecision: false,
      });
    }

    return { created: created.length, checks: created };
  }

  async refreshRecommendations(
    actor: CmiActor,
    input: RefreshCmiRecommendationsRequest = {},
  ): Promise<{ created: number; drafts: CmiRecommendationDraftSummary[]; expiryItemsCreated: number }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    const leadDays = input.reminderLeadDays ?? settings.reminderLeadDays;
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const created: CmiRecommendationDraftSummary[] = [];
    let expiryItemsCreated = 0;
    const now = new Date();
    const companyId = actor.companyId;

    if (settings.expiryTrackingEnabled) {
      // DI profile expiries (soft — table may be mid-flight)
      let diProfiles: Array<typeof diDocumentProfiles.$inferSelect> = [];
      try {
        diProfiles = await this.db.query.diDocumentProfiles.findMany({
          where: eq(diDocumentProfiles.companyId, companyId),
        });
      } catch {
        diProfiles = [];
      }

      for (const profile of diProfiles) {
        if (!profile.expiresAt) continue;
        const days = cmiDaysUntil(profile.expiresAt.toISOString(), now);
        if (days > leadDays) continue;
        const doc = await this.db.query.documents.findFirst({
          where: and(eq(documents.id, profile.documentId), eq(documents.companyId, companyId)),
        });
        if (!doc) continue;

        const openItem = await this.db.query.cmiExpiryItems.findFirst({
          where: and(
            eq(cmiExpiryItems.companyId, companyId),
            eq(cmiExpiryItems.documentId, profile.documentId),
            eq(cmiExpiryItems.source, 'di_document_profile'),
            eq(cmiExpiryItems.status, 'open'),
          ),
        });
        if (!openItem) {
          await this.db.insert(cmiExpiryItems).values({
            companyId,
            source: 'di_document_profile',
            status: 'open',
            title: doc.title,
            expiresAt: profile.expiresAt,
            documentId: profile.documentId,
            sourceRef: profile.id,
            note: `DI profile expiry (${profile.documentType}).`,
            createdByUserId: actor.userId,
            metadata: { source: 'di_document_profiles', daysUntilExpiry: days },
          });
          expiryItemsCreated += 1;
        }

        const openDraft = await this.db.query.cmiRecommendationDrafts.findFirst({
          where: and(
            eq(cmiRecommendationDrafts.companyId, companyId),
            eq(cmiRecommendationDrafts.kind, 'expiry_alert'),
            eq(cmiRecommendationDrafts.documentId, profile.documentId),
            inArray(cmiRecommendationDrafts.status, ['draft', 'pending_approval']),
          ),
        });
        if (openDraft) continue;

        const draft = buildCmiExpiryAlertDraft({
          title: doc.title,
          expiresAt: profile.expiresAt.toISOString(),
          daysUntilExpiry: days,
          source: 'di_document_profile',
        });
        const [inserted] = await this.db
          .insert(cmiRecommendationDrafts)
          .values({
            companyId,
            kind: draft.kind,
            status,
            title: draft.title,
            body: draft.body,
            documentId: profile.documentId,
            propertyId: profile.propertyId,
            autoExecuted: false,
            createdByUserId: actor.userId,
            metadata: { source: 'di_document_profile', daysUntilExpiry: days },
          })
          .returning();
        created.push(this.toRecommendation(inserted));
        await this.recordAudit(actor, 'cmi_recommendation_draft_created', inserted.id, {
          kind: draft.kind,
        });
      }

      // COC workflow expiries
      const workflows = await this.db.query.cmiCocWorkflows.findMany({
        where: eq(cmiCocWorkflows.companyId, companyId),
      });
      for (const workflow of workflows) {
        if (!workflow.expiresAt) continue;
        const days = cmiDaysUntil(workflow.expiresAt.toISOString(), now);
        if (days > leadDays) continue;

        const openItem = await this.db.query.cmiExpiryItems.findFirst({
          where: and(
            eq(cmiExpiryItems.companyId, companyId),
            eq(cmiExpiryItems.cocWorkflowId, workflow.id),
            eq(cmiExpiryItems.source, 'coc_workflow'),
            eq(cmiExpiryItems.status, 'open'),
          ),
        });
        if (!openItem) {
          await this.db.insert(cmiExpiryItems).values({
            companyId,
            source: 'coc_workflow',
            status: 'open',
            title: workflow.title,
            expiresAt: workflow.expiresAt,
            documentId: workflow.documentId,
            cocWorkflowId: workflow.id,
            sourceRef: workflow.id,
            note: 'COC workflow expiry.',
            createdByUserId: actor.userId,
            metadata: { source: 'cmi_coc_workflows', daysUntilExpiry: days },
          });
          expiryItemsCreated += 1;
        }

        const openDraft = await this.db.query.cmiRecommendationDrafts.findFirst({
          where: and(
            eq(cmiRecommendationDrafts.companyId, companyId),
            eq(cmiRecommendationDrafts.kind, 'expiry_alert'),
            eq(cmiRecommendationDrafts.cocWorkflowId, workflow.id),
            inArray(cmiRecommendationDrafts.status, ['draft', 'pending_approval']),
          ),
        });
        if (openDraft) continue;

        const draft = buildCmiExpiryAlertDraft({
          title: workflow.title,
          expiresAt: workflow.expiresAt.toISOString(),
          daysUntilExpiry: days,
          source: 'coc_workflow',
        });
        const [inserted] = await this.db
          .insert(cmiRecommendationDrafts)
          .values({
            companyId,
            kind: draft.kind,
            status,
            title: draft.title,
            body: draft.body,
            documentId: workflow.documentId,
            jobId: workflow.jobId,
            propertyId: workflow.propertyId,
            cocWorkflowId: workflow.id,
            autoExecuted: false,
            createdByUserId: actor.userId,
            metadata: { source: 'coc_workflow', daysUntilExpiry: days },
          })
          .returning();
        created.push(this.toRecommendation(inserted));
        await this.recordAudit(actor, 'cmi_recommendation_draft_created', inserted.id, {
          kind: draft.kind,
        });
      }

      // Equipment warranties
      const assets = await this.db.query.assetEquipment.findMany({
        where: eq(assetEquipment.companyId, companyId),
        limit: 100,
      });
      for (const asset of assets) {
        if (!asset.warrantyExpiresAt) continue;
        const days = cmiDaysUntil(asset.warrantyExpiresAt.toISOString(), now);
        if (days > leadDays) continue;

        const openItem = await this.db.query.cmiExpiryItems.findFirst({
          where: and(
            eq(cmiExpiryItems.companyId, companyId),
            eq(cmiExpiryItems.equipmentId, asset.id),
            eq(cmiExpiryItems.source, 'asset_warranty'),
            eq(cmiExpiryItems.status, 'open'),
          ),
        });
        if (!openItem) {
          await this.db.insert(cmiExpiryItems).values({
            companyId,
            source: 'asset_warranty',
            status: 'open',
            title: `Warranty — ${asset.name}`,
            expiresAt: asset.warrantyExpiresAt,
            equipmentId: asset.id,
            sourceRef: asset.id,
            note: 'Equipment warranty expiry from asset_equipment.',
            createdByUserId: actor.userId,
            metadata: { source: 'asset_equipment', daysUntilExpiry: days },
          });
          expiryItemsCreated += 1;
        }
      }

      // LC compliance + insurance expiries
      const lcRecords = await this.db.query.lcComplianceRecords.findMany({
        where: eq(lcComplianceRecords.companyId, companyId),
        limit: 100,
      });
      for (const record of lcRecords) {
        if (!record.expiryDate) continue;
        const expiresAt = new Date(`${record.expiryDate}T00:00:00.000Z`);
        if (!Number.isFinite(expiresAt.getTime())) continue;
        const days = cmiDaysUntil(expiresAt.toISOString(), now);
        if (days > leadDays) continue;
        const openItem = await this.db.query.cmiExpiryItems.findFirst({
          where: and(
            eq(cmiExpiryItems.companyId, companyId),
            eq(cmiExpiryItems.source, 'lc_compliance_record'),
            eq(cmiExpiryItems.sourceRef, record.id),
            eq(cmiExpiryItems.status, 'open'),
          ),
        });
        if (!openItem) {
          await this.db.insert(cmiExpiryItems).values({
            companyId,
            source: 'lc_compliance_record',
            status: 'open',
            title: record.title,
            expiresAt,
            sourceRef: record.id,
            note: 'LC compliance record expiry.',
            createdByUserId: actor.userId,
            metadata: { source: 'lc_compliance_records', daysUntilExpiry: days },
          });
          expiryItemsCreated += 1;
        }
      }

      const insurance = await this.db.query.lcInsurancePolicies.findMany({
        where: eq(lcInsurancePolicies.companyId, companyId),
        limit: 100,
      });
      for (const policy of insurance) {
        if (!policy.expiryDate) continue;
        const expiresAt = new Date(`${policy.expiryDate}T00:00:00.000Z`);
        if (!Number.isFinite(expiresAt.getTime())) continue;
        const days = cmiDaysUntil(expiresAt.toISOString(), now);
        if (days > leadDays) continue;
        const openItem = await this.db.query.cmiExpiryItems.findFirst({
          where: and(
            eq(cmiExpiryItems.companyId, companyId),
            eq(cmiExpiryItems.source, 'lc_insurance_policy'),
            eq(cmiExpiryItems.sourceRef, policy.id),
            eq(cmiExpiryItems.status, 'open'),
          ),
        });
        if (!openItem) {
          await this.db.insert(cmiExpiryItems).values({
            companyId,
            source: 'lc_insurance_policy',
            status: 'open',
            title: `Insurance — ${policy.policyNumber}`,
            expiresAt,
            sourceRef: policy.id,
            note: 'LC insurance policy expiry.',
            createdByUserId: actor.userId,
            metadata: { source: 'lc_insurance_policies', daysUntilExpiry: days },
          });
          expiryItemsCreated += 1;
        }
      }
    }

    // Missing doc / compliance risk drafts from recent failed checks
    const recentFails = await this.db.query.cmiComplianceChecks.findMany({
      where: and(
        eq(cmiComplianceChecks.companyId, companyId),
        inArray(cmiComplianceChecks.result, ['fail', 'incomplete']),
      ),
      orderBy: [desc(cmiComplianceChecks.createdAt)],
      limit: 15,
    });

    for (const check of recentFails) {
      if (created.length >= 25) break;
      const openDraft = await this.db.query.cmiRecommendationDrafts.findFirst({
        where: and(
          eq(cmiRecommendationDrafts.companyId, companyId),
          inArray(cmiRecommendationDrafts.status, ['draft', 'pending_approval']),
          sql`${cmiRecommendationDrafts.metadata}->>'checkId' = ${check.id}`,
        ),
      });
      if (openDraft) continue;

      const draft =
        check.kind === 'coc_present' || check.kind === 'job_docs' || check.kind === 'property_docs'
          ? buildCmiMissingDocDraft({
              missingLabel: check.kind === 'coc_present' ? 'COC' : 'compliance document',
              scope: check.jobId
                ? `job ${check.jobId}`
                : check.propertyId
                  ? `property ${check.propertyId}`
                  : null,
            })
          : buildCmiComplianceRiskDraft({
              title: check.title,
              detail: check.detail,
              checkKind: check.kind,
            });

      const [inserted] = await this.db
        .insert(cmiRecommendationDrafts)
        .values({
          companyId,
          kind: draft.kind,
          status,
          title: draft.title,
          body: draft.body,
          documentId: check.documentId,
          jobId: check.jobId,
          propertyId: check.propertyId,
          equipmentId: check.equipmentId,
          cocWorkflowId: check.cocWorkflowId,
          autoExecuted: false,
          createdByUserId: actor.userId,
          metadata: { source: 'compliance_check', checkId: check.id, checkKind: check.kind },
        })
        .returning();
      created.push(this.toRecommendation(inserted));
      await this.recordAudit(actor, 'cmi_recommendation_draft_created', inserted.id, {
        kind: draft.kind,
        checkId: check.id,
      });
    }

    return { created: created.length, drafts: created, expiryItemsCreated };
  }

  async decideRecommendation(
    actor: CmiActor,
    draftId: string,
    input: DecideCmiRecommendationRequest,
  ): Promise<CmiRecommendationDraftSummary> {
    this.assertApprove(actor);
    const draft = await this.db.query.cmiRecommendationDrafts.findFirst({
      where: and(
        eq(cmiRecommendationDrafts.id, draftId),
        eq(cmiRecommendationDrafts.companyId, actor.companyId),
      ),
    });
    if (!draft) {
      throw new ComplianceIntelligenceError('NOT_FOUND', 'Recommendation draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(draft.status) && input.decision !== 'acknowledge') {
      throw new ComplianceIntelligenceError(
        'INVALID_STATE',
        `Cannot ${input.decision} a draft in status ${draft.status}.`,
      );
    }

    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'acknowledged';

    const [updated] = await this.db
      .update(cmiRecommendationDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes?.trim() || null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cmiRecommendationDrafts.id, draftId),
          eq(cmiRecommendationDrafts.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, `cmi_recommendation_draft_${nextStatus}`, updated.id, {
      kind: updated.kind,
      decision: input.decision,
      autoExecuted: false,
      certificationDecision: false,
    });
    return this.toRecommendation(updated);
  }

  async acknowledgeExpiry(
    actor: CmiActor,
    itemId: string,
    input: AcknowledgeCmiExpiryRequest,
  ): Promise<CmiExpiryItemSummary> {
    this.assertWrite(actor);
    const item = await this.db.query.cmiExpiryItems.findFirst({
      where: and(eq(cmiExpiryItems.id, itemId), eq(cmiExpiryItems.companyId, actor.companyId)),
    });
    if (!item) {
      throw new ComplianceIntelligenceError('NOT_FOUND', 'Expiry item not found.');
    }

    const [updated] = await this.db
      .update(cmiExpiryItems)
      .set({
        status: input.status,
        acknowledgedByUserId: actor.userId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(cmiExpiryItems.id, itemId), eq(cmiExpiryItems.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, 'cmi_expiry_item_acknowledged', updated.id, {
      status: input.status,
    });
    return this.toExpiry(updated);
  }

  async createAuditPack(
    actor: CmiActor,
    input: CreateCmiAuditPackRequest,
  ): Promise<CmiAuditPrepPackSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.auditPrepEnabled) {
      throw new ComplianceIntelligenceError('INVALID_STATE', 'Audit preparation is disabled.');
    }

    const title = input.title.trim();
    if (!title) {
      throw new ComplianceIntelligenceError('VALIDATION_ERROR', 'Audit pack title is required.');
    }

    let documentIds = input.documentIds ?? [];
    if (documentIds.length === 0) {
      const docs = await this.db.query.documents.findMany({
        where: eq(documents.companyId, actor.companyId),
        columns: { id: true },
        limit: 50,
      });
      documentIds = docs.map((d) => d.id);
    } else {
      const found = await this.db.query.documents.findMany({
        where: and(
          eq(documents.companyId, actor.companyId),
          inArray(documents.id, documentIds),
        ),
        columns: { id: true },
      });
      documentIds = found.map((d) => d.id);
    }

    const checks = await this.db.query.cmiComplianceChecks.findMany({
      where: eq(cmiComplianceChecks.companyId, actor.companyId),
      orderBy: [desc(cmiComplianceChecks.createdAt)],
      limit: 50,
    });
    const checkIds = checks.map((c) => c.id);
    const gapCount = checks.filter((c) => c.result === 'fail' || c.result === 'incomplete').length;
    const readinessAvailable = documentIds.length > 0;
    const readinessRationale = readinessAvailable
      ? `Pack assembled from ${documentIds.length} real document(s) and ${checkIds.length} check(s); ${gapCount} gap(s). Not a certification.`
      : 'No real documents available to assemble — readiness unavailable (not invented).';

    const [inserted] = await this.db
      .insert(cmiAuditPrepPacks)
      .values({
        companyId: actor.companyId,
        title,
        status: readinessAvailable ? 'ready_for_review' : 'draft',
        scopeNote: input.scopeNote?.trim() || 'Assembled from real company documents and checks.',
        documentIds,
        checkIds,
        gapCount,
        readinessAvailable,
        readinessRationale,
        createdByUserId: actor.userId,
        metadata: { source: 'compliance_intelligence_audit_prep', fakeEvidence: false },
      })
      .returning();

    await this.recordAudit(actor, 'cmi_audit_prep_pack_created', inserted.id, {
      documentCount: documentIds.length,
      gapCount,
    });

    return {
      id: inserted.id,
      title: inserted.title,
      status: inserted.status,
      scopeNote: inserted.scopeNote,
      documentCount: inserted.documentIds.length,
      checkCount: inserted.checkIds.length,
      gapCount: inserted.gapCount,
      readiness: inserted.readinessAvailable ? 'available' : 'unavailable',
      readinessRationale: inserted.readinessRationale,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    };
  }

  async updateSettings(actor: CmiActor, input: UpdateCmiSettingsRequest): Promise<CmiSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);
    const [updated] = await this.db
      .update(cmiSettings)
      .set({
        sansTrackingEnabled: input.sansTrackingEnabled,
        cocWorkflowsEnabled: input.cocWorkflowsEnabled,
        complianceChecksEnabled: input.complianceChecksEnabled,
        expiryTrackingEnabled: input.expiryTrackingEnabled,
        auditPrepEnabled: input.auditPrepEnabled,
        reminderLeadDays:
          input.reminderLeadDays != null
            ? Math.min(Math.max(input.reminderLeadDays, 1), 365)
            : undefined,
        notes: input.notes === undefined ? undefined : input.notes,
        autoCertificationEnabled: false,
        inventComplianceRecordsEnabled: false,
        autoExecuteActionsEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(cmiSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'cmi_settings_updated', updated.id, {
      sansTrackingEnabled: updated.sansTrackingEnabled,
      cocWorkflowsEnabled: updated.cocWorkflowsEnabled,
    });

    return defaultCmiSettings({
      id: updated.id,
      sansTrackingEnabled: updated.sansTrackingEnabled,
      cocWorkflowsEnabled: updated.cocWorkflowsEnabled,
      complianceChecksEnabled: updated.complianceChecksEnabled,
      expiryTrackingEnabled: updated.expiryTrackingEnabled,
      auditPrepEnabled: updated.auditPrepEnabled,
      reminderLeadDays: updated.reminderLeadDays,
      notes: updated.notes,
      updatedAt: updated.updatedAt.toISOString(),
    });
  }

  async createAuraInsight(
    actor: CmiActor,
    input: CreateCmiAuraInsightRequest,
  ): Promise<CmiAuraInsightSummary> {
    this.assertWrite(actor);

    if (input.sourceRecommendationId) {
      const source = await this.db.query.cmiRecommendationDrafts.findFirst({
        where: and(
          eq(cmiRecommendationDrafts.id, input.sourceRecommendationId),
          eq(cmiRecommendationDrafts.companyId, actor.companyId),
        ),
      });
      if (!source) {
        throw new ComplianceIntelligenceError(
          'NOT_FOUND',
          'Source recommendation draft not found.',
        );
      }
    }

    const [inserted] = await this.db
      .insert(cmiAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        title: input.title.trim(),
        insight: input.insight.trim(),
        href: input.href?.trim() || null,
        sourceRecommendationId: input.sourceRecommendationId ?? null,
        createdByUserId: actor.userId,
        metadata: { source: 'compliance_intelligence' },
      })
      .returning();
    await this.recordAudit(actor, 'cmi_aura_insight_created', inserted.id, {
      target: inserted.target,
    });
    return this.toInsight(inserted);
  }

  async acknowledgeAuraInsight(
    actor: CmiActor,
    insightId: string,
    input: AcknowledgeCmiInsightRequest,
  ): Promise<CmiAuraInsightSummary> {
    this.assertWrite(actor);
    const [updated] = await this.db
      .update(cmiAuraInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(eq(cmiAuraInsights.id, insightId), eq(cmiAuraInsights.companyId, actor.companyId)),
      )
      .returning();
    if (!updated) {
      throw new ComplianceIntelligenceError('NOT_FOUND', 'AURA insight not found.');
    }
    await this.recordAudit(actor, 'cmi_aura_insight_acknowledged', updated.id, {
      status: input.status,
    });
    return this.toInsight(updated);
  }
}
