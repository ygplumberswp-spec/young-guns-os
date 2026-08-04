import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyMktVisibility,
  bucketMktMonthly,
  buildMktOpportunityDraft,
  buildMktPriceBands,
  buildMktSeasonalProfile,
  buildMktSummary,
  buildMktTopicCoverage,
  buildMktUnavailableInsight,
  canAccessMarketIntelligence,
  canApproveMktOpportunity,
  canManageMktSettings,
  canManageMktSources,
  canPublishMktInsight,
  canViewMktTopic,
  classifyMktRecordType,
  countMktGroups,
  defaultMktSettings,
  isMktOpportunityCandidate,
  isValidMktLookbackDays,
  isValidMktMinEvidence,
  isValidMktStalenessDays,
  listVisibleMktTopics,
  MKT_MIN_MONTHS_FOR_SEASONALITY,
  MKT_MIN_PERIODS_FOR_TREND,
  MKT_OWNER_ONLY_TOPICS,
  MKT_PRODUCT_COPY,
  MKT_RECOMMENDATION_BOUNDARY,
  MKT_TOPICS,
  mktAgeDays,
  mktConfidenceFor,
  mktConfidenceFromScore,
  mktFreshnessFor,
  mktSourceTrust,
  normaliseMktSourceKey,
  resolveMktAudienceScope,
  resolveMktInsightStanding,
  sortMktInsights,
  summariseMktDirection,
  weakestMktFreshness,
  weakestMktTrust,
  type MktEvidence,
  type MktInsight,
} from './market-intelligence.js';

const NOW = new Date('2026-08-03T12:00:00.000Z');

const OWNER = { roleName: 'Company Owner', permissions: ['*'] };
const PLATFORM_OWNER = { roleName: 'Platform Owner', permissions: ['*'] };
const MARKETER = { roleName: 'Marketing', permissions: ['marketing:read'] };
const ADMIN_WILDCARD = { roleName: 'Admin', permissions: ['*'] };
const TECHNICIAN = { roleName: 'Technician', permissions: ['*'] };
const CLIENT = { roleName: 'Client', permissions: ['*'] };

function evidence(partial: Partial<MktEvidence> = {}): MktEvidence {
  return {
    origin: 'own_records',
    sourceKey: 'internal:leads',
    sourceLabel: 'Your lead records',
    trust: 'verified',
    observedAt: NOW.toISOString(),
    ageDays: 0,
    freshness: 'fresh',
    recordCount: 10,
    detail: '10 real lead rows',
    reference: null,
    ...partial,
  };
}

function insight(partial: Partial<MktInsight> & { insightKey: string }): MktInsight {
  return {
    topic: 'demand_trend',
    topicLabel: 'Demand trends',
    kind: 'fact',
    headline: 'Enquiries rising',
    detail: 'Detail',
    availability: 'available',
    confidence: 'high',
    freshness: 'fresh',
    trust: 'verified',
    direction: 'rising',
    measure: null,
    evidence: [evidence()],
    recordCount: 10,
    observedAt: NOW.toISOString(),
    status: 'draft',
    caveat: '',
    invented: false,
    ...partial,
  };
}

describe('market intelligence access', () => {
  it('denies technicians and clients by role before any permission is read', () => {
    assert.equal(resolveMktAudienceScope(TECHNICIAN), 'denied');
    assert.equal(resolveMktAudienceScope(CLIENT), 'denied');
    assert.equal(canAccessMarketIntelligence(TECHNICIAN), false);
    assert.equal(canAccessMarketIntelligence(CLIENT), false);
    // A wildcard permission must not open market strategy to them.
    for (const topic of MKT_TOPICS) {
      assert.equal(canViewMktTopic(TECHNICIAN, topic), false, topic);
      assert.equal(canViewMktTopic(CLIENT, topic), false, topic);
    }
  });

  it('gives the Owner the full view and marketing users the approved-only view', () => {
    assert.equal(resolveMktAudienceScope(OWNER), 'owner_full');
    assert.equal(resolveMktAudienceScope(PLATFORM_OWNER), 'owner_full');
    assert.equal(resolveMktAudienceScope(MARKETER), 'marketing_approved_only');
    assert.equal(resolveMktAudienceScope(ADMIN_WILDCARD), 'marketing_approved_only');
  });

  it('denies a signed-in role with no marketing permission at all', () => {
    assert.equal(resolveMktAudienceScope({ roleName: 'Office', permissions: ['jobs:read'] }), 'denied');
    assert.equal(resolveMktAudienceScope({ roleName: '', permissions: ['*'] }), 'denied');
  });

  it('keeps pricing, supplier cost and strategy topics Owner only', () => {
    for (const topic of MKT_OWNER_ONLY_TOPICS) {
      assert.equal(canViewMktTopic(OWNER, topic), true, topic);
      // A wildcard permission on a non-Owner account must not reveal them.
      assert.equal(canViewMktTopic(ADMIN_WILDCARD, topic), false, topic);
      assert.equal(canViewMktTopic(MARKETER, topic), false, topic);
    }
    const marketerTopics = listVisibleMktTopics(MARKETER);
    assert.equal(marketerTopics.includes('pricing_position'), false);
    assert.equal(marketerTopics.includes('supplier_product_signal'), false);
    assert.equal(marketerTopics.includes('new_service_opportunity'), false);
    assert.equal(marketerTopics.includes('competitor_activity'), true);
    assert.equal(listVisibleMktTopics(OWNER).length, MKT_TOPICS.length);
    assert.equal(listVisibleMktTopics(TECHNICIAN).length, 0);
  });

  it('reserves settings, source registration, publishing and approval for the Owner', () => {
    for (const check of [
      canManageMktSettings,
      canManageMktSources,
      canPublishMktInsight,
      canApproveMktOpportunity,
    ]) {
      assert.equal(check(OWNER), true);
      assert.equal(check(PLATFORM_OWNER), true);
      assert.equal(check(ADMIN_WILDCARD), false);
      assert.equal(check(MARKETER), false);
      assert.equal(check(TECHNICIAN), false);
    }
  });
});

describe('market intelligence freshness and confidence', () => {
  it('ages an observation against the Owner-set window', () => {
    assert.equal(mktAgeDays(new Date('2026-08-01T12:00:00.000Z').toISOString(), NOW), 2);
    assert.equal(mktAgeDays('not-a-date', NOW), Number.POSITIVE_INFINITY);
    assert.equal(mktFreshnessFor(2, 30), 'fresh');
    assert.equal(mktFreshnessFor(20, 30), 'recent');
    assert.equal(mktFreshnessFor(60, 30), 'stale');
    assert.equal(mktFreshnessFor(200, 30), 'expired');
    assert.equal(mktFreshnessFor(Number.POSITIVE_INFINITY, 30), 'expired');
  });

  it('never reports confidence without enough real records', () => {
    assert.equal(
      mktConfidenceFor({ recordCount: 0, minRecords: 5, freshness: 'fresh', trust: 'verified' }),
      'insufficient',
    );
    assert.equal(
      mktConfidenceFor({ recordCount: 4, minRecords: 5, freshness: 'fresh', trust: 'verified' }),
      'insufficient',
    );
    assert.equal(
      mktConfidenceFor({ recordCount: 50, minRecords: 5, freshness: 'fresh', trust: 'verified' }),
      'high',
    );
    // An unregistered source can never rise above low confidence.
    assert.equal(
      mktConfidenceFor({ recordCount: 500, minRecords: 5, freshness: 'fresh', trust: 'unregistered' }),
      'low',
    );
    assert.equal(
      mktConfidenceFor({ recordCount: 50, minRecords: 5, freshness: 'stale', trust: 'verified' }),
      'medium',
    );
  });

  it('lets the weakest evidence decide the standing of the whole insight', () => {
    assert.equal(weakestMktTrust(['verified', 'registered']), 'registered');
    assert.equal(weakestMktTrust(['verified', 'unregistered']), 'unregistered');
    assert.equal(weakestMktTrust([]), 'unregistered');
    assert.equal(weakestMktFreshness(['fresh', 'stale']), 'stale');
    assert.equal(weakestMktFreshness([]), 'expired');
  });

  it('marks an unregistered source as needing verification rather than trusting it', () => {
    const standing = resolveMktInsightStanding({
      evidence: [evidence({ trust: 'unregistered' })],
      recordCount: 20,
      minRecords: 5,
      requireRegisteredSource: true,
    });
    assert.equal(standing.availability, 'needs_verification');
    assert.equal(standing.confidence, 'low');
    assert.ok(standing.caveat.includes('not registered'));
  });

  it('reports too little evidence as unavailable rather than rounding up', () => {
    const standing = resolveMktInsightStanding({
      evidence: [evidence()],
      recordCount: 2,
      minRecords: 5,
      requireRegisteredSource: true,
    });
    assert.equal(standing.availability, 'unavailable');
    assert.equal(standing.confidence, 'insufficient');
    assert.ok(standing.caveat.includes('below the minimum'));
  });

  it('downgrades stale and expired evidence to partial with a stated caveat', () => {
    const stale = resolveMktInsightStanding({
      evidence: [evidence({ freshness: 'stale' })],
      recordCount: 20,
      minRecords: 5,
      requireRegisteredSource: true,
    });
    assert.equal(stale.availability, 'partial');
    assert.ok(stale.caveat.includes('older than the freshness window'));

    const expired = resolveMktInsightStanding({
      evidence: [evidence({ freshness: 'expired' })],
      recordCount: 20,
      minRecords: 5,
      requireRegisteredSource: true,
    });
    assert.equal(expired.availability, 'partial');
    assert.ok(expired.caveat.includes('historical'));
  });

  it('classifies a captured record by its type only, never by guessing at prose', () => {
    assert.equal(classifyMktRecordType('competitor_pricing'), 'competitor_activity');
    assert.equal(classifyMktRecordType('industry_report'), 'industry_trend');
    assert.equal(classifyMktRecordType('price_survey'), 'pricing_position');
    assert.equal(classifyMktRecordType('seasonal_pattern'), 'seasonal_demand');
    assert.equal(classifyMktRecordType('supplier_movement'), 'supplier_product_signal');
    // An unrecognised type is reported as unclassified, not filed somewhere plausible.
    assert.equal(classifyMktRecordType('something_else'), null);
    assert.equal(classifyMktRecordType(''), null);
    assert.equal(classifyMktRecordType(null), null);
  });

  it('never assumes a record without a captured score is confident', () => {
    assert.equal(mktConfidenceFromScore(null), 'insufficient');
    assert.equal(mktConfidenceFromScore(undefined), 'insufficient');
    assert.equal(mktConfidenceFromScore(0), 'insufficient');
    assert.equal(mktConfidenceFromScore(30), 'low');
    assert.equal(mktConfidenceFromScore(60), 'medium');
    assert.equal(mktConfidenceFromScore(90), 'high');
  });

  it('grades a source only once the Owner has registered it', () => {
    assert.equal(mktSourceTrust({ permitted: false, verified: true }), 'unregistered');
    assert.equal(mktSourceTrust({ permitted: true, verified: false }), 'registered');
    assert.equal(mktSourceTrust({ permitted: true, verified: true }), 'verified');
    assert.equal(normaliseMktSourceKey('https://Example.co.za/Prices'), 'example-co-za-prices');
    assert.equal(normaliseMktSourceKey(null), '');
  });
});

describe('market intelligence measurement from real rows', () => {
  it('buckets real timestamps by month and counts what it could not parse', () => {
    const { points, skipped } = bucketMktMonthly([
      '2026-01-05T00:00:00.000Z',
      '2026-01-20T00:00:00.000Z',
      '2026-02-02T00:00:00.000Z',
      'nonsense',
    ]);
    assert.deepEqual(points, [
      { periodKey: '2026-01', count: 2 },
      { periodKey: '2026-02', count: 1 },
    ]);
    assert.equal(skipped, 1);
  });

  it('refuses a direction without enough periods', () => {
    const result = summariseMktDirection([
      { periodKey: '2026-01', count: 10 },
      { periodKey: '2026-02', count: 40 },
    ]);
    assert.equal(result.direction, 'insufficient_evidence');
    assert.equal(result.changePercent, null);
    assert.ok(result.basis.includes(String(MKT_MIN_PERIODS_FOR_TREND)));
  });

  it('calls a small movement steady rather than dressing it as a trend', () => {
    const result = summariseMktDirection([
      { periodKey: '2026-01', count: 10 },
      { periodKey: '2026-02', count: 10 },
      { periodKey: '2026-03', count: 10 },
      { periodKey: '2026-04', count: 10 },
    ]);
    assert.equal(result.direction, 'steady');
  });

  it('reports rising and falling only against the measured baseline', () => {
    const rising = summariseMktDirection([
      { periodKey: '2026-01', count: 10 },
      { periodKey: '2026-02', count: 10 },
      { periodKey: '2026-03', count: 30 },
    ]);
    assert.equal(rising.direction, 'rising');
    assert.ok((rising.changePercent ?? 0) > 100);

    const falling = summariseMktDirection([
      { periodKey: '2026-01', count: 20 },
      { periodKey: '2026-02', count: 20 },
      { periodKey: '2026-03', count: 2 },
    ]);
    assert.equal(falling.direction, 'falling');
  });

  it('will not claim a season without a full year of real records', () => {
    const short = buildMktSeasonalProfile([
      { periodKey: '2026-01', count: 5 },
      { periodKey: '2026-02', count: 8 },
    ]);
    assert.equal(short.sufficient, false);
    assert.ok(short.basis.includes(String(MKT_MIN_MONTHS_FOR_SEASONALITY)));

    const full = buildMktSeasonalProfile(
      Array.from({ length: 12 }, (_, index) => ({
        periodKey: `2025-${String(index + 1).padStart(2, '0')}`,
        count: index + 1,
      })),
    );
    assert.equal(full.sufficient, true);
    assert.equal(full.months.length, 12);
    assert.equal(full.months[11]?.totalCount, 12);
    assert.equal(full.months[11]?.yearsObserved, 1);
  });

  it('keeps rows with no area in an explicit unknown bucket', () => {
    const { groups, unknownCount, total } = countMktGroups(
      ['Sandton', 'sandton', 'Randburg', '', null],
      { unknownLabel: 'Not recorded' },
    );
    assert.equal(total, 5);
    assert.equal(unknownCount, 2);
    assert.equal(groups[0]?.label, 'Sandton');
    assert.equal(groups[0]?.count, 2);
    assert.equal(groups[1]?.count, 1);
  });

  it('measures win rate from own decided quotes and never from a competitor price', () => {
    const bands = buildMktPriceBands([
      { totalCents: 100_000, decided: 'accepted' },
      { totalCents: 150_000, decided: 'declined' },
      { totalCents: 200_000, decided: 'open' },
      { totalCents: 2_000_000, decided: 'accepted' },
    ]);
    const first = bands[0];
    assert.ok(first);
    assert.equal(first.quoteCount, 3);
    assert.equal(first.decidedCount, 2);
    assert.equal(first.winRatePercent, 50);

    // A band with no decided quote reports null, not a zero win rate.
    const empty = bands[bands.length - 1];
    assert.ok(empty);
    assert.equal(empty.quoteCount, 0);
    assert.equal(empty.winRatePercent, null);
  });
});

describe('market intelligence honesty', () => {
  it('returns an explicit unavailable insight for every topic with no evidence', () => {
    for (const topic of MKT_TOPICS) {
      const empty = buildMktUnavailableInsight({ topic });
      assert.equal(empty.availability, 'unavailable');
      assert.equal(empty.confidence, 'insufficient');
      assert.equal(empty.recordCount, 0);
      assert.equal(empty.measure, null);
      assert.equal(empty.invented, false);
      assert.ok(empty.detail.includes('invented'));
    }
  });

  it('reports coverage per topic without turning silence into a clean result', () => {
    const coverage = buildMktTopicCoverage({
      topics: ['demand_trend', 'competitor_activity', 'search_trend'],
      insights: [
        insight({ insightKey: 'demand:1', topic: 'demand_trend' }),
        insight({
          insightKey: 'competitor:1',
          topic: 'competitor_activity',
          availability: 'needs_verification',
        }),
      ],
    });
    assert.equal(coverage[0]?.availability, 'available');
    assert.equal(coverage[1]?.availability, 'needs_verification');
    assert.equal(coverage[2]?.availability, 'unavailable');
    assert.ok(coverage[2]?.rationale.includes('invented'));
  });

  it('says there is no evidence rather than reporting a confident zero', () => {
    const summary = buildMktSummary({
      factCount: 0,
      recommendationCount: 0,
      totalEvidenceRecords: 0,
      needsVerificationCount: 0,
      unavailableTopicCount: 10,
      withheldCount: 0,
    });
    assert.ok(summary.includes('No market evidence exists'));
    assert.ok(summary.includes('invented'));
  });

  it('states that the marketing suite is not being rebuilt and nothing is fetched', () => {
    assert.ok(MKT_PRODUCT_COPY.marketingSuite.includes('rather than rebuilding the suite'));
    assert.ok(MKT_PRODUCT_COPY.noExternalActions.includes('never'));
    assert.ok(MKT_PRODUCT_COPY.thisLayer.includes('never invented'));
  });

  it('orders facts ahead of recommendations and strong evidence ahead of weak', () => {
    const sorted = sortMktInsights([
      insight({ insightKey: 'rec', kind: 'aura_recommendation', confidence: 'high' }),
      insight({ insightKey: 'weak-fact', confidence: 'low' }),
      insight({ insightKey: 'strong-fact', confidence: 'high' }),
    ]);
    assert.deepEqual(
      sorted.map((entry) => entry.insightKey),
      ['strong-fact', 'weak-fact', 'rec'],
    );
  });
});

describe('market intelligence visibility', () => {
  const settings = defaultMktSettings();

  it('shows the Owner drafts as well as approved insights', () => {
    const { visible, withheld } = applyMktVisibility(
      [
        insight({ insightKey: 'a', status: 'draft' }),
        insight({ insightKey: 'b', topic: 'pricing_position', status: 'draft' }),
      ],
      { identity: OWNER, settings },
    );
    assert.equal(visible.length, 2);
    assert.equal(withheld.length, 0);
  });

  it('shows a marketing user approved insights only, each holdback explained', () => {
    const { visible, withheld } = applyMktVisibility(
      [
        insight({ insightKey: 'approved', status: 'approved' }),
        insight({ insightKey: 'draft', status: 'draft' }),
        insight({ insightKey: 'rejected', status: 'rejected' }),
        insight({ insightKey: 'archived', status: 'archived' }),
        insight({ insightKey: 'pricing', topic: 'pricing_position', status: 'approved' }),
        insight({
          insightKey: 'unverified',
          status: 'approved',
          availability: 'needs_verification',
        }),
      ],
      { identity: MARKETER, settings },
    );
    assert.deepEqual(
      visible.map((entry) => entry.insightKey),
      ['approved'],
    );
    const reasons = new Map(withheld.map((entry) => [entry.insightKey, entry.reason]));
    assert.equal(reasons.get('draft'), 'not_approved');
    assert.equal(reasons.get('rejected'), 'rejected');
    assert.equal(reasons.get('archived'), 'archived');
    assert.equal(reasons.get('pricing'), 'topic_owner_only');
    assert.equal(reasons.get('unverified'), 'needs_verification');
    // Nothing disappears without an explanation.
    assert.ok(withheld.every((entry) => entry.explanation.length > 0));
  });

  it('withholds everything from a denied role', () => {
    const { visible, withheld } = applyMktVisibility([insight({ insightKey: 'a' })], {
      identity: TECHNICIAN,
      settings,
    });
    assert.equal(visible.length, 0);
    assert.equal(withheld.length, 1);
  });
});

describe('market intelligence recommendations', () => {
  it('only drafts a recommendation from a well-evidenced current fact', () => {
    assert.equal(isMktOpportunityCandidate(insight({ insightKey: 'a' })), true);
    assert.equal(
      isMktOpportunityCandidate(insight({ insightKey: 'b', kind: 'aura_recommendation' })),
      false,
    );
    assert.equal(
      isMktOpportunityCandidate(insight({ insightKey: 'c', availability: 'needs_verification' })),
      false,
    );
    assert.equal(
      isMktOpportunityCandidate(insight({ insightKey: 'd', confidence: 'insufficient' })),
      false,
    );
    assert.equal(isMktOpportunityCandidate(insight({ insightKey: 'e', freshness: 'stale' })), false);
  });

  it('restates the boundary and cites the evidence on every recommendation', () => {
    const draft = buildMktOpportunityDraft({
      topicLabel: 'Search trends',
      headline: 'Geyser repair searches rising in Randburg',
      detail: 'Detail from real rows.',
      recordCount: 42,
      confidence: 'high',
      sourceLabels: ['Connected search keyword data'],
      observedAt: '2026-08-01',
    });
    assert.ok(draft.title.startsWith('Search trends —'));
    assert.ok(draft.body.includes('42 real record(s)'));
    assert.ok(draft.body.includes('Connected search keyword data'));
    assert.ok(draft.body.includes('Confidence: high'));
    assert.ok(draft.body.includes(MKT_RECOMMENDATION_BOUNDARY));
    // The dangerous actions are ruled out in the text itself.
    assert.ok(draft.body.includes('never changes a price'));
    assert.ok(draft.body.includes('publishes content'));
  });
});

describe('market intelligence settings', () => {
  it('defaults to safe, honest settings with the invariants off', () => {
    const settings = defaultMktSettings();
    assert.equal(settings.autoActionsEnabled, false);
    assert.equal(settings.inventMarketDataEnabled, false);
    assert.equal(settings.externalFetchEnabled, false);
    assert.equal(settings.requireRegisteredSource, true);
    assert.equal(settings.publishApprovedOnly, true);
    assert.ok(settings.minEvidenceRecords >= 1);
  });

  it('bounds the Owner controls so a window cannot be made meaningless', () => {
    assert.equal(isValidMktLookbackDays(365), true);
    assert.equal(isValidMktLookbackDays(10), false);
    assert.equal(isValidMktLookbackDays(5000), false);
    assert.equal(isValidMktStalenessDays(30), true);
    assert.equal(isValidMktStalenessDays(1), false);
    assert.equal(isValidMktMinEvidence(5), true);
    assert.equal(isValidMktMinEvidence(0), false);
    assert.equal(isValidMktMinEvidence(1000), false);
  });
});
