import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCommAuraFollowUpSuggestion,
  buildCommAuraSmartReply,
  canAccessCommunicationAuraIntelligence,
  canWriteCommunicationAuraIntelligence,
  COMM_AURA_PRODUCT_COPY,
  detectCommAuraSentiment,
  dominantCommAuraSentiment,
  emptyCommAuraPriorityCounts,
  scoreCommAuraMessage,
} from './communication-aura-intelligence.js';

describe('communication aura intelligence', () => {
  it('RBAC: business communications perms; Technician/Client denied', () => {
    assert.equal(
      canAccessCommunicationAuraIntelligence({
        roleName: 'Admin',
        permissions: ['communications:read'],
      }),
      true,
    );
    assert.equal(
      canAccessCommunicationAuraIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'communications:manage'],
      }),
      false,
    );
    assert.equal(
      canAccessCommunicationAuraIntelligence({
        roleName: 'Client',
        permissions: ['communications:read'],
      }),
      false,
    );
    assert.equal(
      canWriteCommunicationAuraIntelligence({
        roleName: 'Office Staff',
        permissions: ['communications:read'],
      }),
      false,
    );
    assert.equal(
      canWriteCommunicationAuraIntelligence({
        roleName: 'Owner',
        permissions: ['communications:write'],
      }),
      true,
    );
  });

  it('sentiment is unavailable when no lexical signal — never invents scores', () => {
    const empty = detectCommAuraSentiment({ subject: null, preview: null });
    assert.equal(empty.sentiment, 'unavailable');
    assert.equal(empty.confidence, null);

    const bland = detectCommAuraSentiment({
      subject: 'Site visit',
      preview: 'Please advise availability next week.',
    });
    assert.equal(bland.sentiment, 'unavailable');
    assert.equal(bland.confidence, null);

    const positive = detectCommAuraSentiment({
      preview: 'Thanks so much — great work, we appreciate it!',
    });
    assert.equal(positive.sentiment, 'positive');
    assert.ok(positive.confidence !== null && positive.confidence > 0);

    const negative = detectCommAuraSentiment({
      preview: 'This is unacceptable — I want a refund.',
    });
    assert.equal(negative.sentiment, 'negative');
  });

  it('scores prioritise urgency / unread / age without inventing message content', () => {
    const now = new Date('2026-08-03T12:00:00.000Z');
    const critical = scoreCommAuraMessage({
      urgent: true,
      unread: true,
      occurredAt: '2026-07-30T12:00:00.000Z',
      hasCrmLink: false,
      sentiment: 'negative',
      now,
    });
    assert.equal(critical.priority, 'critical');
    assert.ok(critical.score >= 70);

    const low = scoreCommAuraMessage({
      urgent: false,
      unread: false,
      occurredAt: now.toISOString(),
      hasCrmLink: true,
      sentiment: 'unavailable',
      now,
    });
    assert.equal(low.priority, 'low');
    assert.equal(low.breakdown.sentimentPoints, 0);
  });

  it('smart replies are drafts with explicit non-send language', () => {
    const draft = buildCommAuraSmartReply({
      channel: 'email',
      participantLabel: 'Jane Customer <jane@example.com>',
      subject: 'Quote request',
      companyName: 'Titan Plumbing',
    });
    assert.ok(draft.body.includes('Nothing was sent'));
    assert.ok(draft.body.includes('Owner approval'));
    assert.ok(draft.subject.toLowerCase().includes('draft'));
  });

  it('follow-up suggestions stay honest when no signal', () => {
    const none = buildCommAuraFollowUpSuggestion({
      participantLabel: 'Sam',
      subject: 'Invoice copy',
      preview: 'Please send a PDF copy.',
      unread: false,
      hasCrmLink: true,
    });
    assert.equal(none.suggested, false);

    const yes = buildCommAuraFollowUpSuggestion({
      participantLabel: 'Sam',
      preview: 'Any update? Still waiting for a call back.',
      unread: true,
      hasCrmLink: false,
    });
    assert.equal(yes.suggested, true);
    assert.ok(yes.recommendation.includes('Do not contact automatically'));
  });

  it('dominant sentiment stays unavailable when only unavailable inputs', () => {
    assert.deepEqual(dominantCommAuraSentiment(['unavailable', 'unavailable']), {
      sentiment: 'unavailable',
      availability: 'unavailable',
    });
    assert.equal(dominantCommAuraSentiment(['positive', 'negative', 'positive']).sentiment, 'positive');
    assert.equal(emptyCommAuraPriorityCounts().critical, 0);
    assert.ok(COMM_AURA_PRODUCT_COPY.thisLayer.includes('never auto-sends'));
  });
});
