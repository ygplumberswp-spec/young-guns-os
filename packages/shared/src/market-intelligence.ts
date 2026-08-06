/**
 * Market Intelligence (Department 17)
 *
 * An outward-looking read layer. It answers what the market is doing —
 * competitors, industry trends, pricing, demand, seasonality, search, service
 * demand by area, new service openings and supplier signals — and turns that
 * into marketing recommendations the Owner can approve.
 *
 * It is not the marketing execution suite. Enterprise Marketing Intelligence
 * (/marketing-intelligence) still owns campaigns, content, ads, budgets and
 * publishing. This layer reads the market records that surface already
 * captured, reads the company's own leads, quotes and jobs, and recommends.
 *
 * Invariants:
 * - Every read and write is scoped by companyId
 * - Nothing external is ever fetched, scraped or called from here — evidence
 *   is only what a supported public source or connected provider already
 *   recorded, plus the company's own rows
 * - A competitor price, market share, demand figure or trend is never invented.
 *   Without enough real evidence the answer is unavailable or needs
 *   verification, never a guess
 * - Every statement is labelled fact or AURA recommendation, and carries its
 *   source, observation date, freshness and confidence
 * - Recommendations only. Approval records an Owner decision and never changes
 *   a price, starts or funds an advert, publishes content or contacts anyone
 * - Finance-sensitive pricing, supplier cost and strategy topics are Owner only
 * - Marketing users see approved insights only; technicians and clients are
 *   denied outright
 */

export const MARKET_INTELLIGENCE_KEY = 'market-intelligence' as const;

// ─── Vocabulary ───────────────────────────────────────────────────────────────

export type MktTopic =
  | 'competitor_activity'
  | 'industry_trend'
  | 'pricing_position'
  | 'demand_trend'
  | 'seasonal_demand'
  | 'search_trend'
  | 'service_area_demand'
  | 'new_service_opportunity'
  | 'supplier_product_signal'
  | 'marketing_opportunity';

/** Facts are measured. Recommendations are AURA's reading of those facts. */
export type MktStatementKind = 'fact' | 'aura_recommendation';

/** Where a piece of evidence came from. Nothing else is permitted. */
export type MktEvidenceOrigin =
  | 'own_records'
  | 'connected_provider'
  | 'public_source'
  | 'manual_entry';

/**
 * Whether the Owner has registered the source this evidence cites. An
 * unregistered source is reported, never quietly trusted.
 */
export type MktSourceTrust = 'verified' | 'registered' | 'unregistered';

export type MktFreshness = 'fresh' | 'recent' | 'stale' | 'expired';

export type MktConfidence = 'high' | 'medium' | 'low' | 'insufficient';

/** What the evidence actually supports. Never a reassuring guess. */
export type MktAvailability = 'available' | 'partial' | 'unavailable' | 'needs_verification';

/** Direction of a measured series. Never asserted without enough periods. */
export type MktDirection = 'rising' | 'steady' | 'falling' | 'insufficient_evidence';

/** Publication state. Marketing users only ever see `approved`. */
export type MktInsightStatus = 'draft' | 'approved' | 'rejected' | 'archived';

export type MktOpportunityStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'acknowledged';

/** How much of Market Intelligence the viewer is allowed to see. */
export type MktAudienceScope = 'owner_full' | 'marketing_approved_only' | 'denied';

export const MKT_TOPICS: readonly MktTopic[] = [
  'competitor_activity',
  'industry_trend',
  'pricing_position',
  'demand_trend',
  'seasonal_demand',
  'search_trend',
  'service_area_demand',
  'new_service_opportunity',
  'supplier_product_signal',
  'marketing_opportunity',
] as const;

export const MKT_TOPIC_LABELS: Record<MktTopic, string> = {
  competitor_activity: 'Competitor monitoring',
  industry_trend: 'Industry trends',
  pricing_position: 'Pricing intelligence',
  demand_trend: 'Demand trends',
  seasonal_demand: 'Seasonal demand',
  search_trend: 'Search trends',
  service_area_demand: 'Service demand by area',
  new_service_opportunity: 'New service opportunities',
  supplier_product_signal: 'Supplier and product-market signals',
  marketing_opportunity: 'Marketing opportunities',
};

export const MKT_ORIGIN_LABELS: Record<MktEvidenceOrigin, string> = {
  own_records: 'Your own records',
  connected_provider: 'Connected provider',
  public_source: 'Supported public source',
  manual_entry: 'Recorded by a person',
};

export function isMktTopic(value: string | null | undefined): value is MktTopic {
  return Boolean(value && (MKT_TOPICS as readonly string[]).includes(value));
}

// ─── Access ───────────────────────────────────────────────────────────────────

const OWNER_ROLES = ['Company Owner', 'Owner', 'Platform Owner'] as const;

/** Roles that are never shown market strategy, whatever permissions they hold. */
export const MKT_DENIED_ROLES: readonly string[] = ['Technician', 'Client'] as const;

/**
 * Topics that expose pricing, margin, supplier cost or strategy. These are
 * Owner only and decided by role, so a wildcard permission on an Admin,
 * Marketing or Office account cannot reveal them.
 */
export const MKT_OWNER_ONLY_TOPICS: readonly MktTopic[] = [
  'pricing_position',
  'supplier_product_signal',
  'new_service_opportunity',
] as const;

/** Permissions that make someone a marketing user for this layer. */
export const MKT_MARKETING_PERMISSIONS: readonly string[] = [
  'marketing:read',
  'marketing:write',
  'marketing:manage',
  'market_intelligence:read',
] as const;

export function isMktOwnerRole(identity: { roleName?: string | null }): boolean {
  return (OWNER_ROLES as readonly string[]).includes(identity.roleName ?? '');
}

/**
 * Technicians and clients are denied by role first, before any permission is
 * consulted — a wildcard permission must not open market strategy to them.
 */
export function resolveMktAudienceScope(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): MktAudienceScope {
  const role = identity.roleName ?? '';
  if (!role.trim()) return 'denied';
  if (MKT_DENIED_ROLES.includes(role)) return 'denied';
  if (isMktOwnerRole(identity)) return 'owner_full';
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return 'marketing_approved_only';
  if (permissions.some((permission) => MKT_MARKETING_PERMISSIONS.includes(permission))) {
    return 'marketing_approved_only';
  }
  return 'denied';
}

export function canAccessMarketIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return resolveMktAudienceScope(identity) !== 'denied';
}

/**
 * Topic-level visibility. Finance-sensitive and strategy topics stay Owner
 * only; everything else follows the audience scope.
 */
export function canViewMktTopic(
  identity: { roleName?: string | null; permissions?: string[] | null },
  topic: MktTopic,
): boolean {
  const scope = resolveMktAudienceScope(identity);
  if (scope === 'denied') return false;
  if ((MKT_OWNER_ONLY_TOPICS as readonly string[]).includes(topic)) {
    return isMktOwnerRole(identity);
  }
  return true;
}

export function listVisibleMktTopics(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): MktTopic[] {
  return MKT_TOPICS.filter((topic) => canViewMktTopic(identity, topic));
}

/** Only the Owner registers a source, because it attests the source is lawful. */
export function canManageMktSources(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return isMktOwnerRole(identity);
}

export function canManageMktSettings(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return isMktOwnerRole(identity);
}

/** Publishing an insight to marketing users is an Owner decision. */
export function canPublishMktInsight(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return isMktOwnerRole(identity);
}

/** A recommendation only becomes a decision when the Owner approves it. */
export function canApproveMktOpportunity(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return isMktOwnerRole(identity);
}

export const MKT_SCOPE_RATIONALE: Record<MktAudienceScope, string> = {
  owner_full:
    'Full market view for this company, including pricing, supplier cost and strategy topics. Every figure is scoped to this company only.',
  marketing_approved_only:
    'Approved insights only. Insights the Owner has not yet approved are not shown, and pricing, supplier cost and new-service strategy topics remain Owner only.',
  denied:
    'Market Intelligence is not available to this role. Market strategy, pricing and competitor topics are restricted.',
};

// ─── Product boundaries ───────────────────────────────────────────────────────

export const MKT_PRODUCT_COPY = {
  marketingSuite:
    'Enterprise Marketing Intelligence (/marketing-intelligence) still owns campaigns, content, adverts, budgets, publishing and the market records it captures — this layer reads those records rather than rebuilding the suite.',
  thisLayer:
    'Market Intelligence reads the market records already captured, your own leads, quotes and jobs, your connected search data and your supplier catalogue, and reports what the evidence actually supports. Every statement is labelled fact or AURA recommendation and carries its source, observation date, freshness and confidence. A competitor price, market share, demand figure or trend is never invented — without evidence the answer is unavailable or needs verification.',
  noExternalActions:
    'Nothing is fetched, scraped or called from here. This layer reads rows that a supported public source, a connected provider or a person already recorded. It never changes a price, starts or funds an advert, publishes content or contacts anyone.',
} as const;

export type MktConnection = {
  label: string;
  href: string;
  note: string;
};

export function listMktConnections(): MktConnection[] {
  return [
    {
      label: 'Marketing Intelligence',
      href: '/marketing-intelligence',
      note: 'Campaigns, content, adverts and the market records this layer reads.',
    },
    {
      label: 'Sales Analytics Intelligence',
      href: '/sales-analytics-intelligence',
      note: 'Win rates and sales performance behind the pricing picture.',
    },
    { label: 'Leads', href: '/leads', note: 'Real enquiry rows behind demand and area trends.' },
    { label: 'Quotes', href: '/finance/quotes', note: 'Real quote rows behind pricing position.' },
    {
      label: 'Customer 360',
      href: '/customer-360-intelligence',
      note: 'Customer context behind demand and opportunity.',
    },
    {
      label: 'Cashflow & Profit',
      href: '/finance-cashflow-profit',
      note: 'Source of record for the finance figures a pricing insight refers to.',
    },
    {
      label: 'Executive Command Centre',
      href: '/executive-command-centre',
      note: 'Where market opportunity sits beside the rest of the business.',
    },
  ];
}

// ─── Sources ──────────────────────────────────────────────────────────────────

export type MktSourceSummary = {
  id: string;
  sourceKey: string;
  label: string;
  origin: MktEvidenceOrigin;
  /** The Owner has attested this is a supported, lawfully accessible source. */
  permitted: boolean;
  verified: boolean;
  trust: MktSourceTrust;
  reference: string | null;
  notes: string | null;
  lastObservedAt: string | null;
  observationCount: number;
};

export function mktSourceTrust(input: { permitted: boolean; verified: boolean }): MktSourceTrust {
  if (!input.permitted) return 'unregistered';
  return input.verified ? 'verified' : 'registered';
}

/** Internal sources are the company's own rows, so they are always verified. */
export const MKT_INTERNAL_SOURCES = {
  leads: { sourceKey: 'internal:leads', label: 'Your lead records' },
  quotes: { sourceKey: 'internal:quotes', label: 'Your quote records' },
  jobs: { sourceKey: 'internal:jobs', label: 'Your job records' },
  seoKeywords: { sourceKey: 'connected:search-keywords', label: 'Connected search keyword data' },
  supplierCatalogue: {
    sourceKey: 'internal:supplier-catalogue',
    label: 'Your supplier price catalogue',
  },
  marketRecords: {
    sourceKey: 'marketing:market-records',
    label: 'Market records captured in Marketing Intelligence',
  },
} as const;

/**
 * Normalises the free-text source on a captured market record so it can be
 * matched against the registered sources. An unmatched source is not rejected
 * — it is reported as needing verification.
 */
export function normaliseMktSourceKey(source: string | null | undefined): string {
  return (source ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Maps the free-text `record_type` on a captured market record onto a topic.
 *
 * The mapping is a fixed table over the record type only. Nothing is inferred
 * from the record's title or body, because guessing a topic from prose would
 * risk filing an observation under a claim it does not actually support. A
 * record type this table does not recognise returns null and is reported as
 * unclassified rather than being filed somewhere plausible.
 */
export function classifyMktRecordType(recordType: string | null | undefined): MktTopic | null {
  const value = (recordType ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes('competitor') || value.includes('rival')) return 'competitor_activity';
  if (value.includes('price') || value.includes('pricing') || value.includes('rate_card')) {
    return 'pricing_position';
  }
  if (value.includes('industry') || value.includes('trend') || value.includes('market_report')) {
    return 'industry_trend';
  }
  if (value.includes('demand') || value.includes('enquiry')) return 'demand_trend';
  if (value.includes('season')) return 'seasonal_demand';
  if (value.includes('search') || value.includes('keyword') || value.includes('seo')) {
    return 'search_trend';
  }
  if (value.includes('area') || value.includes('suburb') || value.includes('region')) {
    return 'service_area_demand';
  }
  if (value.includes('supplier') || value.includes('product')) return 'supplier_product_signal';
  if (value.includes('opportunity') || value.includes('campaign')) return 'marketing_opportunity';
  return null;
}

/**
 * A confidence score captured alongside a market record, mapped onto this
 * layer's scale. A record without a score is not assumed to be confident.
 */
export function mktConfidenceFromScore(score: number | null | undefined): MktConfidence {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'insufficient';
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  if (score > 0) return 'low';
  return 'insufficient';
}

// ─── Freshness and confidence ─────────────────────────────────────────────────

export const MKT_FRESHNESS_LABELS: Record<MktFreshness, string> = {
  fresh: 'Observed recently',
  recent: 'Observed within the freshness window',
  stale: 'Older than the freshness window the Owner set',
  expired: 'Far older than the freshness window — treat as historical only',
};

export function mktAgeDays(observedAt: string, now: Date): number {
  const parsed = Date.parse(observedAt);
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - parsed) / 86_400_000);
}

/**
 * Freshness against the Owner-set staleness window. Anything past three times
 * the window is expired rather than merely stale, so an old observation cannot
 * quietly keep propping up a current claim.
 */
export function mktFreshnessFor(ageDays: number, stalenessDays: number): MktFreshness {
  const window = stalenessDays > 0 ? stalenessDays : 30;
  if (!Number.isFinite(ageDays)) return 'expired';
  if (ageDays <= window / 3) return 'fresh';
  if (ageDays <= window) return 'recent';
  if (ageDays <= window * 3) return 'stale';
  return 'expired';
}

export const MKT_FRESHNESS_RANK: Record<MktFreshness, number> = {
  fresh: 4,
  recent: 3,
  stale: 2,
  expired: 1,
};

/**
 * Confidence from what the evidence actually is: how many real records back
 * it, how fresh they are and whether their sources are registered. An
 * unregistered source can never produce more than low confidence, and too few
 * records is reported as insufficient rather than rounded up.
 */
export function mktConfidenceFor(input: {
  recordCount: number;
  minRecords: number;
  freshness: MktFreshness;
  trust: MktSourceTrust;
}): MktConfidence {
  if (input.recordCount <= 0) return 'insufficient';
  if (input.recordCount < input.minRecords) return 'insufficient';
  if (input.trust === 'unregistered') return 'low';
  if (input.freshness === 'expired') return 'low';
  if (input.freshness === 'stale') return 'medium';
  if (input.trust === 'verified' && input.freshness === 'fresh' && input.recordCount >= input.minRecords * 3) {
    return 'high';
  }
  if (input.freshness === 'fresh' && input.recordCount >= input.minRecords * 2) return 'high';
  return 'medium';
}

/** The weakest trust across a set of evidence decides the whole insight. */
export function weakestMktTrust(trusts: MktSourceTrust[]): MktSourceTrust {
  if (trusts.length === 0) return 'unregistered';
  if (trusts.includes('unregistered')) return 'unregistered';
  if (trusts.includes('registered')) return 'registered';
  return 'verified';
}

/** The oldest evidence decides the freshness of the whole insight. */
export function weakestMktFreshness(freshnesses: MktFreshness[]): MktFreshness {
  if (freshnesses.length === 0) return 'expired';
  return freshnesses.reduce((worst, current) =>
    MKT_FRESHNESS_RANK[current] < MKT_FRESHNESS_RANK[worst] ? current : worst,
  );
}

// ─── Evidence and insights ────────────────────────────────────────────────────

export type MktEvidence = {
  origin: MktEvidenceOrigin;
  sourceKey: string;
  sourceLabel: string;
  trust: MktSourceTrust;
  /** When the underlying observation was made, not when it was read. */
  observedAt: string;
  ageDays: number;
  freshness: MktFreshness;
  recordCount: number;
  detail: string;
  reference: string | null;
};

export type MktInsight = {
  insightKey: string;
  topic: MktTopic;
  topicLabel: string;
  /** Facts are measured from rows; recommendations are AURA's reading. */
  kind: MktStatementKind;
  headline: string;
  detail: string;
  availability: MktAvailability;
  confidence: MktConfidence;
  freshness: MktFreshness;
  trust: MktSourceTrust;
  direction: MktDirection;
  /** Present only when a real number was measured from real rows. */
  measure: MktMeasure | null;
  evidence: MktEvidence[];
  recordCount: number;
  observedAt: string | null;
  status: MktInsightStatus;
  /** Why this is not fully trusted, when it is not. Empty when it is. */
  caveat: string;
  /** Invariant: no figure on this insight was generated. */
  invented: false;
};

/**
 * A measured number, always carrying the unit and the row count behind it so
 * a reader can tell a real measurement from an impression.
 */
export type MktMeasure = {
  label: string;
  value: number;
  unit: 'count' | 'percent' | 'zar_cents' | 'rank' | 'days';
  basis: string;
};

export type MktTopicCoverage = {
  topic: MktTopic;
  label: string;
  availability: MktAvailability;
  insightCount: number;
  recordCount: number;
  rationale: string;
};

export const MKT_UNAVAILABLE_RATIONALE: Record<MktTopic, string> = {
  competitor_activity:
    'No competitor observation from a supported public source or connected provider has been recorded yet. No competitor price, share or claim is invented to fill the gap.',
  industry_trend:
    'No industry trend record has been captured from a supported source yet. No trend is invented.',
  pricing_position:
    'Not enough of your own quote history exists to describe your pricing position, and no market price observation has been recorded. No competitor price is invented.',
  demand_trend:
    'Not enough of your own lead and job history exists to describe a demand trend. No demand figure is invented.',
  seasonal_demand:
    'Seasonal demand needs at least a full year of your own records before a pattern can be claimed. No season is invented.',
  search_trend:
    'No connected search keyword data has been recorded. No search volume is invented.',
  service_area_demand:
    'Not enough of your own leads and jobs carry an area to describe demand by area. No area figure is invented.',
  new_service_opportunity:
    'Not enough real enquiries name a service you do not already deliver. No opportunity is invented.',
  supplier_product_signal:
    'No supplier price revision has been recorded in your catalogue within the lookback window. No supplier movement is invented.',
  marketing_opportunity:
    'No underlying market insight has enough evidence to support a marketing recommendation. No opportunity is invented.',
};

/**
 * Builds the honest empty answer for a topic. Used wherever evidence is
 * missing, so an empty topic always reads the same way and never renders as a
 * reassuring zero.
 */
export function buildMktUnavailableInsight(input: {
  topic: MktTopic;
  reason?: string;
  availability?: Extract<MktAvailability, 'unavailable' | 'needs_verification'>;
}): MktInsight {
  const availability = input.availability ?? 'unavailable';
  return {
    insightKey: `${input.topic}:unavailable`,
    topic: input.topic,
    topicLabel: MKT_TOPIC_LABELS[input.topic],
    kind: 'fact',
    headline: `${MKT_TOPIC_LABELS[input.topic]} — ${
      availability === 'needs_verification' ? 'needs verification' : 'unavailable'
    }`,
    detail: input.reason ?? MKT_UNAVAILABLE_RATIONALE[input.topic],
    availability,
    confidence: 'insufficient',
    freshness: 'expired',
    trust: 'unregistered',
    direction: 'insufficient_evidence',
    measure: null,
    evidence: [],
    recordCount: 0,
    observedAt: null,
    status: 'draft',
    caveat: input.reason ?? MKT_UNAVAILABLE_RATIONALE[input.topic],
    invented: false,
  };
}

/**
 * Decides what an insight is worth once its evidence is known. An insight
 * whose sources are not registered is returned as needing verification rather
 * than being dropped, so the Owner can see what is missing.
 */
export function resolveMktInsightStanding(input: {
  evidence: MktEvidence[];
  recordCount: number;
  minRecords: number;
  requireRegisteredSource: boolean;
}): {
  availability: MktAvailability;
  confidence: MktConfidence;
  freshness: MktFreshness;
  trust: MktSourceTrust;
  caveat: string;
} {
  const trust = weakestMktTrust(input.evidence.map((item) => item.trust));
  const freshness = weakestMktFreshness(input.evidence.map((item) => item.freshness));
  const confidence = mktConfidenceFor({
    recordCount: input.recordCount,
    minRecords: input.minRecords,
    freshness,
    trust,
  });

  if (input.recordCount < input.minRecords) {
    return {
      availability: 'unavailable',
      confidence: 'insufficient',
      freshness,
      trust,
      caveat: `Backed by ${input.recordCount} real record(s), below the minimum of ${input.minRecords} the Owner set. Nothing is inferred from too little evidence.`,
    };
  }
  if (trust === 'unregistered' && input.requireRegisteredSource) {
    return {
      availability: 'needs_verification',
      confidence: 'low',
      freshness,
      trust,
      caveat:
        'At least one source behind this is not registered as a supported public source or connected provider. Register and verify the source before relying on it.',
    };
  }
  if (freshness === 'expired') {
    return {
      availability: 'partial',
      confidence,
      freshness,
      trust,
      caveat:
        'The newest evidence is far older than the freshness window the Owner set. Treat this as historical rather than current.',
    };
  }
  if (freshness === 'stale') {
    return {
      availability: 'partial',
      confidence,
      freshness,
      trust,
      caveat: 'The evidence is older than the freshness window the Owner set.',
    };
  }
  return { availability: 'available', confidence, freshness, trust, caveat: '' };
}

// ─── Measuring the company's own demand ───────────────────────────────────────

/** A trend needs at least this many periods before a direction is claimed. */
export const MKT_MIN_PERIODS_FOR_TREND = 3;

/** Seasonality needs a full year of the company's own records. */
export const MKT_MIN_MONTHS_FOR_SEASONALITY = 12;

export type MktPeriodPoint = {
  /** `YYYY-MM`, derived from a real row timestamp. */
  periodKey: string;
  count: number;
};

/**
 * Buckets real timestamps into months. Rows without a parseable date are
 * counted as skipped rather than silently dropped into a bucket.
 */
export function bucketMktMonthly(dates: string[]): { points: MktPeriodPoint[]; skipped: number } {
  const byMonth = new Map<string, number>();
  let skipped = 0;
  for (const value of dates) {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      skipped += 1;
      continue;
    }
    const date = new Date(parsed);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  const points = [...byMonth.entries()]
    .map(([periodKey, count]) => ({ periodKey, count }))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  return { points, skipped };
}

/**
 * Direction of a measured series. The most recent period is compared against
 * the mean of the periods before it, and a change under a tenth is reported as
 * steady rather than dressed up as a trend.
 */
export function summariseMktDirection(points: MktPeriodPoint[]): {
  direction: MktDirection;
  changePercent: number | null;
  basis: string;
} {
  if (points.length < MKT_MIN_PERIODS_FOR_TREND) {
    return {
      direction: 'insufficient_evidence',
      changePercent: null,
      basis: `${points.length} period(s) of real records — a direction needs at least ${MKT_MIN_PERIODS_FOR_TREND}.`,
    };
  }
  const ordered = [...points].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  const latest = ordered[ordered.length - 1];
  const earlier = ordered.slice(0, -1);
  if (!latest || earlier.length === 0) {
    return {
      direction: 'insufficient_evidence',
      changePercent: null,
      basis: 'No comparable earlier period.',
    };
  }
  const baseline = earlier.reduce((total, point) => total + point.count, 0) / earlier.length;
  if (baseline <= 0) {
    return {
      direction: 'insufficient_evidence',
      changePercent: null,
      basis: 'No activity in the earlier periods to compare against.',
    };
  }
  const changePercent = ((latest.count - baseline) / baseline) * 100;
  const basis = `${latest.count} in ${latest.periodKey} against an average of ${baseline.toFixed(1)} across the previous ${earlier.length} month(s).`;
  if (Math.abs(changePercent) < 10) return { direction: 'steady', changePercent, basis };
  return { direction: changePercent > 0 ? 'rising' : 'falling', changePercent, basis };
}

export type MktSeasonalMonth = {
  /** 1-12 */
  month: number;
  label: string;
  totalCount: number;
  yearsObserved: number;
  /** Share of the year's records that fell in this month, from real rows. */
  sharePercent: number;
};

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Seasonal shape from the company's own records. A month is only reported once
 * a full year of records exists, and a month with no records is reported as
 * zero observed rather than being interpolated.
 */
export function buildMktSeasonalProfile(points: MktPeriodPoint[]): {
  months: MktSeasonalMonth[];
  monthsObserved: number;
  sufficient: boolean;
  basis: string;
} {
  const totals = new Map<number, { count: number; years: Set<string> }>();
  let grandTotal = 0;
  for (const point of points) {
    const [year, month] = point.periodKey.split('-');
    const monthNumber = Number(month);
    if (!year || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) continue;
    const entry = totals.get(monthNumber) ?? { count: 0, years: new Set<string>() };
    entry.count += point.count;
    entry.years.add(year);
    totals.set(monthNumber, entry);
    grandTotal += point.count;
  }

  const monthsObserved = points.length;
  const months: MktSeasonalMonth[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const entry = totals.get(month);
    months.push({
      month,
      label: MONTH_LABELS[month - 1] ?? String(month),
      totalCount: entry?.count ?? 0,
      yearsObserved: entry?.years.size ?? 0,
      sharePercent: grandTotal > 0 ? ((entry?.count ?? 0) / grandTotal) * 100 : 0,
    });
  }

  const sufficient = monthsObserved >= MKT_MIN_MONTHS_FOR_SEASONALITY;
  return {
    months,
    monthsObserved,
    sufficient,
    basis: sufficient
      ? `${monthsObserved} month(s) of your own records across ${grandTotal} row(s).`
      : `${monthsObserved} month(s) of your own records — a seasonal pattern needs at least ${MKT_MIN_MONTHS_FOR_SEASONALITY}.`,
  };
}

export type MktGroupCount = {
  key: string;
  label: string;
  count: number;
  sharePercent: number;
};

/**
 * Counts real rows by a label, dropping blanks into an explicit unknown bucket
 * so a missing suburb is visible rather than being attributed to somewhere.
 */
export function countMktGroups(
  values: Array<string | null | undefined>,
  options: { unknownLabel: string; limit?: number },
): { groups: MktGroupCount[]; unknownCount: number; total: number } {
  const counts = new Map<string, { label: string; count: number }>();
  let unknownCount = 0;
  for (const raw of values) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
      unknownCount += 1;
      continue;
    }
    const key = trimmed.toLowerCase();
    const entry = counts.get(key) ?? { label: trimmed, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const total = values.length;
  const groups = [...counts.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      count: entry.count,
      sharePercent: total > 0 ? (entry.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, options.limit ?? 10);
  return { groups, unknownCount, total };
}

// ─── Pricing position (own rows only) ─────────────────────────────────────────

export type MktPriceBand = {
  label: string;
  /** Inclusive lower bound in cents. */
  fromCents: number;
  /** Exclusive upper bound in cents, or null for the open top band. */
  toCents: number | null;
  quoteCount: number;
  acceptedCount: number;
  declinedCount: number;
  /** Win rate across decided quotes only. Undecided quotes are not counted. */
  winRatePercent: number | null;
  decidedCount: number;
};

export const MKT_PRICE_BANDS: ReadonlyArray<{ label: string; fromCents: number; toCents: number | null }> =
  [
    { label: 'Under R2 500', fromCents: 0, toCents: 250_000 },
    { label: 'R2 500 – R10 000', fromCents: 250_000, toCents: 1_000_000 },
    { label: 'R10 000 – R50 000', fromCents: 1_000_000, toCents: 5_000_000 },
    { label: 'R50 000 – R250 000', fromCents: 5_000_000, toCents: 25_000_000 },
    { label: 'R250 000 and above', fromCents: 25_000_000, toCents: null },
  ] as const;

/**
 * Win rate by price band, measured from the company's own decided quotes.
 *
 * This is deliberately not a competitor comparison. It says how the market
 * responds to this company's own prices; it never claims what anyone else
 * charges. Quotes still open are excluded from the win rate rather than being
 * counted as losses.
 */
export function buildMktPriceBands(
  quotes: Array<{ totalCents: number; decided: 'accepted' | 'declined' | 'open' }>,
): MktPriceBand[] {
  return MKT_PRICE_BANDS.map((band) => {
    const inBand = quotes.filter(
      (quote) =>
        quote.totalCents >= band.fromCents &&
        (band.toCents === null || quote.totalCents < band.toCents),
    );
    const acceptedCount = inBand.filter((quote) => quote.decided === 'accepted').length;
    const declinedCount = inBand.filter((quote) => quote.decided === 'declined').length;
    const decidedCount = acceptedCount + declinedCount;
    return {
      label: band.label,
      fromCents: band.fromCents,
      toCents: band.toCents,
      quoteCount: inBand.length,
      acceptedCount,
      declinedCount,
      decidedCount,
      winRatePercent: decidedCount > 0 ? (acceptedCount / decidedCount) * 100 : null,
    };
  });
}

// ─── Owner settings ───────────────────────────────────────────────────────────

export type MktSettings = {
  id: string;
  /** Invariant: always false — this layer never acts on the business. */
  autoActionsEnabled: false;
  /** Invariant: always false — a market figure is never generated. */
  inventMarketDataEnabled: false;
  /** Invariant: always false — nothing is fetched or scraped from here. */
  externalFetchEnabled: false;
  /** How far back the company's own rows are read. */
  lookbackDays: number;
  /** How old an observation may be before it is called stale. */
  stalenessDays: number;
  /** Minimum real records before any claim is made. */
  minEvidenceRecords: number;
  /** Unregistered sources cannot back an insight while this is on. */
  requireRegisteredSource: boolean;
  /** Marketing users see approved insights only while this is on. */
  publishApprovedOnly: boolean;
  notes: string | null;
  updatedAt: string;
};

export const MKT_LOOKBACK_MIN_DAYS = 30;
export const MKT_LOOKBACK_MAX_DAYS = 730;
export const MKT_STALENESS_MIN_DAYS = 7;
export const MKT_STALENESS_MAX_DAYS = 365;
export const MKT_MIN_EVIDENCE_FLOOR = 1;
export const MKT_MIN_EVIDENCE_CEILING = 100;

export function defaultMktSettings(partial?: Partial<MktSettings>): MktSettings {
  return {
    id: partial?.id ?? 'pending',
    autoActionsEnabled: false,
    inventMarketDataEnabled: false,
    externalFetchEnabled: false,
    lookbackDays: partial?.lookbackDays ?? 365,
    stalenessDays: partial?.stalenessDays ?? 30,
    minEvidenceRecords: partial?.minEvidenceRecords ?? 5,
    requireRegisteredSource: partial?.requireRegisteredSource ?? true,
    publishApprovedOnly: partial?.publishApprovedOnly ?? true,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function isValidMktLookbackDays(days: number): boolean {
  return Number.isInteger(days) && days >= MKT_LOOKBACK_MIN_DAYS && days <= MKT_LOOKBACK_MAX_DAYS;
}

export function isValidMktStalenessDays(days: number): boolean {
  return Number.isInteger(days) && days >= MKT_STALENESS_MIN_DAYS && days <= MKT_STALENESS_MAX_DAYS;
}

export function isValidMktMinEvidence(records: number): boolean {
  return (
    Number.isInteger(records) &&
    records >= MKT_MIN_EVIDENCE_FLOOR &&
    records <= MKT_MIN_EVIDENCE_CEILING
  );
}

// ─── Visibility filtering ─────────────────────────────────────────────────────

export type MktWithheldInsight = {
  insightKey: string;
  topic: MktTopic;
  reason: 'topic_owner_only' | 'not_approved' | 'needs_verification' | 'archived' | 'rejected';
  explanation: string;
};

export const MKT_WITHHELD_EXPLANATIONS: Record<MktWithheldInsight['reason'], string> = {
  topic_owner_only:
    'Pricing, supplier cost and new-service strategy are Owner only, so this topic is not shown to other roles.',
  not_approved:
    'The Owner has not approved this insight for marketing users yet, so it is not shown outside the Owner view.',
  needs_verification:
    'At least one source behind this insight is not registered as a supported public source or connected provider.',
  archived: 'The Owner archived this insight.',
  rejected: 'The Owner rejected this insight, so it is not published to marketing users.',
};

export type MktVisibilityResult = {
  visible: MktInsight[];
  withheld: MktWithheldInsight[];
};

/**
 * Applies role and publication rules to a built set of insights.
 *
 * Nothing disappears silently: an insight held back is returned in `withheld`
 * with the reason. The Owner sees everything including drafts, because the
 * Owner is the person who decides what gets published.
 */
export function applyMktVisibility(
  insights: MktInsight[],
  input: {
    identity: { roleName?: string | null; permissions?: string[] | null };
    settings: MktSettings;
  },
): MktVisibilityResult {
  const scope = resolveMktAudienceScope(input.identity);
  const visible: MktInsight[] = [];
  const withheld: MktWithheldInsight[] = [];

  const hold = (insight: MktInsight, reason: MktWithheldInsight['reason']) => {
    withheld.push({
      insightKey: insight.insightKey,
      topic: insight.topic,
      reason,
      explanation: MKT_WITHHELD_EXPLANATIONS[reason],
    });
  };

  for (const insight of insights) {
    if (scope === 'denied') {
      hold(insight, 'topic_owner_only');
      continue;
    }
    if (!canViewMktTopic(input.identity, insight.topic)) {
      hold(insight, 'topic_owner_only');
      continue;
    }
    if (scope === 'owner_full') {
      visible.push(insight);
      continue;
    }
    // Marketing users see approved insights only, and never an insight whose
    // sources are still unverified.
    if (insight.status === 'archived') {
      hold(insight, 'archived');
      continue;
    }
    if (insight.status === 'rejected') {
      hold(insight, 'rejected');
      continue;
    }
    if (input.settings.publishApprovedOnly && insight.status !== 'approved') {
      hold(insight, 'not_approved');
      continue;
    }
    if (insight.availability === 'needs_verification') {
      hold(insight, 'needs_verification');
      continue;
    }
    visible.push(insight);
  }

  return { visible, withheld };
}

/** Facts first, then recommendations; strongest evidence first within each. */
const CONFIDENCE_RANK: Record<MktConfidence, number> = {
  high: 4,
  medium: 3,
  low: 2,
  insufficient: 1,
};

export function sortMktInsights(insights: MktInsight[]): MktInsight[] {
  return [...insights].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'fact' ? -1 : 1;
    if (CONFIDENCE_RANK[b.confidence] !== CONFIDENCE_RANK[a.confidence]) {
      return CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    }
    if (MKT_FRESHNESS_RANK[b.freshness] !== MKT_FRESHNESS_RANK[a.freshness]) {
      return MKT_FRESHNESS_RANK[b.freshness] - MKT_FRESHNESS_RANK[a.freshness];
    }
    return b.recordCount - a.recordCount;
  });
}

export function buildMktTopicCoverage(input: {
  topics: MktTopic[];
  insights: MktInsight[];
}): MktTopicCoverage[] {
  return input.topics.map((topic) => {
    const forTopic = input.insights.filter((insight) => insight.topic === topic);
    const recordCount = forTopic.reduce((total, insight) => total + insight.recordCount, 0);
    const usable = forTopic.filter(
      (insight) => insight.availability === 'available' || insight.availability === 'partial',
    );
    const needsVerification = forTopic.some(
      (insight) => insight.availability === 'needs_verification',
    );

    if (usable.length > 0) {
      return {
        topic,
        label: MKT_TOPIC_LABELS[topic],
        availability: usable.length === forTopic.length ? 'available' : 'partial',
        insightCount: forTopic.length,
        recordCount,
        rationale: '',
      };
    }
    if (needsVerification) {
      return {
        topic,
        label: MKT_TOPIC_LABELS[topic],
        availability: 'needs_verification',
        insightCount: forTopic.length,
        recordCount,
        rationale: MKT_WITHHELD_EXPLANATIONS.needs_verification,
      };
    }
    return {
      topic,
      label: MKT_TOPIC_LABELS[topic],
      availability: 'unavailable',
      insightCount: forTopic.length,
      recordCount,
      rationale: MKT_UNAVAILABLE_RATIONALE[topic],
    };
  });
}

// ─── Approval-gated recommendations ───────────────────────────────────────────

export type MktOpportunitySummary = {
  id: string;
  insightKey: string | null;
  topic: MktTopic | null;
  title: string;
  body: string;
  status: MktOpportunityStatus;
  confidence: MktConfidence;
  /** Invariant: always false — a recommendation never executes itself. */
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

/**
 * The sentence that makes the boundary explicit on every recommendation. It is
 * repeated in the body rather than only in the UI so it survives export, copy
 * and audit.
 */
export const MKT_RECOMMENDATION_BOUNDARY =
  'Recommendation only. Owner approval records a decision and never changes a price, starts or funds an advert, publishes content or contacts a customer.';

/**
 * Turns a real insight into a recommendation the Owner can approve. The body
 * always cites the evidence count and the sources, and restates the boundary,
 * so an approved recommendation cannot be mistaken for an executed action.
 */
export function buildMktOpportunityDraft(input: {
  topicLabel: string;
  headline: string;
  detail: string;
  recordCount: number;
  confidence: MktConfidence;
  sourceLabels: string[];
  observedAt: string | null;
}): { title: string; body: string } {
  const sources =
    input.sourceLabels.length > 0 ? input.sourceLabels.join(', ') : 'no registered source';
  return {
    title: `${input.topicLabel} — ${input.headline}`.slice(0, 200),
    body: [
      input.detail,
      '',
      `Based on ${input.recordCount} real record(s) from ${sources}${
        input.observedAt ? `, last observed ${input.observedAt}` : ''
      }. Confidence: ${input.confidence}. No competitor price, market share, demand figure or trend is invented.`,
      MKT_RECOMMENDATION_BOUNDARY,
    ].join('\n'),
  };
}

/** Only well-evidenced insights may become a recommendation. */
export function isMktOpportunityCandidate(insight: MktInsight): boolean {
  if (insight.kind !== 'fact') return false;
  if (insight.availability !== 'available') return false;
  if (insight.confidence !== 'high' && insight.confidence !== 'medium') return false;
  return insight.freshness === 'fresh' || insight.freshness === 'recent';
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export type MktEventKind =
  | 'settings_updated'
  | 'source_registered'
  | 'source_updated'
  | 'insight_approved'
  | 'insight_rejected'
  | 'insight_archived'
  | 'insight_reopened'
  | 'opportunity_created'
  | 'opportunity_decided'
  | 'opportunity_refreshed';

export type MktAuditEntry = {
  id: string;
  insightKey: string | null;
  kind: MktEventKind;
  actorUserId: string | null;
  notes: string | null;
  occurredAt: string;
};

// ─── Requests ─────────────────────────────────────────────────────────────────

export type UpdateMktSettingsRequest = {
  lookbackDays?: number;
  stalenessDays?: number;
  minEvidenceRecords?: number;
  requireRegisteredSource?: boolean;
  publishApprovedOnly?: boolean;
  notes?: string | null;
};

export type RegisterMktSourceRequest = {
  sourceKey: string;
  label: string;
  origin: MktEvidenceOrigin;
  /** The Owner attests this source is supported and lawfully accessible. */
  permitted: boolean;
  verified?: boolean;
  reference?: string | null;
  notes?: string | null;
};

export type UpdateMktSourceRequest = {
  label?: string;
  permitted?: boolean;
  verified?: boolean;
  reference?: string | null;
  notes?: string | null;
};

export type DecideMktInsightRequest = {
  decision: 'approve' | 'reject' | 'archive' | 'reopen';
  notes?: string;
};

export type CreateMktOpportunityRequest = {
  insightKey?: string | null;
  topic?: MktTopic | null;
  title: string;
  body: string;
  submitForApproval?: boolean;
};

export type DecideMktOpportunityRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export type MktDashboard = {
  summary: string;
  productClarification: {
    marketingSuite: string;
    thisLayer: string;
    noExternalActions: string;
  };
  policy: {
    autoActionsEnabled: false;
    inventMarketDataEnabled: false;
    externalFetchEnabled: false;
    approvalRequired: true;
    fakeBusinessData: false;
    financeSensitiveOwnerOnly: true;
  };
  scope: MktAudienceScope;
  scopeRationale: string;
  visibleTopics: MktTopic[];
  hiddenTopics: MktTopic[];
  insights: MktInsight[];
  withheld: MktWithheldInsight[];
  coverage: MktTopicCoverage[];
  sources: MktSourceSummary[];
  unregisteredSources: string[];
  settings: MktSettings;
  opportunities: MktOpportunitySummary[];
  pendingApprovals: number;
  connections: MktConnection[];
  totalEvidenceRecords: number;
  factCount: number;
  recommendationCount: number;
};

/**
 * A plain summary of what the evidence supports. When there is nothing behind
 * a topic the summary says so instead of reporting a confident zero.
 */
export function buildMktSummary(input: {
  factCount: number;
  recommendationCount: number;
  totalEvidenceRecords: number;
  needsVerificationCount: number;
  unavailableTopicCount: number;
  withheldCount: number;
}): string {
  if (input.totalEvidenceRecords === 0) {
    return 'No market evidence exists for this company yet — no captured market record, no connected search data and not enough of your own leads, quotes or jobs. Nothing is shown, and no competitor price, market share, demand figure or trend is invented.';
  }
  const parts = [
    `${input.factCount} measured fact(s)`,
    `${input.recommendationCount} AURA recommendation(s)`,
    `from ${input.totalEvidenceRecords} real record(s)`,
  ];
  if (input.needsVerificationCount > 0) {
    parts.push(`${input.needsVerificationCount} needing source verification`);
  }
  if (input.unavailableTopicCount > 0) {
    parts.push(`${input.unavailableTopicCount} topic(s) with no evidence yet`);
  }
  if (input.withheldCount > 0) {
    parts.push(`${input.withheldCount} held back with a stated reason`);
  }
  return `${parts.join(', ')}.`;
}
