import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  buildAuraSalesInsightDraft,
  buildImprovementAreaInsightDraft,
  buildLostOpportunityInsightDraft,
  buildRevenueOpportunityInsightDraft,
  buildSaiMetricSnapshot,
  buildSaiPerformanceRows,
  buildSalesTrendInsightDraft,
  canAccessSalesAnalyticsIntelligence,
  canApproveSaiInsightDrafts,
  canManageSaiSettings,
  canWriteSalesAnalyticsIntelligence,
  defaultSaiSettings,
  listSaiConnections,
  SAI_DEFAULT_MIN_CONVERSION_SAMPLE,
  SAI_PRODUCT_COPY,
  type AcknowledgeSaiInsightRequest,
  type CreateSaiAuraInsightRequest,
  type DecideSaiInsightRequest,
  type RefreshSaiInsightsRequest,
  type SaiAnalyticsSnapshotSummary,
  type SaiAuraInsightSummary,
  type SaiInsightDraftSummary,
  type SaiMetricSnapshot,
  type SaiOwnerDashboard,
  type SaiSettings,
  type UpdateSaiSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  leads,
  quotes,
  saiAnalyticsSnapshots,
  saiAuraInsights,
  saiInsightDrafts,
  saiSettings,
  salesOpportunities,
  securityAuditLogs,
} from '@titan/db';

export class SalesAnalyticsIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SalesAnalyticsIntelligenceError';
  }
}

export type SaiActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

const QUOTE_SENT_STATUSES = new Set([
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'converted',
]);

export class SalesAnalyticsIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: SaiActor): void {
    if (!canAccessSalesAnalyticsIntelligence(actor)) {
      throw new SalesAnalyticsIntelligenceError(
        'FORBIDDEN',
        'Sales Analytics Intelligence requires Owner or sales/leads permissions. Technicians and clients are denied.',
      );
    }
  }

  private assertWrite(actor: SaiActor): void {
    this.assertRead(actor);
    if (!canWriteSalesAnalyticsIntelligence(actor)) {
      throw new SalesAnalyticsIntelligenceError(
        'FORBIDDEN',
        'Write actions require Owner or sales write permissions.',
      );
    }
  }

  private assertApprove(actor: SaiActor): void {
    this.assertWrite(actor);
    if (!canApproveSaiInsightDrafts(actor)) {
      throw new SalesAnalyticsIntelligenceError(
        'FORBIDDEN',
        'Only Owner or Admin may approve sales analytics insight drafts.',
      );
    }
  }

  private assertManageSettings(actor: SaiActor): void {
    this.assertWrite(actor);
    if (!canManageSaiSettings(actor)) {
      throw new SalesAnalyticsIntelligenceError(
        'FORBIDDEN',
        'Only Owner or Admin may change Sales Analytics Intelligence settings.',
      );
    }
  }

  private async recordAudit(
    actor: SaiActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'sales_analytics_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        inventRates: false,
        inventRevenue: false,
        autoOutreach: false,
      },
    });
  }

  private toDraft(row: typeof saiInsightDrafts.$inferSelect): SaiInsightDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      sourceQuoteId: row.sourceQuoteId,
      sourceLeadId: row.sourceLeadId,
      sourceOpportunityId: row.sourceOpportunityId,
      sourceCustomerId: row.sourceCustomerId,
      inventedRates: false,
      autoOutreach: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof saiAuraInsights.$inferSelect): SaiAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      sourceInsightDraftId: row.sourceInsightDraftId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSettings(row: typeof saiSettings.$inferSelect): SaiSettings {
    return defaultSaiSettings({
      id: row.id,
      insightsEnabled: row.insightsEnabled,
      minConversionSample: row.minConversionSample,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private toSnapshot(row: typeof saiAnalyticsSnapshots.$inferSelect): SaiAnalyticsSnapshotSummary {
    return {
      id: row.id,
      leadsCreated: row.leadsCreated,
      quotesSent: row.quotesSent,
      quotesAccepted: row.quotesAccepted,
      quotesDeclined: row.quotesDeclined,
      openOpportunityCount: row.openOpportunityCount,
      wonOpportunityCount: row.wonOpportunityCount,
      lostOpportunityCount: row.lostOpportunityCount,
      pipelineValueCents: row.pipelineValueCents,
      acceptedQuoteValueCents: row.acceptedQuoteValueCents,
      currency: row.currency,
      quoteConversionRatePercent:
        row.quoteConversionRatePercent !== null && row.quoteConversionRatePercent !== undefined
          ? Number(row.quoteConversionRatePercent)
          : null,
      leadToQuoteRatePercent:
        row.leadToQuoteRatePercent !== null && row.leadToQuoteRatePercent !== undefined
          ? Number(row.leadToQuoteRatePercent)
          : null,
      winRatePercent:
        row.winRatePercent !== null && row.winRatePercent !== undefined
          ? Number(row.winRatePercent)
          : null,
      conversionAvailability: row.conversionAvailability as SaiMetricSnapshot['conversionAvailability'],
      revenueAvailability: row.revenueAvailability as SaiMetricSnapshot['revenueAvailability'],
      rationale: row.rationale,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async ensureSettings(actor: SaiActor): Promise<SaiSettings> {
    const existing = await this.db.query.saiSettings.findFirst({
      where: eq(saiSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(saiSettings)
      .values({
        companyId: actor.companyId,
        insightsEnabled: true,
        minConversionSample: SAI_DEFAULT_MIN_CONVERSION_SAMPLE,
        inventRatesEnabled: false,
        autoOutreachEnabled: false,
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private isQuoteSent(row: {
    status: string;
    issuedAt: Date | null;
  }): boolean {
    if (QUOTE_SENT_STATUSES.has(row.status)) return true;
    return row.issuedAt !== null && row.status !== 'draft' && row.status !== 'cancelled';
  }

  private async computeMetrics(
    actor: SaiActor,
    minConversionSample: number,
  ): Promise<SaiMetricSnapshot> {
    const [leadRows, quoteRows, opportunityRows] = await Promise.all([
      this.db.query.leads.findMany({
        where: eq(leads.companyId, actor.companyId),
        columns: { id: true, status: true, createdAt: true },
        limit: 5000,
      }),
      this.db.query.quotes.findMany({
        where: eq(quotes.companyId, actor.companyId),
        columns: {
          id: true,
          status: true,
          issuedAt: true,
          totalCents: true,
          amountCents: true,
          currency: true,
        },
        limit: 5000,
      }),
      this.db.query.salesOpportunities.findMany({
        where: eq(salesOpportunities.companyId, actor.companyId),
        columns: {
          id: true,
          status: true,
          estimatedValueCents: true,
          currency: true,
        },
        limit: 5000,
      }),
    ]);

    const quotesSentRows = quoteRows.filter((q) => this.isQuoteSent(q));
    const quotesAcceptedRows = quoteRows.filter((q) => q.status === 'accepted' || q.status === 'converted');
    const quotesDeclinedRows = quoteRows.filter((q) => q.status === 'declined');

    const openOpps = opportunityRows.filter((o) => o.status === 'open');
    const wonOpps = opportunityRows.filter((o) => o.status === 'won');
    const lostOpps = opportunityRows.filter((o) => o.status === 'lost');

    const pipelineValueCents = openOpps.reduce(
      (sum, o) => sum + (o.estimatedValueCents ?? 0),
      0,
    );
    const acceptedQuoteValueCents = quotesAcceptedRows.reduce((sum, q) => {
      const cents = q.totalCents > 0 ? q.totalCents : q.amountCents;
      return sum + (cents ?? 0);
    }, 0);

    const currency =
      quoteRows.find((q) => q.currency)?.currency ??
      opportunityRows.find((o) => o.currency)?.currency ??
      'ZAR';

    return buildSaiMetricSnapshot({
      leadsCreated: leadRows.length,
      quotesSent: quotesSentRows.length,
      quotesAccepted: quotesAcceptedRows.length,
      quotesDeclined: quotesDeclinedRows.length,
      openOpportunityCount: openOpps.length,
      wonOpportunityCount: wonOpps.length,
      lostOpportunityCount: lostOpps.length,
      pipelineValueCents,
      acceptedQuoteValueCents,
      currency,
      minConversionSample,
    });
  }

  async getOwnerDashboard(actor: SaiActor): Promise<SaiOwnerDashboard> {
    this.assertRead(actor);
    const settings = await this.ensureSettings(actor);
    const metrics = await this.computeMetrics(actor, settings.minConversionSample);

    const [draftRows, insightRows, snapshotRows] = await Promise.all([
      this.db.query.saiInsightDrafts.findMany({
        where: eq(saiInsightDrafts.companyId, actor.companyId),
        orderBy: [desc(saiInsightDrafts.createdAt)],
        limit: 50,
      }),
      this.db.query.saiAuraInsights.findMany({
        where: eq(saiAuraInsights.companyId, actor.companyId),
        orderBy: [desc(saiAuraInsights.createdAt)],
        limit: 50,
      }),
      this.db.query.saiAnalyticsSnapshots.findMany({
        where: eq(saiAnalyticsSnapshots.companyId, actor.companyId),
        orderBy: [desc(saiAnalyticsSnapshots.createdAt)],
        limit: 1,
      }),
    ]);

    const insightDrafts = draftRows.map((d) => this.toDraft(d));
    const pendingApprovals = insightDrafts.filter(
      (d) => d.status === 'draft' || d.status === 'pending_approval',
    ).length;

    const summary =
      metrics.availability === 'unavailable'
        ? 'Sales Analytics Intelligence is ready. No real leads, quotes, or opportunities yet — rates and revenue stay unavailable (not invented).'
        : `Real pipeline: ${metrics.leadsCreated} lead(s), ${metrics.quotesSent} quote(s) sent, ${metrics.quotesAccepted} accepted. Conversion ${metrics.conversionAvailability}; revenue ${metrics.revenueAvailability}.`;

    return {
      summary,
      productClarification: { ...SAI_PRODUCT_COPY },
      policy: {
        inventRates: false,
        inventRevenue: false,
        autoOutreach: false,
        requiresOwnerApproval: true,
        technicianClientDenied: true,
        fakeDataInvented: false,
      },
      metrics,
      performance: buildSaiPerformanceRows(metrics),
      latestSnapshot: snapshotRows[0] ? this.toSnapshot(snapshotRows[0]) : null,
      insightDrafts,
      auraInsights: insightRows.map((i) => this.toInsight(i)),
      connections: listSaiConnections({
        leadsAvailable: metrics.leadsCreated > 0,
        quotesAvailable: metrics.quotesSent > 0 || metrics.quotesAccepted > 0,
        opportunitiesAvailable:
          metrics.openOpportunityCount + metrics.wonOpportunityCount + metrics.lostOpportunityCount >
          0,
        financeLinkAvailable: true,
        salesAgentPresent: true,
        salesFollowupPresent: true,
      }),
      settings,
      pendingApprovals,
    };
  }

  async captureSnapshot(actor: SaiActor): Promise<SaiAnalyticsSnapshotSummary> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    const metrics = await this.computeMetrics(actor, settings.minConversionSample);

    const [inserted] = await this.db
      .insert(saiAnalyticsSnapshots)
      .values({
        companyId: actor.companyId,
        leadsCreated: metrics.leadsCreated,
        quotesSent: metrics.quotesSent,
        quotesAccepted: metrics.quotesAccepted,
        quotesDeclined: metrics.quotesDeclined,
        openOpportunityCount: metrics.openOpportunityCount,
        wonOpportunityCount: metrics.wonOpportunityCount,
        lostOpportunityCount: metrics.lostOpportunityCount,
        pipelineValueCents: metrics.pipelineValueCents,
        acceptedQuoteValueCents: metrics.acceptedQuoteValueCents,
        currency: metrics.currency,
        quoteConversionRatePercent:
          metrics.quoteConversionRatePercent !== null
            ? String(metrics.quoteConversionRatePercent)
            : null,
        leadToQuoteRatePercent:
          metrics.leadToQuoteRatePercent !== null ? String(metrics.leadToQuoteRatePercent) : null,
        winRatePercent: metrics.winRatePercent !== null ? String(metrics.winRatePercent) : null,
        conversionAvailability: metrics.conversionAvailability,
        revenueAvailability: metrics.revenueAvailability,
        rationale: metrics.rationale,
        createdByUserId: actor.userId,
        metadata: {
          inventRates: false,
          inventRevenue: false,
          autoOutreach: false,
          minConversionSample: settings.minConversionSample,
        },
      })
      .returning();

    await this.recordAudit(actor, 'sai_analytics_snapshot_captured', inserted.id, {
      leadsCreated: metrics.leadsCreated,
      quotesSent: metrics.quotesSent,
      conversionAvailability: metrics.conversionAvailability,
    });

    return this.toSnapshot(inserted);
  }

  async refreshInsightDrafts(
    actor: SaiActor,
    input: RefreshSaiInsightsRequest = {},
  ): Promise<{ created: number; drafts: SaiInsightDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.insightsEnabled) {
      throw new SalesAnalyticsIntelligenceError(
        'INVALID_STATE',
        'Insight drafts are disabled in Sales Analytics Intelligence settings.',
      );
    }

    const metrics = await this.computeMetrics(actor, settings.minConversionSample);
    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const created: SaiInsightDraftSummary[] = [];

    const candidates: Array<{ kind: typeof saiInsightDrafts.$inferInsert.kind; title: string; body: string }> =
      [];

    if (metrics.leadsCreated > 0 || metrics.quotesSent > 0) {
      candidates.push(
        buildSalesTrendInsightDraft({
          leadsCreated: metrics.leadsCreated,
          quotesSent: metrics.quotesSent,
          quotesAccepted: metrics.quotesAccepted,
        }),
      );
    }

    if (metrics.lostOpportunityCount > 0 || metrics.quotesDeclined > 0) {
      candidates.push(
        buildLostOpportunityInsightDraft({
          lostOpportunityCount: metrics.lostOpportunityCount,
          quotesDeclined: metrics.quotesDeclined,
        }),
      );
    }

    if (metrics.quotesSent > 0 || metrics.leadsCreated > 0) {
      candidates.push(
        buildImprovementAreaInsightDraft({
          quotesSent: metrics.quotesSent,
          quotesAccepted: metrics.quotesAccepted,
          minSample: settings.minConversionSample,
          conversionRatePercent: metrics.quoteConversionRatePercent,
        }),
      );
    }

    if (metrics.openOpportunityCount > 0) {
      candidates.push(
        buildRevenueOpportunityInsightDraft({
          openOpportunityCount: metrics.openOpportunityCount,
          pipelineValueCents: metrics.pipelineValueCents,
          currency: metrics.currency,
        }),
      );
    }

    for (const draft of candidates) {
      const existingOpen = await this.db.query.saiInsightDrafts.findFirst({
        where: and(
          eq(saiInsightDrafts.companyId, actor.companyId),
          eq(saiInsightDrafts.kind, draft.kind),
          inArray(saiInsightDrafts.status, ['draft', 'pending_approval']),
        ),
      });
      if (existingOpen) continue;

      const [inserted] = await this.db
        .insert(saiInsightDrafts)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status,
          title: draft.title,
          body: draft.body,
          inventedRates: false,
          autoOutreach: false,
          createdByUserId: actor.userId,
          metadata: {
            source: 'real_pipeline',
            inventRates: false,
            autoOutreach: false,
          },
        })
        .returning();

      created.push(this.toDraft(inserted));
      await this.recordAudit(actor, 'sai_insight_draft_created', inserted.id, {
        kind: draft.kind,
      });
    }

    if (metrics.availability !== 'unavailable') {
      const auraKinds: Array<'sales_trend' | 'lost_opportunity' | 'improvement_area'> = [
        'sales_trend',
        'lost_opportunity',
        'improvement_area',
      ];
      for (const kind of auraKinds) {
        if (
          kind === 'lost_opportunity' &&
          metrics.lostOpportunityCount === 0 &&
          metrics.quotesDeclined === 0
        ) {
          continue;
        }
        if (kind === 'sales_trend' && metrics.leadsCreated === 0 && metrics.quotesSent === 0) {
          continue;
        }

        const aura = buildAuraSalesInsightDraft({
          kind,
          title:
            kind === 'sales_trend'
              ? 'Sales trend handoff'
              : kind === 'lost_opportunity'
                ? 'Lost opportunity handoff'
                : 'Improvement area handoff',
          supportingSignals: [
            `${metrics.leadsCreated} leads`,
            `${metrics.quotesSent} quotes sent`,
            `${metrics.quotesAccepted} quotes accepted`,
            `${metrics.lostOpportunityCount} lost opportunities`,
          ],
          recommendation:
            kind === 'lost_opportunity'
              ? 'Review declined quotes and consider Sales Follow-up drafts (Owner approval; never auto-send).'
              : kind === 'improvement_area'
                ? 'Review conversion sample and Sales Intelligence Agent priorities.'
                : 'Share pipeline snapshot with Command Centre / Executive Dashboard.',
        });

        const duplicate = await this.db.query.saiAuraInsights.findFirst({
          where: and(
            eq(saiAuraInsights.companyId, actor.companyId),
            eq(saiAuraInsights.title, aura.title),
            eq(saiAuraInsights.status, 'open'),
          ),
        });
        if (duplicate) continue;

        const [insertedAura] = await this.db
          .insert(saiAuraInsights)
          .values({
            companyId: actor.companyId,
            target: aura.target,
            status: 'open',
            title: aura.title,
            insight: aura.insight,
            href:
              aura.target === 'command_centre'
                ? '/aura/command-centre'
                : aura.target === 'sales_followup_intelligence'
                  ? '/sales-followup-intelligence'
                  : '/sales-intelligence-agent',
            createdByUserId: actor.userId,
            metadata: { kind, autoOutreach: false, inventRates: false },
          })
          .returning();

        await this.recordAudit(actor, 'sai_aura_insight_created', insertedAura.id, {
          kind,
          target: aura.target,
        });
      }
    }

    return { created: created.length, drafts: created };
  }

  async decideInsightDraft(
    actor: SaiActor,
    draftId: string,
    input: DecideSaiInsightRequest,
  ): Promise<SaiInsightDraftSummary> {
    this.assertApprove(actor);
    const draft = await this.db.query.saiInsightDrafts.findFirst({
      where: and(eq(saiInsightDrafts.id, draftId), eq(saiInsightDrafts.companyId, actor.companyId)),
    });
    if (!draft) {
      throw new SalesAnalyticsIntelligenceError('NOT_FOUND', 'Insight draft not found');
    }
    if (!['draft', 'pending_approval'].includes(draft.status)) {
      throw new SalesAnalyticsIntelligenceError(
        'INVALID_STATE',
        `Cannot decide insight in status ${draft.status}`,
      );
    }

    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'acknowledged';

    const [updated] = await this.db
      .update(saiInsightDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        updatedAt: new Date(),
        autoOutreach: false,
        inventedRates: false,
      })
      .where(and(eq(saiInsightDrafts.id, draftId), eq(saiInsightDrafts.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `sai_insight_draft_${nextStatus}`, updated.id, {
      decision: input.decision,
      autoOutreach: false,
    });

    return this.toDraft(updated);
  }

  async updateSettings(actor: SaiActor, input: UpdateSaiSettingsRequest): Promise<SaiSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const [updated] = await this.db
      .update(saiSettings)
      .set({
        insightsEnabled: input.insightsEnabled ?? undefined,
        minConversionSample:
          input.minConversionSample !== undefined
            ? Math.max(1, Math.min(100, Math.floor(input.minConversionSample)))
            : undefined,
        notes: input.notes === undefined ? undefined : input.notes,
        inventRatesEnabled: false,
        autoOutreachEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(saiSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'sai_settings_updated', updated.id, {
      insightsEnabled: updated.insightsEnabled,
      minConversionSample: updated.minConversionSample,
    });

    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: SaiActor,
    input: CreateSaiAuraInsightRequest,
  ): Promise<SaiAuraInsightSummary> {
    this.assertWrite(actor);

    const [inserted] = await this.db
      .insert(saiAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title.trim().slice(0, 200),
        insight: input.insight.trim().slice(0, 5000),
        href: input.href?.trim().slice(0, 500) ?? null,
        sourceInsightDraftId: input.sourceInsightDraftId ?? null,
        createdByUserId: actor.userId,
        metadata: { autoOutreach: false, inventRates: false },
      })
      .returning();

    await this.recordAudit(actor, 'sai_aura_insight_created', inserted.id, {
      target: input.target,
    });

    return this.toInsight(inserted);
  }

  async acknowledgeAuraInsight(
    actor: SaiActor,
    insightId: string,
    input: AcknowledgeSaiInsightRequest,
  ): Promise<SaiAuraInsightSummary> {
    this.assertWrite(actor);
    const existing = await this.db.query.saiAuraInsights.findFirst({
      where: and(eq(saiAuraInsights.id, insightId), eq(saiAuraInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new SalesAnalyticsIntelligenceError('NOT_FOUND', 'AURA insight not found');
    }

    const [updated] = await this.db
      .update(saiAuraInsights)
      .set({
        status: input.status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(saiAuraInsights.id, insightId), eq(saiAuraInsights.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `sai_aura_insight_${input.status}`, updated.id, {
      status: input.status,
    });

    return this.toInsight(updated);
  }
}
