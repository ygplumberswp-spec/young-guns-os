import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  buildSelectedAccountLabel,
  buildSocialConnectionSetupRequirements,
  canManageSocialConnections,
  canViewSocialConnections,
  formatSocialConnectionFoundationStatus,
  hasCompleteAccountSelection,
  isCompanyOwnerRole,
  isSocialPublishingProvider,
  mapFacebookStateToFoundationStatus,
  resolveSocialConnectionFoundationStatus,
  SOCIAL_CONNECTION_PRODUCT_COPY,
  SOCIAL_CONNECTION_PROVIDER_LABELS,
  SOCIAL_CONNECTION_PROVIDERS,
  socialConnectionMapsToSocialMediaPlatform,
  FACEBOOK_PAGE_SELECTION_WORKSPACE_PATH,
  FACEBOOK_PENDING_PAGE_SELECTION_DETAIL,
  buildFacebookPageIdentityDisplay,
  buildFacebookVerificationTimestamps,
  isYoungGunsFinanceTenant,
  resolveFacebookConnectionState,
  resolveFacebookPageIdentity,
  resolveFacebookHistoricalPageReference,
  type SelectSocialConnectionAccountRequest,
  type SocialAccountSelection,
  type SocialConnectionHealthResult,
  type SocialConnectionProvider,
  type SocialConnectionProviderCard,
  type SocialConnectionSafeMetadata,
  type SocialConnectionsDashboard,
  type SocialDiscoveredAccount,
  type SocialPublishingProvider,
  type StartSocialConnectionOAuthRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companies,
  fbConnections,
  securityAuditLogs,
  socialMediaConnectionEvents,
  socialMediaConnections,
  socialOauthStates,
} from '@titan/db';
import {
  decryptFacebookCredentials,
  decryptSocialMediaCredentials,
  encryptSocialMediaCredentials,
  hashOAuthState,
  type SocialMediaStoredCredentials,
} from '../lib/crypto.js';
import {
  createDefaultSocialConnectionAdapters,
  detectSocialConnectionOauthConfigured,
  type SocialConnectionProviderAdapter,
} from '../lib/social-connection-provider.adapter.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export class SocialConnectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SocialConnectionError';
  }
}

export type SocialConnectionActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function sanitizeReturnPath(returnPath?: string | null): string {
  if (!returnPath?.trim()) return '/integrations';
  const trimmed = returnPath.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/integrations';
  return trimmed.slice(0, 500);
}

function parseMetadata(raw: Record<string, unknown> | null | undefined): SocialConnectionSafeMetadata {
  if (!raw || typeof raw !== 'object') return {};
  return raw as SocialConnectionSafeMetadata;
}

function isTokenExpired(metadata: SocialConnectionSafeMetadata): boolean {
  if (!metadata.tokenExpiresAt) return false;
  return new Date(metadata.tokenExpiresAt).getTime() <= Date.now();
}

export type SocialConnectionServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  appUrl: string;
  /** Resolved Meta OAuth callback (META_REDIRECT_URI ?? API_PUBLIC_URL). Facebook only. */
  facebookRedirectUri?: string;
  adapters?: Record<SocialConnectionProvider, SocialConnectionProviderAdapter>;
};

export class SocialConnectionService {
  private readonly db: DatabaseClient;
  private readonly encryptionKey: string | undefined;
  private readonly appUrl: string;
  private readonly facebookRedirectUri: string | undefined;
  private readonly adapters: Record<SocialConnectionProvider, SocialConnectionProviderAdapter>;

  constructor(deps: SocialConnectionServiceDeps) {
    this.db = deps.db;
    this.encryptionKey = deps.encryptionKey;
    this.appUrl = deps.appUrl;
    this.facebookRedirectUri = deps.facebookRedirectUri;
    this.adapters = deps.adapters ?? createDefaultSocialConnectionAdapters();
  }

  private assertRead(actor: SocialConnectionActor): void {
    if (!canViewSocialConnections(actor)) {
      throw new SocialConnectionError(
        'FORBIDDEN',
        'Social Connections require Owner, Admin or Office access. Technicians and Clients are denied.',
      );
    }
  }

  private assertFacebookDelegated(provider: SocialConnectionProvider): void {
    if (provider === 'facebook') {
      throw new SocialConnectionError(
        'DELEGATED_TO_FACEBOOK_BUSINESS',
        'Facebook Page connection is managed through Facebook Business (/api/v1/facebook-business). Use that canonical path to connect, select a Page, reconnect or disconnect.',
      );
    }
  }

  private assertSocialPublishingProvider(
    provider: SocialConnectionProvider,
  ): asserts provider is SocialPublishingProvider {
    if (!isSocialPublishingProvider(provider)) {
      throw new SocialConnectionError(
        'NOT_SOCIAL_PUBLISHING_PROVIDER',
        provider === 'google_business'
          ? 'Google Business Profile is a separate Business Profile integration — use /social-media-integrations.'
          : 'WhatsApp Business is a separate Communications integration — use /integrations/whatsapp.',
      );
    }
  }

  private assertOwnerOAuthInitiator(roleName: string): void {
    if (!isCompanyOwnerRole(roleName)) {
      throw new SocialConnectionError(
        'FORBIDDEN',
        'OAuth connection changes require Company Owner approval. Admin and Office roles may view status only.',
      );
    }
  }

  private assertManage(actor: SocialConnectionActor): void {
    this.assertRead(actor);
    if (!canManageSocialConnections(actor)) {
      throw new SocialConnectionError(
        'FORBIDDEN',
        'Only the Company Owner may connect, reconnect, disconnect or select social accounts.',
      );
    }
  }

  private requireEncryptionKey(): string {
    if (!this.encryptionKey) {
      throw new SocialConnectionError(
        'NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before social credentials can be stored.',
      );
    }
    return this.encryptionKey;
  }

  private getAdapter(provider: SocialConnectionProvider): SocialConnectionProviderAdapter {
    return this.adapters[provider];
  }

  private oauthCallbackUrl(provider: SocialConnectionProvider): string {
    return `${this.appUrl.replace(/\/$/, '')}/api/v1/social-connections/oauth/callback?provider=${provider}`;
  }

  private async recordAudit(
    actor: SocialConnectionActor,
    action: string,
    entityId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'integrations',
      action: `social_connection.${action}`,
      entityType: 'social_connection',
      entityId: entityId ?? undefined,
      userId: actor.userId,
      metadata,
    });
  }

  private async recordEvent(
    actor: SocialConnectionActor,
    connectionId: string | null,
    provider: SocialConnectionProvider,
    eventType: string,
    statusBefore: string | null,
    statusAfter: string | null,
    message: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const platform = socialConnectionMapsToSocialMediaPlatform(provider);
    await this.db.insert(socialMediaConnectionEvents).values({
      companyId: actor.companyId,
      connectionId,
      platform: platform ?? undefined,
      eventType,
      statusBefore,
      statusAfter,
      message,
      actorUserId: actor.userId,
      metadata: { provider, ...metadata },
    });
  }

  private async loadSocialMediaRow(companyId: string, provider: SocialConnectionProvider) {
    const platform = socialConnectionMapsToSocialMediaPlatform(provider);
    if (!platform) return null;
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

  private decryptCredentials(
    encrypted: string | null | undefined,
  ): SocialMediaStoredCredentials | null {
    if (!encrypted || !this.encryptionKey) return null;
    try {
      return decryptSocialMediaCredentials(encrypted, this.encryptionKey);
    } catch {
      return null;
    }
  }

  private async loadFacebookRow(companyId: string) {
    const [row] = await this.db
      .select()
      .from(fbConnections)
      .where(eq(fbConnections.companyId, companyId))
      .limit(1);
    return row ?? null;
  }

  private async buildFacebookPageIdentity(
    companyId: string,
    row: Awaited<ReturnType<typeof this.loadFacebookRow>>,
  ) {
    if (!row) return null;
    const [company] = await this.db
      .select({ slug: companies.slug, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    const historicalReference = resolveFacebookHistoricalPageReference({
      isYoungGunsTenant: isYoungGunsFinanceTenant(companyId, company ?? null),
    });
    const metadata = row.metadata as Record<string, unknown> | null;
    const providerVerifiedPageId =
      typeof metadata?.providerVerifiedPageId === 'string'
        ? metadata.providerVerifiedPageId
        : null;
    let pageAccessToken: string | null = null;
    if (row.credentialsEncrypted && this.encryptionKey) {
      try {
        pageAccessToken =
          decryptFacebookCredentials(row.credentialsEncrypted, this.encryptionKey).pageAccessToken ??
          null;
      } catch {
        pageAccessToken = null;
      }
    }
    return resolveFacebookPageIdentity({
      storedPageId: row.pageId,
      storedPageName: row.pageName,
      historicalReference,
      providerVerifiedPageId,
      hasStoredCredentials: Boolean(row.credentialsEncrypted),
      pageAccessToken,
    });
  }

  private async buildFacebookProviderCard(
    companyId: string,
    oauthConfigured: Record<SocialConnectionProvider, boolean>,
    actor: SocialConnectionActor | null,
  ): Promise<SocialConnectionProviderCard> {
    const row = companyId ? await this.loadFacebookRow(companyId) : null;
    const pageIdentity = companyId && row ? await this.buildFacebookPageIdentity(companyId, row) : null;
    const pageSelectionMismatch = Boolean(pageIdentity?.mismatch);
    const pageIdentityDisplay = pageIdentity ? buildFacebookPageIdentityDisplay(pageIdentity) : null;
    const timestamps = buildFacebookVerificationTimestamps({
      metadata: row?.metadata as Record<string, unknown> | null,
      lastVerifiedAt: row?.lastVerifiedAt ?? null,
      lastVerificationOk: row?.lastVerificationOk ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null,
    });
    const lastVerification =
      timestamps.lastSuccessfulVerificationAt
        ? {
            ok: true as const,
            authError: false,
            permissionError: false,
            providerUnavailable: false,
            checkedAt: new Date(timestamps.lastSuccessfulVerificationAt),
            message: row?.lastVerificationMessage ?? 'Facebook responded successfully.',
          }
        : timestamps.lastFailedVerificationAt
          ? {
              ok: false as const,
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
    const resolved = resolveFacebookConnectionState({
      appConfigured: oauthConfigured.facebook,
      hasStoredToken: Boolean(row?.credentialsEncrypted),
      pageSelected: Boolean(row?.pageId),
      pageName: row?.pageName ?? null,
      tokenExpiresAt: row?.tokenExpiresAt ?? null,
      grantedPermissions: row?.grantedPermissions ?? [],
      lastVerification,
      disconnectedAt: row?.disconnectedAt ?? null,
      pageIdentity,
      now: new Date(),
    });
    const foundationStatus = mapFacebookStateToFoundationStatus(resolved.state);
    const canManage = actor ? canManageSocialConnections(actor) : false;
    const pendingPageSelection = resolved.state === 'partial';
    const connectedLimited = resolved.state === 'connected_limited';
    const safeErrorMessage =
      pendingPageSelection || foundationStatus === 'DISCONNECTED' || connectedLimited
        ? null
        : row?.lastVerificationMessage ?? null;

    return {
      provider: 'facebook',
      label: SOCIAL_CONNECTION_PROVIDER_LABELS.facebook,
      foundationStatus,
      facebookConnectionState: resolved.state,
      statusLabel:
        connectedLimited || pageSelectionMismatch
          ? resolved.label
          : formatSocialConnectionFoundationStatus(foundationStatus),
      selectedAccountLabel: row?.pageName ?? row?.pageId ?? null,
      oauthAppConfigured: oauthConfigured.facebook,
      authorizeUrlAvailable: oauthConfigured.facebook,
      hasCredentials: Boolean(row?.credentialsEncrypted),
      liveProviderVerified: resolved.state === 'connected' && Boolean(row?.lastVerificationOk),
      lastHealthCheckAt: timestamps.lastSuccessfulVerificationAt,
      lastError: safeErrorMessage,
      safeErrorMessage,
      statusDetail: pageSelectionMismatch
        ? resolved.detail
        : pendingPageSelection
          ? FACEBOOK_PENDING_PAGE_SELECTION_DETAIL
          : connectedLimited
            ? resolved.detail
            : null,
      accountSelectionPath:
        pendingPageSelection && canManage ? FACEBOOK_PAGE_SELECTION_WORKSPACE_PATH : null,
      pageSelectionMismatch,
      facebookPageIdentity: pageIdentityDisplay,
      setupRequirementCategory:
        foundationStatus === 'NOT_CONFIGURED' ? 'missing_oauth_app' : null,
      canConnect:
        canManage &&
        (foundationStatus === 'NOT_CONFIGURED' ||
          foundationStatus === 'READY_TO_CONNECT' ||
          foundationStatus === 'DISCONNECTED' ||
          foundationStatus === 'ERROR'),
      canCompleteAccountSelection: canManage && pendingPageSelection,
      canReconnect:
        canManage &&
        (foundationStatus === 'RECONNECT_REQUIRED' || foundationStatus === 'ERROR'),
      canDisconnect:
        canManage &&
        (foundationStatus === 'CONNECTED' ||
          pendingPageSelection ||
          foundationStatus === 'RECONNECT_REQUIRED' ||
          foundationStatus === 'ERROR'),
      canViewSetupRequirements: Boolean(actor && canViewSocialConnections(actor)),
      connectionId: row?.id ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      disconnectedAt: row?.disconnectedAt?.toISOString() ?? null,
      delegatedTo: 'facebook_business',
      canonicalSource: 'facebook',
      managementPath: '/facebook-business',
    };
  }

  private async buildProviderCardForCompany(
    provider: SocialPublishingProvider,
    oauthConfigured: Record<SocialConnectionProvider, boolean>,
    companyId: string,
    actor: SocialConnectionActor | null,
  ): Promise<SocialConnectionProviderCard> {
    if (provider === 'facebook') {
      return this.buildFacebookProviderCard(companyId, oauthConfigured, actor);
    }

    const adapter = this.getAdapter(provider);
    const encryptionKeyConfigured = Boolean(this.encryptionKey);
    let hasCredentials = false;
    let metadata: SocialConnectionSafeMetadata = {};
    let lastError: string | null = null;
    let lastHealthCheckAt: string | null = null;
    let connectionId: string | null = null;
    let updatedAt: string | null = null;
    let disconnectedAt: string | null = null;
    let storedStatus: string | null = null;
    let liveProviderVerified = false;

    if (companyId) {
      const row = await this.loadSocialMediaRow(companyId, provider);
      hasCredentials = Boolean(row?.credentialsEncrypted);
      connectionId = row?.id ?? null;
      metadata = parseMetadata(row?.metadata as Record<string, unknown>);
      lastError = row?.lastError ?? metadata.lastErrorCode ?? null;
      lastHealthCheckAt = row?.lastHealthCheckAt?.toISOString() ?? null;
      updatedAt = row?.updatedAt?.toISOString() ?? null;
      disconnectedAt = row?.disconnectedAt?.toISOString() ?? null;
      storedStatus = row?.status ?? null;
      if (row?.credentialsEncrypted) {
        const creds = this.decryptCredentials(row.credentialsEncrypted);
        liveProviderVerified =
          process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1' && Boolean(creds?.accessToken);
      }
    }

    const hasAccountSelection = hasCompleteAccountSelection(provider, metadata);
    const foundationStatus = resolveSocialConnectionFoundationStatus({
      provider,
      oauthAppConfigured: oauthConfigured[provider],
      encryptionKeyConfigured,
      hasCredentials,
      hasAccountSelection,
      storedStatus,
      lastError,
      tokenExpired: isTokenExpired(metadata),
      reconnectRequired: Boolean(metadata.reconnectRequired),
      providerReviewRequired: adapter.requiresProviderReview() && !process.env.TIKTOK_LIVE_OAUTH_ENABLED,
    });

    const selectedAccountLabel = buildSelectedAccountLabel(provider, metadata);
    const canManage = actor ? canManageSocialConnections(actor) : false;

    return {
      provider,
      label: SOCIAL_CONNECTION_PROVIDER_LABELS[provider],
      foundationStatus,
      statusLabel: formatSocialConnectionFoundationStatus(foundationStatus),
      selectedAccountLabel,
      oauthAppConfigured: oauthConfigured[provider],
      authorizeUrlAvailable: Boolean(
        adapter.buildAuthorizeUrl('probe', this.oauthCallbackUrl(provider)),
      ),
      hasCredentials,
      liveProviderVerified,
      lastHealthCheckAt,
      lastError,
      safeErrorMessage: lastError,
      setupRequirementCategory:
        foundationStatus === 'NOT_CONFIGURED'
          ? 'missing_oauth_app'
          : foundationStatus === 'PROVIDER_REVIEW_REQUIRED'
            ? 'provider_review'
            : null,
      canConnect:
        canManage &&
        (foundationStatus === 'READY_TO_CONNECT' ||
          foundationStatus === 'NOT_CONFIGURED' ||
          foundationStatus === 'DISCONNECTED' ||
          foundationStatus === 'ERROR'),
      canCompleteAccountSelection:
        canManage && foundationStatus === 'ACCOUNT_SELECTION_REQUIRED',
      canReconnect:
        canManage &&
        (foundationStatus === 'RECONNECT_REQUIRED' || foundationStatus === 'ERROR'),
      canDisconnect:
        canManage &&
        (foundationStatus === 'CONNECTED' ||
          foundationStatus === 'ACCOUNT_SELECTION_REQUIRED' ||
          foundationStatus === 'RECONNECT_REQUIRED' ||
          foundationStatus === 'ERROR'),
      canViewSetupRequirements: Boolean(actor && canViewSocialConnections(actor)),
      connectionId,
      updatedAt,
      disconnectedAt,
      delegatedTo: null,
      canonicalSource: provider,
      managementPath: '/integrations',
    };
  }

  async getDashboard(actor: SocialConnectionActor): Promise<SocialConnectionsDashboard> {
    this.assertRead(actor);
    const oauthConfigured = detectSocialConnectionOauthConfigured();
    const providers = await Promise.all(
      SOCIAL_CONNECTION_PROVIDERS.map((provider) =>
        this.buildProviderCardForCompany(provider, oauthConfigured, actor.companyId, actor),
      ),
    );
    return {
      summary: SOCIAL_CONNECTION_PRODUCT_COPY.summary,
      providers,
      runtimeHonesty: {
        encryptionKeyConfigured: Boolean(this.encryptionKey),
        liveOAuthAvailable: Object.values(oauthConfigured).some(Boolean),
        publishingAvailable: false,
        schedulingAvailable: false,
        analyticsAvailable: false,
        note: SOCIAL_CONNECTION_PRODUCT_COPY.honesty,
      },
    };
  }

  getSetupRequirements(provider: SocialConnectionProvider) {
    this.assertSocialPublishingProvider(provider);
    const callbackBaseUrl = this.appUrl.replace(/\/$/, '');
    return buildSocialConnectionSetupRequirements(provider, callbackBaseUrl, {
      facebookCallbackUrl:
        provider === 'facebook' ? this.facebookRedirectUri : undefined,
    });
  }

  async startOAuth(
    actor: SocialConnectionActor,
    input: StartSocialConnectionOAuthRequest,
  ): Promise<{ authorizationUrl: string }> {
    this.assertManage(actor);
    this.assertOwnerOAuthInitiator(actor.roleName);
    const provider = input.provider;
    this.assertSocialPublishingProvider(provider);
    this.assertFacebookDelegated(provider);
    const adapter = this.getAdapter(provider);

    if (adapter.requiresProviderReview() && process.env.TIKTOK_LIVE_OAUTH_ENABLED !== '1') {
      throw new SocialConnectionError(
        'PROVIDER_REVIEW_REQUIRED',
        'TikTok live authorization cannot proceed until provider review is complete.',
      );
    }

    if (!adapter.isConfigured()) {
      throw new SocialConnectionError(
        'NOT_CONFIGURED',
        `${SOCIAL_CONNECTION_PROVIDER_LABELS[provider]} OAuth app is not configured on this host.`,
      );
    }

    this.requireEncryptionKey();

    const state = randomBytes(32).toString('base64url');
    const stateHash = hashOAuthState(state);
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
    const returnPath = sanitizeReturnPath(input.returnPath);

    await this.db.insert(socialOauthStates).values({
      companyId: actor.companyId,
      userId: actor.userId,
      provider,
      stateHash,
      returnPath,
      initiatorRoleName: actor.roleName,
      expiresAt,
    });

    const authorizationUrl = adapter.buildAuthorizeUrl(state, this.oauthCallbackUrl(provider));
    if (!authorizationUrl) {
      throw new SocialConnectionError(
        'NOT_CONFIGURED',
        'Authorization URL could not be built — check provider configuration.',
      );
    }

    await this.recordAudit(actor, 'owner_approval.oauth_start', provider, {
      provider,
      returnPath,
      initiatorRoleName: actor.roleName,
    });
    await this.recordAudit(actor, 'oauth.start', provider, { provider, returnPath });
    await this.recordEvent(actor, null, provider, 'owner_approval', null, 'CONNECTING', 'Owner approved OAuth connection start');
    await this.recordEvent(actor, null, provider, 'oauth_started', null, 'CONNECTING', 'OAuth flow started');

    return { authorizationUrl };
  }

  async consumeOAuthState(state: string, provider: SocialConnectionProvider) {
    const [stateRow] = await this.db
      .select()
      .from(socialOauthStates)
      .where(
        and(
          eq(socialOauthStates.stateHash, hashOAuthState(state)),
          eq(socialOauthStates.provider, provider),
          isNull(socialOauthStates.consumedAt),
          gt(socialOauthStates.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!stateRow) {
      throw new SocialConnectionError(
        'INVALID_STATE',
        'OAuth state is invalid, expired, or already used.',
      );
    }

    if (!isCompanyOwnerRole(stateRow.initiatorRoleName)) {
      throw new SocialConnectionError(
        'FORBIDDEN',
        'OAuth callback rejected — connection was not initiated by Company Owner.',
      );
    }

    await this.db
      .update(socialOauthStates)
      .set({ consumedAt: new Date() })
      .where(eq(socialOauthStates.id, stateRow.id));

    return stateRow;
  }

  async handleOAuthCallback(input: {
    provider: SocialConnectionProvider;
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
  }): Promise<string> {
    const provider = input.provider;
    this.assertSocialPublishingProvider(provider);
    const adapter = this.getAdapter(provider);

    if (input.error) {
      return this.buildFrontendRedirect({
        returnPath: '/integrations',
        provider,
        outcome: 'error',
        message: input.errorDescription ?? input.error,
      });
    }

    if (!input.code || !input.state) {
      throw new SocialConnectionError('INVALID_CALLBACK', 'Missing OAuth code or state.');
    }

    const stateRow = await this.consumeOAuthState(input.state, provider);
    const encryptionKey = this.requireEncryptionKey();
    const redirectUri = this.oauthCallbackUrl(provider);

    let exchange;
    try {
      exchange = await adapter.exchangeCode({ code: input.code, redirectUri });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider token exchange failed.';
      await this.recordAudit(
        {
          companyId: stateRow.companyId,
          userId: stateRow.userId,
          roleName: 'Company Owner',
          permissions: ['*'],
        },
        'oauth.callback_failed',
        provider,
        { provider, message },
      );
      return this.buildFrontendRedirect({
        returnPath: stateRow.returnPath,
        provider,
        outcome: 'error',
        message,
      });
    }

    const credentials: SocialMediaStoredCredentials = {
      version: 1,
      accessToken: exchange.accessToken,
      refreshToken: exchange.refreshToken,
      expiresAt: exchange.expiresAt,
      scope: exchange.scope,
    };

    const discovered = await adapter.discoverAccounts(credentials);
    const metadata: SocialConnectionSafeMetadata = {
      grantedScopes: exchange.scope?.split(',') ?? [],
      tokenExpiresAt: exchange.expiresAt ?? null,
      providerUserId: exchange.providerUserId ?? null,
      pendingAccountIds: discovered.map((a) => a.id),
      reconnectRequired: false,
    };

    const actor: SocialConnectionActor = {
      companyId: stateRow.companyId,
      userId: stateRow.userId,
      roleName: 'Company Owner',
      permissions: ['*'],
    };

    await this.upsertSocialMediaPending(actor, provider, credentials, metadata, encryptionKey, discovered);

    await this.recordAudit(actor, 'oauth.callback', provider, {
      provider,
      accountsDiscovered: discovered.length,
    });
    await this.recordEvent(
      actor,
      null,
      provider,
      'oauth_callback',
      null,
      'ACCOUNT_SELECTION_REQUIRED',
      'OAuth callback succeeded — account selection required',
      { accountsDiscovered: discovered.length },
    );

    return this.buildFrontendRedirect({
      returnPath: stateRow.returnPath,
      provider,
      outcome: discovered.length > 0 ? 'select_account' : 'connected_pending',
      message:
        discovered.length > 0
          ? 'Select the business account to complete the connection.'
          : 'OAuth succeeded. Complete account selection when accounts are available.',
    });
  }

  private async upsertSocialMediaPending(
    actor: SocialConnectionActor,
    provider: SocialConnectionProvider,
    credentials: SocialMediaStoredCredentials,
    metadata: SocialConnectionSafeMetadata,
    encryptionKey: string,
    discovered: SocialDiscoveredAccount[],
  ) {
    const platform = socialConnectionMapsToSocialMediaPlatform(provider);
    if (!platform) return;

    const encrypted = encryptSocialMediaCredentials(credentials, encryptionKey);
    const existing = await this.loadSocialMediaRow(actor.companyId, provider);
    const displayName = SOCIAL_CONNECTION_PROVIDER_LABELS[provider];

    const rowMetadata = {
      ...metadata,
      pendingAccounts: discovered.map(({ id, kind, displayName: name, parentAccountId }) => ({
        id,
        kind,
        displayName: name,
        parentAccountId,
      })),
    };

    if (existing) {
      await this.db
        .update(socialMediaConnections)
        .set({
          credentialsEncrypted: encrypted,
          status: 'awaiting_credentials',
          displayName: existing.displayName || displayName,
          metadata: rowMetadata,
          lastError: null,
          disconnectedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(socialMediaConnections.id, existing.id));
    } else {
      await this.db.insert(socialMediaConnections).values({
        companyId: actor.companyId,
        platform,
        displayName,
        status: 'awaiting_credentials',
        credentialsEncrypted: encrypted,
        metadata: rowMetadata,
        createdByUserId: actor.userId,
      });
    }
  }

  async listDiscoveredAccounts(
    actor: SocialConnectionActor,
    provider: SocialConnectionProvider,
  ): Promise<SocialDiscoveredAccount[]> {
    this.assertManage(actor);
    this.assertSocialPublishingProvider(provider);
    this.assertFacebookDelegated(provider);
    const adapter = this.getAdapter(provider);

    const row = await this.loadSocialMediaRow(actor.companyId, provider);
    if (!row?.credentialsEncrypted) {
      throw new SocialConnectionError(
        'NOT_AUTHORISED',
        'Complete OAuth before listing accounts.',
      );
    }
    const metadata = parseMetadata(row.metadata as Record<string, unknown>);
    const pending = metadata.pendingAccounts as SocialDiscoveredAccount[] | undefined;
    if (pending?.length) {
      return pending.map(({ id, kind, displayName, parentAccountId }) => ({
        id,
        kind,
        displayName,
        parentAccountId,
      }));
    }

    const creds = this.decryptCredentials(row.credentialsEncrypted);
    if (!creds) {
      return [];
    }
    return adapter.discoverAccounts(creds);
  }

  async selectAccount(
    actor: SocialConnectionActor,
    input: SelectSocialConnectionAccountRequest,
  ): Promise<SocialConnectionProviderCard> {
    this.assertManage(actor);
    this.assertOwnerOAuthInitiator(actor.roleName);
    this.assertSocialPublishingProvider(input.provider);
    this.assertFacebookDelegated(input.provider);
    const { provider, selection } = input;
    const discovered = await this.listDiscoveredAccounts(actor, provider);
    this.validateSelection(provider, selection, discovered);

    const encryptionKey = this.requireEncryptionKey();

    await this.applySocialMediaSelection(actor, provider, selection, discovered, encryptionKey);

    await this.recordAudit(actor, 'account.selected', provider, {
      provider,
      selection: this.safeSelectionForAudit(selection),
    });
    await this.recordEvent(
      actor,
      null,
      provider,
      'account_selected',
      'ACCOUNT_SELECTION_REQUIRED',
      'CONNECTED',
      'Account selection stored after server validation',
    );

    const oauthConfigured = detectSocialConnectionOauthConfigured();
    return this.buildProviderCardForCompany(
      provider,
      oauthConfigured,
      actor.companyId,
      actor,
    );
  }

  private safeSelectionForAudit(selection: SocialAccountSelection): Record<string, string | null | undefined> {
    return {
      facebookPageId: selection.facebookPageId,
      instagramBusinessAccountId: selection.instagramBusinessAccountId,
      googleBusinessAccountId: selection.googleBusinessAccountId,
      googleBusinessLocationId: selection.googleBusinessLocationId,
      whatsappBusinessAccountId: selection.whatsappBusinessAccountId,
      whatsappPhoneNumberId: selection.whatsappPhoneNumberId,
      tiktokAccountId: selection.tiktokAccountId,
    };
  }

  private validateSelection(
    provider: SocialPublishingProvider,
    selection: SocialAccountSelection,
    discovered: SocialDiscoveredAccount[],
  ): void {
    const ids = new Set(discovered.map((a) => a.id));

    const assertInDiscovery = (id: string | null | undefined, label: string) => {
      if (!id || !ids.has(id)) {
        throw new SocialConnectionError(
          'INVALID_SELECTION',
          `${label} was not returned by the authenticated provider connection.`,
        );
      }
    };

    switch (provider) {
      case 'facebook':
        assertInDiscovery(selection.facebookPageId, 'Facebook Page');
        break;
      case 'instagram':
        assertInDiscovery(selection.instagramBusinessAccountId, 'Instagram Business account');
        break;
      case 'tiktok':
        assertInDiscovery(selection.tiktokAccountId, 'TikTok account');
        break;
    }
  }

  private labelForId(id: string, discovered: SocialDiscoveredAccount[]): string {
    return discovered.find((a) => a.id === id)?.displayName ?? id;
  }

  private async applySocialMediaSelection(
    actor: SocialConnectionActor,
    provider: SocialPublishingProvider,
    selection: SocialAccountSelection,
    discovered: SocialDiscoveredAccount[],
    encryptionKey: string,
  ) {
    const row = await this.loadSocialMediaRow(actor.companyId, provider);
    if (!row?.credentialsEncrypted) {
      throw new SocialConnectionError('NOT_FOUND', 'Connection not found.');
    }

    const existingMeta = parseMetadata(row.metadata as Record<string, unknown>);
    const metadata: SocialConnectionSafeMetadata = {
      ...existingMeta,
      pendingAccountIds: undefined,
      pendingAccounts: undefined,
      reconnectRequired: false,
    };

    switch (provider) {
      case 'facebook':
        metadata.selectedFacebookPageId = selection.facebookPageId ?? null;
        metadata.selectedFacebookPageName = this.labelForId(selection.facebookPageId!, discovered);
        break;
      case 'instagram':
        metadata.selectedInstagramBusinessAccountId = selection.instagramBusinessAccountId ?? null;
        metadata.selectedInstagramBusinessAccountName = this.labelForId(
          selection.instagramBusinessAccountId!,
          discovered,
        );
        break;
      case 'tiktok':
        metadata.selectedTiktokAccountId = selection.tiktokAccountId ?? null;
        metadata.selectedTiktokAccountName = this.labelForId(selection.tiktokAccountId!, discovered);
        break;
    }

    const creds = this.decryptCredentials(row.credentialsEncrypted);
    if (creds) {
      const encrypted = encryptSocialMediaCredentials(creds, encryptionKey);
      await this.db
        .update(socialMediaConnections)
        .set({
          credentialsEncrypted: encrypted,
          status: 'connected',
          externalAccountId:
            selection.facebookPageId ??
            selection.instagramBusinessAccountId ??
            selection.googleBusinessLocationId ??
            selection.tiktokAccountId ??
            row.externalAccountId,
          displayName:
            buildSelectedAccountLabel(provider, metadata) ?? row.displayName,
          metadata,
          connectedAt: row.connectedAt ?? new Date(),
          disconnectedAt: null,
          lastError: null,
          lastHealthCheckAt: new Date(),
          lastHealthMessage: 'Account selection validated and stored.',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialMediaConnections.id, row.id),
            eq(socialMediaConnections.companyId, actor.companyId),
          ),
        );
    }
  }

  async checkHealth(
    actor: SocialConnectionActor,
    provider: SocialConnectionProvider,
  ): Promise<SocialConnectionHealthResult> {
    this.assertManage(actor);
    this.assertSocialPublishingProvider(provider);
    this.assertFacebookDelegated(provider);
    const adapter = this.getAdapter(provider);
    const now = new Date().toISOString();

    const row = await this.loadSocialMediaRow(actor.companyId, provider);
    const metadata = parseMetadata(row?.metadata as Record<string, unknown>);
    const creds = this.decryptCredentials(row?.credentialsEncrypted);
    const probe = creds
      ? await adapter.probeHealth(creds, metadata)
      : { ok: false, message: 'No credentials stored.', liveProviderVerified: false };

    const foundationStatus = resolveSocialConnectionFoundationStatus({
      provider,
      oauthAppConfigured: adapter.isConfigured(),
      encryptionKeyConfigured: Boolean(this.encryptionKey),
      hasCredentials: Boolean(creds),
      hasAccountSelection: hasCompleteAccountSelection(provider, metadata),
      storedStatus: row?.status ?? null,
      lastError: probe.ok ? null : probe.message,
      tokenExpired: isTokenExpired(metadata),
      reconnectRequired: Boolean(metadata.reconnectRequired),
      providerReviewRequired:
        adapter.requiresProviderReview() && process.env.TIKTOK_LIVE_OAUTH_ENABLED !== '1',
    });

    if (row) {
      await this.db
        .update(socialMediaConnections)
        .set({
          lastHealthCheckAt: new Date(),
          lastHealthMessage: probe.message,
          lastError: probe.ok ? null : probe.message,
          status: foundationStatus === 'CONNECTED' ? 'connected' : row.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialMediaConnections.id, row.id),
            eq(socialMediaConnections.companyId, actor.companyId),
          ),
        );
    }

    await this.recordEvent(
      actor,
      row?.id ?? null,
      provider,
      'health_check',
      row?.status ?? null,
      foundationStatus,
      probe.message,
    );

    return {
      provider,
      foundationStatus,
      healthy: probe.ok,
      message: probe.message,
      lastHealthCheckAt: now,
      liveProviderVerified: probe.liveProviderVerified,
    };
  }

  async reconnect(
    actor: SocialConnectionActor,
    provider: SocialConnectionProvider,
  ): Promise<{ authorizationUrl: string }> {
    this.assertManage(actor);
    this.assertOwnerOAuthInitiator(actor.roleName);
    this.assertSocialPublishingProvider(provider);
    this.assertFacebookDelegated(provider);
    await this.recordEvent(actor, null, provider, 'reconnect_requested', null, 'CONNECTING', 'Reconnect requested');
    return this.startOAuth(actor, { provider, returnPath: '/integrations' });
  }

  async disconnect(actor: SocialConnectionActor, provider: SocialConnectionProvider) {
    this.assertManage(actor);
    this.assertOwnerOAuthInitiator(actor.roleName);
    this.assertSocialPublishingProvider(provider);
    this.assertFacebookDelegated(provider);

    const row = await this.loadSocialMediaRow(actor.companyId, provider);
    if (row) {
      await this.db
        .update(socialMediaConnections)
        .set({
          credentialsEncrypted: null,
          status: 'disconnected',
          disconnectedAt: new Date(),
          lastError: null,
          metadata: {},
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialMediaConnections.id, row.id),
            eq(socialMediaConnections.companyId, actor.companyId),
          ),
        );
    }

    await this.recordAudit(actor, 'disconnect', provider, { provider });
    await this.recordEvent(actor, null, provider, 'disconnected', 'CONNECTED', 'DISCONNECTED', 'Credentials revoked');

    const oauthConfigured = detectSocialConnectionOauthConfigured();
    return this.buildProviderCardForCompany(provider, oauthConfigured, actor.companyId, actor);
  }

  /** Cross-tenant guard — companyId must match actor. */
  async assertTenantScope(actor: SocialConnectionActor, companyId: string): Promise<void> {
    if (actor.companyId !== companyId) {
      throw new SocialConnectionError('FORBIDDEN', 'Cross-tenant social connection access denied.');
    }
  }

  buildFrontendRedirect(input: {
    returnPath?: string | null;
    provider: SocialConnectionProvider;
    outcome: string;
    message?: string;
  }): string {
    const base = sanitizeReturnPath(input.returnPath);
    const params = new URLSearchParams({
      social: input.provider,
      outcome: input.outcome,
    });
    if (input.message) {
      params.set('message', input.message.slice(0, 300));
    }
    return `${base}?${params.toString()}`;
  }
}
