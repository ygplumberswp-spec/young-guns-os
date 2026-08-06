import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import {
  applyMktVisibility,
  buildMktOpportunityDraft,
  buildMktPriceBands,
  buildMktSeasonalProfile,
  buildMktSummary,
  buildMktTopicCoverage,
  buildMktUnavailableInsight,
  bucketMktMonthly,
  canAccessMarketIntelligence,
  canApproveMktOpportunity,
  canManageMktSettings,
  canManageMktSources,
  canPublishMktInsight,
  canViewMktTopic,
  classifyMktRecordType,
  countMktGroups,
  isMktOpportunityCandidate,
  isValidMktLookbackDays,
  isValidMktMinEvidence,
  isValidMktStalenessDays,
  listMktConnections,
  listVisibleMktTopics,
  MKT_INTERNAL_SOURCES,
  MKT_MIN_MONTHS_FOR_SEASONALITY,
  MKT_MIN_PERIODS_FOR_TREND,
  MKT_PRODUCT_COPY,
  MKT_SCOPE_RATIONALE,
  MKT_TOPIC_LABELS,
  MKT_TOPICS,
  mktAgeDays,
  mktFreshnessFor,
  mktSourceTrust,
  normaliseMktSourceKey,
  resolveMktAudienceScope,
  resolveMktInsightStanding,
  sortMktInsights,
  summariseMktDirection,
  type CreateMktOpportunityRequest,
  type DecideMktInsightRequest,
  type DecideMktOpportunityRequest,
  type MktAuditEntry,
  type MktDashboard,
  type MktEvidence,
  type MktEvidenceOrigin,
  type MktInsight,
  type MktInsightStatus,
  type MktOpportunitySummary,
  type MktSettings,
  type MktSourceSummary,
  type MktSourceTrust,
  type MktTopic,
  type RegisterMktSourceRequest,
  type UpdateMktSettingsRequest,
  type UpdateMktSourceRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  jobs,
  leads,
  miMarketIntelligenceRecords,
  miSeoKeywords,
  mktInsightStates,
  mktOpportunityDrafts,
  mktSettings,
  mktSignalEvents,
  mktSources,
  quotes,
  securityAuditLogs,
  supplierPriceCatalogueItems,
} from '@titan/db';

export class MarketIntelligenceError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'MarketIntelligenceError';
  }
}

export type MktActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

const DENIED =
  'Market Intelligence is not available to this role. Market strategy, pricing and competitor topics are restricted.';
const OWNER_ONLY =
  'Market Intelligence controls are Owner only because they govern pricing, supplier cost and strategy topics.';

/** Rows read per source. Bounded so one large table cannot starve the others. */
const SOURCE_ROW_LIMIT = 2000;

/**
 * Market Intelligence — an outward-looking read layer.
 *
 * Sources, all read live and none written to:
 * - `mi_market_intelligence_records` -> market observations already captured by
 *   Enterprise Marketing Intelligence from supported sources
 * - `mi_seo_keywords`                -> connected search keyword data
 * - `supplier_price_catalogue_items` -> the company's own supplier catalogue
 * - `leads`, `quotes`, `jobs`        -> the company's own demand and pricing
 *
 * Nothing is fetched, scraped or called from here. Every query and mutation is
 * scoped by companyId, and an insight is measured from real rows on each read
 * so it cannot drift from its evidence. Where the evidence is too thin, too
 * old or cites an unregistered source, the answer is unavailable or needs
 * verification — a competitor price, market share, demand figure or trend is
 * never invented.
 */
export class MarketIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  // ─── Access ────────────────────────────────────────────────────────────────

  private assertRead(actor: MktActor): void {
    if (!canAccessMarketIntelligence(actor)) {
      throw new MarketIntelligenceError('FORBIDDEN', DENIED);
    }
  }

  private assertOwner(actor: MktActor): void {
    this.assertRead(actor);
    if (!canManageMktSettings(actor)) {
      throw new MarketIntelligenceError('FORBIDDEN', OWNER_ONLY);
    }
  }

  private assertSources(actor: MktActor): void {
    this.assertRead(actor);
    if (!canManageMktSources(actor)) {
      throw new MarketIntelligenceError(
        'FORBIDDEN',
        'Only the Owner may register a market source, because registering one attests it is supported and lawfully accessible.',
      );
    }
  }

  private assertPublish(actor: MktActor): void {
    this.assertRead(actor);
    if (!canPublishMktInsight(actor)) {
      throw new MarketIntelligenceError(
        'FORBIDDEN',
        'Only the Company Owner or Platform Owner may publish a market insight to marketing users.',
      );
    }
  }

  private assertApprove(actor: MktActor): void {
    this.assertRead(actor);
    if (!canApproveMktOpportunity(actor)) {
      throw new MarketIntelligenceError(
        'FORBIDDEN',
        'Only the Company Owner or Platform Owner may decide a market recommendation.',
      );
    }
  }

  private async recordAudit(
    actor: MktActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'market_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoExecuted: false,
        autoActioned: false,
        externalFetchPerformed: false,
        financeSensitiveOwnerOnly: true,
        marketDataInvented: false,
        fakeDataInvented: false,
      },
    });
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  private toSettings(row: {
    id: string;
    lookbackDays: number;
    stalenessDays: number;
    minEvidenceRecords: number;
    requireRegisteredSource: boolean;
    publishApprovedOnly: boolean;
    notes: string | null;
    updatedAt: Date;
  }): MktSettings {
    return {
      id: row.id,
      autoActionsEnabled: false,
      inventMarketDataEnabled: false,
      externalFetchEnabled: false,
      lookbackDays: row.lookbackDays,
      stalenessDays: row.stalenessDays,
      minEvidenceRecords: row.minEvidenceRecords,
      requireRegisteredSource: row.requireRegisteredSource,
      publishApprovedOnly: row.publishApprovedOnly,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async ensureSettingsRow(companyId: string) {
    const existing = await this.db.query.mktSettings.findFirst({
      where: eq(mktSettings.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.db
      .insert(mktSettings)
      .values({ companyId })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const row = await this.db.query.mktSettings.findFirst({
      where: eq(mktSettings.companyId, companyId),
    });
    if (!row) {
      throw new MarketIntelligenceError(
        'INVALID',
        'Market Intelligence settings could not be created.',
      );
    }
    return row;
  }

  async getSettings(actor: MktActor): Promise<MktSettings> {
    this.assertRead(actor);
    return this.toSettings(await this.ensureSettingsRow(actor.companyId));
  }

  async updateSettings(actor: MktActor, input: UpdateMktSettingsRequest): Promise<MktSettings> {
    this.assertOwner(actor);
    const current = await this.ensureSettingsRow(actor.companyId);
    if (input.lookbackDays !== undefined && !isValidMktLookbackDays(input.lookbackDays)) {
      throw new MarketIntelligenceError(
        'INVALID',
        'Lookback must be between 30 and 730 days — shorter measures noise, longer calls history current.',
      );
    }
    if (input.stalenessDays !== undefined && !isValidMktStalenessDays(input.stalenessDays)) {
      throw new MarketIntelligenceError(
        'INVALID',
        'The freshness window must be between 7 and 365 days.',
      );
    }
    if (
      input.minEvidenceRecords !== undefined &&
      !isValidMktMinEvidence(input.minEvidenceRecords)
    ) {
      throw new MarketIntelligenceError(
        'INVALID',
        'At least one real record must sit behind any claim, and no more than 100 may be required.',
      );
    }
    const [updated] = await this.db
      .update(mktSettings)
      .set({
        lookbackDays: input.lookbackDays ?? current.lookbackDays,
        stalenessDays: input.stalenessDays ?? current.stalenessDays,
        minEvidenceRecords: input.minEvidenceRecords ?? current.minEvidenceRecords,
        requireRegisteredSource:
          input.requireRegisteredSource ?? current.requireRegisteredSource,
        publishApprovedOnly: input.publishApprovedOnly ?? current.publishApprovedOnly,
        notes: input.notes === undefined ? current.notes : input.notes,
        // Invariants can never be switched on.
        autoActionsEnabled: false,
        inventMarketDataEnabled: false,
        externalFetchEnabled: false,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(mktSettings.id, current.id), eq(mktSettings.companyId, actor.companyId)))
      .returning();
    if (!updated) {
      throw new MarketIntelligenceError('NOT_FOUND', 'Market Intelligence settings not found.');
    }
    await this.db.insert(mktSignalEvents).values({
      companyId: actor.companyId,
      insightKey: null,
      kind: 'settings_updated',
      actorUserId: actor.userId,
      notes: input.notes ?? null,
      metadata: {
        lookbackDays: updated.lookbackDays,
        stalenessDays: updated.stalenessDays,
        minEvidenceRecords: updated.minEvidenceRecords,
        requireRegisteredSource: updated.requireRegisteredSource,
        publishApprovedOnly: updated.publishApprovedOnly,
      },
    });
    await this.recordAudit(actor, 'market_intelligence.settings.update', updated.id, {
      lookbackDays: updated.lookbackDays,
      stalenessDays: updated.stalenessDays,
      ownerOnlyControl: true,
    });
    return this.toSettings(updated);
  }

  // ─── Source register ───────────────────────────────────────────────────────

  private toSourceSummary(
    row: {
      id: string;
      sourceKey: string;
      label: string;
      origin: MktEvidenceOrigin;
      permitted: boolean;
      verified: boolean;
      reference: string | null;
      notes: string | null;
    },
    usage: { lastObservedAt: string | null; observationCount: number },
  ): MktSourceSummary {
    return {
      id: row.id,
      sourceKey: row.sourceKey,
      label: row.label,
      origin: row.origin,
      permitted: row.permitted,
      verified: row.verified,
      trust: mktSourceTrust({ permitted: row.permitted, verified: row.verified }),
      reference: row.reference,
      notes: row.notes,
      lastObservedAt: usage.lastObservedAt,
      observationCount: usage.observationCount,
    };
  }

  private async loadSourceRows(companyId: string) {
    return this.db.query.mktSources.findMany({
      where: eq(mktSources.companyId, companyId),
      orderBy: [desc(mktSources.updatedAt)],
      limit: 200,
    });
  }

  async listSources(actor: MktActor): Promise<MktSourceSummary[]> {
    this.assertRead(actor);
    const rows = await this.loadSourceRows(actor.companyId);
    const usage = await this.loadSourceUsage(actor.companyId);
    return rows.map((row) =>
      this.toSourceSummary(row, usage.get(row.sourceKey) ?? {
        lastObservedAt: null,
        observationCount: 0,
      }),
    );
  }

  /**
   * How often each registered source actually appears on a captured record.
   * A source registered but never observed is shown with a zero count rather
   * than being presented as active.
   */
  private async loadSourceUsage(companyId: string) {
    const rows = await this.db
      .select({
        source: miMarketIntelligenceRecords.source,
        capturedAt: miMarketIntelligenceRecords.capturedAt,
      })
      .from(miMarketIntelligenceRecords)
      .where(eq(miMarketIntelligenceRecords.companyId, companyId))
      .orderBy(desc(miMarketIntelligenceRecords.capturedAt))
      .limit(SOURCE_ROW_LIMIT);

    const usage = new Map<string, { lastObservedAt: string | null; observationCount: number }>();
    for (const row of rows) {
      const key = normaliseMktSourceKey(row.source);
      if (!key) continue;
      const entry = usage.get(key) ?? { lastObservedAt: null, observationCount: 0 };
      entry.observationCount += 1;
      const observedAt = row.capturedAt.toISOString();
      if (!entry.lastObservedAt || observedAt > entry.lastObservedAt) {
        entry.lastObservedAt = observedAt;
      }
      usage.set(key, entry);
    }
    return usage;
  }

  async registerSource(
    actor: MktActor,
    input: RegisterMktSourceRequest,
  ): Promise<MktSourceSummary> {
    this.assertSources(actor);
    const sourceKey = normaliseMktSourceKey(input.sourceKey);
    const label = input.label.trim();
    if (!sourceKey || !label) {
      throw new MarketIntelligenceError('INVALID', 'A source key and label are required.');
    }
    if (!input.permitted) {
      throw new MarketIntelligenceError(
        'INVALID',
        'A source can only be registered once the Owner confirms it is a supported public source or connected provider that may lawfully be used.',
      );
    }
    // Verification is a separate, later attestation — a source cannot arrive
    // pre-verified in the same breath as being registered.
    const existing = await this.db.query.mktSources.findFirst({
      where: and(eq(mktSources.companyId, actor.companyId), eq(mktSources.sourceKey, sourceKey)),
    });
    if (existing) {
      throw new MarketIntelligenceError('INVALID', 'That source is already registered.');
    }
    const [created] = await this.db
      .insert(mktSources)
      .values({
        companyId: actor.companyId,
        sourceKey,
        label,
        origin: input.origin,
        permitted: true,
        verified: input.verified ?? false,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        registeredByUserId: actor.userId,
      })
      .returning();
    if (!created) {
      throw new MarketIntelligenceError('INVALID', 'The source could not be registered.');
    }
    await this.db.insert(mktSignalEvents).values({
      companyId: actor.companyId,
      insightKey: null,
      kind: 'source_registered',
      actorUserId: actor.userId,
      notes: input.notes ?? null,
      metadata: { sourceKey, origin: input.origin, permitted: true },
    });
    await this.recordAudit(actor, 'market_intelligence.source.register', created.id, {
      sourceKey,
      origin: input.origin,
      ownerAttestedLawful: true,
    });
    return this.toSourceSummary(created, { lastObservedAt: null, observationCount: 0 });
  }

  async updateSource(
    actor: MktActor,
    sourceId: string,
    input: UpdateMktSourceRequest,
  ): Promise<MktSourceSummary> {
    this.assertSources(actor);
    const existing = await this.db.query.mktSources.findFirst({
      where: and(eq(mktSources.id, sourceId), eq(mktSources.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new MarketIntelligenceError('NOT_FOUND', 'Source not found.');
    }
    const permitted = input.permitted ?? existing.permitted;
    const verified = input.verified ?? existing.verified;
    if (verified && !permitted) {
      throw new MarketIntelligenceError(
        'INVALID',
        'A source cannot be marked verified while it is not attested as supported and lawfully accessible.',
      );
    }
    const [updated] = await this.db
      .update(mktSources)
      .set({
        label: input.label?.trim() || existing.label,
        permitted,
        verified,
        reference: input.reference === undefined ? existing.reference : input.reference,
        notes: input.notes === undefined ? existing.notes : input.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(mktSources.id, sourceId), eq(mktSources.companyId, actor.companyId)))
      .returning();
    if (!updated) {
      throw new MarketIntelligenceError('NOT_FOUND', 'Source not found.');
    }
    await this.db.insert(mktSignalEvents).values({
      companyId: actor.companyId,
      insightKey: null,
      kind: 'source_updated',
      actorUserId: actor.userId,
      notes: input.notes ?? null,
      metadata: { sourceKey: updated.sourceKey, permitted, verified },
    });
    await this.recordAudit(actor, 'market_intelligence.source.update', updated.id, {
      sourceKey: updated.sourceKey,
      permitted,
      verified,
    });
    const usage = await this.loadSourceUsage(actor.companyId);
    return this.toSourceSummary(
      updated,
      usage.get(updated.sourceKey) ?? { lastObservedAt: null, observationCount: 0 },
    );
  }

  // ─── Building insights from real rows ──────────────────────────────────────

  private buildEvidence(input: {
    origin: MktEvidenceOrigin;
    sourceKey: string;
    sourceLabel: string;
    trust: MktSourceTrust;
    observedAt: Date;
    recordCount: number;
    detail: string;
    reference?: string | null;
    now: Date;
    stalenessDays: number;
  }): MktEvidence {
    const observedAt = input.observedAt.toISOString();
    const ageDays = mktAgeDays(observedAt, input.now);
    return {
      origin: input.origin,
      sourceKey: input.sourceKey,
      sourceLabel: input.sourceLabel,
      trust: input.trust,
      observedAt,
      ageDays: Math.round(ageDays * 10) / 10,
      freshness: mktFreshnessFor(ageDays, input.stalenessDays),
      recordCount: input.recordCount,
      detail: input.detail,
      reference: input.reference ?? null,
    };
  }

  /**
   * Assembles an insight and lets the evidence decide what it is worth. Every
   * insight goes through here, so no path can produce a claim that skipped the
   * confidence, freshness and source checks.
   */
  private assembleInsight(input: {
    insightKey: string;
    topic: MktTopic;
    kind: MktInsight['kind'];
    headline: string;
    detail: string;
    direction?: MktInsight['direction'];
    measure?: MktInsight['measure'];
    evidence: MktEvidence[];
    recordCount: number;
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
  }): MktInsight {
    const standing = resolveMktInsightStanding({
      evidence: input.evidence,
      recordCount: input.recordCount,
      minRecords: input.settings.minEvidenceRecords,
      requireRegisteredSource: input.settings.requireRegisteredSource,
    });
    const observedAt = input.evidence.reduce<string | null>((newest, item) => {
      if (!newest || item.observedAt > newest) return item.observedAt;
      return newest;
    }, null);
    return {
      insightKey: input.insightKey,
      topic: input.topic,
      topicLabel: MKT_TOPIC_LABELS[input.topic],
      kind: input.kind,
      headline: input.headline,
      detail: input.detail,
      availability: standing.availability,
      confidence: standing.confidence,
      freshness: standing.freshness,
      trust: standing.trust,
      direction: input.direction ?? 'insufficient_evidence',
      measure: input.measure ?? null,
      evidence: input.evidence,
      recordCount: input.recordCount,
      observedAt,
      status: input.statuses.get(input.insightKey) ?? 'draft',
      caveat: standing.caveat,
      invented: false,
    };
  }

  /**
   * Captured market observations, grouped by the topic their record type
   * supports. A record whose type this layer does not recognise is counted as
   * unclassified rather than filed under a topic it may not belong to, and a
   * record citing a source the Owner has not registered carries that through
   * as unregistered trust.
   */
  private buildCapturedRecordInsights(input: {
    rows: Array<{
      id: string;
      recordType: string;
      title: string;
      source: string | null;
      confidenceScore: string | null;
      capturedAt: Date;
    }>;
    registered: Map<string, { label: string; origin: MktEvidenceOrigin; trust: MktSourceTrust }>;
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
    now: Date;
  }): { insights: MktInsight[]; unclassified: number; unregisteredSources: Set<string> } {
    const byTopic = new Map<MktTopic, typeof input.rows>();
    const unregisteredSources = new Set<string>();
    let unclassified = 0;

    for (const row of input.rows) {
      const topic = classifyMktRecordType(row.recordType);
      if (!topic) {
        unclassified += 1;
        continue;
      }
      const bucket = byTopic.get(topic) ?? [];
      bucket.push(row);
      byTopic.set(topic, bucket);
    }

    const insights: MktInsight[] = [];
    for (const [topic, rows] of byTopic) {
      const evidence: MktEvidence[] = [];
      const bySource = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = normaliseMktSourceKey(row.source) || 'unattributed';
        const bucket = bySource.get(key) ?? [];
        bucket.push(row);
        bySource.set(key, bucket);
      }
      for (const [sourceKey, sourceRows] of bySource) {
        const registered = input.registered.get(sourceKey);
        if (!registered) unregisteredSources.add(sourceKey);
        const newest = sourceRows.reduce((latest, row) =>
          row.capturedAt > latest.capturedAt ? row : latest,
        );
        evidence.push(
          this.buildEvidence({
            origin: registered?.origin ?? 'public_source',
            sourceKey,
            sourceLabel:
              registered?.label ??
              (sourceKey === 'unattributed'
                ? 'Record with no source recorded'
                : `Unregistered source: ${sourceKey}`),
            trust: registered?.trust ?? 'unregistered',
            observedAt: newest.capturedAt,
            recordCount: sourceRows.length,
            detail: `${sourceRows.length} captured record(s), most recent: ${newest.title}`,
            now: input.now,
            stalenessDays: input.settings.stalenessDays,
          }),
        );
      }

      const titles = rows
        .slice(0, 3)
        .map((row) => row.title)
        .join('; ');
      insights.push(
        this.assembleInsight({
          insightKey: `${topic}:captured-records`,
          topic,
          kind: 'fact',
          headline: `${rows.length} captured observation(s) recorded for ${MKT_TOPIC_LABELS[topic].toLowerCase()}`,
          detail: `Observations recorded in Marketing Intelligence from ${bySource.size} source(s). Most recent: ${titles}. Figures are reported exactly as captured; nothing is extrapolated from them.`,
          measure: {
            label: 'Captured observations',
            value: rows.length,
            unit: 'count',
            basis: `${rows.length} rows in mi_market_intelligence_records within the lookback window.`,
          },
          evidence,
          recordCount: rows.length,
          settings: input.settings,
          statuses: input.statuses,
        }),
      );
    }

    return { insights, unclassified, unregisteredSources };
  }

  /** Demand direction from the company's own leads and jobs. */
  private buildDemandInsight(input: {
    leadDates: string[];
    jobDates: string[];
    newestLead: Date | null;
    newestJob: Date | null;
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
    now: Date;
  }): MktInsight {
    const combined = [...input.leadDates, ...input.jobDates];
    if (combined.length === 0) return buildMktUnavailableInsight({ topic: 'demand_trend' });

    const { points } = bucketMktMonthly(combined);
    const direction = summariseMktDirection(points);
    if (direction.direction === 'insufficient_evidence') {
      return buildMktUnavailableInsight({
        topic: 'demand_trend',
        reason: `Demand direction needs at least ${MKT_MIN_PERIODS_FOR_TREND} months of your own records; ${points.length} month(s) exist. No demand trend is invented from less.`,
      });
    }

    const evidence: MktEvidence[] = [];
    if (input.leadDates.length > 0 && input.newestLead) {
      evidence.push(
        this.buildEvidence({
          origin: 'own_records',
          sourceKey: MKT_INTERNAL_SOURCES.leads.sourceKey,
          sourceLabel: MKT_INTERNAL_SOURCES.leads.label,
          trust: 'verified',
          observedAt: input.newestLead,
          recordCount: input.leadDates.length,
          detail: `${input.leadDates.length} real lead row(s) within the lookback window.`,
          now: input.now,
          stalenessDays: input.settings.stalenessDays,
        }),
      );
    }
    if (input.jobDates.length > 0 && input.newestJob) {
      evidence.push(
        this.buildEvidence({
          origin: 'own_records',
          sourceKey: MKT_INTERNAL_SOURCES.jobs.sourceKey,
          sourceLabel: MKT_INTERNAL_SOURCES.jobs.label,
          trust: 'verified',
          observedAt: input.newestJob,
          recordCount: input.jobDates.length,
          detail: `${input.jobDates.length} real job row(s) within the lookback window.`,
          now: input.now,
          stalenessDays: input.settings.stalenessDays,
        }),
      );
    }

    const changePercent = direction.changePercent ?? 0;
    return this.assembleInsight({
      insightKey: 'demand_trend:own-records',
      topic: 'demand_trend',
      kind: 'fact',
      headline: `Your enquiry and job volume is ${direction.direction}`,
      detail: `${direction.basis} This measures demand reaching your business, not the size of the wider market — no market-wide demand figure is claimed.`,
      direction: direction.direction,
      measure: {
        label: 'Change against the earlier monthly average',
        value: Math.round(changePercent * 10) / 10,
        unit: 'percent',
        basis: direction.basis,
      },
      evidence,
      recordCount: combined.length,
      settings: input.settings,
      statuses: input.statuses,
    });
  }

  /** Seasonal shape, only once a full year of the company's own rows exists. */
  private buildSeasonalInsight(input: {
    dates: string[];
    newest: Date | null;
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
    now: Date;
  }): MktInsight {
    if (input.dates.length === 0 || !input.newest) {
      return buildMktUnavailableInsight({ topic: 'seasonal_demand' });
    }
    const { points } = bucketMktMonthly(input.dates);
    const profile = buildMktSeasonalProfile(points);
    if (!profile.sufficient) {
      return buildMktUnavailableInsight({
        topic: 'seasonal_demand',
        reason: `${profile.basis} A seasonal pattern needs at least ${MKT_MIN_MONTHS_FOR_SEASONALITY} months of your own records. No season is invented from less.`,
      });
    }
    const busiest = [...profile.months].sort((a, b) => b.totalCount - a.totalCount)[0];
    const quietest = [...profile.months]
      .filter((month) => month.yearsObserved > 0)
      .sort((a, b) => a.totalCount - b.totalCount)[0];

    return this.assembleInsight({
      insightKey: 'seasonal_demand:own-records',
      topic: 'seasonal_demand',
      kind: 'fact',
      headline: `${busiest?.label ?? 'No month'} carries the largest share of your work`,
      detail: `${profile.basis} Busiest: ${busiest?.label} at ${(busiest?.sharePercent ?? 0).toFixed(1)}% of records. Quietest observed: ${quietest?.label ?? 'none'} at ${(quietest?.sharePercent ?? 0).toFixed(1)}%. Months with no records are reported as zero observed rather than estimated.`,
      measure: {
        label: `Share of records in ${busiest?.label ?? 'the busiest month'}`,
        value: Math.round((busiest?.sharePercent ?? 0) * 10) / 10,
        unit: 'percent',
        basis: profile.basis,
      },
      evidence: [
        this.buildEvidence({
          origin: 'own_records',
          sourceKey: MKT_INTERNAL_SOURCES.leads.sourceKey,
          sourceLabel: 'Your lead and job records',
          trust: 'verified',
          observedAt: input.newest,
          recordCount: input.dates.length,
          detail: profile.basis,
          now: input.now,
          stalenessDays: input.settings.stalenessDays,
        }),
      ],
      recordCount: input.dates.length,
      settings: input.settings,
      statuses: input.statuses,
    });
  }

  /** Demand by area, from the suburb and city on the company's own rows. */
  private buildAreaInsight(input: {
    areas: Array<string | null>;
    newest: Date | null;
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
    now: Date;
  }): MktInsight {
    if (input.areas.length === 0 || !input.newest) {
      return buildMktUnavailableInsight({ topic: 'service_area_demand' });
    }
    const { groups, unknownCount, total } = countMktGroups(input.areas, {
      unknownLabel: 'Not recorded',
      limit: 10,
    });
    const known = total - unknownCount;
    if (groups.length === 0 || known < input.settings.minEvidenceRecords) {
      return buildMktUnavailableInsight({
        topic: 'service_area_demand',
        reason: `${known} of ${total} of your lead and job rows carry an area, below the minimum of ${input.settings.minEvidenceRecords}. No area figure is invented.`,
      });
    }
    const top = groups[0];
    return this.assembleInsight({
      insightKey: 'service_area_demand:own-records',
      topic: 'service_area_demand',
      kind: 'fact',
      headline: `${top?.label ?? 'No area'} accounts for the most of your work`,
      detail: `Top areas by real row count: ${groups
        .slice(0, 5)
        .map((group) => `${group.label} (${group.count})`)
        .join(', ')}. ${unknownCount} row(s) carry no area and are counted separately rather than assigned to anywhere. This is where your own work comes from, not a measure of the whole market in those areas.`,
      measure: {
        label: `Share of located rows in ${top?.label ?? 'the top area'}`,
        value: Math.round((top?.sharePercent ?? 0) * 10) / 10,
        unit: 'percent',
        basis: `${top?.count ?? 0} of ${total} real lead and job row(s).`,
      },
      evidence: [
        this.buildEvidence({
          origin: 'own_records',
          sourceKey: MKT_INTERNAL_SOURCES.jobs.sourceKey,
          sourceLabel: 'Your lead and job records',
          trust: 'verified',
          observedAt: input.newest,
          recordCount: known,
          detail: `${known} row(s) with an area recorded, ${unknownCount} without.`,
          now: input.now,
          stalenessDays: input.settings.stalenessDays,
        }),
      ],
      recordCount: known,
      settings: input.settings,
      statuses: input.statuses,
    });
  }

  /** Pricing position from the company's own decided quotes. Owner only. */
  private buildPricingInsight(input: {
    quotes: Array<{ totalCents: number; decided: 'accepted' | 'declined' | 'open' }>;
    newest: Date | null;
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
    now: Date;
  }): MktInsight {
    const decided = input.quotes.filter((quote) => quote.decided !== 'open');
    if (decided.length === 0 || !input.newest) {
      return buildMktUnavailableInsight({ topic: 'pricing_position' });
    }
    if (decided.length < input.settings.minEvidenceRecords) {
      return buildMktUnavailableInsight({
        topic: 'pricing_position',
        reason: `${decided.length} of your quotes have been accepted or declined, below the minimum of ${input.settings.minEvidenceRecords}. No pricing position is claimed, and no competitor price is invented.`,
      });
    }
    const bands = buildMktPriceBands(input.quotes);
    const measurable = bands.filter((band) => band.winRatePercent !== null);
    const strongest = [...measurable].sort(
      (a, b) => (b.winRatePercent ?? 0) - (a.winRatePercent ?? 0),
    )[0];
    const weakest = [...measurable].sort(
      (a, b) => (a.winRatePercent ?? 0) - (b.winRatePercent ?? 0),
    )[0];
    const overallWinRate =
      (input.quotes.filter((quote) => quote.decided === 'accepted').length / decided.length) * 100;

    return this.assembleInsight({
      insightKey: 'pricing_position:own-quotes',
      topic: 'pricing_position',
      kind: 'fact',
      headline: `You win ${overallWinRate.toFixed(1)}% of the quotes customers decide on`,
      detail: `Measured across ${decided.length} decided quote(s); ${input.quotes.length - decided.length} still open are excluded rather than counted as losses. Strongest band: ${strongest?.label ?? 'none measurable'}${
        strongest?.winRatePercent !== undefined && strongest?.winRatePercent !== null
          ? ` at ${strongest.winRatePercent.toFixed(1)}%`
          : ''
      }. Weakest: ${weakest?.label ?? 'none measurable'}${
        weakest?.winRatePercent !== undefined && weakest?.winRatePercent !== null
          ? ` at ${weakest.winRatePercent.toFixed(1)}%`
          : ''
      }. This is how the market responds to your own prices — it is not a comparison against anyone else, and no competitor price is claimed.`,
      measure: {
        label: 'Win rate across decided quotes',
        value: Math.round(overallWinRate * 10) / 10,
        unit: 'percent',
        basis: `${decided.length} real decided quote row(s).`,
      },
      evidence: [
        this.buildEvidence({
          origin: 'own_records',
          sourceKey: MKT_INTERNAL_SOURCES.quotes.sourceKey,
          sourceLabel: MKT_INTERNAL_SOURCES.quotes.label,
          trust: 'verified',
          observedAt: input.newest,
          recordCount: decided.length,
          detail: `${decided.length} decided quote(s) across ${measurable.length} measurable price band(s).`,
          now: input.now,
          stalenessDays: input.settings.stalenessDays,
        }),
      ],
      recordCount: decided.length,
      settings: input.settings,
      statuses: input.statuses,
    });
  }

  /** Search demand from connected keyword data only. */
  private buildSearchInsight(input: {
    keywords: Array<{
      keyword: string;
      searchVolume: number | null;
      currentRank: number | null;
      updatedAt: Date;
    }>;
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
    now: Date;
  }): MktInsight {
    const withVolume = input.keywords.filter(
      (keyword) => keyword.searchVolume !== null && keyword.searchVolume > 0,
    );
    if (withVolume.length === 0) {
      return buildMktUnavailableInsight({ topic: 'search_trend' });
    }
    if (withVolume.length < input.settings.minEvidenceRecords) {
      return buildMktUnavailableInsight({
        topic: 'search_trend',
        reason: `${withVolume.length} connected keyword(s) carry a search volume, below the minimum of ${input.settings.minEvidenceRecords}. No search volume is invented for the rest.`,
      });
    }
    const ranked = [...withVolume].sort(
      (a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0),
    );
    const newest = input.keywords.reduce((latest, keyword) =>
      keyword.updatedAt > latest.updatedAt ? keyword : latest,
    );
    const unranked = withVolume.filter((keyword) => keyword.currentRank === null).length;

    return this.assembleInsight({
      insightKey: 'search_trend:connected-keywords',
      topic: 'search_trend',
      kind: 'fact',
      headline: `${ranked[0]?.keyword ?? 'No keyword'} carries the highest recorded search volume`,
      detail: `Top keywords by recorded volume: ${ranked
        .slice(0, 5)
        .map((keyword) => `${keyword.keyword} (${keyword.searchVolume})`)
        .join(', ')}. ${input.keywords.length - withVolume.length} keyword(s) carry no volume from the provider and are excluded rather than estimated. ${unranked} tracked keyword(s) have no recorded rank.`,
      measure: {
        label: `Recorded search volume for ${ranked[0]?.keyword ?? 'the top keyword'}`,
        value: ranked[0]?.searchVolume ?? 0,
        unit: 'count',
        basis: 'Volume as recorded by the connected search provider. Not estimated here.',
      },
      evidence: [
        this.buildEvidence({
          origin: 'connected_provider',
          sourceKey: MKT_INTERNAL_SOURCES.seoKeywords.sourceKey,
          sourceLabel: MKT_INTERNAL_SOURCES.seoKeywords.label,
          trust: 'verified',
          observedAt: newest.updatedAt,
          recordCount: withVolume.length,
          detail: `${withVolume.length} keyword row(s) with a provider-recorded volume.`,
          now: input.now,
          stalenessDays: input.settings.stalenessDays,
        }),
      ],
      recordCount: withVolume.length,
      settings: input.settings,
      statuses: input.statuses,
    });
  }

  /**
   * Services customers are asking for that the company is not converting. A
   * service type only counts once enough real enquiries name it.
   */
  private buildNewServiceInsight(input: {
    leadServices: Array<{ serviceType: string | null; converted: boolean }>;
    newest: Date | null;
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
    now: Date;
  }): MktInsight {
    const named = input.leadServices.filter((lead) => (lead.serviceType ?? '').trim().length > 0);
    if (named.length === 0 || !input.newest) {
      return buildMktUnavailableInsight({ topic: 'new_service_opportunity' });
    }
    const byService = new Map<string, { label: string; total: number; converted: number }>();
    for (const lead of named) {
      const label = (lead.serviceType ?? '').trim();
      const key = label.toLowerCase();
      const entry = byService.get(key) ?? { label, total: 0, converted: 0 };
      entry.total += 1;
      if (lead.converted) entry.converted += 1;
      byService.set(key, entry);
    }
    // Only a service with enough real enquiries behind it can be an opportunity.
    const candidates = [...byService.values()]
      .filter((entry) => entry.total >= input.settings.minEvidenceRecords)
      .filter((entry) => entry.converted / entry.total < 0.25)
      .sort((a, b) => b.total - a.total);

    if (candidates.length === 0) {
      return buildMktUnavailableInsight({
        topic: 'new_service_opportunity',
        reason: `No service type has at least ${input.settings.minEvidenceRecords} real enquiries with a low conversion rate. No opportunity is invented.`,
      });
    }
    const top = candidates[0];
    const evidenceCount = candidates.reduce((total, entry) => total + entry.total, 0);

    return this.assembleInsight({
      insightKey: 'new_service_opportunity:own-leads',
      topic: 'new_service_opportunity',
      kind: 'fact',
      headline: `${top?.label ?? 'A service'} is asked for often but rarely converted`,
      detail: `Service types with real enquiry volume and under a quarter converted: ${candidates
        .slice(0, 5)
        .map((entry) => `${entry.label} (${entry.converted}/${entry.total} converted)`)
        .join(', ')}. This says what your own enquiries asked for; it does not claim what the wider market wants.`,
      measure: {
        label: `Enquiries for ${top?.label ?? 'the top service'}`,
        value: top?.total ?? 0,
        unit: 'count',
        basis: `${top?.converted ?? 0} of ${top?.total ?? 0} converted, from real lead rows.`,
      },
      evidence: [
        this.buildEvidence({
          origin: 'own_records',
          sourceKey: MKT_INTERNAL_SOURCES.leads.sourceKey,
          sourceLabel: MKT_INTERNAL_SOURCES.leads.label,
          trust: 'verified',
          observedAt: input.newest,
          recordCount: evidenceCount,
          detail: `${evidenceCount} real lead row(s) across ${candidates.length} service type(s).`,
          now: input.now,
          stalenessDays: input.settings.stalenessDays,
        }),
      ],
      recordCount: evidenceCount,
      settings: input.settings,
      statuses: input.statuses,
    });
  }

  /** Supplier price movements from the company's own catalogue. Owner only. */
  private buildSupplierInsight(input: {
    movements: Array<{ description: string; deltaCents: number; effectiveFrom: Date }>;
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
    now: Date;
  }): MktInsight {
    if (input.movements.length === 0) {
      return buildMktUnavailableInsight({ topic: 'supplier_product_signal' });
    }
    if (input.movements.length < input.settings.minEvidenceRecords) {
      return buildMktUnavailableInsight({
        topic: 'supplier_product_signal',
        reason: `${input.movements.length} supplier price revision(s) recorded in the lookback window, below the minimum of ${input.settings.minEvidenceRecords}. No supplier movement is inferred from less.`,
      });
    }
    const increases = input.movements.filter((movement) => movement.deltaCents > 0);
    const decreases = input.movements.filter((movement) => movement.deltaCents < 0);
    const biggest = [...input.movements].sort(
      (a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents),
    )[0];
    const newest = input.movements.reduce((latest, movement) =>
      movement.effectiveFrom > latest.effectiveFrom ? movement : latest,
    );

    return this.assembleInsight({
      insightKey: 'supplier_product_signal:own-catalogue',
      topic: 'supplier_product_signal',
      kind: 'fact',
      headline: `${increases.length} supplier price increase(s) and ${decreases.length} decrease(s) recorded`,
      detail: `Measured from versioned rows in your own supplier price catalogue. Largest movement: ${biggest?.description ?? 'none'} at ${((biggest?.deltaCents ?? 0) / 100).toFixed(2)} ZAR. These are your recorded supplier costs, not market-wide product prices.`,
      direction:
        increases.length > decreases.length
          ? 'rising'
          : decreases.length > increases.length
            ? 'falling'
            : 'steady',
      measure: {
        label: 'Largest recorded unit cost movement',
        value: biggest?.deltaCents ?? 0,
        unit: 'zar_cents',
        basis: `${input.movements.length} versioned catalogue row(s) with a prior version to compare against.`,
      },
      evidence: [
        this.buildEvidence({
          origin: 'own_records',
          sourceKey: MKT_INTERNAL_SOURCES.supplierCatalogue.sourceKey,
          sourceLabel: MKT_INTERNAL_SOURCES.supplierCatalogue.label,
          trust: 'verified',
          observedAt: newest.effectiveFrom,
          recordCount: input.movements.length,
          detail: `${input.movements.length} catalogue price revision(s) within the lookback window.`,
          now: input.now,
          stalenessDays: input.settings.stalenessDays,
        }),
      ],
      recordCount: input.movements.length,
      settings: input.settings,
      statuses: input.statuses,
    });
  }

  /**
   * AURA's reading of the facts above. Every recommendation is derived from an
   * insight that already stands on its own evidence, and is marked as a
   * recommendation rather than a fact so the two are never confused.
   */
  private buildMarketingOpportunityInsights(input: {
    facts: MktInsight[];
    settings: MktSettings;
    statuses: Map<string, MktInsightStatus>;
  }): MktInsight[] {
    const candidates = input.facts.filter(isMktOpportunityCandidate);
    if (candidates.length === 0) {
      return [buildMktUnavailableInsight({ topic: 'marketing_opportunity' })];
    }
    return candidates.slice(0, 5).map((fact) =>
      this.assembleInsight({
        insightKey: `marketing_opportunity:${fact.insightKey}`,
        topic: 'marketing_opportunity',
        kind: 'aura_recommendation',
        headline: `Consider acting on: ${fact.headline}`,
        detail: `AURA recommendation drawn from the measured fact "${fact.headline}" (${fact.topicLabel}, confidence ${fact.confidence}). ${fact.detail} Nothing here has been acted on: no price changed, no advert started or funded, no content published and no customer contacted.`,
        direction: fact.direction,
        evidence: fact.evidence,
        recordCount: fact.recordCount,
        settings: input.settings,
        statuses: input.statuses,
      }),
    );
  }

  // ─── Loading real rows ─────────────────────────────────────────────────────

  private async loadInsightStatuses(companyId: string) {
    const rows = await this.db.query.mktInsightStates.findMany({
      where: eq(mktInsightStates.companyId, companyId),
      limit: 500,
    });
    return new Map(rows.map((row) => [row.insightKey, row.status as MktInsightStatus]));
  }

  /**
   * Builds every insight this company's real rows can support.
   *
   * Owner-only topics are still built here so the Owner sees them; the
   * visibility filter decides who may read each one, and the route and service
   * both re-check before anything leaves.
   */
  private async buildInsights(
    actor: MktActor,
    settings: MktSettings,
    now: Date,
  ): Promise<{
    insights: MktInsight[];
    sources: MktSourceSummary[];
    unregisteredSources: string[];
    totalEvidenceRecords: number;
  }> {
    const since = new Date(now.getTime() - settings.lookbackDays * 86_400_000);
    const statuses = await this.loadInsightStatuses(actor.companyId);

    const [sourceRows, recordRows, leadRows, jobRows, quoteRows, keywordRows] = await Promise.all([
      this.loadSourceRows(actor.companyId),
      this.db
        .select({
          id: miMarketIntelligenceRecords.id,
          recordType: miMarketIntelligenceRecords.recordType,
          title: miMarketIntelligenceRecords.title,
          source: miMarketIntelligenceRecords.source,
          confidenceScore: miMarketIntelligenceRecords.confidenceScore,
          capturedAt: miMarketIntelligenceRecords.capturedAt,
        })
        .from(miMarketIntelligenceRecords)
        .where(
          and(
            eq(miMarketIntelligenceRecords.companyId, actor.companyId),
            gte(miMarketIntelligenceRecords.capturedAt, since),
          ),
        )
        .orderBy(desc(miMarketIntelligenceRecords.capturedAt))
        .limit(SOURCE_ROW_LIMIT),
      this.db
        .select({
          createdAt: leads.createdAt,
          serviceType: leads.serviceType,
          suburb: leads.suburb,
          city: leads.city,
          status: leads.status,
        })
        .from(leads)
        .where(and(eq(leads.companyId, actor.companyId), gte(leads.createdAt, since)))
        .orderBy(desc(leads.createdAt))
        .limit(SOURCE_ROW_LIMIT),
      this.db
        .select({
          createdAt: jobs.createdAt,
          jobType: jobs.jobType,
          suburb: jobs.snapshotSuburb,
          city: jobs.snapshotCity,
        })
        .from(jobs)
        .where(and(eq(jobs.companyId, actor.companyId), gte(jobs.createdAt, since)))
        .orderBy(desc(jobs.createdAt))
        .limit(SOURCE_ROW_LIMIT),
      this.db
        .select({
          totalCents: quotes.totalCents,
          status: quotes.status,
          createdAt: quotes.createdAt,
        })
        .from(quotes)
        .where(and(eq(quotes.companyId, actor.companyId), gte(quotes.createdAt, since)))
        .orderBy(desc(quotes.createdAt))
        .limit(SOURCE_ROW_LIMIT),
      this.db
        .select({
          keyword: miSeoKeywords.keyword,
          searchVolume: miSeoKeywords.searchVolume,
          currentRank: miSeoKeywords.currentRank,
          updatedAt: miSeoKeywords.updatedAt,
        })
        .from(miSeoKeywords)
        .where(eq(miSeoKeywords.companyId, actor.companyId))
        .orderBy(desc(miSeoKeywords.updatedAt))
        .limit(SOURCE_ROW_LIMIT),
    ]);

    const registered = new Map(
      sourceRows.map((row) => [
        row.sourceKey,
        {
          label: row.label,
          origin: row.origin as MktEvidenceOrigin,
          trust: mktSourceTrust({ permitted: row.permitted, verified: row.verified }),
        },
      ]),
    );

    const captured = this.buildCapturedRecordInsights({
      rows: recordRows,
      registered,
      settings,
      statuses,
      now,
    });

    const leadDates = leadRows.map((row) => row.createdAt.toISOString());
    const jobDates = jobRows.map((row) => row.createdAt.toISOString());
    const newestLead = leadRows[0]?.createdAt ?? null;
    const newestJob = jobRows[0]?.createdAt ?? null;
    const newestOwn =
      newestLead && newestJob ? (newestLead > newestJob ? newestLead : newestJob) : (newestLead ?? newestJob);

    const facts: MktInsight[] = [
      ...captured.insights,
      this.buildDemandInsight({
        leadDates,
        jobDates,
        newestLead,
        newestJob,
        settings,
        statuses,
        now,
      }),
      this.buildSeasonalInsight({
        dates: [...leadDates, ...jobDates],
        newest: newestOwn,
        settings,
        statuses,
        now,
      }),
      this.buildAreaInsight({
        areas: [
          ...leadRows.map((row) => row.suburb ?? row.city),
          ...jobRows.map((row) => row.suburb ?? row.city),
        ],
        newest: newestOwn,
        settings,
        statuses,
        now,
      }),
      this.buildPricingInsight({
        quotes: quoteRows.map((row) => ({
          totalCents: row.totalCents,
          decided:
            row.status === 'accepted' || row.status === 'converted'
              ? ('accepted' as const)
              : row.status === 'declined' || row.status === 'expired'
                ? ('declined' as const)
                : ('open' as const),
        })),
        newest: quoteRows[0]?.createdAt ?? null,
        settings,
        statuses,
        now,
      }),
      this.buildSearchInsight({ keywords: keywordRows, settings, statuses, now }),
      this.buildNewServiceInsight({
        leadServices: leadRows.map((row) => ({
          serviceType: row.serviceType,
          converted: row.status === 'converted',
        })),
        newest: newestLead,
        settings,
        statuses,
        now,
      }),
      this.buildSupplierInsight({
        movements: await this.loadSupplierMovements(actor.companyId, since),
        settings,
        statuses,
        now,
      }),
    ];

    // Topics with no builder output at all still report themselves, so a topic
    // never simply vanishes from the page.
    const covered = new Set(facts.map((fact) => fact.topic));
    for (const topic of MKT_TOPICS) {
      if (topic === 'marketing_opportunity') continue;
      if (!covered.has(topic)) facts.push(buildMktUnavailableInsight({ topic }));
    }

    const recommendations = this.buildMarketingOpportunityInsights({ facts, settings, statuses });
    const insights = sortMktInsights([...facts, ...recommendations]);

    const usage = await this.loadSourceUsage(actor.companyId);
    const sources = sourceRows.map((row) =>
      this.toSourceSummary(row, usage.get(row.sourceKey) ?? {
        lastObservedAt: null,
        observationCount: 0,
      }),
    );

    const totalEvidenceRecords =
      recordRows.length + leadRows.length + jobRows.length + quoteRows.length + keywordRows.length;

    return {
      insights,
      sources,
      unregisteredSources: [...captured.unregisteredSources],
      totalEvidenceRecords,
    };
  }

  /**
   * Price revisions in the company's own catalogue, measured by comparing an
   * active item against the version it replaced. An item with no prior version
   * is not a movement and is left out rather than treated as a change.
   */
  private async loadSupplierMovements(companyId: string, since: Date) {
    const current = await this.db
      .select({
        description: supplierPriceCatalogueItems.description,
        unitCostCents: supplierPriceCatalogueItems.unitCostCents,
        previousVersionId: supplierPriceCatalogueItems.previousVersionId,
        effectiveFrom: supplierPriceCatalogueItems.effectiveFrom,
      })
      .from(supplierPriceCatalogueItems)
      .where(
        and(
          eq(supplierPriceCatalogueItems.companyId, companyId),
          eq(supplierPriceCatalogueItems.isActive, true),
          isNotNull(supplierPriceCatalogueItems.previousVersionId),
          gte(supplierPriceCatalogueItems.effectiveFrom, since),
        ),
      )
      .orderBy(desc(supplierPriceCatalogueItems.effectiveFrom))
      .limit(SOURCE_ROW_LIMIT);

    const previousIds = current
      .map((item) => item.previousVersionId)
      .filter((id): id is string => Boolean(id));
    if (previousIds.length === 0) return [];

    const previous = await this.db
      .select({
        id: supplierPriceCatalogueItems.id,
        unitCostCents: supplierPriceCatalogueItems.unitCostCents,
      })
      .from(supplierPriceCatalogueItems)
      .where(
        and(
          eq(supplierPriceCatalogueItems.companyId, companyId),
          inArray(supplierPriceCatalogueItems.id, previousIds),
        ),
      );
    const previousById = new Map(previous.map((row) => [row.id, row.unitCostCents]));

    const movements: Array<{ description: string; deltaCents: number; effectiveFrom: Date }> = [];
    for (const item of current) {
      if (!item.previousVersionId || !item.effectiveFrom) continue;
      const priorCost = previousById.get(item.previousVersionId);
      if (priorCost === undefined) continue;
      const deltaCents = item.unitCostCents - priorCost;
      if (deltaCents === 0) continue;
      movements.push({
        description: item.description,
        deltaCents,
        effectiveFrom: item.effectiveFrom,
      });
    }
    return movements;
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(actor: MktActor): Promise<MktDashboard> {
    this.assertRead(actor);
    const now = new Date();
    const scope = resolveMktAudienceScope(actor);
    const settings = await this.getSettings(actor);
    const built = await this.buildInsights(actor, settings, now);

    const { visible, withheld } = applyMktVisibility(built.insights, {
      identity: actor,
      settings,
    });

    const visibleTopics = listVisibleMktTopics(actor);
    const hiddenTopics = MKT_TOPICS.filter((topic) => !visibleTopics.includes(topic));
    const coverage = buildMktTopicCoverage({ topics: visibleTopics, insights: visible });
    const opportunities = await this.listOpportunities(actor);

    const factCount = visible.filter((insight) => insight.kind === 'fact').length;
    const recommendationCount = visible.length - factCount;

    return {
      summary: buildMktSummary({
        factCount,
        recommendationCount,
        totalEvidenceRecords: built.totalEvidenceRecords,
        needsVerificationCount: visible.filter(
          (insight) => insight.availability === 'needs_verification',
        ).length,
        unavailableTopicCount: coverage.filter((entry) => entry.availability === 'unavailable')
          .length,
        withheldCount: withheld.length,
      }),
      productClarification: {
        marketingSuite: MKT_PRODUCT_COPY.marketingSuite,
        thisLayer: MKT_PRODUCT_COPY.thisLayer,
        noExternalActions: MKT_PRODUCT_COPY.noExternalActions,
      },
      policy: {
        autoActionsEnabled: false,
        inventMarketDataEnabled: false,
        externalFetchEnabled: false,
        approvalRequired: true,
        fakeBusinessData: false,
        financeSensitiveOwnerOnly: true,
      },
      scope,
      scopeRationale: MKT_SCOPE_RATIONALE[scope],
      visibleTopics,
      hiddenTopics,
      insights: visible,
      withheld,
      coverage,
      // The source register is an Owner control, so only the Owner sees it.
      sources: scope === 'owner_full' ? built.sources : [],
      unregisteredSources: scope === 'owner_full' ? built.unregisteredSources : [],
      settings,
      opportunities,
      pendingApprovals: opportunities.filter(
        (opportunity) =>
          opportunity.status === 'draft' || opportunity.status === 'pending_approval',
      ).length,
      connections: listMktConnections(),
      totalEvidenceRecords: built.totalEvidenceRecords,
      factCount,
      recommendationCount,
    };
  }

  // ─── Publication decisions ─────────────────────────────────────────────────

  /**
   * Records the Owner's decision on whether an insight is published to
   * marketing users. Nothing is deleted: archiving hides an insight from the
   * marketing view while its history stays in the audit trail.
   */
  async decideInsight(
    actor: MktActor,
    insightKey: string,
    input: DecideMktInsightRequest,
  ): Promise<{ insightKey: string; status: MktInsightStatus }> {
    this.assertPublish(actor);
    const key = insightKey.trim();
    if (!key) {
      throw new MarketIntelligenceError('INVALID', 'An insight key is required.');
    }
    const topic = key.split(':')[0] ?? '';
    if (!(MKT_TOPICS as readonly string[]).includes(topic)) {
      throw new MarketIntelligenceError('INVALID', 'Unknown insight topic.');
    }
    const typedTopic = topic as MktTopic;
    if (!canViewMktTopic(actor, typedTopic)) {
      throw new MarketIntelligenceError(
        'FORBIDDEN',
        `${MKT_TOPIC_LABELS[typedTopic]} is not visible to this role.`,
      );
    }

    const status: MktInsightStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : input.decision === 'archive'
            ? 'archived'
            : 'draft';

    const existing = await this.db.query.mktInsightStates.findFirst({
      where: and(
        eq(mktInsightStates.companyId, actor.companyId),
        eq(mktInsightStates.insightKey, key),
      ),
    });

    if (existing) {
      await this.db
        .update(mktInsightStates)
        .set({
          status,
          notes: input.notes ?? existing.notes,
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mktInsightStates.id, existing.id),
            eq(mktInsightStates.companyId, actor.companyId),
          ),
        );
    } else {
      await this.db.insert(mktInsightStates).values({
        companyId: actor.companyId,
        insightKey: key,
        topic: typedTopic,
        status,
        notes: input.notes ?? null,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
      });
    }

    const kind =
      input.decision === 'approve'
        ? ('insight_approved' as const)
        : input.decision === 'reject'
          ? ('insight_rejected' as const)
          : input.decision === 'archive'
            ? ('insight_archived' as const)
            : ('insight_reopened' as const);

    await this.db.insert(mktSignalEvents).values({
      companyId: actor.companyId,
      insightKey: key,
      kind,
      actorUserId: actor.userId,
      notes: input.notes ?? null,
      metadata: { topic: typedTopic, status, deleted: false },
    });
    await this.recordAudit(actor, `market_intelligence.insight.${input.decision}`, key, {
      topic: typedTopic,
      status,
      historyPreserved: true,
      publishedToMarketingUsers: status === 'approved',
    });

    return { insightKey: key, status };
  }

  // ─── Audit ─────────────────────────────────────────────────────────────────

  private toAuditEntry(row: {
    id: string;
    insightKey: string | null;
    kind: MktAuditEntry['kind'];
    actorUserId: string | null;
    notes: string | null;
    occurredAt: Date;
  }): MktAuditEntry {
    return {
      id: row.id,
      insightKey: row.insightKey,
      kind: row.kind,
      actorUserId: row.actorUserId,
      notes: row.notes,
      occurredAt: row.occurredAt.toISOString(),
    };
  }

  async listInsightAudit(actor: MktActor, insightKey: string): Promise<MktAuditEntry[]> {
    this.assertRead(actor);
    const topic = insightKey.split(':')[0] ?? '';
    if (
      (MKT_TOPICS as readonly string[]).includes(topic) &&
      !canViewMktTopic(actor, topic as MktTopic)
    ) {
      throw new MarketIntelligenceError(
        'FORBIDDEN',
        'This market topic is not visible to this role.',
      );
    }
    const rows = await this.db.query.mktSignalEvents.findMany({
      where: and(
        eq(mktSignalEvents.companyId, actor.companyId),
        eq(mktSignalEvents.insightKey, insightKey),
      ),
      orderBy: [desc(mktSignalEvents.occurredAt)],
      limit: 100,
    });
    return rows.map((row) => this.toAuditEntry(row));
  }

  /** Company-level history, Owner only because it spans pricing and strategy. */
  async listCompanyAudit(actor: MktActor): Promise<MktAuditEntry[]> {
    this.assertOwner(actor);
    const rows = await this.db.query.mktSignalEvents.findMany({
      where: eq(mktSignalEvents.companyId, actor.companyId),
      orderBy: [desc(mktSignalEvents.occurredAt)],
      limit: 100,
    });
    return rows.map((row) => this.toAuditEntry(row));
  }

  // ─── Approval-gated recommendations ────────────────────────────────────────

  private toOpportunitySummary(row: {
    id: string;
    insightKey: string | null;
    topic: MktTopic | null;
    title: string;
    body: string;
    status: MktOpportunitySummary['status'];
    confidence: string;
    createdAt: Date;
    decidedAt: Date | null;
  }): MktOpportunitySummary {
    return {
      id: row.id,
      insightKey: row.insightKey,
      topic: row.topic,
      title: row.title,
      body: row.body,
      status: row.status,
      confidence: row.confidence as MktOpportunitySummary['confidence'],
      autoExecuted: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    };
  }

  async listOpportunities(actor: MktActor): Promise<MktOpportunitySummary[]> {
    this.assertRead(actor);
    const rows = await this.db.query.mktOpportunityDrafts.findMany({
      where: eq(mktOpportunityDrafts.companyId, actor.companyId),
      orderBy: [desc(mktOpportunityDrafts.createdAt)],
      limit: 50,
    });
    // A recommendation about a topic this role cannot see stays hidden.
    return rows
      .filter((row) => !row.topic || canViewMktTopic(actor, row.topic as MktTopic))
      .map((row) => this.toOpportunitySummary(row));
  }

  async createOpportunity(
    actor: MktActor,
    input: CreateMktOpportunityRequest,
  ): Promise<MktOpportunitySummary> {
    this.assertRead(actor);
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) {
      throw new MarketIntelligenceError('INVALID', 'Title and body are required.');
    }
    if (input.topic && !canViewMktTopic(actor, input.topic)) {
      throw new MarketIntelligenceError(
        'FORBIDDEN',
        'This market topic is not visible to this role.',
      );
    }
    const [created] = await this.db
      .insert(mktOpportunityDrafts)
      .values({
        companyId: actor.companyId,
        insightKey: input.insightKey ?? null,
        topic: input.topic ?? null,
        title,
        body,
        confidence: 'insufficient',
        // Nothing executes on creation — a recommendation waits for the Owner.
        status: input.submitForApproval ? 'pending_approval' : 'draft',
        autoExecuted: false,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!created) {
      throw new MarketIntelligenceError('INVALID', 'The recommendation could not be created.');
    }
    await this.db.insert(mktSignalEvents).values({
      companyId: actor.companyId,
      insightKey: created.insightKey,
      kind: 'opportunity_created',
      actorUserId: actor.userId,
      metadata: { topic: created.topic, status: created.status },
    });
    await this.recordAudit(actor, 'market_intelligence.opportunity.create', created.id, {
      topic: created.topic,
      status: created.status,
      approvalRequired: true,
    });
    return this.toOpportunitySummary(created);
  }

  async decideOpportunity(
    actor: MktActor,
    opportunityId: string,
    input: DecideMktOpportunityRequest,
  ): Promise<MktOpportunitySummary> {
    this.assertApprove(actor);
    const existing = await this.db.query.mktOpportunityDrafts.findFirst({
      where: and(
        eq(mktOpportunityDrafts.id, opportunityId),
        eq(mktOpportunityDrafts.companyId, actor.companyId),
      ),
    });
    if (!existing) {
      throw new MarketIntelligenceError('NOT_FOUND', 'Recommendation not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new MarketIntelligenceError(
        'INVALID',
        `Recommendation is already ${existing.status}.`,
      );
    }
    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'acknowledged';
    const [updated] = await this.db
      .update(mktOpportunityDrafts)
      .set({
        status: nextStatus,
        decisionNotes: input.notes ?? null,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        // Approval records an Owner decision; it never executes a change.
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mktOpportunityDrafts.id, opportunityId),
          eq(mktOpportunityDrafts.companyId, actor.companyId),
        ),
      )
      .returning();
    if (!updated) {
      throw new MarketIntelligenceError('NOT_FOUND', 'Recommendation not found.');
    }
    await this.db.insert(mktSignalEvents).values({
      companyId: actor.companyId,
      insightKey: updated.insightKey,
      kind: 'opportunity_decided',
      actorUserId: actor.userId,
      notes: input.notes ?? null,
      metadata: { decision: input.decision, status: updated.status, executed: false },
    });
    await this.recordAudit(actor, 'market_intelligence.opportunity.decide', updated.id, {
      decision: input.decision,
      status: updated.status,
      executedDownstreamChange: false,
    });
    return this.toOpportunitySummary(updated);
  }

  /**
   * Drafts recommendations from the insights currently standing on their own
   * evidence. Nothing executes, and an insight that already has an open
   * recommendation is not duplicated.
   */
  async refreshOpportunities(
    actor: MktActor,
    input: { submitForApproval?: boolean } = {},
  ): Promise<MktOpportunitySummary[]> {
    this.assertRead(actor);
    const dashboard = await this.getDashboard(actor);
    const candidates = dashboard.insights.filter(isMktOpportunityCandidate);
    if (candidates.length === 0) return dashboard.opportunities;

    const openRows = await this.db.query.mktOpportunityDrafts.findMany({
      where: and(
        eq(mktOpportunityDrafts.companyId, actor.companyId),
        inArray(mktOpportunityDrafts.status, ['draft', 'pending_approval']),
      ),
    });
    const existingKeys = new Set(openRows.map((row) => `${row.insightKey ?? ''}|${row.title}`));

    const toInsert = candidates
      .map((insight) => {
        const draft = buildMktOpportunityDraft({
          topicLabel: insight.topicLabel,
          headline: insight.headline,
          detail: insight.detail,
          recordCount: insight.recordCount,
          confidence: insight.confidence,
          sourceLabels: [...new Set(insight.evidence.map((item) => item.sourceLabel))],
          observedAt: insight.observedAt,
        });
        return {
          insightKey: insight.insightKey,
          topic: insight.topic,
          confidence: insight.confidence,
          ...draft,
        };
      })
      .filter((draft) => !existingKeys.has(`${draft.insightKey}|${draft.title}`));

    if (toInsert.length > 0) {
      await this.db.insert(mktOpportunityDrafts).values(
        toInsert.map((draft) => ({
          companyId: actor.companyId,
          insightKey: draft.insightKey,
          topic: draft.topic,
          title: draft.title,
          body: draft.body,
          confidence: draft.confidence,
          status: input.submitForApproval ? ('pending_approval' as const) : ('draft' as const),
          autoExecuted: false,
          createdByUserId: actor.userId,
        })),
      );
      await this.db.insert(mktSignalEvents).values({
        companyId: actor.companyId,
        insightKey: null,
        kind: 'opportunity_refreshed',
        actorUserId: actor.userId,
        metadata: { generated: toInsert.length, executed: false },
      });
      await this.recordAudit(actor, 'market_intelligence.opportunity.refresh', actor.companyId, {
        generated: toInsert.length,
        approvalRequired: true,
        executedDownstreamChange: false,
      });
    }

    return this.listOpportunities(actor);
  }
}
