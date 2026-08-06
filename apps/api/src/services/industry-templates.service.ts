import { and, desc, eq } from 'drizzle-orm';
import {
  ITPL_DEFAULT_SETTINGS,
  ITPL_NO_TENANT_SEEDING_STATEMENT,
  ITPL_SINGLE_CORE_STATEMENT,
  buildItplBlueprint,
  buildItplCatalog,
  buildItplWithheldNotices,
  canActivateItplTemplate,
  canEditItplTemplates,
  canItplVersionActivate,
  filterItplDefinitionForScope,
  findItplBusinessRecordFields,
  itplChangeRequiresApproval,
  itplTradeLabel,
  normaliseItplDefinition,
  normaliseItplSettings,
  resolveItplChangeImpact,
  resolveItplScope,
  resolveItplTemplateSupport,
  type ActivateItplTemplateRequest,
  type CreateItplTemplateRequest,
  type DecideItplVersionRequest,
  type ItplActivationSummary,
  type ItplChangeImpact,
  type ItplDashboard,
  type ItplScope,
  type ItplSettings,
  type ItplTemplateDefinition,
  type ItplTemplateDetail,
  type ItplTemplateSummary,
  type ItplVersionSummary,
  type SaveItplVersionRequest,
  type UpdateItplSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  itplActivations,
  itplAuditEvents,
  itplSettings,
  itplTemplateVersions,
  itplTemplates,
} from '@titan/db';

export class IndustryTemplatesError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'IndustryTemplatesError';
  }
}

export interface ItplActor {
  companyId: string;
  userId: string;
  roleName?: string | null;
  permissions?: string[] | null;
}

export interface ItplAuditEntry {
  id: string;
  eventKind: string;
  templateId: string | null;
  subjectKey: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
}

type EventKind =
  | 'template_created'
  | 'version_saved'
  | 'version_submitted'
  | 'version_decided'
  | 'template_activated'
  | 'template_archived'
  | 'settings_updated'
  | 'access_denied';

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'template'
  );
}

export class IndustryTemplatesService {
  constructor(private readonly db: DatabaseClient) {}

  /* ---------------------------------------------------------------------- */
  /* Access                                                                  */
  /* ---------------------------------------------------------------------- */

  private scopeFor(actor: ItplActor): ItplScope {
    return resolveItplScope({
      roleName: actor.roleName,
      permissions: actor.permissions,
      userId: actor.userId,
    });
  }

  private assertRead(actor: ItplActor): ItplScope {
    const scope = this.scopeFor(actor);
    if (scope === 'denied') {
      throw new IndustryTemplatesError(
        'FORBIDDEN',
        'Industry templates are not available to this role.',
      );
    }
    return scope;
  }

  private assertEdit(actor: ItplActor): void {
    if (!canEditItplTemplates({ roleName: actor.roleName, permissions: actor.permissions })) {
      throw new IndustryTemplatesError(
        'FORBIDDEN',
        'Only the Owner or an administrator can change template architecture.',
      );
    }
  }

  private assertOwner(actor: ItplActor): void {
    if (!canActivateItplTemplate({ roleName: actor.roleName, permissions: actor.permissions })) {
      throw new IndustryTemplatesError(
        'FORBIDDEN',
        'Only the Owner can approve a live-workflow change or choose the active template.',
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Settings                                                                */
  /* ---------------------------------------------------------------------- */

  async getSettings(companyId: string): Promise<ItplSettings> {
    const row = await this.db.query.itplSettings.findFirst({
      where: eq(itplSettings.companyId, companyId),
    });
    if (!row) return { ...ITPL_DEFAULT_SETTINGS };
    return normaliseItplSettings({
      technicianReadEnabled: row.technicianReadEnabled,
      notes: row.notes,
    });
  }

  async updateSettings(
    actor: ItplActor,
    input: UpdateItplSettingsRequest,
  ): Promise<ItplSettings> {
    this.assertRead(actor);
    this.assertOwner(actor);

    const current = await this.getSettings(actor.companyId);
    const next = normaliseItplSettings({ ...current, ...input });

    const existing = await this.db.query.itplSettings.findFirst({
      where: eq(itplSettings.companyId, actor.companyId),
    });

    if (existing) {
      await this.db
        .update(itplSettings)
        .set({
          technicianReadEnabled: next.technicianReadEnabled,
          notes: next.notes,
          // Re-asserted on every write so none of the three can be flipped.
          requireApprovalForLiveChanges: true,
          allowUnreviewedComplianceClaims: false,
          seedTenantRecords: false,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(itplSettings.companyId, actor.companyId));
    } else {
      await this.db.insert(itplSettings).values({
        companyId: actor.companyId,
        technicianReadEnabled: next.technicianReadEnabled,
        notes: next.notes,
        requireApprovalForLiveChanges: true,
        allowUnreviewedComplianceClaims: false,
        seedTenantRecords: false,
        updatedByUserId: actor.userId,
      });
    }

    await this.recordEvent(actor, 'settings_updated', null, null, {
      technicianReadEnabled: next.technicianReadEnabled,
    });

    return next;
  }

  /* ---------------------------------------------------------------------- */
  /* Templates                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Reject anything record-shaped before it is stored. A template carries
   * structure and terminology; a customer, job, quote or invoice never
   * belongs in one, in either direction.
   */
  private assertNoBusinessRecords(definition: ItplTemplateDefinition): void {
    const found = findItplBusinessRecordFields(definition);
    if (found.length > 0) {
      throw new IndustryTemplatesError(
        'INVALID',
        `A template holds structure and terminology only. Remove these record fields: ${[
          ...new Set(found),
        ]
          .slice(0, 8)
          .join(', ')}.`,
      );
    }
  }

  async createTemplate(
    actor: ItplActor,
    input: CreateItplTemplateRequest,
  ): Promise<ItplTemplateDetail> {
    this.assertRead(actor);
    this.assertEdit(actor);

    const definition = input.useBlueprint === false
      ? normaliseItplDefinition({
          trade: input.trade,
          tradeLabel: itplTradeLabel(input.trade, input.customTradeLabel),
          sections: [],
        })
      : buildItplBlueprint(input.trade, input.customTradeLabel);

    this.assertNoBusinessRecords(definition);

    const baseKey = slugify(`${input.trade}_${input.name}`);
    const existing = await this.db
      .select({ templateKey: itplTemplates.templateKey })
      .from(itplTemplates)
      .where(eq(itplTemplates.companyId, actor.companyId))
      .limit(500);
    const taken = new Set(existing.map((row) => row.templateKey));
    let templateKey = baseKey;
    let suffix = 2;
    while (taken.has(templateKey)) {
      templateKey = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    const support = resolveItplTemplateSupport(definition);

    const [template] = await this.db
      .insert(itplTemplates)
      .values({
        companyId: actor.companyId,
        templateKey,
        name: input.name.trim(),
        trade: input.trade,
        customTradeLabel: input.customTradeLabel ?? null,
        status: 'draft',
        support,
        isActive: false,
        createdByUserId: actor.userId,
      })
      .returning();

    // The first version carries the starting definition so history is complete
    // from the beginning. No tenant records are written anywhere here.
    await this.db.insert(itplTemplateVersions).values({
      companyId: actor.companyId,
      templateId: template.id,
      versionNumber: 1,
      status: 'draft',
      changeImpact: 'live_workflow',
      changeSummary: 'Initial template.',
      definition: definition as unknown as Record<string, unknown>,
      support,
      authoredByUserId: actor.userId,
    });

    await this.recordEvent(actor, 'template_created', template.id, templateKey, {
      trade: input.trade,
      usedBlueprint: input.useBlueprint !== false,
    });

    return this.getTemplate(actor, template.id);
  }

  async listTemplates(actor: ItplActor): Promise<ItplTemplateSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(itplTemplates)
      .where(eq(itplTemplates.companyId, actor.companyId))
      .orderBy(desc(itplTemplates.updatedAt))
      .limit(200);

    const summaries: ItplTemplateSummary[] = [];
    for (const row of rows) {
      const versions = await this.db
        .select({
          id: itplTemplateVersions.id,
          versionNumber: itplTemplateVersions.versionNumber,
        })
        .from(itplTemplateVersions)
        .where(eq(itplTemplateVersions.templateId, row.id))
        .orderBy(desc(itplTemplateVersions.versionNumber))
        .limit(1);

      const activeVersion = row.activeVersionId
        ? await this.db.query.itplTemplateVersions.findFirst({
            where: and(
              eq(itplTemplateVersions.companyId, actor.companyId),
              eq(itplTemplateVersions.id, row.activeVersionId),
            ),
          })
        : null;

      summaries.push(this.toSummary(row, versions[0]?.versionNumber ?? null, activeVersion?.versionNumber ?? null));
    }
    return summaries;
  }

  private toSummary(
    row: typeof itplTemplates.$inferSelect,
    latestVersionNumber: number | null,
    activeVersionNumber: number | null,
  ): ItplTemplateSummary {
    return {
      id: row.id,
      templateKey: row.templateKey,
      name: row.name,
      trade: row.trade,
      tradeLabel: itplTradeLabel(row.trade, row.customTradeLabel),
      status: row.status,
      support: row.support,
      isActive: row.isActive,
      activeVersionNumber,
      latestVersionNumber,
      createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
      updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
    };
  }

  async getTemplate(actor: ItplActor, templateId: string): Promise<ItplTemplateDetail> {
    const scope = this.assertRead(actor);

    const row = await this.db.query.itplTemplates.findFirst({
      where: and(eq(itplTemplates.companyId, actor.companyId), eq(itplTemplates.id, templateId)),
    });
    if (!row) {
      throw new IndustryTemplatesError('NOT_FOUND', 'That template was not found.');
    }

    const versionRows = await this.db
      .select()
      .from(itplTemplateVersions)
      .where(
        and(
          eq(itplTemplateVersions.companyId, actor.companyId),
          eq(itplTemplateVersions.templateId, templateId),
        ),
      )
      .orderBy(desc(itplTemplateVersions.versionNumber))
      .limit(100);

    const activationRows = await this.db
      .select()
      .from(itplActivations)
      .where(
        and(
          eq(itplActivations.companyId, actor.companyId),
          eq(itplActivations.templateId, templateId),
        ),
      )
      .orderBy(desc(itplActivations.activatedAt))
      .limit(100);

    // A technician reads the version that is actually live, not a draft that
    // has not been approved.
    const activeVersion = row.activeVersionId
      ? versionRows.find((version) => version.id === row.activeVersionId)
      : null;
    const readable =
      scope === 'staff_read' ? activeVersion : (activeVersion ?? versionRows[0] ?? null);

    const rawDefinition = (readable?.definition ?? {
      trade: row.trade,
      tradeLabel: itplTradeLabel(row.trade, row.customTradeLabel),
      sections: [],
    }) as unknown as ItplTemplateDefinition;

    const definition = filterItplDefinitionForScope(
      normaliseItplDefinition(rawDefinition),
      scope,
    );

    return {
      ...this.toSummary(
        row,
        versionRows[0]?.versionNumber ?? null,
        activeVersion?.versionNumber ?? null,
      ),
      definition,
      versions: scope === 'staff_read' ? [] : versionRows.map((version) => this.toVersion(version)),
      activations:
        scope === 'staff_read' ? [] : activationRows.map((item) => this.toActivation(item)),
    };
  }

  private toVersion(row: typeof itplTemplateVersions.$inferSelect): ItplVersionSummary {
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      status: row.status,
      changeImpact: row.changeImpact,
      changeSummary: row.changeSummary,
      authoredByUserId: row.authoredByUserId,
      approvedByUserId: row.approvedByUserId,
      approvedAt: toIso(row.approvedAt),
      createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    };
  }

  private toActivation(row: typeof itplActivations.$inferSelect): ItplActivationSummary {
    return {
      id: row.id,
      versionId: row.versionId,
      versionNumber: row.versionNumber,
      activatedByUserId: row.activatedByUserId,
      activatedAt: toIso(row.activatedAt) ?? new Date(0).toISOString(),
      note: row.note,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Versions                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Save a new version. The previous version is never edited, so the history
   * of what a trade's configuration used to be stays intact.
   */
  async saveVersion(
    actor: ItplActor,
    templateId: string,
    input: SaveItplVersionRequest,
  ): Promise<ItplVersionSummary> {
    this.assertRead(actor);
    this.assertEdit(actor);

    const template = await this.db.query.itplTemplates.findFirst({
      where: and(eq(itplTemplates.companyId, actor.companyId), eq(itplTemplates.id, templateId)),
    });
    if (!template) {
      throw new IndustryTemplatesError('NOT_FOUND', 'That template was not found.');
    }

    const definition = normaliseItplDefinition(input.definition);
    this.assertNoBusinessRecords(definition);

    const latest = await this.db
      .select()
      .from(itplTemplateVersions)
      .where(
        and(
          eq(itplTemplateVersions.companyId, actor.companyId),
          eq(itplTemplateVersions.templateId, templateId),
        ),
      )
      .orderBy(desc(itplTemplateVersions.versionNumber))
      .limit(1);

    const previous = latest[0]
      ? (latest[0].definition as unknown as ItplTemplateDefinition)
      : null;
    const changeImpact: ItplChangeImpact = resolveItplChangeImpact(previous, definition);
    const support = resolveItplTemplateSupport(definition);

    const [version] = await this.db
      .insert(itplTemplateVersions)
      .values({
        companyId: actor.companyId,
        templateId,
        versionNumber: (latest[0]?.versionNumber ?? 0) + 1,
        status: 'draft',
        changeImpact,
        changeSummary: input.changeSummary.trim(),
        definition: definition as unknown as Record<string, unknown>,
        support,
        authoredByUserId: actor.userId,
      })
      .returning();

    await this.db
      .update(itplTemplates)
      .set({ support, updatedAt: new Date() })
      .where(eq(itplTemplates.id, templateId));

    await this.recordEvent(actor, 'version_saved', templateId, String(version.versionNumber), {
      changeImpact,
      requiresApproval: itplChangeRequiresApproval(changeImpact),
    });

    return this.toVersion(version);
  }

  async submitVersion(
    actor: ItplActor,
    templateId: string,
    versionId: string,
  ): Promise<ItplVersionSummary> {
    this.assertRead(actor);
    this.assertEdit(actor);

    const version = await this.findVersion(actor, templateId, versionId);
    if (version.status !== 'draft') {
      throw new IndustryTemplatesError(
        'CONFLICT',
        'Only a draft version can be submitted for approval.',
      );
    }

    const [updated] = await this.db
      .update(itplTemplateVersions)
      .set({ status: 'pending_approval' })
      .where(eq(itplTemplateVersions.id, versionId))
      .returning();

    await this.recordEvent(actor, 'version_submitted', templateId, String(version.versionNumber), {
      changeImpact: version.changeImpact,
    });

    return this.toVersion(updated);
  }

  /** Approving or rejecting a version is an Owner decision. */
  async decideVersion(
    actor: ItplActor,
    templateId: string,
    versionId: string,
    input: DecideItplVersionRequest,
  ): Promise<ItplVersionSummary> {
    this.assertRead(actor);
    this.assertOwner(actor);

    const version = await this.findVersion(actor, templateId, versionId);
    if (version.status !== 'pending_approval') {
      throw new IndustryTemplatesError(
        'CONFLICT',
        'Only a version awaiting approval can be decided.',
      );
    }

    const [updated] = await this.db
      .update(itplTemplateVersions)
      .set({
        status: input.decision,
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
        decisionNote: input.note ?? null,
      })
      .where(eq(itplTemplateVersions.id, versionId))
      .returning();

    await this.recordEvent(actor, 'version_decided', templateId, String(version.versionNumber), {
      decision: input.decision,
    });

    return this.toVersion(updated);
  }

  private async findVersion(
    actor: ItplActor,
    templateId: string,
    versionId: string,
  ): Promise<typeof itplTemplateVersions.$inferSelect> {
    const version = await this.db.query.itplTemplateVersions.findFirst({
      where: and(
        eq(itplTemplateVersions.companyId, actor.companyId),
        eq(itplTemplateVersions.templateId, templateId),
        eq(itplTemplateVersions.id, versionId),
      ),
    });
    if (!version) {
      throw new IndustryTemplatesError('NOT_FOUND', 'That template version was not found.');
    }
    return version;
  }

  /* ---------------------------------------------------------------------- */
  /* Activation                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Make an approved version the company's live configuration. Activation
   * changes configuration only: it never writes tenant records and never
   * removes a capability the company already has.
   */
  async activateTemplate(
    actor: ItplActor,
    templateId: string,
    input: ActivateItplTemplateRequest,
  ): Promise<ItplTemplateDetail> {
    this.assertRead(actor);
    this.assertOwner(actor);

    const template = await this.db.query.itplTemplates.findFirst({
      where: and(eq(itplTemplates.companyId, actor.companyId), eq(itplTemplates.id, templateId)),
    });
    if (!template) {
      throw new IndustryTemplatesError('NOT_FOUND', 'That template was not found.');
    }

    const version = await this.findVersion(actor, templateId, input.versionId);
    if (!canItplVersionActivate(version.status)) {
      throw new IndustryTemplatesError(
        'CONFLICT',
        'Only an approved version can become the active configuration.',
      );
    }

    // Exactly one template is active per company, so stand the others down
    // first. Standing a template down archives its status; it never deletes
    // history or removes capability.
    await this.db
      .update(itplTemplates)
      .set({ isActive: false, status: 'archived', updatedAt: new Date() })
      .where(and(eq(itplTemplates.companyId, actor.companyId), eq(itplTemplates.isActive, true)));

    await this.db
      .update(itplTemplates)
      .set({
        isActive: true,
        status: 'active',
        activeVersionId: version.id,
        support: version.support,
        updatedAt: new Date(),
      })
      .where(eq(itplTemplates.id, templateId));

    await this.db.insert(itplActivations).values({
      companyId: actor.companyId,
      templateId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      activatedByUserId: actor.userId,
      note: input.note ?? null,
    });

    await this.recordEvent(actor, 'template_activated', templateId, String(version.versionNumber), {
      trade: template.trade,
      seededTenantRecords: false,
    });

    return this.getTemplate(actor, templateId);
  }

  /* ---------------------------------------------------------------------- */
  /* Dashboard                                                               */
  /* ---------------------------------------------------------------------- */

  async getDashboard(actor: ItplActor): Promise<ItplDashboard> {
    const scope = this.assertRead(actor);
    const settings = await this.getSettings(actor.companyId);
    const templates = await this.listTemplates(actor);

    const active = templates.find((template) => template.isActive) ?? null;
    const activeTemplate = active ? await this.getTemplate(actor, active.id) : null;

    const pending = await this.db
      .select({ id: itplTemplateVersions.id })
      .from(itplTemplateVersions)
      .where(
        and(
          eq(itplTemplateVersions.companyId, actor.companyId),
          eq(itplTemplateVersions.status, 'pending_approval'),
        ),
      )
      .limit(200);

    return {
      scope,
      settings,
      catalog: buildItplCatalog(),
      templates,
      activeTemplate,
      pendingApprovalCount: scope === 'staff_read' ? 0 : pending.length,
      withheld: buildItplWithheldNotices(scope),
      singleCoreStatement: ITPL_SINGLE_CORE_STATEMENT,
      noSeedingStatement: ITPL_NO_TENANT_SEEDING_STATEMENT,
      generatedAt: new Date().toISOString(),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Audit                                                                   */
  /* ---------------------------------------------------------------------- */

  /** Append-only. Rows are inserted and never updated or removed. */
  private async recordEvent(
    actor: ItplActor,
    eventKind: EventKind,
    templateId: string | null,
    subjectKey: string | null,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(itplAuditEvents).values({
      companyId: actor.companyId,
      eventKind,
      templateId,
      subjectKey,
      detail,
      actorUserId: actor.userId,
    });
  }

  async recordAccessDenied(actor: ItplActor, reason: string): Promise<void> {
    await this.recordEvent(actor, 'access_denied', null, null, {
      reason,
      roleName: actor.roleName ?? null,
    });
  }

  async listAudit(actor: ItplActor, limit = 100): Promise<ItplAuditEntry[]> {
    this.assertRead(actor);
    // The trail names who changed what, so it stays with the people who may
    // change it.
    this.assertEdit(actor);

    const rows = await this.db
      .select()
      .from(itplAuditEvents)
      .where(eq(itplAuditEvents.companyId, actor.companyId))
      .orderBy(desc(itplAuditEvents.occurredAt))
      .limit(Math.min(Math.max(limit, 1), 500));

    return rows.map((row) => ({
      id: row.id,
      eventKind: row.eventKind,
      templateId: row.templateId,
      subjectKey: row.subjectKey,
      detail: row.detail ?? {},
      occurredAt: toIso(row.occurredAt) ?? new Date(0).toISOString(),
    }));
  }
}
