import { and, desc, eq, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { draftWorkspace } from '@titan/db';
import type {
  DraftRecordType,
  DraftStatus,
  DraftWorkspaceDetail,
  DraftWorkspaceSummary,
  DuplicateDraftRequest,
  UpsertDraftRequest,
} from '@titan/shared';
import { buildDraftKey } from '@titan/shared';

export class DraftAutosaveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DraftAutosaveError';
  }
}

type DraftActor = { companyId: string; userId: string };

type DraftRow = typeof draftWorkspace.$inferSelect & {
  lastEditedBy?: { id: string; name: string | null } | null;
};

function toSummary(row: DraftRow): DraftWorkspaceSummary {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    recordType: row.recordType as DraftRecordType,
    recordId: row.recordId,
    draftKey: row.draftKey,
    title: row.title,
    customerLabel: row.customerLabel,
    completionPct: row.completionPct,
    status: row.status as DraftStatus,
    version: row.version,
    lastEditedAt: row.lastEditedAt.toISOString(),
    lastEditedByUserId: row.lastEditedByUserId,
    lastEditedByName: row.lastEditedBy?.name ?? null,
  };
}

function toDetail(row: DraftRow): DraftWorkspaceDetail {
  const history = Array.isArray(row.payloadHistory)
    ? (row.payloadHistory as DraftWorkspaceDetail['payloadHistory'])
    : [];
  return {
    ...toSummary(row),
    payload: (row.payload as Record<string, unknown>) ?? {},
    payloadHistory: history,
  };
}

export class DraftAutosaveService {
  constructor(private readonly db: DatabaseClient) {}

  async listDrafts(
    companyId: string,
    query: { status?: DraftStatus; recordType?: DraftRecordType; userId?: string } = {},
  ): Promise<DraftWorkspaceSummary[]> {
    const rows = await this.db.query.draftWorkspace.findMany({
      where: and(
        eq(draftWorkspace.companyId, companyId),
        query.status ? eq(draftWorkspace.status, query.status) : eq(draftWorkspace.status, 'active'),
        query.recordType ? eq(draftWorkspace.recordType, query.recordType) : undefined,
        query.userId ? eq(draftWorkspace.userId, query.userId) : undefined,
      ),
      with: { lastEditedBy: true },
      orderBy: [desc(draftWorkspace.lastEditedAt)],
    });

    return rows.map((row) => toSummary(row as DraftRow));
  }

  async getDraft(companyId: string, draftId: string): Promise<DraftWorkspaceDetail | null> {
    const row = await this.db.query.draftWorkspace.findFirst({
      where: and(eq(draftWorkspace.id, draftId), eq(draftWorkspace.companyId, companyId)),
      with: { lastEditedBy: true },
    });
    if (!row) return null;
    return toDetail(row as DraftRow);
  }

  async getDraftByKey(companyId: string, draftKey: string): Promise<DraftWorkspaceDetail | null> {
    const row = await this.db.query.draftWorkspace.findFirst({
      where: and(eq(draftWorkspace.companyId, companyId), eq(draftWorkspace.draftKey, draftKey)),
      with: { lastEditedBy: true },
    });
    if (!row) return null;
    return toDetail(row as DraftRow);
  }

  async upsertDraft(actor: DraftActor, input: UpsertDraftRequest): Promise<DraftWorkspaceDetail> {
    const draftKey =
      input.draftKey?.trim() ||
      buildDraftKey({
        userId: actor.userId,
        recordType: input.recordType,
        recordId: input.recordId ?? null,
      });

    const existing = await this.getDraftByKey(actor.companyId, draftKey);
    const now = new Date();

    if (existing) {
      const nextVersion = existing.version + 1;
      const historyEntry = {
        version: existing.version,
        savedAt: existing.lastEditedAt,
        savedByUserId: existing.lastEditedByUserId,
      };
      const nextHistory = [...existing.payloadHistory.slice(-9), historyEntry];

      const [updated] = await this.db
        .update(draftWorkspace)
        .set({
          recordId: input.recordId ?? existing.recordId,
          title: input.title ?? existing.title,
          customerLabel: input.customerLabel ?? existing.customerLabel,
          completionPct: input.completionPct ?? existing.completionPct,
          payload: input.payload,
          payloadHistory: nextHistory,
          version: nextVersion,
          lastEditedAt: now,
          lastEditedByUserId: actor.userId,
          updatedAt: now,
          status: 'active',
        })
        .where(and(eq(draftWorkspace.id, existing.id), eq(draftWorkspace.companyId, actor.companyId)))
        .returning();

      if (!updated) throw new DraftAutosaveError('UPDATE_FAILED', 'Unable to update draft');

      const detail = await this.getDraft(actor.companyId, updated.id);
      if (!detail) throw new DraftAutosaveError('UPDATE_FAILED', 'Unable to load updated draft');
      return detail;
    }

    const [created] = await this.db
      .insert(draftWorkspace)
      .values({
        companyId: actor.companyId,
        userId: actor.userId,
        recordType: input.recordType,
        recordId: input.recordId ?? null,
        draftKey,
        title: input.title?.trim() || null,
        customerLabel: input.customerLabel?.trim() || null,
        completionPct: input.completionPct ?? null,
        payload: input.payload,
        lastEditedAt: now,
        lastEditedByUserId: actor.userId,
      })
      .returning();

    if (!created) throw new DraftAutosaveError('CREATE_FAILED', 'Unable to create draft');

    const detail = await this.getDraft(actor.companyId, created.id);
    if (!detail) throw new DraftAutosaveError('CREATE_FAILED', 'Unable to load created draft');
    return detail;
  }

  async archiveDraft(actor: DraftActor, draftId: string): Promise<DraftWorkspaceSummary> {
    const [updated] = await this.db
      .update(draftWorkspace)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(
        and(
          eq(draftWorkspace.id, draftId),
          eq(draftWorkspace.companyId, actor.companyId),
        ),
      )
      .returning();

    if (!updated) throw new DraftAutosaveError('NOT_FOUND', 'Draft not found');

    return toSummary(updated as DraftRow);
  }

  async deleteDraft(actor: DraftActor, draftId: string): Promise<void> {
    const result = await this.db
      .delete(draftWorkspace)
      .where(
        and(
          eq(draftWorkspace.id, draftId),
          eq(draftWorkspace.companyId, actor.companyId),
        ),
      )
      .returning({ id: draftWorkspace.id });

    if (!result.length) throw new DraftAutosaveError('NOT_FOUND', 'Draft not found');
  }

  async duplicateDraft(
    actor: DraftActor,
    draftId: string,
    input: DuplicateDraftRequest = {},
  ): Promise<DraftWorkspaceDetail> {
    const source = await this.getDraft(actor.companyId, draftId);
    if (!source) throw new DraftAutosaveError('NOT_FOUND', 'Draft not found');

    const copyTitle = input.title?.trim() || `Copy of ${source.title ?? 'Untitled draft'}`;
    const newKey = buildDraftKey({
      userId: actor.userId,
      recordType: source.recordType,
      recordId: null,
    }).replace(':new', `:${Date.now()}`);

    const sanitizedPayload = stripNonDuplicableFields(source.payload, source.recordType);

    return this.upsertDraft(actor, {
      recordType: source.recordType,
      recordId: null,
      draftKey: newKey,
      title: copyTitle,
      customerLabel: source.customerLabel,
      completionPct: source.completionPct,
      payload: sanitizedPayload,
    });
  }

  /** Audit hook — lightweight security log via SQL comment marker for downstream collectors. */
  async touchAudit(actor: DraftActor, action: string, draftId: string): Promise<void> {
    await this.db.execute(
      sql`SELECT 1 /* draft_audit company=${actor.companyId} user=${actor.userId} action=${action} draft=${draftId} */`,
    );
  }
}

function stripNonDuplicableFields(
  payload: Record<string, unknown>,
  recordType: DraftRecordType,
): Record<string, unknown> {
  const next = { ...payload };
  delete next.payments;
  delete next.signatures;
  delete next.issuedAt;
  delete next.sentAt;
  delete next.approvedAt;
  if (recordType === 'invoice') {
    delete next.paymentIds;
    delete next.status;
  }
  if (recordType === 'quote') {
    delete next.sentAt;
    delete next.acceptedAt;
  }
  return next;
}
