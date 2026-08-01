import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  CartrackConnectionSummary,
  CartrackSyncResult,
  FleetTrackingContext,
  IntegrationMappingStatus,
  IntegrationVehicleMappingSummary,
  SaveCartrackConnectionRequest,
  UpdateIntegrationVehicleMappingRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  gpsPositions,
  integrationConnections,
  integrationVehicleMappings,
  vehicles,
} from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import { CartrackClient, CartrackError } from '../lib/cartrack.client.js';
import { decryptCartrackCredentials, encryptCartrackCredentials } from '../lib/crypto.js';

import type { IntegrationHubService } from './integration-hub.service.js';

export class IntegrationsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationsError';
  }
}

type IntegrationsServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  hubService?: IntegrationHubService;
};

export class IntegrationsService {
  private onCartrackConnectedHook: ((input: { companyId: string }) => void | Promise<void>) | null =
    null;

  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
    private readonly hubService?: IntegrationHubService,
  ) {}

  static create(deps: IntegrationsServiceDeps): IntegrationsService {
    return new IntegrationsService(deps.db, deps.encryptionKey, deps.hubService);
  }

  setOnCartrackConnectedHook(
    hook: ((input: { companyId: string }) => void | Promise<void>) | null,
  ): void {
    this.onCartrackConnectedHook = hook;
  }

  async getCartrackConnection(companyId: string): Promise<CartrackConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);
    const counts = await this.getMappingCounts(companyId, connection.id);
    const [positionCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(gpsPositions)
      .where(eq(gpsPositions.companyId, companyId));

    const credentials = this.tryDecryptCredentials(connection.credentialsEncrypted);

    return {
      provider: 'cartrack',
      status: connection.status,
      baseUrl: connection.config.baseUrl ?? null,
      usernameHint: credentials?.username ? maskUsername(credentials.username) : null,
      hasCredentials: Boolean(connection.credentialsEncrypted),
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: connection.lastError,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      mappedVehicleCount: counts.mapped,
      unmappedVehicleCount: counts.unmapped,
      positionCount: positionCountRow?.count ?? 0,
    };
  }

  async saveCartrackConnection(
    companyId: string,
    input: SaveCartrackConnectionRequest,
  ): Promise<CartrackConnectionSummary> {
    this.ensureEncryptionKey();

    const baseUrl = input.baseUrl.trim();
    const username = input.username.trim();
    const password = input.password;

    if (!baseUrl) {
      throw new IntegrationsError('VALIDATION_ERROR', 'Cartrack base URL is required');
    }

    if (!username || !password) {
      throw new IntegrationsError(
        'VALIDATION_ERROR',
        'Cartrack username and password are required',
      );
    }

    const connection = await this.getOrCreateConnection(companyId);
    const client = new CartrackClient({ baseUrl, username, password });

    await this.db
      .update(integrationConnections)
      .set({
        status: 'pending',
        config: { baseUrl },
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));

    try {
      await client.testConnection();
    } catch (error) {
      const message = mapCartrackError(error);

      await this.db
        .update(integrationConnections)
        .set({
          status: 'error',
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));

      throw new IntegrationsError('CONNECTION_FAILED', message);
    }

    await this.db
      .update(integrationConnections)
      .set({
        status: 'connected',
        credentialsEncrypted: encryptCartrackCredentials(
          { username, password },
          this.encryptionKey!,
        ),
        config: { baseUrl },
        connectedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));

    if (this.onCartrackConnectedHook) {
      void Promise.resolve(this.onCartrackConnectedHook({ companyId })).catch((hookError) => {
        console.error('[integrations] Cartrack auto-sync hook failed', hookError);
      });
    }

    return this.getCartrackConnection(companyId);
  }

  async disconnectCartrack(companyId: string): Promise<CartrackConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);

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

    return this.getCartrackConnection(companyId);
  }

  async listCartrackMappings(companyId: string): Promise<IntegrationVehicleMappingSummary[]> {
    const connection = await this.getOrCreateConnection(companyId);

    const rows = await this.db.query.integrationVehicleMappings.findMany({
      where: and(
        eq(integrationVehicleMappings.companyId, companyId),
        eq(integrationVehicleMappings.integrationConnectionId, connection.id),
      ),
      with: { vehicle: true },
      orderBy: [desc(integrationVehicleMappings.updatedAt)],
    });

    return rows.map(toMappingSummary);
  }

  async updateCartrackMapping(
    companyId: string,
    mappingId: string,
    input: UpdateIntegrationVehicleMappingRequest,
  ): Promise<IntegrationVehicleMappingSummary> {
    const connection = await this.getOrCreateConnection(companyId);

    const existing = await this.db.query.integrationVehicleMappings.findFirst({
      where: and(
        eq(integrationVehicleMappings.id, mappingId),
        eq(integrationVehicleMappings.companyId, companyId),
        eq(integrationVehicleMappings.integrationConnectionId, connection.id),
      ),
    });

    if (!existing) {
      throw new IntegrationsError('NOT_FOUND', 'Vehicle mapping not found');
    }

    if (input.vehicleId) {
      await this.ensureVehicleBelongsToCompany(companyId, input.vehicleId);
    }

    const nextStatus = resolveMappingStatus(input, existing.status, input.vehicleId);

    const [updated] = await this.db
      .update(integrationVehicleMappings)
      .set({
        vehicleId: input.vehicleId === undefined ? existing.vehicleId : (input.vehicleId ?? null),
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(integrationVehicleMappings.id, mappingId))
      .returning();

    if (!updated) {
      throw new IntegrationsError('UPDATE_FAILED', 'Unable to update vehicle mapping');
    }

    const row = await this.db.query.integrationVehicleMappings.findFirst({
      where: eq(integrationVehicleMappings.id, mappingId),
      with: { vehicle: true },
    });

    if (!row) {
      throw new IntegrationsError('NOT_FOUND', 'Vehicle mapping not found');
    }

    return toMappingSummary(row);
  }

  async syncCartrack(companyId: string): Promise<CartrackSyncResult> {
    const connection = await this.requireConnectedConnection(companyId);
    const syncJobId = await this.hubService?.startSyncJob({
      companyId,
      provider: 'cartrack',
      integrationConnectionId: connection.id,
      jobType: 'manual',
    });

    const client = this.createClient(connection);
    const companyVehicles = await this.db.query.vehicles.findMany({
      where: eq(vehicles.companyId, companyId),
    });

    const externalVehicles = await client.fetchVehicles();
    let mappingsCreated = 0;
    let mappingsUpdated = 0;
    let autoMappedCount = 0;

    for (const externalVehicle of externalVehicles) {
      const existing = await this.db.query.integrationVehicleMappings.findFirst({
        where: and(
          eq(integrationVehicleMappings.integrationConnectionId, connection.id),
          eq(integrationVehicleMappings.externalVehicleId, externalVehicle.externalVehicleId),
        ),
      });

      const matchedVehicle = findVehicleByRegistration(
        companyVehicles,
        externalVehicle.externalRegistration,
      );

      if (existing) {
        const shouldAutoMap =
          !existing.vehicleId && existing.status === 'unmapped' && matchedVehicle !== null;

        await this.db
          .update(integrationVehicleMappings)
          .set({
            externalRegistration: externalVehicle.externalRegistration,
            externalName: externalVehicle.externalName,
            lastSeenAt: new Date(),
            vehicleId: shouldAutoMap ? matchedVehicle!.id : existing.vehicleId,
            status: shouldAutoMap ? 'mapped' : existing.status,
            updatedAt: new Date(),
          })
          .where(eq(integrationVehicleMappings.id, existing.id));

        mappingsUpdated += 1;

        if (shouldAutoMap) {
          autoMappedCount += 1;
        }

        continue;
      }

      const autoMappedVehicle = matchedVehicle;

      await this.db.insert(integrationVehicleMappings).values({
        companyId,
        integrationConnectionId: connection.id,
        externalVehicleId: externalVehicle.externalVehicleId,
        externalRegistration: externalVehicle.externalRegistration,
        externalName: externalVehicle.externalName,
        vehicleId: autoMappedVehicle?.id ?? null,
        status: autoMappedVehicle ? 'mapped' : 'unmapped',
        lastSeenAt: new Date(),
      });

      mappingsCreated += 1;

      if (autoMappedVehicle) {
        autoMappedCount += 1;
      }
    }

    const mappings = await this.db.query.integrationVehicleMappings.findMany({
      where: eq(integrationVehicleMappings.integrationConnectionId, connection.id),
    });

    const mappingByExternalId = new Map(
      mappings.map((mapping) => [mapping.externalVehicleId, mapping]),
    );

    let positionsStored = 0;

    try {
      const statuses = await client.fetchVehicleStatuses();

      for (const status of statuses) {
        const mapping = mappingByExternalId.get(status.externalVehicleId);

        if (!mapping || mapping.status !== 'mapped' || !mapping.vehicleId) {
          continue;
        }

        await this.db.insert(gpsPositions).values({
          companyId,
          vehicleId: mapping.vehicleId,
          integrationConnectionId: connection.id,
          externalVehicleId: status.externalVehicleId,
          latitude: status.latitude,
          longitude: status.longitude,
          speedKmh: status.speedKmh,
          heading: status.heading,
          recordedAt: status.recordedAt,
          rawPayload: status.raw,
        });

        emitBusinessEvent({
          companyId,
          eventType: 'gps.event',
          entityType: 'vehicle',
          entityId: mapping.vehicleId,
          payload: {
            vehicle: { id: mapping.vehicleId },
            gps: {
              latitude: status.latitude,
              longitude: status.longitude,
              speedKmh: status.speedKmh,
              recordedAt: status.recordedAt.toISOString(),
            },
          },
        });

        positionsStored += 1;
      }
    } catch (error) {
      const message = mapCartrackError(error);

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

      throw new IntegrationsError('SYNC_FAILED', message);
    }

    const syncedAt = new Date();

    await this.db
      .update(integrationConnections)
      .set({
        lastSyncAt: syncedAt,
        lastError: null,
        updatedAt: syncedAt,
      })
      .where(eq(integrationConnections.id, connection.id));

    const result = {
      externalVehicleCount: externalVehicles.length,
      mappingsCreated,
      mappingsUpdated,
      autoMappedCount,
      positionsStored,
      syncedAt: syncedAt.toISOString(),
      syncJobId,
    };

    if (syncJobId) {
      await this.hubService?.completeSyncJob(syncJobId, {
        status: 'completed',
        resultSummary: {
          externalVehicleCount: result.externalVehicleCount,
          mappingsCreated: result.mappingsCreated,
          mappingsUpdated: result.mappingsUpdated,
          autoMappedCount: result.autoMappedCount,
          positionsStored: result.positionsStored,
          syncedAt: result.syncedAt,
        },
      });
    }

    return result;
  }

  async buildFleetTrackingContext(companyId: string): Promise<FleetTrackingContext> {
    const connection = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'cartrack'),
      ),
    });

    if (!connection) {
      return emptyTrackingContext();
    }

    const counts = await this.getMappingCounts(companyId, connection.id);

    const [positionCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(gpsPositions)
      .where(eq(gpsPositions.companyId, companyId));

    const latestRows = await this.db.query.gpsPositions.findMany({
      where: eq(gpsPositions.companyId, companyId),
      with: { vehicle: true },
      orderBy: [desc(gpsPositions.recordedAt)],
      limit: 10,
    });

    return {
      cartrackStatus: connection.status,
      cartrackConnected: connection.status === 'connected',
      mappedVehicleCount: counts.mapped,
      unmappedVehicleCount: counts.unmapped,
      positionCount: positionCountRow?.count ?? 0,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      latestPositions: latestRows.map((row) => ({
        vehicleId: row.vehicleId,
        vehicleName: row.vehicle?.name ?? null,
        licensePlate: row.vehicle?.licensePlate ?? row.externalVehicleId,
        externalVehicleId: row.externalVehicleId,
        latitude: row.latitude,
        longitude: row.longitude,
        speedKmh: row.speedKmh,
        recordedAt: row.recordedAt.toISOString(),
      })),
    };
  }

  private async getOrCreateConnection(companyId: string) {
    const existing = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'cartrack'),
      ),
    });

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(integrationConnections)
      .values({
        companyId,
        provider: 'cartrack',
        status: 'disconnected',
      })
      .returning();

    if (!created) {
      throw new IntegrationsError('CREATE_FAILED', 'Unable to initialize Cartrack connection');
    }

    return created;
  }

  private async requireConnectedConnection(companyId: string) {
    const connection = await this.getOrCreateConnection(companyId);

    if (connection.status !== 'connected' || !connection.credentialsEncrypted) {
      throw new IntegrationsError(
        'NOT_CONNECTED',
        'Cartrack is not connected. Save valid credentials before syncing.',
      );
    }

    return connection;
  }

  private createClient(connection: typeof integrationConnections.$inferSelect) {
    this.ensureEncryptionKey();

    const credentials = decryptCartrackCredentials(
      connection.credentialsEncrypted!,
      this.encryptionKey!,
    );

    const baseUrl = connection.config.baseUrl;

    if (!baseUrl) {
      throw new IntegrationsError(
        'CONFIG_ERROR',
        'Cartrack base URL is missing from connection config',
      );
    }

    return new CartrackClient({
      baseUrl,
      username: credentials.username,
      password: credentials.password,
    });
  }

  private tryDecryptCredentials(payload: string | null) {
    if (!payload || !this.encryptionKey) {
      return null;
    }

    try {
      return decryptCartrackCredentials(payload, this.encryptionKey);
    } catch {
      return null;
    }
  }

  private ensureEncryptionKey() {
    if (!this.encryptionKey) {
      throw new IntegrationsError(
        'ENCRYPTION_NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before storing integration credentials',
      );
    }
  }

  private async getMappingCounts(companyId: string, connectionId: string) {
    const rows = await this.db
      .select({
        status: integrationVehicleMappings.status,
        count: sql<number>`count(*)::int`,
      })
      .from(integrationVehicleMappings)
      .where(
        and(
          eq(integrationVehicleMappings.companyId, companyId),
          eq(integrationVehicleMappings.integrationConnectionId, connectionId),
        ),
      )
      .groupBy(integrationVehicleMappings.status);

    const counts = Object.fromEntries(rows.map((row) => [row.status, row.count]));

    return {
      mapped: counts.mapped ?? 0,
      unmapped: counts.unmapped ?? 0,
      ignored: counts.ignored ?? 0,
    };
  }

  private async ensureVehicleBelongsToCompany(companyId: string, vehicleId: string) {
    const vehicle = await this.db.query.vehicles.findFirst({
      where: and(eq(vehicles.id, vehicleId), eq(vehicles.companyId, companyId)),
    });

    if (!vehicle) {
      throw new IntegrationsError('VEHICLE_NOT_FOUND', 'Vehicle not found');
    }
  }
}

function toMappingSummary(
  row: typeof integrationVehicleMappings.$inferSelect & {
    vehicle: typeof vehicles.$inferSelect | null;
  },
): IntegrationVehicleMappingSummary {
  return {
    id: row.id,
    externalVehicleId: row.externalVehicleId,
    externalRegistration: row.externalRegistration,
    externalName: row.externalName,
    status: row.status,
    vehicleId: row.vehicleId,
    vehicleName: row.vehicle?.name ?? null,
    vehicleLicensePlate: row.vehicle?.licensePlate ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resolveMappingStatus(
  input: UpdateIntegrationVehicleMappingRequest,
  currentStatus: IntegrationMappingStatus,
  vehicleId: string | null | undefined,
): IntegrationMappingStatus {
  if (input.status) {
    return input.status;
  }

  if (vehicleId === undefined) {
    return currentStatus;
  }

  if (!vehicleId) {
    return 'unmapped';
  }

  return 'mapped';
}

function findVehicleByRegistration(
  companyVehicles: Array<typeof vehicles.$inferSelect>,
  registration: string | null,
) {
  if (!registration) {
    return null;
  }

  const normalized = registration.trim().toLowerCase();

  return (
    companyVehicles.find((vehicle) => vehicle.licensePlate.trim().toLowerCase() === normalized) ??
    null
  );
}

function maskUsername(username: string): string {
  if (username.length <= 2) {
    return `${username[0] ?? '*'}*`;
  }

  return `${username.slice(0, 2)}${'*'.repeat(Math.max(username.length - 2, 3))}`;
}

function mapCartrackError(error: unknown): string {
  if (error instanceof CartrackError) {
    return error.message;
  }

  if (error instanceof IntegrationsError) {
    return error.message;
  }

  return error instanceof Error ? error.message : 'Cartrack request failed';
}

function emptyTrackingContext(): FleetTrackingContext {
  return {
    cartrackStatus: 'disconnected',
    cartrackConnected: false,
    mappedVehicleCount: 0,
    unmappedVehicleCount: 0,
    positionCount: 0,
    lastSyncAt: null,
    latestPositions: [],
  };
}
