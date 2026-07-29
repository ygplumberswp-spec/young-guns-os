import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CreateIntegrationWebhookEndpointRequest,
  IntegrationHubDashboard,
  IntegrationHubStats,
  IntegrationProvider,
  IntegrationSyncJobDetail,
  IntegrationSyncJobSummary,
  IntegrationWebhookEndpointDetail,
  IntegrationWebhookEndpointSummary,
  IntegrationWebhookEventSummary,
  UpdateIntegrationWebhookEndpointRequest,
} from '@titan/shared';
import {
  getIntegrationProviderRegistryEntry,
  INTEGRATION_PROVIDER_REGISTRY,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  integrationConnections,
  integrationSyncJobs,
  integrationWebhookEndpoints,
  integrationWebhookEvents,
  whatsappConnections,
} from '@titan/db';
import { generateWebhookSecret, hashWebhookSecret } from '../lib/crypto.js';

export class IntegrationHubError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationHubError';
  }
}

export type AuraIntegrationHubContext = {
  providerCount: number;
  configuredConnectionCount: number;
  connectedCount: number;
  errorCount: number;
  syncJobCount: number;
  webhookEndpointCount: number;
  webhookEventCount: number;
  providers: Array<{
    name: string;
    provider: IntegrationProvider;
    connectionStatus: string;
    isConfigured: boolean;
    lastSyncAt: string | null;
  }>;
  recentSyncJobs: Array<{
    provider: IntegrationProvider;
    status: string;
    startedAt: string;
    errorMessage: string | null;
  }>;
};

export class IntegrationHubService {
  constructor(private readonly db: DatabaseClient) {}

  async getDashboard(companyId: string): Promise<IntegrationHubDashboard> {
    const [stats, providers, recentSyncJobs, recentWebhookEvents] = await Promise.all([
      this.getStats(companyId),
      this.listProviderStatuses(companyId),
      this.listSyncJobs(companyId, 5),
      this.listWebhookEvents(companyId, 5),
    ]);

    return {
      stats,
      providers,
      recentSyncJobs,
      recentWebhookEvents,
    };
  }

  async getStats(companyId: string): Promise<IntegrationHubStats> {
    const connections = await this.db.query.integrationConnections.findMany({
      where: eq(integrationConnections.companyId, companyId),
    });

    const [syncJobCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(integrationSyncJobs)
      .where(eq(integrationSyncJobs.companyId, companyId));

    const [activeSyncJobCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(integrationSyncJobs)
      .where(
        and(
          eq(integrationSyncJobs.companyId, companyId),
          inArray(integrationSyncJobs.status, ['pending', 'running']),
        ),
      );

    const [webhookEndpointCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(integrationWebhookEndpoints)
      .where(eq(integrationWebhookEndpoints.companyId, companyId));

    const [activeWebhookEndpointCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(integrationWebhookEndpoints)
      .where(
        and(
          eq(integrationWebhookEndpoints.companyId, companyId),
          eq(integrationWebhookEndpoints.isActive, true),
        ),
      );

    const [webhookEventCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(integrationWebhookEvents)
      .where(eq(integrationWebhookEvents.companyId, companyId));

    return {
      providerCount: INTEGRATION_PROVIDER_REGISTRY.length,
      configuredConnectionCount: connections.length,
      connectedCount: connections.filter((connection) => connection.status === 'connected').length,
      errorCount: connections.filter((connection) => connection.status === 'error').length,
      syncJobCount: syncJobCountRow?.count ?? 0,
      activeSyncJobCount: activeSyncJobCountRow?.count ?? 0,
      webhookEndpointCount: webhookEndpointCountRow?.count ?? 0,
      activeWebhookEndpointCount: activeWebhookEndpointCountRow?.count ?? 0,
      webhookEventCount: webhookEventCountRow?.count ?? 0,
    };
  }

  async listProviderStatuses(companyId: string) {
    const connections = await this.db.query.integrationConnections.findMany({
      where: eq(integrationConnections.companyId, companyId),
    });

    const whatsappConnection = await this.db.query.whatsappConnections.findFirst({
      where: eq(whatsappConnections.companyId, companyId),
    });

    const connectionByProvider = new Map(
      connections.map((connection) => [connection.provider, connection]),
    );

    return INTEGRATION_PROVIDER_REGISTRY.map((entry) => {
      if (entry.provider === 'whatsapp') {
        return {
          ...entry,
          connectionId: whatsappConnection?.id ?? null,
          connectionStatus: whatsappConnection?.status ?? 'disconnected',
          isConfigured: Boolean(whatsappConnection?.credentialsEncrypted),
          lastSyncAt: null,
          lastError: whatsappConnection?.lastError ?? null,
          connectedAt: whatsappConnection?.connectedAt?.toISOString() ?? null,
        };
      }

      const connection = connectionByProvider.get(entry.provider);

      return {
        ...entry,
        connectionId: connection?.id ?? null,
        connectionStatus: connection?.status ?? 'disconnected',
        isConfigured: Boolean(connection),
        lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
        lastError: connection?.lastError ?? null,
        connectedAt: connection?.connectedAt?.toISOString() ?? null,
      };
    });
  }

  async listSyncJobs(companyId: string, limit = 50): Promise<IntegrationSyncJobSummary[]> {
    const rows = await this.db.query.integrationSyncJobs.findMany({
      where: eq(integrationSyncJobs.companyId, companyId),
      orderBy: [desc(integrationSyncJobs.startedAt)],
      limit,
    });

    return rows.map(toSyncJobSummary);
  }

  async getSyncJob(companyId: string, syncJobId: string): Promise<IntegrationSyncJobDetail | null> {
    const row = await this.db.query.integrationSyncJobs.findFirst({
      where: and(
        eq(integrationSyncJobs.id, syncJobId),
        eq(integrationSyncJobs.companyId, companyId),
      ),
    });

    if (!row) {
      return null;
    }

    return {
      ...toSyncJobSummary(row),
      resultSummary: (row.resultSummary as Record<string, unknown> | null) ?? null,
    };
  }

  async startSyncJob(input: {
    companyId: string;
    provider: IntegrationProvider;
    integrationConnectionId?: string | null;
    jobType?: 'manual' | 'scheduled';
    syncScope?: string | null;
  }): Promise<string> {
    const [created] = await this.db
      .insert(integrationSyncJobs)
      .values({
        companyId: input.companyId,
        provider: input.provider,
        integrationConnectionId: input.integrationConnectionId ?? null,
        jobType: input.jobType ?? 'manual',
        syncScope: input.syncScope ?? null,
        status: 'running',
        startedAt: new Date(),
      })
      .returning({ id: integrationSyncJobs.id });

    if (!created) {
      throw new IntegrationHubError('CREATE_FAILED', 'Unable to create sync job');
    }

    return created.id;
  }

  async completeSyncJob(
    syncJobId: string,
    input: {
      status: 'completed' | 'failed' | 'cancelled';
      errorMessage?: string | null;
      resultSummary?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await this.db
      .update(integrationSyncJobs)
      .set({
        status: input.status,
        completedAt: new Date(),
        errorMessage: input.errorMessage ?? null,
        resultSummary: input.resultSummary ?? null,
      })
      .where(eq(integrationSyncJobs.id, syncJobId));
  }

  async listWebhookEndpoints(companyId: string): Promise<IntegrationWebhookEndpointSummary[]> {
    const rows = await this.db.query.integrationWebhookEndpoints.findMany({
      where: eq(integrationWebhookEndpoints.companyId, companyId),
      orderBy: [desc(integrationWebhookEndpoints.updatedAt)],
    });

    return rows.map(toWebhookEndpointSummary);
  }

  async createWebhookEndpoint(
    companyId: string,
    input: CreateIntegrationWebhookEndpointRequest,
  ): Promise<IntegrationWebhookEndpointDetail> {
    const name = input.name.trim();

    if (!name) {
      throw new IntegrationHubError('VALIDATION_ERROR', 'Webhook endpoint name is required');
    }

    const existing = await this.db.query.integrationWebhookEndpoints.findFirst({
      where: and(
        eq(integrationWebhookEndpoints.companyId, companyId),
        eq(integrationWebhookEndpoints.name, name),
      ),
    });

    if (existing) {
      throw new IntegrationHubError('DUPLICATE_NAME', 'A webhook endpoint with this name already exists');
    }

    const secret = generateWebhookSecret();

    const [created] = await this.db
      .insert(integrationWebhookEndpoints)
      .values({
        companyId,
        name,
        description: input.description?.trim() || null,
        secretHash: hashWebhookSecret(secret),
        isActive: input.isActive ?? true,
      })
      .returning();

    if (!created) {
      throw new IntegrationHubError('CREATE_FAILED', 'Unable to create webhook endpoint');
    }

    return {
      ...toWebhookEndpointSummary(created),
      secret,
    };
  }

  async updateWebhookEndpoint(
    companyId: string,
    endpointId: string,
    input: UpdateIntegrationWebhookEndpointRequest,
  ): Promise<IntegrationWebhookEndpointSummary> {
    const existing = await this.db.query.integrationWebhookEndpoints.findFirst({
      where: and(
        eq(integrationWebhookEndpoints.id, endpointId),
        eq(integrationWebhookEndpoints.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new IntegrationHubError('NOT_FOUND', 'Webhook endpoint not found');
    }

    const nextName = input.name?.trim();

    if (nextName && nextName !== existing.name) {
      const duplicate = await this.db.query.integrationWebhookEndpoints.findFirst({
        where: and(
          eq(integrationWebhookEndpoints.companyId, companyId),
          eq(integrationWebhookEndpoints.name, nextName),
        ),
      });

      if (duplicate) {
        throw new IntegrationHubError(
          'DUPLICATE_NAME',
          'A webhook endpoint with this name already exists',
        );
      }
    }

    const [updated] = await this.db
      .update(integrationWebhookEndpoints)
      .set({
        name: nextName ?? existing.name,
        description:
          input.description === undefined
            ? existing.description
            : input.description?.trim() || null,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(integrationWebhookEndpoints.id, endpointId))
      .returning();

    if (!updated) {
      throw new IntegrationHubError('UPDATE_FAILED', 'Unable to update webhook endpoint');
    }

    return toWebhookEndpointSummary(updated);
  }

  async deleteWebhookEndpoint(companyId: string, endpointId: string): Promise<void> {
    const existing = await this.db.query.integrationWebhookEndpoints.findFirst({
      where: and(
        eq(integrationWebhookEndpoints.id, endpointId),
        eq(integrationWebhookEndpoints.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new IntegrationHubError('NOT_FOUND', 'Webhook endpoint not found');
    }

    await this.db
      .delete(integrationWebhookEndpoints)
      .where(eq(integrationWebhookEndpoints.id, endpointId));
  }

  async listWebhookEvents(
    companyId: string,
    limit = 50,
  ): Promise<IntegrationWebhookEventSummary[]> {
    const rows = await this.db.query.integrationWebhookEvents.findMany({
      where: eq(integrationWebhookEvents.companyId, companyId),
      with: { endpoint: true },
      orderBy: [desc(integrationWebhookEvents.receivedAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      endpointId: row.webhookEndpointId,
      endpointName: row.endpoint?.name ?? null,
      provider: row.provider,
      eventType: row.eventType,
      status: row.status,
      receivedAt: row.receivedAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
      errorMessage: row.errorMessage,
    }));
  }

  async recordProviderWebhookEvent(input: {
    companyId: string;
    provider: IntegrationProvider;
    eventType: string;
    status: 'received' | 'processed' | 'failed' | 'ignored';
    errorMessage?: string | null;
  }): Promise<void> {
    await this.db.insert(integrationWebhookEvents).values({
      companyId: input.companyId,
      provider: input.provider,
      eventType: input.eventType,
      status: input.status,
      processedAt: input.status === 'processed' ? new Date() : null,
      errorMessage: input.errorMessage ?? null,
      payload: {},
    });
  }

  async buildAuraContext(companyId: string): Promise<AuraIntegrationHubContext> {
    const stats = await this.getStats(companyId);
    const providers = await this.listProviderStatuses(companyId);
    const recentSyncJobs = await this.listSyncJobs(companyId, 5);

    return {
      providerCount: stats.providerCount,
      configuredConnectionCount: stats.configuredConnectionCount,
      connectedCount: stats.connectedCount,
      errorCount: stats.errorCount,
      syncJobCount: stats.syncJobCount,
      webhookEndpointCount: stats.webhookEndpointCount,
      webhookEventCount: stats.webhookEventCount,
      providers: providers.map((provider) => ({
        name: provider.name,
        provider: provider.provider,
        connectionStatus: provider.connectionStatus,
        isConfigured: provider.isConfigured,
        lastSyncAt: provider.lastSyncAt,
      })),
      recentSyncJobs: recentSyncJobs.map((job) => ({
        provider: job.provider,
        status: job.status,
        startedAt: job.startedAt,
        errorMessage: job.errorMessage,
      })),
    };
  }
}

function toSyncJobSummary(
  row: typeof integrationSyncJobs.$inferSelect,
): IntegrationSyncJobSummary {
  const registryEntry = getIntegrationProviderRegistryEntry(row.provider);

  return {
    id: row.id,
    provider: row.provider,
    providerName: registryEntry?.name ?? row.provider,
    jobType: row.jobType,
    status: row.status,
    syncScope: row.syncScope,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
    connectionId: row.integrationConnectionId,
  };
}

function toWebhookEndpointSummary(
  row: typeof integrationWebhookEndpoints.$inferSelect,
): IntegrationWebhookEndpointSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
