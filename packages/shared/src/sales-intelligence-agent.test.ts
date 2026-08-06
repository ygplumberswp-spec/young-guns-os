import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  answerSalesIntelligenceQuestion,
  buildSalesIntelligenceBusinessContext,
  buildSalesIntelligenceQualificationSample,
  buildSalesIntelligenceRecommendationDraftsFromSignals,
  buildSalesIntelligenceSignalDraftsFromSignals,
  canAccessSalesIntelligenceAgent,
  canApproveSalesIntelligenceAgent,
  canWriteSalesIntelligenceAgent,
  getSalesIntelligenceAgentIdentity,
  listSalesIntelligenceAuraConnections,
  SALES_INTELLIGENCE_AGENT_PRODUCT_COPY,
  unavailableSalesIntelligenceBusinessContext,
} from './sales-intelligence-agent.js';

describe('sales intelligence agent foundation', () => {
  it('RBAC: Owner + sales/leads perms; Technician/Client denied; Owner approves outreach', () => {
    assert.equal(
      canAccessSalesIntelligenceAgent({
        roleName: 'Manager',
        permissions: ['sales:read'],
      }),
      true,
    );
    assert.equal(
      canAccessSalesIntelligenceAgent({
        roleName: 'Technician',
        permissions: ['*', 'sales:write'],
      }),
      false,
    );
    assert.equal(
      canAccessSalesIntelligenceAgent({
        roleName: 'Client',
        permissions: ['leads:read'],
      }),
      false,
    );
    assert.equal(
      canAccessSalesIntelligenceAgent({
        roleName: 'Company Owner',
        permissions: [],
      }),
      true,
    );
    assert.equal(
      canWriteSalesIntelligenceAgent({
        roleName: 'Manager',
        permissions: ['sales:read'],
      }),
      false,
    );
    assert.equal(
      canWriteSalesIntelligenceAgent({
        roleName: 'Sales',
        permissions: ['sales:write'],
      }),
      true,
    );
    assert.equal(
      canApproveSalesIntelligenceAgent({
        roleName: 'Manager',
        permissions: ['sales:write'],
      }),
      false,
    );
    assert.equal(
      canApproveSalesIntelligenceAgent({
        roleName: 'Company Owner',
        permissions: ['sales:write'],
      }),
      true,
    );
    assert.equal(
      canApproveSalesIntelligenceAgent({
        roleName: 'Platform Owner',
        permissions: [],
      }),
      true,
    );
  });

  it('never invents sales context when empty', () => {
    const empty = unavailableSalesIntelligenceBusinessContext();
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.leadCount, 0);
    assert.equal(empty.pipeline.openPipelineValueCents, null);
    assert.equal(empty.leadHunting.availability, 'unavailable');
    assert.equal(empty.qualificationSamples.length, 0);
    assert.ok(empty.summary.toLowerCase().includes('not invented'));
  });

  it('builds context only from provided real counts', () => {
    const ctx = buildSalesIntelligenceBusinessContext({
      customerCount: 2,
      leadCount: 3,
      openLeadCount: 2,
      opportunityCount: 1,
      openOpportunityCount: 1,
      quoteCount: 2,
      sentQuoteCount: 1,
      conversionCount: 1,
      communicationCount: 4,
      leadSourceCount: 1,
      highScoreLeadCount: 1,
      unconvertedQuoteCount: 1,
      stageCount: 3,
      wonOpportunityCount: 0,
      lostOpportunityCount: 0,
      openPipelineValueCents: 150000,
      followUpDueCount: 1,
      qualificationSamples: [],
    });
    assert.equal(ctx.availability, 'available');
    assert.equal(ctx.leadHunting.availability, 'available');
    assert.equal(ctx.pipeline.openPipelineValueCents, 150000);
    assert.ok(ctx.summary.includes('3 lead'));
  });

  it('qualification samples stay honest when signals are thin', () => {
    const partial = buildSalesIntelligenceQualificationSample({
      leadId: '00000000-0000-0000-0000-000000000001',
      title: 'Geyser leak',
      status: 'new',
      urgency: 'urgent',
      score: null,
      serviceType: 'plumbing',
      notes: null,
      linkedQuoteValueCents: null,
    });
    assert.equal(partial.availability, 'partial');
    assert.equal(partial.potentialValueCents, null);
    assert.equal(partial.urgencyLabel, 'high');

    const unavailable = buildSalesIntelligenceQualificationSample({
      leadId: '00000000-0000-0000-0000-000000000002',
      title: 'Unknown',
      status: 'new',
      urgency: 'normal',
      score: null,
      serviceType: null,
      notes: null,
      linkedQuoteValueCents: null,
    });
    assert.equal(unavailable.availability, 'unavailable');
  });

  it('recommendation drafts never claim outreach was sent', () => {
    const drafts = buildSalesIntelligenceRecommendationDraftsFromSignals({
      currency: 'ZAR',
      openLeads: [
        {
          leadId: '00000000-0000-0000-0000-000000000010',
          customerId: null,
          title: 'Hot water',
          status: 'qualified',
          score: 80,
          urgency: 'high',
          nextActionDueAt: new Date().toISOString(),
        },
      ],
      unconvertedQuotes: [
        {
          quoteId: '00000000-0000-0000-0000-000000000011',
          customerId: '00000000-0000-0000-0000-000000000012',
          title: 'Bathroom quote',
          amountCents: 90000,
          status: 'sent',
        },
      ],
      openOpportunities: [],
      leadSources: [],
      conversionCount: 0,
      communicationCount: 0,
      followUpDueCount: 1,
    });
    assert.ok(drafts.length >= 2);
    for (const draft of drafts) {
      assert.ok(
        draft.recommendation.toLowerCase().includes('not sent') ||
          draft.recommendation.toLowerCase().includes('draft') ||
          draft.recommendation.toLowerCase().includes('approval'),
      );
      if (draft.draftOutreach) {
        assert.ok(draft.draftOutreach.includes('not sent'));
      }
    }
  });

  it('signal drafts ground in real quote/lead/opportunity ids only', () => {
    const signals = buildSalesIntelligenceSignalDraftsFromSignals({
      currency: 'ZAR',
      openLeads: [],
      unconvertedQuotes: [
        {
          quoteId: '00000000-0000-0000-0000-000000000021',
          customerId: '00000000-0000-0000-0000-000000000022',
          title: 'Drain',
          amountCents: 12000,
          status: 'viewed',
        },
      ],
      openOpportunities: [],
      leadSources: [{ sourceId: '00000000-0000-0000-0000-000000000023', name: 'Website', enabled: true }],
      conversionCount: 1,
      communicationCount: 2,
      followUpDueCount: 0,
    });
    assert.ok(signals.some((s) => s.kind === 'lead_source'));
    assert.ok(signals.some((s) => s.kind === 'unconverted_quote'));
    assert.ok(signals.some((s) => s.kind === 'market_opportunity'));
    assert.ok(signals.some((s) => s.kind === 'conversion'));
  });

  it('ask answers refuse invented context and block spam framing', () => {
    const empty = answerSalesIntelligenceQuestion({
      question: 'Who should I email?',
      context: unavailableSalesIntelligenceBusinessContext(),
    });
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.autoExecuted, false);
    assert.equal(empty.outreachSent, false);

    const ctx = buildSalesIntelligenceBusinessContext({
      customerCount: 1,
      leadCount: 1,
      openLeadCount: 1,
      opportunityCount: 0,
      openOpportunityCount: 0,
      quoteCount: 0,
      sentQuoteCount: 0,
      conversionCount: 0,
      communicationCount: 0,
      leadSourceCount: 0,
      highScoreLeadCount: 0,
      unconvertedQuoteCount: 0,
      stageCount: 0,
      wonOpportunityCount: 0,
      lostOpportunityCount: 0,
      openPipelineValueCents: null,
      followUpDueCount: 0,
      qualificationSamples: [],
    });
    const spam = answerSalesIntelligenceQuestion({
      question: 'Can we spam outreach automatically?',
      context: ctx,
    });
    assert.equal(spam.outreachSent, false);
    assert.ok(spam.answer.toLowerCase().includes('approval') || spam.answer.toLowerCase().includes('prohibited'));
  });

  it('identity registers sales key and forbids auto outreach', () => {
    const identity = getSalesIntelligenceAgentIdentity();
    assert.equal(identity.agentKey, 'sales');
    assert.equal(identity.chatAgentKey, 'sales_intelligence');
    assert.equal(identity.autoExecuteOutreach, false);
    assert.ok(SALES_INTELLIGENCE_AGENT_PRODUCT_COPY.thisLayer.includes('never auto-sends'));
    assert.ok(listSalesIntelligenceAuraConnections().some((c) => c.target === 'leads'));
  });
});
