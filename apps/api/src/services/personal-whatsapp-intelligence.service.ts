import { and, desc, eq } from 'drizzle-orm';
import { canAccessPersonalWhatsappAssistant } from '@titan/shared';
import {
  buildPersonalWaDraftReply,
  buildPersonalWaNextAction,
  classifyPersonalWaIntelligence,
  emptyIntelClassificationCounts,
  extractBusinessFields,
  isBusinessIntelClassification,
  PERSONAL_WA_INTEL_PRODUCT_COPY,
  type ClassifyPersonalWaThreadRequest,
  type CreatePersonalWaAuraSuggestionRequest,
  type CreatePersonalWaLinkProposalRequest,
  type DecidePersonalWaAuraSuggestionRequest,
  type DecidePersonalWaLinkProposalRequest,
  type PersonalWaIntelAuraSuggestionSummary,
  type PersonalWaIntelBusinessExtraction,
  type PersonalWaIntelClassification,
  type PersonalWaIntelDashboard,
  type PersonalWaIntelLinkProposalSummary,
  type PersonalWaIntelThreadSummary,
  type RunPersonalWaIntelScanRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  commPlatformAccounts,
  commPlatformImportDecisions,
  commPlatformPersonalThreads,
  personalCommConversations,
  personalWaIntelAuraSuggestions,
  personalWaIntelClassifications,
  personalWaIntelLinkProposals,
  securityAuditLogs,
  ucTimelineIndex,
} from '@titan/db';

export class PersonalWhatsappIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PersonalWhatsappIntelligenceError';
  }
}

export type PersonalWaIntelActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class PersonalWhatsappIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertOwnerAccess(actor: PersonalWaIntelActor): void {
    if (
      !canAccessPersonalWhatsappAssistant({
        roleName: actor.roleName,
        permissions: actor.permissions,
      })
    ) {
      throw new PersonalWhatsappIntelligenceError(
        'FORBIDDEN',
        'Personal WhatsApp Intelligence is Platform Owner only (same gate as Personal WhatsApp Assistant).',
      );
    }
  }

  private async recordAudit(
    actor: PersonalWaIntelActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'communications',
      action,
      entityType: 'personal_whatsapp_intelligence',
      entityId,
      userId: actor.userId,
      metadata: { ...metadata, autoSend: false, autoLinked: false },
    });
  }

  async getDashboard(actor: PersonalWaIntelActor): Promise<PersonalWaIntelDashboard> {
    this.assertOwnerAccess(actor);

    const [personalAccount] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, actor.companyId),
          eq(commPlatformAccounts.accountKind, 'personal_whatsapp'),
          eq(commPlatformAccounts.ownerUserId, actor.userId),
        ),
      )
      .limit(1);

    const threads = await this.listThreads(actor);
    const approvalQueue = await this.listLinkProposals(actor, 'pending_approval');
    const auraQueue = await this.listAuraSuggestions(actor, 'pending_approval');

    const byClassification = emptyIntelClassificationCounts();
    for (const thread of threads) {
      byClassification[thread.classification] += 1;
    }

    const privateExcludedCount = threads.filter((t) => t.privacyExcluded).length;
    const businessReadyCount = threads.filter(
      (t) => isBusinessIntelClassification(t.classification) && !t.privacyExcluded,
    ).length;

    const sourcePath = personalAccount ? 'personal_whatsapp_credential' : 'none';

    return {
      summary:
        sourcePath === 'none'
          ? 'No Personal WhatsApp Assistant credential configured for this Owner. Intelligence runs only on owner-scoped personal threads — never on Business WhatsApp message tables.'
          : `Classified ${threads.length} owner-scoped personal thread(s). Private threads stay excluded; business links and AURA drafts require explicit Owner approval.`,
      productClarification: { ...PERSONAL_WA_INTEL_PRODUCT_COPY },
      sourcePath,
      usesBusinessWhatsappMessages: false,
      totalThreads: threads.length,
      classifiedCount: threads.filter((t) => t.classificationConfidence > 0).length,
      byClassification,
      pendingLinkApprovals: approvalQueue.length,
      pendingAuraApprovals: auraQueue.length,
      privateExcludedCount,
      businessReadyCount,
      recentThreads: threads.slice(0, 40),
      approvalQueue,
      auraQueue,
      sendPolicy: {
        autoSendEnabled: false,
        requiresOwnerApproval: true,
        draftApproveExecute: true,
      },
    };
  }

  async listThreads(actor: PersonalWaIntelActor): Promise<PersonalWaIntelThreadSummary[]> {
    this.assertOwnerAccess(actor);

    const personalThreads = await this.db
      .select()
      .from(commPlatformPersonalThreads)
      .where(
        and(
          eq(commPlatformPersonalThreads.companyId, actor.companyId),
          eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
        ),
      )
      .orderBy(desc(commPlatformPersonalThreads.lastMessageAt))
      .limit(200);

    const classifications = await this.db
      .select()
      .from(personalWaIntelClassifications)
      .where(
        and(
          eq(personalWaIntelClassifications.companyId, actor.companyId),
          eq(personalWaIntelClassifications.ownerUserId, actor.userId),
        ),
      );

    const byThread = new Map(classifications.map((c) => [c.personalThreadId, c]));

    return personalThreads.map((thread) => {
      const row = byThread.get(thread.id);
      const classification =
        (row?.manualOverride as PersonalWaIntelClassification | null) ??
        (row?.classification as PersonalWaIntelClassification | undefined) ??
        'private_personal';
      const extraction = (row?.extraction ?? null) as PersonalWaIntelBusinessExtraction | null;

      return {
        id: row?.id ?? thread.id,
        personalThreadId: thread.id,
        contactPhone: thread.contactPhone,
        contactName: thread.contactName,
        lastMessagePreview: thread.lastMessagePreview,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        classification,
        classificationConfidence: row?.classificationConfidence ?? 0,
        manualOverride: (row?.manualOverride as PersonalWaIntelClassification | null) ?? null,
        privacyExcluded: row?.privacyExcluded ?? thread.privateByDefault ?? true,
        extraction:
          extraction && typeof extraction === 'object' && 'urgency' in extraction
            ? extraction
            : null,
        linkedCustomerId: row?.linkedCustomerId ?? null,
        linkedLeadId: row?.linkedLeadId ?? null,
        linkedJobId: row?.linkedJobId ?? null,
        linkedPropertyId: row?.linkedPropertyId ?? null,
        timelineLinked: row?.timelineLinked ?? false,
      };
    });
  }

  async runScan(
    actor: PersonalWaIntelActor,
    input: RunPersonalWaIntelScanRequest = {},
  ): Promise<{ classified: number; auraSuggestionsCreated: number }> {
    this.assertOwnerAccess(actor);

    const personalThreads = await this.db
      .select()
      .from(commPlatformPersonalThreads)
      .where(
        and(
          eq(commPlatformPersonalThreads.companyId, actor.companyId),
          eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
        ),
      )
      .limit(200);

    let classified = 0;
    let auraSuggestionsCreated = 0;

    for (const thread of personalThreads) {
      const result = classifyPersonalWaIntelligence({
        contactName: thread.contactName,
        contactPhone: thread.contactPhone,
        preview: thread.lastMessagePreview,
      });
      const extraction = isBusinessIntelClassification(result.classification)
        ? extractBusinessFields({
            contactName: thread.contactName,
            contactPhone: thread.contactPhone,
            preview: thread.lastMessagePreview,
            attachmentCount: thread.attachmentCount,
          })
        : null;

      const [existing] = await this.db
        .select()
        .from(personalWaIntelClassifications)
        .where(
          and(
            eq(personalWaIntelClassifications.companyId, actor.companyId),
            eq(personalWaIntelClassifications.ownerUserId, actor.userId),
            eq(personalWaIntelClassifications.personalThreadId, thread.id),
          ),
        )
        .limit(1);

      const values = {
        classification: existing?.manualOverride ? existing.classification : result.classification,
        classificationConfidence: existing?.manualOverride
          ? existing.classificationConfidence
          : result.confidence,
        rationale: existing?.manualOverride ? existing.rationale : result.rationale,
        privacyExcluded: !result.isBusiness || result.excludedFromBusinessSearch,
        excludedFromBusinessSearch: result.excludedFromBusinessSearch || !result.isBusiness,
        extraction: (extraction ?? {}) as Record<string, unknown>,
        classifiedByUserId: actor.userId,
        updatedAt: new Date(),
      };

      if (existing) {
        if (!existing.manualOverride) {
          await this.db
            .update(personalWaIntelClassifications)
            .set(values)
            .where(eq(personalWaIntelClassifications.id, existing.id));
        }
      } else {
        await this.db.insert(personalWaIntelClassifications).values({
          companyId: actor.companyId,
          ownerUserId: actor.userId,
          personalThreadId: thread.id,
          ...values,
        });
      }
      classified += 1;

      // Keep personal thread privacy flags aligned for private classifications.
      if (!result.isBusiness) {
        await this.db
          .update(commPlatformPersonalThreads)
          .set({
            privateByDefault: true,
            excludedFromBusinessSearch: true,
            importConsentGranted: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(commPlatformPersonalThreads.id, thread.id),
              eq(commPlatformPersonalThreads.companyId, actor.companyId),
              eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
            ),
          );
      }

      if (input.generateAuraSuggestions && result.isBusiness) {
        const next = buildPersonalWaNextAction({
          classification: result.classification,
          contactName: thread.contactName,
          extraction,
        });
        const draft = buildPersonalWaDraftReply({
          classification: result.classification,
          contactName: thread.contactName,
          extraction,
        });

        const [existingAura] = await this.db
          .select()
          .from(personalWaIntelAuraSuggestions)
          .where(
            and(
              eq(personalWaIntelAuraSuggestions.companyId, actor.companyId),
              eq(personalWaIntelAuraSuggestions.ownerUserId, actor.userId),
              eq(personalWaIntelAuraSuggestions.personalThreadId, thread.id),
              eq(personalWaIntelAuraSuggestions.status, 'pending_approval'),
            ),
          )
          .limit(1);

        if (!existingAura) {
          await this.db.insert(personalWaIntelAuraSuggestions).values([
            {
              companyId: actor.companyId,
              ownerUserId: actor.userId,
              personalThreadId: thread.id,
              suggestionType: 'next_action',
              status: 'pending_approval',
              subject: next.subject,
              body: next.body,
              autoSend: false,
            },
            {
              companyId: actor.companyId,
              ownerUserId: actor.userId,
              personalThreadId: thread.id,
              suggestionType: 'draft_reply',
              status: 'pending_approval',
              subject: draft.subject,
              body: draft.body,
              autoSend: false,
            },
          ]);
          auraSuggestionsCreated += 2;
        }
      }
    }

    await this.recordAudit(actor, 'personal_wa_intel_scan', actor.companyId, {
      classified,
      auraSuggestionsCreated,
      usesBusinessWhatsappMessages: false,
    });

    return { classified, auraSuggestionsCreated };
  }

  async classifyThread(
    actor: PersonalWaIntelActor,
    input: ClassifyPersonalWaThreadRequest,
  ): Promise<PersonalWaIntelThreadSummary> {
    this.assertOwnerAccess(actor);

    const [thread] = await this.db
      .select()
      .from(commPlatformPersonalThreads)
      .where(
        and(
          eq(commPlatformPersonalThreads.id, input.personalThreadId),
          eq(commPlatformPersonalThreads.companyId, actor.companyId),
          eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
        ),
      )
      .limit(1);

    if (!thread) {
      throw new PersonalWhatsappIntelligenceError(
        'NOT_FOUND',
        'Personal thread not found for this Owner',
      );
    }

    const auto = classifyPersonalWaIntelligence({
      contactName: thread.contactName,
      contactPhone: thread.contactPhone,
      preview: thread.lastMessagePreview,
      contextText: input.contextText,
    });
    const classification = input.classificationOverride ?? auto.classification;
    const isBusiness = isBusinessIntelClassification(classification);
    const extraction = isBusiness
      ? extractBusinessFields({
          contactName: thread.contactName,
          contactPhone: thread.contactPhone,
          preview: thread.lastMessagePreview,
          contextText: input.contextText,
          attachmentCount: thread.attachmentCount,
        })
      : null;

    const [existing] = await this.db
      .select()
      .from(personalWaIntelClassifications)
      .where(
        and(
          eq(personalWaIntelClassifications.companyId, actor.companyId),
          eq(personalWaIntelClassifications.ownerUserId, actor.userId),
          eq(personalWaIntelClassifications.personalThreadId, thread.id),
        ),
      )
      .limit(1);

    const payload = {
      classification,
      classificationConfidence: input.classificationOverride ? 100 : auto.confidence,
      manualOverride: input.classificationOverride ?? null,
      rationale: input.notes?.trim() || auto.rationale,
      privacyExcluded: !isBusiness,
      excludedFromBusinessSearch: !isBusiness,
      extraction: (extraction ?? {}) as Record<string, unknown>,
      classifiedByUserId: actor.userId,
      updatedAt: new Date(),
    };

    if (existing) {
      await this.db
        .update(personalWaIntelClassifications)
        .set(payload)
        .where(eq(personalWaIntelClassifications.id, existing.id));
    } else {
      await this.db.insert(personalWaIntelClassifications).values({
        companyId: actor.companyId,
        ownerUserId: actor.userId,
        personalThreadId: thread.id,
        ...payload,
      });
    }

    if (!isBusiness) {
      await this.db
        .update(commPlatformPersonalThreads)
        .set({
          privateByDefault: true,
          excludedFromBusinessSearch: true,
          importConsentGranted: false,
          updatedAt: new Date(),
        })
        .where(eq(commPlatformPersonalThreads.id, thread.id));
    }

    await this.recordAudit(actor, 'personal_wa_intel_classify', thread.id, {
      classification,
      privacyExcluded: !isBusiness,
    });

    const threads = await this.listThreads(actor);
    return threads.find((t) => t.personalThreadId === thread.id)!;
  }

  async listLinkProposals(
    actor: PersonalWaIntelActor,
    status?: 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled',
  ): Promise<PersonalWaIntelLinkProposalSummary[]> {
    this.assertOwnerAccess(actor);

    const filters = [
      eq(personalWaIntelLinkProposals.companyId, actor.companyId),
      eq(personalWaIntelLinkProposals.ownerUserId, actor.userId),
    ];
    if (status) {
      filters.push(eq(personalWaIntelLinkProposals.status, status));
    }

    const rows = await this.db
      .select()
      .from(personalWaIntelLinkProposals)
      .where(and(...filters))
      .orderBy(desc(personalWaIntelLinkProposals.createdAt))
      .limit(100);

    return rows.map((row) => ({
      id: row.id,
      personalThreadId: row.personalThreadId,
      classificationId: row.classificationId,
      linkTargetType: row.linkTargetType,
      linkTargetId: row.linkTargetId,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      autoLinked: false as const,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    }));
  }

  async createLinkProposal(
    actor: PersonalWaIntelActor,
    input: CreatePersonalWaLinkProposalRequest,
  ): Promise<PersonalWaIntelLinkProposalSummary> {
    this.assertOwnerAccess(actor);

    const [thread] = await this.db
      .select()
      .from(commPlatformPersonalThreads)
      .where(
        and(
          eq(commPlatformPersonalThreads.id, input.personalThreadId),
          eq(commPlatformPersonalThreads.companyId, actor.companyId),
          eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
        ),
      )
      .limit(1);

    if (!thread) {
      throw new PersonalWhatsappIntelligenceError(
        'NOT_FOUND',
        'Personal thread not found for this Owner',
      );
    }

    const [classification] = await this.db
      .select()
      .from(personalWaIntelClassifications)
      .where(
        and(
          eq(personalWaIntelClassifications.companyId, actor.companyId),
          eq(personalWaIntelClassifications.ownerUserId, actor.userId),
          eq(personalWaIntelClassifications.personalThreadId, thread.id),
        ),
      )
      .limit(1);

    const effectiveClassification =
      (classification?.manualOverride as PersonalWaIntelClassification | null) ??
      (classification?.classification as PersonalWaIntelClassification | undefined) ??
      'private_personal';

    if (!isBusinessIntelClassification(effectiveClassification)) {
      throw new PersonalWhatsappIntelligenceError(
        'PRIVACY_BLOCKED',
        'Private-personal threads cannot be linked to CRM or timeline. Reclassify as business first.',
      );
    }

    const subject =
      input.subject?.trim() ||
      `Link ${effectiveClassification} thread → ${input.linkTargetType}`;
    const recommendation =
      input.recommendation?.trim() ||
      `Owner approval required to connect this personal thread to ${input.linkTargetType}. Nothing is auto-linked.`;

    const [created] = await this.db
      .insert(personalWaIntelLinkProposals)
      .values({
        companyId: actor.companyId,
        ownerUserId: actor.userId,
        personalThreadId: thread.id,
        classificationId: classification?.id ?? null,
        linkTargetType: input.linkTargetType,
        linkTargetId: input.linkTargetId ?? null,
        status: 'pending_approval',
        subject,
        recommendation,
        notes: input.notes ?? null,
        autoLinked: false,
      })
      .returning();

    await this.recordAudit(actor, 'personal_wa_intel_link_proposed', created!.id, {
      linkTargetType: input.linkTargetType,
      autoLinked: false,
    });

    return {
      id: created!.id,
      personalThreadId: created!.personalThreadId,
      classificationId: created!.classificationId,
      linkTargetType: created!.linkTargetType,
      linkTargetId: created!.linkTargetId,
      status: created!.status,
      subject: created!.subject,
      recommendation: created!.recommendation,
      autoLinked: false,
      createdAt: created!.createdAt.toISOString(),
      decidedAt: null,
    };
  }

  async decideLinkProposal(
    actor: PersonalWaIntelActor,
    proposalId: string,
    input: DecidePersonalWaLinkProposalRequest,
  ): Promise<PersonalWaIntelLinkProposalSummary> {
    this.assertOwnerAccess(actor);

    const [proposal] = await this.db
      .select()
      .from(personalWaIntelLinkProposals)
      .where(
        and(
          eq(personalWaIntelLinkProposals.id, proposalId),
          eq(personalWaIntelLinkProposals.companyId, actor.companyId),
          eq(personalWaIntelLinkProposals.ownerUserId, actor.userId),
        ),
      )
      .limit(1);

    if (!proposal) {
      throw new PersonalWhatsappIntelligenceError('NOT_FOUND', 'Link proposal not found');
    }
    if (proposal.status !== 'pending_approval') {
      throw new PersonalWhatsappIntelligenceError(
        'INVALID_STATE',
        'Proposal is not pending approval',
      );
    }

    if (input.decision === 'reject') {
      const [updated] = await this.db
        .update(personalWaIntelLinkProposals)
        .set({
          status: 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          notes: input.notes ?? proposal.notes,
          updatedAt: new Date(),
        })
        .where(eq(personalWaIntelLinkProposals.id, proposal.id))
        .returning();

      await this.recordAudit(actor, 'personal_wa_intel_link_rejected', proposal.id, {
        linkTargetType: proposal.linkTargetType,
      });

      return {
        id: updated!.id,
        personalThreadId: updated!.personalThreadId,
        classificationId: updated!.classificationId,
        linkTargetType: updated!.linkTargetType,
        linkTargetId: updated!.linkTargetId,
        status: updated!.status,
        subject: updated!.subject,
        recommendation: updated!.recommendation,
        autoLinked: false,
        createdAt: updated!.createdAt.toISOString(),
        decidedAt: updated!.decidedAt?.toISOString() ?? null,
      };
    }

    // Approve + execute link projection (still never copies raw personal messages into Business WA).
    await this.executeApprovedLink(actor, proposal);

    const [updated] = await this.db
      .update(personalWaIntelLinkProposals)
      .set({
        status: 'executed',
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        executedAt: new Date(),
        notes: input.notes ?? proposal.notes,
        autoLinked: false,
        updatedAt: new Date(),
      })
      .where(eq(personalWaIntelLinkProposals.id, proposal.id))
      .returning();

    // Mirror import-decision pattern — auditable; executed only after Owner approve.
    const importLinkTarget =
      proposal.linkTargetType === 'customer' ||
      proposal.linkTargetType === 'job' ||
      proposal.linkTargetType === 'quote' ||
      proposal.linkTargetType === 'invoice' ||
      proposal.linkTargetType === 'property' ||
      proposal.linkTargetType === 'supplier' ||
      proposal.linkTargetType === 'staff'
        ? proposal.linkTargetType
        : null;

    await this.db.insert(commPlatformImportDecisions).values({
      companyId: actor.companyId,
      decidedByUserId: actor.userId,
      personalThreadId: proposal.personalThreadId,
      action: proposal.linkTargetType === 'customer' ? 'create_customer' : 'link',
      linkTargetType: importLinkTarget,
      linkTargetId: proposal.linkTargetId,
      notes: `Personal WA Intelligence Owner-approved link (${proposal.linkTargetType})`,
      autoImported: false,
      executedImport: true,
      metadata: {
        source: 'personal_whatsapp_intelligence',
        proposalId: proposal.id,
        intelLinkTargetType: proposal.linkTargetType,
        neverBusinessWhatsappMessages: true,
      },
    });

    await this.recordAudit(actor, 'personal_wa_intel_link_approved', proposal.id, {
      linkTargetType: proposal.linkTargetType,
      linkTargetId: proposal.linkTargetId,
      executed: true,
    });

    return {
      id: updated!.id,
      personalThreadId: updated!.personalThreadId,
      classificationId: updated!.classificationId,
      linkTargetType: updated!.linkTargetType,
      linkTargetId: updated!.linkTargetId,
      status: updated!.status,
      subject: updated!.subject,
      recommendation: updated!.recommendation,
      autoLinked: false,
      createdAt: updated!.createdAt.toISOString(),
      decidedAt: updated!.decidedAt?.toISOString() ?? null,
    };
  }

  private async executeApprovedLink(
    actor: PersonalWaIntelActor,
    proposal: typeof personalWaIntelLinkProposals.$inferSelect,
  ): Promise<void> {
    if (!proposal.personalThreadId) return;

    const [thread] = await this.db
      .select()
      .from(commPlatformPersonalThreads)
      .where(
        and(
          eq(commPlatformPersonalThreads.id, proposal.personalThreadId),
          eq(commPlatformPersonalThreads.companyId, actor.companyId),
          eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
        ),
      )
      .limit(1);
    if (!thread) return;

    // Consent for business projection only after explicit Owner approve.
    await this.db
      .update(commPlatformPersonalThreads)
      .set({
        importConsentGranted: true,
        excludedFromBusinessSearch: true, // still never enter business search index
        updatedAt: new Date(),
      })
      .where(eq(commPlatformPersonalThreads.id, thread.id));

    const [classification] = proposal.classificationId
      ? await this.db
          .select()
          .from(personalWaIntelClassifications)
          .where(eq(personalWaIntelClassifications.id, proposal.classificationId))
          .limit(1)
      : [undefined];

    const patch: Partial<typeof personalWaIntelClassifications.$inferInsert> = {
      privacyExcluded: false,
      updatedAt: new Date(),
    };

    if (proposal.linkTargetType === 'customer' && proposal.linkTargetId) {
      patch.linkedCustomerId = proposal.linkTargetId;
    }
    if (proposal.linkTargetType === 'lead' && proposal.linkTargetId) {
      patch.linkedLeadId = proposal.linkTargetId;
    }
    if (proposal.linkTargetType === 'job' && proposal.linkTargetId) {
      patch.linkedJobId = proposal.linkTargetId;
    }
    if (proposal.linkTargetType === 'property' && proposal.linkTargetId) {
      patch.linkedPropertyId = proposal.linkTargetId;
    }

    // Project a PCI conversation row for business intelligence (metadata only — no fake messages).
    if (!classification?.personalCommConversationId) {
      const threadKey = `personal_wa_intel:${thread.id}`;
      const [existingConv] = await this.db
        .select()
        .from(personalCommConversations)
        .where(
          and(
            eq(personalCommConversations.companyId, actor.companyId),
            eq(personalCommConversations.threadKey, threadKey),
          ),
        )
        .limit(1);

      let conversationId = existingConv?.id;
      if (!existingConv) {
        const [createdConv] = await this.db
          .insert(personalCommConversations)
          .values({
            companyId: actor.companyId,
            customerId:
              proposal.linkTargetType === 'customer' ? (proposal.linkTargetId ?? null) : null,
            contactPhone: thread.contactPhone,
            contactName: thread.contactName,
            threadKey,
            lastMessageAt: thread.lastMessageAt,
            messageCount: 0,
            classification: 'business_customer',
            classificationConfidence: classification?.classificationConfidence ?? 70,
            privacyMode: 'business',
            excludedFromReports: false,
            metadata: {
              source: 'personal_whatsapp_intelligence',
              personalThreadId: thread.id,
              ownerApproved: true,
              noFabricatedMessages: true,
            },
          })
          .returning();
        conversationId = createdConv!.id;
      }
      patch.personalCommConversationId = conversationId;
    }

    if (proposal.linkTargetType === 'timeline') {
      await this.db.insert(ucTimelineIndex).values({
        companyId: actor.companyId,
        customerId: classification?.linkedCustomerId ?? null,
        jobId: classification?.linkedJobId ?? null,
        entryType: 'whatsapp',
        channel: 'whatsapp',
        title: `Personal WA (Owner-approved) — ${thread.contactName ?? thread.contactPhone ?? 'thread'}`,
        summary:
          'Owner-approved Personal WhatsApp Intelligence projection. Raw personal messages remain private; this is a business link marker only.',
        sourceModule: 'personal_whatsapp_intelligence',
        sourceEntityId: proposal.id,
        occurredAt: thread.lastMessageAt ?? new Date(),
        metadata: {
          personalThreadId: thread.id,
          ownerApproved: true,
          usesBusinessWhatsappMessages: false,
          previewRedacted: true,
        },
      });
      patch.timelineLinked = true;
    }

    if (classification) {
      await this.db
        .update(personalWaIntelClassifications)
        .set(patch)
        .where(eq(personalWaIntelClassifications.id, classification.id));
    }
  }

  async listAuraSuggestions(
    actor: PersonalWaIntelActor,
    status?: 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled',
  ): Promise<PersonalWaIntelAuraSuggestionSummary[]> {
    this.assertOwnerAccess(actor);

    const filters = [
      eq(personalWaIntelAuraSuggestions.companyId, actor.companyId),
      eq(personalWaIntelAuraSuggestions.ownerUserId, actor.userId),
    ];
    if (status) {
      filters.push(eq(personalWaIntelAuraSuggestions.status, status));
    }

    const rows = await this.db
      .select()
      .from(personalWaIntelAuraSuggestions)
      .where(and(...filters))
      .orderBy(desc(personalWaIntelAuraSuggestions.createdAt))
      .limit(100);

    return rows.map((row) => ({
      id: row.id,
      personalThreadId: row.personalThreadId,
      suggestionType: row.suggestionType,
      status: row.status,
      subject: row.subject,
      body: row.body,
      autoSend: false as const,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createAuraSuggestion(
    actor: PersonalWaIntelActor,
    input: CreatePersonalWaAuraSuggestionRequest,
  ): Promise<PersonalWaIntelAuraSuggestionSummary> {
    this.assertOwnerAccess(actor);

    if (input.personalThreadId) {
      const [thread] = await this.db
        .select()
        .from(commPlatformPersonalThreads)
        .where(
          and(
            eq(commPlatformPersonalThreads.id, input.personalThreadId),
            eq(commPlatformPersonalThreads.companyId, actor.companyId),
            eq(commPlatformPersonalThreads.ownerUserId, actor.userId),
          ),
        )
        .limit(1);
      if (!thread) {
        throw new PersonalWhatsappIntelligenceError(
          'NOT_FOUND',
          'Personal thread not found for this Owner',
        );
      }
    }

    const [created] = await this.db
      .insert(personalWaIntelAuraSuggestions)
      .values({
        companyId: actor.companyId,
        ownerUserId: actor.userId,
        personalThreadId: input.personalThreadId ?? null,
        suggestionType: input.suggestionType,
        status: 'pending_approval',
        subject: input.subject.trim(),
        body: input.body.trim(),
        autoSend: false,
      })
      .returning();

    await this.recordAudit(actor, 'personal_wa_intel_aura_suggested', created!.id, {
      suggestionType: input.suggestionType,
      autoSend: false,
    });

    return {
      id: created!.id,
      personalThreadId: created!.personalThreadId,
      suggestionType: created!.suggestionType,
      status: created!.status,
      subject: created!.subject,
      body: created!.body,
      autoSend: false,
      createdAt: created!.createdAt.toISOString(),
    };
  }

  async decideAuraSuggestion(
    actor: PersonalWaIntelActor,
    suggestionId: string,
    input: DecidePersonalWaAuraSuggestionRequest,
  ): Promise<PersonalWaIntelAuraSuggestionSummary> {
    this.assertOwnerAccess(actor);

    const [existing] = await this.db
      .select()
      .from(personalWaIntelAuraSuggestions)
      .where(
        and(
          eq(personalWaIntelAuraSuggestions.id, suggestionId),
          eq(personalWaIntelAuraSuggestions.companyId, actor.companyId),
          eq(personalWaIntelAuraSuggestions.ownerUserId, actor.userId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new PersonalWhatsappIntelligenceError('NOT_FOUND', 'AURA suggestion not found');
    }
    if (existing.status !== 'pending_approval') {
      throw new PersonalWhatsappIntelligenceError(
        'INVALID_STATE',
        'Suggestion is not pending approval',
      );
    }

    // Approve means Owner accepted the draft/next-action — still never sends.
    const nextStatus = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.db
      .update(personalWaIntelAuraSuggestions)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        autoSend: false,
        metadata: {
          ...(existing.metadata as Record<string, unknown>),
          decisionNotes: input.notes ?? null,
          note: 'Approval does not send any WhatsApp message.',
        },
        updatedAt: new Date(),
      })
      .where(eq(personalWaIntelAuraSuggestions.id, existing.id))
      .returning();

    await this.recordAudit(
      actor,
      input.decision === 'approve'
        ? 'personal_wa_intel_aura_approved'
        : 'personal_wa_intel_aura_rejected',
      existing.id,
      { autoSend: false, sent: false },
    );

    return {
      id: updated!.id,
      personalThreadId: updated!.personalThreadId,
      suggestionType: updated!.suggestionType,
      status: updated!.status,
      subject: updated!.subject,
      body: updated!.body,
      autoSend: false,
      createdAt: updated!.createdAt.toISOString(),
    };
  }
}
