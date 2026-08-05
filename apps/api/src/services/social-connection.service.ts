import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  buildSelectedAccountLabel,
  buildSocialConnectionSetupRequirements,
  canAccessSocialConnections,
  canManageSocialConnections,
  formatSocialConnectionFoundationStatus,
  hasCompleteAccountSelection,
  resolveSocialConnectionFoundationStatus,
  SOCIAL_CONNECTION_PRODUCT_COPY,
  SOCIAL_CONNECTION_PROVIDER_LABELS,
  SOCIAL_CONNECTION_PROVIDERS,
  socialConnectionMapsToSocialMediaPlatform,
  type SelectSocialConnectionAccountRequest,
  type SocialAccountSelection,
  type SocialConnectionHealthResult,
  type SocialConnectionProvider,
  type SocialConnectionProviderCard,
  type SocialConnectionSafeMetadata,
  type SocialConnectionsDashboard,
  type SocialDiscoveredAccount,
  type StartSocialConnectionOAuthRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  securityAuditLogs,
  socialMediaConnectionEvents,
  socialMediaConnections,
  socialOauthStates,
  whatsappConnections,
} from '@titan/db';
import {
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
  adapters?: Record<SocialConnectionProvider, SocialConnectionProviderAdapter>;
};

export class SocialConnectionService {
  private readonly db: DatabaseClient;
  private readonly encryptionKey: string | undefined;
  private readonly appUrl: string;
  private readonly adapters: Record<SocialConnectionProvider, SocialConnectionProviderAdapter>;

  constructor(deps: SocialConnectionServiceDeps) {
    this.db = deps.db;
    this.encryptionKey = deps.encryptionKey;
    this.appUrl = deps.appUrl;
    this.adapters = deps.adapters ?? createDefaultSocialConnectionAdapters();
  }

  private assertRead(actor: SocialConnectionActor): void {
    if (!canAccessSocialConnections(actor)) {
      throw new SocialConnectionError(
        'FORBIDDEN',
        'Social Connections require Owner or permitted Admin access. Technicians and Clients are denied.',
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

  private async loadWhatsappRow(companyId: string) {
    const [row] = await this.db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.companyId, companyId))
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

  private async buildProviderCardForCompany(
    provider: SocialConnectionProvider,
    oauthConfigured: Record<SocialConnectionProvider, boolean>,
    companyId: string,
    actor: SocialConnectionActor | null,
  ): Promise<SocialConnectionProviderCard> {
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
      if (provider === 'whatsapp_business') {
        const waRow = await this.loadWhatsappRow(companyId);
        hasCredentials = Boolean(waRow?.credentialsEncrypted);
        connectionId = waRow?.id ?? null;
        updatedAt = waRow?.updatedAt?.toISOString() ?? null;
        lastError = waRow?.lastError ?? null;
        storedStatus = waRow?.status ?? null;
        metadata = {
          selectedWhatsappBusinessAccountId: waRow?.businessAccountId ?? null,
          selectedWhatsappPhoneNumberId: waRow?.phoneNumberId ?? null,
          selectedWhatsappDisplayPhoneNumber: waRow?.displayPhoneNumber ?? null,
        };
        if (waRow?.connectedAt) {
          lastHealthCheckAt = waRow.connectedAt.toISOString();
        }
      } else {
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
      canViewSetupRequirements: canManage || Boolean(actor && canAccessSocialConnections(actor)),
      connectionId,
      updatedAt,
      disconnectedAt,
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
    return buildSocialConnectionSetupRequirements(provider, this.appUrl.replace(/\/$/, ''));
  }

  async startOAuth(
    actor: SocialConnectionActor,
    input: StartSocialConnectionOAuthRequest,
  ): Promise<{ authorizationUrl: string }> {
    this.assertManage(actor);
    const provider = input.provider;
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
      expiresAt,
    });

    const authorizationUrl = adapter.buildAuthorizeUrl(state, this.oauthCallbackUrl(provider));
    if (!authorizationUrl) {
      throw new SocialConnectionError(
        'NOT_CONFIGURED',
        'Authorization URL could not be built — check provider configuration.',
      );
    }

    await this.recordAudit(actor, 'oauth.start', provider, { provider, returnPath });
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

    await this.db
      .update(socialOauthStates)
      .set({ consumedAt: new Date() })
      .where(eq(socialOauthStates.id, stateRow.id));

    return stateRow;
  }

  /** Reject replay — second consume attempt fails at DB query level. */
  async assertOAuthStateNotReplayed(state: string, provider: SocialConnectionProvider): Promise<void> {
    const [consumed] = await this.db
      .select()
      .from(socialOauthStates)
      .where(
        and(
          eq(socialOauthStates.stateHash, hashOAuthState(state)),
          eq(socialOauthStates.provider, provider),
        ),
      )
      .limit(1);
    if (consumed && consumed.consumedAt) {
      throw new SocialConnectionError('STATE_REPLAY', 'OAuth state replay rejected.');
    }
  }

  async handleOAuthCallback(input: {
    provider: SocialConnectionProvider;
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
  }): Promise<string> {
    const provider = input.provider;
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

    if (provider === 'whatsapp_business') {
      await this.upsertWhatsappPending(actor, credentials, metadata, encryptionKey);
    } else {
      await this.upsertSocialMediaPending(actor, provider, credentials, metadata, encryptionKey, discovered);
    }

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

  private async upsertWhatsappPending(
    actor: SocialConnectionActor,
    credentials: SocialMediaStoredCredentials,
    metadata: SocialConnectionSafeMetadata,
    encryptionKey: string,
  ) {
    const encrypted = encryptSocialMediaCredentials(credentials, encryptionKey);
    const existing = await this.loadWhatsappRow(actor.companyId);
    if (existing) {
      await this.db
        .update(whatsappConnections)
        .set({
          credentialsEncrypted: encrypted,
          status: 'pending',
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(whatsappConnections.id, existing.id));
    } else {
      await this.db.insert(whatsappConnections).values({
        companyId: actor.companyId,
        credentialsEncrypted: encrypted,
        status: 'pending',
      });
    }
    void metadata;
  }

  async listDiscoveredAccounts(
    actor: SocialConnectionActor,
    provider: SocialConnectionProvider,
  ): Promise<SocialDiscoveredAccount[]> {
    this.assertManage(actor);
    const adapter = this.getAdapter(provider);

    if (provider === 'whatsapp_business') {
      const waRow = await this.loadWhatsappRow(actor.companyId);
      const creds = this.decryptCredentials(waRow?.credentialsEncrypted);
      if (!creds) {
        throw new SocialConnectionError(
          'NOT_AUTHORISED',
          'Complete OAuth before listing WhatsApp Business accounts.',
        );
      }
      return adapter.discoverAccounts(creds);
    }

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
    const { provider, selection } = input;
    const discovered = await this.listDiscoveredAccounts(actor, provider);
    this.validateSelection(provider, selection, discovered);

    const encryptionKey = this.requireEncryptionKey();

    if (provider === 'whatsapp_business') {
      await this.applyWhatsappSelection(actor, selection, discovered);
    } else {
      await this.applySocialMediaSelection(actor, provider, selection, discovered, encryptionKey);
    }

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
    provider: SocialConnectionProvider,
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
      case 'google_business':
        assertInDiscovery(selection.googleBusinessAccountId, 'Google Business account');
        assertInDiscovery(selection.googleBusinessLocationId, 'Google Business location');
        break;
      case 'whatsapp_business':
        assertInDiscovery(selection.whatsappBusinessAccountId, 'WhatsApp Business Account');
        assertInDiscovery(selection.whatsappPhoneNumberId, 'WhatsApp phone number');
        break;
      case 'tiktok':
        assertInDiscovery(selection.tiktokAccountId, 'TikTok account');
        break;
    }
  }

  private labelForId(id: string, discovered: SocialDiscoveredAccount[]): string {
    return discovered.find((a) => a.id === id)?.displayName ?? id;
  }

  private async applyWhatsappSelection(
    actor: SocialConnectionActor,
    selection: SocialAccountSelection,
    discovered: SocialDiscoveredAccount[],
  ) {
    const waRow = await this.loadWhatsappRow(actor.companyId);
    if (!waRow) {
      throw new SocialConnectionError('NOT_FOUND', 'WhatsApp connection row not found.');
    }
    await this.db
      .update(whatsappConnections)
      .set({
        businessAccountId: selection.whatsappBusinessAccountId ?? null,
        phoneNumberId: selection.whatsappPhoneNumberId ?? null,
        displayPhoneNumber: this.labelForId(selection.whatsappPhoneNumberId!, discovered),
        status: 'connected',
        connectedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappConnections.id, waRow.id),
          eq(whatsappConnections.companyId, actor.companyId),
        ),
      );
  }

  private async applySocialMediaSelection(
    actor: SocialConnectionActor,
    provider: SocialConnectionProvider,
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
      case 'google_business':
        metadata.selectedGoogleBusinessAccountId = selection.googleBusinessAccountId ?? null;
        metadata.selectedGoogleBusinessLocationId = selection.googleBusinessLocationId ?? null;
        metadata.selectedGoogleBusinessLocationName = this.labelForId(
          selection.googleBusinessLocationId!,
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
    const adapter = this.getAdapter(provider);
    const now = new Date().toISOString();

    if (provider === 'whatsapp_business') {
      const waRow = await this.loadWhatsappRow(actor.companyId);
      const metadata: SocialConnectionSafeMetadata = {
        selectedWhatsappBusinessAccountId: waRow?.businessAccountId ?? null,
        selectedWhatsappPhoneNumberId: waRow?.phoneNumberId ?? null,
      };
      const creds = this.decryptCredentials(waRow?.credentialsEncrypted);
      const probe = creds
        ? await adapter.probeHealth(creds, metadata)
        : { ok: false, message: 'No credentials stored.', liveProviderVerified: false };

      if (waRow) {
        await this.db
          .update(whatsappConnections)
          .set({
            lastError: probe.ok ? null : probe.message,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(whatsappConnections.id, waRow.id),
              eq(whatsappConnections.companyId, actor.companyId),
            ),
          );
      }

      const foundationStatus = resolveSocialConnectionFoundationStatus({
        provider,
        oauthAppConfigured: adapter.isConfigured(),
        encryptionKeyConfigured: Boolean(this.encryptionKey),
        hasCredentials: Boolean(creds),
        hasAccountSelection: hasCompleteAccountSelection(provider, metadata),
        lastError: probe.ok ? null : probe.message,
      });

      return {
        provider,
        foundationStatus,
        healthy: probe.ok,
        message: probe.message,
        lastHealthCheckAt: now,
        liveProviderVerified: probe.liveProviderVerified,
      };
    }

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
    await this.recordEvent(actor, null, provider, 'reconnect_requested', null, 'CONNECTING', 'Reconnect requested');
    return this.startOAuth(actor, { provider, returnPath: '/integrations' });
  }

  async disconnect(actor: SocialConnectionActor, provider: SocialConnectionProvider) {
    this.assertManage(actor);

    if (provider === 'whatsapp_business') {
      const waRow = await this.loadWhatsappRow(actor.companyId);
      if (waRow) {
        await this.db
          .update(whatsappConnections)
          .set({
            credentialsEncrypted: null,
            phoneNumberId: null,
            businessAccountId: null,
            displayPhoneNumber: null,
            status: 'disconnected',
            connectedAt: null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(whatsappConnections.id, waRow.id),
              eq(whatsappConnections.companyId, actor.companyId),
            ),
          );
      }
    } else {
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
