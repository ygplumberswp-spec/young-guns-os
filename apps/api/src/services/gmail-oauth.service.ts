import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { CommPlatformCapabilityState, CommPlatformGmailOAuthStatus } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { commPlatformAccounts, integrationOauthStates, securityAuditLogs } from '@titan/db';
import type { GmailOAuthEnvConfig } from '../config.js';
import {
  decryptGmailCredentials,
  encryptGmailCredentials,
  hashOAuthState,
  type GmailOAuthStoredCredentials,
} from '../lib/crypto.js';
import { GMAIL_OAUTH_SCOPES, GmailClient, GmailClientError } from '../lib/gmail.client.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

export class GmailOAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GmailOAuthError';
  }
}

type GmailTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export class GmailOAuthService {
  private readonly refreshInflight = new Map<string, Promise<string>>();

  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey: string | undefined,
    private readonly appUrl: string,
    private readonly oauthConfig: GmailOAuthEnvConfig | { configured: false },
  ) {}

  static create(deps: {
    db: DatabaseClient;
    encryptionKey?: string;
    appUrl: string;
    oauthConfig: GmailOAuthEnvConfig | { configured: false };
  }): GmailOAuthService {
    return new GmailOAuthService(deps.db, deps.encryptionKey, deps.appUrl, deps.oauthConfig);
  }

  isAppConfigured(): boolean {
    return this.oauthConfig.configured;
  }

  getRedirectUri(): string | null {
    return this.oauthConfig.configured ? this.oauthConfig.redirectUri : null;
  }

  getScopes(): string[] {
    return [...GMAIL_OAUTH_SCOPES];
  }

  async getOAuthStatus(companyId: string): Promise<CommPlatformGmailOAuthStatus> {
    const oauthConfigured = this.isAppConfigured();
    const [account] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    if (!oauthConfigured) {
      return {
        oauthConfigured: false,
        connected: false,
        status: 'not_configured',
        emailAddress: null,
        redirectUri: null,
        scopes: this.getScopes(),
        emptyStateMessage:
          'Business Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API, then connect Young Guns Gmail via Google OAuth.',
      };
    }

    const connected = account?.status === 'connected' && Boolean(account.credentialsEncrypted);
    const status: CommPlatformCapabilityState = account?.status ?? 'not_configured';

    return {
      oauthConfigured: true,
      connected,
      status,
      emailAddress: account?.externalAddress ?? null,
      redirectUri: this.getRedirectUri(),
      scopes: this.getScopes(),
      emptyStateMessage: connected
        ? `Business Gmail connected (${account?.externalAddress ?? 'account'}). Sync pulls real messages only.`
        : 'Google OAuth is configured. Connect Young Guns Plumbing Gmail to index Inbox, Sent, Drafts, and Labels.',
    };
  }

  async startOAuth(input: {
    companyId: string;
    userId: string;
    returnPath?: string | null;
  }): Promise<{ authorizationUrl: string }> {
    const oauthConfig = this.getAppConfig();
    this.ensureEncryptionKey();

    const state = randomBytes(32).toString('base64url');
    const stateHash = hashOAuthState(state);
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    const safeReturnPath = sanitizeReturnPath(input.returnPath);

    await this.db.insert(integrationOauthStates).values({
      companyId: input.companyId,
      userId: input.userId,
      provider: 'gmail',
      stateHash,
      returnPath: safeReturnPath,
      expiresAt,
    });

    await this.upsertAccountPending(input.companyId);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: oauthConfig.clientId,
      redirect_uri: oauthConfig.redirectUri,
      scope: GMAIL_OAUTH_SCOPES.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    return {
      authorizationUrl: `${AUTHORIZE_URL}?${params.toString()}`,
    };
  }

  async handleOAuthCallback(input: {
    code?: string | string[];
    state?: string | string[];
    error?: string | string[];
    errorDescription?: string | string[];
  }): Promise<string> {
    const providerError = pickQueryValue(input.error);
    if (providerError) {
      const description = pickQueryValue(input.errorDescription);
      return this.buildFrontendRedirect({
        outcome: 'error',
        message: description ?? `Google authorization was declined (${providerError})`,
      });
    }

    const code = pickQueryValue(input.code);
    const state = pickQueryValue(input.state);
    if (!code || !state) {
      return this.buildFrontendRedirect({
        outcome: 'error',
        message: 'Google did not return the required authorization details.',
      });
    }

    try {
      this.ensureEncryptionKey();
      const oauthState = await this.consumeOAuthState(state);
      if (!oauthState) {
        return this.buildFrontendRedirect({
          outcome: 'error',
          message: 'OAuth state is invalid or expired. Start Connect Gmail again.',
        });
      }

      const tokenPayload = await this.exchangeAuthorizationCode(code);
      if (!tokenPayload.access_token) {
        throw new GmailOAuthError('TOKEN_MISSING', 'Google did not return an access token.');
      }

      const client = new GmailClient(tokenPayload.access_token);
      const profile = await client.getProfile();

      const [existing] = await this.db
        .select()
        .from(commPlatformAccounts)
        .where(
          and(
            eq(commPlatformAccounts.companyId, oauthState.companyId),
            eq(commPlatformAccounts.accountKind, 'business_gmail'),
          ),
        )
        .limit(1);

      let priorRefresh: string | undefined;
      if (existing?.credentialsEncrypted) {
        try {
          priorRefresh = decryptGmailCredentials(
            existing.credentialsEncrypted,
            this.encryptionKey!,
          ).refreshToken;
        } catch {
          priorRefresh = undefined;
        }
      }

      const refreshToken = tokenPayload.refresh_token ?? priorRefresh;
      if (!refreshToken) {
        throw new GmailOAuthError(
          'REFRESH_MISSING',
          'Google did not return a refresh token. Revoke TITAN access in Google Account and reconnect with consent.',
        );
      }

      const expiresAt = new Date(
        Date.now() + Math.max((tokenPayload.expires_in ?? 3600) - 30, 60) * 1000,
      ).toISOString();

      const credentials: GmailOAuthStoredCredentials = {
        version: 1,
        accessToken: tokenPayload.access_token,
        refreshToken,
        expiresAt,
        emailAddress: profile.emailAddress,
        scope: tokenPayload.scope ?? GMAIL_OAUTH_SCOPES.join(' '),
      };

      const credentialsEncrypted = encryptGmailCredentials(credentials, this.encryptionKey!);
      const now = new Date();
      const values = {
        companyId: oauthState.companyId,
        accountKind: 'business_gmail' as const,
        label: 'Business Gmail',
        externalAddress: profile.emailAddress,
        credentialsEncrypted,
        status: 'connected' as const,
        privateByDefault: false,
        syncEnabled: true,
        connectedAt: now,
        lastError: null,
        lastTestAt: now,
        lastTestStatus: 'ok',
        lastTestMessage: `OAuth connected as ${profile.emailAddress}`,
        metadata: {
          ...(existing?.metadata ?? {}),
          oauthProvider: 'google',
          scope: credentials.scope,
          lastOAuthAt: now.toISOString(),
        },
        updatedAt: now,
      };

      if (existing) {
        await this.db
          .update(commPlatformAccounts)
          .set(values)
          .where(eq(commPlatformAccounts.id, existing.id));
      } else {
        await this.db.insert(commPlatformAccounts).values(values);
      }

      await this.db.insert(securityAuditLogs).values({
        companyId: oauthState.companyId,
        category: 'communications',
        action: 'comm_platform_gmail_oauth_connected',
        entityType: 'communications_platform',
        entityId: oauthState.companyId,
        userId: oauthState.userId,
        metadata: { emailAddress: profile.emailAddress, autoSend: false },
      });

      return this.buildFrontendRedirect({
        outcome: 'connected',
        message: `Connected ${profile.emailAddress}`,
        returnPath: oauthState.returnPath,
      });
    } catch (error) {
      const message =
        error instanceof GmailOAuthError || error instanceof GmailClientError
          ? error.message
          : 'Unable to complete Google sign-in.';
      return this.buildFrontendRedirect({ outcome: 'error', message });
    }
  }

  async getValidAccessToken(companyId: string): Promise<string> {
    this.ensureEncryptionKey();
    if (!this.isAppConfigured()) {
      throw new GmailOAuthError(
        'NOT_CONFIGURED',
        'Business Gmail OAuth is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
      );
    }

    const [account] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    if (!account?.credentialsEncrypted) {
      throw new GmailOAuthError('NOT_CONNECTED', 'Business Gmail is not connected.');
    }

    const credentials = decryptGmailCredentials(account.credentialsEncrypted, this.encryptionKey!);
    const expiresAtMs = credentials.expiresAt ? Date.parse(credentials.expiresAt) : NaN;

    if (
      credentials.accessToken &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs - Date.now() > TOKEN_REFRESH_BUFFER_MS
    ) {
      return credentials.accessToken;
    }

    if (!credentials.refreshToken) {
      throw new GmailOAuthError(
        'RECONNECT_REQUIRED',
        'Gmail refresh token missing. Reconnect Business Gmail via Google OAuth.',
      );
    }

    const inflight = this.refreshInflight.get(companyId);
    if (inflight) return inflight;

    const refreshPromise = this.refreshAndPersistTokens(companyId, account.id, credentials).finally(
      () => {
        this.refreshInflight.delete(companyId);
      },
    );
    this.refreshInflight.set(companyId, refreshPromise);
    return refreshPromise;
  }

  async createClient(companyId: string): Promise<GmailClient> {
    const accessToken = await this.getValidAccessToken(companyId);
    return new GmailClient(accessToken);
  }

  async testConnection(companyId: string): Promise<{
    ok: boolean;
    status: CommPlatformCapabilityState;
    message: string;
    emailAddress: string | null;
    testedAt: string;
  }> {
    const testedAt = new Date().toISOString();
    if (!this.isAppConfigured()) {
      return {
        ok: false,
        status: 'not_configured',
        message:
          'Business Gmail is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before testing.',
        emailAddress: null,
        testedAt,
      };
    }

    try {
      const client = await this.createClient(companyId);
      const profile = await client.getProfile();
      await this.db
        .update(commPlatformAccounts)
        .set({
          status: 'connected',
          externalAddress: profile.emailAddress,
          lastTestAt: new Date(),
          lastTestStatus: 'ok',
          lastTestMessage: `Live Gmail probe ok for ${profile.emailAddress}`,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(commPlatformAccounts.companyId, companyId),
            eq(commPlatformAccounts.accountKind, 'business_gmail'),
          ),
        );
      return {
        ok: true,
        status: 'connected',
        message: `Live Gmail probe ok for ${profile.emailAddress}`,
        emailAddress: profile.emailAddress,
        testedAt,
      };
    } catch (error) {
      const message =
        error instanceof GmailOAuthError || error instanceof GmailClientError
          ? error.message
          : 'Gmail connection test failed';
      const status: CommPlatformCapabilityState =
        error instanceof GmailOAuthError && error.code === 'NOT_CONNECTED'
          ? 'disconnected'
          : error instanceof GmailOAuthError && error.code === 'NOT_CONFIGURED'
            ? 'not_configured'
            : 'error';
      await this.db
        .update(commPlatformAccounts)
        .set({
          lastTestAt: new Date(),
          lastTestStatus: 'failed',
          lastTestMessage: message,
          lastError: message,
          status: status === 'not_configured' ? 'not_configured' : status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(commPlatformAccounts.companyId, companyId),
            eq(commPlatformAccounts.accountKind, 'business_gmail'),
          ),
        );
      return { ok: false, status, message, emailAddress: null, testedAt };
    }
  }

  async revokeAndDisconnect(companyId: string, userId: string): Promise<void> {
    const [account] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    if (account?.credentialsEncrypted && this.encryptionKey) {
      try {
        const credentials = decryptGmailCredentials(
          account.credentialsEncrypted,
          this.encryptionKey,
        );
        const token = credentials.refreshToken || credentials.accessToken;
        if (token) {
          await fetch(REVOKE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }),
          }).catch(() => undefined);
        }
      } catch {
        // Best-effort revoke — still clear local credentials.
      }
    }

    await this.db
      .update(commPlatformAccounts)
      .set({
        credentialsEncrypted: null,
        status: 'disconnected',
        syncEnabled: false,
        connectedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commPlatformAccounts.companyId, companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      );

    await this.db.insert(securityAuditLogs).values({
      companyId,
      category: 'communications',
      action: 'comm_platform_gmail_oauth_disconnected',
      entityType: 'communications_platform',
      entityId: companyId,
      userId,
      metadata: { revoked: true, autoSend: false },
    });
  }

  private async refreshAndPersistTokens(
    _companyId: string,
    accountId: string,
    credentials: GmailOAuthStoredCredentials,
  ): Promise<string> {
    try {
      const tokenPayload = await this.refreshAccessToken(credentials.refreshToken!);
      const accessToken = tokenPayload.access_token;
      if (!accessToken) {
        throw new GmailOAuthError('REFRESH_FAILED', 'Google did not return a refreshed access token.');
      }

      const next: GmailOAuthStoredCredentials = {
        version: 1,
        accessToken,
        refreshToken: tokenPayload.refresh_token ?? credentials.refreshToken,
        expiresAt: new Date(
          Date.now() + Math.max((tokenPayload.expires_in ?? 3600) - 30, 60) * 1000,
        ).toISOString(),
        emailAddress: credentials.emailAddress,
        scope: tokenPayload.scope ?? credentials.scope,
      };

      await this.db
        .update(commPlatformAccounts)
        .set({
          credentialsEncrypted: encryptGmailCredentials(next, this.encryptionKey!),
          lastError: null,
          status: 'connected',
          updatedAt: new Date(),
        })
        .where(eq(commPlatformAccounts.id, accountId));

      return accessToken;
    } catch (error) {
      const message =
        error instanceof GmailOAuthError || error instanceof GmailClientError
          ? error.message
          : 'Gmail token refresh failed';
      await this.db
        .update(commPlatformAccounts)
        .set({
          status: 'error',
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(commPlatformAccounts.id, accountId));
      throw error instanceof GmailOAuthError
        ? error
        : new GmailOAuthError('REFRESH_FAILED', message);
    }
  }

  private async exchangeAuthorizationCode(code: string): Promise<GmailTokenResponse> {
    const oauthConfig = this.getAppConfig();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: oauthConfig.redirectUri,
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
    });
    return this.requestToken(body);
  }

  private async refreshAccessToken(refreshToken: string): Promise<GmailTokenResponse> {
    const oauthConfig = this.getAppConfig();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
    });
    return this.requestToken(body);
  }

  private async requestToken(body: URLSearchParams): Promise<GmailTokenResponse> {
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
      });
    } catch (error) {
      throw new GmailOAuthError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Google token endpoint',
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GmailOAuthError(
        response.status === 401 || response.status === 403 ? 'AUTH_FAILED' : 'TOKEN_REQUEST_FAILED',
        `Google token request failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`,
      );
    }

    return (await response.json()) as GmailTokenResponse;
  }

  private async consumeOAuthState(state: string) {
    const stateHash = hashOAuthState(state);
    const now = new Date();
    const record = await this.db.query.integrationOauthStates.findFirst({
      where: and(
        eq(integrationOauthStates.stateHash, stateHash),
        eq(integrationOauthStates.provider, 'gmail'),
        isNull(integrationOauthStates.consumedAt),
        gt(integrationOauthStates.expiresAt, now),
      ),
    });
    if (!record) return null;

    const [consumed] = await this.db
      .update(integrationOauthStates)
      .set({ consumedAt: now })
      .where(
        and(
          eq(integrationOauthStates.id, record.id),
          isNull(integrationOauthStates.consumedAt),
          gt(integrationOauthStates.expiresAt, now),
        ),
      )
      .returning();

    return consumed ?? null;
  }

  private async upsertAccountPending(companyId: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(commPlatformAccounts)
      .where(
        and(
          eq(commPlatformAccounts.companyId, companyId),
          eq(commPlatformAccounts.accountKind, 'business_gmail'),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db
        .update(commPlatformAccounts)
        .set({ status: 'pending', lastError: null, updatedAt: new Date() })
        .where(eq(commPlatformAccounts.id, existing.id));
      return;
    }

    await this.db.insert(commPlatformAccounts).values({
      companyId,
      accountKind: 'business_gmail',
      label: 'Business Gmail',
      status: 'pending',
      privateByDefault: false,
      syncEnabled: false,
    });
  }

  private getAppConfig(): GmailOAuthEnvConfig {
    if (!this.oauthConfig.configured) {
      throw new GmailOAuthError(
        'NOT_CONFIGURED',
        'Business Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.',
      );
    }
    return this.oauthConfig;
  }

  private ensureEncryptionKey(): void {
    if (!this.encryptionKey) {
      throw new GmailOAuthError(
        'NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before Gmail OAuth.',
      );
    }
  }

  private buildFrontendRedirect(input: {
    outcome: 'connected' | 'error';
    message: string;
    returnPath?: string | null;
  }): string {
    const path =
      input.returnPath && input.returnPath.startsWith('/')
        ? input.returnPath
        : '/communications-hub';
    const url = new URL(path, this.appUrl);
    url.searchParams.set('gmail', input.outcome);
    url.searchParams.set('message', input.message.slice(0, 300));
    return url.toString();
  }
}

export function createDeterministicGmailOAuthState(seed: string): string {
  return createHash('sha256').update(`gmail-oauth:${seed}`).digest('base64url');
}

function sanitizeReturnPath(returnPath?: string | null): string | null {
  if (!returnPath) return '/communications-hub';
  if (!returnPath.startsWith('/') || returnPath.startsWith('//')) return '/communications-hub';
  if (returnPath.length > 300) return '/communications-hub';
  return returnPath;
}

function pickQueryValue(value?: string | string[]): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

export function mapGmailOAuthError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof GmailOAuthError) {
    const status =
      error.code === 'NOT_CONFIGURED'
        ? 503
        : error.code === 'NOT_CONNECTED' || error.code === 'RECONNECT_REQUIRED'
          ? 409
          : error.code === 'FORBIDDEN'
            ? 403
            : 400;
    return { status, code: error.code, message: error.message };
  }
  if (error instanceof GmailClientError) {
    return {
      status: error.status === 401 || error.status === 403 ? 401 : 502,
      code: error.code,
      message: error.message,
    };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected Gmail OAuth error' };
}
