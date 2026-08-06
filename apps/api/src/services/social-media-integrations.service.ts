import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  buildSocialConnectionHealth,
  buildSocialPlatformHonesty,
  buildSocialProviderInfo,
  buildSocialReplySuggestion,
  canAccessSocialMediaIntegrations,
  canApproveSocialOutbound,
  canWriteSocialMediaIntegrations,
  defaultSocialPermissions,
  emptySocialMonitoringCounts,
  SOCIAL_MEDIA_PRODUCT_COPY,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  type CreateSocialOutboundDraftRequest,
  type DecideSocialOutboundDraftRequest,
  type QueueMarketingDraftForSocialRequest,
  type RequestSocialOutboundPublishRequest,
  type RequestSocialSyncRequest,
  type SocialActivityEventSummary,
  type SocialConnectionStatus,
  type SocialConnectionSummary,
  type SocialHealthCheckResult,
  type SocialItemKind,
  type SocialMediaDashboard,
  type SocialMonitoredItemSummary,
  type SocialOutboundDraftSummary,
  type SocialPlatform,
  type SocialSyncRunSummary,
  type SuggestSocialReplyRequest,
  type UpsertSocialConnectionRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  mktAgentContentDrafts,
  securityAuditLogs,
  socialMediaConnectionEvents,
  socialMediaConnections,
  socialMediaItems,
  socialMediaOutboundDrafts,
  socialMediaSyncRuns,
} from '@titan/db';
import { encryptSocialMediaCredentials } from '../lib/crypto.js';

export class SocialMediaIntegrationsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SocialMediaIntegrationsError';
  }
}

export type SocialMediaActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function envFlag(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function detectSocialOauthAppConfigured(): Record<SocialPlatform, boolean> {
  return {
    facebook:
      envFlag('META_APP_ID') || envFlag('FACEBOOK_APP_ID') || envFlag('META_OAUTH_CLIENT_ID'),
    instagram:
      envFlag('META_APP_ID') || envFlag('INSTAGRAM_APP_ID') || envFlag('META_OAUTH_CLIENT_ID'),
    tiktok: envFlag('TIKTOK_CLIENT_KEY') || envFlag('TIKTOK_APP_ID'),
    linkedin: envFlag('LINKEDIN_CLIENT_ID') || envFlag('LINKEDIN_APP_ID'),
    google_business:
      envFlag('GOOGLE_BUSINESS_CLIENT_ID') ||
      envFlag('GBP_CLIENT_ID') ||
      envFlag('GOOGLE_OAUTH_CLIENT_ID'),
  };
}

export class SocialMediaIntegrationsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
  ) {}

  private assertRead(actor: SocialMediaActor): void {
    if (!canAccessSocialMediaIntegrations(actor)) {
      throw new SocialMediaIntegrationsError(
        'FORBIDDEN',
        'Social Media Integrations require marketing or marketing-intelligence access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: SocialMediaActor): void {
    this.assertRead(actor);
    if (!canWriteSocialMediaIntegrations(actor)) {
      throw new SocialMediaIntegrationsError(
        'FORBIDDEN',
        'Social Media write actions require marketing:write or marketing_intelligence:write.',
      );
    }
  }

  private assertApprove(actor: SocialMediaActor): void {
    this.assertWrite(actor);
    if (!canApproveSocialOutbound(actor)) {
      throw new SocialMediaIntegrationsError(
        'FORBIDDEN',
        'Only Company Owner (or marketing_intelligence:manage) may approve outbound social publish/reply actions.',
      );
    }
  }

  private async recordAudit(
    actor: SocialMediaActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'integrations',
      action,
      entityType: 'social_media_integrations',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoPublish: false,
        autoReply: false,
        socialPublishAvailable: false,
      },
    });
  }

  private async recordEvent(
    actor: SocialMediaActor,
    connectionId: string | null,
    platform: SocialPlatform | null,
    eventType: string,
    statusBefore: string | null,
    statusAfter: string | null,
    message: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db.insert(socialMediaConnectionEvents).values({
      companyId: actor.companyId,
      connectionId,
      platform: platform ?? undefined,
      eventType,
      statusBefore,
      statusAfter,
      message,
      actorUserId: actor.userId,
      metadata,
    });
  }

  private toConnectionSummary(
    row: typeof socialMediaConnections.$inferSelect | null,
    platform: SocialPlatform,
    oauthAppConfigured: boolean,
  ): SocialConnectionSummary {
    const provider = buildSocialProviderInfo(platform, oauthAppConfigured);
    if (!row) {
      const status: SocialConnectionStatus = 'not_configured';
      return {
        id: null,
        platform,
        displayName: SOCIAL_PLATFORM_LABELS[platform],
        externalAccountId: null,
        pageOrProfileUrl: null,
        status,
        hasCredentials: false,
        oauthAppConfigured,
        liveProviderVerified: false,
        provider,
        health: buildSocialConnectionHealth({
          status,
          hasCredentials: false,
          oauthAppConfigured,
        }),
        syncEnabled: false,
        lastSyncedAt: null,
        lastError: null,
        permissions: defaultSocialPermissions(),
        connectedAt: null,
        disconnectedAt: null,
        updatedAt: null,
      };
    }

    const hasCredentials = Boolean(row.credentialsEncrypted);
    let status = row.status as SocialConnectionStatus;
    // Never claim connected without credentials.
    if (status === 'connected' && !hasCredentials) {
      status = 'awaiting_credentials';
    }

    return {
      id: row.id,
      platform,
      displayName: row.displayName || SOCIAL_PLATFORM_LABELS[platform],
      externalAccountId: row.externalAccountId,
      pageOrProfileUrl: row.pageOrProfileUrl,
      status,
      hasCredentials,
      oauthAppConfigured,
      liveProviderVerified: false,
      provider,
      health: buildSocialConnectionHealth({
        status,
        hasCredentials,
        oauthAppConfigured,
        lastError: row.lastError,
        lastHealthCheckAt: row.lastHealthCheckAt?.toISOString() ?? null,
        lastHealthMessage: row.lastHealthMessage,
      }),
      syncEnabled: row.syncEnabled,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastError: row.lastError,
      permissions: {
        readComments: row.readComments,
        readMessages: row.readMessages,
        readMentions: row.readMentions,
        readReviews: row.readReviews,
        readEngagement: row.readEngagement,
        allowOutboundPublish: false,
        allowAutoReply: false,
      },
      connectedAt: row.connectedAt?.toISOString() ?? null,
      disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  private toItem(row: typeof socialMediaItems.$inferSelect): SocialMonitoredItemSummary {
    return {
      id: row.id,
      platform: row.platform as SocialPlatform,
      itemKind: row.itemKind as SocialItemKind,
      externalItemId: row.externalItemId,
      authorName: row.authorName,
      body: row.body,
      occurredAt: row.occurredAt?.toISOString() ?? null,
      engagementScore: row.engagementScore,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toOutbound(
    row: typeof socialMediaOutboundDrafts.$inferSelect,
  ): SocialOutboundDraftSummary {
    return {
      id: row.id,
      platform: row.platform as SocialPlatform,
      outboundKind: row.outboundKind,
      status: row.status,
      title: row.title,
      body: row.body,
      targetItemId: row.targetItemId,
      marketingDraftId: row.marketingDraftId,
      autoPublish: false,
      socialPublishAvailable: false,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSyncRun(row: typeof socialMediaSyncRuns.$inferSelect): SocialSyncRunSummary {
    return {
      id: row.id,
      platform: row.platform as SocialPlatform,
      status: row.status,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      itemsIngested: row.itemsIngested,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toActivity(
    row: typeof socialMediaConnectionEvents.$inferSelect,
  ): SocialActivityEventSummary {
    return {
      id: row.id,
      platform: (row.platform as SocialPlatform | null) ?? null,
      eventType: row.eventType,
      statusBefore: row.statusBefore,
      statusAfter: row.statusAfter,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async loadConnectionRow(companyId: string, platform: SocialPlatform) {
    const [row] = await this.db
      .select()
      .from(socialMediaConnections)
      .where(
        and(
          eq(socialMediaConnections.companyId, companyId),
          eq(socialMediaConnections.platform, platform),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getDashboard(actor: SocialMediaActor): Promise<SocialMediaDashboard> {
    this.assertRead(actor);
    const oauthMap = detectSocialOauthAppConfigured();
    const encryptionKeyConfigured = Boolean(this.encryptionKey);

    const [rows, items, drafts, syncRuns, activity] = await Promise.all([
      this.db
        .select()
        .from(socialMediaConnections)
        .where(eq(socialMediaConnections.companyId, actor.companyId)),
      this.db
        .select()
        .from(socialMediaItems)
        .where(eq(socialMediaItems.companyId, actor.companyId))
        .orderBy(desc(socialMediaItems.createdAt))
        .limit(50),
      this.db
        .select()
        .from(socialMediaOutboundDrafts)
        .where(eq(socialMediaOutboundDrafts.companyId, actor.companyId))
        .orderBy(desc(socialMediaOutboundDrafts.createdAt))
        .limit(50),
      this.db
        .select()
        .from(socialMediaSyncRuns)
        .where(eq(socialMediaSyncRuns.companyId, actor.companyId))
        .orderBy(desc(socialMediaSyncRuns.createdAt))
        .limit(20),
      this.db
        .select()
        .from(socialMediaConnectionEvents)
        .where(eq(socialMediaConnectionEvents.companyId, actor.companyId))
        .orderBy(desc(socialMediaConnectionEvents.createdAt))
        .limit(30),
    ]);

    const byPlatform = new Map(rows.map((r) => [r.platform as SocialPlatform, r]));
    const connections = SOCIAL_PLATFORMS.map((platform) =>
      this.toConnectionSummary(byPlatform.get(platform) ?? null, platform, oauthMap[platform]),
    );

    const monitoringCounts = emptySocialMonitoringCounts();
    for (const item of items) {
      monitoringCounts.total += 1;
      if (item.itemKind === 'comment') monitoringCounts.comments += 1;
      else if (item.itemKind === 'message') monitoringCounts.messages += 1;
      else if (item.itemKind === 'mention') monitoringCounts.mentions += 1;
      else if (item.itemKind === 'review') monitoringCounts.reviews += 1;
      else if (item.itemKind === 'engagement_event') monitoringCounts.engagementEvents += 1;
    }

    const outboundDrafts = drafts.map((row) => this.toOutbound(row));
    const approvalQueue = outboundDrafts.filter(
      (d) => d.status === 'pending_approval' || d.status === 'approved',
    );
    const pendingMarketingDraftsLinked = outboundDrafts.filter((d) => d.marketingDraftId).length;

    const anyOauth = SOCIAL_PLATFORMS.some((p) => oauthMap[p]);
    const configuredCount = connections.filter((c) => c.status !== 'not_configured').length;
    const credentialCount = connections.filter((c) => c.hasCredentials).length;

    const summary =
      configuredCount === 0
        ? 'No social platforms configured. Save connection settings per channel when ready. Live OAuth authorize/sync/publish is not wired — monitoring stays empty until real items are ingested.'
        : `${configuredCount} platform setting(s) saved; ${credentialCount} with encrypted credentials. Live provider sync/publish remains unavailable — monitored items show only real ingested rows (currently ${monitoringCounts.total}).`;

    return {
      summary,
      productClarification: { ...SOCIAL_MEDIA_PRODUCT_COPY },
      publishPolicy: {
        autoPublishEnabled: false,
        autoReplyEnabled: false,
        requiresOwnerApproval: true,
        draftApprovePublishGated: true,
        livePublishAvailable: false,
        workflow: ['draft', 'owner_review', 'approved', 'execute_gated'],
      },
      connections,
      platforms: buildSocialPlatformHonesty({ oauthConfiguredByPlatform: oauthMap }),
      marketingAgentLink: {
        href: '/marketing-agent',
        label: 'Marketing Agent',
        note: 'Queue Marketing Agent content drafts into this approval-gated publishing workflow. Execute remains gated until live providers exist.',
        pendingMarketingDraftsLinked,
        publishingWorkflow: {
          stages: ['draft', 'pending_approval', 'approved', 'execute_gated'],
          autoPublish: false,
          autoReply: false,
        },
      },
      monitoredItems: items.map((row) => this.toItem(row)),
      outboundDrafts,
      approvalQueue,
      recentSyncRuns: syncRuns.map((row) => this.toSyncRun(row)),
      recentActivity: activity.map((row) => this.toActivity(row)),
      monitoringCounts,
      runtimeHonesty: {
        encryptionKeyConfigured,
        anyOauthAppConfigured: anyOauth,
        liveSyncAvailable: false,
        livePublishAvailable: false,
        note: encryptionKeyConfigured
          ? anyOauth
            ? 'Encryption key present and at least one OAuth app env flag detected. Live authorize/token exchange/sync/publish probes are not implemented — do not treat Connected as a verified live session.'
            : 'Encryption key present. No Meta/TikTok/LinkedIn/GBP OAuth app env configured — connection settings and optional tokens store locally with honest statuses.'
          : 'INTEGRATIONS_ENCRYPTION_KEY is not configured — connection settings can be saved, but credentials cannot be stored.',
      },
    };
  }

  async upsertConnection(
    actor: SocialMediaActor,
    input: UpsertSocialConnectionRequest,
  ): Promise<SocialConnectionSummary> {
    this.assertWrite(actor);
    const platform = input.platform;
    const existing = await this.loadConnectionRow(actor.companyId, platform);
    const statusBefore = (existing?.status as SocialConnectionStatus | undefined) ?? 'not_configured';
    const oauthMap = detectSocialOauthAppConfigured();

    let credentialsEncrypted = existing?.credentialsEncrypted ?? null;
    if (input.accessToken?.trim()) {
      if (!this.encryptionKey) {
        throw new SocialMediaIntegrationsError(
          'NOT_CONFIGURED',
          'INTEGRATIONS_ENCRYPTION_KEY must be configured before storing social media credentials',
        );
      }
      credentialsEncrypted = encryptSocialMediaCredentials(
        {
          version: 1,
          accessToken: input.accessToken.trim(),
          refreshToken: input.refreshToken?.trim() || undefined,
        },
        this.encryptionKey,
      );
    }

    const hasCredentials = Boolean(credentialsEncrypted);
    // Never claim connected without credentials.
    const nextStatus: SocialConnectionStatus = hasCredentials
      ? 'connected'
      : 'awaiting_credentials';

    const perms = {
      ...defaultSocialPermissions(),
      ...(existing
        ? {
            readComments: existing.readComments,
            readMessages: existing.readMessages,
            readMentions: existing.readMentions,
            readReviews: existing.readReviews,
            readEngagement: existing.readEngagement,
          }
        : {}),
      ...(input.permissions ?? {}),
    };

    const now = new Date();
    const values = {
      companyId: actor.companyId,
      platform,
      displayName:
        input.displayName?.trim() || existing?.displayName || SOCIAL_PLATFORM_LABELS[platform],
      externalAccountId:
        input.externalAccountId !== undefined
          ? input.externalAccountId.trim() || null
          : (existing?.externalAccountId ?? null),
      pageOrProfileUrl:
        input.pageOrProfileUrl !== undefined
          ? input.pageOrProfileUrl.trim() || null
          : (existing?.pageOrProfileUrl ?? null),
      status: nextStatus,
      credentialsEncrypted,
      syncEnabled: input.syncEnabled ?? existing?.syncEnabled ?? false,
      readComments: perms.readComments,
      readMessages: perms.readMessages,
      readMentions: perms.readMentions,
      readReviews: perms.readReviews,
      readEngagement: perms.readEngagement,
      allowOutboundPublish: false,
      allowAutoReply: false,
      connectedAt: hasCredentials ? (existing?.connectedAt ?? now) : null,
      disconnectedAt: null,
      lastError: null,
      createdByUserId: existing?.createdByUserId ?? actor.userId,
      metadata: {
        ...(existing?.metadata ?? {}),
        oauthAppConfigured: oauthMap[platform],
        liveProviderVerified: false,
        providerFamily: buildSocialProviderInfo(platform, oauthMap[platform]).providerFamily,
      },
      updatedAt: now,
    };

    let connectionId: string;
    if (existing) {
      await this.db
        .update(socialMediaConnections)
        .set(values)
        .where(eq(socialMediaConnections.id, existing.id));
      connectionId = existing.id;
    } else {
      const [inserted] = await this.db.insert(socialMediaConnections).values(values).returning();
      connectionId = inserted.id;
    }

    await this.recordEvent(
      actor,
      connectionId,
      platform,
      'connection_upserted',
      statusBefore,
      nextStatus,
      hasCredentials
        ? `${SOCIAL_PLATFORM_LABELS[platform]} settings saved with encrypted credentials. Live OAuth not verified.`
        : `${SOCIAL_PLATFORM_LABELS[platform]} settings saved; awaiting credentials. OAuth app ${oauthMap[platform] ? 'env present but authorize flow not wired' : 'not configured'}.`,
      { hasCredentials, oauthAppConfigured: oauthMap[platform] },
    );
    await this.recordAudit(actor, 'social_media_connection_upserted', connectionId, {
      platform,
      status: nextStatus,
      hasCredentials,
      oauthAppConfigured: oauthMap[platform],
    });

    const row = await this.loadConnectionRow(actor.companyId, platform);
    return this.toConnectionSummary(row, platform, oauthMap[platform]);
  }

  async disconnect(
    actor: SocialMediaActor,
    platform: SocialPlatform,
  ): Promise<SocialConnectionSummary> {
    this.assertWrite(actor);
    const existing = await this.loadConnectionRow(actor.companyId, platform);
    if (!existing) {
      throw new SocialMediaIntegrationsError(
        'NOT_FOUND',
        `${SOCIAL_PLATFORM_LABELS[platform]} connection is not configured.`,
      );
    }

    const statusBefore = existing.status;
    const now = new Date();
    await this.db
      .update(socialMediaConnections)
      .set({
        status: 'disconnected',
        credentialsEncrypted: null,
        syncEnabled: false,
        allowOutboundPublish: false,
        allowAutoReply: false,
        disconnectedAt: now,
        connectedAt: null,
        lastError: null,
        lastHealthMessage: 'Disconnected — encrypted credentials cleared.',
        lastHealthCheckAt: now,
        updatedAt: now,
      })
      .where(eq(socialMediaConnections.id, existing.id));

    await this.recordEvent(
      actor,
      existing.id,
      platform,
      'connection_disconnected',
      statusBefore,
      'disconnected',
      `${SOCIAL_PLATFORM_LABELS[platform]} disconnected. Encrypted credentials cleared.`,
    );
    await this.recordAudit(actor, 'social_media_connection_disconnected', existing.id, {
      platform,
    });

    const oauthMap = detectSocialOauthAppConfigured();
    const row = await this.loadConnectionRow(actor.companyId, platform);
    return this.toConnectionSummary(row, platform, oauthMap[platform]);
  }

  async checkHealth(
    actor: SocialMediaActor,
    platform: SocialPlatform,
  ): Promise<SocialHealthCheckResult> {
    this.assertWrite(actor);
    const existing = await this.loadConnectionRow(actor.companyId, platform);
    const oauthMap = detectSocialOauthAppConfigured();
    const oauthAppConfigured = oauthMap[platform];
    const now = new Date();

    if (!existing) {
      const status: SocialConnectionStatus = 'not_configured';
      const message = `${SOCIAL_PLATFORM_LABELS[platform]} is not configured.`;
      return {
        platform,
        ok: false,
        status,
        message,
        health: buildSocialConnectionHealth({
          status,
          hasCredentials: false,
          oauthAppConfigured,
          lastHealthCheckAt: now.toISOString(),
          lastHealthMessage: message,
        }),
        liveProviderVerified: false,
      };
    }

    const hasCredentials = Boolean(existing.credentialsEncrypted);
    let status = existing.status as SocialConnectionStatus;
    if (status === 'connected' && !hasCredentials) status = 'awaiting_credentials';

    const message = !hasCredentials
      ? 'Health check: no encrypted credentials — cannot be Connected. Live provider probe unavailable.'
      : oauthAppConfigured
        ? 'Health check: encrypted credentials present. OAuth app env detected but live probe not wired — not verified live.'
        : 'Health check: encrypted credentials present. OAuth app not configured — local credential health only.';

    await this.db
      .update(socialMediaConnections)
      .set({
        status,
        lastHealthCheckAt: now,
        lastHealthMessage: message,
        updatedAt: now,
      })
      .where(eq(socialMediaConnections.id, existing.id));

    await this.recordEvent(
      actor,
      existing.id,
      platform,
      'health_checked',
      existing.status,
      status,
      message,
      { hasCredentials, oauthAppConfigured, liveProviderVerified: false },
    );
    await this.recordAudit(actor, 'social_media_health_checked', existing.id, {
      platform,
      hasCredentials,
      oauthAppConfigured,
    });

    return {
      platform,
      ok: hasCredentials && status === 'connected',
      status,
      message,
      health: buildSocialConnectionHealth({
        status,
        hasCredentials,
        oauthAppConfigured,
        lastError: existing.lastError,
        lastHealthCheckAt: now.toISOString(),
        lastHealthMessage: message,
      }),
      liveProviderVerified: false,
    };
  }

  async requestSync(
    actor: SocialMediaActor,
    input: RequestSocialSyncRequest,
  ): Promise<SocialSyncRunSummary> {
    this.assertWrite(actor);
    const platform = input.platform;
    const connection = await this.loadConnectionRow(actor.companyId, platform);
    if (!connection) {
      throw new SocialMediaIntegrationsError(
        'NOT_FOUND',
        `${SOCIAL_PLATFORM_LABELS[platform]} connection is not configured. Save settings before requesting sync.`,
      );
    }

    const oauthMap = detectSocialOauthAppConfigured();
    const now = new Date();
    const message = !connection.credentialsEncrypted
      ? 'Sync skipped — no encrypted credentials stored. Live provider sync is not available in this foundation.'
      : !oauthMap[platform]
        ? 'Sync skipped — OAuth app is not configured for this platform. Connection settings retained; no demo items ingested.'
        : 'Sync skipped — OAuth app env detected but live sync probe is not wired in this foundation. No demo items ingested.';

    const [run] = await this.db
      .insert(socialMediaSyncRuns)
      .values({
        companyId: actor.companyId,
        connectionId: connection.id,
        platform,
        status: 'skipped',
        startedAt: now,
        finishedAt: now,
        itemsIngested: 0,
        message,
        requestedByUserId: actor.userId,
        metadata: {
          liveSyncAvailable: false,
          oauthAppConfigured: oauthMap[platform],
          hasCredentials: Boolean(connection.credentialsEncrypted),
        },
      })
      .returning();

    await this.db
      .update(socialMediaConnections)
      .set({ lastSyncedAt: now, lastError: message, updatedAt: now })
      .where(eq(socialMediaConnections.id, connection.id));

    await this.recordEvent(
      actor,
      connection.id,
      platform,
      'sync_requested',
      connection.status,
      connection.status,
      message,
      { syncRunId: run.id, itemsIngested: 0 },
    );
    await this.recordAudit(actor, 'social_media_sync_requested', run.id, {
      platform,
      status: 'skipped',
      itemsIngested: 0,
    });

    return this.toSyncRun(run);
  }

  async listMonitoredItems(actor: SocialMediaActor): Promise<SocialMonitoredItemSummary[]> {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(socialMediaItems)
      .where(eq(socialMediaItems.companyId, actor.companyId))
      .orderBy(desc(socialMediaItems.createdAt))
      .limit(100);
    return rows.map((row) => this.toItem(row));
  }

  async createOutboundDraft(
    actor: SocialMediaActor,
    input: CreateSocialOutboundDraftRequest,
  ): Promise<SocialOutboundDraftSummary> {
    this.assertWrite(actor);
    const connection = await this.loadConnectionRow(actor.companyId, input.platform);

    if (input.targetItemId) {
      const [item] = await this.db
        .select()
        .from(socialMediaItems)
        .where(
          and(
            eq(socialMediaItems.id, input.targetItemId),
            eq(socialMediaItems.companyId, actor.companyId),
          ),
        )
        .limit(1);
      if (!item) {
        throw new SocialMediaIntegrationsError(
          'NOT_FOUND',
          'Target monitored item not found for this company.',
        );
      }
    }

    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const [row] = await this.db
      .insert(socialMediaOutboundDrafts)
      .values({
        companyId: actor.companyId,
        connectionId: connection?.id ?? null,
        platform: input.platform,
        outboundKind: input.outboundKind,
        status,
        title: input.title.trim(),
        body: input.body.trim(),
        targetItemId: input.targetItemId ?? null,
        marketingDraftId: input.marketingDraftId ?? null,
        autoPublish: false,
        socialPublishAvailable: false,
        createdByUserId: actor.userId,
        metadata: { source: input.marketingDraftId ? 'marketing_agent' : 'manual_draft' },
      })
      .returning();

    await this.recordAudit(actor, 'social_media_outbound_draft_created', row.id, {
      platform: input.platform,
      outboundKind: input.outboundKind,
      status,
      marketingDraftId: input.marketingDraftId ?? null,
    });

    return this.toOutbound(row);
  }

  async queueMarketingDraft(
    actor: SocialMediaActor,
    input: QueueMarketingDraftForSocialRequest,
  ): Promise<SocialOutboundDraftSummary> {
    this.assertWrite(actor);
    const [draft] = await this.db
      .select()
      .from(mktAgentContentDrafts)
      .where(
        and(
          eq(mktAgentContentDrafts.id, input.marketingDraftId),
          eq(mktAgentContentDrafts.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!draft) {
      throw new SocialMediaIntegrationsError(
        'NOT_FOUND',
        'Marketing Agent content draft not found for this company.',
      );
    }

    const [existing] = await this.db
      .select()
      .from(socialMediaOutboundDrafts)
      .where(
        and(
          eq(socialMediaOutboundDrafts.companyId, actor.companyId),
          eq(socialMediaOutboundDrafts.marketingDraftId, draft.id),
          inArray(socialMediaOutboundDrafts.status, [
            'draft',
            'pending_approval',
            'approved',
            'publish_gated',
          ]),
        ),
      )
      .limit(1);
    if (existing) {
      return this.toOutbound(existing);
    }

    const queued = await this.createOutboundDraft(actor, {
      platform: input.platform,
      outboundKind: 'publish_post',
      title: draft.title,
      body: draft.body,
      marketingDraftId: draft.id,
      submitForApproval: input.submitForApproval ?? true,
    });

    await this.recordAudit(actor, 'social_media_marketing_draft_queued', queued.id, {
      marketingDraftId: draft.id,
      platform: input.platform,
      workflow: ['draft', 'owner_review', 'approved', 'execute_gated'],
    });

    return queued;
  }

  async suggestReply(
    actor: SocialMediaActor,
    input: SuggestSocialReplyRequest,
  ): Promise<SocialOutboundDraftSummary> {
    this.assertWrite(actor);
    const [item] = await this.db
      .select()
      .from(socialMediaItems)
      .where(
        and(
          eq(socialMediaItems.id, input.targetItemId),
          eq(socialMediaItems.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!item) {
      throw new SocialMediaIntegrationsError(
        'NOT_FOUND',
        'Monitored item not found — cannot draft a reply without a real synced item.',
      );
    }

    const outboundKind =
      input.outboundKind ??
      (item.itemKind === 'review'
        ? 'reply_review'
        : item.itemKind === 'message'
          ? 'reply_message'
          : 'reply_comment');

    const suggestion = buildSocialReplySuggestion({
      platform: input.platform,
      itemKind: item.itemKind as SocialItemKind,
      authorName: item.authorName,
      body: item.body,
    });

    return this.createOutboundDraft(actor, {
      platform: input.platform,
      outboundKind,
      title: suggestion.title,
      body: suggestion.body,
      targetItemId: item.id,
      submitForApproval: input.submitForApproval,
    });
  }

  async decideOutboundDraft(
    actor: SocialMediaActor,
    draftId: string,
    input: DecideSocialOutboundDraftRequest,
  ): Promise<SocialOutboundDraftSummary> {
    this.assertApprove(actor);
    const [existing] = await this.db
      .select()
      .from(socialMediaOutboundDrafts)
      .where(
        and(
          eq(socialMediaOutboundDrafts.id, draftId),
          eq(socialMediaOutboundDrafts.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new SocialMediaIntegrationsError('NOT_FOUND', 'Outbound draft not found.');
    }
    if (existing.status !== 'pending_approval' && existing.status !== 'draft') {
      throw new SocialMediaIntegrationsError(
        'VALIDATION',
        `Draft cannot be decided from status ${existing.status}.`,
      );
    }

    const nextStatus = input.decision === 'approve' ? 'approved' : 'rejected';
    const now = new Date();
    const [row] = await this.db
      .update(socialMediaOutboundDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: now,
        decisionNotes: input.notes?.trim() || null,
        autoPublish: false,
        socialPublishAvailable: false,
        updatedAt: now,
      })
      .where(eq(socialMediaOutboundDrafts.id, draftId))
      .returning();

    await this.recordAudit(
      actor,
      input.decision === 'approve'
        ? 'social_media_outbound_draft_approved'
        : 'social_media_outbound_draft_rejected',
      draftId,
      { decision: input.decision, platform: existing.platform },
    );

    return this.toOutbound(row);
  }

  async requestPublish(
    actor: SocialMediaActor,
    draftId: string,
    input: RequestSocialOutboundPublishRequest = {},
  ): Promise<{
    draft: SocialOutboundDraftSummary;
    published: false;
    gated: true;
    reason: string;
  }> {
    this.assertApprove(actor);
    const [existing] = await this.db
      .select()
      .from(socialMediaOutboundDrafts)
      .where(
        and(
          eq(socialMediaOutboundDrafts.id, draftId),
          eq(socialMediaOutboundDrafts.companyId, actor.companyId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new SocialMediaIntegrationsError('NOT_FOUND', 'Outbound draft not found.');
    }
    if (existing.status !== 'approved' && existing.status !== 'publish_gated') {
      throw new SocialMediaIntegrationsError(
        'VALIDATION',
        'Publish/reply execute requires an Owner-approved draft. Nothing was posted.',
      );
    }

    const reason =
      'Publish/reply execute gated — live social publish providers are not connected. Approval recorded; nothing was posted or sent. No automatic posting or replies.';
    const now = new Date();
    const [row] = await this.db
      .update(socialMediaOutboundDrafts)
      .set({
        status: 'publish_gated',
        socialPublishAvailable: false,
        autoPublish: false,
        decisionNotes: input.notes?.trim() || existing.decisionNotes,
        updatedAt: now,
        metadata: {
          ...(existing.metadata ?? {}),
          lastPublishAttemptAt: now.toISOString(),
          publishGatedReason: reason,
        },
      })
      .where(eq(socialMediaOutboundDrafts.id, draftId))
      .returning();

    await this.recordEvent(
      actor,
      existing.connectionId,
      existing.platform as SocialPlatform,
      'outbound_publish_gated',
      existing.status,
      'publish_gated',
      reason,
      { draftId },
    );
    await this.recordAudit(actor, 'social_media_outbound_publish_gated', draftId, {
      platform: existing.platform,
      outboundKind: existing.outboundKind,
      marketingDraftId: existing.marketingDraftId,
    });

    return {
      draft: this.toOutbound(row),
      published: false,
      gated: true,
      reason,
    };
  }
}
