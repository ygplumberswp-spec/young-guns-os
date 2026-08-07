import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  buildDocIExpiryAlertDraft,
  buildDocIExpirySnapshot,
  buildDocILinkSnapshot,
  buildDocIMissingDocDraft,
  buildDocISearchSnapshot,
  buildDocIVersionSnapshot,
  canAccessDocumentIntelligence,
  canApproveDocumentIntelligenceDrafts,
  canManageDocumentIntelligenceSettings,
  canWriteDocumentIntelligence,
  docIDaysUntil,
  defaultDocISettings,
  DOCI_COMMON_MISSING_TYPES,
  DOCI_PRODUCT_COPY,
  isDocIDocumentType,
  listDocIAuraConnections,
  type AcknowledgeDiInsightRequest,
  type AcknowledgeDiReminderRequest,
  type CreateDiAuraInsightRequest,
  type CreateDiVersionRequest,
  type DecideDiRecommendationRequest,
  type DocIAuraInsightSummary,
  type DocIDashboard,
  type DocIDocumentIntelligenceRow,
  type DocIDocumentType,
  type DocIExpiryReminderSummary,
  type DocIRecommendationDraftSummary,
  type DocISearchRequest,
  type DocISettings,
  type DocIVersionSummary,
  type RefreshDiRecommendationsRequest,
  type UpdateDiSettingsRequest,
  type UpsertDiDocumentProfileRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  cxCustomerProperties,
  diAuraInsights,
  diDocumentProfiles,
  diDocumentVersions,
  diExpiryReminders,
  diRecommendationDrafts,
  diSettings,
  documents,
  securityAuditLogs,
  users,
} from '@titan/db';

/**
 * Document Intelligence (Department 13)
 *
 * Extends real `documents` rows with typed profiles, versions, expiry reminders,
 * and AURA drafts. Never invents documents. Never auto-sends reminders.
 */

export class DocumentIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentIntelligenceError';
  }
}

export type DocIActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class DocumentIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: DocIActor): void {
    if (!canAccessDocumentIntelligence(actor)) {
      throw new DocumentIntelligenceError(
        'FORBIDDEN',
        'Document Intelligence requires documents access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: DocIActor): void {
    this.assertRead(actor);
    if (!canWriteDocumentIntelligence(actor)) {
      throw new DocumentIntelligenceError(
        'FORBIDDEN',
        'Write actions require documents:write.',
      );
    }
  }

  private assertApprove(actor: DocIActor): void {
    this.assertWrite(actor);
    if (!canApproveDocumentIntelligenceDrafts(actor)) {
      throw new DocumentIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may approve document intelligence recommendation drafts.',
      );
    }
  }

  private assertManageSettings(actor: DocIActor): void {
    this.assertWrite(actor);
    if (!canManageDocumentIntelligenceSettings(actor)) {
      throw new DocumentIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may change Document Intelligence settings.',
      );
    }
  }

  private async recordAudit(
    actor: DocIActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'document_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoSendRemindersEnabled: false,
        inventDocumentsEnabled: false,
        autoExecuted: false,
        fakeDocuments: false,
      },
    });
  }

  private async ensureSettings(actor: DocIActor): Promise<DocISettings> {
    const existing = await this.db.query.diSettings.findFirst({
      where: eq(diSettings.companyId, actor.companyId),
    });
    if (existing) {
      return defaultDocISettings({
        id: existing.id,
        expiryRemindersEnabled: existing.expiryRemindersEnabled,
        missingDocSuggestionsEnabled: existing.missingDocSuggestionsEnabled,
        reminderLeadDays: existing.reminderLeadDays,
        notes: existing.notes,
        updatedAt: existing.updatedAt.toISOString(),
      });
    }
    const [created] = await this.db
      .insert(diSettings)
      .values({
        companyId: actor.companyId,
        autoSendRemindersEnabled: false,
        inventDocumentsEnabled: false,
        updatedByUserId: actor.userId,
      })
      .returning();
    return defaultDocISettings({
      id: created.id,
      expiryRemindersEnabled: created.expiryRemindersEnabled,
      missingDocSuggestionsEnabled: created.missingDocSuggestionsEnabled,
      reminderLeadDays: created.reminderLeadDays,
      notes: created.notes,
      updatedAt: created.updatedAt.toISOString(),
    });
  }

  private toRecommendation(
    row: typeof diRecommendationDrafts.$inferSelect,
  ): DocIRecommendationDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      documentId: row.documentId,
      customerId: row.customerId,
      jobId: row.jobId,
      propertyId: row.propertyId,
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof diAuraInsights.$inferSelect): DocIAuraInsightSummary {
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

  private toVersion(
    row: typeof diDocumentVersions.$inferSelect,
    createdByName: string | null,
  ): DocIVersionSummary {
    return {
      id: row.id,
      documentId: row.documentId,
      versionNumber: row.versionNumber,
      title: row.title,
      fileName: row.fileName,
      fileType: row.fileType,
      fileSizeBytes: row.fileSizeBytes,
      changeNote: row.changeNote,
      createdByUserId: row.createdByUserId,
      createdByName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async loadDocumentRows(
    companyId: string,
    filters: DocISearchRequest = {},
  ): Promise<DocIDocumentIntelligenceRow[]> {
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 250);
    const docs = await this.db.query.documents.findMany({
      where: eq(documents.companyId, companyId),
      with: { category: true, customer: true, job: true, uploadedBy: true },
      orderBy: [desc(documents.updatedAt)],
      limit: 500,
    });

    const profiles = await this.db.query.diDocumentProfiles.findMany({
      where: eq(diDocumentProfiles.companyId, companyId),
    });
    const profileByDoc = new Map(profiles.map((p) => [p.documentId, p]));

    const versionCounts = await this.db
      .select({
        documentId: diDocumentVersions.documentId,
        count: sql<number>`count(*)::int`,
      })
      .from(diDocumentVersions)
      .where(eq(diDocumentVersions.companyId, companyId))
      .groupBy(diDocumentVersions.documentId);
    const versionCountByDoc = new Map(
      versionCounts.map((r) => [r.documentId, Number(r.count) || 0]),
    );

    const propertyIds = [
      ...new Set(profiles.map((p) => p.propertyId).filter((id): id is string => Boolean(id))),
    ];
    const properties =
      propertyIds.length > 0
        ? await this.db.query.cxCustomerProperties.findMany({
            where: and(
              eq(cxCustomerProperties.companyId, companyId),
              inArray(cxCustomerProperties.id, propertyIds),
            ),
          })
        : [];
    const propertyNameById = new Map(properties.map((p) => [p.id, p.propertyName]));

    const now = new Date();
    const q = filters.query?.trim().toLowerCase() ?? '';

    const rows: DocIDocumentIntelligenceRow[] = [];
    for (const doc of docs) {
      const profile = profileByDoc.get(doc.id);
      const documentType: DocIDocumentType = profile?.documentType ?? 'other';
      if (filters.documentType && documentType !== filters.documentType) continue;
      if (filters.customerId && doc.customerId !== filters.customerId) continue;
      if (filters.jobId && doc.jobId !== filters.jobId) continue;
      if (filters.propertyId && profile?.propertyId !== filters.propertyId) continue;
      if (filters.expiringWithinDays != null) {
        if (!profile?.expiresAt) continue;
        const days = docIDaysUntil(profile.expiresAt.toISOString(), now);
        if (days > filters.expiringWithinDays) continue;
      }
      if (q) {
        const hay = [
          doc.title,
          doc.fileName,
          doc.description,
          doc.category?.name,
          doc.customer?.name,
          doc.job?.title,
          documentType,
          profile?.propertyId ? propertyNameById.get(profile.propertyId) : null,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }

      const uploadedByName = doc.uploadedBy
        ? `${doc.uploadedBy.firstName ?? ''} ${doc.uploadedBy.lastName ?? ''}`.trim() ||
          doc.uploadedBy.email
        : null;

      rows.push({
        documentId: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        fileType: doc.fileType,
        documentType,
        categoryId: doc.categoryId,
        categoryName: doc.category?.name ?? null,
        customerId: doc.customerId,
        customerName: doc.customer?.name ?? null,
        jobId: doc.jobId,
        jobTitle: doc.job?.title ?? null,
        propertyId: profile?.propertyId ?? null,
        propertyName: profile?.propertyId
          ? (propertyNameById.get(profile.propertyId) ?? null)
          : null,
        expiresAt: profile?.expiresAt?.toISOString() ?? null,
        versionCount: versionCountByDoc.get(doc.id) ?? 0,
        currentVersionNumber: profile?.currentVersionNumber ?? 1,
        uploadedByName,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      });
      if (rows.length >= limit) break;
    }
    return rows;
  }

  private async loadReminders(companyId: string): Promise<DocIExpiryReminderSummary[]> {
    const reminders = await this.db.query.diExpiryReminders.findMany({
      where: eq(diExpiryReminders.companyId, companyId),
      orderBy: [desc(diExpiryReminders.expiresAt)],
      limit: 100,
    });
    if (reminders.length === 0) return [];

    const docIds = [...new Set(reminders.map((r) => r.documentId))];
    const docs = await this.db.query.documents.findMany({
      where: and(eq(documents.companyId, companyId), inArray(documents.id, docIds)),
    });
    const docById = new Map(docs.map((d) => [d.id, d]));
    const profiles = await this.db.query.diDocumentProfiles.findMany({
      where: and(
        eq(diDocumentProfiles.companyId, companyId),
        inArray(diDocumentProfiles.documentId, docIds),
      ),
    });
    const profileByDoc = new Map(profiles.map((p) => [p.documentId, p]));
    const now = new Date();

    return reminders.map((r) => {
      const doc = docById.get(r.documentId);
      const profile = profileByDoc.get(r.documentId);
      return {
        id: r.id,
        documentId: r.documentId,
        documentTitle: doc?.title ?? null,
        documentType: profile?.documentType ?? null,
        expiresAt: r.expiresAt.toISOString(),
        status: r.status,
        docIDaysUntilExpiry: docIDaysUntil(r.expiresAt.toISOString(), now),
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      };
    });
  }

  async getDashboard(actor: DocIActor, search: DocISearchRequest = {}): Promise<DocIDashboard> {
    this.assertRead(actor);
    const settings = await this.ensureSettings(actor);

    const [
      documentRows,
      reminders,
      drafts,
      insights,
      totalDocCountRow,
      versionStats,
      profileExpiryCountRow,
    ] = await Promise.all([
      this.loadDocumentRows(actor.companyId, search),
      this.loadReminders(actor.companyId),
      this.db.query.diRecommendationDrafts.findMany({
        where: eq(diRecommendationDrafts.companyId, actor.companyId),
        orderBy: [desc(diRecommendationDrafts.createdAt)],
        limit: 50,
      }),
      this.db.query.diAuraInsights.findMany({
        where: eq(diAuraInsights.companyId, actor.companyId),
        orderBy: [desc(diAuraInsights.createdAt)],
        limit: 50,
      }),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(eq(documents.companyId, actor.companyId)),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          docs: sql<number>`count(distinct ${diDocumentVersions.documentId})::int`,
        })
        .from(diDocumentVersions)
        .where(eq(diDocumentVersions.companyId, actor.companyId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(diDocumentProfiles)
        .where(
          and(
            eq(diDocumentProfiles.companyId, actor.companyId),
            sql`${diDocumentProfiles.expiresAt} is not null`,
          ),
        ),
    ]);

    const totalDocuments = Number(totalDocCountRow[0]?.count ?? 0);
    const searchSnap = buildDocISearchSnapshot({
      resultCount: documentRows.length,
      query: search.query?.trim() || null,
      totalDocuments,
    });

    const openReminders = reminders.filter((r) => r.status === 'open');
    const expiringSoon = openReminders.filter(
      (r) => r.docIDaysUntilExpiry != null && r.docIDaysUntilExpiry >= 0 && r.docIDaysUntilExpiry <= 30,
    );
    const expired = openReminders.filter((r) => r.docIDaysUntilExpiry != null && r.docIDaysUntilExpiry < 0);
    const expiry = buildDocIExpirySnapshot({
      openReminderCount: openReminders.length,
      expiringSoonCount: expiringSoon.length,
      expiredCount: expired.length,
      profileWithExpiryCount: Number(profileExpiryCountRow[0]?.count ?? 0),
    });

    const versions = buildDocIVersionSnapshot({
      versionedDocumentCount: Number(versionStats[0]?.docs ?? 0),
      totalVersionRows: Number(versionStats[0]?.total ?? 0),
    });

    const allForLinks = await this.loadDocumentRows(actor.companyId, { limit: 250 });
    const links = buildDocILinkSnapshot({
      customerLinkedCount: allForLinks.filter((d) => d.customerId).length,
      jobLinkedCount: allForLinks.filter((d) => d.jobId).length,
      propertyLinkedCount: allForLinks.filter((d) => d.propertyId).length,
      unlinkedCount: allForLinks.filter((d) => !d.customerId && !d.jobId && !d.propertyId).length,
    });

    const recommendationDrafts = drafts.map((d) => this.toRecommendation(d));
    const pendingApprovals = recommendationDrafts.filter(
      (d) => d.status === 'draft' || d.status === 'pending_approval',
    ).length;
    const typedDocumentCount = allForLinks.filter((d) => d.documentType !== 'other').length;

    const summary =
      totalDocuments === 0
        ? 'Document Intelligence is ready. No real documents yet — search, versions, and expiry stay unavailable (not invented). Register documents under /documents.'
        : `Real document signals: ${totalDocuments} document(s), ${typedDocumentCount} typed, expiry ${expiry.availability}, versions ${versions.availability}, ${pendingApprovals} pending recommendation draft(s). Never invents documents.`;

    return {
      summary,
      productClarification: { ...DOCI_PRODUCT_COPY },
      policy: {
        autoSendRemindersEnabled: false,
        inventDocumentsEnabled: false,
        requiresOwnerApproval: true,
        fakeDocuments: false,
      },
      search: searchSnap,
      expiry,
      versions,
      links,
      documents: documentRows,
      reminders,
      recommendationDrafts,
      auraInsights: insights.map((i) => this.toInsight(i)),
      auraConnections: listDocIAuraConnections(),
      settings,
      pendingApprovals,
      totalDocuments,
      typedDocumentCount,
    };
  }

  async searchDocuments(actor: DocIActor, input: DocISearchRequest): Promise<{
    documents: DocIDocumentIntelligenceRow[];
    search: ReturnType<typeof buildDocISearchSnapshot>;
  }> {
    this.assertRead(actor);
    const totalDocCountRow = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(eq(documents.companyId, actor.companyId));
    const documentsRows = await this.loadDocumentRows(actor.companyId, input);
    return {
      documents: documentsRows,
      search: buildDocISearchSnapshot({
        resultCount: documentsRows.length,
        query: input.query?.trim() || null,
        totalDocuments: Number(totalDocCountRow[0]?.count ?? 0),
      }),
    };
  }

  async upsertDocumentProfile(
    actor: DocIActor,
    input: UpsertDiDocumentProfileRequest,
  ): Promise<DocIDocumentIntelligenceRow> {
    this.assertWrite(actor);
    const doc = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, input.documentId), eq(documents.companyId, actor.companyId)),
    });
    if (!doc) {
      throw new DocumentIntelligenceError('NOT_FOUND', 'Document not found in this company.');
    }

    if (input.propertyId) {
      const property = await this.db.query.cxCustomerProperties.findFirst({
        where: and(
          eq(cxCustomerProperties.id, input.propertyId),
          eq(cxCustomerProperties.companyId, actor.companyId),
        ),
      });
      if (!property) {
        throw new DocumentIntelligenceError(
          'VALIDATION_ERROR',
          'Property must be a real cx_customer_properties row for this company.',
        );
      }
    }

    const documentType =
      input.documentType && isDocIDocumentType(input.documentType) ? input.documentType : undefined;
    const expiresAt =
      input.expiresAt === undefined
        ? undefined
        : input.expiresAt === null
          ? null
          : new Date(input.expiresAt);
    if (expiresAt !== undefined && expiresAt !== null && Number.isNaN(expiresAt.getTime())) {
      throw new DocumentIntelligenceError('VALIDATION_ERROR', 'Invalid expiresAt.');
    }

    const existing = await this.db.query.diDocumentProfiles.findFirst({
      where: and(
        eq(diDocumentProfiles.companyId, actor.companyId),
        eq(diDocumentProfiles.documentId, input.documentId),
      ),
    });

    if (existing) {
      await this.db
        .update(diDocumentProfiles)
        .set({
          documentType: documentType ?? existing.documentType,
          propertyId: input.propertyId === undefined ? existing.propertyId : input.propertyId,
          expiresAt: expiresAt === undefined ? existing.expiresAt : expiresAt,
          notes: input.notes === undefined ? existing.notes : input.notes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(diDocumentProfiles.id, existing.id),
            eq(diDocumentProfiles.companyId, actor.companyId),
          ),
        );
    } else {
      await this.db.insert(diDocumentProfiles).values({
        companyId: actor.companyId,
        documentId: input.documentId,
        documentType: documentType ?? 'other',
        propertyId: input.propertyId ?? null,
        expiresAt: expiresAt ?? null,
        notes: input.notes ?? null,
        createdByUserId: actor.userId,
      });
    }

    await this.recordAudit(actor, 'di_document_profile_upserted', input.documentId, {
      documentType: documentType ?? existing?.documentType ?? 'other',
      propertyId: input.propertyId ?? existing?.propertyId ?? null,
    });

    const match = (await this.loadDocumentRows(actor.companyId, { limit: 250 })).find(
      (r) => r.documentId === input.documentId,
    );
    if (!match) {
      throw new DocumentIntelligenceError('NOT_FOUND', 'Document profile not found after upsert.');
    }
    return match;
  }

  async listVersions(actor: DocIActor, documentId: string): Promise<DocIVersionSummary[]> {
    this.assertRead(actor);
    const doc = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.companyId, actor.companyId)),
    });
    if (!doc) {
      throw new DocumentIntelligenceError('NOT_FOUND', 'Document not found in this company.');
    }
    const versions = await this.db.query.diDocumentVersions.findMany({
      where: and(
        eq(diDocumentVersions.companyId, actor.companyId),
        eq(diDocumentVersions.documentId, documentId),
      ),
      orderBy: [desc(diDocumentVersions.versionNumber)],
    });
    const userIds = [
      ...new Set(versions.map((v) => v.createdByUserId).filter((id): id is string => Boolean(id))),
    ];
    const userRows =
      userIds.length > 0
        ? await this.db.query.users.findMany({
            where: and(eq(users.companyId, actor.companyId), inArray(users.id, userIds)),
          })
        : [];
    const nameById = new Map(
      userRows.map((u) => [
        u.id,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );
    return versions.map((v) =>
      this.toVersion(v, v.createdByUserId ? (nameById.get(v.createdByUserId) ?? null) : null),
    );
  }

  async createVersion(actor: DocIActor, input: CreateDiVersionRequest): Promise<DocIVersionSummary> {
    this.assertWrite(actor);
    const doc = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, input.documentId), eq(documents.companyId, actor.companyId)),
    });
    if (!doc) {
      throw new DocumentIntelligenceError('NOT_FOUND', 'Document not found in this company.');
    }

    let profile = await this.db.query.diDocumentProfiles.findFirst({
      where: and(
        eq(diDocumentProfiles.companyId, actor.companyId),
        eq(diDocumentProfiles.documentId, input.documentId),
      ),
    });
    if (!profile) {
      const [createdProfile] = await this.db
        .insert(diDocumentProfiles)
        .values({
          companyId: actor.companyId,
          documentId: input.documentId,
          documentType: 'other',
          createdByUserId: actor.userId,
        })
        .returning();
      profile = createdProfile;
    }

    const existingVersions = await this.db.query.diDocumentVersions.findMany({
      where: and(
        eq(diDocumentVersions.companyId, actor.companyId),
        eq(diDocumentVersions.documentId, input.documentId),
      ),
    });
    if (existingVersions.length === 0) {
      // Seed baseline version from the current real document row.
      await this.db.insert(diDocumentVersions).values({
        companyId: actor.companyId,
        documentId: doc.id,
        versionNumber: 1,
        title: doc.title,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSizeBytes: doc.fileSizeBytes,
        changeNote: 'Baseline version from existing document register',
        createdByUserId: doc.uploadedByUserId,
        metadata: { source: 'documents_baseline' },
      });
    }

    const nextVersion = (profile.currentVersionNumber ?? 1) + 1;
    const title = (input.title ?? doc.title).trim();
    const fileName = (input.fileName ?? doc.fileName).trim();
    if (!title || !fileName) {
      throw new DocumentIntelligenceError('VALIDATION_ERROR', 'Title and fileName are required.');
    }

    const [inserted] = await this.db
      .insert(diDocumentVersions)
      .values({
        companyId: actor.companyId,
        documentId: input.documentId,
        versionNumber: nextVersion,
        title,
        fileName,
        fileType: input.fileType === undefined ? doc.fileType : input.fileType,
        fileSizeBytes:
          input.fileSizeBytes === undefined ? doc.fileSizeBytes : input.fileSizeBytes,
        changeNote: input.changeNote?.trim() || null,
        createdByUserId: actor.userId,
        metadata: { source: 'document_intelligence_version' },
      })
      .returning();

    await this.db
      .update(diDocumentProfiles)
      .set({ currentVersionNumber: nextVersion, updatedAt: new Date() })
      .where(
        and(
          eq(diDocumentProfiles.id, profile.id),
          eq(diDocumentProfiles.companyId, actor.companyId),
        ),
      );

    // Keep operational documents register in sync with latest version metadata (real update, not invented).
    await this.db
      .update(documents)
      .set({
        title,
        fileName,
        fileType: input.fileType === undefined ? doc.fileType : input.fileType,
        fileSizeBytes:
          input.fileSizeBytes === undefined ? doc.fileSizeBytes : input.fileSizeBytes,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, doc.id), eq(documents.companyId, actor.companyId)));

    await this.recordAudit(actor, 'di_document_version_created', inserted.id, {
      documentId: input.documentId,
      versionNumber: nextVersion,
    });

    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, actor.userId), eq(users.companyId, actor.companyId)),
    });
    const name = user
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
      : null;
    return this.toVersion(inserted, name);
  }

  async refreshRecommendations(
    actor: DocIActor,
    input: RefreshDiRecommendationsRequest = {},
  ): Promise<{ created: number; drafts: DocIRecommendationDraftSummary[]; remindersCreated: number }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    const leadDays = input.reminderLeadDays ?? settings.reminderLeadDays;
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const created: DocIRecommendationDraftSummary[] = [];
    let remindersCreated = 0;
    const now = new Date();

    const profiles = await this.db.query.diDocumentProfiles.findMany({
      where: eq(diDocumentProfiles.companyId, actor.companyId),
    });
    const docs = await this.db.query.documents.findMany({
      where: eq(documents.companyId, actor.companyId),
      with: { customer: true, job: true },
    });
    const docById = new Map(docs.map((d) => [d.id, d]));

    if (settings.expiryRemindersEnabled) {
      for (const profile of profiles) {
        if (!profile.expiresAt) continue;
        const days = docIDaysUntil(profile.expiresAt.toISOString(), now);
        if (days > leadDays) continue;
        const doc = docById.get(profile.documentId);
        if (!doc) continue;

        const openReminder = await this.db.query.diExpiryReminders.findFirst({
          where: and(
            eq(diExpiryReminders.companyId, actor.companyId),
            eq(diExpiryReminders.documentId, profile.documentId),
            eq(diExpiryReminders.status, 'open'),
          ),
        });
        if (!openReminder) {
          await this.db.insert(diExpiryReminders).values({
            companyId: actor.companyId,
            documentId: profile.documentId,
            expiresAt: profile.expiresAt,
            status: 'open',
            note: `Expiry reminder for “${doc.title}” (${days < 0 ? 'expired' : `${days} day(s) remaining`}).`,
            createdByUserId: actor.userId,
            metadata: { source: 'real_profile_expiry', docIDaysUntilExpiry: days },
          });
          remindersCreated += 1;
        }

        const openDraft = await this.db.query.diRecommendationDrafts.findFirst({
          where: and(
            eq(diRecommendationDrafts.companyId, actor.companyId),
            eq(diRecommendationDrafts.kind, 'expiry_alert'),
            eq(diRecommendationDrafts.documentId, profile.documentId),
            inArray(diRecommendationDrafts.status, ['draft', 'pending_approval']),
          ),
        });
        if (openDraft) continue;

        const draft = buildDocIExpiryAlertDraft({
          documentTitle: doc.title,
          documentType: profile.documentType,
          expiresAt: profile.expiresAt.toISOString(),
          docIDaysUntilExpiry: days,
        });
        const [inserted] = await this.db
          .insert(diRecommendationDrafts)
          .values({
            companyId: actor.companyId,
            kind: draft.kind,
            status,
            title: draft.title,
            body: draft.body,
            documentId: profile.documentId,
            customerId: doc.customerId,
            jobId: doc.jobId,
            propertyId: profile.propertyId,
            autoExecuted: false,
            createdByUserId: actor.userId,
            metadata: { source: 'real_profile_expiry', docIDaysUntilExpiry: days },
          })
          .returning();
        created.push(this.toRecommendation(inserted));
        await this.recordAudit(actor, 'di_recommendation_draft_created', inserted.id, {
          kind: draft.kind,
          documentId: profile.documentId,
        });
      }
    }

    if (settings.missingDocSuggestionsEnabled) {
      // Suggest missing common types for jobs that already have at least one real document.
      const jobsWithDocs = new Map<string, { jobTitle: string | null; customerId: string | null; customerName: string | null; types: Set<DocIDocumentType>; propertyId: string | null }>();
      for (const doc of docs) {
        if (!doc.jobId) continue;
        const profile = profiles.find((p) => p.documentId === doc.id);
        const entry = jobsWithDocs.get(doc.jobId) ?? {
          jobTitle: doc.job?.title ?? null,
          customerId: doc.customerId,
          customerName: doc.customer?.name ?? null,
          types: new Set<DocIDocumentType>(),
          propertyId: profile?.propertyId ?? null,
        };
        entry.types.add(profile?.documentType ?? 'other');
        if (profile?.propertyId) entry.propertyId = profile.propertyId;
        jobsWithDocs.set(doc.jobId, entry);
      }

      let suggestions = 0;
      for (const [jobId, info] of jobsWithDocs) {
        if (suggestions >= 10) break;
        for (const missingType of DOCI_COMMON_MISSING_TYPES) {
          if (info.types.has(missingType)) continue;
          const openDraft = await this.db.query.diRecommendationDrafts.findFirst({
            where: and(
              eq(diRecommendationDrafts.companyId, actor.companyId),
              eq(diRecommendationDrafts.kind, 'missing_doc_suggestion'),
              eq(diRecommendationDrafts.jobId, jobId),
              inArray(diRecommendationDrafts.status, ['draft', 'pending_approval']),
              sql`${diRecommendationDrafts.metadata}->>'missingType' = ${missingType}`,
            ),
          });
          if (openDraft) continue;

          let propertyName: string | null = null;
          if (info.propertyId) {
            const property = await this.db.query.cxCustomerProperties.findFirst({
              where: and(
                eq(cxCustomerProperties.id, info.propertyId),
                eq(cxCustomerProperties.companyId, actor.companyId),
              ),
            });
            propertyName = property?.propertyName ?? null;
          }

          const draft = buildDocIMissingDocDraft({
            missingType,
            customerName: info.customerName,
            jobTitle: info.jobTitle,
            propertyName,
          });
          const [inserted] = await this.db
            .insert(diRecommendationDrafts)
            .values({
              companyId: actor.companyId,
              kind: draft.kind,
              status,
              title: draft.title,
              body: draft.body,
              customerId: info.customerId,
              jobId,
              propertyId: info.propertyId,
              autoExecuted: false,
              createdByUserId: actor.userId,
              metadata: { source: 'real_job_document_gap', missingType },
            })
            .returning();
          created.push(this.toRecommendation(inserted));
          await this.recordAudit(actor, 'di_recommendation_draft_created', inserted.id, {
            kind: draft.kind,
            jobId,
            missingType,
          });
          suggestions += 1;
          break; // one suggestion per job per refresh
        }
      }
    }

    return { created: created.length, drafts: created, remindersCreated };
  }

  async decideRecommendation(
    actor: DocIActor,
    draftId: string,
    input: DecideDiRecommendationRequest,
  ): Promise<DocIRecommendationDraftSummary> {
    this.assertApprove(actor);
    const draft = await this.db.query.diRecommendationDrafts.findFirst({
      where: and(
        eq(diRecommendationDrafts.id, draftId),
        eq(diRecommendationDrafts.companyId, actor.companyId),
      ),
    });
    if (!draft) {
      throw new DocumentIntelligenceError('NOT_FOUND', 'Recommendation draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(draft.status) && input.decision !== 'acknowledge') {
      throw new DocumentIntelligenceError(
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
      .update(diRecommendationDrafts)
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
          eq(diRecommendationDrafts.id, draftId),
          eq(diRecommendationDrafts.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, `di_recommendation_draft_${nextStatus}`, updated.id, {
      kind: updated.kind,
      decision: input.decision,
    });
    return this.toRecommendation(updated);
  }

  async acknowledgeReminder(
    actor: DocIActor,
    reminderId: string,
    input: AcknowledgeDiReminderRequest,
  ): Promise<DocIExpiryReminderSummary> {
    this.assertWrite(actor);
    const reminder = await this.db.query.diExpiryReminders.findFirst({
      where: and(
        eq(diExpiryReminders.id, reminderId),
        eq(diExpiryReminders.companyId, actor.companyId),
      ),
    });
    if (!reminder) {
      throw new DocumentIntelligenceError('NOT_FOUND', 'Expiry reminder not found.');
    }

    const [updated] = await this.db
      .update(diExpiryReminders)
      .set({
        status: input.status,
        acknowledgedByUserId: actor.userId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(diExpiryReminders.id, reminderId),
          eq(diExpiryReminders.companyId, actor.companyId),
        ),
      )
      .returning();

    await this.recordAudit(actor, 'di_expiry_reminder_acknowledged', updated.id, {
      status: input.status,
      documentId: updated.documentId,
    });

    const list = await this.loadReminders(actor.companyId);
    const match = list.find((r) => r.id === reminderId);
    if (!match) {
      throw new DocumentIntelligenceError('NOT_FOUND', 'Reminder not found after update.');
    }
    return match;
  }

  async updateSettings(actor: DocIActor, input: UpdateDiSettingsRequest): Promise<DocISettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);
    const [updated] = await this.db
      .update(diSettings)
      .set({
        expiryRemindersEnabled: input.expiryRemindersEnabled,
        missingDocSuggestionsEnabled: input.missingDocSuggestionsEnabled,
        reminderLeadDays:
          input.reminderLeadDays != null
            ? Math.min(Math.max(input.reminderLeadDays, 1), 365)
            : undefined,
        notes: input.notes === undefined ? undefined : input.notes,
        autoSendRemindersEnabled: false,
        inventDocumentsEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(diSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'di_settings_updated', updated.id, {
      expiryRemindersEnabled: updated.expiryRemindersEnabled,
      missingDocSuggestionsEnabled: updated.missingDocSuggestionsEnabled,
    });

    return defaultDocISettings({
      id: updated.id,
      expiryRemindersEnabled: updated.expiryRemindersEnabled,
      missingDocSuggestionsEnabled: updated.missingDocSuggestionsEnabled,
      reminderLeadDays: updated.reminderLeadDays,
      notes: updated.notes,
      updatedAt: updated.updatedAt.toISOString(),
    });
  }

  async createAuraInsight(
    actor: DocIActor,
    input: CreateDiAuraInsightRequest,
  ): Promise<DocIAuraInsightSummary> {
    this.assertWrite(actor);

    if (input.sourceRecommendationId) {
      const source = await this.db.query.diRecommendationDrafts.findFirst({
        where: and(
          eq(diRecommendationDrafts.id, input.sourceRecommendationId),
          eq(diRecommendationDrafts.companyId, actor.companyId),
        ),
      });
      if (!source) {
        throw new DocumentIntelligenceError('NOT_FOUND', 'Source recommendation draft not found.');
      }
    }

    const [inserted] = await this.db
      .insert(diAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        title: input.title.trim(),
        insight: input.insight.trim(),
        href: input.href?.trim() || null,
        sourceRecommendationId: input.sourceRecommendationId ?? null,
        createdByUserId: actor.userId,
        metadata: { source: 'document_intelligence' },
      })
      .returning();
    await this.recordAudit(actor, 'di_aura_insight_created', inserted.id, {
      target: inserted.target,
    });
    return this.toInsight(inserted);
  }

  async acknowledgeAuraInsight(
    actor: DocIActor,
    insightId: string,
    input: AcknowledgeDiInsightRequest,
  ): Promise<DocIAuraInsightSummary> {
    this.assertWrite(actor);
    const [updated] = await this.db
      .update(diAuraInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(eq(diAuraInsights.id, insightId), eq(diAuraInsights.companyId, actor.companyId)),
      )
      .returning();
    if (!updated) {
      throw new DocumentIntelligenceError('NOT_FOUND', 'AURA insight not found.');
    }
    await this.recordAudit(actor, 'di_aura_insight_acknowledged', updated.id, {
      status: input.status,
    });
    return this.toInsight(updated);
  }
}
