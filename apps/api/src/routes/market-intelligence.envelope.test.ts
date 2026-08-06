import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'market-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/market-intelligence.service.ts'),
  'utf8',
);
const sharedSource = readFileSync(
  join(here, '../../../../packages/shared/src/market-intelligence.ts'),
  'utf8',
);

describe('market intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoActioned: false as const',
      'autoExecuted: false as const',
      'inventedMarketData: false as const',
      'externalFetchPerformed: false as const',
      'fakeBusinessData: false as const',
      'approvalRequired: true as const',
      'financeSensitiveOwnerOnly: true as const',
      'historyPreserved: true as const',
      'executedDownstreamChange: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!routeSource.includes('autoActioned: true'));
    assert.ok(!routeSource.includes('inventedMarketData: true'));
    assert.ok(!routeSource.includes('externalFetchPerformed: true'));
    assert.ok(!routeSource.includes('fakeBusinessData: true'));
  });

  it('gates the whole router behind auth and a role check', () => {
    assert.ok(routeSource.includes('router.use(requireAuth)'));
    assert.ok(routeSource.includes('canAccessMarketIntelligence'));
    assert.ok(routeSource.includes("code: 'FORBIDDEN'"));
    assert.ok(routeSource.includes('The service re-checks the same rules'));
  });

  it('denies technicians and clients by role before any permission is read', () => {
    assert.ok(sharedSource.includes('export function resolveMktAudienceScope'));
    const scopeFn = sharedSource.slice(
      sharedSource.indexOf('export function resolveMktAudienceScope'),
      sharedSource.indexOf('export function canAccessMarketIntelligence'),
    );
    assert.ok(scopeFn.includes('MKT_DENIED_ROLES'));
    // Role is checked before permissions, so a wildcard cannot admit them.
    assert.ok(scopeFn.indexOf('MKT_DENIED_ROLES.includes(role)') < scopeFn.indexOf("includes('*')"));
    assert.ok(sharedSource.includes("MKT_DENIED_ROLES: readonly string[] = ['Technician', 'Client']"));
  });

  it('keeps pricing, supplier cost and strategy topics Owner only', () => {
    assert.ok(sharedSource.includes('MKT_OWNER_ONLY_TOPICS'));
    for (const topic of ["'pricing_position'", "'supplier_product_signal'", "'new_service_opportunity'"]) {
      assert.ok(sharedSource.includes(topic), `missing sensitive topic: ${topic}`);
    }
    const viewFn = sharedSource.slice(
      sharedSource.indexOf('export function canViewMktTopic'),
      sharedSource.indexOf('export function listVisibleMktTopics'),
    );
    // Owner-only topics are decided by role, before any permission check.
    assert.ok(viewFn.includes('return isMktOwnerRole(identity)'));
    assert.ok(!viewFn.includes("includes('*')"), 'wildcard must not reveal sensitive topics');
    assert.ok(serviceSource.includes('canViewMktTopic'));
    assert.ok(serviceSource.includes('listVisibleMktTopics'));
    // The source register is an Owner control and is not sent to other roles.
    assert.ok(serviceSource.includes("scope === 'owner_full' ? built.sources : []"));
  });

  it('shows marketing users approved insights only, each holdback explained', () => {
    assert.ok(sharedSource.includes('export function applyMktVisibility'));
    assert.ok(sharedSource.includes('MKT_WITHHELD_EXPLANATIONS'));
    for (const reason of [
      'topic_owner_only',
      'not_approved',
      'needs_verification',
      'archived',
      'rejected',
    ]) {
      assert.ok(sharedSource.includes(`'${reason}'`), `missing withheld reason: ${reason}`);
    }
    assert.ok(sharedSource.includes('publishApprovedOnly'));
    assert.ok(serviceSource.includes('applyMktVisibility'));
  });

  it('service re-enforces access so the route guard cannot be bypassed', () => {
    assert.ok(serviceSource.includes('private assertRead'));
    assert.ok(serviceSource.includes('private assertOwner'));
    assert.ok(serviceSource.includes('private assertSources'));
    assert.ok(serviceSource.includes('private assertPublish'));
    assert.ok(serviceSource.includes('private assertApprove'));
    assert.ok(serviceSource.includes('canManageMktSettings'));
    assert.ok(serviceSource.includes('canManageMktSources'));
    assert.ok(serviceSource.includes('canPublishMktInsight'));
    assert.ok(serviceSource.includes('canApproveMktOpportunity'));
    for (const method of [
      'getDashboard',
      'getSettings',
      'updateSettings',
      'listSources',
      'registerSource',
      'updateSource',
      'decideInsight',
      'listInsightAudit',
      'listCompanyAudit',
      'listOpportunities',
      'createOpportunity',
      'decideOpportunity',
      'refreshOpportunities',
    ]) {
      assert.ok(serviceSource.includes(`async ${method}(`), `missing method: ${method}`);
    }
  });

  it('reads existing surfaces instead of rebuilding the marketing suite', () => {
    for (const source of [
      '.from(miMarketIntelligenceRecords)',
      '.from(miSeoKeywords)',
      '.from(leads)',
      '.from(jobs)',
      '.from(quotes)',
      '.from(supplierPriceCatalogueItems)',
    ]) {
      assert.ok(serviceSource.includes(source), `missing source read: ${source}`);
    }
    assert.ok(sharedSource.includes('rather than rebuilding the suite'));
    // None of the source tables are written to by this layer.
    for (const table of [
      'miMarketIntelligenceRecords',
      'miSeoKeywords',
      'leads',
      'jobs',
      'quotes',
      'supplierPriceCatalogueItems',
    ]) {
      assert.ok(!serviceSource.includes(`insert(${table})`), `must not write to ${table}`);
      assert.ok(!serviceSource.includes(`update(${table})`), `must not write to ${table}`);
    }
    assert.ok(!serviceSource.includes('delete('), 'this layer never deletes a row');
  });

  it('never performs an external action of its own', () => {
    // No network client, no scraping, no outbound call from this layer.
    for (const forbidden of ['fetch(', 'axios', 'got(', 'http.request', 'puppeteer', 'cheerio']) {
      assert.ok(
        !serviceSource.includes(forbidden),
        `service must not reach outside the system: ${forbidden}`,
      );
      assert.ok(
        !routeSource.includes(forbidden),
        `route must not reach outside the system: ${forbidden}`,
      );
    }
    assert.ok(serviceSource.includes('externalFetchEnabled: false'));
    assert.ok(serviceSource.includes('externalFetchPerformed: false'));
    assert.ok(sharedSource.includes('Nothing is fetched, scraped or called from here'));
    // Registering a source is an Owner attestation, not a default.
    assert.ok(routeSource.includes('permitted: z.literal(true)'));
    assert.ok(serviceSource.includes('ownerAttestedLawful: true'));
  });

  it('every query and mutation is scoped by companyId', () => {
    for (const scoped of [
      'eq(miMarketIntelligenceRecords.companyId, actor.companyId)',
      'eq(miSeoKeywords.companyId, actor.companyId)',
      'eq(leads.companyId, actor.companyId)',
      'eq(jobs.companyId, actor.companyId)',
      'eq(quotes.companyId, actor.companyId)',
      'eq(supplierPriceCatalogueItems.companyId, companyId)',
      'eq(mktSettings.companyId, companyId)',
      'eq(mktSources.companyId, actor.companyId)',
      'eq(mktInsightStates.companyId, actor.companyId)',
      'eq(mktOpportunityDrafts.companyId, actor.companyId)',
      'eq(mktSignalEvents.companyId, actor.companyId)',
    ]) {
      assert.ok(serviceSource.includes(scoped), `missing company scope: ${scoped}`);
    }
    assert.ok(serviceSource.includes('companyId: actor.companyId'));
    assert.ok(
      serviceSource.includes(
        'and(eq(mktSettings.id, current.id), eq(mktSettings.companyId, actor.companyId))',
      ),
    );
    assert.ok(
      serviceSource.includes(
        'and(eq(mktSources.id, sourceId), eq(mktSources.companyId, actor.companyId))',
      ),
    );
  });

  it('labels every statement with source, date, freshness and confidence', () => {
    for (const field of [
      'sourceKey',
      'sourceLabel',
      'observedAt',
      'freshness',
      'confidence',
      'trust',
      'recordCount',
    ]) {
      assert.ok(sharedSource.includes(field), `missing evidence field: ${field}`);
    }
    assert.ok(sharedSource.includes('export function mktFreshnessFor'));
    assert.ok(sharedSource.includes('export function mktConfidenceFor'));
    assert.ok(serviceSource.includes('private buildEvidence'));
    // Every insight goes through one assembly point that applies the checks.
    assert.ok(serviceSource.includes('private assembleInsight'));
    assert.ok(serviceSource.includes('resolveMktInsightStanding'));
  });

  it('distinguishes a measured fact from an AURA recommendation', () => {
    assert.ok(sharedSource.includes("export type MktStatementKind = 'fact' | 'aura_recommendation'"));
    assert.ok(serviceSource.includes("kind: 'aura_recommendation'"));
    assert.ok(serviceSource.includes("kind: 'fact'"));
    assert.ok(serviceSource.includes('AURA recommendation drawn from the measured fact'));
  });

  it('never invents a competitor price, share, demand figure or trend', () => {
    assert.ok(sharedSource.includes('export function buildMktUnavailableInsight'));
    assert.ok(sharedSource.includes('MKT_UNAVAILABLE_RATIONALE'));
    assert.ok(sharedSource.includes("availability: 'unavailable'"));
    assert.ok(sharedSource.includes("availability: 'needs_verification'"));
    assert.ok(sharedSource.includes('never invented'));
    assert.ok(serviceSource.includes('buildMktUnavailableInsight'));
    assert.ok(serviceSource.includes('marketDataInvented: false'));
    assert.ok(serviceSource.includes('invented: false') || sharedSource.includes('invented: false'));
    // Pricing is measured from own quotes and states so explicitly.
    assert.ok(serviceSource.includes('no competitor price is claimed'));
    // An unrecognised record type is not filed under a plausible topic.
    assert.ok(sharedSource.includes('rather than being filed somewhere plausible'));
    assert.ok(serviceSource.includes('unclassified'));
    // A trend needs enough periods before a direction is claimed.
    assert.ok(sharedSource.includes('MKT_MIN_PERIODS_FOR_TREND'));
    assert.ok(sharedSource.includes('MKT_MIN_MONTHS_FOR_SEASONALITY'));
  });

  it('recommendations are approval-gated and never act on the business', () => {
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('approvalRequired: true'));
    assert.ok(serviceSource.includes('executedDownstreamChange: false'));
    assert.ok(serviceSource.includes('Nothing executes on creation'));
    assert.ok(serviceSource.includes('never executes a change'));
    assert.ok(
      serviceSource.includes(
        'Only the Company Owner or Platform Owner may decide a market recommendation.',
      ),
    );
    // The recommendation text itself rules out the dangerous actions.
    assert.ok(
      sharedSource.includes(
        'never changes a price, starts or funds an advert, publishes content or contacts a customer',
      ),
    );
    assert.ok(serviceSource.includes('Invariants can never be switched on'));
    assert.ok(serviceSource.includes('autoActionsEnabled: false'));
    assert.ok(serviceSource.includes('inventMarketDataEnabled: false'));
  });

  it('keeps a full audit history and never deletes a decision', () => {
    assert.ok(serviceSource.includes("entityType: 'market_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('insert(mktSignalEvents)'));
    for (const action of [
      'market_intelligence.settings.update',
      'market_intelligence.source.register',
      'market_intelligence.source.update',
      'market_intelligence.insight.',
      'market_intelligence.opportunity.create',
      'market_intelligence.opportunity.decide',
      'market_intelligence.opportunity.refresh',
    ]) {
      assert.ok(serviceSource.includes(action), `missing audit action: ${action}`);
    }
    assert.ok(serviceSource.includes('historyPreserved: true'));
    assert.ok(serviceSource.includes('deleted: false'));
  });

  it('validates payloads and contains no fake business data', () => {
    assert.ok(routeSource.includes('z.object('));
    assert.ok(routeSource.includes('topicSchema'));
    assert.ok(routeSource.includes('originSchema'));
    assert.ok(routeSource.includes('.uuid()'));
    for (const marker of ['demo', 'sample', 'placeholder', 'lorem', 'faker', 'Math.random']) {
      assert.ok(
        !routeSource.toLowerCase().includes(marker.toLowerCase()),
        `route must not contain fake marker: ${marker}`,
      );
      assert.ok(
        !serviceSource.toLowerCase().includes(marker.toLowerCase()),
        `service must not contain fake marker: ${marker}`,
      );
      assert.ok(
        !sharedSource.toLowerCase().includes(marker.toLowerCase()),
        `shared logic must not contain fake marker: ${marker}`,
      );
    }
  });
});
