/**
 * Content & Reputation Intelligence (Department 3.3)
 *
 * Extends Marketing Agent Foundation + Social Media Integration with:
 * - Content intelligence (ideas, captions, hashtags, plumbing categories)
 * - Content quality scoring on real drafts/campaign content only
 * - Reputation / review tracking from real review rows when present
 * - Owner-entered competitor observations (never invented)
 * - AURA marketing insight handoffs (real insights only)
 *
 * Invariants:
 * - No automatic publishing; no automatic review replies
 * - Owner approval required for outbound drafts
 * - Sentiment / engagement / reputation scores unavailable without real signals
 * - No fake reviews, competitors, campaigns, or analytics
 */

import {
  canAccessMarketingAgent,
  canApproveMarketingAgentPublish,
  canWriteMarketingAgent,
  type MktAgentChannel,
} from './marketing-agent.js';

export type CriContentCategory =
  | 'content_idea'
  | 'caption'
  | 'hashtags'
  | 'campaign_idea'
  | 'seasonal'
  | 'education'
  | 'customer_focused'
  | 'maintenance_reminder'
  | 'geyser_education'
  | 'before_after'
  | 'trust_building'
  | 'video_review'
  | 'trend'
  | 'improvement';

export type CriSuggestionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type CriSentiment = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unavailable';

export type CriReviewSource =
  | 'owner_entered'
  | 'social_monitoring'
  | 'cx'
  | 'google_business'
  | 'other';

export type CriObservationKind =
  | 'industry_trend'
  | 'market_observation'
  | 'pricing_observation'
  | 'competitor_note'
  | 'other';

export type CriInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'marketing_agent'
  | 'social_media'
  | 'communication_timeline'
  | 'customer_360'
  | 'cx';

export type CriInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type CriQualityDimension = {
  key: string;
  label: string;
  score: number | null;
  note: string;
};

export type CriContentQualityResult = {
  overallScore: number | null;
  availability: 'available' | 'unavailable';
  dimensions: CriQualityDimension[];
  brandConsistency: {
    status: 'pass' | 'warn' | 'unavailable';
    findings: string[];
  };
  engagementPrediction: {
    availability: 'heuristic' | 'unavailable';
    band: 'low' | 'medium' | 'high' | null;
    rationale: string;
  };
  improvementSuggestions: string[];
  videoReviewSuggestions: string[];
};

export type CriContentSuggestionSummary = {
  id: string;
  category: CriContentCategory;
  channel: MktAgentChannel | null;
  status: CriSuggestionStatus;
  title: string;
  body: string;
  hashtags: string[];
  marketingDraftId: string | null;
  qualityScore: number | null;
  qualityAvailability: 'available' | 'unavailable';
  autoPublish: false;
  createdAt: string;
  decidedAt: string | null;
};

export type CriReviewSummary = {
  id: string;
  source: CriReviewSource;
  platform: string | null;
  authorName: string | null;
  rating: number | null;
  body: string;
  occurredAt: string | null;
  sentiment: CriSentiment;
  sentimentConfidence: number | null;
  socialItemId: string | null;
  customerId: string | null;
  createdAt: string;
};

export type CriReviewResponseDraftSummary = {
  id: string;
  reviewId: string;
  status: CriSuggestionStatus;
  title: string;
  body: string;
  autoReply: false;
  createdAt: string;
  decidedAt: string | null;
};

export type CriReputationSnapshot = {
  availability: 'available' | 'unavailable';
  reviewCount: number;
  averageRating: number | null;
  reputationScore: number | null;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
    mixed: number;
    unavailable: number;
  };
  csatInsight: string;
  rationale: string;
};

export type CriCompetitorSummary = {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
};

export type CriCompetitorObservationSummary = {
  id: string;
  competitorId: string | null;
  kind: CriObservationKind;
  title: string;
  body: string;
  observedAt: string | null;
  createdAt: string;
};

export type CriAuraInsightSummary = {
  id: string;
  target: CriInsightTarget;
  status: CriInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceSuggestionId: string | null;
  sourceReviewId: string | null;
  createdAt: string;
};

export type CriAuraConnection = {
  target: CriInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type CriDashboard = {
  summary: string;
  productClarification: {
    marketingAgent: string;
    socialMedia: string;
    thisLayer: string;
  };
  publishPolicy: {
    autoPublishEnabled: false;
    autoReplyEnabled: false;
    requiresOwnerApproval: true;
  };
  contentSuggestions: CriContentSuggestionSummary[];
  reviews: CriReviewSummary[];
  reviewResponseDrafts: CriReviewResponseDraftSummary[];
  reputation: CriReputationSnapshot;
  competitors: CriCompetitorSummary[];
  observations: CriCompetitorObservationSummary[];
  auraInsights: CriAuraInsightSummary[];
  auraConnections: CriAuraConnection[];
  contentTemplates: CriContentTemplate[];
  pendingApprovals: number;
};

export type CriContentTemplate = {
  category: CriContentCategory;
  channel: MktAgentChannel;
  title: string;
  body: string;
  hashtags: string[];
};

export type GenerateCriContentSuggestionRequest = {
  category: CriContentCategory;
  channel?: MktAgentChannel;
  topicHint?: string;
  marketingDraftId?: string;
  /** When true, score against real draft/campaign body text only. */
  sourceText?: string;
  submitForApproval?: boolean;
};

export type ScoreCriContentRequest = {
  title?: string;
  body: string;
  hashtags?: string[];
  channel?: MktAgentChannel;
  marketingDraftId?: string;
};

export type DecideCriSuggestionRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type CreateCriReviewRequest = {
  source?: CriReviewSource;
  platform?: string;
  authorName?: string;
  rating?: number;
  body: string;
  occurredAt?: string;
  socialItemId?: string;
  customerId?: string;
};

export type CreateCriReviewResponseDraftRequest = {
  reviewId: string;
  title?: string;
  body?: string;
  submitForApproval?: boolean;
};

export type DecideCriReviewResponseRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type CreateCriCompetitorRequest = {
  name: string;
  website?: string;
  notes?: string;
};

export type CreateCriObservationRequest = {
  competitorId?: string;
  kind: CriObservationKind;
  title: string;
  body: string;
  observedAt?: string;
};

export type CreateCriAuraInsightRequest = {
  target: CriInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceSuggestionId?: string;
  sourceReviewId?: string;
};

export type AcknowledgeCriInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access ───────────────────────────────────────────────────────────────────

export function canAccessContentReputationIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canAccessMarketingAgent(identity);
}

export function canWriteContentReputationIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canWriteMarketingAgent(identity);
}

export function canApproveContentReputationDrafts(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveMarketingAgentPublish(identity);
}

// ─── Content templates (draft generators only) ────────────────────────────────

const PLUMBING_TAGS = [
  '#Plumbing',
  '#Plumber',
  '#HomeMaintenance',
  '#Geyser',
  '#LeakRepair',
  '#TrustedTrades',
];

export function buildCriContentTemplate(input: {
  category: CriContentCategory;
  channel?: MktAgentChannel;
  topicHint?: string;
  now?: Date;
}): CriContentTemplate {
  const channel = input.channel ?? 'instagram';
  const topic = input.topicHint?.trim() || 'reliable plumbing care';
  const now = input.now ?? new Date();
  const month = now.getUTCMonth() + 1;

  switch (input.category) {
    case 'hashtags':
      return {
        category: 'hashtags',
        channel,
        title: `Hashtag set — ${topic}`.slice(0, 200),
        body: 'Suggested hashtags for Owner review. Not published.',
        hashtags: PLUMBING_TAGS,
      };
    case 'caption':
      return {
        category: 'caption',
        channel,
        title: `Caption — ${topic}`.slice(0, 200),
        body: [
          `Need help with ${topic}?`,
          '',
          'Clear diagnostics, honest quotes, tidy workmanship.',
          '',
          '(Content & Reputation draft — Owner approval required. Nothing was posted.)',
        ].join('\n'),
        hashtags: PLUMBING_TAGS.slice(0, 4),
      };
    case 'maintenance_reminder':
      return {
        category: 'maintenance_reminder',
        channel,
        title: `Maintenance reminder — ${topic}`.slice(0, 200),
        body: [
          `Reminder draft: schedule preventive checks for ${topic}.`,
          '',
          'Suggested points: shut-off location, early leak signs, annual service window.',
          'Tone: helpful, not alarmist. Draft only — not a published campaign.',
        ].join('\n'),
        hashtags: ['#MaintenanceReminder', '#Plumbing', '#PreventiveCare'],
      };
    case 'geyser_education':
      return {
        category: 'geyser_education',
        channel,
        title: 'Geyser education tip (draft)',
        body: [
          'Educational draft: how to spot geyser warning signs (unusual noises, pressure relief dripping, inconsistent temperature).',
          '',
          'Include a clear CTA to book a licensed inspection.',
          'Not published. Not a fake campaign. Owner must approve final wording.',
        ].join('\n'),
        hashtags: ['#Geyser', '#HomeSafety', '#PlumbingTips'],
      };
    case 'before_after':
      return {
        category: 'before_after',
        channel,
        title: `Before/after story — ${topic}`.slice(0, 200),
        body: [
          'Draft structure for a before/after post (requires real job photos + customer consent):',
          '1) Problem snapshot (with permission)',
          '2) What we fixed',
          '3) Outcome for the homeowner',
          '',
          'Do not invent job results. This is a template only.',
        ].join('\n'),
        hashtags: ['#BeforeAndAfter', '#Plumbing', '#Workmanship'],
      };
    case 'trust_building':
      return {
        category: 'trust_building',
        channel,
        title: 'Trust-building content idea (draft)',
        body: [
          'Idea: show licensing, tidy-site habits, and clear communication standards.',
          `Topic focus: ${topic}`,
          '',
          'Avoid exaggerated claims. Draft for Owner approval — not published.',
        ].join('\n'),
        hashtags: ['#TrustedTrades', '#LocalPlumber', '#CustomerFirst'],
      };
    case 'seasonal': {
      const seasonal =
        month >= 5 && month <= 8
          ? 'Winter pipe protection and shut-off readiness'
          : month >= 11 || month <= 2
            ? 'Summer geyser / peak demand prep'
            : 'Seasonal drain and outdoor prep';
      return {
        category: 'seasonal',
        channel,
        title: `Seasonal opportunity — ${seasonal}`,
        body: [
          `Seasonal draft opportunity (${seasonal}).`,
          `Topic focus: ${topic}`,
          '',
          'Suggestion only — not a scheduled or published campaign.',
        ].join('\n'),
        hashtags: ['#SeasonalMaintenance', '#Plumbing'],
      };
    }
    case 'education':
    case 'customer_focused':
      return {
        category: input.category,
        channel,
        title: `${input.category === 'education' ? 'Education' : 'Customer-focused'} idea — ${topic}`.slice(
          0,
          200,
        ),
        body: [
          `Draft ${input.category.replace('_', ' ')} angle about ${topic}.`,
          '',
          'Keep language plain, practical, and consent-aware.',
          'Owner approves final content — nothing auto-publishes.',
        ].join('\n'),
        hashtags: ['#PlumbingTips', '#HomeCare'],
      };
    case 'video_review':
      return {
        category: 'video_review',
        channel,
        title: 'Video / content review suggestion (draft)',
        body: [
          'Review checklist draft (apply only to real footage/content you already have):',
          '- Opening hook in first 3 seconds',
          '- Show the problem and the fix clearly',
          '- Add captions for silent viewing',
          '- End with a clear booking CTA',
          '',
          'Recommendation only — not auto-published.',
        ].join('\n'),
        hashtags: ['#VideoTips', '#Plumbing'],
      };
    case 'trend':
      return {
        category: 'trend',
        channel,
        title: `Trend observation draft — ${topic}`.slice(0, 200),
        body: [
          'Trend suggestion template for Owner review.',
          'Only promote trends you can substantiate from real market notes or Owner observations — never invent viral metrics.',
          `Focus: ${topic}`,
        ].join('\n'),
        hashtags: ['#TradeTrends', '#Plumbing'],
      };
    case 'improvement':
      return {
        category: 'improvement',
        channel,
        title: 'Content improvement suggestion (draft)',
        body: [
          'Improvement draft: tighten CTA, remove vague claims, add one concrete homeowner benefit, keep hashtags focused.',
          'Apply only to real draft text under review.',
        ].join('\n'),
        hashtags: PLUMBING_TAGS.slice(0, 3),
      };
    case 'campaign_idea':
      return {
        category: 'campaign_idea',
        channel,
        title: `Campaign idea — ${topic}`.slice(0, 200),
        body: [
          `Proposed campaign theme (draft): ${topic}`,
          '- Week 1: maintenance reminder',
          '- Week 2: education tip',
          '- Week 3: trust-building story (real proof only)',
          '',
          'Not scheduled. Not published. Owner approval required per draft.',
        ].join('\n'),
        hashtags: PLUMBING_TAGS.slice(0, 3),
      };
    case 'content_idea':
    default:
      return {
        category: 'content_idea',
        channel,
        title: `Content idea — ${topic}`.slice(0, 200),
        body: [
          `Idea: short ${channel} post about ${topic}.`,
          'Angle: practical value + clear CTA.',
          'Draft only — not published.',
        ].join('\n'),
        hashtags: PLUMBING_TAGS.slice(0, 5),
      };
  }
}

export function listDefaultCriContentTemplates(now?: Date): CriContentTemplate[] {
  const categories: CriContentCategory[] = [
    'content_idea',
    'caption',
    'hashtags',
    'campaign_idea',
    'seasonal',
    'education',
    'customer_focused',
    'maintenance_reminder',
    'geyser_education',
    'before_after',
    'trust_building',
    'video_review',
  ];
  return categories.map((category) => buildCriContentTemplate({ category, now }));
}

// ─── Quality scoring (real text only) ─────────────────────────────────────────

const VAGUE_CLAIMS = ['best ever', '#1', 'guaranteed', 'never fail', 'cheapest'];
const BRAND_POSITIVE = ['licensed', 'insured', 'tidy', 'quote', 'diagnostic', 'local'];

export function scoreCriContentQuality(input: {
  title?: string | null;
  body?: string | null;
  hashtags?: string[];
  /** When true, engagement band may use heuristic from draft structure only. */
  allowHeuristic?: boolean;
}): CriContentQualityResult {
  const title = input.title?.trim() ?? '';
  const body = input.body?.trim() ?? '';
  const text = `${title}\n${body}`.trim();
  const hashtags = input.hashtags ?? [];

  if (!text) {
    return {
      overallScore: null,
      availability: 'unavailable',
      dimensions: [],
      brandConsistency: {
        status: 'unavailable',
        findings: ['No draft/campaign text provided — quality unavailable (not invented).'],
      },
      engagementPrediction: {
        availability: 'unavailable',
        band: null,
        rationale:
          'No content text and no engagement history — prediction unavailable (not invented).',
      },
      improvementSuggestions: [],
      videoReviewSuggestions: [],
    };
  }

  const lengthScore = Math.min(100, Math.round((body.length / 280) * 70 + (title ? 20 : 0)));
  const hashtagScore =
    hashtags.length === 0 ? 40 : hashtags.length <= 8 ? 85 : Math.max(40, 95 - hashtags.length * 3);
  const ctaScore = /book|call|reply|contact|quote|schedule/i.test(text) ? 90 : 45;
  const clarityScore = body.split(/\n/).filter(Boolean).length >= 2 ? 80 : 55;

  const vagueHits = VAGUE_CLAIMS.filter((c) => text.toLowerCase().includes(c));
  const brandHits = BRAND_POSITIVE.filter((c) => text.toLowerCase().includes(c));
  const brandStatus: 'pass' | 'warn' =
    vagueHits.length > 0 || brandHits.length === 0 ? 'warn' : 'pass';

  const dimensions: CriQualityDimension[] = [
    {
      key: 'length',
      label: 'Structure / length',
      score: lengthScore,
      note: 'Heuristic on draft length only.',
    },
    {
      key: 'hashtags',
      label: 'Hashtag focus',
      score: hashtagScore,
      note: hashtags.length ? `${hashtags.length} hashtag(s) on draft` : 'No hashtags on draft',
    },
    {
      key: 'cta',
      label: 'Call to action',
      score: ctaScore,
      note: ctaScore >= 80 ? 'CTA language detected' : 'Weak/missing CTA language',
    },
    {
      key: 'clarity',
      label: 'Clarity',
      score: clarityScore,
      note: 'Paragraph structure heuristic on draft text.',
    },
  ];

  const overallScore = Math.round(
    dimensions.reduce((sum, d) => sum + (d.score ?? 0), 0) / dimensions.length,
  );

  const improvementSuggestions: string[] = [];
  if (ctaScore < 80) improvementSuggestions.push('Add a clear booking/contact CTA.');
  if (vagueHits.length > 0) {
    improvementSuggestions.push(`Remove vague claims: ${vagueHits.join(', ')}.`);
  }
  if (hashtags.length > 8) improvementSuggestions.push('Reduce hashtags to a focused set.');
  if (brandHits.length === 0) {
    improvementSuggestions.push('Mention licensed/local/tidy standards where true.');
  }
  if (body.length < 80) improvementSuggestions.push('Expand the draft with one concrete homeowner benefit.');

  const videoReviewSuggestions = [
    'If filming: open with the problem in the first 3 seconds.',
    'Add captions for silent viewing.',
    'Only use real job footage with customer consent — never invent before/after proof.',
  ];

  const engagementPrediction =
    input.allowHeuristic === false
      ? {
          availability: 'unavailable' as const,
          band: null,
          rationale: 'Engagement history unavailable — prediction not invented.',
        }
      : {
          availability: 'heuristic' as const,
          band:
            overallScore >= 75 ? ('high' as const) : overallScore >= 55 ? ('medium' as const) : ('low' as const),
          rationale:
            'Heuristic from draft structure only — not historical engagement metrics (none available).',
        };

  return {
    overallScore,
    availability: 'available',
    dimensions,
    brandConsistency: {
      status: brandStatus,
      findings: [
        ...vagueHits.map((v) => `Vague claim: ${v}`),
        ...brandHits.map((b) => `Brand-aligned term: ${b}`),
        ...(brandHits.length === 0 ? ['No brand-aligned trust terms detected'] : []),
      ],
    },
    engagementPrediction,
    improvementSuggestions,
    videoReviewSuggestions,
  };
}

// ─── Reputation / sentiment ───────────────────────────────────────────────────

const POSITIVE = ['thank', 'great', 'excellent', 'amazing', 'professional', 'recommend', 'happy'];
const NEGATIVE = ['terrible', 'awful', 'rude', 'late', 'disappointed', 'refund', 'complaint', 'worst'];

export function detectCriReviewSentiment(input: {
  body?: string | null;
  rating?: number | null;
}): {
  sentiment: CriSentiment;
  confidence: number | null;
  rationale: string;
} {
  const body = input.body?.trim().toLowerCase() ?? '';
  const rating = input.rating;

  if (!body && (rating == null || Number.isNaN(rating))) {
    return {
      sentiment: 'unavailable',
      confidence: null,
      rationale: 'No review text or rating — sentiment unavailable (not invented).',
    };
  }

  const pos = POSITIVE.filter((k) => body.includes(k));
  const neg = NEGATIVE.filter((k) => body.includes(k));

  if (pos.length === 0 && neg.length === 0 && rating == null) {
    return {
      sentiment: 'unavailable',
      confidence: null,
      rationale: 'No clear lexical or rating signal — sentiment unavailable (not invented).',
    };
  }

  if (pos.length > 0 && neg.length > 0) {
    return {
      sentiment: 'mixed',
      confidence: Math.min(90, 50 + (pos.length + neg.length) * 8),
      rationale: 'Both positive and negative lexical signals detected.',
    };
  }
  if (neg.length > 0 || (rating != null && rating <= 2)) {
    return {
      sentiment: 'negative',
      confidence: Math.min(92, 55 + neg.length * 10 + (rating != null && rating <= 2 ? 10 : 0)),
      rationale: 'Negative lexical and/or low rating signal.',
    };
  }
  if (pos.length > 0 || (rating != null && rating >= 4)) {
    return {
      sentiment: 'positive',
      confidence: Math.min(92, 55 + pos.length * 10 + (rating != null && rating >= 4 ? 10 : 0)),
      rationale: 'Positive lexical and/or high rating signal.',
    };
  }
  if (rating != null && rating === 3) {
    return {
      sentiment: 'neutral',
      confidence: 60,
      rationale: 'Mid rating with no lexical polarity.',
    };
  }
  return {
    sentiment: 'unavailable',
    confidence: null,
    rationale: 'Insufficient signal — sentiment unavailable (not invented).',
  };
}

export function buildCriReputationSnapshot(input: {
  reviews: Array<{ rating: number | null; sentiment: CriSentiment }>;
}): CriReputationSnapshot {
  const reviewCount = input.reviews.length;
  if (reviewCount === 0) {
    return {
      availability: 'unavailable',
      reviewCount: 0,
      averageRating: null,
      reputationScore: null,
      sentimentBreakdown: {
        positive: 0,
        neutral: 0,
        negative: 0,
        mixed: 0,
        unavailable: 0,
      },
      csatInsight:
        'No real review rows yet — CSAT / reputation unavailable (not invented). Connect social monitoring reviews or enter Owner-verified reviews.',
      rationale: 'Reputation scoring requires real stored reviews.',
    };
  }

  const ratings = input.reviews
    .map((r) => r.rating)
    .filter((r): r is number => typeof r === 'number' && !Number.isNaN(r));
  const averageRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : null;

  const sentimentBreakdown = {
    positive: input.reviews.filter((r) => r.sentiment === 'positive').length,
    neutral: input.reviews.filter((r) => r.sentiment === 'neutral').length,
    negative: input.reviews.filter((r) => r.sentiment === 'negative').length,
    mixed: input.reviews.filter((r) => r.sentiment === 'mixed').length,
    unavailable: input.reviews.filter((r) => r.sentiment === 'unavailable').length,
  };

  const scoredSentiments = reviewCount - sentimentBreakdown.unavailable;
  let reputationScore: number | null = null;
  if (averageRating != null || scoredSentiments > 0) {
    const ratingComponent = averageRating != null ? (averageRating / 5) * 70 : 35;
    const sentimentComponent =
      scoredSentiments > 0
        ? (sentimentBreakdown.positive / scoredSentiments) * 30
        : 0;
    reputationScore = Math.round(ratingComponent + sentimentComponent);
  }

  return {
    availability: reputationScore == null ? 'unavailable' : 'available',
    reviewCount,
    averageRating,
    reputationScore,
    sentimentBreakdown,
    csatInsight:
      reputationScore == null
        ? 'Reviews present but insufficient rating/sentiment signal for CSAT insight.'
        : `Based on ${reviewCount} real review row(s)` +
          (averageRating != null ? ` (avg rating ${averageRating})` : '') +
          `. Negative: ${sentimentBreakdown.negative}; positive: ${sentimentBreakdown.positive}.`,
    rationale: 'Derived only from stored review rows — never invented competitors or fake scores.',
  };
}

export function buildCriReviewResponseDraft(input: {
  authorName?: string | null;
  body: string;
  sentiment: CriSentiment;
  rating?: number | null;
}): { title: string; body: string } {
  const author = input.authorName?.trim() || 'there';
  const snippet = input.body.trim().slice(0, 160);
  const tone =
    input.sentiment === 'negative' || (input.rating != null && input.rating <= 2)
      ? 'We are sorry this fell short of expectations and would like to make it right.'
      : 'Thank you for sharing your experience — we appreciate your feedback.';

  return {
    title: `Review response draft — ${author}`.slice(0, 200),
    body: [
      `Hi ${author},`,
      '',
      tone,
      snippet ? `Regarding: "${snippet}${input.body.trim().length > 160 ? '…' : ''}"` : null,
      '',
      'Please reply with a convenient time and we will follow up personally.',
      '',
      '(Reputation draft only — not sent. Owner approval required. No automatic review replies.)',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function listCriAuraConnections(): CriAuraConnection[] {
  return [
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'available_link',
      note: 'Surface marketing reputation insights toward Command Centre when useful.',
    },
    {
      target: 'executive_dashboard',
      label: 'Executive / Mission Control',
      href: '/mission-control',
      status: 'registry_stub',
      note: 'Executive dashboard handoff is informational when that surface is available.',
    },
    {
      target: 'marketing_agent',
      label: 'Marketing Agent',
      href: '/marketing-agent',
      status: 'available_link',
      note: 'Content drafts and campaigns remain on Marketing Agent — this layer scores and suggests.',
    },
    {
      target: 'social_media',
      label: 'Social Media Integrations',
      href: '/social-media-integrations',
      status: 'available_link',
      note: 'Review tracking can use real social monitoring review rows when ingested.',
    },
    {
      target: 'communication_timeline',
      label: 'Communication Timeline',
      href: '/communication-timeline',
      status: 'available_link',
      note: 'Align reputation follow-ups with real customer communication history.',
    },
    {
      target: 'customer_360',
      label: 'Customer / CRM',
      href: '/crm',
      status: 'available_link',
      note: 'Customer 360 / CRM context when linking reviews — never invent customers.',
    },
    {
      target: 'cx',
      label: 'Customer Experience',
      href: '/customer-experience',
      status: 'available_link',
      note: 'Conceptual CX connection for satisfaction signals when CX reviews exist.',
    },
  ];
}

export const CRI_PRODUCT_COPY = {
  marketingAgent:
    'Marketing Agent Foundation remains the campaign / content draft layer. Content & Reputation Intelligence scores real drafts, expands plumbing suggestion categories, and manages reputation/competitor foundations.',
  socialMedia:
    'Social Media Integration stores platform connections and monitored items (including reviews when synced). This layer does not invent social accounts or engagement.',
  thisLayer:
    'Content & Reputation Intelligence adds content quality scoring, seasonal/trend/video suggestions, review tracking with honest sentiment, Owner-entered competitor observations, and AURA insight handoffs. Outbound drafts require Owner approval — never auto-publish or auto-reply.',
} as const;
