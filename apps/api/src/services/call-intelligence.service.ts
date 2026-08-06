import { and, desc, eq } from 'drizzle-orm';
import {
  aggregateCiInsights,
  buildCiCallStats,
  buildCiCallSummaryFromText,
  buildCiLeadDraft,
  canAccessCallIntelligence,
  canApproveCiLeadDrafts,
  canViewCiInternalCustomerNotes,
  canWriteCallIntelligence,
  CI_PRODUCT_COPY,
  detectCiSentimentFromText,
  inferCiLeadKindFromText,
  listCiConnections,
  type AnalyzeCiCallRequest,
  type CiCallSummaryView,
  type CiCustomerHistoryLookup,
  type CiLeadDraftSummary,
  type CiOwnerDashboard,
  type CiSentimentView,
  type DecideCiLeadDraftRequest,
  type ExtractCiLeadDraftRequest,
  type LookupCiCustomerHistoryRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  ciCallAnalyses,
  ciLeadDrafts,
  ciSettings,
  customers,
  invoices,
  jobs,
  opsRecurringMaintenancePlans,
  quotes,
  securityAuditLogs,
  vairCallSessions,
  voiceConversations,
  voiceSessions,
} from '@titan/db';

export class CallIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CallIntelligenceError';
  }
}

export type CiActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export class CallIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: CiActor): void {
    if (!canAccessCallIntelligence(actor)) {
      throw new CallIntelligenceError(
        'FORBIDDEN',
        'Call Intelligence requires Owner/Admin or voice/communications access. Technician/Client denied.',
      );
    }
  }

  private assertWrite(actor: CiActor): void {
    this.assertRead(actor);
    if (!canWriteCallIntelligence(actor)) {
      throw new CallIntelligenceError(
        'FORBIDDEN',
        'Write actions require Owner/Admin or voice/communications write permissions.',
      );
    }
  }

  private assertApprove(actor: CiActor): void {
    this.assertWrite(actor);
    if (!canApproveCiLeadDrafts(actor)) {
      throw new CallIntelligenceError(
        'FORBIDDEN',
        'Only Owner or Admin may approve Call Intelligence lead drafts.',
      );
    }
  }

  private async recordAudit(
    actor: CiActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'call_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        autoSend: false,
        autoExecuted: false,
        ...metadata,
      },
    });
  }

  private async ensureSettings(companyId: string) {
    const existing = await this.db
      .select()
      .from(ciSettings)
      .where(eq(ciSettings.companyId, companyId))
      .limit(1);
    if (existing[0]) return existing[0];
    const [created] = await this.db
      .insert(ciSettings)
      .values({
        companyId,
        autoSendEnabled: false,
        leadDraftsRequireOwnerApproval: true,
      })
      .returning();
    return created;
  }

  private mapLeadDraft(row: typeof ciLeadDrafts.$inferSelect): CiLeadDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      callSessionId: row.callSessionId,
      voiceSessionId: row.voiceSessionId,
      customerId: row.customerId,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      autoExecuted: false,
      autoSend: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: toIso(row.decidedAt),
    };
  }

  private async loadTranscriptBundle(
    actor: CiActor,
    input: { callSessionId?: string; voiceSessionId?: string },
  ): Promise<{
    callSessionId: string | null;
    voiceSessionId: string | null;
    customerId: string | null;
    callerName: string | null;
    callerPhone: string | null;
    storedSummary: string | null;
    transcriptText: string;
    transcriptTurnCount: number;
  }> {
    let callSessionId = input.callSessionId ?? null;
    let voiceSessionId = input.voiceSessionId ?? null;
    let customerId: string | null = null;
    let callerName: string | null = null;
    let callerPhone: string | null = null;
    let storedSummary: string | null = null;

    if (callSessionId) {
      let session: typeof vairCallSessions.$inferSelect | undefined;
      try {
        session = await this.db.query.vairCallSessions.findFirst({
          where: and(
            eq(vairCallSessions.id, callSessionId),
            eq(vairCallSessions.companyId, actor.companyId),
            eq(vairCallSessions.invented, false),
          ),
        });
      } catch {
        throw new CallIntelligenceError(
          'NOT_FOUND',
          'Voice AI Receptionist call sessions are not available yet — analyze via voiceSessionId.',
        );
      }
      if (!session) {
        throw new CallIntelligenceError('NOT_FOUND', 'VAIR call session not found for this tenant.');
      }
      voiceSessionId = voiceSessionId ?? session.voiceSessionId;
      customerId = session.customerId;
      callerName = session.callerName;
      callerPhone = session.callerPhone;
      storedSummary = session.summary;
    }

    if (voiceSessionId) {
      const voice = await this.db.query.voiceSessions.findFirst({
        where: and(
          eq(voiceSessions.id, voiceSessionId),
          eq(voiceSessions.companyId, actor.companyId),
        ),
      });
      if (!voice) {
        throw new CallIntelligenceError('NOT_FOUND', 'Voice session not found for this tenant.');
      }
      customerId = customerId ?? voice.customerId;
      callerName = callerName ?? voice.callerName;
      callerPhone = callerPhone ?? voice.callerPhone;
      storedSummary = storedSummary ?? voice.summary;
    }

    if (!callSessionId && !voiceSessionId) {
      throw new CallIntelligenceError(
        'VALIDATION_ERROR',
        'Provide callSessionId and/or voiceSessionId from real call records.',
      );
    }

    let transcriptText = '';
    let transcriptTurnCount = 0;
    if (voiceSessionId) {
      const turns = await this.db
        .select({
          speaker: voiceConversations.speaker,
          content: voiceConversations.content,
        })
        .from(voiceConversations)
        .where(
          and(
            eq(voiceConversations.companyId, actor.companyId),
            eq(voiceConversations.sessionId, voiceSessionId),
          ),
        )
        .orderBy(voiceConversations.occurredAt)
        .limit(200);
      transcriptTurnCount = turns.length;
      transcriptText = turns.map((t) => `${t.speaker}: ${t.content}`).join('\n');
    }

    return {
      callSessionId,
      voiceSessionId,
      customerId,
      callerName,
      callerPhone,
      storedSummary,
      transcriptText,
      transcriptTurnCount,
    };
  }

  async getDashboard(actor: CiActor): Promise<CiOwnerDashboard> {
    this.assertRead(actor);
    await this.ensureSettings(actor.companyId);

    let vairRows: Array<{ id: string }> = [];
    try {
      vairRows = await this.db
        .select({ id: vairCallSessions.id })
        .from(vairCallSessions)
        .where(
          and(
            eq(vairCallSessions.companyId, actor.companyId),
            eq(vairCallSessions.invented, false),
          ),
        );
    } catch {
      vairRows = [];
    }

    const [voiceRows, analysisRows, leadRows] = await Promise.all([
      this.db
        .select({ id: voiceSessions.id, summary: voiceSessions.summary })
        .from(voiceSessions)
        .where(eq(voiceSessions.companyId, actor.companyId)),
      this.db
        .select()
        .from(ciCallAnalyses)
        .where(
          and(eq(ciCallAnalyses.companyId, actor.companyId), eq(ciCallAnalyses.invented, false)),
        )
        .orderBy(desc(ciCallAnalyses.createdAt))
        .limit(25),
      this.db
        .select()
        .from(ciLeadDrafts)
        .where(eq(ciLeadDrafts.companyId, actor.companyId))
        .orderBy(desc(ciLeadDrafts.createdAt))
        .limit(40),
    ]);

    const pendingLeadApprovals = leadRows.filter((d) => d.status === 'pending_approval').length;
    const callStats = buildCiCallStats({
      vairSessionCount: vairRows.length,
      voiceSessionCount: voiceRows.length,
      analyzedCount: analysisRows.length,
      pendingLeadApprovals,
    });

    const recentSummaries: CiCallSummaryView[] = analysisRows.slice(0, 10).map((row) => ({
      callSessionId: row.callSessionId,
      voiceSessionId: row.voiceSessionId,
      availability: row.availability as CiCallSummaryView['availability'],
      summary: row.summary,
      keyPoints: row.keyPoints ?? [],
      customerRequests: row.customerRequests ?? [],
      requiredActions: row.requiredActions ?? [],
      followUpRecommendations: row.followUpRecommendations ?? [],
      transcriptTurnCount: row.transcriptTurnCount,
      rationale:
        row.availability === 'unavailable'
          ? 'Stored analysis marked unavailable — not invented.'
          : 'From stored Call Intelligence analysis of real call records.',
      invented: false,
    }));

    const insightTexts = [
      ...analysisRows
        .map((r) =>
          [r.summary, ...(r.keyPoints ?? []), ...(r.customerRequests ?? [])]
            .filter(Boolean)
            .join('\n'),
        )
        .filter((t) => t.trim().length > 0),
      ...voiceRows.map((v) => v.summary ?? '').filter((t) => t.trim().length > 0),
    ];
    const insights = aggregateCiInsights({ texts: insightTexts });

    const sentimentTexts = analysisRows
      .map((r) => r.summary ?? '')
      .filter((t) => t.trim().length > 0);
    const sentimentOverview: CiSentimentView =
      sentimentTexts.length === 0
        ? detectCiSentimentFromText({ text: '' })
        : detectCiSentimentFromText({ text: sentimentTexts.slice(0, 20).join('\n') });

    return {
      summary:
        callStats.availability === 'unavailable'
          ? 'Call Intelligence is ready. No real call sessions yet — summaries, sentiment, and insights stay unavailable (not invented).'
          : `Call Intelligence over ${callStats.vairSessionCount + callStats.voiceSessionCount} real session record(s). Lead drafts require Owner approval. No automatic customer communication.`,
      productClarification: { ...CI_PRODUCT_COPY },
      policy: {
        fakeCalls: false,
        fakeLeads: false,
        automaticCustomerCommunication: false,
        leadDraftsRequireOwnerApproval: true,
        financeMarginsExposed: false,
        ownerControlled: true,
      },
      callStats,
      recentSummaries,
      sentimentOverview,
      insights,
      leadDraftQueue: leadRows.map((r) => this.mapLeadDraft(r)),
      connections: listCiConnections(),
    };
  }

  async analyzeCall(actor: CiActor, input: AnalyzeCiCallRequest) {
    this.assertWrite(actor);
    const bundle = await this.loadTranscriptBundle(actor, input);
    const summaryView = buildCiCallSummaryFromText({
      callSessionId: bundle.callSessionId,
      voiceSessionId: bundle.voiceSessionId,
      storedSummary: bundle.storedSummary,
      transcriptText: bundle.transcriptText,
      transcriptTurnCount: bundle.transcriptTurnCount,
    });
    const sentiment = detectCiSentimentFromText({
      text: [bundle.storedSummary, bundle.transcriptText].filter(Boolean).join('\n'),
    });

    const [row] = await this.db
      .insert(ciCallAnalyses)
      .values({
        companyId: actor.companyId,
        callSessionId: bundle.callSessionId,
        voiceSessionId: bundle.voiceSessionId,
        customerId: bundle.customerId,
        availability: summaryView.availability,
        summary: summaryView.summary,
        keyPoints: summaryView.keyPoints,
        customerRequests: summaryView.customerRequests,
        requiredActions: summaryView.requiredActions,
        followUpRecommendations: summaryView.followUpRecommendations,
        transcriptTurnCount: summaryView.transcriptTurnCount,
        sentiment: sentiment.sentiment,
        sentimentAvailability: sentiment.availability,
        urgency: sentiment.urgency,
        priority: sentiment.priority,
        sentimentRationale: sentiment.rationale,
        invented: false,
        createdByUserId: actor.userId,
        metadata: {
          autoSend: false,
          recommendations: sentiment.recommendations,
        },
      })
      .returning();

    await this.recordAudit(actor, 'ci_call_analyzed', row.id, {
      callSessionId: bundle.callSessionId,
      voiceSessionId: bundle.voiceSessionId,
      availability: summaryView.availability,
      sentimentAvailability: sentiment.availability,
    });

    return { summary: summaryView, sentiment, analysisId: row.id };
  }

  async lookupCustomerHistory(
    actor: CiActor,
    input: LookupCiCustomerHistoryRequest,
  ): Promise<CiCustomerHistoryLookup> {
    this.assertRead(actor);

    let customerId = input.customerId ?? null;
    if (!customerId && (input.callSessionId || input.voiceSessionId)) {
      const bundle = await this.loadTranscriptBundle(actor, {
        callSessionId: input.callSessionId,
        voiceSessionId: input.voiceSessionId,
      });
      customerId = bundle.customerId;
    }

    if (!customerId) {
      return {
        availability: 'unavailable',
        customer: null,
        previousJobs: [],
        quotes: [],
        invoices: [],
        maintenance: [],
        equipment: {
          availability: 'unavailable',
          items: [],
          rationale:
            'No customer linked to this call — history unavailable (not invented). Asset equipment has no customer FK in this foundation.',
        },
        rationale:
          'Customer history requires a real customerId or a call session linked to CRM. Nothing invented.',
        customer360Module: false,
      };
    }

    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, actor.companyId)),
    });
    if (!customer) {
      throw new CallIntelligenceError('NOT_FOUND', 'Customer not found for this tenant.');
    }

    const showNotes = canViewCiInternalCustomerNotes(actor);
    const [jobRows, quoteRows, invoiceRows, maintenanceRows] = await Promise.all([
      this.db
        .select({
          id: jobs.id,
          jobNumber: jobs.jobNumber,
          title: jobs.title,
          status: jobs.status,
          priority: jobs.priority,
          scheduledAt: jobs.scheduledAt,
          customerVisibleNotes: jobs.customerVisibleNotes,
        })
        .from(jobs)
        .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.customerId, customerId)))
        .orderBy(desc(jobs.createdAt))
        .limit(25),
      this.db
        .select({
          id: quotes.id,
          quoteNumber: quotes.quoteNumber,
          title: quotes.title,
          status: quotes.status,
          totalCents: quotes.totalCents,
          currency: quotes.currency,
        })
        .from(quotes)
        .where(and(eq(quotes.companyId, actor.companyId), eq(quotes.customerId, customerId)))
        .orderBy(desc(quotes.createdAt))
        .limit(25),
      this.db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          title: invoices.title,
          status: invoices.status,
          totalCents: invoices.totalCents,
          amountPaidCents: invoices.amountPaidCents,
          currency: invoices.currency,
          dueDate: invoices.dueDate,
        })
        .from(invoices)
        .where(and(eq(invoices.companyId, actor.companyId), eq(invoices.customerId, customerId)))
        .orderBy(desc(invoices.createdAt))
        .limit(25),
      this.db
        .select({
          id: opsRecurringMaintenancePlans.id,
          planName: opsRecurringMaintenancePlans.name,
          status: opsRecurringMaintenancePlans.status,
          nextDueAt: opsRecurringMaintenancePlans.nextDueAt,
        })
        .from(opsRecurringMaintenancePlans)
        .where(
          and(
            eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
            eq(opsRecurringMaintenancePlans.customerId, customerId),
          ),
        )
        .orderBy(desc(opsRecurringMaintenancePlans.updatedAt))
        .limit(25),
    ]);

    await this.recordAudit(actor, 'ci_customer_history_lookup', customerId, {
      jobCount: jobRows.length,
      quoteCount: quoteRows.length,
      invoiceCount: invoiceRows.length,
      notesVisible: showNotes,
      financeMarginsExposed: false,
    });

    return {
      availability: 'available',
      customer: {
        customerId: customer.id,
        name: customer.name,
        contactPerson: customer.contactPerson,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        notes: showNotes ? customer.notes : null,
        notesVisibility: showNotes ? 'owner_admin' : 'hidden',
      },
      previousJobs: jobRows.map((j) => ({
        id: j.id,
        jobNumber: j.jobNumber,
        title: j.title,
        status: j.status,
        priority: j.priority,
        scheduledAt: toIso(j.scheduledAt),
        customerVisibleNotes: j.customerVisibleNotes,
      })),
      quotes: quoteRows.map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        title: q.title,
        status: q.status,
        totalCents: q.totalCents,
        currency: q.currency,
        financeMarginsExposed: false as const,
        internalNotesExposed: false as const,
      })),
      invoices: invoiceRows.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        title: inv.title,
        status: inv.status,
        totalCents: inv.totalCents,
        amountPaidCents: inv.amountPaidCents,
        currency: inv.currency,
        dueDate: toIso(inv.dueDate),
      })),
      maintenance: maintenanceRows.map((m) => ({
        id: m.id,
        planName: m.planName,
        status: m.status,
        nextDueAt: toIso(m.nextDueAt),
      })),
      equipment: {
        availability: 'unavailable',
        items: [],
        rationale:
          'Customer-linked equipment inventory is unavailable in this foundation (asset_equipment has no customer FK) — not invented.',
      },
      rationale:
        'Approved call-safe CRM facets only. Quote margins/internal notes omitted. Internal customer notes Owner/Admin only.',
      customer360Module: false,
    };
  }

  async listLeadDrafts(actor: CiActor): Promise<CiLeadDraftSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(ciLeadDrafts)
      .where(eq(ciLeadDrafts.companyId, actor.companyId))
      .orderBy(desc(ciLeadDrafts.createdAt))
      .limit(100);
    return rows.map((r) => this.mapLeadDraft(r));
  }

  async extractLeadDraft(actor: CiActor, input: ExtractCiLeadDraftRequest) {
    this.assertWrite(actor);
    await this.ensureSettings(actor.companyId);

    let bundle: Awaited<ReturnType<CallIntelligenceService['loadTranscriptBundle']>> | null = null;
    if (input.callSessionId || input.voiceSessionId) {
      bundle = await this.loadTranscriptBundle(actor, {
        callSessionId: input.callSessionId,
        voiceSessionId: input.voiceSessionId,
      });
    }

    const sourceText = [input.notes, bundle?.storedSummary, bundle?.transcriptText]
      .filter(Boolean)
      .join('\n');

    const kind = input.kind ?? inferCiLeadKindFromText(sourceText);
    const contactName = input.contactName?.trim() || bundle?.callerName?.trim() || null;
    const contactPhone = input.contactPhone?.trim() || bundle?.callerPhone?.trim() || null;

    if (!contactName && !sourceText.trim()) {
      throw new CallIntelligenceError(
        'VALIDATION_ERROR',
        'Cannot invent a lead — provide contact details or a real call session with notes/transcript.',
      );
    }

    const draftCopy = buildCiLeadDraft({
      kind,
      contactName,
      contactPhone,
      contactEmail: input.contactEmail,
      serviceType: input.serviceType,
      notes: input.notes,
      summaryExcerpt: bundle?.storedSummary ?? sourceText.slice(0, 500),
    });

    const status = input.submitForApproval === false ? 'draft' : 'pending_approval';
    const [row] = await this.db
      .insert(ciLeadDrafts)
      .values({
        companyId: actor.companyId,
        kind,
        status,
        title: draftCopy.title,
        body: draftCopy.body,
        callSessionId: bundle?.callSessionId ?? input.callSessionId ?? null,
        voiceSessionId: bundle?.voiceSessionId ?? input.voiceSessionId ?? null,
        customerId: bundle?.customerId ?? null,
        contactName,
        contactPhone,
        contactEmail: input.contactEmail ?? null,
        autoExecuted: false,
        autoSend: false,
        payload: {
          serviceType: input.serviceType ?? null,
          autoSend: false,
          autoExecuted: false,
        },
        createdByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'ci_lead_draft_created', row.id, {
      kind,
      status,
      callSessionId: row.callSessionId,
      autoSend: false,
    });

    return this.mapLeadDraft(row);
  }

  async decideLeadDraft(actor: CiActor, draftId: string, input: DecideCiLeadDraftRequest) {
    this.assertApprove(actor);
    const existingRows = await this.db
      .select()
      .from(ciLeadDrafts)
      .where(and(eq(ciLeadDrafts.id, draftId), eq(ciLeadDrafts.companyId, actor.companyId)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      throw new CallIntelligenceError('NOT_FOUND', 'Lead draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new CallIntelligenceError('INVALID_STATE', `Lead draft is already ${existing.status}.`);
    }

    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'cancelled';

    const [row] = await this.db
      .update(ciLeadDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoExecuted: false,
        autoSend: false,
        updatedAt: new Date(),
      })
      .where(and(eq(ciLeadDrafts.id, draftId), eq(ciLeadDrafts.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(
      actor,
      nextStatus === 'approved' ? 'ci_lead_draft_approved' : 'ci_lead_draft_decided',
      row.id,
      {
        decision: input.decision,
        note:
          nextStatus === 'approved'
            ? 'Approval records Owner intent only — does not auto-create CRM lead or send customer communication.'
            : 'Lead draft decision recorded.',
        autoSend: false,
        autoExecuted: false,
      },
    );

    return this.mapLeadDraft(row);
  }

  async getInsights(actor: CiActor) {
    this.assertRead(actor);
    const analysisRows = await this.db
      .select({
        summary: ciCallAnalyses.summary,
        keyPoints: ciCallAnalyses.keyPoints,
        customerRequests: ciCallAnalyses.customerRequests,
      })
      .from(ciCallAnalyses)
      .where(
        and(eq(ciCallAnalyses.companyId, actor.companyId), eq(ciCallAnalyses.invented, false)),
      )
      .orderBy(desc(ciCallAnalyses.createdAt))
      .limit(100);

    const voiceRows = await this.db
      .select({ summary: voiceSessions.summary })
      .from(voiceSessions)
      .where(eq(voiceSessions.companyId, actor.companyId))
      .orderBy(desc(voiceSessions.startedAt))
      .limit(100);

    const texts = [
      ...analysisRows.map((r) =>
        [r.summary, ...(r.keyPoints ?? []), ...(r.customerRequests ?? [])].filter(Boolean).join('\n'),
      ),
      ...voiceRows.map((v) => v.summary ?? ''),
    ].filter((t) => t.trim().length > 0);

    return aggregateCiInsights({ texts });
  }
}
