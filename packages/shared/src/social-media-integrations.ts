/**
 * Social Media Integration Layer (Department 3.2)
 *
 * Extends Marketing Agent Foundation (`1207f17` / migration 0136) with:
 * - Platform connection records (FB/IG/TikTok/LinkedIn/GBP)
 * - Honest status / provider info / permissions / health / disconnect
 * - Encrypted credential storage (no plaintext)
 * - Monitoring foundation for real synced items only
 * - Marketing Agent publishing handoff (approval-gated)
 *
 * Invariants:
 * - No fake accounts, demo social data, or invented engagement metrics
 * - No automatic posting; no automatic replies
 * - AI may analyse / suggest / draft only — Owner approval required to publish/reply
 * - Never claim "connected" without stored credentials
 * - Live OAuth remains additive — foundation uses not_configured / disconnect honesty
 */

import {
  canAccessMarketingAgent,
  canApproveMarketingAgentPublish,
  canWriteMarketingAgent,
} from './marketing-agent.js';

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'google_business';

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'google_business',
];

export type SocialConnectionStatus =
  | 'not_configured'
  | 'awaiting_credentials'
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'error';

export const SOCIAL_CONNECTION_STATUSES: SocialConnectionStatus[] = [
  'not_configured',
  'awaiting_credentials',
  'connected',
  'degraded',
  'disconnected',
  'error',
];

export type SocialItemKind =
  | 'comment'
  | 'message'
  | 'mention'
  | 'review'
  | 'engagement_event';

export const SOCIAL_ITEM_KINDS: SocialItemKind[] = [
  'comment',
  'message',
  'mention',
  'review',
  'engagement_event',
];

export type SocialSyncStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

export type SocialOutboundKind = 'publish_post' | 'reply_comment' | 'reply_message' | 'reply_review';

export type SocialOutboundDraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'publish_gated';

export type SocialPermissionFlags = {
  readComments: boolean;
  readMessages: boolean;
  readMentions: boolean;
  readReviews: boolean;
  readEngagement: boolean;
  allowOutboundPublish: false;
  allowAutoReply: false;
};

export type SocialProviderInfo = {
  platform: SocialPlatform;
  label: string;
  providerFamily: 'meta' | 'tiktok' | 'linkedin' | 'google';
  oauthAppConfigured: boolean;
  authorizeUrlAvailable: false;
  syncAvailable: false;
  publishAvailable: false;
};

export type SocialConnectionHealth = {
  status: SocialConnectionStatus;
  healthy: boolean;
  hasCredentials: boolean;
  oauthAppConfigured: boolean;
  liveProviderVerified: false;
  lastHealthCheckAt: string | null;
  lastHealthMessage: string | null;
  lastError: string | null;
};

export type SocialConnectionSummary = {
  id: string | null;
  platform: SocialPlatform;
  displayName: string;
  externalAccountId: string | null;
  pageOrProfileUrl: string | null;
  status: SocialConnectionStatus;
  hasCredentials: boolean;
  oauthAppConfigured: boolean;
  liveProviderVerified: false;
  provider: SocialProviderInfo;
  health: SocialConnectionHealth;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  permissions: SocialPermissionFlags;
  connectedAt: string | null;
  disconnectedAt: string | null;
  updatedAt: string | null;
};

export type SocialSyncRunSummary = {
  id: string;
  platform: SocialPlatform;
  status: SocialSyncStatus;
  startedAt: string | null;
  finishedAt: string | null;
  itemsIngested: number;
  message: string;
  createdAt: string;
};

export type SocialActivityEventSummary = {
  id: string;
  platform: SocialPlatform | null;
  eventType: string;
  statusBefore: string | null;
  statusAfter: string | null;
  message: string | null;
  createdAt: string;
};

export type SocialMonitoredItemSummary = {
  id: string;
  platform: SocialPlatform;
  itemKind: SocialItemKind;
  externalItemId: string | null;
  authorName: string | null;
  body: string;
  occurredAt: string | null;
  engagementScore: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SocialOutboundDraftSummary = {
  id: string;
  platform: SocialPlatform;
  outboundKind: SocialOutboundKind;
  status: SocialOutboundDraftStatus;
  title: string;
  body: string;
  targetItemId: string | null;
  marketingDraftId: string | null;
  autoPublish: false;
  socialPublishAvailable: false;
  decidedAt: string | null;
  createdAt: string;
};

export type SocialPlatformHonesty = {
  platform: SocialPlatform;
  label: string;
  oauthAppConfigured: boolean;
  liveSyncAvailable: false;
  livePublishAvailable: false;
  note: string;
};

export type SocialMarketingAgentLink = {
  href: string;
  label: string;
  note: string;
  pendingMarketingDraftsLinked: number;
  publishingWorkflow: {
    stages: ['draft', 'pending_approval', 'approved', 'execute_gated'];
    autoPublish: false;
    autoReply: false;
  };
};

export type SocialMediaDashboard = {
  summary: string;
  productClarification: {
    marketingAgent: string;
    thisLayer: string;
    oauthHonesty: string;
  };
  publishPolicy: {
    autoPublishEnabled: false;
    autoReplyEnabled: false;
    requiresOwnerApproval: true;
    draftApprovePublishGated: true;
    livePublishAvailable: false;
    workflow: ['draft', 'owner_review', 'approved', 'execute_gated'];
  };
  connections: SocialConnectionSummary[];
  platforms: SocialPlatformHonesty[];
  marketingAgentLink: SocialMarketingAgentLink;
  monitoredItems: SocialMonitoredItemSummary[];
  outboundDrafts: SocialOutboundDraftSummary[];
  approvalQueue: SocialOutboundDraftSummary[];
  recentSyncRuns: SocialSyncRunSummary[];
  recentActivity: SocialActivityEventSummary[];
  monitoringCounts: {
    comments: number;
    messages: number;
    mentions: number;
    reviews: number;
    engagementEvents: number;
    total: number;
  };
  runtimeHonesty: {
    encryptionKeyConfigured: boolean;
    anyOauthAppConfigured: boolean;
    liveSyncAvailable: false;
    livePublishAvailable: false;
    note: string;
  };
};

export type UpsertSocialConnectionRequest = {
  platform: SocialPlatform;
  displayName?: string;
  externalAccountId?: string;
  pageOrProfileUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  syncEnabled?: boolean;
  permissions?: Partial<
    Pick<
      SocialPermissionFlags,
      'readComments' | 'readMessages' | 'readMentions' | 'readReviews' | 'readEngagement'
    >
  >;
};

export type DisconnectSocialConnectionRequest = { platform: SocialPlatform };
export type RequestSocialSyncRequest = { platform: SocialPlatform };

export type CreateSocialOutboundDraftRequest = {
  platform: SocialPlatform;
  outboundKind: SocialOutboundKind;
  title: string;
  body: string;
  targetItemId?: string;
  marketingDraftId?: string;
  submitForApproval?: boolean;
};

export type SuggestSocialReplyRequest = {
  platform: SocialPlatform;
  targetItemId: string;
  outboundKind?: Extract<SocialOutboundKind, 'reply_comment' | 'reply_message' | 'reply_review'>;
  submitForApproval?: boolean;
};

export type DecideSocialOutboundDraftRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type RequestSocialOutboundPublishRequest = { notes?: string };

export type QueueMarketingDraftForSocialRequest = {
  marketingDraftId: string;
  platform: SocialPlatform;
  submitForApproval?: boolean;
};

export type SocialHealthCheckResult = {
  platform: SocialPlatform;
  ok: boolean;
  status: SocialConnectionStatus;
  message: string;
  health: SocialConnectionHealth;
  liveProviderVerified: false;
};

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  google_business: 'Google Business Profile',
};

export const SOCIAL_MEDIA_PRODUCT_COPY = {
  marketingAgent:
    'Marketing Agent Foundation remains the campaign / content draft / recommendation layer. Approved drafts can enter this layer’s gated publishing workflow.',
  thisLayer:
    'Social Media Integration Layer stores account connection settings, honest status/health, sync foundation, and real monitored items when ingested. AI may draft replies/posts for Owner approval — never auto-posts or auto-replies.',
  oauthHonesty:
    'Live Meta / TikTok / LinkedIn / Google Business OAuth apps are not configured unless env flags are present. Saving settings stores local connection state; "connected" requires encrypted credentials and never means a verified live OAuth session until providers are wired.',
} as const;

export function canAccessSocialMediaIntegrations(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canAccessMarketingAgent(identity);
}

export function canWriteSocialMediaIntegrations(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canWriteMarketingAgent(identity);
}

export function canApproveSocialOutbound(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveMarketingAgentPublish(identity);
}

export function defaultSocialPermissions(): SocialPermissionFlags {
  return {
    readComments: true,
    readMessages: true,
    readMentions: true,
    readReviews: true,
    readEngagement: true,
    allowOutboundPublish: false,
    allowAutoReply: false,
  };
}

export function socialProviderFamily(
  platform: SocialPlatform,
): SocialProviderInfo['providerFamily'] {
  if (platform === 'facebook' || platform === 'instagram') return 'meta';
  if (platform === 'tiktok') return 'tiktok';
  if (platform === 'linkedin') return 'linkedin';
  return 'google';
}

export function buildSocialProviderInfo(
  platform: SocialPlatform,
  oauthAppConfigured: boolean,
): SocialProviderInfo {
  return {
    platform,
    label: SOCIAL_PLATFORM_LABELS[platform],
    providerFamily: socialProviderFamily(platform),
    oauthAppConfigured,
    authorizeUrlAvailable: false,
    syncAvailable: false,
    publishAvailable: false,
  };
}

export function buildSocialConnectionHealth(input: {
  status: SocialConnectionStatus;
  hasCredentials: boolean;
  oauthAppConfigured: boolean;
  lastError?: string | null;
  lastHealthCheckAt?: string | null;
  lastHealthMessage?: string | null;
}): SocialConnectionHealth {
  return {
    status: input.status,
    healthy: input.status === 'connected' && input.hasCredentials && !input.lastError,
    hasCredentials: input.hasCredentials,
    oauthAppConfigured: input.oauthAppConfigured,
    liveProviderVerified: false,
    lastHealthCheckAt: input.lastHealthCheckAt ?? null,
    lastHealthMessage:
      input.lastHealthMessage ??
      (input.hasCredentials
        ? 'Encrypted credentials present. Live provider probe not available in this foundation.'
        : 'No credentials stored — status cannot be Connected.'),
    lastError: input.lastError ?? null,
  };
}

export function formatSocialConnectionStatus(status: SocialConnectionStatus): string {
  switch (status) {
    case 'not_configured':
      return 'Not configured';
    case 'awaiting_credentials':
      return 'Awaiting credentials';
    case 'connected':
      return 'Credentials stored';
    case 'degraded':
      return 'Degraded';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}

export function buildSocialPlatformHonesty(input: {
  oauthConfiguredByPlatform: Partial<Record<SocialPlatform, boolean>>;
}): SocialPlatformHonesty[] {
  return SOCIAL_PLATFORMS.map((platform) => {
    const oauthAppConfigured = Boolean(input.oauthConfiguredByPlatform[platform]);
    return {
      platform,
      label: SOCIAL_PLATFORM_LABELS[platform],
      oauthAppConfigured,
      liveSyncAvailable: false,
      livePublishAvailable: false,
      note: oauthAppConfigured
        ? `${SOCIAL_PLATFORM_LABELS[platform]} OAuth app env detected, but live authorize/sync/publish probes are not wired in this foundation.`
        : `${SOCIAL_PLATFORM_LABELS[platform]} OAuth is not configured. You may store connection settings and optional encrypted tokens locally; status stays honest (not_configured / awaiting_credentials / credentials stored).`,
    };
  });
}

export function buildSocialReplySuggestion(input: {
  platform: SocialPlatform;
  itemKind: SocialItemKind;
  authorName?: string | null;
  body: string;
}): { title: string; body: string } {
  const author = input.authorName?.trim() || 'there';
  const snippet = input.body.trim().slice(0, 180);
  const kindLabel =
    input.itemKind === 'review'
      ? 'review'
      : input.itemKind === 'message'
        ? 'message'
        : input.itemKind === 'mention'
          ? 'mention'
          : 'comment';

  return {
    title: `Suggested ${kindLabel} reply — ${SOCIAL_PLATFORM_LABELS[input.platform]}`.slice(0, 200),
    body: [
      `Hi ${author},`,
      '',
      `Thank you for your ${kindLabel}. We appreciate you taking the time to reach out.`,
      snippet
        ? `Regarding: "${snippet}${input.body.trim().length > 180 ? '…' : ''}"`
        : null,
      '',
      'We would like to help — please share a convenient time or contact detail and our team will follow up.',
      '',
      `(Marketing / Social draft only — not sent. Owner approval required. No automatic replies on ${SOCIAL_PLATFORM_LABELS[input.platform]}.)`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function emptySocialMonitoringCounts(): SocialMediaDashboard['monitoringCounts'] {
  return {
    comments: 0,
    messages: 0,
    mentions: 0,
    reviews: 0,
    engagementEvents: 0,
    total: 0,
  };
}
