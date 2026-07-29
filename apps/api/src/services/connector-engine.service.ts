import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type {
  IntegrationConnectorAuthType,
  IntegrationConnectorCategory,
  IntegrationConnectorSummary,
  IntegrationConnectorSyncMode,
} from '@titan/shared';
import type { IntegrationProvider } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  aiProviders,
  integrationConnections,
  integrationConnectors,
  integrationSyncSchedules,
  whatsappConnections,
} from '@titan/db';

type ConnectorDefinition = {
  connectorKey: string;
  provider: IntegrationProvider | string;
  name: string;
  category: IntegrationConnectorCategory;
  authType: IntegrationConnectorAuthType;
  syncMode: IntegrationConnectorSyncMode;
  supportsWebhooks: boolean;
  supportsScheduledSync: boolean;
};

const LIVE_CONNECTOR_DEFINITIONS: ConnectorDefinition[] = [
  {
    connectorKey: 'cartrack',
    provider: 'cartrack',
    name: 'Cartrack',
    category: 'fleet',
    authType: 'api_key',
    syncMode: 'scheduled',
    supportsWebhooks: false,
    supportsScheduledSync: true,
  },
  {
    connectorKey: 'xero',
    provider: 'xero',
    name: 'Xero',
    category: 'accounting',
    authType: 'oauth2',
    syncMode: 'scheduled',
    supportsWebhooks: false,
    supportsScheduledSync: true,
  },
  {
    connectorKey: 'email',
    provider: 'email',
    name: 'Email (SMTP)',
    category: 'email',
    authType: 'basic_auth',
    syncMode: 'manual',
    supportsWebhooks: false,
    supportsScheduledSync: false,
  },
  {
    connectorKey: 'yoco',
    provider: 'yoco',
    name: 'Yoco',
    category: 'payments',
    authType: 'api_key',
    syncMode: 'manual',
    supportsWebhooks: true,
    supportsScheduledSync: true,
  },
  {
    connectorKey: 'whatsapp',
    provider: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'messaging',
    authType: 'bearer_token',
    syncMode: 'event_driven',
    supportsWebhooks: true,
    supportsScheduledSync: false,
  },
];

const AI_CONNECTOR_DEFINITIONS: ConnectorDefinition[] = [
  {
    connectorKey: 'openai',
    provider: 'custom',
    name: 'OpenAI',
    category: 'ai',
    authType: 'api_key',
    syncMode: 'manual',
    supportsWebhooks: false,
    supportsScheduledSync: false,
  },
  {
    connectorKey: 'gemini',
    provider: 'custom',
    name: 'Google Gemini',
    category: 'ai',
    authType: 'api_key',
    syncMode: 'manual',
    supportsWebhooks: false,
    supportsScheduledSync: false,
  },
];

export class ConnectorEngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ConnectorEngineError';
  }
}

export class ConnectorEngineService {
  constructor(private readonly db: DatabaseClient) {}

  getConnectorDefinitions(): ConnectorDefinition[] {
    return [...LIVE_CONNECTOR_DEFINITIONS, ...AI_CONNECTOR_DEFINITIONS];
  }

  async ensureConnectors(companyId: string): Promise<void> {
    const definitions = this.getConnectorDefinitions();

    for (const definition of definitions) {
      const existing = await this.db.query.integrationConnectors.findFirst({
        where: and(
          eq(integrationConnectors.companyId, companyId),
          eq(integrationConnectors.connectorKey, definition.connectorKey),
        ),
      });

      if (existing) {
        continue;
      }

      await this.db.insert(integrationConnectors).values({
        companyId,
        connectorKey: definition.connectorKey,
        provider: definition.provider as IntegrationProvider,
        name: definition.name,
        category: definition.category,
        authType: definition.authType,
        syncMode: definition.syncMode,
        supportsWebhooks: definition.supportsWebhooks,
        supportsScheduledSync: definition.supportsScheduledSync,
        status: 'disconnected',
      });
    }

    await this.syncConnectorStatuses(companyId);
  }

  async syncConnectorStatuses(companyId: string): Promise<void> {
    const [connections, whatsapp, aiProviderRows, connectors] = await Promise.all([
      this.db.query.integrationConnections.findMany({
        where: eq(integrationConnections.companyId, companyId),
      }),
      this.db.query.whatsappConnections.findMany({
        where: eq(whatsappConnections.companyId, companyId),
      }),
      this.db.query.aiProviders.findMany({
        where: eq(aiProviders.companyId, companyId),
      }),
      this.db.query.integrationConnectors.findMany({
        where: eq(integrationConnectors.companyId, companyId),
      }),
    ]);

    const connectionByProvider = new Map(connections.map((row) => [row.provider, row]));
    const whatsappConnection = whatsapp[0];

    for (const connector of connectors) {
      let status: 'disconnected' | 'pending' | 'connected' | 'error' = 'disconnected';
      let connectionId: string | null = null;
      let lastSyncAt = connector.lastSyncAt;
      let lastError = connector.lastError;

      if (connector.connectorKey === 'whatsapp') {
        if (whatsappConnection) {
          status =
            whatsappConnection.status === 'connected'
              ? 'connected'
              : whatsappConnection.status === 'error'
                ? 'error'
                : 'pending';
          lastSyncAt = whatsappConnection.connectedAt ?? whatsappConnection.updatedAt ?? lastSyncAt;
          lastError = whatsappConnection.lastError ?? lastError;
        }
      } else if (connector.connectorKey === 'openai' || connector.connectorKey === 'gemini') {
        const providerKey = connector.connectorKey === 'gemini' ? 'google_gemini' : 'openai';
        const aiRow = aiProviderRows.find((row) => row.providerKey === providerKey);
        if (aiRow) {
          status = aiRow.status === 'active' ? 'connected' : aiRow.status === 'degraded' ? 'error' : 'disconnected';
        }
      } else {
        const connection = connectionByProvider.get(connector.provider as IntegrationProvider);
        if (connection) {
          connectionId = connection.id;
          status =
            connection.status === 'connected'
              ? 'connected'
              : connection.status === 'error'
                ? 'error'
                : connection.status === 'pending'
                  ? 'pending'
                  : 'disconnected';
          lastSyncAt = connection.lastSyncAt ?? lastSyncAt;
          lastError = connection.lastError ?? lastError;
        }
      }

      await this.db
        .update(integrationConnectors)
        .set({
          status,
          connectionId,
          lastSyncAt,
          lastError,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnectors.id, connector.id));
    }
  }

  async listConnectors(companyId: string): Promise<IntegrationConnectorSummary[]> {
    await this.ensureConnectors(companyId);
    await this.syncConnectorStatuses(companyId);

    const rows = await this.db.query.integrationConnectors.findMany({
      where: eq(integrationConnectors.companyId, companyId),
      orderBy: (fields, { asc }) => [asc(fields.name)],
    });

    const schedules = await this.db.query.integrationSyncSchedules.findMany({
      where: eq(integrationSyncSchedules.companyId, companyId),
    });
    const scheduleByConnector = new Map(schedules.map((row) => [row.connectorId, row]));

    return rows.map((row) => ({
      id: row.id,
      connectorKey: row.connectorKey,
      provider: row.provider,
      name: row.name,
      category: row.category,
      authType: row.authType,
      syncMode: row.syncMode,
      status: row.status,
      connectionId: row.connectionId,
      supportsWebhooks: row.supportsWebhooks,
      supportsScheduledSync: row.supportsScheduledSync,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      lastError: row.lastError,
      syncFrequencyMinutes: scheduleByConnector.get(row.id)?.frequencyMinutes ?? null,
    }));
  }

  async getConnector(companyId: string, connectorId: string): Promise<IntegrationConnectorSummary> {
    const connectors = await this.listConnectors(companyId);
    const connector = connectors.find((row) => row.id === connectorId);
    if (!connector) {
      throw new ConnectorEngineError('CONNECTOR_NOT_FOUND', 'Connector not found');
    }
    return connector;
  }

  createTraceId(): string {
    return randomUUID();
  }
}
