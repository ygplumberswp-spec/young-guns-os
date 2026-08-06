import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCriContentTemplate,
  buildCriReputationSnapshot,
  buildCriReviewResponseDraft,
  canAccessContentReputationIntelligence,
  canApproveContentReputationDrafts,
  canWriteContentReputationIntelligence,
  detectCriReviewSentiment,
  listDefaultCriContentTemplates,
  scoreCriContentQuality,
  CRI_PRODUCT_COPY,
} from './content-reputation-intelligence.js';

describe('content & reputation intelligence', () => {
  it('RBAC mirrors Marketing Agent; Technician/Client denied; Owner approves', () => {
    assert.equal(
      canAccessContentReputationIntelligence({
        roleName: 'Manager',
        permissions: ['marketing:read'],
      }),
      true,
    );
    assert.equal(
      canAccessContentReputationIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'marketing:write'],
      }),
      false,
    );
    assert.equal(
      canWriteContentReputationIntelligence({
        roleName: 'Manager',
        permissions: ['marketing:read'],
      }),
      false,
    );
    assert.equal(
      canApproveContentReputationDrafts({
        roleName: 'Company Owner',
        permissions: ['marketing:write'],
      }),
      true,
    );
    assert.equal(
      canApproveContentReputationDrafts({
        roleName: 'Manager',
        permissions: ['marketing:write'],
      }),
      false,
    );
  });

  it('plumbing suggestion categories are draft templates — not published campaigns', () => {
    for (const category of [
      'maintenance_reminder',
      'geyser_education',
      'before_after',
      'trust_building',
    ] as const) {
      const t = buildCriContentTemplate({ category, topicHint: 'blocked drain' });
      assert.equal(t.category, category);
      assert.ok(/draft|template|not published|Owner/i.test(t.body));
    }
    const templates = listDefaultCriContentTemplates();
    assert.ok(templates.length >= 10);
    assert.ok(CRI_PRODUCT_COPY.thisLayer.includes('never auto-publish'));
  });

  it('quality scoring unavailable without text; never invents empty scores', () => {
    const empty = scoreCriContentQuality({ body: '' });
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.overallScore, null);
    assert.equal(empty.engagementPrediction.band, null);

    const scored = scoreCriContentQuality({
      title: 'Winter pipe tip',
      body: 'Book a licensed diagnostic before cold snaps. Local tidy team.',
      hashtags: ['#Plumbing'],
    });
    assert.equal(scored.availability, 'available');
    assert.ok(typeof scored.overallScore === 'number');
    assert.ok(scored.improvementSuggestions.length >= 0);
    assert.equal(scored.engagementPrediction.availability, 'heuristic');
  });

  it('review sentiment unavailable without signal; reputation empty without reviews', () => {
    const none = detectCriReviewSentiment({ body: '', rating: null });
    assert.equal(none.sentiment, 'unavailable');
    assert.equal(none.confidence, null);

    const emptyRep = buildCriReputationSnapshot({ reviews: [] });
    assert.equal(emptyRep.availability, 'unavailable');
    assert.equal(emptyRep.reputationScore, null);
    assert.ok(emptyRep.csatInsight.toLowerCase().includes('unavailable'));

    const withReviews = buildCriReputationSnapshot({
      reviews: [
        { rating: 5, sentiment: 'positive' },
        { rating: 2, sentiment: 'negative' },
      ],
    });
    assert.equal(withReviews.availability, 'available');
    assert.ok(withReviews.reputationScore != null);
    assert.equal(withReviews.reviewCount, 2);
  });

  it('review response drafts never claim auto-reply', () => {
    const draft = buildCriReviewResponseDraft({
      authorName: 'Sam',
      body: 'Great service, thank you',
      sentiment: 'positive',
      rating: 5,
    });
    assert.ok(draft.body.includes('not sent') || draft.body.includes('Owner approval'));
    assert.ok(draft.body.includes('No automatic review replies'));
  });
});
