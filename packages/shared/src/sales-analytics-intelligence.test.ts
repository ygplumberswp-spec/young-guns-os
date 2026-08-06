import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
  SALES_ANALYTICS_INTELLIGENCE_KEY,
} from './sales-analytics-intelligence.js';

describe('sales analytics intelligence foundation', () => {
  it('RBAC: Owner/sales access; Technician/Client denied', () => {
    assert.equal(SALES_ANALYTICS_INTELLIGENCE_KEY, 'sales-analytics-intelligence');
    assert.equal(
      canAccessSalesAnalyticsIntelligence({
        roleName: 'Company Owner',
        permissions: [],
      }),
      true,
    );
    assert.equal(
      canAccessSalesAnalyticsIntelligence({
        roleName: 'Manager',
        permissions: ['sales:read'],
      }),
      true,
    );
    assert.equal(
      canAccessSalesAnalyticsIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'sales:write'],
      }),
      false,
    );
    assert.equal(
      canAccessSalesAnalyticsIntelligence({
        roleName: 'Client',
        permissions: ['sales:read'],
      }),
      false,
    );
    assert.equal(
      canWriteSalesAnalyticsIntelligence({
        roleName: 'Manager',
        permissions: ['sales:read'],
      }),
      false,
    );
    assert.equal(
      canWriteSalesAnalyticsIntelligence({
        roleName: 'Manager',
        permissions: ['sales:write'],
      }),
      true,
    );
    assert.equal(
      canApproveSaiInsightDrafts({
        roleName: 'Owner',
        permissions: [],
      }),
      true,
    );
    assert.equal(
      canManageSaiSettings({
        roleName: 'Manager',
        permissions: ['sales:write'],
      }),
      false,
    );
  });

  it('metrics stay unavailable/partial without invented conversion rates', () => {
    const empty = buildSaiMetricSnapshot({
      leadsCreated: 0,
      quotesSent: 0,
      quotesAccepted: 0,
      quotesDeclined: 0,
      openOpportunityCount: 0,
      wonOpportunityCount: 0,
      lostOpportunityCount: 0,
      pipelineValueCents: 0,
      acceptedQuoteValueCents: 0,
    });
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.quoteConversionRatePercent, null);
    assert.ok(/not invented/i.test(empty.rationale));

    const thin = buildSaiMetricSnapshot({
      leadsCreated: 2,
      quotesSent: 2,
      quotesAccepted: 1,
      quotesDeclined: 0,
      openOpportunityCount: 1,
      wonOpportunityCount: 0,
      lostOpportunityCount: 0,
      pipelineValueCents: 50000,
      acceptedQuoteValueCents: 25000,
      minConversionSample: SAI_DEFAULT_MIN_CONVERSION_SAMPLE,
    });
    assert.equal(thin.conversionAvailability, 'partial');
    assert.equal(thin.quoteConversionRatePercent, null);
    assert.equal(thin.pipelineValueCents, 50000);
    assert.ok(/not invented/i.test(thin.rationale));

    const enough = buildSaiMetricSnapshot({
      leadsCreated: 10,
      quotesSent: 10,
      quotesAccepted: 4,
      quotesDeclined: 2,
      openOpportunityCount: 3,
      wonOpportunityCount: 5,
      lostOpportunityCount: 5,
      pipelineValueCents: 100000,
      acceptedQuoteValueCents: 80000,
      minConversionSample: 5,
    });
    assert.equal(enough.conversionAvailability, 'available');
    assert.equal(enough.quoteConversionRatePercent, 40);
    assert.equal(enough.winRatePercent, 50);
    assert.equal(enough.leadToQuoteRatePercent, 100);

    const rows = buildSaiPerformanceRows(enough);
    assert.ok(rows.some((r) => r.label === 'Quote conversion rate' && r.value === 40));
  });

  it('insight drafts never claim auto outreach or invented rates', () => {
    const trend = buildSalesTrendInsightDraft({
      leadsCreated: 3,
      quotesSent: 2,
      quotesAccepted: 1,
    });
    assert.equal(trend.kind, 'sales_trend');
    assert.ok(/not an automatic outreach/i.test(trend.body));

    const lost = buildLostOpportunityInsightDraft({
      lostOpportunityCount: 2,
      quotesDeclined: 1,
    });
    assert.equal(lost.kind, 'lost_opportunity');
    assert.ok(/never auto-send/i.test(lost.body));

    const improve = buildImprovementAreaInsightDraft({
      quotesSent: 2,
      quotesAccepted: 0,
      minSample: 5,
      conversionRatePercent: null,
    });
    assert.ok(/not invented/i.test(improve.body));

    const revenue = buildRevenueOpportunityInsightDraft({
      openOpportunityCount: 2,
      pipelineValueCents: null,
      currency: 'ZAR',
    });
    assert.ok(/never invented/i.test(revenue.body));

    const aura = buildAuraSalesInsightDraft({
      kind: 'sales_trend',
      title: 'Trend',
      supportingSignals: ['3 leads'],
      recommendation: 'Review pipeline',
    });
    assert.equal(aura.target, 'command_centre');
    assert.ok(/No automatic outreach/i.test(aura.insight));
  });

  it('settings defaults enforce inventRates/autoOutreach false', () => {
    const settings = defaultSaiSettings({ id: 's1', insightsEnabled: true });
    assert.equal(settings.inventRatesEnabled, false);
    assert.equal(settings.autoOutreachEnabled, false);
    assert.equal(settings.minConversionSample, SAI_DEFAULT_MIN_CONVERSION_SAMPLE);
    assert.ok(SAI_PRODUCT_COPY.thisLayer.includes('insufficient'));
  });

  it('connections link CRM, Quotes, Jobs, Finance, Command Centre, 10.1/10.2', () => {
    const connections = listSaiConnections({
      leadsAvailable: true,
      quotesAvailable: true,
      opportunitiesAvailable: true,
      financeLinkAvailable: true,
      salesAgentPresent: true,
      salesFollowupPresent: true,
    });
    const hrefs = connections.map((c) => c.href);
    assert.ok(hrefs.includes('/crm'));
    assert.ok(hrefs.includes('/quotes'));
    assert.ok(hrefs.includes('/jobs'));
    assert.ok(hrefs.includes('/finance-reporting-forecast'));
    assert.ok(hrefs.includes('/dashboard'));
    assert.ok(hrefs.includes('/aura/command-centre'));
    assert.ok(hrefs.includes('/sales-intelligence-agent'));
    assert.ok(hrefs.includes('/sales-followup-intelligence'));
  });
});
