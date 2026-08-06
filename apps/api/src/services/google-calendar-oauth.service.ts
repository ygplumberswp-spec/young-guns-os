import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  GOOGLE_CALENDAR_OAUTH_SCOPES,
  findMissingCalendarScopes,
  type GoogleCalendarConnectionState,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  googleCalendarConnections,
  integrationConnections,
  integrationOauthStates,
  securityAuditLogs,
} from '@titan/db';
import type { GoogleCalendarOAuthEnvConfig } from '../config.js';
import {
  decryptGoogleCalendarCredentials,
  encryptGoogleCalendarCredentials,
  hashOAuthState,
  type GoogleCalendarStoredCredentials,
} from '../lib/crypto.js';
import { GoogleCalendarClient, GoogleCalendarClientError } from '../lib/google-calendar.client.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const DEFAULT_RETURN_PATH = '/integrations/google-calendar';

export class GoogleCalendarOAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleCalendarOAuthError';
  }
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

/**
 * Google Calendar OAuth for a tenant.
 *
 * Tokens are AES-256-GCM encrypted into google_calendar_connections and never
 * leave this service. Refreshes are de-duplicated per company so a burst of sync
 * requests cannot race Google's token endpoint and invalidate each other.
 */
export class GoogleCalendarOAuthService {
  private readonly refreshInflight = new Map<string, Promise<string>>();

  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey: string | undefined,
    private readonly appUrl: string,
    private readonly oauthConfig: GoogleCalendarOAuthEnvConfig | { configured: false },
  ) {}

  static create(deps: {
    db: DatabaseClient;
    encryptionKey?: string;
    appUrl: string;
    oauthConfig: GoogleCalendarOAuthEnvConfig | { configured: false };
  }): GoogleCalendarOAuthService {
    return new GoogleCalendarOAuthService(
      deps.db,
      deps.encryptionKey,
      deps.appUrl,
      deps.oauthConfig,
    );
  }

  isAppConfigured(): boolean {
    return this.oauthConfig.configured;
  }

  getRedirectUri(): string | null {
    return this.oauthConfig.configured ? this.oauthConfig.redirectUri : null;
  }

  getScopes(): string[] {
    return [...GOOGLE_CALENDAR_OAUTH_SCOPES];
  }

  async getConnectionRow(companyId: string) {
    const [row] = await this.db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.companyId, companyId))
      .limit(1);
    return row ?? null;
  }

  /**
   * The tenant's honest connection state. An OAuth client on the API host does
   * not mean this tenant connected, and a stored row does not mean the grant
   * still works — a revoked grant reports reauth_required.
   */
  async resolveState(companyId: string): Promise<{
    state: GoogleCalendarConnectionState;
    connected: boolean;
    grantedScopes: string[];
    missingScopes: string[];
    googleAccountEmail: string | null;
  }> {
    if (!this.isAppConfigured()) {
      return {
        state: 'not_configured',
        connected: false,
        grantedScopes: [],
        missingScopes: this.getScopes(),
        googleAccountEmail: null,
      };
    }

    const row = await this.getConnectionRow(companyId);
    if (!row) {
      return {
        state: 'disconnected',
        connected: false,
        grantedScopes: [],
        missingScopes: this.getScopes(),
        googleAccountEmail: null,
      };
    }

    const grantedScopes = row.grantedScopes ?? [];
    const hasCredentials = Boolean(row.credentialsEncrypted);
    const connected = row.status === 'connected' && hasCredentials;

    const state: GoogleCalendarConnectionState = connected
      ? 'connected'
      : row.status === 'reauth_required' || (row.status === 'connected' && !hasCredentials)
        ? 'reauth_required'
        : row.status === 'error' || row.status === 'pending'
          ? row.status
          : 'disconnected';

    return {
      state,
      connected,
      grantedScopes,
      missingScopes: findMissingCalendarScopes(grantedScopes),
      googleAccountEmail: row.googleAccountEmail ?? null,
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
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);

    await this.db.insert(integrationOauthStates).values({
      companyId: input.companyId,
      userId: input.userId,
      provider: 'google_calendar',
      stateHash: hashOAuthState(state),
      returnPath: sanitizeReturnPath(input.returnPath),
      expiresAt,
    });

    await this.markPending(input.companyId, input.userId);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: oauthConfig.clientId,
      redirect_uri: oauthConfig.redirectUri,
      scope: this.getScopes().join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    return { authorizationUrl: `${AUTHORIZE_URL}?${params.toString()}` };
  }

  /** Always resolves to a redirect URL — the browser must never see a raw error. */
  async handleOAuthCallback(input: {
    code?: string | string[];
    state?: string | string[];
    error?: string | string[];
    errorDescription?: string | string[];
    scope?: string | string[];
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

    let oauthState: Awaited<ReturnType<typeof this.consumeOAuthState>> = null;

    try {
      this.ensureEncryptionKey();
      oauthState = await this.consumeOAuthState(state);
      if (!oauthState) {
        return this.buildFrontendRedirect({
          outcome: 'error',
          message: 'OAuth state is invalid or expired. Start Connect Google Calendar again.',
        });
      }

      const tokenPayload = await this.exchangeAuthorizationCode(code);
      if (!tokenPayload.access_token) {
        throw new GoogleCalendarOAuthError(
          'TOKEN_MISSING',
          'Google did not return an access token.',
        );
      }

      const client = new GoogleCalendarClient(tokenPayload.access_token);
      const userInfo = await client.getUserInfo();

      const existing = await this.getConnectionRow(oauthState.companyId);
      let priorRefresh: string | undefined;
      if (existing?.credentialsEncrypted) {
        try {
          priorRefresh = decryptGoogleCalendarCredentials(
            existing.credentialsEncrypted,
            this.encryptionKey!,
          ).refreshToken;
        } catch {
          priorRefresh = undefined;
        }
      }

      // Google only returns a refresh token on first consent, so keep the old one.
      const refreshToken = tokenPayload.refresh_token ?? priorRefresh;
      if (!refreshToken) {
        throw new GoogleCalendarOAuthError(
          'REFRESH_MISSING',
          'Google did not return a refresh token. Remove TITAN from your Google Account permissions and connect again.',
        );
      }

      const grantedScopes = (tokenPayload.scope ?? pickQueryValue(input.scope) ?? '')
        .split(' ')
        .map((scope) => scope.trim())
        .filter(Boolean);

      const credentials: GoogleCalendarStoredCredentials = {
        version: 1,
        accessToken: tokenPayload.access_token,
        refreshToken,
        expiresAt: computeExpiry(tokenPayload.expires_in),
        googleAccountEmail: userInfo.email,
        googleAccountId: userInfo.sub,
        scope: grantedScopes.join(' '),
      };

      const now = new Date();
      const values = {
        companyId: oauthState.companyId,
        status: 'connected' as const,
        credentialsEncrypted: encryptGoogleCalendarCredentials(credentials, this.encryptionKey!),
        googleAccountEmail: userInfo.email,
        googleAccountId: userInfo.sub ?? null,
        grantedScopes: grantedScopes.length > 0 ? grantedScopes : this.getScopes(),
        connectedAt: now,
        disconnectedAt: null,
        connectedByUserId: oauthState.userId,
        reauthRequiredAt: null,
        lastError: null,
        lastErrorAt: null,
        updatedAt: now,
      };

      if (existing) {
        await this.db
          .update(googleCalendarConnections)
          .set(values)
          .where(eq(googleCalendarConnections.id, existing.id));
      } else {
        await this.db.insert(googleCalendarConnections).values(values);
      }

      await this.writeAudit({
        companyId: oauthState.companyId,
        userId: oauthState.userId,
        action: 'google_calendar_oauth_connected',
        metadata: {
          googleAccountEmail: userInfo.email,
          grantedScopes,
          missingScopes: findMissingCalendarScopes(grantedScopes),
        },
      });

      await this.mirrorIntegrationHub(oauthState.companyId, {
        status: 'connected',
        connectedAt: now,
      });

      return this.buildFrontendRedirect({
        outcome: 'connected',
        message: `Connected ${userInfo.email}`,
        returnPath: oauthState.returnPath,
      });
    } catch (error) {
      const message =
        error instanceof GoogleCalendarOAuthError || error instanceof GoogleCalendarClientError
          ? error.message
          : 'Unable to complete Google Calendar sign-in.';

      if (oauthState) {
        await this.recordError(oauthState.companyId, message).catch(() => undefined);
        await this.writeAudit({
          companyId: oauthState.companyId,
          userId: oauthState.userId,
          action: 'google_calendar_oauth_failed',
          metadata: { message },
        }).catch(() => undefined);
      }

      return this.buildFrontendRedirect({
        outcome: 'error',
        message,
        returnPath: oauthState?.returnPath ?? null,
      });
    }
  }

  /** A live access token, refreshing first when the stored one is near expiry. */
  async getValidAccessToken(companyId: string): Promise<string> {
    this.ensureEncryptionKey();
    if (!this.isAppConfigured()) {
      throw new GoogleCalendarOAuthError(
        'NOT_CONFIGURED',
        'Google Calendar OAuth is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
      );
    }

    const row = await this.getConnectionRow(companyId);
    if (!row?.credentialsEncrypted) {
      throw new GoogleCalendarOAuthError('NOT_CONNECTED', 'Google Calendar is not connected.');
    }

    const credentials = decryptGoogleCalendarCredentials(
      row.credentialsEncrypted,
      this.encryptionKey!,
    );
    const expiresAtMs = credentials.expiresAt ? Date.parse(credentials.expiresAt) : NaN;

    if (
      credentials.accessToken &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs - Date.now() > TOKEN_REFRESH_BUFFER_MS
    ) {
      return credentials.accessToken;
    }

    if (!credentials.refreshToken) {
      throw new GoogleCalendarOAuthError(
        'RECONNECT_REQUIRED',
        'Google Calendar refresh token is missing. Reconnect Google Calendar.',
      );
    }

    const inflight = this.refreshInflight.get(companyId);
    if (inflight) return inflight;

    const refreshPromise = this.refreshAndPersist(companyId, row.id, credentials).finally(() => {
      this.refreshInflight.delete(companyId);
    });
    this.refreshInflight.set(companyId, refreshPromise);
    return refreshPromise;
  }

  async createClient(companyId: string): Promise<GoogleCalendarClient> {
    return new GoogleCalendarClient(await this.getValidAccessToken(companyId));
  }

  /** Revokes the grant at Google, then clears local tokens either way. */
  async disconnect(companyId: string, userId: string): Promise<void> {
    const row = await this.getConnectionRow(companyId);

    if (row?.credentialsEncrypted && this.encryptionKey) {
      try {
        const credentials = decryptGoogleCalendarCredentials(
          row.credentialsEncrypted,
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
        // Best-effort revoke — local credentials are cleared regardless.
      }
    }

    if (row) {
      await this.db
        .update(googleCalendarConnections)
        .set({
          status: 'disconnected',
          credentialsEncrypted: null,
          autoSyncEnabled: false,
          pushJobsEnabled: false,
          reauthRequiredAt: null,
          disconnectedAt: new Date(),
          connectedAt: null,
          lastError: null,
          lastErrorAt: null,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarConnections.id, row.id));
    }

    await this.mirrorIntegrationHub(companyId, { status: 'disconnected', connectedAt: null });

    await this.writeAudit({
      companyId,
      userId,
      action: 'google_calendar_oauth_disconnected',
      metadata: { revoked: true, tokensCleared: true },
    });
  }

  /** Called when Google says the grant is gone, so the UI can ask for re-consent. */
  async markReauthRequired(companyId: string, reason: string): Promise<void> {
    const row = await this.getConnectionRow(companyId);
    if (!row) return;

    await this.db
      .update(googleCalendarConnections)
      .set({
        status: 'reauth_required',
        credentialsEncrypted: null,
        reauthRequiredAt: new Date(),
        lastError: reason,
        lastErrorAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.id, row.id));

    await this.mirrorIntegrationHub(companyId, { status: 'error', connectedAt: null });
  }

  async recordError(companyId: string, message: string): Promise<void> {
    const row = await this.getConnectionRow(companyId);
    if (!row) return;

    await this.db
      .update(googleCalendarConnections)
      .set({
        status: row.status === 'connected' ? 'connected' : 'error',
        lastError: message.slice(0, 1000),
        lastErrorAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.id, row.id));
  }

  private async refreshAndPersist(
    companyId: string,
    connectionId: string,
    credentials: GoogleCalendarStoredCredentials,
  ): Promise<string> {
    try {
      const tokenPayload = await this.refreshAccessToken(credentials.refreshToken!);
      const accessToken = tokenPayload.access_token;
      if (!accessToken) {
        throw new GoogleCalendarOAuthError(
          'REFRESH_FAILED',
          'Google did not return a refreshed access token.',
        );
      }

      const next: GoogleCalendarStoredCredentials = {
        version: 1,
        accessToken,
        refreshToken: tokenPayload.refresh_token ?? credentials.refreshToken,
        expiresAt: computeExpiry(tokenPayload.expires_in),
        googleAccountEmail: credentials.googleAccountEmail,
        googleAccountId: credentials.googleAccountId,
        scope: tokenPayload.scope ?? credentials.scope,
      };

      await this.db
        .update(googleCalendarConnections)
        .set({
          credentialsEncrypted: encryptGoogleCalendarCredentials(next, this.encryptionKey!),
          status: 'connected',
          reauthRequiredAt: null,
          lastError: null,
          lastErrorAt: null,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarConnections.id, connectionId));

      return accessToken;
    } catch (error) {
      const message =
        error instanceof GoogleCalendarOAuthError || error instanceof GoogleCalendarClientError
          ? error.message
          : 'Google Calendar token refresh failed';

      // invalid_grant means the user revoked us in their Google Account.
      if (/invalid_grant/i.test(message)) {
        await this.markReauthRequired(companyId, message);
        throw new GoogleCalendarOAuthError('RECONNECT_REQUIRED', message);
      }

      await this.db
        .update(googleCalendarConnections)
        .set({ status: 'error', lastError: message, lastErrorAt: new Date(), updatedAt: new Date() })
        .where(eq(googleCalendarConnections.id, connectionId));

      throw error instanceof GoogleCalendarOAuthError
        ? error
        : new GoogleCalendarOAuthError('REFRESH_FAILED', message);
    }
  }

  private async exchangeAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
    const oauthConfig = this.getAppConfig();
    return this.requestToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: oauthConfig.redirectUri,
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
      }),
    );
  }

  private async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    const oauthConfig = this.getAppConfig();
    return this.requestToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
      }),
    );
  }

  private async requestToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
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
      throw new GoogleCalendarOAuthError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach the Google token endpoint',
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GoogleCalendarOAuthError(
        response.status === 401 || response.status === 403 ? 'AUTH_FAILED' : 'TOKEN_REQUEST_FAILED',
        `Google token request failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`,
      );
    }

    return (await response.json()) as GoogleTokenResponse;
  }

  /** Single-use: the update is conditional so a replayed callback cannot reuse it. */
  private async consumeOAuthState(state: string) {
    const stateHash = hashOAuthState(state);
    const now = new Date();

    const record = await this.db.query.integrationOauthStates.findFirst({
      where: and(
        eq(integrationOauthStates.stateHash, stateHash),
        eq(integrationOauthStates.provider, 'google_calendar'),
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

  private async markPending(companyId: string, userId: string): Promise<void> {
    const existing = await this.getConnectionRow(companyId);

    if (existing) {
      await this.db
        .update(googleCalendarConnections)
        .set({ status: 'pending', lastError: null, lastErrorAt: null, updatedAt: new Date() })
        .where(eq(googleCalendarConnections.id, existing.id));
    } else {
      await this.db.insert(googleCalendarConnections).values({
        companyId,
        status: 'pending',
        connectedByUserId: userId,
      });
    }

    await this.mirrorIntegrationHub(companyId, { status: 'pending', connectedAt: null });
  }

  /**
   * Mirror status into the Integration Hub so the Connections card is honest
   * without duplicating token storage — tokens stay on google_calendar_connections.
   */
  private async mirrorIntegrationHub(
    companyId: string,
    input: { status: 'pending' | 'connected' | 'disconnected' | 'error'; connectedAt: Date | null },
  ): Promise<void> {
    const existing = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'google_calendar'),
      ),
    });

    const config = {
      ...(existing?.config ?? {}),
      authMethod: 'oauth' as const,
      source: 'google_calendar_live_scheduling',
    };

    if (existing) {
      await this.db
        .update(integrationConnections)
        .set({
          status: input.status,
          credentialsEncrypted: null,
          config,
          connectedAt: input.connectedAt,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, existing.id));
      return;
    }

    await this.db.insert(integrationConnections).values({
      companyId,
      provider: 'google_calendar',
      status: input.status,
      credentialsEncrypted: null,
      config,
      connectedAt: input.connectedAt,
    });
  }

  private async writeAudit(input: {
    companyId: string;
    userId: string | null;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: input.companyId,
      category: 'integrations',
      action: input.action,
      entityType: 'google_calendar_connection',
      entityId: input.companyId,
      userId: input.userId,
      metadata: input.metadata,
    });
  }

  private getAppConfig(): GoogleCalendarOAuthEnvConfig {
    if (!this.oauthConfig.configured) {
      throw new GoogleCalendarOAuthError(
        'NOT_CONFIGURED',
        'Google Calendar is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API first.',
      );
    }
    return this.oauthConfig;
  }

  private ensureEncryptionKey(): void {
    if (!this.encryptionKey) {
      throw new GoogleCalendarOAuthError(
        'NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before Google Calendar OAuth.',
      );
    }
  }

  private buildFrontendRedirect(input: {
    outcome: 'connected' | 'error';
    message: string;
    returnPath?: string | null;
  }): string {
    const path =
      input.returnPath && input.returnPath.startsWith('/') && !input.returnPath.startsWith('//')
        ? input.returnPath
        : DEFAULT_RETURN_PATH;
    const url = new URL(path, this.appUrl);
    url.searchParams.set('googleCalendar', input.outcome);
    url.searchParams.set('message', input.message.slice(0, 300));
    return url.toString();
  }
}

function computeExpiry(expiresIn?: number): string {
  return new Date(Date.now() + Math.max((expiresIn ?? 3600) - 30, 60) * 1000).toISOString();
}

function sanitizeReturnPath(returnPath?: string | null): string {
  if (!returnPath) return DEFAULT_RETURN_PATH;
  if (!returnPath.startsWith('/') || returnPath.startsWith('//')) return DEFAULT_RETURN_PATH;
  if (returnPath.length > 300) return DEFAULT_RETURN_PATH;
  return returnPath;
}

function pickQueryValue(value?: string | string[]): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

export function mapGoogleCalendarOAuthError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof GoogleCalendarOAuthError) {
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

  if (error instanceof GoogleCalendarClientError) {
    if (error.code === 'RATE_LIMITED') {
      return { status: 429, code: error.code, message: error.message };
    }
    return {
      status: error.status === 401 ? 401 : error.status === 403 ? 403 : 502,
      code: error.code,
      message: error.message,
    };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected Google Calendar error' };
}
