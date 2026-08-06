/**
 * Marketing Agent Foundation (Department 3.1)
 *
 * Campaign management, content intelligence (draft templates/generators),
 * recommendations, and analytics over real stored marketing activity only.
 *
 * Invariants:
 * - AI / rule-based drafts only — never invent published posts or engagement
 * - Owner approval required before any publish-sensitive action
 * - No uncontrolled posting; social publish execute is gated until integrations exist
 * - Analytics empty/unavailable when no real stored activity
 * - Extends existing marketing / enterprise marketing intelligence — does not replace them
 */

export type MktAgentChannel =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'google_business'
  | 'website'
  | 'email'
  | 'other';

export type MktAgentCampaignStatus =
  | 'draft'
  | 'planned'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type MktAgentContentKind =
  | 'post_idea'
  | 'caption'
  | 'hashtags'
  | 'campaign_idea'
  | 'seasonal_promo'
  | 'educational'
  | 'plumbing_tip';

export type MktAgentDraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'publish_gated';

export type MktAgentGoalStatus = 'active' | 'completed' | 'cancelled';

export type MktAgentRecommendationKind =
  | 'campaign_idea'
  | 'content_plan'
  | 'seasonal_promo'
  | 'channel_focus'
  | 'performance_review'
  | 'aura_handoff';

export type MktAgentRecommendationStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type MktAgentAuraHandoffTarget =
  | 'command_centre'
  | 'customer_intelligence'
  | 'market_intelligence'
  | 'communication_timeline'
  | 'enterprise_marketing_intelligence';

export type MktAgentCampaignSummary = {
  id: string;
  name: string;
  objective: string;
  status: MktAgentCampaignStatus;
  channels: MktAgentChannel[];
  startDate: string | null;
  endDate: string | null;
  goalId: string | null;
  notes: string | null;
  /** Always false — campaigns do not auto-publish. */
  autoPublish: false;
  createdAt: string;
  updatedAt: string;
};

export type MktAgentContentDraftSummary = {
  id: string;
  campaignId: string | null;
  contentKind: MktAgentContentKind;
  channel: MktAgentChannel;
  status: MktAgentDraftStatus;
  title: string;
  body: string;
  hashtags: string[];
  /** Always false — drafts never auto-publish. */
  autoPublish: false;
  /** Social integrations not live — publish execute remains gated. */
  socialPublishAvailable: false;
  decidedAt: string | null;
  createdAt: string;
};

export type MktAgentGoalSummary = {
  id: string;
  title: string;
  description: string;
  status: MktAgentGoalStatus;
  targetMetric: string | null;
  /** Null when no real measured value exists — never invented. */
  currentValue: number | null;
  targetValue: number | null;
  createdAt: string;
};

export type MktAgentRecommendationSummary = {
  id: string;
  kind: MktAgentRecommendationKind;
  status: MktAgentRecommendationStatus;
  title: string;
  recommendation: string;
  channel: MktAgentChannel | null;
  campaignId: string | null;
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type MktAgentAuraConnection = {
  target: MktAgentAuraHandoffTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type MktAgentAnalytics = {
  campaignCount: number;
  draftCount: number;
  pendingApprovals: number;
  approvedDrafts: number;
  rejectedDrafts: number;
  activeGoals: number;
  pendingRecommendations: number;
  /**
   * Engagement metrics — only present when real published/engagement data exists.
   * Foundation has no live social integrations; these stay unavailable.
   */
  engagement: {
    availability: 'unavailable' | 'available';
    impressions: number | null;
    clicks: number | null;
    engagements: number | null;
    rationale: string;
  };
  opportunities: Array<{
    id: string;
    title: string;
    detail: string;
    source: 'stored_drafts' | 'stored_campaigns' | 'stored_goals' | 'recommendation';
  }>;
};

export type MktAgentDashboard = {
  summary: string;
  productClarification: {
    existingMarketing: string;
    enterpriseMarketingIntelligence: string;
    thisLayer: string;
    socialIntegrations: string;
  };
  publishPolicy: {
    autoPublishEnabled: false;
    requiresOwnerApproval: true;
    draftApprovePublishGated: true;
    socialIntegrationsLive: false;
  };
  campaigns: MktAgentCampaignSummary[];
  contentDrafts: MktAgentContentDraftSummary[];
  goals: MktAgentGoalSummary[];
  recommendations: MktAgentRecommendationSummary[];
  analytics: MktAgentAnalytics;
  auraConnections: MktAgentAuraConnection[];
  contentTemplates: MktAgentContentTemplate[];
};

export type MktAgentContentTemplate = {
  contentKind: MktAgentContentKind;
  channel: MktAgentChannel;
  title: string;
  body: string;
  hashtags: string[];
  industry: 'plumbing' | 'general_trade' | 'educational';
};

export type CreateMktAgentCampaignRequest = {
  name: string;
  objective: string;
  channels?: MktAgentChannel[];
  startDate?: string;
  endDate?: string;
  goalId?: string;
  notes?: string;
};

export type UpdateMktAgentCampaignRequest = {
  name?: string;
  objective?: string;
  status?: MktAgentCampaignStatus;
  channels?: MktAgentChannel[];
  startDate?: string | null;
  endDate?: string | null;
  goalId?: string | null;
  notes?: string | null;
};

export type CreateMktAgentContentDraftRequest = {
  campaignId?: string;
  contentKind: MktAgentContentKind;
  channel: MktAgentChannel;
  title: string;
  body: string;
  hashtags?: string[];
  submitForApproval?: boolean;
};

export type GenerateMktAgentContentRequest = {
  contentKind: MktAgentContentKind;
  channel?: MktAgentChannel;
  campaignId?: string;
  topicHint?: string;
  submitForApproval?: boolean;
};

export type DecideMktAgentDraftRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type RequestMktAgentPublishRequest = {
  notes?: string;
};

export type CreateMktAgentGoalRequest = {
  title: string;
  description: string;
  targetMetric?: string;
  targetValue?: number;
};

export type CreateMktAgentRecommendationRequest = {
  kind: MktAgentRecommendationKind;
  title: string;
  recommendation: string;
  channel?: MktAgentChannel;
  campaignId?: string;
};

export type DecideMktAgentRecommendationRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

// ─── Access helpers ───────────────────────────────────────────────────────────

export function canAccessMarketingAgent(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('marketing:read') ||
    identity.permissions.includes('marketing:write') ||
    identity.permissions.includes('marketing_intelligence:read') ||
    identity.permissions.includes('marketing_intelligence:write') ||
    identity.permissions.includes('marketing_intelligence:manage') ||
    identity.permissions.includes('agents:read')
  );
}

export function canWriteMarketingAgent(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessMarketingAgent(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('marketing:write') ||
    identity.permissions.includes('marketing_intelligence:write') ||
    identity.permissions.includes('marketing_intelligence:manage')
  );
}

/** Owner (or marketing_intelligence:manage / *) may approve publish-sensitive drafts. */
export function canApproveMarketingAgentPublish(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canWriteMarketingAgent(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  if (identity.permissions.includes('marketing_intelligence:manage')) return true;
  return (
    identity.roleName === 'Company Owner' ||
    identity.roleName === 'Owner' ||
    identity.roleName === 'Platform Owner'
  );
}

// ─── Content intelligence (rule templates — not fake published posts) ─────────

const PLUMBING_HASHTAGS = [
  '#Plumbing',
  '#Plumber',
  '#HomeMaintenance',
  '#LeakRepair',
  '#DrainCleaning',
  '#WaterHeater',
  '#TradeTips',
];

const SEASONAL_HINTS: Array<{ month: number; title: string; body: string }> = [
  {
    month: 5,
    title: 'Winter pipe protection reminder',
    body: 'Draft seasonal tip: remind customers to insulate exposed pipes and know the main shut-off before cold snaps. (Draft only — not published.)',
  },
  {
    month: 11,
    title: 'Summer geyser / cooling load tip',
    body: 'Draft seasonal tip: check geyser pressure valves and schedule preventive maintenance before peak summer demand. (Draft only — not published.)',
  },
  {
    month: 3,
    title: 'Autumn gutter & drain prep',
    body: 'Draft seasonal tip: clear outdoor drains and check for early blockage signs before heavy rains. (Draft only — not published.)',
  },
];

export function buildMktAgentContentTemplate(input: {
  contentKind: MktAgentContentKind;
  channel?: MktAgentChannel;
  topicHint?: string;
  now?: Date;
}): MktAgentContentTemplate {
  const channel = input.channel ?? 'instagram';
  const topic = input.topicHint?.trim() || 'reliable plumbing service';
  const now = input.now ?? new Date();

  switch (input.contentKind) {
    case 'hashtags':
      return {
        contentKind: 'hashtags',
        channel,
        title: `Hashtag set — ${topic}`.slice(0, 200),
        body: 'Suggested hashtag set for Owner review. Not posted.',
        hashtags: PLUMBING_HASHTAGS,
        industry: 'plumbing',
      };
    case 'caption':
      return {
        contentKind: 'caption',
        channel,
        title: `Caption draft — ${topic}`.slice(0, 200),
        body: [
          `Looking for help with ${topic}?`,
          '',
          'Our licensed team handles diagnostics, clear quotes, and tidy workmanship.',
          'Reply or book through your preferred channel — this is an Owner-approved draft only until published.',
          '',
          '(Marketing Agent draft — nothing was posted to social platforms.)',
        ].join('\n'),
        hashtags: PLUMBING_HASHTAGS.slice(0, 4),
        industry: 'plumbing',
      };
    case 'educational':
    case 'plumbing_tip':
      return {
        contentKind: input.contentKind,
        channel,
        title: `Educational tip — ${topic}`.slice(0, 200),
        body: [
          `Tip: For ${topic}, start with the simplest safe check before calling for emergency service.`,
          '',
          '1) Note any unusual sounds, smells, or water stains.',
          '2) Know where your main water shut-off is.',
          '3) Photograph the issue for a faster diagnosis.',
          '',
          'Educational draft for Owner approval — not a published post and not medical/legal advice.',
        ].join('\n'),
        hashtags: ['#PlumbingTips', '#HomeMaintenance', '#TradeEducation'],
        industry: 'educational',
      };
    case 'seasonal_promo': {
      const month = now.getUTCMonth() + 1;
      const seasonal =
        SEASONAL_HINTS.find((s) => s.month === month) ??
        SEASONAL_HINTS[0]!;
      return {
        contentKind: 'seasonal_promo',
        channel,
        title: seasonal.title,
        body: `${seasonal.body}\n\nTopic focus: ${topic}`,
        hashtags: ['#SeasonalMaintenance', '#Plumbing', '#PreventiveCare'],
        industry: 'plumbing',
      };
    }
    case 'campaign_idea':
      return {
        contentKind: 'campaign_idea',
        channel,
        title: `Campaign idea — ${topic}`.slice(0, 200),
        body: [
          `Proposed campaign theme: ${topic}`,
          '',
          'Suggested plan (draft):',
          '- Week 1: educational tip posts (Owner approve each draft)',
          '- Week 2: before/after workmanship story (with customer consent)',
          '- Week 3: maintenance checklist CTA',
          '',
          'No posts are scheduled or published automatically. Social channel integrations are not live in this foundation.',
        ].join('\n'),
        hashtags: PLUMBING_HASHTAGS.slice(0, 3),
        industry: 'plumbing',
      };
    case 'post_idea':
    default:
      return {
        contentKind: 'post_idea',
        channel,
        title: `Post idea — ${topic}`.slice(0, 200),
        body: [
          `Idea: Share a short ${channel} post about ${topic}.`,
          '',
          'Angle: practical homeowner value + clear CTA to book a diagnostic.',
          'Tone: professional, local, no exaggerated claims.',
          '',
          'This is a draft idea for Owner approval — not published.',
        ].join('\n'),
        hashtags: PLUMBING_HASHTAGS.slice(0, 5),
        industry: 'plumbing',
      };
  }
}

export function listDefaultMktAgentContentTemplates(now?: Date): MktAgentContentTemplate[] {
  const kinds: MktAgentContentKind[] = [
    'post_idea',
    'caption',
    'hashtags',
    'campaign_idea',
    'seasonal_promo',
    'educational',
    'plumbing_tip',
  ];
  return kinds.map((contentKind) =>
    buildMktAgentContentTemplate({ contentKind, now }),
  );
}

export function emptyMktAgentEngagement(): MktAgentAnalytics['engagement'] {
  return {
    availability: 'unavailable',
    impressions: null,
    clicks: null,
    engagements: null,
    rationale:
      'No live social engagement data — platform integrations (Facebook, Instagram, TikTok, LinkedIn, Google Business) are not connected in this foundation. Metrics are not invented.',
  };
}

export function buildMktAgentAnalyticsFromCounts(input: {
  campaignCount: number;
  draftCount: number;
  pendingApprovals: number;
  approvedDrafts: number;
  rejectedDrafts: number;
  activeGoals: number;
  pendingRecommendations: number;
  opportunities?: MktAgentAnalytics['opportunities'];
}): MktAgentAnalytics {
  return {
    campaignCount: input.campaignCount,
    draftCount: input.draftCount,
    pendingApprovals: input.pendingApprovals,
    approvedDrafts: input.approvedDrafts,
    rejectedDrafts: input.rejectedDrafts,
    activeGoals: input.activeGoals,
    pendingRecommendations: input.pendingRecommendations,
    engagement: emptyMktAgentEngagement(),
    opportunities: input.opportunities ?? [],
  };
}

export function listMktAgentAuraConnections(): MktAgentAuraConnection[] {
  return [
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'registry_stub',
      note: 'Conceptual handoff — Command Centre may still be in progress; link is for Owner navigation only.',
    },
    {
      target: 'customer_intelligence',
      label: 'Customer / CRM',
      href: '/crm',
      status: 'available_link',
      note: 'Use CRM customer context when planning campaigns; Marketing Agent does not invent customers.',
    },
    {
      target: 'market_intelligence',
      label: 'Market Intelligence',
      href: '/sales-intelligence',
      status: 'registry_stub',
      note: 'Market Intelligence remains a roadmap / adjacent surface — handoff is informational.',
    },
    {
      target: 'communication_timeline',
      label: 'Communication Timeline',
      href: '/communication-timeline',
      status: 'available_link',
      note: 'Align campaign messaging with real customer communication history when available.',
    },
    {
      target: 'enterprise_marketing_intelligence',
      label: 'Marketing Intelligence',
      href: '/marketing-intelligence',
      status: 'available_link',
      note: 'Existing enterprise marketing intelligence / eligibility surfaces remain the advanced marketing ops layer.',
    },
  ];
}

export const MKT_AGENT_PRODUCT_COPY = {
  existingMarketing:
    'Core Marketing and eligibility/consent surfaces remain for segments, reactivation, and audience approvals.',
  enterpriseMarketingIntelligence:
    'Enterprise Marketing Intelligence covers strategies, campaign plans, and related MI tables — this foundation does not replace it.',
  thisLayer:
    'Marketing Agent Foundation adds campaign/goal scaffolding, plumbing & educational content draft generators, recommendations, and analytics from real stored drafts/campaigns only. AI drafts require Owner approval before any publish path.',
  socialIntegrations:
    'Facebook, Instagram, TikTok, LinkedIn, and Google Business Profile integrations are not live here. Publish execute is honestly gated — approval does not post.',
} as const;
