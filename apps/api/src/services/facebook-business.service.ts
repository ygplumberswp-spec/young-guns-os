import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import {
  buildFacebookAttributionChain,
  buildFacebookDashboardCard,
  buildFacebookIdempotencyKey,
  buildFacebookInsightCoverage,
  buildFacebookNotificationDedupeKey,
  canAccessFacebookBusiness,
  canApproveFacebookContent,
  canManageFacebookConnection,
  canTransitionFacebookContent,
  canWorkFacebookLeads,
  canWriteFacebookBusiness,
  checkFacebookBrandCompliance,
  classifyFacebookComment,
  classifyFacebookLeadUrgency,
  decideFacebookRetry,
  detectFacebookLeadDuplicate,
  evaluateFacebookPublishEligibility,
  FACEBOOK_LEAD_SOURCE_KEY,
  FACEBOOK_PENDING_PAGE_SELECTION_DETAIL,
  FACEBOOK_SUBSCRIBED_WEBHOOK_FIELDS,
  FACEBOOK_SYNC_POLICY,
  isCompanyOwnerRole,
  missingFacebookPermissions,
  nextFacebookPublishAttempt,
  redactFacebookAuditMetadata,
  resolveFacebookCapabilities,
  resolveFacebookConnectionState,
  resolveFacebookOAuthBrowserReturnPath,
  resolveFacebookMessengerAvailability,
  buildFacebookPageDiscoveryDiagnosis,
  mapRawFacebookAccountRow,
  resolveFacebookPageDiscoveryStatus,
  assertClientPageIdInMetaDiscovery,
  assertDiscoverySessionBinding,
  assertProviderPageRowMatchesSelection,
  encodeFacebookReconnectWizardOAuthReturnPath,
  FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE,
  FACEBOOK_PAGE_DISCOVERY_SESSION_TTL_MS,
  resolveFacebookHistoricalPageReference,
  resolveSelectableRowFromDiscoverySession,
  sanitizeFacebookPageDiscoverySession,
  buildFacebookDirectPageLookupSanitized,
  buildFacebookPageIdentityDisplay,
  buildFacebookBusinessPortfolioDiscoveryDiagnosis,
  buildFacebookVerificationTimestamps,
  decodeFacebookOAuthTierFromReturnPath,
  encodeFacebookBusinessPortfolioOAuthReturnPath,
  encodeFacebookPageReadOAuthReturnPath,
  FACEBOOK_PAGE_READ_OAUTH_EXPLANATION,
  FACEBOOK_SELECTED_PAGE_MISMATCH_MESSAGE,
  FACEBOOK_SYNC_INACTIVE_UNTIL_READ_PERMISSION,
  facebookPageIdentityAllowsPageReadOAuth,
  hasFacebookPageReadEngagement,
  mergeFacebookVerificationMetadata,
  persistFacebookConnectionState,
  resolveFacebookPageIdentity,
  mapRawBusinessPortfolioPageRow,
  mapFacebookGraphDirectLookupToProbes,
  needsFacebookBusinessPortfolioAccess,
  resolveFacebookBusinessPortfolioDiscoveryStatus,
  resolveFacebookPendingPageCandidate,
  type FacebookCombinedPageDiscoveryResult,
  type FacebookBusinessPortfolioDiscoveryResult,
  type FacebookBusinessPortfolioPageRow,
  type FacebookHistoricalPageReference,
  type FacebookPendingPageCandidate,
  type FacebookPageDiscoveryRow,
  type FacebookPageDiscoverySessionRow,
  isYoungGunsFinanceTenant,
  shouldSendFacebookNotification,
  validateFacebookMedia,
  validateFacebookSchedule,
  YOUNG_GUNS_BRAND,
  type FacebookAttributionLink,
  type FacebookAuditAction,
  type FacebookCapabilityState,
  type FacebookConnectionStateResult,
  type FacebookContentStatus,
  type FacebookContentType,
  type FacebookNotificationKind,
  type FacebookPageIdentityDiagnosis,
  type FacebookVerificationOutcome,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  fbAttributionLinks,
  fbCommentClassificationEnum,
  fbComments,
  fbConnectionEvents,
  fbConnections,
  fbContent,
  fbContentMedia,
  fbInsights,
  fbLeads,
  fbNotifications,
  fbOauthStates,
  fbPublishAttempts,
  fbReplies,
  fbSyncRuns,
  fbWebhookEvents,
  leadSources,
  leads,
  securityAuditLogs,
  companies,
} from '@titan/db';
import type { FacebookAppEnvConfig } from '../config.js';
import {
  issueFacebookPageDiscoverySessionToken,
  parseFacebookPageDiscoverySessionToken,
} from '../lib/facebook-discovery-session.crypto.js';
import {
  decryptFacebookCredentials,
  encryptFacebookCredentials,
  hashOAuthState,
  type FacebookStoredCredentials,
} from '../lib/crypto.js';
import {
  FacebookGraphClient,
  FacebookGraphError,
  type FacebookPageSummary,
} from '../lib/facebook-graph.client.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const POST_INSIGHT_METRICS = [
  'post_impressions',
  'post_impressions_unique',
  'post_engaged_users',
  'post_clicks',
];

export class FacebookBusinessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FacebookBusinessError';
  }
}

export type FacebookActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type ConnectionRow = typeof fbConnections.$inferSelect;

export type FacebookBusinessServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  appUrl: string;
  appConfig: FacebookAppEnvConfig | { configured: false };
  /** Injectable so tests never reach the real Graph API. */
  graphClientFactory?: (config: FacebookAppEnvConfig) => FacebookGraphClient;
};

export class FacebookBusinessService {
  private readonly db: DatabaseClient;
  private readonly encryptionKey: string | undefined;
  private readonly appUrl: string;
  private readonly appConfig: FacebookAppEnvConfig | { configured: false };
  private readonly graphClientFactory: (config: FacebookAppEnvConfig) => FacebookGraphClient;

  constructor(deps: FacebookBusinessServiceDeps) {
    this.db = deps.db;
    this.encryptionKey = deps.encryptionKey;
    this.appUrl = deps.appUrl;
    this.appConfig = deps.appConfig;
    this.graphClientFactory =
      deps.graphClientFactory ??
      ((config) =>
        new FacebookGraphClient({
          appId: config.appId,
          appSecret: config.appSecret,
          redirectUri: config.redirectUri,
          loginConfigId: config.loginConfigId,
        }));
  }

  isAppConfigured(): boolean {
    return this.appConfig.configured;
  }

  getWebhookVerifyToken(): string | null {
    return this.appConfig.configured ? this.appConfig.webhookVerifyToken : null;
  }

  getAppSecret(): string | null {
    return this.appConfig.configured ? this.appConfig.appSecret : null;
  }

  // ─── Guards ────────────────────────────────────────────────────────────────

  private assertRead(actor: FacebookActor): void {
    if (!canAccessFacebookBusiness(actor)) {
      throw new FacebookBusinessError(
        'FORBIDDEN',
        'Facebook Business requires marketing access. Technician and Client roles are denied.',
      );
    }
  }

  private assertWrite(actor: FacebookActor): void {
    this.assertRead(actor);
    if (!canWriteFacebookBusiness(actor)) {
      throw new FacebookBusinessError(
        'FORBIDDEN',
        'This action requires marketing:write or marketing_intelligence:write.',
      );
    }
  }

  private assertApprove(actor: FacebookActor): void {
    this.assertWrite(actor);
    if (!canApproveFacebookContent(actor)) {
      throw new FacebookBusinessError(
        'FORBIDDEN',
        'Only the Company Owner (or marketing_intelligence:manage) may approve content that will be published to Facebook.',
      );
    }
  }

  private assertManageConnection(actor: FacebookActor): void {
    this.assertWrite(actor);
    if (!canManageFacebookConnection(actor)) {
      throw new FacebookBusinessError(
        'FORBIDDEN',
        'Only the Company Owner may connect or disconnect the Facebook Page.',
      );
    }
  }

  private assertLeadAccess(actor: FacebookActor): void {
    if (!canWorkFacebookLeads(actor)) {
      throw new FacebookBusinessError(
        'FORBIDDEN',
        'Working Facebook leads requires marketing or leads access.',
      );
    }
  }

  private requireAppConfig(): FacebookAppEnvConfig {
    if (!this.appConfig.configured) {
      throw new FacebookBusinessError(
        'CONFIGURATION_REQUIRED',
        'No Meta app is configured on this TITAN host. Set META_APP_ID and META_APP_SECRET before connecting Facebook.',
      );
    }
    return this.appConfig;
  }

  private requireEncryptionKey(): string {
    if (!this.encryptionKey) {
      throw new FacebookBusinessError(
        'CONFIGURATION_REQUIRED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before Facebook credentials can be stored.',
      );
    }
    return this.encryptionKey;
  }

  private graph(): FacebookGraphClient {
    return this.graphClientFactory(this.requireAppConfig());
  }

  private async isYoungGunsTenant(companyId: string): Promise<boolean> {
    const [company] = await this.db
      .select({ slug: companies.slug, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    return isYoungGunsFinanceTenant(companyId, company ?? null);
  }

  private async resolveHistoricalPageReferenceForCompany(
    companyId: string,
  ): Promise<FacebookHistoricalPageReference | null> {
    const isYoungGuns = await this.isYoungGunsTenant(companyId);
    return resolveFacebookHistoricalPageReference({ isYoungGunsTenant: isYoungGuns });
  }

  private async resolvePendingPageCandidateForCompany(input: {
    companyId: string;
    connectionMetadata?: Record<string, unknown> | null;
  }): Promise<FacebookPendingPageCandidate | null> {
    const isYoungGuns = await this.isYoungGunsTenant(input.companyId);
    return resolveFacebookPendingPageCandidate({
      companyId: input.companyId,
      connectionMetadata: input.connectionMetadata ?? null,
      isYoungGunsTenant: isYoungGuns,
    });
  }

  // ─── Audit ─────────────────────────────────────────────────────────────────

  private async audit(
    actor: FacebookActor,
    action: FacebookAuditAction,
    entityId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'integrations',
      action: `facebook.${action}`,
      entityType: 'facebook_business',
      entityId: entityId ?? undefined,
      userId: actor.userId,
      metadata: redactFacebookAuditMetadata(metadata),
    });
  }

  private async recordConnectionEvent(input: {
    companyId: string;
    connectionId: string | null;
    eventType: string;
    stateBefore: ConnectionRow['state'] | null;
    stateAfter: ConnectionRow['state'] | null;
    message: string;
    actorUserId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(fbConnectionEvents).values({
      companyId: input.companyId,
      connectionId: input.connectionId ?? undefined,
      eventType: input.eventType,
      stateBefore: input.stateBefore ?? undefined,
      stateAfter: input.stateAfter ?? undefined,
      message: input.message,
      actorUserId: input.actorUserId ?? undefined,
      metadata: redactFacebookAuditMetadata(input.metadata ?? {}),
    });
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  private async loadConnection(companyId: string): Promise<ConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(fbConnections)
      .where(eq(fbConnections.companyId, companyId))
      .limit(1);
    return row ?? null;
  }

  private decryptCredentials(row: ConnectionRow | null): FacebookStoredCredentials | null {
    if (!row?.credentialsEncrypted || !this.encryptionKey) return null;
    try {
      return decryptFacebookCredentials(row.credentialsEncrypted, this.encryptionKey);
    } catch {
      return null;
    }
  }

  private async buildPageIdentity(row: ConnectionRow): Promise<FacebookPageIdentityDiagnosis> {
    const credentials = this.decryptCredentials(row);
    const metadata = row.metadata as Record<string, unknown> | null;
    const historicalReference = await this.resolveHistoricalPageReferenceForCompany(row.companyId);
    const providerVerifiedPageId =
      typeof metadata?.providerVerifiedPageId === 'string'
        ? metadata.providerVerifiedPageId
        : null;
    return resolveFacebookPageIdentity({
      storedPageId: row.pageId,
      storedPageName: row.pageName,
      historicalReference,
      providerVerifiedPageId,
      hasStoredCredentials: Boolean(row.credentialsEncrypted),
      pageAccessToken: credentials?.pageAccessToken ?? null,
    });
  }

  /**
   * The one place connection state is derived. Everything else reads this so a
   * `connected` badge can never come from anywhere but a verified probe.
   */
  private async resolveState(row: ConnectionRow | null): Promise<FacebookConnectionStateResult> {
    const pageIdentity = row ? await this.buildPageIdentity(row) : null;
    const timestamps = buildFacebookVerificationTimestamps({
      metadata: row?.metadata as Record<string, unknown> | null,
      lastVerifiedAt: row?.lastVerifiedAt ?? null,
      lastVerificationOk: row?.lastVerificationOk ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null,
    });

    const verification: FacebookVerificationOutcome | null = timestamps.lastSuccessfulVerificationAt
      ? {
          ok: true,
          authError: false,
          permissionError: false,
          providerUnavailable: false,
          checkedAt: new Date(timestamps.lastSuccessfulVerificationAt),
          message: row?.lastVerificationMessage ?? 'Facebook responded successfully.',
        }
      : timestamps.lastFailedVerificationAt
        ? {
            ok: false,
            authError: row?.lastVerificationAuthError ?? false,
            permissionError: row?.lastVerificationPermissionError ?? false,
            providerUnavailable: row?.lastVerificationProviderUnavailable ?? false,
            checkedAt: new Date(timestamps.lastFailedVerificationAt),
            message:
              ((row?.metadata as Record<string, unknown> | undefined)?.verification as
                | { lastFailedVerificationMessage?: string }
                | undefined)?.lastFailedVerificationMessage ??
              row?.lastVerificationMessage ??
              '',
          }
        : null;

    return resolveFacebookConnectionState({
      appConfigured: this.isAppConfigured(),
      hasStoredToken: Boolean(row?.credentialsEncrypted),
      pageSelected: Boolean(row?.pageId),
      pageName: row?.pageName ?? null,
      tokenExpiresAt: row?.tokenExpiresAt ?? null,
      grantedPermissions: row?.grantedPermissions ?? [],
      lastVerification: verification,
      disconnectedAt: row?.disconnectedAt ?? null,
      pageIdentity,
      now: new Date(),
    });
  }

  async getConnection(actor: FacebookActor) {
    this.assertRead(actor);
    const row = await this.loadConnection(actor.companyId);
    const pageIdentity = row ? await this.buildPageIdentity(row) : null;
    const state = await this.resolveState(row);

    const timestamps = buildFacebookVerificationTimestamps({
      metadata: row?.metadata as Record<string, unknown> | null,
      lastVerifiedAt: row?.lastVerifiedAt ?? null,
      lastVerificationOk: row?.lastVerificationOk ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null,
    });
    const syncInactive = !hasFacebookPageReadEngagement(row?.grantedPermissions ?? []);

    return {
      pageId: row?.pageId ?? null,
      pageName: row?.pageName ?? null,
      pageUrl: row?.pageUrl ?? null,
      pageCategory: row?.pageCategory ?? null,
      state: state.state,
      stateLabel: state.label,
      usable: state.usable,
      detail: state.detail,
      requiredAction: state.requiredAction,
      mismatchReason: state.mismatchReason,
      pageIdentity: pageIdentity ? buildFacebookPageIdentityDisplay(pageIdentity) : null,
      capabilities: state.capabilities,
      grantedPermissions: row?.grantedPermissions ?? [],
      missingPermissions: state.missingPermissions,
      messenger: resolveFacebookMessengerAvailability(row?.grantedPermissions ?? []),
      appConfigured: this.isAppConfigured(),
      encryptionConfigured: Boolean(this.encryptionKey),
      lastVerifiedAt: timestamps.lastSuccessfulVerificationAt,
      lastConnectionAttemptAt: timestamps.lastConnectionAttemptAt,
      lastSuccessfulVerificationAt: timestamps.lastSuccessfulVerificationAt,
      lastFailedVerificationAt: timestamps.lastFailedVerificationAt,
      lastVerificationMessage: row?.lastVerificationMessage ?? null,
      lastSyncedAt: timestamps.lastSuccessfulSyncAt,
      connectedAt: row?.connectedAt?.toISOString() ?? null,
      disconnectedAt: row?.disconnectedAt?.toISOString() ?? null,
      webhookSubscribedAt: row?.webhookSubscribedAt?.toISOString() ?? null,
      syncPolicy: syncInactive
        ? {
            ...FACEBOOK_SYNC_POLICY,
            pollingBackfillMinutes: 0,
            note: FACEBOOK_SYNC_INACTIVE_UNTIL_READ_PERMISSION,
          }
        : FACEBOOK_SYNC_POLICY,
      pageReadOAuthExplanation: FACEBOOK_PAGE_READ_OAUTH_EXPLANATION,
      brand: YOUNG_GUNS_BRAND,
      // Tokens are never included in any response shape.
      hasStoredCredentials: Boolean(row?.credentialsEncrypted),
    };
  }

  async startOAuth(
    actor: FacebookActor,
    returnPath?: string | null,
  ): Promise<{ authorizationUrl: string }> {
    this.assertManageConnection(actor);
    this.requireAppConfig();
    this.requireEncryptionKey();

    const state = randomBytes(32).toString('base64url');
    await this.db.insert(fbOauthStates).values({
      companyId: actor.companyId,
      userId: actor.userId,
      stateHash: hashOAuthState(state),
      returnPath: sanitiseReturnPath(returnPath),
      initiatorRoleName: actor.roleName,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    });

    await this.audit(actor, 'connection.owner_approval', null, {
      initiatorRoleName: actor.roleName,
    });
    await this.audit(actor, 'connection.oauth_started', null, {
      oauthFlow: this.appConfig.configured && this.appConfig.loginConfigId
        ? 'login_for_business_config_id'
        : 'scope_basic',
      requestedOAuthTier: 'basic',
    });

    return { authorizationUrl: this.graph().buildAuthorizeUrl(state) };
  }

  /** Re-authorises with business_management for business-owned Page discovery (J-6.7F5). */
  async startBusinessPortfolioOAuth(
    actor: FacebookActor,
    returnPath?: string | null,
  ): Promise<{ authorizationUrl: string }> {
    this.assertManageConnection(actor);
    this.requireAppConfig();
    this.requireEncryptionKey();

    const row = await this.loadConnection(actor.companyId);
    const credentials = this.decryptCredentials(row);
    if (!row || !credentials?.userAccessToken) {
      throw new FacebookBusinessError(
        'NOT_AUTHORISED',
        'Complete initial Facebook authorisation before granting Business Portfolio access.',
      );
    }

    const state = randomBytes(32).toString('base64url');
    const sanitisedPath = sanitiseReturnPath(returnPath);
    await this.db.insert(fbOauthStates).values({
      companyId: actor.companyId,
      userId: actor.userId,
      stateHash: hashOAuthState(state),
      returnPath: encodeFacebookBusinessPortfolioOAuthReturnPath(sanitisedPath),
      initiatorRoleName: actor.roleName,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    });

    await this.audit(actor, 'connection.oauth_started', row.id, {
      oauthFlow: 'business_portfolio_scopes',
      requestedOAuthTier: 'business_portfolio',
      requestedScopes: ['pages_show_list', 'business_management'],
    });

    return { authorizationUrl: this.graph().buildBusinessPortfolioAuthorizeUrl(state) };
  }

  /**
   * Reconnect wizard — refreshes the user token via Meta OAuth while preserving
   * the existing Page binding until the Owner completes verified Page selection.
   */
  async startReconnectWizardOAuth(
    actor: FacebookActor,
    returnPath?: string | null,
  ): Promise<{ authorizationUrl: string }> {
    this.assertManageConnection(actor);
    this.requireAppConfig();
    this.requireEncryptionKey();

    const row = await this.loadConnection(actor.companyId);
    if (!row?.credentialsEncrypted) {
      throw new FacebookBusinessError(
        'NOT_AUTHORISED',
        'Connect Facebook before using the reconnect wizard.',
      );
    }

    const state = randomBytes(32).toString('base64url');
    const sanitisedPath = sanitiseReturnPath(returnPath);
    await this.db.insert(fbOauthStates).values({
      companyId: actor.companyId,
      userId: actor.userId,
      stateHash: hashOAuthState(state),
      returnPath: encodeFacebookReconnectWizardOAuthReturnPath(sanitisedPath),
      initiatorRoleName: actor.roleName,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    });

    await this.audit(actor, 'connection.oauth_started', row.id, {
      oauthFlow: 'reconnect_wizard_scopes',
      requestedOAuthTier: 'reconnect_wizard',
      requestedScopes: ['pages_show_list', 'business_management', 'public_profile'],
    });

    return { authorizationUrl: this.graph().buildReconnectWizardAuthorizeUrl(state) };
  }

  /** Re-authorises with pages_read_engagement after Page selection (J-6.7F6). */
  async startPageReadOAuth(
    actor: FacebookActor,
    returnPath?: string | null,
  ): Promise<{ authorizationUrl: string }> {
    this.assertManageConnection(actor);
    this.requireAppConfig();
    this.requireEncryptionKey();

    const row = await this.loadConnection(actor.companyId);
    const credentials = this.decryptCredentials(row);
    const pageIdentity = row ? await this.buildPageIdentity(row) : null;
    if (!row?.pageId || !credentials?.userAccessToken) {
      throw new FacebookBusinessError(
        'NOT_AUTHORISED',
        'Select a Facebook Page before granting Page read access.',
      );
    }
    if (!pageIdentity || !facebookPageIdentityAllowsPageReadOAuth(pageIdentity)) {
      throw new FacebookBusinessError(
        'FACEBOOK_PAGE_SELECTION_REQUIRED',
        pageIdentity?.mismatch
          ? FACEBOOK_SELECTED_PAGE_MISMATCH_MESSAGE
          : 'Select and verify the correct Facebook Page before granting Page read access.',
      );
    }

    const state = randomBytes(32).toString('base64url');
    const sanitisedPath = sanitiseReturnPath(returnPath);
    await this.db.insert(fbOauthStates).values({
      companyId: actor.companyId,
      userId: actor.userId,
      stateHash: hashOAuthState(state),
      returnPath: encodeFacebookPageReadOAuthReturnPath(sanitisedPath),
      initiatorRoleName: actor.roleName,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    });

    await this.audit(actor, 'connection.oauth_started', row.id, {
      oauthFlow: 'page_read_scopes',
      requestedOAuthTier: 'page_read',
      requestedScopes: ['pages_show_list', 'business_management', 'pages_read_engagement'],
      pageId: row.pageId,
    });

    return { authorizationUrl: this.graph().buildPageReadAuthorizeUrl(state) };
  }

  /**
   * Completes the OAuth handshake and lists Pages. It deliberately does not
   * store credentials or mark anything connected — the Owner still has to pick
   * the Page, and only that step produces a usable connection.
   */
  async handleOAuthCallback(input: {
    code: string;
    state: string;
  }): Promise<{ redirectUrl: string }> {
    const config = this.requireAppConfig();
    const encryptionKey = this.requireEncryptionKey();

    const [stateRow] = await this.db
      .select()
      .from(fbOauthStates)
      .where(
        and(
          eq(fbOauthStates.stateHash, hashOAuthState(input.state)),
          isNull(fbOauthStates.consumedAt),
          gt(fbOauthStates.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!stateRow) {
      throw new FacebookBusinessError(
        'INVALID_STATE',
        'This Facebook authorisation link is invalid or has expired. Start the connection again.',
      );
    }

    if (stateRow.initiatorRoleName && !isCompanyOwnerRole(stateRow.initiatorRoleName)) {
      throw new FacebookBusinessError(
        'FORBIDDEN',
        'Facebook OAuth callback rejected — connection was not initiated by Company Owner.',
      );
    }

    await this.db
      .update(fbOauthStates)
      .set({ consumedAt: new Date() })
      .where(eq(fbOauthStates.id, stateRow.id));

    const graph = this.graphClientFactory(config);
    const shortLived = await graph.exchangeCodeForUserToken(input.code);
    const longLived = await graph.exchangeForLongLivedUserToken(shortLived.accessToken);
    const grantedPermissions = await graph.getGrantedPermissions(longLived.accessToken);

    const expiresAt = longLived.expiresIn
      ? new Date(Date.now() + longLived.expiresIn * 1000)
      : null;

    const tierDecoded = decodeFacebookOAuthTierFromReturnPath(stateRow.returnPath);
    const browserReturnPath = resolveFacebookOAuthBrowserReturnPath(tierDecoded.returnPath);
    const oauthTier = tierDecoded.oauthTier;

    const existing = await this.loadConnection(stateRow.companyId);
    const stateBefore = existing?.state ?? null;

    if (oauthTier === 'page_read') {
      if (!existing?.pageId || !existing.credentialsEncrypted) {
        throw new FacebookBusinessError(
          'NOT_AUTHORISED',
          'Page read authorisation requires an existing Page selection. Select a Page first.',
        );
      }

      const pageReadGranted = grantedPermissions.includes('pages_read_engagement');
      if (!pageReadGranted) {
        await this.recordConnectionEvent({
          companyId: stateRow.companyId,
          connectionId: existing.id,
          eventType: 'oauth_page_read_denied',
          stateBefore,
          stateAfter: existing.state,
          message:
            'Page read authorisation did not grant pages_read_engagement. The selected Page and stored credentials were preserved.',
          actorUserId: stateRow.userId,
          metadata: { grantedPermissions },
        });
        return {
          redirectUrl: `${this.appUrl.replace(/\/$/, '')}${browserReturnPath}?facebook=error&reason=${encodeURIComponent('PAGE_READ_PERMISSION_REQUIRED')}`,
        };
      }

      const existingCredentials = decryptFacebookCredentials(
        existing.credentialsEncrypted!,
        encryptionKey,
      );
      const mergedCredentials: FacebookStoredCredentials = {
        version: 1,
        pageAccessToken: existingCredentials.pageAccessToken,
        userAccessToken: longLived.accessToken,
        expiresAt: expiresAt?.toISOString() ?? existingCredentials.expiresAt,
        grantedScopes: grantedPermissions,
      };

      await this.db
        .update(fbConnections)
        .set({
          grantedPermissions,
          tokenExpiresAt: expiresAt,
          credentialsEncrypted: encryptFacebookCredentials(mergedCredentials, encryptionKey),
          updatedAt: new Date(),
        })
        .where(eq(fbConnections.id, existing.id));

      const graph = this.graphClientFactory(config);
      const verification = await this.probe(() =>
        graph.verifyPage(existing.pageId as string, mergedCredentials.pageAccessToken),
      );

      await this.db
        .update(fbConnections)
        .set({
          ...this.verificationColumns(
            verification.outcome,
            existing.metadata as Record<string, unknown> | null,
          ),
          pageName: verification.value?.name ?? existing.pageName,
          pageUrl: verification.value?.link ?? existing.pageUrl,
          pageCategory: verification.value?.category ?? existing.pageCategory,
          metadata: {
            ...((existing.metadata as Record<string, unknown> | null) ?? {}),
            pageDetailsVerificationPending: !verification.outcome.ok,
            pageIdentityVerified: verification.outcome.ok,
          },
          updatedAt: new Date(),
        })
        .where(eq(fbConnections.id, existing.id));

      if (verification.outcome.ok) {
        try {
          await graph.subscribePageWebhooks({
            pageId: existing.pageId as string,
            pageAccessToken: mergedCredentials.pageAccessToken,
            fields: [...FACEBOOK_SUBSCRIBED_WEBHOOK_FIELDS],
          });
          await this.db
            .update(fbConnections)
            .set({ webhookSubscribedAt: new Date() })
            .where(eq(fbConnections.id, existing.id));
        } catch (error) {
          await this.recordConnectionEvent({
            companyId: stateRow.companyId,
            connectionId: existing.id,
            eventType: 'webhook_subscribe_failed',
            stateBefore,
            stateAfter: existing.state,
            message: `Page read access granted, but webhook subscription failed: ${describeGraphError(error)}.`,
            actorUserId: stateRow.userId,
          });
        }
      }

      const refreshed = await this.loadConnection(stateRow.companyId);
      const resolved = await this.resolveState(refreshed);
      await this.db
        .update(fbConnections)
        .set({ state: persistFacebookConnectionState(resolved.state) })
        .where(eq(fbConnections.id, existing.id));

      await this.recordConnectionEvent({
        companyId: stateRow.companyId,
        connectionId: existing.id,
        eventType: 'oauth_page_read_completed',
        stateBefore,
        stateAfter: persistFacebookConnectionState(resolved.state),
        message: verification.outcome.ok
          ? 'Page read access granted and verified against Facebook.'
          : `Page read access granted but verification reported: ${verification.outcome.message}`,
        actorUserId: stateRow.userId,
        metadata: { grantedPermissions, verified: verification.outcome.ok },
      });

      await this.audit(
        {
          companyId: stateRow.companyId,
          userId: stateRow.userId,
          roleName: stateRow.initiatorRoleName ?? 'Company Owner',
          permissions: [],
        },
        'connection.oauth_completed',
        existing.id,
        { oauthTier: 'page_read', verified: verification.outcome.ok },
      );

      const query = verification.outcome.ok ? 'facebook=page-read-granted' : 'facebook=page-read-pending';
      return { redirectUrl: `${this.appUrl.replace(/\/$/, '')}${browserReturnPath}?${query}` };
    }

    if (oauthTier === 'reconnect_wizard') {
      if (!existing?.credentialsEncrypted) {
        throw new FacebookBusinessError(
          'NOT_AUTHORISED',
          'Reconnect wizard requires an existing Facebook connection.',
        );
      }

      const existingCredentials = decryptFacebookCredentials(
        existing.credentialsEncrypted,
        encryptionKey,
      );
      const mergedCredentials: FacebookStoredCredentials = {
        version: 1,
        pageAccessToken: existingCredentials.pageAccessToken,
        userAccessToken: longLived.accessToken,
        expiresAt: expiresAt?.toISOString() ?? existingCredentials.expiresAt,
        grantedScopes: grantedPermissions,
      };

      const priorMetadata = (existing.metadata as Record<string, unknown> | null) ?? {};
      await this.db
        .update(fbConnections)
        .set({
          grantedPermissions,
          tokenExpiresAt: expiresAt,
          credentialsEncrypted: encryptFacebookCredentials(mergedCredentials, encryptionKey),
          metadata: {
            ...priorMetadata,
            reconnectWizardActive: true,
            reconnectWizardStartedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(fbConnections.id, existing.id));

      await this.recordConnectionEvent({
        companyId: stateRow.companyId,
        connectionId: existing.id,
        eventType: 'oauth_reconnect_wizard_completed',
        stateBefore,
        stateAfter: existing.state,
        message:
          'Facebook reconnect authorisation completed. Select the Page returned by Meta to finish rebinding.',
        actorUserId: stateRow.userId,
        metadata: { grantedPermissions, oauthTier: 'reconnect_wizard' },
      });

      await this.audit(
        {
          companyId: stateRow.companyId,
          userId: stateRow.userId,
          roleName: stateRow.initiatorRoleName ?? 'Company Owner',
          permissions: [],
        },
        'connection.oauth_completed',
        existing.id,
        { oauthTier: 'reconnect_wizard' },
      );

      return {
        redirectUrl: `${this.appUrl.replace(/\/$/, '')}${browserReturnPath}?facebook=reconnect-wizard`,
      };
    }

    const isBusinessPortfolioOAuth = oauthTier === 'business_portfolio';
    const businessManagementGranted = grantedPermissions.includes('business_management');

    const pendingPageCandidate = await this.resolvePendingPageCandidateForCompany({
      companyId: stateRow.companyId,
      connectionMetadata: existing?.metadata as Record<string, unknown> | null,
    });

    if (isBusinessPortfolioOAuth && !businessManagementGranted && existing) {
      await this.recordConnectionEvent({
        companyId: stateRow.companyId,
        connectionId: existing.id,
        eventType: 'oauth_business_portfolio_denied',
        stateBefore,
        stateAfter: existing.state,
        message:
          'Business Portfolio authorisation did not grant business_management. The existing partial Facebook connection was preserved.',
        actorUserId: stateRow.userId,
        metadata: { grantedPermissions },
      });
      return {
        redirectUrl: `${this.appUrl.replace(/\/$/, '')}${browserReturnPath}?facebook=error&reason=${encodeURIComponent('BUSINESS_PERMISSION_REQUIRED')}`,
      };
    }

    // The user token is parked so `/pages` can list Pages and a later disconnect
    // can revoke the grant. No Page token exists until a Page is chosen.
    const credentials: FacebookStoredCredentials = {
      version: 1,
      pageAccessToken: '',
      userAccessToken: longLived.accessToken,
      expiresAt: expiresAt?.toISOString(),
      grantedScopes: grantedPermissions,
    };

    const values = {
      companyId: stateRow.companyId,
      state: 'partial' as const,
      grantedPermissions,
      tokenExpiresAt: expiresAt,
      disconnectedAt: null,
      connectedByUserId: stateRow.userId,
      pageId: null,
      pageName: null,
      pageUrl: null,
      pageCategory: null,
      connectedAt: null,
      metadata: {
        pendingPageSelection: true,
        oauthTier: isBusinessPortfolioOAuth ? 'business_portfolio' : 'basic',
        ...(pendingPageCandidate
          ? {
              pendingPageCandidate: {
                pageId: pendingPageCandidate.pageId,
                pageName: pendingPageCandidate.pageName,
                source: pendingPageCandidate.source,
              },
            }
          : {}),
      },
      updatedAt: new Date(),
      lastVerifiedAt: null,
      lastVerificationOk: null,
      lastVerificationAuthError: false,
      lastVerificationPermissionError: false,
      lastVerificationProviderUnavailable: false,
      lastVerificationMessage: FACEBOOK_PENDING_PAGE_SELECTION_DETAIL,
      // Stored under a marker so the row never looks like a working connection.
      credentialsEncrypted: encryptFacebookCredentials(
        { ...credentials, pageAccessToken: `pending:${longLived.accessToken}` },
        encryptionKey,
      ),
    };

    if (existing) {
      await this.db.update(fbConnections).set(values).where(eq(fbConnections.id, existing.id));
    } else {
      await this.db.insert(fbConnections).values(values);
    }

    const connection = await this.loadConnection(stateRow.companyId);

    await this.recordConnectionEvent({
      companyId: stateRow.companyId,
      connectionId: connection?.id ?? null,
      eventType: 'oauth_completed',
      stateBefore,
      stateAfter: 'partial',
      message: isBusinessPortfolioOAuth
        ? `Business Portfolio authorisation completed. Meta granted ${grantedPermissions.length} permission(s). Select a Page to finish the connection.`
        : `Facebook authorisation completed. Meta granted ${grantedPermissions.length} permission(s). Page selection is still outstanding.`,
      actorUserId: stateRow.userId,
      metadata: {
        grantedPermissions,
        missingPermissions: missingFacebookPermissions(grantedPermissions),
        oauthTier,
      },
    });

    const query = isBusinessPortfolioOAuth ? 'facebook=select-page&business=portfolio' : 'facebook=select-page';
    return { redirectUrl: `${this.appUrl.replace(/\/$/, '')}${browserReturnPath}?${query}` };
  }

  /** Lists the Pages the authorising user administers with sanitized provider diagnosis. */
  async discoverPagesForSelection(actor: FacebookActor): Promise<FacebookCombinedPageDiscoveryResult> {
    this.assertManageConnection(actor);
    const config = this.requireAppConfig();
    const row = await this.loadConnection(actor.companyId);
    const credentials = this.decryptCredentials(row);
    const userToken = credentials?.userAccessToken;

    if (!userToken) {
      throw new FacebookBusinessError(
        'NOT_AUTHORISED',
        'No Facebook authorisation is stored. Connect Facebook before selecting a Page.',
      );
    }

    const graph = this.graphClientFactory(config);
    const [fetchResult, grantedPermissions, tokenInfo] = await Promise.all([
      graph.discoverPages(userToken),
      graph.getGrantedPermissions(userToken),
      graph.inspectAccessToken(userToken),
    ]);

    const mappedPages: FacebookPageDiscoveryRow[] = [];
    for (const raw of fetchResult.rows) {
      let resolvedToken = raw.access_token ?? null;
      if (raw.id && raw.name && !resolvedToken) {
        resolvedToken = await graph.tryResolvePageAccessToken(raw.id, userToken);
      }
      const mapped = mapRawFacebookAccountRow(raw, resolvedToken);
      if (mapped) mappedPages.push(mapped);
    }

    const appliedFilters = [
      'retain_all_provider_rows_for_diagnosis',
      'selectable_only_when_id_name_and_page_access_token_present',
      'optional_tryResolvePageAccessToken_when_me_accounts_omits_token',
      'tasks_not_required_including_PROFILE_PLUS_variants',
    ];

    const status = resolveFacebookPageDiscoveryStatus({
      rawRows: fetchResult.rows,
      mappedPages,
      grantedScopes: grantedPermissions,
      providerFailed: Boolean(fetchResult.providerError),
      providerErrorMessage: fetchResult.providerError?.message ?? null,
    });

    const pendingPageCandidate = await this.resolvePendingPageCandidateForCompany({
      companyId: actor.companyId,
      connectionMetadata: row?.metadata as Record<string, unknown> | null,
    });
    const historicalPageReference = await this.resolveHistoricalPageReferenceForCompany(
      actor.companyId,
    );

    let directLookup = null;
    const shouldAttemptDirectLookup =
      pendingPageCandidate &&
      (fetchResult.rows.length === 0 || mappedPages.every((page) => !page.selectable));

    if (shouldAttemptDirectLookup && pendingPageCandidate) {
      const directResult = await graph.lookupPageDirect(
        pendingPageCandidate.pageId,
        userToken,
      );
      const probes = mapFacebookGraphDirectLookupToProbes(directResult);
      directLookup = buildFacebookDirectPageLookupSanitized({
        candidate: pendingPageCandidate,
        ...probes,
      });

      if (directLookup.selectable) {
        mappedPages.push({
          id: pendingPageCandidate.pageId,
          name: pendingPageCandidate.pageName,
          category: null,
          tasks: [],
          selectable: true,
          status: 'PAGE_SELECTION_READY' as const,
          statusDetail:
            'Meta confirmed this Page via direct lookup. Confirm to finish the connection.',
          diagnostics: {
            hasId: directLookup.hasId,
            hasName: directLookup.hasName,
            hasAccessToken: directLookup.hasAccessToken,
            hasTasks: directLookup.hasTasks,
            taskCount: directLookup.taskCount,
            filteredOutByTitan: false,
            filterReason: null,
          },
        });
      }

      await this.audit(actor, 'connection.direct_page_lookup', row?.id ?? null, {
        status: directLookup.status,
        httpStatus: directLookup.httpStatus,
        providerErrorCode: directLookup.providerErrorCode,
        hasAccessToken: directLookup.hasAccessToken,
        idMatches: directLookup.idMatches,
        nameMatches: directLookup.nameMatches,
      });
    }

    const needsBusinessPortfolioAccessFlag = needsFacebookBusinessPortfolioAccess({
      grantedScopes: grantedPermissions,
      meAccountsEmpty: fetchResult.rows.length === 0,
      directLookupStatus: directLookup?.status ?? null,
    });

    let businessPortfolio: FacebookBusinessPortfolioDiscoveryResult | null = null;
    if (
      grantedPermissions.includes('business_management') &&
      (fetchResult.rows.length === 0 || mappedPages.every((page) => !page.selectable))
    ) {
      businessPortfolio = await this.discoverBusinessPortfolioPages(actor, {
        graph,
        userToken,
        grantedPermissions,
        pendingPageCandidate,
        connectionId: row?.id ?? null,
      });

      for (const businessPage of businessPortfolio.pages.filter((entry) => entry.selectable)) {
        if (mappedPages.some((page) => page.id === businessPage.id)) continue;
        mappedPages.push({
          id: businessPage.id,
          name: businessPage.name,
          category: null,
          tasks: [],
          selectable: true,
          status: 'PAGE_SELECTION_READY' as const,
          statusDetail: `Accessible through Business Portfolio ${businessPage.businessPortfolioName}.`,
          diagnostics: {
            hasId: true,
            hasName: true,
            hasAccessToken: Boolean(businessPage.accessToken),
            hasTasks: false,
            taskCount: 0,
            filteredOutByTitan: false,
            filterReason: null,
          },
        });
      }
    }

    const resolvedStatus =
      mappedPages.some((page) => page.selectable) && status.status !== 'META_PAGE_LIST_FAILED'
        ? {
            status: 'PAGE_SELECTION_READY' as const,
            detail:
              businessPortfolio?.status === 'BUSINESS_PAGE_DISCOVERED'
                ? businessPortfolio.detail
                : directLookup?.selectable === true
                  ? 'Meta confirmed a Page via direct lookup. Confirm this Page to finish the connection.'
                  : 'Select the Facebook Page returned by Meta to finish the connection.',
          }
        : status;

    const encryptionKey = this.encryptionKey;
    let discoverySessionToken: string | null = null;
    let discoverySession = null;
    if (encryptionKey) {
      const listSummaries = await graph.listPages(userToken);
      const sessionRows: FacebookPageDiscoverySessionRow[] = [];

      for (const summary of listSummaries) {
        if (!summary.id || !summary.name || !summary.accessToken) continue;
        sessionRows.push({
          id: summary.id,
          name: summary.name,
          accessToken: summary.accessToken,
          category: summary.category,
          source: 'me_accounts',
        });
      }

      for (const businessPage of businessPortfolio?.pages ?? []) {
        if (!businessPage.selectable || !businessPage.accessToken || !businessPage.id || !businessPage.name) {
          continue;
        }
        if (sessionRows.some((row) => row.id === businessPage.id)) continue;
        sessionRows.push({
          id: businessPage.id,
          name: businessPage.name,
          accessToken: businessPage.accessToken,
          category: null,
          source: 'business_portfolio',
        });
      }

      if (sessionRows.length > 0) {
        const issuedAt = new Date();
        const issued = issueFacebookPageDiscoverySessionToken({
          encryptionKey,
          payload: {
            companyId: actor.companyId,
            userId: actor.userId,
            issuedAt: issuedAt.toISOString(),
            expiresAt: new Date(issuedAt.getTime() + FACEBOOK_PAGE_DISCOVERY_SESSION_TTL_MS).toISOString(),
            configuredAppId: config.appId,
            tokenAppId: tokenInfo.appId,
            tokenValid: tokenInfo.isValid,
            rows: sessionRows,
          },
        });
        discoverySessionToken = issued.token;
        discoverySession = sanitizeFacebookPageDiscoverySession(issued.payload);
      }
    }

    return {
      status: resolvedStatus.status,
      detail: resolvedStatus.detail,
      pages: mappedPages,
      diagnosis: buildFacebookPageDiscoveryDiagnosis({
        httpStatus: fetchResult.httpStatus,
        providerErrorCode: fetchResult.providerError?.code ?? null,
        providerErrorSubcode: fetchResult.providerError?.subcode ?? null,
        providerErrorType: fetchResult.providerError?.type ?? null,
        rawRows: fetchResult.rows,
        mappedPages,
        grantedScopes: grantedPermissions,
        configuredAppId: config.appId,
        tokenAppId: tokenInfo.appId,
        tokenValid: tokenInfo.isValid,
        tokenExpiresAt: tokenInfo.expiresAt,
        tokenUserIdPresent: tokenInfo.userIdPresent,
        hasPaging: fetchResult.hasPaging,
        pagingPageCount: fetchResult.pagingPageCount,
        appliedFilters,
      }),
      pendingPageCandidate,
      historicalPageReference,
      discoverySessionToken,
      discoverySession,
      directLookup,
      businessPortfolio,
      needsBusinessPortfolioAccess: needsBusinessPortfolioAccessFlag,
    };
  }

  private async discoverBusinessPortfolioPages(
    actor: FacebookActor,
    input: {
      graph: FacebookGraphClient;
      userToken: string;
      grantedPermissions: string[];
      pendingPageCandidate: FacebookPendingPageCandidate | null;
      connectionId: string | null;
    },
  ): Promise<FacebookBusinessPortfolioDiscoveryResult> {
    const fetchResult = await input.graph.discoverBusinessPortfolioPages(input.userToken);
    const mappedPages: FacebookBusinessPortfolioPageRow[] = [];

    for (const entry of fetchResult.pages) {
      let resolvedToken = entry.raw.access_token ?? null;
      if (entry.raw.id && entry.raw.name && !resolvedToken) {
        resolvedToken = await input.graph.tryResolvePageAccessToken(entry.raw.id, input.userToken);
        if (resolvedToken) {
          entry.raw = { ...entry.raw, access_token: resolvedToken };
        }
      }
      const mapped = mapRawBusinessPortfolioPageRow({
        raw: entry.raw,
        businessPortfolioId: entry.businessPortfolioId,
        businessPortfolioName: entry.businessPortfolioName,
        source: entry.source,
      });
      if (mapped) mappedPages.push(mapped);
    }

    const resolved = resolveFacebookBusinessPortfolioDiscoveryStatus({
      grantedScopes: input.grantedPermissions,
      portfolios: fetchResult.portfolios,
      pages: mappedPages,
      candidate: input.pendingPageCandidate,
      providerFailed: Boolean(fetchResult.providerError),
      providerErrorMessage: fetchResult.providerError?.message ?? null,
    });

    await this.audit(actor, 'connection.business_portfolio_discovery', input.connectionId, {
      status: resolved.status,
      portfolioCount: fetchResult.portfolios.length,
      pageCount: mappedPages.length,
      selectablePageCount: mappedPages.filter((page) => page.selectable).length,
    });

    return {
      status: resolved.status,
      detail: resolved.detail,
      portfolios: fetchResult.portfolios,
      pages: mappedPages,
      diagnosis: buildFacebookBusinessPortfolioDiscoveryDiagnosis({
        httpStatus: fetchResult.httpStatus,
        providerErrorCode: fetchResult.providerError?.code ?? null,
        providerErrorSubcode: fetchResult.providerError?.subcode ?? null,
        providerErrorType: fetchResult.providerError?.type ?? null,
        portfolios: fetchResult.portfolios,
        pages: mappedPages,
        grantedScopes: input.grantedPermissions,
        candidate: input.pendingPageCandidate,
      }),
      pendingPageCandidate: input.pendingPageCandidate,
    };
  }

  /** Lists selectable Pages with tokens for server-side validation only. */
  async listPages(actor: FacebookActor): Promise<FacebookPageSummary[]> {
    this.assertManageConnection(actor);
    const config = this.requireAppConfig();
    const row = await this.loadConnection(actor.companyId);
    const credentials = this.decryptCredentials(row);
    const userToken = credentials?.userAccessToken;

    if (!userToken) {
      throw new FacebookBusinessError(
        'NOT_AUTHORISED',
        'No Facebook authorisation is stored. Connect Facebook before selecting a Page.',
      );
    }

    return this.graphClientFactory(config).listPages(userToken);
  }

  /**
   * Selects the Page using the exact /me/accounts row returned by Meta.
   * Page-object verification runs only after pages_read_engagement is granted.
   */
  async selectPage(actor: FacebookActor, pageId: string, discoverySessionToken: string) {
    this.assertManageConnection(actor);
    const config = this.requireAppConfig();
    const encryptionKey = this.requireEncryptionKey();

    const row = await this.loadConnection(actor.companyId);
    const credentials = this.decryptCredentials(row);
    const userToken = credentials?.userAccessToken;
    if (!row || !userToken) {
      throw new FacebookBusinessError(
        'NOT_AUTHORISED',
        'No Facebook authorisation is stored. Connect Facebook before selecting a Page.',
      );
    }

    let sessionPayload;
    try {
      sessionPayload = parseFacebookPageDiscoverySessionToken(discoverySessionToken, encryptionKey);
    } catch {
      throw new FacebookBusinessError(
        'INVALID_STATE',
        'Page selection expired. Choose Page again.',
      );
    }

    const sessionBinding = assertDiscoverySessionBinding({
      payload: sessionPayload,
      companyId: actor.companyId,
      userId: actor.userId,
    });
    if (!sessionBinding.ok) {
      throw new FacebookBusinessError('INVALID_STATE', sessionBinding.reason);
    }

    const priorMetadata = row.metadata as Record<string, unknown> | null;
    const normalizedPageId = pageId.trim();
    if (this.isDiscoverySessionConsumed(priorMetadata, sessionPayload.sessionId)) {
      if (row.pageId === normalizedPageId && normalizedPageId) {
        return this.getConnection(actor);
      }
      throw new FacebookBusinessError(
        'INVALID_STATE',
        'Page selection expired. Choose Page again.',
      );
    }

    const sessionRow = resolveSelectableRowFromDiscoverySession({
      payload: sessionPayload,
      pageId,
    });
    if (!sessionRow.ok) {
      throw new FacebookBusinessError('PAGE_NOT_AUTHORISED', sessionRow.reason);
    }

    const graph = this.graphClientFactory(config);
    const listedPageIds = (await graph.listPages(userToken)).map((entry) => entry.id);
    const pageIdCheck = assertClientPageIdInMetaDiscovery({
      clientPageId: pageId,
      listedPageIds,
      businessPortfolioPageIds: sessionPayload.rows
        .filter((entry) => entry.source === 'business_portfolio')
        .map((entry) => entry.id),
    });
    if (!pageIdCheck.allowed) {
      throw new FacebookBusinessError('PAGE_NOT_AUTHORISED', pageIdCheck.reason);
    }

    const historicalReference = await this.resolveHistoricalPageReferenceForCompany(actor.companyId);
    const providerRowCheck = assertProviderPageRowMatchesSelection({
      requestedPageId: pageId,
      providerPageId: sessionRow.row.id,
      providerPageName: sessionRow.row.name,
      providerAccessToken: sessionRow.row.accessToken,
    });
    if (!providerRowCheck.ok) {
      throw new FacebookBusinessError('META_PAGE_ROW_INCOMPLETE', providerRowCheck.reason);
    }

    const page = {
      id: providerRowCheck.pageId,
      name: providerRowCheck.pageName,
      category: sessionRow.row.category,
      accessToken: providerRowCheck.accessToken,
      tasks: [] as string[],
    };

    const pendingVerificationOutcome: FacebookVerificationOutcome = {
      ok: false,
      authError: false,
      permissionError: false,
      providerUnavailable: false,
      checkedAt: new Date(),
      message: FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE,
    };
    const verificationUpdate = this.verificationColumns(
      pendingVerificationOutcome,
      priorMetadata,
    );
    const pageSelectedAt = new Date().toISOString();
    const canVerifyPageDetails = hasFacebookPageReadEngagement(row.grantedPermissions ?? []);
    const consumedDiscoverySessionIds = this.markDiscoverySessionConsumed(
      priorMetadata,
      sessionPayload.sessionId,
    );
    const nextMetadata = {
      ...(verificationUpdate.metadata ?? priorMetadata ?? {}),
      pageSelectedAt,
      pageIdentityVerified: false,
      pageDetailsVerificationPending: !canVerifyPageDetails,
      providerVerifiedPageId: page.id,
      providerVerifiedPageName: page.name,
      providerVerifiedFromDiscoverySession: sanitizeFacebookPageDiscoverySession(sessionPayload),
      reconnectWizardActive: false,
      consumedDiscoverySessionIds,
    };

    await this.db.transaction(async (tx) => {
      await tx
        .update(fbConnections)
        .set({
          pageId: page.id,
          pageName: page.name,
          pageUrl: null,
          pageCategory: page.category,
          credentialsEncrypted: encryptFacebookCredentials(
            {
              version: 1,
              pageAccessToken: page.accessToken,
              userAccessToken: userToken,
              expiresAt: credentials?.expiresAt,
              grantedScopes: row.grantedPermissions,
            },
            encryptionKey,
          ),
          connectedAt: row.connectedAt ?? new Date(),
          connectedByUserId: actor.userId,
          disconnectedAt: null,
          updatedAt: new Date(),
          ...verificationUpdate,
          metadata: nextMetadata,
        })
        .where(eq(fbConnections.id, row.id));

      const identityAfterWrite = resolveFacebookPageIdentity({
        storedPageId: page.id,
        storedPageName: page.name,
        historicalReference,
        providerVerifiedPageId: page.id,
        hasStoredCredentials: true,
        pageAccessToken: page.accessToken,
      });
      if (identityAfterWrite.mismatch) {
        throw new FacebookBusinessError(
          'PAGE_IDENTITY_MISMATCH',
          'Page selection did not produce a verified Page identity binding.',
        );
      }

      const refreshedInTx = await tx
        .select()
        .from(fbConnections)
        .where(eq(fbConnections.id, row.id))
        .limit(1);
      const refreshedRow = refreshedInTx[0];
      if (!refreshedRow || refreshedRow.pageId !== page.id) {
        throw new FacebookBusinessError(
          'PAGE_IDENTITY_MISMATCH',
          'Page selection write validation failed before completing the connection.',
        );
      }
    });

    if (canVerifyPageDetails) {
      const graph = this.graphClientFactory(config);
      const verification = await this.probe(() =>
        graph.verifyPage(page.id, page.accessToken),
      );
      await this.db
        .update(fbConnections)
        .set({
          ...this.verificationColumns(verification.outcome, nextMetadata),
          pageName: verification.value?.name ?? page.name,
          pageUrl: verification.value?.link ?? null,
          pageCategory: verification.value?.category ?? page.category,
          metadata: {
            ...nextMetadata,
            pageDetailsVerificationPending: !verification.outcome.ok,
            pageIdentityVerified: verification.outcome.ok,
          },
          updatedAt: new Date(),
        })
        .where(eq(fbConnections.id, row.id));
    }

    const refreshed = await this.loadConnection(actor.companyId);
    const state = await this.resolveState(refreshed);

    await this.db
      .update(fbConnections)
      .set({ state: persistFacebookConnectionState(state.state) })
      .where(eq(fbConnections.id, row.id));

    await this.recordConnectionEvent({
      companyId: actor.companyId,
      connectionId: row.id,
      eventType: 'page_selected',
      stateBefore: row.state,
      stateAfter: persistFacebookConnectionState(state.state),
      message: `Page "${page.name}" selected from Meta discovery. ${state.detail}`,
      actorUserId: actor.userId,
      metadata: {
        pageId: page.id,
        pageName: page.name,
        verified: false,
        pageDetailsVerificationPending: true,
      },
    });

    await this.audit(actor, 'connection.page_selected', row.id, {
      pageId: page.id,
      pageName: page.name,
      state: state.state,
      discoverySession: sanitizeFacebookPageDiscoverySession(sessionPayload),
    });

    return this.getConnection(actor);
  }

  private isDiscoverySessionConsumed(
    metadata: Record<string, unknown> | null,
    sessionId: string,
  ): boolean {
    const consumed = metadata?.consumedDiscoverySessionIds;
    return Array.isArray(consumed) && consumed.includes(sessionId);
  }

  private markDiscoverySessionConsumed(
    metadata: Record<string, unknown> | null,
    sessionId: string,
  ): string[] {
    const prior = Array.isArray(metadata?.consumedDiscoverySessionIds)
      ? (metadata!.consumedDiscoverySessionIds as string[])
      : [];
    return [...prior.filter((entry) => entry !== sessionId), sessionId].slice(-20);
  }

  /** Runs a real Graph request and records the outcome. */
  async checkConnection(actor: FacebookActor) {
    this.assertRead(actor);
    const row = await this.loadConnection(actor.companyId);
    if (!row?.pageId) {
      return this.getConnection(actor);
    }

    const credentials = this.decryptCredentials(row);
    if (!credentials?.pageAccessToken || credentials.pageAccessToken.startsWith('pending:')) {
      return this.getConnection(actor);
    }

    if (!hasFacebookPageReadEngagement(row.grantedPermissions ?? [])) {
      return this.getConnection(actor);
    }

    const config = this.requireAppConfig();
    const graph = this.graphClientFactory(config);
    const verification = await this.probe(() =>
      graph.verifyPage(row.pageId as string, credentials.pageAccessToken),
    );

    await this.db
      .update(fbConnections)
      .set({
        ...this.verificationColumns(
          verification.outcome,
          row.metadata as Record<string, unknown> | null,
        ),
        pageName: verification.value?.name ?? row.pageName,
        updatedAt: new Date(),
      })
      .where(eq(fbConnections.id, row.id));

    const refreshed = await this.loadConnection(actor.companyId);
    const state = await this.resolveState(refreshed);
    await this.db
      .update(fbConnections)
      .set({ state: persistFacebookConnectionState(state.state) })
      .where(eq(fbConnections.id, row.id));

    if (
      state.state === 'missing_permission' ||
      state.state === 'reauthorisation_required' ||
      state.state === 'expired' ||
      state.state === 'provider_unavailable'
    ) {
      await this.raiseNotification({
        companyId: actor.companyId,
        kind: state.state === 'missing_permission' ? 'permission_missing' : 'connection_broken',
        subjectId: null,
        title: `Facebook connection: ${state.label}`,
        body: state.detail,
      });
    } else if (state.state === 'connected') {
      await this.resolveNotification(actor.companyId, 'connection_broken', null);
      await this.resolveNotification(actor.companyId, 'permission_missing', null);
    }

    await this.audit(actor, 'connection.verified', row.id, {
      ok: verification.outcome.ok,
      state: state.state,
      message: verification.outcome.message,
    });

    return this.getConnection(actor);
  }

  async disconnect(actor: FacebookActor) {
    this.assertManageConnection(actor);
    const row = await this.loadConnection(actor.companyId);
    if (!row) {
      throw new FacebookBusinessError('NOT_FOUND', 'No Facebook connection exists for this company.');
    }

    // Revoking on Meta's side is best effort; clearing our copy is not.
    const credentials = this.decryptCredentials(row);
    if (credentials?.userAccessToken && this.appConfig.configured) {
      try {
        await this.graphClientFactory(this.appConfig).revokePermissions(credentials.userAccessToken);
      } catch {
        // Meta may already consider the grant gone; the local clear below is authoritative.
      }
    }

    await this.db
      .update(fbConnections)
      .set({
        state: 'disconnected',
        credentialsEncrypted: null,
        tokenExpiresAt: null,
        grantedPermissions: [],
        disconnectedAt: new Date(),
        lastVerificationOk: null,
        lastVerificationMessage: 'Disconnected in TITAN.',
        webhookSubscribedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(fbConnections.id, row.id));

    await this.recordConnectionEvent({
      companyId: actor.companyId,
      connectionId: row.id,
      eventType: 'disconnected',
      stateBefore: row.state,
      stateAfter: 'disconnected',
      message: 'Facebook disconnected. Stored credentials were cleared.',
      actorUserId: actor.userId,
    });
    await this.audit(actor, 'connection.disconnected', row.id, { pageId: row.pageId });

    return this.getConnection(actor);
  }

  private verificationColumns(
    outcome: FacebookVerificationOutcome,
    existingMetadata?: Record<string, unknown> | null,
  ) {
    const metadata = mergeFacebookVerificationMetadata({
      existing: existingMetadata,
      attemptAt: outcome.checkedAt,
      outcome: { ok: outcome.ok, message: outcome.message },
    });

    const base = {
      lastVerificationOk: outcome.ok,
      lastVerificationAuthError: outcome.authError,
      lastVerificationPermissionError: outcome.permissionError,
      lastVerificationProviderUnavailable: outcome.providerUnavailable,
      lastVerificationMessage: outcome.message,
      metadata,
    };

    if (outcome.ok) {
      return { ...base, lastVerifiedAt: outcome.checkedAt };
    }

    return base;
  }

  /** Wraps a Graph call so its failure kind becomes a recorded verification outcome. */
  private async probe<T>(
    call: () => Promise<T>,
  ): Promise<{ outcome: FacebookVerificationOutcome; value: T | null }> {
    try {
      const value = await call();
      return {
        value,
        outcome: {
          ok: true,
          authError: false,
          permissionError: false,
          providerUnavailable: false,
          checkedAt: new Date(),
          message: 'Facebook responded successfully.',
        },
      };
    } catch (error) {
      const graphError = error instanceof FacebookGraphError ? error : null;
      return {
        value: null,
        outcome: {
          ok: false,
          authError: graphError?.kind === 'auth',
          permissionError: graphError?.kind === 'permission',
          providerUnavailable:
            graphError?.kind === 'provider_unavailable' || graphError?.kind === 'rate_limit',
          checkedAt: new Date(),
          message: describeGraphError(error),
        },
      };
    }
  }

  private async requireUsableConnection(companyId: string): Promise<{
    row: ConnectionRow;
    credentials: FacebookStoredCredentials;
    state: FacebookConnectionStateResult;
  }> {
    const row = await this.loadConnection(companyId);
    const state = await this.resolveState(row);
    const credentials = this.decryptCredentials(row);
    const pageIdentity = row ? await this.buildPageIdentity(row) : null;

    if (pageIdentity?.mismatch) {
      throw new FacebookBusinessError(
        'FACEBOOK_PAGE_SELECTION_REQUIRED',
        FACEBOOK_SELECTED_PAGE_MISMATCH_MESSAGE,
      );
    }
    if (!row || !credentials?.pageAccessToken || credentials.pageAccessToken.startsWith('pending:')) {
      throw new FacebookBusinessError('CONNECTION_NOT_USABLE', state.detail);
    }
    if (!state.usable) {
      throw new FacebookBusinessError('CONNECTION_NOT_USABLE', state.detail);
    }
    return { row, credentials, state };
  }

  // ─── Content workspace ─────────────────────────────────────────────────────

  async listContent(actor: FacebookActor, status?: FacebookContentStatus) {
    this.assertRead(actor);
    const where = status
      ? and(eq(fbContent.companyId, actor.companyId), eq(fbContent.status, status))
      : eq(fbContent.companyId, actor.companyId);

    const rows = await this.db
      .select()
      .from(fbContent)
      .where(where)
      .orderBy(desc(fbContent.createdAt))
      .limit(200);

    const media = rows.length
      ? await this.db
          .select()
          .from(fbContentMedia)
          .where(
            inArray(
              fbContentMedia.contentId,
              rows.map((row) => row.id),
            ),
          )
      : [];

    return rows.map((row) => this.toContentSummary(row, media.filter((m) => m.contentId === row.id)));
  }

  private toContentSummary(
    row: typeof fbContent.$inferSelect,
    media: Array<typeof fbContentMedia.$inferSelect>,
  ) {
    return {
      id: row.id,
      status: row.status,
      contentType: row.contentType,
      title: row.title,
      body: row.body,
      linkUrl: row.linkUrl,
      marketingDraftId: row.marketingDraftId,
      scheduledFor: row.scheduledFor?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      approvedByUserId: row.approvedByUserId,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      decisionNotes: row.decisionNotes,
      externalPostId: row.externalPostId,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publishAttempts: row.publishAttempts,
      lastPublishError: row.lastPublishError,
      brandCheckWarnings: row.brandCheckWarnings,
      privacyAcknowledgedAt: row.privacyAcknowledgedAt?.toISOString() ?? null,
      media: media
        .sort((a, b) => a.position - b.position)
        .map((entry) => ({
          id: entry.id,
          fileName: entry.fileName,
          mimeType: entry.mimeType,
          byteSize: entry.byteSize,
          sourceContext: entry.sourceContext,
          privacyReviewRequired: entry.privacyReviewRequired,
          privacyNotes: entry.privacyNotes,
        })),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createContent(
    actor: FacebookActor,
    input: {
      title: string;
      body: string;
      contentType?: FacebookContentType;
      linkUrl?: string | null;
      marketingDraftId?: string | null;
      scheduledFor?: string | null;
    },
  ) {
    this.assertWrite(actor);
    const connection = await this.loadConnection(actor.companyId);
    const brand = checkFacebookBrandCompliance(input.body);

    let scheduledFor: Date | null = null;
    if (input.scheduledFor) {
      const validation = validateFacebookSchedule(new Date(input.scheduledFor), new Date());
      if (!validation.valid) {
        throw new FacebookBusinessError('INVALID_SCHEDULE', validation.message);
      }
      scheduledFor = validation.scheduledFor;
    }

    const [row] = await this.db
      .insert(fbContent)
      .values({
        companyId: actor.companyId,
        connectionId: connection?.id ?? undefined,
        status: 'draft',
        contentType: input.contentType ?? 'text',
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl ?? undefined,
        marketingDraftId: input.marketingDraftId ?? undefined,
        scheduledFor,
        brandCheckWarnings: brand.warnings,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.audit(actor, 'content.created', row!.id, {
      contentType: row!.contentType,
      brandWarnings: brand.warnings.length,
    });

    return this.toContentSummary(row!, []);
  }

  async updateContent(
    actor: FacebookActor,
    contentId: string,
    input: { title?: string; body?: string; linkUrl?: string | null; scheduledFor?: string | null },
  ) {
    this.assertWrite(actor);
    const row = await this.loadContent(actor.companyId, contentId);

    if (row.status === 'published' || row.status === 'publishing') {
      throw new FacebookBusinessError(
        'IMMUTABLE',
        'Content that is publishing or already published cannot be edited. Facebook holds the published copy.',
      );
    }

    // Any edit invalidates a previous approval — the approver did not see this text.
    const clearsApproval = input.body !== undefined || input.title !== undefined;
    const body = input.body ?? row.body;
    const brand = checkFacebookBrandCompliance(body);

    let scheduledFor = row.scheduledFor;
    if (input.scheduledFor !== undefined) {
      if (input.scheduledFor === null) {
        scheduledFor = null;
      } else {
        const validation = validateFacebookSchedule(new Date(input.scheduledFor), new Date());
        if (!validation.valid) {
          throw new FacebookBusinessError('INVALID_SCHEDULE', validation.message);
        }
        scheduledFor = validation.scheduledFor;
      }
    }

    const [updated] = await this.db
      .update(fbContent)
      .set({
        title: input.title ?? row.title,
        body,
        linkUrl: input.linkUrl === undefined ? row.linkUrl : input.linkUrl,
        scheduledFor,
        brandCheckWarnings: brand.warnings,
        ...(clearsApproval && row.status === 'approved'
          ? {
              status: 'draft' as const,
              approvedByUserId: null,
              approvedAt: null,
              decisionNotes: 'Approval cleared because the content was edited after approval.',
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(fbContent.id, contentId))
      .returning();

    await this.audit(actor, 'content.updated', contentId, {
      approvalCleared: clearsApproval && row.status === 'approved',
    });

    return this.toContentSummary(updated!, []);
  }

  async transitionContent(
    actor: FacebookActor,
    contentId: string,
    to: FacebookContentStatus,
    notes?: string,
  ) {
    const row = await this.loadContent(actor.companyId, contentId);

    if (to === 'approved') {
      this.assertApprove(actor);
    } else {
      this.assertWrite(actor);
    }

    if (to === 'published' || to === 'publishing' || to === 'failed') {
      throw new FacebookBusinessError(
        'INVALID_TRANSITION',
        'Publishing states are set by the publisher after Facebook responds, not by hand.',
      );
    }
    if (!canTransitionFacebookContent(row.status, to)) {
      throw new FacebookBusinessError(
        'INVALID_TRANSITION',
        `Content cannot move from ${row.status} to ${to}.`,
      );
    }
    if (to === 'scheduled' && !row.scheduledFor) {
      throw new FacebookBusinessError(
        'INVALID_SCHEDULE',
        'Set a scheduled time before moving this post to Scheduled.',
      );
    }

    const now = new Date();
    const [updated] = await this.db
      .update(fbContent)
      .set({
        status: to,
        decisionNotes: notes ?? row.decisionNotes,
        ...(to === 'in_review' ? { submittedByUserId: actor.userId, submittedAt: now } : {}),
        ...(to === 'approved' ? { approvedByUserId: actor.userId, approvedAt: now } : {}),
        // Returning to draft withdraws the approval so it cannot be published later.
        ...(to === 'draft' ? { approvedByUserId: null, approvedAt: null } : {}),
        updatedAt: now,
      })
      .where(eq(fbContent.id, contentId))
      .returning();

    const action: FacebookAuditAction =
      to === 'approved'
        ? 'content.approved'
        : to === 'in_review'
          ? 'content.submitted'
          : to === 'scheduled'
            ? 'content.scheduled'
            : to === 'cancelled'
              ? 'content.cancelled'
              : 'content.updated';

    await this.audit(actor, action, contentId, { from: row.status, to, notes: notes ?? null });

    if (to === 'in_review') {
      await this.raiseNotification({
        companyId: actor.companyId,
        kind: 'approval_pending',
        subjectId: contentId,
        title: 'Facebook post awaiting approval',
        body: `"${row.title}" was submitted for approval.`,
      });
    }
    if (to === 'approved') {
      await this.resolveNotification(actor.companyId, 'approval_pending', contentId);
    }

    return this.toContentSummary(updated!, []);
  }

  async rejectContent(actor: FacebookActor, contentId: string, notes: string) {
    this.assertApprove(actor);
    const row = await this.loadContent(actor.companyId, contentId);
    if (row.status !== 'in_review') {
      throw new FacebookBusinessError('INVALID_TRANSITION', 'Only content in review can be rejected.');
    }

    const [updated] = await this.db
      .update(fbContent)
      .set({
        status: 'draft',
        rejectedByUserId: actor.userId,
        rejectedAt: new Date(),
        approvedByUserId: null,
        approvedAt: null,
        decisionNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(fbContent.id, contentId))
      .returning();

    await this.audit(actor, 'content.rejected', contentId, { notes });
    await this.resolveNotification(actor.companyId, 'approval_pending', contentId);
    return this.toContentSummary(updated!, []);
  }

  private async loadContent(companyId: string, contentId: string) {
    const [row] = await this.db
      .select()
      .from(fbContent)
      .where(and(eq(fbContent.companyId, companyId), eq(fbContent.id, contentId)))
      .limit(1);
    if (!row) {
      throw new FacebookBusinessError('NOT_FOUND', 'That Facebook post was not found.');
    }
    return row;
  }

  // ─── Media ─────────────────────────────────────────────────────────────────

  async attachMedia(
    actor: FacebookActor,
    contentId: string,
    input: {
      fileName: string;
      mimeType: string;
      byteSize: number;
      sourceUrl?: string | null;
      storageKey?: string | null;
      sourceContext?: 'job' | 'customer' | 'employee' | 'vehicle' | 'marketing_library' | 'upload';
    },
  ) {
    this.assertWrite(actor);
    const content = await this.loadContent(actor.companyId, contentId);
    if (content.status === 'published' || content.status === 'publishing') {
      throw new FacebookBusinessError('IMMUTABLE', 'Media cannot be changed once publishing has begun.');
    }

    const validation = validateFacebookMedia({
      fileName: input.fileName,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      sourceContext: input.sourceContext,
    });

    if (!validation.valid) {
      throw new FacebookBusinessError('INVALID_MEDIA', validation.errors.join(' '));
    }

    const existing = await this.db
      .select()
      .from(fbContentMedia)
      .where(eq(fbContentMedia.contentId, contentId));

    const [row] = await this.db
      .insert(fbContentMedia)
      .values({
        companyId: actor.companyId,
        contentId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        sourceUrl: input.sourceUrl ?? undefined,
        storageKey: input.storageKey ?? undefined,
        sourceContext: input.sourceContext ?? 'upload',
        privacyReviewRequired: validation.privacyReviewRequired,
        privacyNotes: validation.privacyNotes,
        position: existing.length,
      })
      .returning();

    await this.db
      .update(fbContent)
      .set({
        contentType: existing.length >= 1 ? 'multi_photo' : 'photo',
        updatedAt: new Date(),
      })
      .where(eq(fbContent.id, contentId));

    return {
      id: row!.id,
      privacyReviewRequired: validation.privacyReviewRequired,
      privacyNotes: validation.privacyNotes,
    };
  }

  /** Records the Owner's explicit confirmation that an image is safe to publish. */
  async acknowledgePrivacy(actor: FacebookActor, contentId: string) {
    this.assertWrite(actor);
    await this.loadContent(actor.companyId, contentId);
    await this.db
      .update(fbContent)
      .set({
        privacyAcknowledgedByUserId: actor.userId,
        privacyAcknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fbContent.id, contentId));
    await this.audit(actor, 'content.updated', contentId, { privacyAcknowledged: true });
  }

  // ─── Publishing ────────────────────────────────────────────────────────────

  /**
   * Publishes approved content to Facebook.
   *
   * The attempt row is written before the request goes out and its unique
   * idempotency key is what prevents a duplicate post: if a retry reuses the
   * attempt number of a request that may already have reached Meta, the insert
   * fails and the publish is refused rather than repeated.
   */
  async publishContent(actor: FacebookActor, contentId: string) {
    this.assertApprove(actor);
    const content = await this.loadContent(actor.companyId, contentId);
    const { row: connection, credentials, state } = await this.requireUsableConnection(
      actor.companyId,
    );

    const eligibility = evaluateFacebookPublishEligibility({
      status: content.status,
      approvedByUserId: content.approvedByUserId,
      approvedAt: content.approvedAt,
      connectionState: state.state,
      capabilities: state.capabilities,
      scheduledFor: null,
      now: new Date(),
    });

    if (!eligibility.eligible) {
      await this.audit(actor, 'content.publish_attempted', contentId, {
        refused: true,
        reasonCode: eligibility.reasonCode,
      });
      throw new FacebookBusinessError(
        eligibility.reasonCode === 'missing_permission' ? 'MISSING_PERMISSION' : 'NOT_ELIGIBLE',
        eligibility.reason,
      );
    }

    const media = await this.db
      .select()
      .from(fbContentMedia)
      .where(eq(fbContentMedia.contentId, contentId));

    if (media.some((entry) => entry.privacyReviewRequired) && !content.privacyAcknowledgedAt) {
      throw new FacebookBusinessError(
        'PRIVACY_REVIEW_REQUIRED',
        'Attached media needs a privacy confirmation before it can be published. Confirm no customer, employee or number plate detail is visible.',
      );
    }

    const attempt = nextFacebookPublishAttempt({
      attempts: content.publishAttempts,
      lastAttemptReachedProvider: content.lastAttemptReachedProvider,
    });
    const idempotencyKey = buildFacebookIdempotencyKey({
      companyId: actor.companyId,
      contentId,
      attempt,
    });

    let attemptId: string;
    try {
      const [attemptRow] = await this.db
        .insert(fbPublishAttempts)
        .values({
          companyId: actor.companyId,
          contentId,
          attempt,
          idempotencyKey,
          requestedByUserId: actor.userId,
        })
        .returning();
      attemptId = attemptRow!.id;
    } catch {
      throw new FacebookBusinessError(
        'DUPLICATE_PUBLISH',
        'A publish request for this post is already recorded and may have reached Facebook. Check the Page before retrying so the post is not duplicated.',
      );
    }

    await this.db
      .update(fbContent)
      .set({ status: 'publishing', publishAttempts: attempt, updatedAt: new Date() })
      .where(eq(fbContent.id, contentId));

    await this.audit(actor, 'content.publish_attempted', contentId, { attempt, idempotencyKey });

    const graph = this.graph();

    try {
      const mediaIds: string[] = [];
      for (const entry of media) {
        if (!entry.sourceUrl) continue;
        const uploaded = await graph.uploadPhoto({
          pageId: connection.pageId as string,
          pageAccessToken: credentials.pageAccessToken,
          imageUrl: entry.sourceUrl,
        });
        mediaIds.push(uploaded.mediaId);
        await this.db
          .update(fbContentMedia)
          .set({ externalMediaId: uploaded.mediaId })
          .where(eq(fbContentMedia.id, entry.id));
      }

      const scheduled =
        content.status === 'scheduled' && content.scheduledFor
          ? Math.floor(content.scheduledFor.getTime() / 1000)
          : null;

      const published = await graph.publishPost({
        pageId: connection.pageId as string,
        pageAccessToken: credentials.pageAccessToken,
        message: content.body,
        link: content.linkUrl,
        scheduledPublishTime: scheduled,
        attachedMediaIds: mediaIds,
      });

      await this.db
        .update(fbPublishAttempts)
        .set({
          finishedAt: new Date(),
          succeeded: true,
          reachedProvider: true,
          externalPostId: published.postId,
        })
        .where(eq(fbPublishAttempts.id, attemptId));

      await this.db
        .update(fbContent)
        .set({
          status: 'published',
          externalPostId: published.postId,
          publishedAt: new Date(),
          lastAttemptReachedProvider: true,
          lastPublishError: null,
          updatedAt: new Date(),
        })
        .where(eq(fbContent.id, contentId));

      await this.recordAttribution({
        companyId: actor.companyId,
        contentId,
        fbLeadId: null,
        step: 'post',
        entityId: contentId,
        evidence: 'observed',
        occurredAt: new Date(),
      });

      await this.audit(actor, 'content.published', contentId, {
        externalPostId: published.postId,
        attempt,
      });
      await this.resolveNotification(actor.companyId, 'publish_failed', contentId);

      return this.toContentSummary(await this.loadContent(actor.companyId, contentId), media);
    } catch (error) {
      const graphError = error instanceof FacebookGraphError ? error : null;
      const reachedProvider = graphError?.reachedProvider ?? true;
      const retry = decideFacebookRetry({
        attempt,
        transient: graphError?.transient ?? false,
      });

      await this.db
        .update(fbPublishAttempts)
        .set({
          finishedAt: new Date(),
          succeeded: false,
          reachedProvider,
          errorCode: graphError?.kind ?? 'unknown',
          errorMessage: describeGraphError(error),
        })
        .where(eq(fbPublishAttempts.id, attemptId));

      await this.db
        .update(fbContent)
        .set({
          status: 'failed',
          lastAttemptReachedProvider: reachedProvider,
          lastPublishError: `${describeGraphError(error)} ${retry.reason}`,
          updatedAt: new Date(),
        })
        .where(eq(fbContent.id, contentId));

      await this.audit(actor, 'content.publish_failed', contentId, {
        attempt,
        errorKind: graphError?.kind ?? 'unknown',
        reachedProvider,
      });

      await this.raiseNotification({
        companyId: actor.companyId,
        kind: 'publish_failed',
        subjectId: contentId,
        title: 'Facebook publish failed',
        body: `"${content.title}" could not be published: ${describeGraphError(error)}`,
      });

      throw new FacebookBusinessError('PUBLISH_FAILED', `${describeGraphError(error)} ${retry.reason}`);
    }
  }

  /** Cancels a scheduled post, deleting it on Facebook when it was already created there. */
  async cancelScheduled(actor: FacebookActor, contentId: string) {
    this.assertApprove(actor);
    const content = await this.loadContent(actor.companyId, contentId);

    if (content.status !== 'scheduled' && content.status !== 'approved') {
      throw new FacebookBusinessError(
        'INVALID_TRANSITION',
        'Only an approved or scheduled post can be cancelled.',
      );
    }

    if (content.externalPostId) {
      const { row: connection, credentials } = await this.requireUsableConnection(actor.companyId);
      void connection;
      try {
        await this.graph().deleteScheduledPost(content.externalPostId, credentials.pageAccessToken);
      } catch (error) {
        throw new FacebookBusinessError(
          'CANCEL_FAILED',
          `The scheduled post could not be removed from Facebook: ${describeGraphError(error)}. It has been left as Scheduled so TITAN does not claim it was cancelled.`,
        );
      }
    }

    const [updated] = await this.db
      .update(fbContent)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(fbContent.id, contentId))
      .returning();

    await this.audit(actor, 'content.cancelled', contentId, {
      externalPostId: content.externalPostId,
    });
    return this.toContentSummary(updated!, []);
  }

  /**
   * Publishes scheduled posts that have come due. Called by the scheduler tick;
   * each post is re-checked against the full eligibility gate.
   */
  async runScheduledPublishing(companyId: string, systemUserId: string): Promise<number> {
    const due = await this.db
      .select()
      .from(fbContent)
      .where(
        and(
          eq(fbContent.companyId, companyId),
          eq(fbContent.status, 'scheduled'),
          sql`${fbContent.scheduledFor} <= now()`,
        ),
      )
      .limit(25);

    let published = 0;
    for (const content of due) {
      try {
        await this.publishContent(
          {
            companyId,
            userId: systemUserId,
            roleName: 'Company Owner',
            permissions: ['marketing:write', 'marketing_intelligence:manage'],
          },
          content.id,
        );
        published += 1;
      } catch {
        // publishContent has already recorded the failure and notified.
      }
    }
    return published;
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  async listComments(actor: FacebookActor, onlyUnanswered = false) {
    this.assertRead(actor);
    const where = onlyUnanswered
      ? and(eq(fbComments.companyId, actor.companyId), eq(fbComments.answered, false))
      : eq(fbComments.companyId, actor.companyId);

    const rows = await this.db
      .select()
      .from(fbComments)
      .where(where)
      .orderBy(desc(fbComments.occurredAt))
      .limit(200);

    return rows.map((row) => ({
      id: row.id,
      externalCommentId: row.externalCommentId,
      externalPostId: row.externalPostId,
      authorName: row.authorName,
      body: row.body,
      classification: row.classification,
      classificationConfident: row.classificationConfident,
      leadCandidate: row.leadCandidate,
      answered: row.answered,
      occurredAt: row.occurredAt?.toISOString() ?? null,
    }));
  }

  private async ingestComment(input: {
    companyId: string;
    connectionId: string | null;
    contentId: string | null;
    externalCommentId: string;
    externalPostId: string | null;
    parentExternalCommentId: string | null;
    authorName: string | null;
    authorExternalId: string | null;
    body: string;
    occurredAt: Date | null;
  }): Promise<boolean> {
    const classification = classifyFacebookComment(input.body);

    const inserted = await this.db
      .insert(fbComments)
      .values({
        companyId: input.companyId,
        connectionId: input.connectionId ?? undefined,
        contentId: input.contentId ?? undefined,
        externalCommentId: input.externalCommentId,
        externalPostId: input.externalPostId ?? undefined,
        parentExternalCommentId: input.parentExternalCommentId ?? undefined,
        authorName: input.authorName ?? undefined,
        authorExternalId: input.authorExternalId ?? undefined,
        body: input.body,
        classification: classification.classification as (typeof fbCommentClassificationEnum.enumValues)[number],
        classificationConfident: classification.confident,
        leadCandidate: classification.leadCandidate,
        occurredAt: input.occurredAt ?? undefined,
      })
      .onConflictDoNothing()
      .returning();

    return inserted.length > 0;
  }

  async draftCommentReply(actor: FacebookActor, commentId: string, body: string, auraGenerated = false) {
    this.assertWrite(actor);
    const [comment] = await this.db
      .select()
      .from(fbComments)
      .where(and(eq(fbComments.companyId, actor.companyId), eq(fbComments.id, commentId)))
      .limit(1);

    if (!comment) {
      throw new FacebookBusinessError('NOT_FOUND', 'That Facebook comment was not found.');
    }

    const [row] = await this.db
      .insert(fbReplies)
      .values({
        companyId: actor.companyId,
        commentId,
        status: 'in_review',
        body,
        auraGenerated,
        createdByUserId: actor.userId,
      })
      .returning();

    await this.audit(actor, 'comment.reply_drafted', row!.id, { commentId, auraGenerated });
    return { id: row!.id, status: row!.status, body: row!.body };
  }

  /** Approves and sends a comment reply. Approval and sending are one guarded step. */
  async approveAndSendCommentReply(actor: FacebookActor, replyId: string) {
    this.assertApprove(actor);
    const [reply] = await this.db
      .select()
      .from(fbReplies)
      .where(and(eq(fbReplies.companyId, actor.companyId), eq(fbReplies.id, replyId)))
      .limit(1);

    if (!reply) {
      throw new FacebookBusinessError('NOT_FOUND', 'That reply draft was not found.');
    }
    if (reply.status !== 'in_review' && reply.status !== 'draft') {
      throw new FacebookBusinessError(
        'INVALID_TRANSITION',
        `This reply is ${reply.status} and cannot be sent again.`,
      );
    }
    if (!reply.commentId) {
      throw new FacebookBusinessError('NOT_FOUND', 'This reply is not attached to a comment.');
    }

    const { credentials, state } = await this.requireUsableConnection(actor.companyId);
    const canReply = state.capabilities.find((entry) => entry.capability === 'reply_comments');
    if (!canReply?.available) {
      throw new FacebookBusinessError('MISSING_PERMISSION', canReply?.blockedReason ?? '');
    }

    const [comment] = await this.db
      .select()
      .from(fbComments)
      .where(eq(fbComments.id, reply.commentId))
      .limit(1);
    if (!comment) {
      throw new FacebookBusinessError('NOT_FOUND', 'The comment being replied to no longer exists.');
    }

    await this.db
      .update(fbReplies)
      .set({
        status: 'sending',
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fbReplies.id, replyId));

    await this.audit(actor, 'comment.reply_approved', replyId, { commentId: reply.commentId });

    try {
      const sent = await this.graph().replyToComment({
        commentId: comment.externalCommentId,
        pageAccessToken: credentials.pageAccessToken,
        message: reply.body,
      });

      await this.db
        .update(fbReplies)
        .set({
          status: 'sent',
          sentAt: new Date(),
          externalReplyId: sent.replyId,
          updatedAt: new Date(),
        })
        .where(eq(fbReplies.id, replyId));

      await this.db
        .update(fbComments)
        .set({ answered: true, updatedAt: new Date() })
        .where(eq(fbComments.id, reply.commentId));

      await this.audit(actor, 'comment.reply_sent', replyId, { externalReplyId: sent.replyId });
      return { id: replyId, status: 'sent' as const, externalReplyId: sent.replyId };
    } catch (error) {
      await this.db
        .update(fbReplies)
        .set({ status: 'failed', lastError: describeGraphError(error), updatedAt: new Date() })
        .where(eq(fbReplies.id, replyId));
      throw new FacebookBusinessError('REPLY_FAILED', describeGraphError(error));
    }
  }

  // ─── Leads ─────────────────────────────────────────────────────────────────

  async listLeads(actor: FacebookActor) {
    this.assertLeadAccess(actor);
    const rows = await this.db
      .select()
      .from(fbLeads)
      .where(eq(fbLeads.companyId, actor.companyId))
      .orderBy(desc(fbLeads.receivedAt))
      .limit(200);

    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      stage: row.stage,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      message: row.message,
      urgency: row.urgency,
      leadId: row.leadId,
      duplicateOutcome: row.duplicateOutcome,
      duplicateReason: row.duplicateReason,
      reviewRequired: row.reviewRequired,
      assignedToUserId: row.assignedToUserId,
      utmCampaign: row.utmCampaign,
      receivedAt: row.receivedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Imports a Facebook-originated lead and links it to the CRM.
   *
   * A name-only match is parked for review rather than merged: silently joining
   * two different people is far harder to undo than a duplicate row.
   */
  private async importLead(input: {
    companyId: string;
    connectionId: string | null;
    source: 'lead_ad' | 'messenger' | 'comment' | 'utm_link';
    externalLeadId: string | null;
    externalFormId: string | null;
    commentId: string | null;
    contentId: string | null;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    receivedAt: Date | null;
    rawPayload: Record<string, unknown>;
  }): Promise<{ imported: boolean; fbLeadId: string | null }> {
    const existingLeads = await this.db
      .select({
        leadId: leads.id,
        fullName: leads.contactName,
        email: leads.contactEmail,
        phone: leads.contactPhone,
      })
      .from(leads)
      .where(eq(leads.companyId, input.companyId))
      .limit(500);

    const existingFbLeads = await this.db
      .select({ externalLeadId: fbLeads.externalLeadId, leadId: fbLeads.leadId })
      .from(fbLeads)
      .where(eq(fbLeads.companyId, input.companyId))
      .limit(500);

    const duplicate = detectFacebookLeadDuplicate(
      {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        externalLeadId: input.externalLeadId,
      },
      [
        ...existingFbLeads
          .filter((entry) => entry.externalLeadId)
          .map((entry) => ({
            leadId: entry.leadId ?? '',
            fullName: null,
            email: null,
            phone: null,
            externalLeadId: entry.externalLeadId,
          })),
        ...existingLeads.map((entry) => ({
          leadId: entry.leadId,
          fullName: entry.fullName,
          email: entry.email,
          phone: entry.phone,
          externalLeadId: null,
        })),
      ],
    );

    if (duplicate.outcome === 'duplicate' && duplicate.matchedOn.includes('external_lead_id')) {
      return { imported: false, fbLeadId: null };
    }

    const urgency = classifyFacebookLeadUrgency(input.message ?? '');

    let crmLeadId: string | null = null;
    if (duplicate.outcome === 'duplicate') {
      crmLeadId = duplicate.matchedLeadId;
    } else if (duplicate.outcome === 'new') {
      crmLeadId = await this.createCrmLead({
        companyId: input.companyId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        message: input.message,
        urgency: urgency.urgency,
      });
    }

    const inserted = await this.db
      .insert(fbLeads)
      .values({
        companyId: input.companyId,
        connectionId: input.connectionId ?? undefined,
        source: input.source,
        stage: crmLeadId ? 'matched' : 'imported',
        externalLeadId: input.externalLeadId ?? undefined,
        externalFormId: input.externalFormId ?? undefined,
        commentId: input.commentId ?? undefined,
        contentId: input.contentId ?? undefined,
        fullName: input.fullName ?? undefined,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        message: input.message ?? undefined,
        urgency: urgency.urgency,
        leadId: crmLeadId ?? undefined,
        duplicateOfLeadId:
          duplicate.outcome === 'duplicate' ? duplicate.matchedLeadId ?? undefined : undefined,
        duplicateOutcome: duplicate.outcome,
        duplicateReason: duplicate.reason,
        reviewRequired: duplicate.outcome === 'review',
        receivedAt: input.receivedAt ?? new Date(),
        rawPayload: input.rawPayload,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length === 0) return { imported: false, fbLeadId: null };

    const fbLeadId = inserted[0]!.id;

    if (crmLeadId) {
      await this.recordAttribution({
        companyId: input.companyId,
        contentId: input.contentId,
        fbLeadId,
        step: 'lead',
        entityId: crmLeadId,
        evidence: 'observed',
        occurredAt: new Date(),
      });
    }

    await this.raiseNotification({
      companyId: input.companyId,
      kind: 'new_lead',
      subjectId: fbLeadId,
      title:
        urgency.urgency === 'emergency'
          ? 'Emergency Facebook enquiry'
          : 'New Facebook lead',
      body: `${input.fullName ?? 'A Facebook user'} enquired: ${(input.message ?? '').slice(0, 160)}`,
    });

    return { imported: true, fbLeadId };
  }

  private async createCrmLead(input: {
    companyId: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    urgency: string;
  }): Promise<string> {
    const [source] = await this.db
      .select()
      .from(leadSources)
      .where(
        and(
          eq(leadSources.companyId, input.companyId),
          eq(leadSources.sourceKey, FACEBOOK_LEAD_SOURCE_KEY),
        ),
      )
      .limit(1);

    let sourceId = source?.id;
    if (!sourceId) {
      const [created] = await this.db
        .insert(leadSources)
        .values({
          companyId: input.companyId,
          sourceKey: FACEBOOK_LEAD_SOURCE_KEY,
          name: 'Facebook',
          description: 'Leads originating from the Young Guns Plumbing Facebook Page.',
        })
        .returning();
      sourceId = created!.id;
    }

    const [lead] = await this.db
      .insert(leads)
      .values({
        companyId: input.companyId,
        sourceId,
        status: 'new',
        title: (input.message ?? 'Facebook enquiry').slice(0, 200),
        contactName: input.fullName ?? 'Facebook enquiry',
        contactEmail: input.email ?? undefined,
        contactPhone: input.phone ?? undefined,
        urgency: input.urgency,
        // A Facebook enquiry is permission to reply operationally, not to market.
        marketingConsent: false,
        operationalContactPermission: true,
      })
      .returning();

    return lead!.id;
  }

  /** Converts a comment marked as a lead candidate into a lead. */
  async convertCommentToLead(actor: FacebookActor, commentId: string) {
    this.assertLeadAccess(actor);
    const [comment] = await this.db
      .select()
      .from(fbComments)
      .where(and(eq(fbComments.companyId, actor.companyId), eq(fbComments.id, commentId)))
      .limit(1);

    if (!comment) {
      throw new FacebookBusinessError('NOT_FOUND', 'That Facebook comment was not found.');
    }

    const connection = await this.loadConnection(actor.companyId);
    const result = await this.importLead({
      companyId: actor.companyId,
      connectionId: connection?.id ?? null,
      source: 'comment',
      externalLeadId: `comment:${comment.externalCommentId}`,
      externalFormId: null,
      commentId: comment.id,
      contentId: comment.contentId,
      fullName: comment.authorName,
      email: null,
      phone: null,
      message: comment.body,
      receivedAt: comment.occurredAt,
      rawPayload: {},
    });

    if (!result.imported) {
      throw new FacebookBusinessError(
        'ALREADY_IMPORTED',
        'This comment has already been converted into a lead.',
      );
    }

    await this.audit(actor, 'lead.imported', result.fbLeadId, { source: 'comment', commentId });
    return { fbLeadId: result.fbLeadId };
  }

  async assignLead(actor: FacebookActor, fbLeadId: string, assignToUserId: string) {
    this.assertLeadAccess(actor);
    const [row] = await this.db
      .update(fbLeads)
      .set({ assignedToUserId: assignToUserId, stage: 'assigned', updatedAt: new Date() })
      .where(and(eq(fbLeads.companyId, actor.companyId), eq(fbLeads.id, fbLeadId)))
      .returning();

    if (!row) throw new FacebookBusinessError('NOT_FOUND', 'That Facebook lead was not found.');
    await this.audit(actor, 'lead.linked', fbLeadId, { assignedToUserId: assignToUserId });
    return { id: row.id, stage: row.stage, assignedToUserId: row.assignedToUserId };
  }

  /** Resolves a name-only duplicate. Only a person can make this call. */
  async resolveLeadDuplicate(
    actor: FacebookActor,
    fbLeadId: string,
    decision: 'merge' | 'separate',
    mergeIntoLeadId?: string,
  ) {
    this.assertLeadAccess(actor);
    const [row] = await this.db
      .select()
      .from(fbLeads)
      .where(and(eq(fbLeads.companyId, actor.companyId), eq(fbLeads.id, fbLeadId)))
      .limit(1);

    if (!row) throw new FacebookBusinessError('NOT_FOUND', 'That Facebook lead was not found.');
    if (!row.reviewRequired) {
      throw new FacebookBusinessError('NOT_APPLICABLE', 'This lead has no outstanding duplicate review.');
    }

    if (decision === 'merge') {
      if (!mergeIntoLeadId) {
        throw new FacebookBusinessError('INVALID_REQUEST', 'Merging requires the lead to merge into.');
      }
      await this.db
        .update(fbLeads)
        .set({
          leadId: mergeIntoLeadId,
          duplicateOfLeadId: mergeIntoLeadId,
          duplicateOutcome: 'duplicate',
          reviewRequired: false,
          stage: 'matched',
          updatedAt: new Date(),
        })
        .where(eq(fbLeads.id, fbLeadId));
    } else {
      const crmLeadId = await this.createCrmLead({
        companyId: actor.companyId,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        message: row.message,
        urgency: row.urgency,
      });
      await this.db
        .update(fbLeads)
        .set({
          leadId: crmLeadId,
          duplicateOutcome: 'new',
          reviewRequired: false,
          stage: 'matched',
          updatedAt: new Date(),
        })
        .where(eq(fbLeads.id, fbLeadId));
    }

    await this.audit(actor, 'lead.review_required', fbLeadId, { decision, mergeIntoLeadId });
    return { id: fbLeadId, decision };
  }

  // ─── Insights ──────────────────────────────────────────────────────────────

  /** Refreshes insights for published posts. Only real Graph rows are stored. */
  async refreshInsights(actor: FacebookActor) {
    this.assertRead(actor);
    const { credentials, state } = await this.requireUsableConnection(actor.companyId);

    const canRead = state.capabilities.find((entry) => entry.capability === 'read_insights');
    if (!canRead?.available) {
      throw new FacebookBusinessError('MISSING_PERMISSION', canRead?.blockedReason ?? '');
    }

    const posts = await this.db
      .select()
      .from(fbContent)
      .where(and(eq(fbContent.companyId, actor.companyId), eq(fbContent.status, 'published')))
      .limit(50);

    const graph = this.graph();
    let stored = 0;
    const returnedDates: Date[] = [];

    for (const post of posts) {
      if (!post.externalPostId) continue;
      try {
        const metrics = await graph.getPostInsights({
          postId: post.externalPostId,
          pageAccessToken: credentials.pageAccessToken,
          metrics: POST_INSIGHT_METRICS,
        });

        for (const metric of metrics) {
          const periodEnd = metric.periodEnd ? new Date(metric.periodEnd) : new Date();
          const periodStart = post.publishedAt ?? periodEnd;
          returnedDates.push(periodEnd);

          await this.db
            .insert(fbInsights)
            .values({
              companyId: actor.companyId,
              contentId: post.id,
              externalPostId: post.externalPostId,
              metricName: metric.name,
              metricValue: metric.value,
              // Graph post insights combine organic and paid without splitting them.
              source: 'combined',
              periodStart,
              periodEnd,
            })
            .onConflictDoUpdate({
              target: [
                fbInsights.companyId,
                fbInsights.externalPostId,
                fbInsights.metricName,
                fbInsights.periodStart,
              ],
              set: { metricValue: metric.value, fetchedAt: new Date() },
            });
          stored += 1;
        }
      } catch (error) {
        // One unreadable post must not blank the whole report.
        await this.audit(actor, 'insights.refreshed', post.id, {
          failed: true,
          message: describeGraphError(error),
        });
      }
    }

    const requestedFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const coverage = buildFacebookInsightCoverage({
      requestedFrom,
      requestedTo: new Date(),
      returnedDates,
      source: 'combined',
    });

    await this.audit(actor, 'insights.refreshed', null, { stored, complete: coverage.complete });
    return { stored, coverage };
  }

  async getInsights(actor: FacebookActor) {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(fbInsights)
      .where(eq(fbInsights.companyId, actor.companyId))
      .orderBy(desc(fbInsights.periodEnd))
      .limit(500);

    const coverage = buildFacebookInsightCoverage({
      requestedFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      requestedTo: new Date(),
      returnedDates: rows.map((row) => row.periodEnd),
      source: 'combined',
    });

    return {
      coverage,
      metrics: rows.map((row) => ({
        contentId: row.contentId,
        externalPostId: row.externalPostId,
        metricName: row.metricName,
        metricValue: row.metricValue,
        source: row.source,
        periodEnd: row.periodEnd.toISOString(),
        fetchedAt: row.fetchedAt.toISOString(),
      })),
    };
  }

  // ─── Attribution ───────────────────────────────────────────────────────────

  private async recordAttribution(input: {
    companyId: string;
    contentId: string | null;
    fbLeadId: string | null;
    step: string;
    entityId: string | null;
    evidence: 'observed' | 'reported';
    occurredAt: Date | null;
  }): Promise<void> {
    await this.db
      .insert(fbAttributionLinks)
      .values({
        companyId: input.companyId,
        contentId: input.contentId ?? undefined,
        fbLeadId: input.fbLeadId ?? undefined,
        step: input.step,
        entityId: input.entityId ?? undefined,
        evidence: input.evidence,
        occurredAt: input.occurredAt ?? undefined,
      })
      .onConflictDoNothing();
  }

  async getAttribution(actor: FacebookActor, contentId: string) {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(fbAttributionLinks)
      .where(
        and(eq(fbAttributionLinks.companyId, actor.companyId), eq(fbAttributionLinks.contentId, contentId)),
      );

    const links: FacebookAttributionLink[] = rows.map((row) => ({
      step: row.step as FacebookAttributionLink['step'],
      entityId: row.entityId,
      evidence: row.evidence as FacebookAttributionLink['evidence'],
      occurredAt: row.occurredAt?.toISOString() ?? null,
    }));

    // Value comes from the recorded payment link only, never from an estimate.
    const paymentLink = rows.find((row) => row.step === 'payment');
    const paymentValueCents =
      typeof paymentLink?.metadata?.amountCents === 'number'
        ? (paymentLink.metadata.amountCents as number)
        : null;

    return buildFacebookAttributionChain({ links, paymentValueCents });
  }

  // ─── Sync ──────────────────────────────────────────────────────────────────

  /**
   * Backfills comments and insights. Capabilities Meta did not grant are
   * recorded as skipped so a partial sync is never reported as a full one.
   */
  async runSync(actor: FacebookActor, trigger: 'manual' | 'scheduled' = 'manual') {
    this.assertRead(actor);
    const { row: connection, credentials, state } = await this.requireUsableConnection(
      actor.companyId,
    );

    const [run] = await this.db
      .insert(fbSyncRuns)
      .values({
        companyId: actor.companyId,
        connectionId: connection.id,
        trigger,
        status: 'running',
        startedAt: new Date(),
        requestedByUserId: actor.userId,
      })
      .returning();

    const skipped: string[] = [];
    let commentsIngested = 0;
    const graph = this.graph();

    const capable = (name: string) =>
      state.capabilities.find((entry) => entry.capability === name)?.available ?? false;

    try {
      if (capable('read_comments')) {
        const published = await this.db
          .select()
          .from(fbContent)
          .where(and(eq(fbContent.companyId, actor.companyId), eq(fbContent.status, 'published')))
          .limit(50);

        for (const post of published) {
          if (!post.externalPostId) continue;
          const comments = await graph.listPostComments({
            postId: post.externalPostId,
            pageAccessToken: credentials.pageAccessToken,
          });
          for (const comment of comments) {
            const created = await this.ingestComment({
              companyId: actor.companyId,
              connectionId: connection.id,
              contentId: post.id,
              externalCommentId: comment.id,
              externalPostId: post.externalPostId,
              parentExternalCommentId: comment.parentId,
              authorName: comment.fromName,
              authorExternalId: comment.fromId,
              body: comment.message,
              occurredAt: comment.createdTime ? new Date(comment.createdTime) : null,
            });
            if (created) commentsIngested += 1;
          }
        }
      } else {
        skipped.push('read_comments');
      }

      if (!capable('retrieve_leads')) skipped.push('retrieve_leads');
      if (!capable('read_insights')) skipped.push('read_insights');
      if (!capable('read_messages')) skipped.push('read_messages');

      await this.db
        .update(fbSyncRuns)
        .set({
          status: skipped.length > 0 ? 'partial' : 'succeeded',
          finishedAt: new Date(),
          commentsIngested,
          skippedCapabilities: skipped,
          message:
            skipped.length > 0
              ? `Synced what Meta permits. Skipped for missing permissions: ${skipped.join(', ')}.`
              : 'Sync completed.',
        })
        .where(eq(fbSyncRuns.id, run!.id));

      await this.db
        .update(fbConnections)
        .set({ lastSyncedAt: new Date() })
        .where(eq(fbConnections.id, connection.id));

      return { runId: run!.id, commentsIngested, skippedCapabilities: skipped };
    } catch (error) {
      await this.db
        .update(fbSyncRuns)
        .set({
          status: 'failed',
          finishedAt: new Date(),
          commentsIngested,
          skippedCapabilities: skipped,
          message: describeGraphError(error),
        })
        .where(eq(fbSyncRuns.id, run!.id));
      throw new FacebookBusinessError('SYNC_FAILED', describeGraphError(error));
    }
  }

  async listSyncRuns(actor: FacebookActor) {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(fbSyncRuns)
      .where(eq(fbSyncRuns.companyId, actor.companyId))
      .orderBy(desc(fbSyncRuns.createdAt))
      .limit(50);

    return rows.map((row) => ({
      id: row.id,
      trigger: row.trigger,
      status: row.status,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      commentsIngested: row.commentsIngested,
      leadsIngested: row.leadsIngested,
      skippedCapabilities: row.skippedCapabilities,
      message: row.message,
    }));
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  /**
   * Records a signature-validated webhook and applies it.
   *
   * The dedupe key makes Meta's redeliveries idempotent, so a retried delivery
   * never produces a second lead or comment.
   */
  async handleWebhook(input: {
    signatureValid: boolean;
    payload: Record<string, unknown>;
  }): Promise<{ accepted: boolean; processed: number }> {
    if (!input.signatureValid) {
      await this.db
        .insert(fbWebhookEvents)
        .values({
          field: 'unknown',
          dedupeKey: `invalid:${createHash('sha256').update(JSON.stringify(input.payload)).digest('hex')}`,
          signatureValid: false,
          processingError: 'Rejected: X-Hub-Signature-256 did not match the Meta app secret.',
          payload: input.payload,
        })
        .onConflictDoNothing();
      return { accepted: false, processed: 0 };
    }

    const entries = Array.isArray(input.payload.entry)
      ? (input.payload.entry as Array<Record<string, unknown>>)
      : [];

    let processed = 0;

    for (const entry of entries) {
      const pageId = typeof entry.id === 'string' ? entry.id : null;
      const changes = Array.isArray(entry.changes)
        ? (entry.changes as Array<Record<string, unknown>>)
        : [];

      const [connection] = pageId
        ? await this.db
            .select()
            .from(fbConnections)
            .where(eq(fbConnections.pageId, pageId))
            .limit(1)
        : [];

      for (const change of changes) {
        const field = typeof change.field === 'string' ? change.field : 'unknown';
        const value = (change.value ?? {}) as Record<string, unknown>;
        const dedupeKey = createHash('sha256')
          .update(`${pageId ?? ''}:${field}:${JSON.stringify(value)}`)
          .digest('hex');

        const recorded = await this.db
          .insert(fbWebhookEvents)
          .values({
            companyId: connection?.companyId,
            externalPageId: pageId,
            field,
            dedupeKey,
            signatureValid: true,
            payload: value,
          })
          .onConflictDoNothing()
          .returning();

        // Already seen — Meta redelivered. Nothing further to do.
        if (recorded.length === 0) continue;
        if (!connection) continue;

        try {
          if (field === 'leadgen') {
            await this.processLeadgenWebhook(connection, value);
          } else if (field === 'feed') {
            await this.processFeedWebhook(connection, value);
          }
          await this.db
            .update(fbWebhookEvents)
            .set({ processedAt: new Date() })
            .where(eq(fbWebhookEvents.id, recorded[0]!.id));
          processed += 1;
        } catch (error) {
          await this.db
            .update(fbWebhookEvents)
            .set({ processingError: describeGraphError(error) })
            .where(eq(fbWebhookEvents.id, recorded[0]!.id));
        }
      }
    }

    return { accepted: true, processed };
  }

  private async processLeadgenWebhook(
    connection: ConnectionRow,
    value: Record<string, unknown>,
  ): Promise<void> {
    const leadgenId = typeof value.leadgen_id === 'string' ? value.leadgen_id : null;
    if (!leadgenId) return;

    const credentials = this.decryptCredentials(connection);
    if (!credentials?.pageAccessToken) return;

    // The webhook carries only an id; the lead itself needs leads_retrieval.
    const lead = await this.graph().getLeadgenLead(leadgenId, credentials.pageAccessToken);

    await this.importLead({
      companyId: connection.companyId,
      connectionId: connection.id,
      source: 'lead_ad',
      externalLeadId: lead.id,
      externalFormId: lead.formId,
      commentId: null,
      contentId: null,
      fullName: lead.fields.full_name ?? lead.fields.name ?? null,
      email: lead.fields.email ?? null,
      phone: lead.fields.phone_number ?? lead.fields.phone ?? null,
      message: lead.fields.message ?? null,
      receivedAt: lead.createdTime ? new Date(lead.createdTime) : null,
      rawPayload: lead.fields,
    });
  }

  private async processFeedWebhook(
    connection: ConnectionRow,
    value: Record<string, unknown>,
  ): Promise<void> {
    if (value.item !== 'comment' || value.verb === 'remove') return;

    const commentId = typeof value.comment_id === 'string' ? value.comment_id : null;
    if (!commentId) return;

    const postId = typeof value.post_id === 'string' ? value.post_id : null;
    const [content] = postId
      ? await this.db
          .select()
          .from(fbContent)
          .where(
            and(eq(fbContent.companyId, connection.companyId), eq(fbContent.externalPostId, postId)),
          )
          .limit(1)
      : [];

    const created = await this.ingestComment({
      companyId: connection.companyId,
      connectionId: connection.id,
      contentId: content?.id ?? null,
      externalCommentId: commentId,
      externalPostId: postId,
      parentExternalCommentId: typeof value.parent_id === 'string' ? value.parent_id : null,
      authorName: typeof value.from === 'object' && value.from
        ? ((value.from as Record<string, unknown>).name as string) ?? null
        : null,
      authorExternalId:
        typeof value.from === 'object' && value.from
          ? ((value.from as Record<string, unknown>).id as string) ?? null
          : null,
      body: typeof value.message === 'string' ? value.message : '',
      occurredAt: typeof value.created_time === 'number' ? new Date(value.created_time * 1000) : null,
    });

    if (created) {
      await this.raiseNotification({
        companyId: connection.companyId,
        kind: 'unanswered_comment',
        subjectId: commentId,
        title: 'New Facebook comment',
        body: typeof value.message === 'string' ? value.message.slice(0, 200) : 'A new comment arrived.',
      });
    }
  }

  // ─── Notifications ─────────────────────────────────────────────────────────

  private async raiseNotification(input: {
    companyId: string;
    kind: FacebookNotificationKind;
    subjectId: string | null;
    title: string;
    body: string;
  }): Promise<void> {
    const dedupeKey = buildFacebookNotificationDedupeKey({
      companyId: input.companyId,
      kind: input.kind,
      subjectId: input.subjectId,
    });

    const [existing] = await this.db
      .select()
      .from(fbNotifications)
      .where(eq(fbNotifications.dedupeKey, dedupeKey))
      .limit(1);

    const send = shouldSendFacebookNotification({
      lastSentAt: existing?.lastSentAt ?? null,
      resolvedSinceLastSend: Boolean(existing?.resolvedAt),
      now: new Date(),
    });

    if (!existing) {
      await this.db.insert(fbNotifications).values({
        companyId: input.companyId,
        kind: input.kind,
        dedupeKey,
        subjectId: input.subjectId ?? undefined,
        title: input.title,
        body: input.body,
        lastSentAt: new Date(),
        sendCount: 1,
      });
      return;
    }

    if (!send) return;

    await this.db
      .update(fbNotifications)
      .set({
        title: input.title,
        body: input.body,
        lastSentAt: new Date(),
        sendCount: existing.sendCount + 1,
        resolvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(fbNotifications.id, existing.id));
  }

  private async resolveNotification(
    companyId: string,
    kind: FacebookNotificationKind,
    subjectId: string | null,
  ): Promise<void> {
    await this.db
      .update(fbNotifications)
      .set({ resolvedAt: new Date(), updatedAt: new Date() })
      .where(
        eq(
          fbNotifications.dedupeKey,
          buildFacebookNotificationDedupeKey({ companyId, kind, subjectId }),
        ),
      );
  }

  async listNotifications(actor: FacebookActor) {
    this.assertRead(actor);
    const rows = await this.db
      .select()
      .from(fbNotifications)
      .where(and(eq(fbNotifications.companyId, actor.companyId), isNull(fbNotifications.resolvedAt)))
      .orderBy(desc(fbNotifications.lastSentAt))
      .limit(50);

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      sendCount: row.sendCount,
      lastSentAt: row.lastSentAt?.toISOString() ?? null,
    }));
  }

  // ─── Owner dashboard card ──────────────────────────────────────────────────

  async getDashboardCard(actor: FacebookActor) {
    this.assertRead(actor);
    const row = await this.loadConnection(actor.companyId);
    const state = await this.resolveState(row);

    const [awaiting] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(fbContent)
      .where(and(eq(fbContent.companyId, actor.companyId), eq(fbContent.status, 'in_review')));

    const [newLeads] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(fbLeads)
      .where(and(eq(fbLeads.companyId, actor.companyId), eq(fbLeads.stage, 'imported')));

    const [unanswered] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(fbComments)
      .where(and(eq(fbComments.companyId, actor.companyId), eq(fbComments.answered, false)));

    return buildFacebookDashboardCard({
      pageName: row?.pageName ?? null,
      state: state.state,
      lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
      awaitingApproval: awaiting?.count ?? 0,
      newLeads: newLeads?.count ?? 0,
      unansweredComments: unanswered?.count ?? 0,
    });
  }

  // ─── Capability helper ─────────────────────────────────────────────────────

  async getCapabilities(actor: FacebookActor): Promise<FacebookCapabilityState[]> {
    this.assertRead(actor);
    const row = await this.loadConnection(actor.companyId);
    return resolveFacebookCapabilities(row?.grantedPermissions ?? []);
  }
}

function describeGraphError(error: unknown): string {
  if (error instanceof FacebookGraphError) {
    const code = error.graphCode !== null ? ` (Graph code ${error.graphCode})` : '';
    return `${error.message}${code}`;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown Facebook error.';
}

/** Only same-origin app paths may be redirected to after the OAuth callback. */
function sanitiseReturnPath(returnPath: string | null | undefined): string {
  if (!returnPath) return '/facebook-business';
  if (!returnPath.startsWith('/') || returnPath.startsWith('//')) return '/facebook-business';
  return returnPath;
}
