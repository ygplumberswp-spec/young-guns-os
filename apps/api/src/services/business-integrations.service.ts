import { and, eq } from 'drizzle-orm';
import type {
  EmailConnectionSummary,
  EmailSyncResult,
  IntegrationProvider,
  SaveEmailConnectionRequest,
  SaveYocoConnectionRequest,
  XeroConnectionSummary,
  XeroSyncResult,
  YocoConnectionSummary,
  YocoSyncResult,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { integrationConnections } from '@titan/db';
import { EmailSmtpClient, EmailSmtpError } from '../lib/email-smtp.client.js';
import {
  decryptEmailCredentials,
  decryptYocoCredentials,
  encryptEmailCredentials,
  encryptYocoCredentials,
} from '../lib/crypto.js';
import { XeroError } from '../lib/xero.client.js';
import { YocoClient, YocoError } from '../lib/yoco.client.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { XeroOAuthService } from './xero-oauth.service.js';

export class BusinessIntegrationsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BusinessIntegrationsError';
  }
}

type BusinessIntegrationsServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  hubService?: IntegrationHubService;
  xeroOAuthService?: XeroOAuthService;
};

export class BusinessIntegrationsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
    private readonly hubService?: IntegrationHubService,
    private readonly xeroOAuthService?: XeroOAuthService,
  ) {}

  static create(deps: BusinessIntegrationsServiceDeps): BusinessIntegrationsService {
    return new BusinessIntegrationsService(
      deps.db,
      deps.encryptionKey,
      deps.hubService,
      deps.xeroOAuthService,
    );
  }

  async getXeroConnection(companyId: string): Promise<XeroConnectionSummary> {
    if (this.xeroOAuthService) {
      return this.xeroOAuthService.getXeroConnection(companyId);
    }

    const connection = await this.getOrCreateConnection(companyId, 'xero');

    return {
      provider: 'xero',
      status: connection.status,
      oauthConfigured: false,
      organisationName: connection.config.organisationName ?? null,
      organisationId: connection.config.organisationId ?? null,
      baseCurrency: connection.config.baseCurrency ?? null,
      hasCredentials: Boolean(connection.credentialsEncrypted),
      reconnectRequired: Boolean(connection.credentialsEncrypted),
      lastVerifiedAt: connection.config.lastVerifiedAt ?? null,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: connection.lastError,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
    };
  }

  async saveXeroConnection(_companyId: string): Promise<XeroConnectionSummary> {
    throw new BusinessIntegrationsError(
      'DEPRECATED',
      'Manual Xero credentials are no longer supported. Sign in with Xero instead.',
    );
  }

  async disconnectXero(companyId: string, userId: string): Promise<XeroConnectionSummary> {
    if (this.xeroOAuthService) {
      return this.xeroOAuthService.disconnect(companyId, userId);
    }

    await this.disconnectProvider(companyId, 'xero');
    return this.getXeroConnection(companyId);
  }

  async syncXero(companyId: string): Promise<XeroSyncResult> {
    const connection = await this.requireConnectedConnection(companyId, 'xero', 'Xero');
    const syncJobId = await this.hubService?.startSyncJob({
      companyId,
      provider: 'xero',
      integrationConnectionId: connection.id,
      jobType: 'manual',
      syncScope: 'organisation',
    });

    const tenantId = connection.config.tenantId;

    if (!tenantId) {
      throw new BusinessIntegrationsError(
        'CONFIG_ERROR',
        'Xero tenant ID is missing from connection config',
      );
    }

    if (!this.xeroOAuthService) {
      throw new BusinessIntegrationsError(
        'NOT_CONNECTED',
        'Xero OAuth is not configured. Sign in with Xero before verifying the connection.',
      );
    }

    try {
      const client = await this.xeroOAuthService.createClient(companyId, connection);
      const organisation = await client.fetchOrganisation();
      const syncedAt = new Date();

      await this.db
        .update(integrationConnections)
        .set({
          config: {
            ...connection.config,
            tenantId,
            organisationName: organisation.name,
            organisationId: organisation.organisationId,
            baseCurrency: organisation.baseCurrency ?? undefined,
            lastVerifiedAt: syncedAt.toISOString(),
          },
          lastSyncAt: syncedAt,
          lastError: null,
          updatedAt: syncedAt,
        })
        .where(eq(integrationConnections.id, connection.id));

      const result: XeroSyncResult = {
        organisationName: organisation.name,
        organisationId: organisation.organisationId,
        baseCurrency: organisation.baseCurrency,
        syncedAt: syncedAt.toISOString(),
        syncJobId,
      };

      if (syncJobId) {
        await this.hubService?.completeSyncJob(syncJobId, {
          status: 'completed',
          resultSummary: { ...result },
        });
      }

      return result;
    } catch (error) {
      const message = mapXeroError(error);

      await this.db
        .update(integrationConnections)
        .set({
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));

      if (syncJobId) {
        await this.hubService?.completeSyncJob(syncJobId, {
          status: 'failed',
          errorMessage: message,
        });
      }

      throw new BusinessIntegrationsError('SYNC_FAILED', message);
    }
  }

  async getEmailConnection(companyId: string): Promise<EmailConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId, 'email');
    const credentials = this.tryDecryptEmailCredentials(connection.credentialsEncrypted);

    return {
      provider: 'email',
      status: connection.status,
      host: connection.config.host ?? null,
      port: connection.config.port ?? null,
      secure: connection.config.secure ?? false,
      usernameHint: credentials?.username ? maskSecret(credentials.username) : null,
      fromEmail: connection.config.fromEmail ?? null,
      fromName: connection.config.fromName ?? null,
      hasCredentials: Boolean(connection.credentialsEncrypted),
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: connection.lastError,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
    };
  }

  async saveEmailConnection(
    companyId: string,
    input: SaveEmailConnectionRequest,
  ): Promise<EmailConnectionSummary> {
    this.ensureEncryptionKey();

    const host = input.host.trim();
    const username = input.username.trim();
    const password = input.password;
    const fromEmail = input.fromEmail.trim().toLowerCase();
    const fromName = input.fromName?.trim() || null;
    const port = input.port;
    const secure = input.secure;

    if (!host || !username || !password || !fromEmail) {
      throw new BusinessIntegrationsError(
        'VALIDATION_ERROR',
        'SMTP host, username, password, and from email are required',
      );
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new BusinessIntegrationsError(
        'VALIDATION_ERROR',
        'SMTP port must be between 1 and 65535',
      );
    }

    const connection = await this.getOrCreateConnection(companyId, 'email');
    const client = new EmailSmtpClient({ host, port, secure, username, password });

    await this.db
      .update(integrationConnections)
      .set({
        status: 'pending',
        config: { host, port, secure, fromEmail, fromName: fromName ?? undefined },
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));

    try {
      await client.testConnection();

      await this.db
        .update(integrationConnections)
        .set({
          status: 'connected',
          credentialsEncrypted: encryptEmailCredentials(
            { username, password },
            this.encryptionKey!,
          ),
          config: { host, port, secure, fromEmail, fromName: fromName ?? undefined },
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));
    } catch (error) {
      const message = mapEmailError(error);

      await this.db
        .update(integrationConnections)
        .set({
          status: 'error',
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));

      throw new BusinessIntegrationsError('CONNECTION_FAILED', message);
    }

    return this.getEmailConnection(companyId);
  }

  async disconnectEmail(companyId: string): Promise<EmailConnectionSummary> {
    await this.disconnectProvider(companyId, 'email');
    return this.getEmailConnection(companyId);
  }

  async syncEmail(companyId: string): Promise<EmailSyncResult> {
    const connection = await this.requireConnectedConnection(companyId, 'email', 'Email');
    const syncJobId = await this.hubService?.startSyncJob({
      companyId,
      provider: 'email',
      integrationConnectionId: connection.id,
      jobType: 'manual',
    });

    const credentials = decryptEmailCredentials(
      connection.credentialsEncrypted!,
      this.encryptionKey!,
    );
    const host = connection.config.host;
    const port = connection.config.port;
    const secure = connection.config.secure ?? false;
    const fromEmail = connection.config.fromEmail;

    if (!host || !port || !fromEmail) {
      throw new BusinessIntegrationsError('CONFIG_ERROR', 'Email connection config is incomplete');
    }

    try {
      const client = new EmailSmtpClient({
        host,
        port,
        secure,
        username: credentials.username,
        password: credentials.password,
      });

      await client.testConnection();
      const syncedAt = new Date();

      await this.db
        .update(integrationConnections)
        .set({
          lastSyncAt: syncedAt,
          lastError: null,
          updatedAt: syncedAt,
        })
        .where(eq(integrationConnections.id, connection.id));

      const result: EmailSyncResult = {
        verified: true,
        fromEmail,
        host,
        syncedAt: syncedAt.toISOString(),
        syncJobId,
      };

      if (syncJobId) {
        await this.hubService?.completeSyncJob(syncJobId, {
          status: 'completed',
          resultSummary: { ...result },
        });
      }

      return result;
    } catch (error) {
      const message = mapEmailError(error);

      await this.db
        .update(integrationConnections)
        .set({
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));

      if (syncJobId) {
        await this.hubService?.completeSyncJob(syncJobId, {
          status: 'failed',
          errorMessage: message,
        });
      }

      throw new BusinessIntegrationsError('SYNC_FAILED', message);
    }
  }

  async getYocoConnection(companyId: string): Promise<YocoConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId, 'yoco');
    const credentials = this.tryDecryptYocoCredentials(connection.credentialsEncrypted);

    return {
      provider: 'yoco',
      status: connection.status,
      environment: connection.config.environment ?? 'test',
      secretKeyHint: credentials?.secretKey ? maskSecret(credentials.secretKey) : null,
      businessName: connection.config.businessName ?? null,
      businessId: connection.config.businessId ?? null,
      hasCredentials: Boolean(connection.credentialsEncrypted),
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: connection.lastError,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
    };
  }

  async saveYocoConnection(
    companyId: string,
    input: SaveYocoConnectionRequest,
  ): Promise<YocoConnectionSummary> {
    this.ensureEncryptionKey();

    const secretKey = input.secretKey.trim();
    const environment = input.environment ?? 'test';

    if (!secretKey) {
      throw new BusinessIntegrationsError('VALIDATION_ERROR', 'Yoco secret key is required');
    }

    const connection = await this.getOrCreateConnection(companyId, 'yoco');
    const client = new YocoClient({ secretKey, environment });

    await this.db
      .update(integrationConnections)
      .set({
        status: 'pending',
        config: { environment },
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));

    try {
      const business = await client.testConnection();

      await this.db
        .update(integrationConnections)
        .set({
          status: 'connected',
          credentialsEncrypted: encryptYocoCredentials({ secretKey }, this.encryptionKey!),
          config: {
            environment,
            businessName: business.name,
            businessId: business.businessId,
          },
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));
    } catch (error) {
      const message = mapYocoError(error);

      await this.db
        .update(integrationConnections)
        .set({
          status: 'error',
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));

      throw new BusinessIntegrationsError('CONNECTION_FAILED', message);
    }

    return this.getYocoConnection(companyId);
  }

  async disconnectYoco(companyId: string): Promise<YocoConnectionSummary> {
    await this.disconnectProvider(companyId, 'yoco');
    return this.getYocoConnection(companyId);
  }

  async syncYoco(companyId: string): Promise<YocoSyncResult> {
    const connection = await this.requireConnectedConnection(companyId, 'yoco', 'Yoco');
    const syncJobId = await this.hubService?.startSyncJob({
      companyId,
      provider: 'yoco',
      integrationConnectionId: connection.id,
      jobType: 'manual',
    });

    const credentials = decryptYocoCredentials(
      connection.credentialsEncrypted!,
      this.encryptionKey!,
    );
    const environment = connection.config.environment ?? 'test';

    try {
      const client = new YocoClient({ secretKey: credentials.secretKey, environment });
      const business = await client.fetchBusiness();
      const syncedAt = new Date();

      await this.db
        .update(integrationConnections)
        .set({
          config: {
            ...connection.config,
            environment,
            businessName: business.name,
            businessId: business.businessId,
          },
          lastSyncAt: syncedAt,
          lastError: null,
          updatedAt: syncedAt,
        })
        .where(eq(integrationConnections.id, connection.id));

      const result: YocoSyncResult = {
        businessName: business.name,
        businessId: business.businessId,
        environment,
        syncedAt: syncedAt.toISOString(),
        syncJobId,
      };

      if (syncJobId) {
        await this.hubService?.completeSyncJob(syncJobId, {
          status: 'completed',
          resultSummary: { ...result },
        });
      }

      return result;
    } catch (error) {
      const message = mapYocoError(error);

      await this.db
        .update(integrationConnections)
        .set({
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));

      if (syncJobId) {
        await this.hubService?.completeSyncJob(syncJobId, {
          status: 'failed',
          errorMessage: message,
        });
      }

      throw new BusinessIntegrationsError('SYNC_FAILED', message);
    }
  }

  private async getOrCreateConnection(companyId: string, provider: IntegrationProvider) {
    const existing = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, provider),
      ),
    });

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(integrationConnections)
      .values({
        companyId,
        provider,
        status: 'disconnected',
      })
      .returning();

    if (!created) {
      throw new BusinessIntegrationsError(
        'CREATE_FAILED',
        `Unable to initialize ${provider} connection`,
      );
    }

    return created;
  }

  private async requireConnectedConnection(
    companyId: string,
    provider: IntegrationProvider,
    label: string,
  ) {
    const connection = await this.getOrCreateConnection(companyId, provider);

    if (connection.status !== 'connected' || !connection.credentialsEncrypted) {
      throw new BusinessIntegrationsError(
        'NOT_CONNECTED',
        `${label} is not connected. Save valid credentials before syncing.`,
      );
    }

    this.ensureEncryptionKey();
    return connection;
  }

  private async disconnectProvider(companyId: string, provider: IntegrationProvider) {
    const connection = await this.getOrCreateConnection(companyId, provider);

    await this.db
      .update(integrationConnections)
      .set({
        status: 'disconnected',
        credentialsEncrypted: null,
        config: {},
        connectedAt: null,
        lastSyncAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));
  }

  private ensureEncryptionKey() {
    if (!this.encryptionKey) {
      throw new BusinessIntegrationsError(
        'ENCRYPTION_NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before storing integration credentials',
      );
    }
  }

  private tryDecryptEmailCredentials(payload: string | null) {
    if (!payload || !this.encryptionKey) {
      return null;
    }

    try {
      return decryptEmailCredentials(payload, this.encryptionKey);
    } catch {
      return null;
    }
  }

  private tryDecryptYocoCredentials(payload: string | null) {
    if (!payload || !this.encryptionKey) {
      return null;
    }

    try {
      return decryptYocoCredentials(payload, this.encryptionKey);
    } catch {
      return null;
    }
  }
}

function maskSecret(value: string): string {
  if (value.length <= 4) {
    return `${value[0] ?? '*'}***`;
  }

  return `${value.slice(0, 4)}${'*'.repeat(Math.max(value.length - 4, 4))}`;
}

function mapXeroError(error: unknown): string {
  if (error instanceof XeroError || error instanceof BusinessIntegrationsError) {
    return error.message;
  }

  return error instanceof Error ? error.message : 'Xero request failed';
}

function mapEmailError(error: unknown): string {
  if (error instanceof EmailSmtpError || error instanceof BusinessIntegrationsError) {
    return error.message;
  }

  return error instanceof Error ? error.message : 'SMTP verification failed';
}

function mapYocoError(error: unknown): string {
  if (error instanceof YocoError || error instanceof BusinessIntegrationsError) {
    return error.message;
  }

  return error instanceof Error ? error.message : 'Yoco request failed';
}
