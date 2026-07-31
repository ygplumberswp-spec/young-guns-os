import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { XeroConnectionSummary, XeroConnectionTestResult } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { integrationConnections, integrationOauthStates, securityAuditLogs } from '@titan/db';
import type { XeroOAuthEnvConfig } from '../config.js';
import {
  decryptXeroCredentials,
  encryptXeroOAuthCredentials,
  hashOAuthState,
  isXeroOAuthCredentials,
  type XeroOAuthStoredCredentials,
} from '../lib/crypto.js';
import { XeroClient, XeroError } from '../lib/xero.client.js';
import { invalidateIntegrationReadCaches } from './api-read-cache.js';

const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const REVOKE_URL = 'https://identity.xero.com/connect/revocation';
const CONNECTIONS_URL = 'https://api.xero.com/connections';
const OAUTH_SCOPES =
  'openid profile email offline_access accounting.settings accounting.contacts accounting.invoices accounting.payments accounting.banktransactions';
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

export class XeroOAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'XeroOAuthError';
  }
}

type XeroOAuthServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  appUrl: string;
  oauthConfig: XeroOAuthEnvConfig | { configured: false };
};

type XeroConnectionRecord = typeof integrationConnections.$inferSelect;

type XeroTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

type XeroConnectionInfo = {
  tenantId: string;
  tenantName: string;
  tenantType?: string;
};

export class XeroOAuthService {
  private readonly refreshInflight = new Map<string, Promise<string>>();

  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey: string | undefined,
    private readonly appUrl: string,
    private readonly oauthConfig: XeroOAuthServiceDeps['oauthConfig'],
  ) {}

  static create(deps: XeroOAuthServiceDeps): XeroOAuthService {
    return new XeroOAuthService(deps.db, deps.encryptionKey, deps.appUrl, deps.oauthConfig);
  }

  isAppConfigured(): boolean {
    return this.oauthConfig.configured;
  }

  getRedirectUri(): string | null {
    return this.oauthConfig.configured ? this.oauthConfig.redirectUri : null;
  }

  async getXeroConnection(companyId: string): Promise<XeroConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);
    const credentials = this.tryDecryptCredentials(connection.credentialsEncrypted);
    const legacyCredentials = credentials && !isXeroOAuthCredentials(credentials);
    const oauthConfigured = this.isAppConfigured();
    const reconnectRequired =
      legacyCredentials ||
      (connection.status === 'error' &&
        Boolean(connection.credentialsEncrypted) &&
        Boolean(connection.lastError));

    let status = connection.status;

    if (legacyCredentials && connection.status === 'connected') {
      status = 'error';
    }

    return {
      provider: 'xero',
      status,
      oauthConfigured,
      organisationName: connection.config.organisationName ?? null,
      organisationId: connection.config.organisationId ?? null,
      baseCurrency: connection.config.baseCurrency ?? null,
      hasCredentials: Boolean(connection.credentialsEncrypted),
      reconnectRequired,
      lastVerifiedAt: connection.config.lastVerifiedAt ?? null,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: legacyCredentials
        ? 'Reconnect required. Sign in with Xero to continue using this integration.'
        : connection.lastError,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
    };
  }

  async startOAuth(input: {
    companyId: string;
    userId: string;
    returnPath?: string | null;
  }): Promise<{ authorizationUrl: string }> {
    this.getAppConfig();
    this.ensureEncryptionKey();

    const state = randomBytes(32).toString('base64url');
    const stateHash = hashOAuthState(state);
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    const safeReturnPath = sanitizeReturnPath(input.returnPath);

    await this.db.insert(integrationOauthStates).values({
      companyId: input.companyId,
      userId: input.userId,
      provider: 'xero',
      stateHash,
      returnPath: safeReturnPath,
      expiresAt,
    });

    await this.db
      .update(integrationConnections)
      .set({
        status: 'pending',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationConnections.companyId, input.companyId),
          eq(integrationConnections.provider, 'xero'),
        ),
      );

    const oauthConfig = this.getAppConfig();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: oauthConfig.clientId,
      redirect_uri: oauthConfig.redirectUri,
      scope: OAUTH_SCOPES,
      state,
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
        message: description ?? `Xero authorization was declined (${providerError})`,
      });
    }

    const code = pickQueryValue(input.code);
    const state = pickQueryValue(input.state);

    if (!code || !state) {
      return this.buildFrontendRedirect({
        outcome: 'error',
        message: 'Xero did not return the required authorization details.',
      });
    }

    const oauthState = await this.consumeOAuthState(state);

    if (!oauthState) {
      return this.buildFrontendRedirect({
        outcome: 'error',
        message: 'This Xero sign-in link is invalid, expired, or has already been used.',
      });
    }

    try {
      const tokenPayload = await this.exchangeAuthorizationCode(code);
      const accessToken = tokenPayload.access_token;
      const refreshToken = tokenPayload.refresh_token;

      if (!accessToken || !refreshToken) {
        throw new XeroOAuthError('TOKEN_EXCHANGE_FAILED', 'Xero did not return OAuth tokens.');
      }

      const expiresAt = new Date(
        Date.now() + Math.max((tokenPayload.expires_in ?? 1800) - 30, 60) * 1000,
      ).toISOString();

      const connections = await this.fetchXeroConnections(accessToken);

      if (connections.length === 0) {
        throw new XeroOAuthError(
          'NO_ORGANISATION',
          'No Xero organisation was authorised. Choose an organisation and try again.',
        );
      }

      const selectedConnection = connections[0]!;
      const connection = await this.getOrCreateConnection(oauthState.companyId);
      const encryptedCredentials = encryptXeroOAuthCredentials(
        {
          version: 2,
          accessToken,
          refreshToken,
          expiresAt,
        },
        this.encryptionKey!,
      );

      const organisation = await this.fetchOrganisation(accessToken, selectedConnection.tenantId);
      const verifiedAt = new Date().toISOString();

      await this.db
        .update(integrationConnections)
        .set({
          status: 'connected',
          credentialsEncrypted: encryptedCredentials,
          config: {
            authMethod: 'oauth',
            tenantId: selectedConnection.tenantId,
            organisationName: organisation.name,
            organisationId: organisation.organisationId,
            baseCurrency: organisation.baseCurrency ?? undefined,
            lastVerifiedAt: verifiedAt,
          },
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));

      await this.recordAudit({
        companyId: oauthState.companyId,
        userId: oauthState.userId,
        action: 'xero_connected',
        entityId: connection.id,
        metadata: {
          organisationName: organisation.name,
          organisationId: organisation.organisationId,
        },
      });

      invalidateIntegrationReadCaches(oauthState.companyId);

      return this.buildFrontendRedirect({
        outcome: 'connected',
        returnPath: oauthState.returnPath,
        organisationName: organisation.name,
      });
    } catch (error) {
      const message = mapOAuthError(error);

      await this.db
        .update(integrationConnections)
        .set({
          status: 'error',
          lastError: message,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrationConnections.companyId, oauthState.companyId),
            eq(integrationConnections.provider, 'xero'),
          ),
        );

      invalidateIntegrationReadCaches(oauthState.companyId);

      return this.buildFrontendRedirect({
        outcome: 'error',
        message,
        returnPath: oauthState.returnPath,
      });
    }
  }

  async testConnection(companyId: string): Promise<XeroConnectionTestResult> {
    const connection = await this.requireOAuthConnection(companyId);
    const client = await this.createClient(companyId, connection);
    const organisation = await client.testConnection();
    const verifiedAt = new Date();

    await this.db
      .update(integrationConnections)
      .set({
        status: 'connected',
        config: {
          ...connection.config,
          organisationName: organisation.name,
          organisationId: organisation.organisationId,
          baseCurrency: organisation.baseCurrency ?? undefined,
          lastVerifiedAt: verifiedAt.toISOString(),
        },
        lastError: null,
        updatedAt: verifiedAt,
      })
      .where(eq(integrationConnections.id, connection.id));

    invalidateIntegrationReadCaches(companyId);

    return {
      organisationName: organisation.name,
      organisationId: organisation.organisationId,
      baseCurrency: organisation.baseCurrency,
      verifiedAt: verifiedAt.toISOString(),
    };
  }

  async disconnect(companyId: string, userId: string): Promise<XeroConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);
    const credentials = this.tryDecryptCredentials(connection.credentialsEncrypted);

    if (credentials && isXeroOAuthCredentials(credentials)) {
      await this.revokeToken(credentials.refreshToken);
    }

    await this.db
      .update(integrationConnections)
      .set({
        status: 'disconnected',
        credentialsEncrypted: null,
        config: {},
        connectedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));

    await this.recordAudit({
      companyId,
      userId,
      action: 'xero_disconnected',
      entityId: connection.id,
    });

    invalidateIntegrationReadCaches(companyId);

    return this.getXeroConnection(companyId);
  }

  async createClient(companyId: string, connection?: XeroConnectionRecord): Promise<XeroClient> {
    const activeConnection = connection ?? (await this.requireOAuthConnection(companyId));
    const tenantId = activeConnection.config.tenantId;

    if (!tenantId) {
      throw new XeroOAuthError('CONFIG_ERROR', 'Xero tenant ID is missing from the connection.');
    }

    return new XeroClient({
      tenantId,
      getAccessToken: () => this.getValidAccessToken(companyId),
    });
  }

  async getValidAccessToken(companyId: string): Promise<string> {
    const connection = await this.requireOAuthConnection(companyId);
    const credentials = decryptXeroCredentials(
      connection.credentialsEncrypted!,
      this.encryptionKey!,
    );

    if (!isXeroOAuthCredentials(credentials)) {
      throw new XeroOAuthError(
        'RECONNECT_REQUIRED',
        'Reconnect Xero using Sign in with Xero before continuing.',
      );
    }

    const expiresAtMs = Date.parse(credentials.expiresAt);

    if (Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
      return credentials.accessToken;
    }

    const inflight = this.refreshInflight.get(companyId);

    if (inflight) {
      return inflight;
    }

    const refreshPromise = this.refreshAndPersistTokens(
      companyId,
      connection.id,
      credentials,
    ).finally(() => {
      this.refreshInflight.delete(companyId);
    });

    this.refreshInflight.set(companyId, refreshPromise);
    return refreshPromise;
  }

  private async refreshAndPersistTokens(
    companyId: string,
    connectionId: string,
    credentials: XeroOAuthStoredCredentials,
  ): Promise<string> {
    try {
      const tokenPayload = await this.refreshAccessToken(credentials.refreshToken);
      const accessToken = tokenPayload.access_token;
      const refreshToken = tokenPayload.refresh_token ?? credentials.refreshToken;

      if (!accessToken) {
        throw new XeroOAuthError('REFRESH_FAILED', 'Xero did not return a refreshed access token.');
      }

      const expiresAt = new Date(
        Date.now() + Math.max((tokenPayload.expires_in ?? 1800) - 30, 60) * 1000,
      ).toISOString();

      const nextCredentials: XeroOAuthStoredCredentials = {
        version: 2,
        accessToken,
        refreshToken,
        expiresAt,
      };

      await this.db
        .update(integrationConnections)
        .set({
          credentialsEncrypted: encryptXeroOAuthCredentials(nextCredentials, this.encryptionKey!),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connectionId));

      return accessToken;
    } catch (error) {
      const message = mapOAuthError(error);

      await this.db
        .update(integrationConnections)
        .set({
          status: 'error',
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connectionId));

      invalidateIntegrationReadCaches(companyId);
      throw error;
    }
  }

  private async requireOAuthConnection(companyId: string): Promise<XeroConnectionRecord> {
    this.ensureEncryptionKey();
    const connection = await this.getOrCreateConnection(companyId);
    const credentials = this.tryDecryptCredentials(connection.credentialsEncrypted);

    if (!connection.credentialsEncrypted || !credentials || !isXeroOAuthCredentials(credentials)) {
      throw new XeroOAuthError(
        'NOT_CONNECTED',
        'Xero is not connected. Sign in with Xero to authorise your organisation.',
      );
    }

    return connection;
  }

  private async consumeOAuthState(state: string) {
    const stateHash = hashOAuthState(state);
    const now = new Date();

    const record = await this.db.query.integrationOauthStates.findFirst({
      where: and(
        eq(integrationOauthStates.stateHash, stateHash),
        isNull(integrationOauthStates.consumedAt),
        gt(integrationOauthStates.expiresAt, now),
      ),
    });

    if (!record) {
      return null;
    }

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

  private async exchangeAuthorizationCode(code: string): Promise<XeroTokenResponse> {
    const oauthConfig = this.getAppConfig();

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: oauthConfig.redirectUri,
    });

    return this.requestToken(body, oauthConfig);
  }

  private async refreshAccessToken(refreshToken: string): Promise<XeroTokenResponse> {
    const oauthConfig = this.getAppConfig();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    return this.requestToken(body, oauthConfig);
  }

  private async requestToken(
    body: URLSearchParams,
    oauthConfig: XeroOAuthEnvConfig,
  ): Promise<XeroTokenResponse> {
    const authorization = `Basic ${Buffer.from(
      `${oauthConfig.clientId}:${oauthConfig.clientSecret}`,
    ).toString('base64')}`;

    let response: Response;

    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
      });
    } catch (error) {
      throw new XeroOAuthError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Xero identity service',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new XeroOAuthError(
        'AUTH_FAILED',
        'Xero rejected the OAuth request. Reconnect to authorise again.',
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new XeroOAuthError(
        'TOKEN_REQUEST_FAILED',
        `Xero token request failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`,
      );
    }

    return (await response.json()) as XeroTokenResponse;
  }

  private async fetchXeroConnections(accessToken: string): Promise<XeroConnectionInfo[]> {
    let response: Response;

    try {
      response = await fetch(CONNECTIONS_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      throw new XeroOAuthError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Xero connections API',
      );
    }

    if (!response.ok) {
      throw new XeroOAuthError(
        'CONNECTIONS_FAILED',
        'Unable to load authorised Xero organisations.',
      );
    }

    const payload = (await response.json()) as Array<Record<string, unknown>>;

    return payload
      .map((row) => {
        const tenantId = pickString(row, ['tenantId', 'tenantID']);
        const tenantName = pickString(row, ['tenantName', 'tenant_name']);

        if (!tenantId || !tenantName) {
          return null;
        }

        const tenantType = pickString(row, ['tenantType', 'tenant_type']);

        return {
          tenantId,
          tenantName,
          ...(tenantType ? { tenantType } : {}),
        } satisfies XeroConnectionInfo;
      })
      .filter((row): row is XeroConnectionInfo => row !== null);
  }

  private async fetchOrganisation(accessToken: string, tenantId: string) {
    const url = 'https://api.xero.com/api.xro/2.0/Organisation';
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'xero-tenant-id': tenantId,
        },
      });
    } catch (error) {
      throw new XeroOAuthError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Xero organisation API',
      );
    }

    if (!response.ok) {
      throw new XeroOAuthError(
        'ORGANISATION_LOOKUP_FAILED',
        'Unable to verify the Xero organisation.',
      );
    }

    const payload = (await response.json()) as { Organisations?: Array<Record<string, unknown>> };
    const organisation = payload.Organisations?.[0];
    const organisationId = organisation ? pickString(organisation, ['OrganisationID']) : null;
    const name = organisation ? pickString(organisation, ['Name']) : null;

    if (!organisationId || !name) {
      throw new XeroOAuthError(
        'ORGANISATION_LOOKUP_FAILED',
        'Xero did not return organisation details.',
      );
    }

    return {
      organisationId,
      name,
      baseCurrency: organisation ? pickString(organisation, ['BaseCurrency']) : null,
    };
  }

  private async revokeToken(token: string): Promise<void> {
    if (!this.oauthConfig.configured) {
      return;
    }

    const oauthConfig = this.oauthConfig;
    const body = new URLSearchParams({ token });

    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${oauthConfig.clientId}:${oauthConfig.clientSecret}`,
          ).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch {
      // Revocation is best-effort; local credentials are always removed.
    }
  }

  private async getOrCreateConnection(companyId: string): Promise<XeroConnectionRecord> {
    const existing = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'xero'),
      ),
    });

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(integrationConnections)
      .values({
        companyId,
        provider: 'xero',
        status: 'disconnected',
      })
      .returning();

    if (!created) {
      throw new XeroOAuthError('CREATE_FAILED', 'Unable to initialize Xero connection');
    }

    return created;
  }

  private tryDecryptCredentials(payload: string | null) {
    if (!payload || !this.encryptionKey) {
      return null;
    }

    try {
      return decryptXeroCredentials(payload, this.encryptionKey);
    } catch {
      return null;
    }
  }

  private ensureEncryptionKey() {
    if (!this.encryptionKey) {
      throw new XeroOAuthError(
        'ENCRYPTION_NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before storing Xero credentials.',
      );
    }
  }

  private getAppConfig(): XeroOAuthEnvConfig {
    if (!this.oauthConfig.configured) {
      throw new XeroOAuthError(
        'OAUTH_NOT_CONFIGURED',
        'Xero OAuth is not configured on the server. Contact your platform administrator.',
      );
    }

    return this.oauthConfig;
  }

  private buildFrontendRedirect(input: {
    outcome: 'connected' | 'error';
    message?: string;
    organisationName?: string;
    returnPath?: string | null;
  }): string {
    const basePath = sanitizeReturnPath(input.returnPath) ?? '/integrations/xero';
    const url = new URL(basePath, this.appUrl);
    url.searchParams.set('xero', input.outcome);

    if (input.message) {
      url.searchParams.set('message', input.message);
    }

    if (input.organisationName) {
      url.searchParams.set('organisation', input.organisationName);
    }

    return url.toString();
  }

  private async recordAudit(input: {
    companyId: string;
    userId: string;
    action: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.db.insert(securityAuditLogs).values({
      companyId: input.companyId,
      userId: input.userId,
      category: 'integrations',
      action: input.action,
      entityType: 'integration_connection',
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    });
  }
}

function sanitizeReturnPath(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }

  return trimmed;
}

function pickQueryValue(value?: string | string[]): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? null;
  }

  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function mapOAuthError(error: unknown): string {
  if (error instanceof XeroOAuthError || error instanceof XeroError) {
    return error.message;
  }

  return error instanceof Error ? error.message : 'Xero OAuth request failed';
}

export function createDeterministicOAuthState(seed: string): string {
  return createHash('sha256').update(seed).digest('base64url');
}
