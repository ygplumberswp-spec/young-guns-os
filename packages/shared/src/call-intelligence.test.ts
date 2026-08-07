import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateCiInsights,
  buildCiCallStats,
  buildCiCallSummaryFromText,
  buildCiLeadDraft,
  CALL_INTELLIGENCE_KEY,
  canAccessCallIntelligence,
  canApproveCiLeadDrafts,
  canViewCiInternalCustomerNotes,
  canWriteCallIntelligence,
  CI_PRODUCT_COPY,
  detectCiSentimentFromText,
  inferCiLeadKindFromText,
  listCiConnections,
} from './call-intelligence.js';

describe('call intelligence engine', () => {
  it('RBAC: Owner/Admin and voice perms; Technician/Client denied', () => {
    assert.equal(CALL_INTELLIGENCE_KEY, 'call-intelligence');
    assert.equal(canAccessCallIntelligence({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(canAccessCallIntelligence({ roleName: 'Manager', permissions: ['voice:read'] }), true);
    assert.equal(
      canAccessCallIntelligence({ roleName: 'Technician', permissions: ['*', 'voice:write'] }),
      false,
    );
    assert.equal(canAccessCallIntelligence({ roleName: 'Client', permissions: ['voice:read'] }), false);
    assert.equal(canWriteCallIntelligence({ roleName: 'Admin', permissions: [] }), true);
    assert.equal(canApproveCiLeadDrafts({ roleName: 'Manager', permissions: ['voice:write'] }), false);
    assert.equal(canApproveCiLeadDrafts({ roleName: 'Owner', permissions: [] }), true);
    assert.equal(canViewCiInternalCustomerNotes({ roleName: 'Admin', permissions: [] }), true);
    assert.equal(canViewCiInternalCustomerNotes({ roleName: 'Manager', permissions: ['voice:read'] }), false);
  });

  it('summary unavailable without transcript/notes — never invent', () => {
    const empty = buildCiCallSummaryFromText({});
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.invented, false);
    assert.ok(/not invented/i.test(empty.rationale));
    const real = buildCiCallSummaryFromText({
      storedSummary: 'Caller needs geyser quote',
      transcriptText: 'Hi, I need a quote for a geyser replacement urgently today.',
      transcriptTurnCount: 2,
    });
    assert.equal(real.availability, 'available');
    assert.ok(real.customerRequests.length > 0);
    assert.ok(real.followUpRecommendations.length > 0);
  });

  it('sentiment unavailable without signal', () => {
    const empty = detectCiSentimentFromText({ text: '' });
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.sentiment, 'unavailable');
    const frustrated = detectCiSentimentFromText({
      text: 'I am frustrated and this is unacceptable, need emergency fix today',
    });
    assert.equal(frustrated.availability, 'available');
    assert.ok(frustrated.frustration === true || frustrated.sentiment === 'frustrated' || frustrated.sentiment === 'urgent');
    assert.ok(frustrated.recommendations.length > 0);
  });

  it('lead drafts are approval-gated copy only', () => {
    const draft = buildCiLeadDraft({
      kind: 'new_enquiry',
      contactName: 'Thabo',
      contactPhone: '0821234567',
      serviceType: 'Geyser',
    });
    assert.ok(/Lead draft only/i.test(draft.body));
    assert.ok(/Owner approval/i.test(draft.body));
    assert.ok(/No automatic customer communication/i.test(draft.body));
    assert.equal(inferCiLeadKindFromText('urgent emergency burst pipe'), 'urgent_opportunity');
    assert.equal(inferCiLeadKindFromText('new enquiry for quote'), 'new_enquiry');
  });

  it('insights unavailable without real call texts', () => {
    const empty = aggregateCiInsights({ texts: [] });
    assert.equal(empty.availability, 'unavailable');
    assert.ok(/not invented/i.test(empty.rationale));
    const real = aggregateCiInsights({
      texts: [
        'Customer asked for a quote on geyser',
        'Caller was frustrated about invoice',
        'Need appointment booking this week',
      ],
    });
    assert.equal(real.callSessionCount, 3);
    assert.ok(
      real.commonQuestions.length +
        real.salesOpportunities.length +
        real.customerIssues.length >
        0,
    );
  });

  it('call stats unavailable without sessions', () => {
    const empty = buildCiCallStats({
      vairSessionCount: 0,
      voiceSessionCount: 0,
      analyzedCount: 0,
      pendingLeadApprovals: 0,
    });
    assert.equal(empty.availability, 'unavailable');
    const real = buildCiCallStats({
      vairSessionCount: 2,
      voiceSessionCount: 1,
      analyzedCount: 1,
      pendingLeadApprovals: 1,
    });
    assert.equal(real.availability, 'available');
    assert.equal(real.vairSessionCount, 2);
  });

  it('connections extend VAIR and keep lead path partial/approval-gated', () => {
    const connections = listCiConnections();
    assert.ok(connections.some((c) => c.target === 'voice_ai_receptionist'));
    assert.ok(connections.some((c) => c.target === 'voice'));
    const leads = connections.find((c) => c.target === 'leads');
    assert.equal(leads?.status, 'partial');
    assert.ok(/9\.1/i.test(CI_PRODUCT_COPY.voiceAiReceptionist));
    assert.ok(/Owner approval/i.test(CI_PRODUCT_COPY.thisLayer));
  });
});
