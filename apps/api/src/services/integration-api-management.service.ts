import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import type {
  CreateDeveloperApiKeyRequest,
  CreateOutboundWebhookDeliveryRequest,
  DeveloperApiKeyDetail,
  DeveloperApiKeySummary,
  IntegrationApiManagementAuraContext,
  IntegrationApiUsageSummary,
  IntegrationAuthType,
  IntegrationCredentialMetadataSummary,
  IntegrationHealthStatus,
  IntegrationHealthSummary,
  IntegrationProvider,
  IntegrationRecommendationSummary,
  IntegrationRegistryEntry,
  IntegrationRequestLogSummary,
  IntegrationSyncManagerStatus,
  IntegrationValidationResult,
  IntegrationWebhookDeliverySummary,
  UpdateIntegrationRegistrySettingsRequest,
} from '@titan/shared';
import { getIntegrationProviderRegistryEntry, INTEGRATION_PROVIDER_REGISTRY } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  developerApiKeys,
  integrationApiUsage,
  integrationConnections,
  integrationCredentialMetadata,
  integrationHealthSnapshots,
  integrationRecommendations,
  integrationRegistrySettings,
  integrationRequestLogs,
  integrationSyncJobs,
  integrationWebhookDeliveries,
  integrationWebhookEndpoints,
  integrationWebhookEvents,
  whatsappConnections,
} from '@titan/db';
import { generateDeveloperApiKey, hashApiKey } from '../lib/crypto.js';
import type { BusinessIntegrationsService } from './business-integrations.service.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { IntegrationsService } from './integrations.service.js';
import type { XeroSyncService } from './xero-sync.service.js';

export class IntegrationApiManagementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationApiManagementError';
  }
}

type TenantScope = { companyId: string; userId: string };

type IntegrationApiManagementDeps = {
  db: DatabaseClient;
  hubService: IntegrationHubService;
  integrationsService: IntegrationsService;
  businessIntegrationsService: BusinessIntegrationsService;
  xeroSyncService: XeroSyncService;
};

const PROVIDER_AUTH_TYPES: Record<string, IntegrationAuthType> = {
  cartrack: 'api_key',
  xero: 'oauth',
  email: 'basic_auth',
  yoco: 'api_key',
  whatsapp: 'bearer_token',
  google_calendar: 'oauth',
  google_maps: 'api_key',
  microsoft_365: 'oauth',
  resend: 'api_key',
  custom: 'api_key',
};

const LIVE_PROVIDERS = new Set(['cartrack', 'xero', 'email', 'yoco', 'whatsapp', 'google_maps']);

export class IntegrationApiManagementService {
  constructor(private readonly deps: IntegrationApiManagementDeps) {}

  async listRegistry(companyId: string): Promise<IntegrationRegistryEntry[]> {
    await this.syncCredentialMetadata(companyId);

    const [settings, providerStatuses] = await Promise.all([
      this.deps.db.query.integrationRegistrySettings.findMany({
        where: eq(integrationRegistrySettings.companyId, companyId),
      }),
      this.deps.hubService.listProviderStatuses(companyId),
    ]);

    const settingsByProvider = new Map(settings.map((row) => [row.provider, row]));
    const statusByProvider = new Map(providerStatuses.map((row) => [row.provider, row]));

    return INTEGRATION_PROVIDER_REGISTRY.map((entry) => {
      const setting = settingsByProvider.get(entry.provider);
      const status = statusByProvider.get(entry.provider as IntegrationProvider);

      return {
        provider: entry.provider,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        availability: entry.availability,
        authType: setting?.authType ?? PROVIDER_AUTH_TYPES[entry.provider] ?? null,
        version: setting?.version ?? null,
        enabled: setting?.enabled ?? status?.isConfigured ?? false,
        healthStatus:
          setting?.healthStatus ?? this.inferHealthFromConnection(status?.connectionStatus),
        connectionId: status?.connectionId ?? null,
        connectionStatus: status?.connectionStatus ?? 'disconnected',
        isConfigured: status?.isConfigured ?? false,
        lastSyncAt: setting?.lastSyncAt?.toISOString() ?? status?.lastSyncAt ?? null,
        nextSyncAt: setting?.nextSyncAt?.toISOString() ?? null,
        lastHealthCheckAt: setting?.lastHealthCheckAt?.toISOString() ?? null,
        lastError: status?.lastError ?? null,
        supportsSync: entry.supportsSync,
        supportsWebhooks: entry.supportsWebhooks,
        settingsPath: entry.settingsPath,
      };
    });
  }

  async updateRegistrySettings(
    companyId: string,
    provider: string,
    input: UpdateIntegrationRegistrySettingsRequest,
  ): Promise<IntegrationRegistryEntry> {
    this.assertKnownProvider(provider);

    const existing = await this.deps.db.query.integrationRegistrySettings.findFirst({
      where: and(
        eq(integrationRegistrySettings.companyId, companyId),
        eq(integrationRegistrySettings.provider, provider as IntegrationProvider),
      ),
    });

    const values = {
      companyId,
      provider: provider as IntegrationProvider,
      enabled: input.enabled ?? existing?.enabled ?? false,
      version: input.version !== undefined ? input.version : (existing?.version ?? null),
      authType: existing?.authType ?? PROVIDER_AUTH_TYPES[provider] ?? null,
      nextSyncAt:
        input.nextSyncAt !== undefined
          ? input.nextSyncAt
            ? new Date(input.nextSyncAt)
            : null
          : (existing?.nextSyncAt ?? null),
      updatedAt: new Date(),
    };

    if (existing) {
      await this.deps.db
        .update(integrationRegistrySettings)
        .set(values)
        .where(eq(integrationRegistrySettings.id, existing.id));
    } else {
      await this.deps.db.insert(integrationRegistrySettings).values(values);
    }

    const registry = await this.listRegistry(companyId);
    const entry = registry.find((row) => row.provider === provider);

    if (!entry) {
      throw new IntegrationApiManagementError('NOT_FOUND', 'Integration registry entry not found');
    }

    return entry;
  }

  async listCredentialMetadata(companyId: string): Promise<IntegrationCredentialMetadataSummary[]> {
    await this.syncCredentialMetadata(companyId);

    const rows = await this.deps.db.query.integrationCredentialMetadata.findMany({
      where: eq(integrationCredentialMetadata.companyId, companyId),
      orderBy: [desc(integrationCredentialMetadata.updatedAt)],
    });

    return rows.map(toCredentialMetadataSummary);
  }

  async markCredentialRotationRequired(
    companyId: string,
    metadataId: string,
  ): Promise<IntegrationCredentialMetadataSummary> {
    const row = await this.deps.db.query.integrationCredentialMetadata.findFirst({
      where: and(
        eq(integrationCredentialMetadata.companyId, companyId),
        eq(integrationCredentialMetadata.id, metadataId),
      ),
    });

    if (!row) {
      throw new IntegrationApiManagementError('NOT_FOUND', 'Credential metadata not found');
    }

    const [updated] = await this.deps.db
      .update(integrationCredentialMetadata)
      .set({
        rotationRequired: true,
        updatedAt: new Date(),
      })
      .where(eq(integrationCredentialMetadata.id, metadataId))
      .returning();

    return toCredentialMetadataSummary(updated);
  }

  async listApiUsage(companyId: string, limit = 50): Promise<IntegrationApiUsageSummary[]> {
    await this.refreshApiUsageFromSyncJobs(companyId);

    const rows = await this.deps.db.query.integrationApiUsage.findMany({
      where: eq(integrationApiUsage.companyId, companyId),
      orderBy: [desc(integrationApiUsage.periodStart)],
      limit,
    });

    return rows.map(toApiUsageSummary);
  }

  async getApiHealth(companyId: string): Promise<IntegrationHealthSummary[]> {
    await this.captureHealthSnapshots(companyId);

    const rows = await this.deps.db.query.integrationHealthSnapshots.findMany({
      where: eq(integrationHealthSnapshots.companyId, companyId),
      orderBy: [desc(integrationHealthSnapshots.checkedAt)],
      limit: 50,
    });

    const latestByProvider = new Map<string, IntegrationHealthSummary>();
    for (const row of rows) {
      if (!latestByProvider.has(row.provider)) {
        latestByProvider.set(row.provider, toHealthSummary(row));
      }
    }

    return [...latestByProvider.values()];
  }

  async generateHealthRecommendations(
    companyId: string,
  ): Promise<IntegrationRecommendationSummary[]> {
    const registry = await this.listRegistry(companyId);
    const credentials = await this.listCredentialMetadata(companyId);
    const deliveries = await this.listWebhookDeliveries(companyId, 20);
    const recommendations: Array<{
      provider: IntegrationProvider | null;
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    for (const entry of registry) {
      if (entry.connectionStatus === 'error' && entry.isConfigured) {
        recommendations.push({
          provider: entry.provider as IntegrationProvider,
          title: `${entry.name} connection error`,
          description: entry.lastError
            ? `Connection is in error state: ${entry.lastError}`
            : 'Connection is in error state. Review credentials and retry sync.',
          priority: 'high',
          context: { connectionStatus: entry.connectionStatus },
        });
      }

      if (entry.healthStatus === 'unhealthy' && entry.isConfigured) {
        recommendations.push({
          provider: entry.provider as IntegrationProvider,
          title: `${entry.name} health degraded`,
          description:
            'Integration health check reports unhealthy status. Validate credentials and sync history.',
          priority: 'medium',
          context: { healthStatus: entry.healthStatus },
        });
      }
    }

    for (const credential of credentials) {
      if (credential.rotationRequired) {
        recommendations.push({
          provider: credential.provider as IntegrationProvider,
          title: 'Credential rotation required',
          description: `Credentials for ${credential.provider} are flagged for rotation.`,
          priority: 'high',
          context: { credentialMetadataId: credential.id },
        });
      }

      if (
        credential.expiresAt &&
        new Date(credential.expiresAt).getTime() < Date.now() + 7 * 86400000
      ) {
        recommendations.push({
          provider: credential.provider as IntegrationProvider,
          title: 'Credential expiry approaching',
          description: `Credentials for ${credential.provider} expire on ${credential.expiresAt}.`,
          priority: 'medium',
          context: { expiresAt: credential.expiresAt },
        });
      }
    }

    for (const delivery of deliveries.filter((row) => row.status === 'dead_letter')) {
      recommendations.push({
        provider: null,
        title: 'Webhook delivery in dead-letter queue',
        description: `Event ${delivery.eventType} failed after ${delivery.attempts} attempts.`,
        priority: 'high',
        context: { deliveryId: delivery.id },
      });
    }

    if (recommendations.length === 0) {
      return [];
    }

    const inserted = await this.deps.db
      .insert(integrationRecommendations)
      .values(
        recommendations.map((row) => ({
          companyId,
          provider: row.provider,
          title: row.title,
          description: row.description,
          priority: row.priority,
          context: row.context,
        })),
      )
      .returning();

    return inserted.map(toRecommendationSummary);
  }

  async listRecommendations(companyId: string): Promise<IntegrationRecommendationSummary[]> {
    const rows = await this.deps.db.query.integrationRecommendations.findMany({
      where: eq(integrationRecommendations.companyId, companyId),
      orderBy: [desc(integrationRecommendations.createdAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async listIntegrationLogs(
    companyId: string,
    limit = 100,
  ): Promise<IntegrationRequestLogSummary[]> {
    await this.refreshLogsFromSyncJobs(companyId);

    const rows = await this.deps.db.query.integrationRequestLogs.findMany({
      where: eq(integrationRequestLogs.companyId, companyId),
      orderBy: [desc(integrationRequestLogs.createdAt)],
      limit,
    });

    return rows.map(toRequestLogSummary);
  }

  async listWebhookDeliveries(
    companyId: string,
    limit = 50,
  ): Promise<IntegrationWebhookDeliverySummary[]> {
    await this.refreshWebhookDeliveriesFromEvents(companyId);

    const rows = await this.deps.db.query.integrationWebhookDeliveries.findMany({
      where: eq(integrationWebhookDeliveries.companyId, companyId),
      orderBy: [desc(integrationWebhookDeliveries.createdAt)],
      limit,
    });

    return rows.map(toWebhookDeliverySummary);
  }

  async createOutboundWebhookDelivery(
    companyId: string,
    input: CreateOutboundWebhookDeliveryRequest,
  ): Promise<IntegrationWebhookDeliverySummary> {
    const [delivery] = await this.deps.db
      .insert(integrationWebhookDeliveries)
      .values({
        companyId,
        webhookEndpointId: input.webhookEndpointId ?? null,
        direction: 'outbound',
        status: 'pending',
        eventType: input.eventType,
        payloadSummary: maskSensitiveText(input.payloadSummary ?? null),
        scheduledFor: new Date(),
      })
      .returning();

    return toWebhookDeliverySummary(delivery);
  }

  async replayWebhookDelivery(
    companyId: string,
    deliveryId: string,
  ): Promise<IntegrationWebhookDeliverySummary> {
    const delivery = await this.deps.db.query.integrationWebhookDeliveries.findFirst({
      where: and(
        eq(integrationWebhookDeliveries.companyId, companyId),
        eq(integrationWebhookDeliveries.id, deliveryId),
      ),
    });

    if (!delivery) {
      throw new IntegrationApiManagementError('NOT_FOUND', 'Webhook delivery not found');
    }

    if (!['failed', 'dead_letter'].includes(delivery.status)) {
      throw new IntegrationApiManagementError(
        'VALIDATION_ERROR',
        'Only failed or dead-letter deliveries can be replayed',
      );
    }

    const [updated] = await this.deps.db
      .update(integrationWebhookDeliveries)
      .set({
        status: 'retry',
        attempts: delivery.attempts + 1,
        scheduledFor: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationWebhookDeliveries.id, deliveryId))
      .returning();

    return toWebhookDeliverySummary(updated);
  }

  async getSyncManagerStatus(companyId: string): Promise<IntegrationSyncManagerStatus> {
    const [syncJobs, registry] = await Promise.all([
      this.deps.hubService.listSyncJobs(companyId, 25),
      this.listRegistry(companyId),
    ]);

    return {
      syncJobs: syncJobs.map((job) => ({
        id: job.id,
        provider: job.provider,
        status: job.status,
        jobType: job.jobType,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        errorMessage: job.errorMessage,
      })),
      scheduledSyncs: registry
        .filter((entry) => entry.supportsSync)
        .map((entry) => ({
          provider: entry.provider,
          nextSyncAt: entry.nextSyncAt,
          enabled: entry.enabled,
        })),
    };
  }

  async retrySyncJob(
    companyId: string,
    syncJobId: string,
  ): Promise<{ provider: string; retried: boolean }> {
    const job = await this.deps.hubService.getSyncJob(companyId, syncJobId);

    if (!job) {
      throw new IntegrationApiManagementError('NOT_FOUND', 'Sync job not found');
    }

    if (job.status !== 'failed') {
      throw new IntegrationApiManagementError(
        'VALIDATION_ERROR',
        'Only failed sync jobs can be retried',
      );
    }

    switch (job.provider) {
      case 'xero':
        await this.deps.xeroSyncService.retrySyncJob(companyId, syncJobId);
        break;
      case 'cartrack':
        await this.deps.integrationsService.syncCartrack(companyId);
        break;
      case 'email':
        await this.deps.businessIntegrationsService.syncEmail(companyId);
        break;
      case 'yoco':
        await this.deps.businessIntegrationsService.syncYoco(companyId);
        break;
      default:
        throw new IntegrationApiManagementError(
          'UNSUPPORTED',
          `Manual retry is not supported for provider ${job.provider}`,
        );
    }

    return { provider: job.provider, retried: true };
  }

  async validateIntegration(
    companyId: string,
    provider: string,
  ): Promise<IntegrationValidationResult> {
    this.assertKnownProvider(provider);

    const checks: IntegrationValidationResult['checks'] = [];
    const registryEntry = getIntegrationProviderRegistryEntry(provider as IntegrationProvider);

    if (registryEntry?.availability === 'planned') {
      checks.push({
        key: 'availability',
        passed: false,
        message: `${registryEntry.name} is planned and not yet available for connection.`,
      });

      return { provider, valid: false, checks };
    }

    if (provider === 'whatsapp') {
      const connection = await this.deps.db.query.whatsappConnections.findFirst({
        where: eq(whatsappConnections.companyId, companyId),
      });

      checks.push({
        key: 'connection_exists',
        passed: Boolean(connection),
        message: connection
          ? 'WhatsApp connection record exists'
          : 'No WhatsApp connection configured',
      });

      checks.push({
        key: 'credentials_present',
        passed: Boolean(connection?.credentialsEncrypted),
        message: connection?.credentialsEncrypted
          ? 'Encrypted credentials stored'
          : 'Missing encrypted credentials',
      });

      checks.push({
        key: 'connection_status',
        passed: connection?.status === 'connected',
        message: `Connection status: ${connection?.status ?? 'disconnected'}`,
      });
    } else {
      const connection = await this.deps.db.query.integrationConnections.findFirst({
        where: and(
          eq(integrationConnections.companyId, companyId),
          eq(integrationConnections.provider, provider as IntegrationProvider),
        ),
      });

      checks.push({
        key: 'connection_exists',
        passed: Boolean(connection),
        message: connection ? 'Connection record exists' : 'No connection configured',
      });

      checks.push({
        key: 'credentials_present',
        passed: Boolean(connection?.credentialsEncrypted),
        message: connection?.credentialsEncrypted
          ? 'Encrypted credentials stored'
          : 'Missing encrypted credentials',
      });

      checks.push({
        key: 'connection_status',
        passed: connection?.status === 'connected',
        message: `Connection status: ${connection?.status ?? 'disconnected'}`,
      });

      if (connection?.lastError) {
        checks.push({
          key: 'last_error',
          passed: false,
          message: `Last error: ${connection.lastError}`,
        });
      }
    }

    const metadata = await this.deps.db.query.integrationCredentialMetadata.findFirst({
      where: and(
        eq(integrationCredentialMetadata.companyId, companyId),
        eq(integrationCredentialMetadata.provider, provider as IntegrationProvider),
      ),
    });

    if (metadata?.expiresAt) {
      const expired = metadata.expiresAt.getTime() < Date.now();
      checks.push({
        key: 'credential_expiry',
        passed: !expired,
        message: expired
          ? `Credentials expired on ${metadata.expiresAt.toISOString()}`
          : `Credentials valid until ${metadata.expiresAt.toISOString()}`,
      });
    }

    if (metadata?.rotationRequired) {
      checks.push({
        key: 'rotation_required',
        passed: false,
        message: 'Credential rotation is required',
      });
    }

    return {
      provider,
      valid: checks.every((check) => check.passed),
      checks,
    };
  }

  async listDeveloperApiKeys(companyId: string): Promise<DeveloperApiKeySummary[]> {
    const rows = await this.deps.db.query.developerApiKeys.findMany({
      where: and(eq(developerApiKeys.companyId, companyId), isNull(developerApiKeys.revokedAt)),
      orderBy: [desc(developerApiKeys.createdAt)],
    });

    return rows.map(toDeveloperApiKeySummary);
  }

  async createDeveloperApiKey(
    scope: TenantScope,
    input: CreateDeveloperApiKeyRequest,
  ): Promise<DeveloperApiKeyDetail> {
    const apiKey = generateDeveloperApiKey();
    const keyPrefix = apiKey.slice(0, 16);

    const [row] = await this.deps.db
      .insert(developerApiKeys)
      .values({
        companyId: scope.companyId,
        name: input.name,
        keyPrefix,
        keyHash: hashApiKey(apiKey),
        scopes: input.scopes ?? [],
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdByUserId: scope.userId,
      })
      .returning();

    return {
      ...toDeveloperApiKeySummary(row),
      apiKey,
    };
  }

  async revokeDeveloperApiKey(companyId: string, keyId: string): Promise<DeveloperApiKeySummary> {
    const row = await this.deps.db.query.developerApiKeys.findFirst({
      where: and(eq(developerApiKeys.companyId, companyId), eq(developerApiKeys.id, keyId)),
    });

    if (!row) {
      throw new IntegrationApiManagementError('NOT_FOUND', 'Developer API key not found');
    }

    const [updated] = await this.deps.db
      .update(developerApiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(developerApiKeys.id, keyId))
      .returning();

    return toDeveloperApiKeySummary(updated);
  }

  async rotateDeveloperApiKey(scope: TenantScope, keyId: string): Promise<DeveloperApiKeyDetail> {
    const row = await this.deps.db.query.developerApiKeys.findFirst({
      where: and(
        eq(developerApiKeys.companyId, scope.companyId),
        eq(developerApiKeys.id, keyId),
        isNull(developerApiKeys.revokedAt),
      ),
    });

    if (!row) {
      throw new IntegrationApiManagementError('NOT_FOUND', 'Developer API key not found');
    }

    await this.deps.db
      .update(developerApiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(developerApiKeys.id, keyId));

    return this.createDeveloperApiKey(scope, {
      name: `${row.name} (rotated)`,
      scopes: row.scopes,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    });
  }

  async buildAuraContext(companyId: string): Promise<IntegrationApiManagementAuraContext> {
    const [registry, health, deliveries, apiKeys] = await Promise.all([
      this.listRegistry(companyId),
      this.getApiHealth(companyId),
      this.listWebhookDeliveries(companyId, 10),
      this.listDeveloperApiKeys(companyId),
    ]);

    return {
      registryCount: registry.length,
      enabledCount: registry.filter((row) => row.enabled).length,
      connectedCount: registry.filter((row) => row.connectionStatus === 'connected').length,
      unhealthyCount: registry.filter((row) => row.healthStatus === 'unhealthy').length,
      pendingWebhookDeliveries: deliveries.filter((row) =>
        ['pending', 'retry'].includes(row.status),
      ).length,
      developerApiKeyCount: apiKeys.length,
      providers: registry.slice(0, 12).map((row) => ({
        name: row.name,
        provider: row.provider,
        enabled: row.enabled,
        healthStatus: row.healthStatus,
        connectionStatus: row.connectionStatus,
        lastSyncAt: row.lastSyncAt,
      })),
      recentHealth: health.slice(0, 5).map((row) => ({
        provider: row.provider,
        healthStatus: row.healthStatus,
        summary: row.summary,
        checkedAt: row.checkedAt,
      })),
    };
  }

  async syncCredentialMetadata(companyId: string): Promise<void> {
    const connections = await this.deps.db.query.integrationConnections.findMany({
      where: eq(integrationConnections.companyId, companyId),
    });

    const whatsapp = await this.deps.db.query.whatsappConnections.findFirst({
      where: eq(whatsappConnections.companyId, companyId),
    });

    for (const connection of connections) {
      if (!LIVE_PROVIDERS.has(connection.provider)) {
        continue;
      }

      const existing = await this.deps.db.query.integrationCredentialMetadata.findFirst({
        where: and(
          eq(integrationCredentialMetadata.companyId, companyId),
          eq(integrationCredentialMetadata.provider, connection.provider),
        ),
      });

      const authType = PROVIDER_AUTH_TYPES[connection.provider] ?? 'api_key';
      const credentialHint = connection.credentialsEncrypted ? '••••••••' : null;

      if (existing) {
        await this.deps.db
          .update(integrationCredentialMetadata)
          .set({
            connectionId: connection.id,
            authType,
            credentialHint,
            lastValidatedAt:
              connection.status === 'connected' ? new Date() : existing.lastValidatedAt,
            updatedAt: new Date(),
          })
          .where(eq(integrationCredentialMetadata.id, existing.id));
      } else {
        await this.deps.db.insert(integrationCredentialMetadata).values({
          companyId,
          provider: connection.provider,
          connectionId: connection.id,
          authType,
          credentialHint,
          lastValidatedAt: connection.status === 'connected' ? new Date() : null,
        });
      }
    }

    if (whatsapp) {
      const existing = await this.deps.db.query.integrationCredentialMetadata.findFirst({
        where: and(
          eq(integrationCredentialMetadata.companyId, companyId),
          eq(integrationCredentialMetadata.provider, 'whatsapp'),
        ),
      });

      const values = {
        companyId,
        provider: 'whatsapp' as IntegrationProvider,
        connectionId: null,
        authType: 'bearer_token' as IntegrationAuthType,
        credentialHint: whatsapp.credentialsEncrypted ? '••••••••' : null,
        lastValidatedAt: whatsapp.status === 'connected' ? new Date() : null,
        updatedAt: new Date(),
      };

      if (existing) {
        await this.deps.db
          .update(integrationCredentialMetadata)
          .set(values)
          .where(eq(integrationCredentialMetadata.id, existing.id));
      } else {
        await this.deps.db.insert(integrationCredentialMetadata).values(values);
      }
    }
  }

  private async refreshApiUsageFromSyncJobs(companyId: string): Promise<void> {
    const since = new Date(Date.now() - 30 * 86400000);
    const jobs = await this.deps.db.query.integrationSyncJobs.findMany({
      where: and(
        eq(integrationSyncJobs.companyId, companyId),
        gte(integrationSyncJobs.startedAt, since),
      ),
    });

    if (jobs.length === 0) {
      return;
    }

    const grouped = new Map<string, { requests: number; failures: number; durations: number[] }>();

    for (const job of jobs) {
      const key = `${job.provider}:sync`;
      const bucket = grouped.get(key) ?? { requests: 0, failures: 0, durations: [] };
      bucket.requests += 1;
      if (job.status === 'failed') {
        bucket.failures += 1;
      }
      if (job.completedAt) {
        bucket.durations.push(job.completedAt.getTime() - job.startedAt.getTime());
      }
      grouped.set(key, bucket);
    }

    const periodStart = since;
    const periodEnd = new Date();

    for (const [endpointKey, stats] of grouped.entries()) {
      const [provider] = endpointKey.split(':');
      const avgResponseMs =
        stats.durations.length > 0
          ? Math.round(
              stats.durations.reduce((sum, value) => sum + value, 0) / stats.durations.length,
            )
          : null;

      const existing = await this.deps.db.query.integrationApiUsage.findFirst({
        where: and(
          eq(integrationApiUsage.companyId, companyId),
          eq(integrationApiUsage.endpointKey, endpointKey),
          eq(integrationApiUsage.periodStart, periodStart),
        ),
      });

      if (existing) {
        await this.deps.db
          .update(integrationApiUsage)
          .set({
            requestCount: stats.requests,
            failureCount: stats.failures,
            avgResponseMs,
            periodEnd,
          })
          .where(eq(integrationApiUsage.id, existing.id));
      } else {
        await this.deps.db.insert(integrationApiUsage).values({
          companyId,
          provider: provider as IntegrationProvider,
          endpointKey,
          requestCount: stats.requests,
          failureCount: stats.failures,
          avgResponseMs,
          periodStart,
          periodEnd,
        });
      }
    }
  }

  private async refreshLogsFromSyncJobs(companyId: string): Promise<void> {
    const recentJobs = await this.deps.db.query.integrationSyncJobs.findMany({
      where: eq(integrationSyncJobs.companyId, companyId),
      orderBy: [desc(integrationSyncJobs.startedAt)],
      limit: 25,
    });

    for (const job of recentJobs) {
      const endpoint = `sync/${job.syncScope ?? 'default'}`;
      const existing = await this.deps.db.query.integrationRequestLogs.findFirst({
        where: and(
          eq(integrationRequestLogs.companyId, companyId),
          eq(integrationRequestLogs.endpoint, endpoint),
          eq(integrationRequestLogs.createdAt, job.startedAt),
        ),
      });

      if (existing) {
        continue;
      }

      await this.deps.db.insert(integrationRequestLogs).values({
        companyId,
        provider: job.provider,
        direction: 'outbound',
        method: 'POST',
        endpoint,
        statusCode: job.status === 'failed' ? 500 : job.status === 'completed' ? 200 : 202,
        durationMs: job.completedAt ? job.completedAt.getTime() - job.startedAt.getTime() : null,
        errorMessage: maskSensitiveText(job.errorMessage),
        requestSummary: maskSensitiveText(
          `provider=${job.provider} scope=${job.syncScope ?? 'default'}`,
        ),
        responseSummary: maskSensitiveText(
          job.status === 'completed' ? 'Sync completed' : job.status,
        ),
        createdAt: job.startedAt,
      });
    }
  }

  private async refreshWebhookDeliveriesFromEvents(companyId: string): Promise<void> {
    const events = await this.deps.db.query.integrationWebhookEvents.findMany({
      where: eq(integrationWebhookEvents.companyId, companyId),
      orderBy: [desc(integrationWebhookEvents.receivedAt)],
      limit: 25,
    });

    for (const event of events) {
      const existing = await this.deps.db.query.integrationWebhookDeliveries.findFirst({
        where: and(
          eq(integrationWebhookDeliveries.companyId, companyId),
          eq(integrationWebhookDeliveries.eventType, event.eventType),
          eq(integrationWebhookDeliveries.createdAt, event.receivedAt),
        ),
      });

      if (existing) {
        continue;
      }

      const status =
        event.status === 'processed'
          ? 'delivered'
          : event.status === 'failed'
            ? 'failed'
            : 'pending';

      await this.deps.db.insert(integrationWebhookDeliveries).values({
        companyId,
        webhookEndpointId: event.webhookEndpointId,
        direction: 'inbound',
        status,
        eventType: event.eventType,
        attempts: status === 'delivered' ? 1 : 0,
        payloadSummary: maskSensitiveText(`provider=${event.provider ?? 'unknown'}`),
        errorMessage: maskSensitiveText(event.errorMessage),
        scheduledFor: event.receivedAt,
        deliveredAt: event.processedAt,
        createdAt: event.receivedAt,
      });
    }
  }

  private async captureHealthSnapshots(companyId: string): Promise<void> {
    const registry = await this.listRegistry(companyId);
    const webhookEndpoints = await this.deps.db.query.integrationWebhookEndpoints.findMany({
      where: eq(integrationWebhookEndpoints.companyId, companyId),
    });

    const failedEvents = await this.deps.db.query.integrationWebhookEvents.findMany({
      where: and(
        eq(integrationWebhookEvents.companyId, companyId),
        inArray(integrationWebhookEvents.status, ['failed']),
      ),
      limit: 5,
    });

    for (const entry of registry.filter((row) => row.availability === 'available')) {
      const authHealthy = entry.connectionStatus === 'connected' && entry.isConfigured;
      const apiAvailable = entry.connectionStatus !== 'error';
      const webhookHealthy =
        !entry.supportsWebhooks ||
        webhookEndpoints.filter((endpoint) => endpoint.isActive).length === 0 ||
        failedEvents.filter((event) => event.provider === entry.provider).length === 0;

      const healthStatus = this.resolveHealthStatus(
        authHealthy,
        apiAvailable,
        webhookHealthy,
        entry.lastError,
      );
      const summary = [
        `Connection: ${entry.connectionStatus}`,
        entry.lastSyncAt ? `Last sync: ${entry.lastSyncAt}` : 'No sync recorded',
        entry.lastError ? `Error: ${entry.lastError}` : 'No errors',
      ].join('. ');

      const recent = await this.deps.db.query.integrationHealthSnapshots.findFirst({
        where: and(
          eq(integrationHealthSnapshots.companyId, companyId),
          eq(integrationHealthSnapshots.provider, entry.provider as IntegrationProvider),
        ),
        orderBy: [desc(integrationHealthSnapshots.checkedAt)],
      });

      const shouldInsert =
        !recent ||
        recent.healthStatus !== healthStatus ||
        Date.now() - recent.checkedAt.getTime() > 3600000;

      if (!shouldInsert) {
        continue;
      }

      await this.deps.db.insert(integrationHealthSnapshots).values({
        companyId,
        provider: entry.provider as IntegrationProvider,
        healthStatus,
        authHealthy,
        apiAvailable,
        webhookHealthy,
        summary,
        context: {
          connectionStatus: entry.connectionStatus,
          lastSyncAt: entry.lastSyncAt,
        },
      });

      const setting = await this.deps.db.query.integrationRegistrySettings.findFirst({
        where: and(
          eq(integrationRegistrySettings.companyId, companyId),
          eq(integrationRegistrySettings.provider, entry.provider as IntegrationProvider),
        ),
      });

      if (setting) {
        await this.deps.db
          .update(integrationRegistrySettings)
          .set({
            healthStatus,
            lastHealthCheckAt: new Date(),
            lastSyncAt: entry.lastSyncAt ? new Date(entry.lastSyncAt) : setting.lastSyncAt,
            updatedAt: new Date(),
          })
          .where(eq(integrationRegistrySettings.id, setting.id));
      }
    }
  }

  private inferHealthFromConnection(status?: string): IntegrationHealthStatus {
    if (status === 'connected') {
      return 'healthy';
    }
    if (status === 'error') {
      return 'unhealthy';
    }
    if (status === 'pending') {
      return 'degraded';
    }
    return 'unknown';
  }

  private resolveHealthStatus(
    authHealthy: boolean,
    apiAvailable: boolean,
    webhookHealthy: boolean,
    lastError: string | null,
  ): IntegrationHealthStatus {
    if (lastError || !authHealthy) {
      return 'unhealthy';
    }
    if (!apiAvailable || !webhookHealthy) {
      return 'degraded';
    }
    return 'healthy';
  }

  private assertKnownProvider(provider: string): void {
    if (!INTEGRATION_PROVIDER_REGISTRY.some((entry) => entry.provider === provider)) {
      throw new IntegrationApiManagementError(
        'VALIDATION_ERROR',
        `Unknown integration provider: ${provider}`,
      );
    }
  }
}

function maskSensitiveText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[=:\s]+[A-Za-z0-9._-]+/gi, 'api_key=[REDACTED]')
    .replace(/password[=:\s]+[^\s]+/gi, 'password=[REDACTED]')
    .replace(/secret[=:\s]+[^\s]+/gi, 'secret=[REDACTED]')
    .replace(/token[=:\s]+[^\s]+/gi, 'token=[REDACTED]');
}

function toCredentialMetadataSummary(
  row: typeof integrationCredentialMetadata.$inferSelect,
): IntegrationCredentialMetadataSummary {
  return {
    id: row.id,
    provider: row.provider,
    connectionId: row.connectionId,
    authType: row.authType,
    credentialHint: row.credentialHint,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    lastRotatedAt: row.lastRotatedAt?.toISOString() ?? null,
    usageCount: row.usageCount,
    rotationRequired: row.rotationRequired,
  };
}

function toApiUsageSummary(
  row: typeof integrationApiUsage.$inferSelect,
): IntegrationApiUsageSummary {
  return {
    id: row.id,
    provider: row.provider,
    endpointKey: row.endpointKey,
    requestCount: row.requestCount,
    failureCount: row.failureCount,
    avgResponseMs: row.avgResponseMs,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
  };
}

function toHealthSummary(
  row: typeof integrationHealthSnapshots.$inferSelect,
): IntegrationHealthSummary {
  return {
    provider: row.provider,
    healthStatus: row.healthStatus,
    authHealthy: row.authHealthy,
    apiAvailable: row.apiAvailable,
    webhookHealthy: row.webhookHealthy,
    avgLatencyMs: row.avgLatencyMs,
    summary: row.summary,
    checkedAt: row.checkedAt.toISOString(),
  };
}

function toRequestLogSummary(
  row: typeof integrationRequestLogs.$inferSelect,
): IntegrationRequestLogSummary {
  return {
    id: row.id,
    provider: row.provider,
    direction: row.direction,
    method: row.method,
    endpoint: row.endpoint,
    statusCode: row.statusCode,
    durationMs: row.durationMs,
    errorMessage: row.errorMessage,
    requestSummary: row.requestSummary,
    responseSummary: row.responseSummary,
    createdAt: row.createdAt.toISOString(),
  };
}

function toWebhookDeliverySummary(
  row: typeof integrationWebhookDeliveries.$inferSelect,
): IntegrationWebhookDeliverySummary {
  return {
    id: row.id,
    webhookEndpointId: row.webhookEndpointId,
    direction: row.direction,
    status: row.status,
    eventType: row.eventType,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    payloadSummary: row.payloadSummary,
    errorMessage: row.errorMessage,
    scheduledFor: row.scheduledFor.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof integrationRecommendations.$inferSelect,
): IntegrationRecommendationSummary {
  return {
    id: row.id,
    provider: row.provider,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDeveloperApiKeySummary(
  row: typeof developerApiKeys.$inferSelect,
): DeveloperApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
