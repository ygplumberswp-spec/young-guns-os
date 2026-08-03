import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CreateIntegrationWebhookEndpointRequest,
  IntegrationHubDashboard,
  IntegrationHubStats,
  IntegrationProvider,
  IntegrationProviderStatus,
  IntegrationSyncJobDetail,
  IntegrationSyncJobSummary,
  IntegrationWebhookEndpointDetail,
  IntegrationWebhookEndpointSummary,
  IntegrationWebhookEventSummary,
  UpdateIntegrationWebhookEndpointRequest,
} from '@titan/shared';
import {
  deriveIntegrationCapabilityState,
  formatCapabilityStateLabel,
  getIntegrationProviderRegistryEntry,
  HONESTY_ONLY_PROVIDERS,
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
import { buildTenantCacheKey, cachedTenantRead, CACHE_TTLS } from './api-read-cache.js';

type IntegrationConnectionBundle = {
  connections: Array<typeof integrationConnections.$inferSelect>;
  whatsappConnection: typeof whatsappConnections.$inferSelect | null;
};

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
    provider: IntegrationProviderStatus['provider'];
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

type N8nStatusProvider = {
  getIntegrationProviderStatus(companyId: string): Promise<IntegrationProviderStatus>;
};

export class IntegrationHubService {
  private n8nStatusProvider: N8nStatusProvider | null = null;
  private gmailOAuthConfigured: (() => boolean) | null = null;

  constructor(private readonly db: DatabaseClient) {}

  /** UX-J — bind Automation-owned n8n status without duplicating connector storage. */
  setN8nStatusProvider(provider: N8nStatusProvider | null) {
    this.n8nStatusProvider = provider;
  }

  /** Bind Google OAuth app configuration so Gmail never fakes Connected when secrets are missing. */
  setGmailOAuthConfiguredProvider(provider: (() => boolean) | null) {
    this.gmailOAuthConfigured = provider;
  }

  async getDashboard(
    companyId: string,
    options?: { simple?: boolean },
  ): Promise<IntegrationHubDashboard> {
    const simple = options?.simple === true;
    return cachedTenantRead(
      buildTenantCacheKey(companyId, 'integration-hub/dashboard', simple ? 'simple' : 'full'),
      () => this.loadDashboard(companyId, simple),
      CACHE_TTLS.dashboard,
    );
  }

  private async loadDashboard(
    companyId: string,
    simple: boolean,
  ): Promise<IntegrationHubDashboard> {
    const connectionBundle = await this.loadConnectionBundle(companyId);
    const baseStats = this.buildStatsFromConnections(connectionBundle);
    const providers = await this.appendN8nStatus(
      companyId,
      this.mapProviderStatuses(connectionBundle),
    );

    if (simple) {
      return {
        stats: baseStats,
        providers,
        recentSyncJobs: [],
        recentWebhookEvents: [],
      };
    }

    const [stats, recentSyncJobs, recentWebhookEvents] = await Promise.all([
      this.enrichStatsCounts(companyId, baseStats),
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

  private async loadConnectionBundle(companyId: string): Promise<IntegrationConnectionBundle> {
    const [connections, whatsappConnection] = await Promise.all([
      this.db.query.integrationConnections.findMany({
        where: eq(integrationConnections.companyId, companyId),
      }),
      this.db.query.whatsappConnections.findFirst({
        where: eq(whatsappConnections.companyId, companyId),
      }),
    ]);

    return { connections, whatsappConnection: whatsappConnection ?? null };
  }

  private buildStatsFromConnections(bundle: IntegrationConnectionBundle): IntegrationHubStats {
    const { connections } = bundle;
    return {
      providerCount: INTEGRATION_PROVIDER_REGISTRY.length,
      configuredConnectionCount: connections.length,
      connectedCount: connections.filter((connection) => connection.status === 'connected').length,
      errorCount: connections.filter((connection) => connection.status === 'error').length,
      syncJobCount: 0,
      activeSyncJobCount: 0,
      webhookEndpointCount: 0,
      activeWebhookEndpointCount: 0,
      webhookEventCount: 0,
    };
  }

  private async enrichStatsCounts(
    companyId: string,
    stats: IntegrationHubStats,
  ): Promise<IntegrationHubStats> {
    const countResults = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(integrationSyncJobs)
        .where(eq(integrationSyncJobs.companyId, companyId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(integrationSyncJobs)
        .where(
          and(
            eq(integrationSyncJobs.companyId, companyId),
            inArray(integrationSyncJobs.status, ['pending', 'running']),
          ),
        ),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(integrationWebhookEndpoints)
        .where(eq(integrationWebhookEndpoints.companyId, companyId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(integrationWebhookEndpoints)
        .where(
          and(
            eq(integrationWebhookEndpoints.companyId, companyId),
            eq(integrationWebhookEndpoints.isActive, true),
          ),
        ),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(integrationWebhookEvents)
        .where(eq(integrationWebhookEvents.companyId, companyId)),
    ]);

    const [
      syncJobCountRow,
      activeSyncJobCountRow,
      webhookEndpointCountRow,
      activeWebhookEndpointCountRow,
      webhookEventCountRow,
    ] = countResults.map((rows) => rows[0]);

    return {
      ...stats,
      syncJobCount: syncJobCountRow?.count ?? 0,
      activeSyncJobCount: activeSyncJobCountRow?.count ?? 0,
      webhookEndpointCount: webhookEndpointCountRow?.count ?? 0,
      activeWebhookEndpointCount: activeWebhookEndpointCountRow?.count ?? 0,
      webhookEventCount: webhookEventCountRow?.count ?? 0,
    };
  }

  private mapProviderStatuses(bundle: IntegrationConnectionBundle): IntegrationProviderStatus[] {
    const { connections, whatsappConnection } = bundle;
    const connectionByProvider = new Map(
      connections.map((connection) => [connection.provider, connection]),
    );

    const gmailAppConfigured = this.gmailOAuthConfigured?.() ?? true;

    const registryStatuses: IntegrationProviderStatus[] = INTEGRATION_PROVIDER_REGISTRY.map(
      (entry) => {
        const isWhatsapp = entry.provider === 'whatsapp';
        const isGmail = entry.provider === 'gmail';
        const connection = isWhatsapp ? undefined : connectionByProvider.get(entry.provider);

        let connectionStatus = isWhatsapp
          ? (whatsappConnection?.status ?? 'disconnected')
          : (connection?.status ?? 'disconnected');
        // Gmail tokens live on Communications Platform — hub row is status-only.
        // Treat Connected only when status is connected; disconnected rows are not "configured".
        let isConfigured = isWhatsapp
          ? Boolean(whatsappConnection?.credentialsEncrypted)
          : isGmail
            ? connection?.status === 'connected'
            : Boolean(connection);
        const lastError = isWhatsapp
          ? (whatsappConnection?.lastError ?? null)
          : (connection?.lastError ?? null);

        if (isGmail && !gmailAppConfigured) {
          connectionStatus = 'disconnected';
          isConfigured = false;
        }

        const backendImplemented = entry.availability === 'available';
        // Distinguish platform OAuth app (GOOGLE_*) from tenant Gmail connection.
        // App ready + tenant not connected → disconnected (Connect available), not not_configured.
        const capabilityState =
          isGmail && !gmailAppConfigured
            ? 'not_configured'
            : isGmail &&
                gmailAppConfigured &&
                !isConfigured &&
                (connectionStatus === 'disconnected' || connectionStatus === 'pending')
              ? connectionStatus === 'pending'
                ? 'configured_unverified'
                : 'disconnected'
              : deriveIntegrationCapabilityState({
                  availability: entry.availability,
                  connectionStatus,
                  isConfigured,
                  backendImplemented,
                  lastError,
                });
        const capabilityLabel = formatCapabilityStateLabel(capabilityState);
        const canConnect =
          capabilityState !== 'not_implemented' &&
          entry.availability === 'available' &&
          Boolean(entry.settingsPath) &&
          !(isGmail && !gmailAppConfigured);
        const canSend =
          capabilityState === 'connected_usable' &&
          (entry.provider === 'whatsapp' ||
            entry.provider === 'email' ||
            entry.provider === 'gmail' ||
            entry.provider === 'resend');

        return {
          ...entry,
          connectionId: isWhatsapp ? (whatsappConnection?.id ?? null) : (connection?.id ?? null),
          connectionStatus,
          isConfigured,
          lastSyncAt: isWhatsapp ? null : (connection?.lastSyncAt?.toISOString() ?? null),
          lastError:
            isGmail && !gmailAppConfigured
              ? 'Not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API.'
              : lastError,
          connectedAt: isWhatsapp
            ? (whatsappConnection?.connectedAt?.toISOString() ?? null)
            : (connection?.connectedAt?.toISOString() ?? null),
          capabilityState,
          capabilityLabel,
          canConnect,
          canSend,
        };
      },
    );

    const honestyStatuses: IntegrationProviderStatus[] = HONESTY_ONLY_PROVIDERS.map((honesty) => ({
      provider: honesty.id as IntegrationProviderStatus['provider'],
      name: honesty.name,
      description: honesty.description,
      category: honesty.category,
      availability: 'planned' as const,
      settingsPath: honesty.deepLinkPath,
      supportsSync: false,
      supportsWebhooks: false,
      connectionId: null,
      connectionStatus: 'disconnected' as const,
      isConfigured: false,
      lastSyncAt: null,
      lastError: null,
      connectedAt: null,
      capabilityState: honesty.capabilityState,
      capabilityLabel: formatCapabilityStateLabel(honesty.capabilityState),
      canConnect: false,
      canSend: false,
      honestyOnly: true,
    }));

    return [...registryStatuses, ...honestyStatuses];
  }

  private async appendN8nStatus(
    companyId: string,
    statuses: IntegrationProviderStatus[],
  ): Promise<IntegrationProviderStatus[]> {
    if (!this.n8nStatusProvider) {
      return [
        ...statuses,
        {
          provider: 'n8n',
          name: 'n8n',
          description:
            'External orchestration is Automation-owned. Configure under Automations.',
          category: 'automation',
          availability: 'available',
          settingsPath: '/automation/n8n',
          supportsSync: false,
          supportsWebhooks: true,
          connectionId: null,
          connectionStatus: 'disconnected',
          isConfigured: false,
          lastSyncAt: null,
          lastError: null,
          connectedAt: null,
          capabilityState: 'not_configured',
          capabilityLabel: formatCapabilityStateLabel('not_configured'),
          canConnect: false,
          canSend: false,
          honestyOnly: false,
        },
      ];
    }
    const n8nStatus = await this.n8nStatusProvider.getIntegrationProviderStatus(companyId);
    return [...statuses, n8nStatus];
  }

  async getStats(companyId: string): Promise<IntegrationHubStats> {
    const bundle = await this.loadConnectionBundle(companyId);
    const base = this.buildStatsFromConnections(bundle);
    return this.enrichStatsCounts(companyId, base);
  }

  async listProviderStatuses(companyId: string) {
    const bundle = await this.loadConnectionBundle(companyId);
    const statuses = this.mapProviderStatuses(bundle);
    return this.appendN8nStatus(companyId, statuses);
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

  async enqueueSyncJob(input: {
    companyId: string;
    provider: IntegrationProvider;
    integrationConnectionId?: string | null;
    jobType?: 'manual' | 'scheduled';
    syncScope?: string | null;
    resultSummary?: Record<string, unknown> | null;
  }): Promise<string> {
    const [created] = await this.db
      .insert(integrationSyncJobs)
      .values({
        companyId: input.companyId,
        provider: input.provider,
        integrationConnectionId: input.integrationConnectionId ?? null,
        jobType: input.jobType ?? 'manual',
        syncScope: input.syncScope ?? null,
        status: 'pending',
        startedAt: new Date(),
        resultSummary: input.resultSummary ?? null,
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
      throw new IntegrationHubError(
        'DUPLICATE_NAME',
        'A webhook endpoint with this name already exists',
      );
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
    const dashboard = await this.getDashboard(companyId, { simple: true });
    return {
      providerCount: dashboard.stats.providerCount,
      configuredConnectionCount: dashboard.stats.configuredConnectionCount,
      connectedCount: dashboard.stats.connectedCount,
      errorCount: dashboard.stats.errorCount,
      syncJobCount: dashboard.stats.syncJobCount,
      webhookEndpointCount: dashboard.stats.webhookEndpointCount,
      webhookEventCount: dashboard.stats.webhookEventCount,
      providers: dashboard.providers.map((provider) => ({
        name: provider.name,
        provider: provider.provider,
        connectionStatus: provider.connectionStatus,
        isConfigured: provider.isConfigured,
        lastSyncAt: provider.lastSyncAt,
      })),
      recentSyncJobs: [],
    };
  }
}

function toSyncJobSummary(row: typeof integrationSyncJobs.$inferSelect): IntegrationSyncJobSummary {
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
