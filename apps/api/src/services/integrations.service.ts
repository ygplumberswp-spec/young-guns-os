import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type {
  CartrackConnectionSummary,
  CartrackSyncResult,
  FleetCapabilityReason,
  FleetOwnerDriversResponse,
  FleetOwnerEventsResponse,
  FleetOwnerTripsResponse,
  FleetTrackingContext,
  IntegrationMappingStatus,
  IntegrationSyncHealth,
  IntegrationVehicleMappingSummary,
  SaveCartrackConnectionRequest,
  UpdateIntegrationVehicleMappingRequest,
  ValidateCartrackCredentialsResult,
} from '@titan/shared';
import {
  deriveMappingReviewCategory,
  INTEGRATION_MAPPING_REVIEW_LABELS,
  matchVehicleByRegistration,
  resolveFleetDisplayState,
  buildJobAddressDisplay,
  type FleetJobLink,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  gpsPositions,
  integrationConnections,
  integrationSyncSchedules,
  integrationVehicleMappings,
  jobs,
  securityAuditLogs,
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

type SaveCartrackActor = {
  userId: string;
};

type IntegrationsServiceDeps = {
  db: DatabaseClient;
  encryptionKey?: string;
  hubService?: IntegrationHubService;
};

export class IntegrationsService {
  private onCartrackConnectedHook: ((input: { companyId: string }) => void | Promise<void>) | null =
    null;
  private readonly cartrackSyncLocks = new Set<string>();

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
    const nextScheduledSyncAt = await this.getNextCartrackScheduledSyncAt(companyId);

    return {
      provider: 'cartrack',
      status: connection.status,
      baseUrl: connection.config.baseUrl ?? null,
      usernameHint: credentials?.username ? maskUsername(credentials.username) : null,
      hasCredentials: Boolean(connection.credentialsEncrypted),
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: connection.lastError,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      lastCredentialChangeAt: connection.config.lastCredentialChangeAt ?? null,
      nextScheduledSyncAt,
      syncHealth: deriveCartrackSyncHealth(connection),
      mappedVehicleCount: counts.mapped,
      unmappedVehicleCount: counts.unmapped,
      positionCount: positionCountRow?.count ?? 0,
    };
  }

  async validateCartrackCredentials(
    input: SaveCartrackConnectionRequest,
  ): Promise<ValidateCartrackCredentialsResult> {
    const baseUrl = input.baseUrl.trim();
    const username = input.username.trim();
    const password = input.password;

    if (!baseUrl || !username || !password) {
      return {
        valid: false,
        message: 'Cartrack base URL, username, and password are required.',
      };
    }

    const client = new CartrackClient({ baseUrl, username, password });

    try {
      await client.testConnection();
      return {
        valid: true,
        message: 'Cartrack credentials verified successfully.',
      };
    } catch (error) {
      return {
        valid: false,
        message: mapCartrackError(error),
      };
    }
  }

  async verifyStoredCartrackConnection(companyId: string): Promise<CartrackConnectionSummary> {
    const connection = await this.getOrCreateConnection(companyId);

    if (!connection.credentialsEncrypted) {
      throw new IntegrationsError(
        'NOT_CONNECTED',
        'Cartrack credentials are not stored for this company.',
      );
    }

    const client = this.createClient(connection);

    try {
      await client.testConnection();
    } catch (error) {
      const message = mapCartrackError(error);
      await this.db
        .update(integrationConnections)
        .set({
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
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));

    return this.getCartrackConnection(companyId);
  }

  async saveCartrackConnection(
    companyId: string,
    input: SaveCartrackConnectionRequest,
    actor?: SaveCartrackActor,
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
    const isCredentialReplace =
      Boolean(connection.credentialsEncrypted) &&
      (connection.status === 'connected' || connection.status === 'error');

    const client = new CartrackClient({ baseUrl, username, password });

    if (!isCredentialReplace) {
      await this.db
        .update(integrationConnections)
        .set({
          status: 'pending',
          config: { baseUrl },
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));
    }

    try {
      await client.testConnection();
    } catch (error) {
      const message = mapCartrackError(error);

      if (isCredentialReplace) {
        await this.db
          .update(integrationConnections)
          .set({
            lastError: message,
            updatedAt: new Date(),
          })
          .where(eq(integrationConnections.id, connection.id));
      } else {
        await this.db
          .update(integrationConnections)
          .set({
            status: 'error',
            lastError: message,
            updatedAt: new Date(),
          })
          .where(eq(integrationConnections.id, connection.id));
      }

      throw new IntegrationsError('CONNECTION_FAILED', message);
    }

    const credentialChangedAt = new Date().toISOString();

    await this.db
      .update(integrationConnections)
      .set({
        status: 'connected',
        credentialsEncrypted: encryptCartrackCredentials(
          { username, password },
          this.encryptionKey!,
        ),
        config: {
          baseUrl,
          lastCredentialChangeAt: credentialChangedAt,
        },
        connectedAt: connection.connectedAt ?? new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));

    if (actor?.userId) {
      await this.recordConnectionAudit(companyId, actor.userId, 'cartrack_credentials_saved', {
        action: isCredentialReplace ? 'replace' : 'connect',
        usernameHint: maskUsername(username),
      });
    }

    if (this.onCartrackConnectedHook) {
      void Promise.resolve(this.onCartrackConnectedHook({ companyId })).catch((hookError) => {
        console.error('[integrations] Cartrack auto-sync hook failed', hookError);
      });
    }

    return this.getCartrackConnection(companyId);
  }

  async replaceCartrackCredentials(
    companyId: string,
    input: SaveCartrackConnectionRequest,
    actor: SaveCartrackActor,
  ): Promise<CartrackConnectionSummary> {
    return this.saveCartrackConnection(companyId, input, actor);
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
    const companyVehicles = await this.db.query.vehicles.findMany({
      where: eq(vehicles.companyId, companyId),
    });

    const rows = await this.db.query.integrationVehicleMappings.findMany({
      where: and(
        eq(integrationVehicleMappings.companyId, companyId),
        eq(integrationVehicleMappings.integrationConnectionId, connection.id),
      ),
      with: { vehicle: true },
      orderBy: [desc(integrationVehicleMappings.updatedAt)],
    });

    return rows.map((row) => toMappingSummary(row, companyVehicles));
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

    return toMappingSummary(row, await this.db.query.vehicles.findMany({
      where: eq(vehicles.companyId, companyId),
    }));
  }

  async syncCartrack(companyId: string): Promise<CartrackSyncResult> {
    if (this.cartrackSyncLocks.has(companyId)) {
      throw new IntegrationsError('SYNC_IN_PROGRESS', 'Cartrack sync already in progress');
    }

    this.cartrackSyncLocks.add(companyId);

    try {
      return await this.runCartrackSync(companyId);
    } finally {
      this.cartrackSyncLocks.delete(companyId);
    }
  }

  async probeCartrackReadPermissions(companyId: string) {
    const connection = await this.requireConnectedConnection(companyId);
    const client = this.createClient(connection);
    return client.probeReadPermissions();
  }

  private async runCartrackSync(companyId: string): Promise<CartrackSyncResult> {
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

      const match = matchVehicleByRegistration(
        companyVehicles,
        externalVehicle.externalRegistration,
      );

      if (existing) {
        const shouldAutoMap =
          !existing.vehicleId && existing.status === 'unmapped' && match.kind === 'unique';

        await this.db
          .update(integrationVehicleMappings)
          .set({
            externalRegistration: externalVehicle.externalRegistration,
            externalName: externalVehicle.externalName,
            lastSeenAt: new Date(),
            vehicleId: shouldAutoMap ? match.vehicleId : existing.vehicleId,
            status: shouldAutoMap ? 'mapped' : existing.status,
            updatedAt: new Date(),
          })
          .where(eq(integrationVehicleMappings.id, existing.id));

        mappingsUpdated += 1;

        if (shouldAutoMap) {
          autoMappedCount += 1;
          await this.recordAutoMappingAudit(companyId, {
            externalVehicleId: externalVehicle.externalVehicleId,
            externalRegistration: externalVehicle.externalRegistration,
            vehicleId: match.vehicleId,
          });
        }

        continue;
      }

      const autoMappedVehicleId = match.kind === 'unique' ? match.vehicleId : null;

      await this.db.insert(integrationVehicleMappings).values({
        companyId,
        integrationConnectionId: connection.id,
        externalVehicleId: externalVehicle.externalVehicleId,
        externalRegistration: externalVehicle.externalRegistration,
        externalName: externalVehicle.externalName,
        vehicleId: autoMappedVehicleId,
        status: autoMappedVehicleId ? 'mapped' : 'unmapped',
        lastSeenAt: new Date(),
      });

      mappingsCreated += 1;

      if (autoMappedVehicleId) {
        autoMappedCount += 1;
        await this.recordAutoMappingAudit(companyId, {
          externalVehicleId: externalVehicle.externalVehicleId,
          externalRegistration: externalVehicle.externalRegistration,
          vehicleId: autoMappedVehicleId,
        });
      }
    }

    const mappings = await this.db.query.integrationVehicleMappings.findMany({
      where: eq(integrationVehicleMappings.integrationConnectionId, connection.id),
    });

    const mappingByExternalId = new Map(
      mappings.map((mapping) => [mapping.externalVehicleId, mapping]),
    );
    const mappingByRegistration = new Map<string, (typeof mappings)[number]>();

    for (const mapping of mappings) {
      const normalized = normalizeRegistrationKey(mapping.externalRegistration);
      if (normalized) {
        mappingByRegistration.set(normalized, mapping);
      }
    }

    let positionsStored = 0;

    try {
      const statuses = await client.fetchVehicleStatuses();

      for (const status of statuses) {
        const mapping = resolveCartrackVehicleMapping(
          status,
          mappingByExternalId,
          mappingByRegistration,
        );

        if (!mapping || mapping.status !== 'mapped' || !mapping.vehicleId) {
          continue;
        }

        const stored = await this.storeGpsPositionIfFresh({
          companyId,
          connectionId: connection.id,
          vehicleId: mapping.vehicleId,
          status,
        });

        if (!stored) {
          continue;
        }

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

  private async storeGpsPositionIfFresh(input: {
    companyId: string;
    connectionId: string;
    vehicleId: string;
    status: import('../lib/cartrack.client.js').CartrackVehicleStatusRecord;
  }): Promise<boolean> {
    const [latestExisting] = await this.db.query.gpsPositions.findMany({
      where: and(
        eq(gpsPositions.companyId, input.companyId),
        eq(gpsPositions.vehicleId, input.vehicleId),
      ),
      orderBy: [desc(gpsPositions.recordedAt)],
      limit: 1,
    });

    if (latestExisting) {
      if (latestExisting.recordedAt >= input.status.recordedAt) {
        return false;
      }

      const sameSnapshot =
        latestExisting.latitude === input.status.latitude &&
        latestExisting.longitude === input.status.longitude &&
        latestExisting.speedKmh === input.status.speedKmh &&
        Math.abs(latestExisting.recordedAt.getTime() - input.status.recordedAt.getTime()) < 30_000;

      if (sameSnapshot) {
        return false;
      }
    }

    await this.db.insert(gpsPositions).values({
      companyId: input.companyId,
      vehicleId: input.vehicleId,
      integrationConnectionId: input.connectionId,
      externalVehicleId: input.status.externalVehicleId,
      latitude: input.status.latitude,
      longitude: input.status.longitude,
      speedKmh: input.status.speedKmh,
      heading: input.status.heading,
      recordedAt: input.status.recordedAt,
      rawPayload: input.status.raw,
    });

    return true;
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
      .select({ count: sql<number>`count(distinct ${gpsPositions.vehicleId})::int` })
      .from(gpsPositions)
      .where(eq(gpsPositions.companyId, companyId));

    const latestRows = await this.db.query.gpsPositions.findMany({
      where: eq(gpsPositions.companyId, companyId),
      with: { vehicle: true },
      orderBy: [desc(gpsPositions.recordedAt)],
      limit: 50,
    });

    const latestByVehicle = new Map<string, (typeof latestRows)[number]>();
    for (const row of latestRows) {
      if (!row.vehicleId || latestByVehicle.has(row.vehicleId)) {
        continue;
      }
      latestByVehicle.set(row.vehicleId, row);
    }

    return {
      cartrackStatus: connection.status,
      cartrackConnected: connection.status === 'connected',
      mappedVehicleCount: counts.mapped,
      unmappedVehicleCount: counts.unmapped,
      positionCount: positionCountRow?.count ?? 0,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      latestPositions: [...latestByVehicle.values()].map((row) => ({
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

  async buildFleetLiveMapSnapshot(companyId: string) {
    const tracking = await this.buildFleetTrackingContext(companyId);
    const connection = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'cartrack'),
      ),
    });

    if (!connection) {
      return {
        tracking,
        vehicles: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const todaysJobRows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        gte(jobs.scheduledAt, startOfDay),
        sql`${jobs.scheduledAt} < ${endOfDay}`,
      ),
      with: { assignedUser: true, customer: true },
      orderBy: [asc(jobs.scheduledAt)],
    });

    const todaysJobs = todaysJobRows.map((job) => ({
      id: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      status: job.status,
      scheduledAt: job.scheduledAt,
      addressDisplay:
        buildJobAddressDisplay({
          street: job.snapshotStreet,
          suburb: job.snapshotSuburb,
          city: job.snapshotCity,
          province: job.snapshotProvince,
          postalCode: job.snapshotPostalCode,
          unit: job.snapshotUnit,
        }) ?? null,
      assignedUserId: job.assignedUserId,
      assignedUserName: job.assignedUser
        ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`.trim()
        : null,
      customerName: job.snapshotCustomerName ?? job.customer?.name ?? null,
    }));

    const jobsByAssignee = new Map<string, typeof todaysJobs>();
    for (const job of todaysJobs) {
      if (!job.assignedUserId) continue;
      const list = jobsByAssignee.get(job.assignedUserId) ?? [];
      list.push(job);
      jobsByAssignee.set(job.assignedUserId, list);
    }

    const mappings = await this.db.query.integrationVehicleMappings.findMany({
      where: and(
        eq(integrationVehicleMappings.companyId, companyId),
        eq(integrationVehicleMappings.integrationConnectionId, connection.id),
        eq(integrationVehicleMappings.status, 'mapped'),
      ),
      with: { vehicle: true },
    });

    const vehicles = await Promise.all(
      mappings
        .filter((mapping) => mapping.vehicleId)
        .map(async (mapping) => {
          const vehicleId = mapping.vehicleId!;
          const latest = tracking.latestPositions.find((row) => row.vehicleId === vehicleId) ?? null;

          const trailRows = await this.db.query.gpsPositions.findMany({
            where: and(
              eq(gpsPositions.companyId, companyId),
              eq(gpsPositions.vehicleId, vehicleId),
              gte(gpsPositions.recordedAt, startOfDay),
            ),
            orderBy: [desc(gpsPositions.recordedAt)],
            limit: 200,
          });

          const rawPayload =
            trailRows[0]?.rawPayload && typeof trailRows[0].rawPayload === 'object'
              ? (trailRows[0].rawPayload as Record<string, unknown>)
              : null;

          const speedKmh = latest?.speedKmh ?? null;
          const ignitionOn = readBoolean(rawPayload, ['ignition_on', 'ignitionOn']);
          const hasPosition = Boolean(latest);
          const movementState = deriveMovementState({ speedKmh, ignitionOn, hasPosition });
          const stale =
            !latest?.recordedAt ||
            Date.now() - new Date(latest.recordedAt).getTime() > 120_000;
          const isTrackerOffline = !hasPosition;

          const assigneeJobs = mapping.vehicle?.assignedUserId
            ? jobsByAssignee.get(mapping.vehicle.assignedUserId) ?? []
            : [];
          const activeJob =
            assigneeJobs.find((job) => job.status === 'in_progress') ??
            assigneeJobs.find((job) => job.status === 'scheduled') ??
            null;
          const nextJob =
            assigneeJobs.find(
              (job) =>
                job.id !== activeJob?.id &&
                (job.status === 'scheduled' || job.status === 'new'),
            ) ?? null;

          const toJobLink = (
            job: (typeof todaysJobs)[number] | null,
            role: FleetJobLink['role'],
          ): FleetJobLink | null => {
            if (!job) return null;
            return {
              jobId: job.id,
              jobNumber: job.jobNumber,
              title: job.title,
              customerName: job.customerName,
              assignedUserId: job.assignedUserId,
              assignedUserName: job.assignedUserName,
              scheduledAt: job.scheduledAt?.toISOString() ?? null,
              addressDisplay: job.addressDisplay,
              status: job.status,
              role,
            };
          };

          const odometerKm = readNumber(rawPayload, [
            'odometer_km',
            'odometerKm',
            'odometer',
            'Odometer',
          ]);
          const fuelPercent = readNumber(rawPayload, [
            'fuel_percent',
            'fuelPercent',
            'fuel_level',
            'fuelLevel',
          ]);

          const todayDistanceKm = computeTrailDistanceKm(trailRows);
          const tripStartedAt =
            trailRows.length > 0
              ? trailRows[trailRows.length - 1]?.recordedAt.toISOString()
              : null;

          const driverName =
            readString(rawPayload, ['driver_name', 'driverName']) ??
            mapping.vehicle?.assignedUserId
              ? todaysJobs.find((j) => j.assignedUserId === mapping.vehicle?.assignedUserId)
                  ?.assignedUserName ?? null
              : null;

          return {
            vehicleId,
            name: mapping.vehicle?.name ?? null,
            registration: mapping.vehicle?.licensePlate ?? mapping.externalRegistration,
            driverName,
            technicianName: mapping.vehicle?.assignedUserId
              ? todaysJobs.find((j) => j.assignedUserId === mapping.vehicle?.assignedUserId)
                  ?.assignedUserName ?? null
              : null,
            latitude: latest?.latitude ?? null,
            longitude: latest?.longitude ?? null,
            speedKmh,
            heading: typeof trailRows[0]?.heading === 'number' ? trailRows[0]?.heading : null,
            ignitionOn,
            movementState,
            displayState: resolveFleetDisplayState({
              movementState,
              ignitionOn,
              isStale: stale,
              hasPosition,
            }),
            recordedAt: latest?.recordedAt ?? null,
            address: readString(rawPayload, ['address', 'Address']),
            isStale: stale,
            isTrackerOffline,
            odometerKm,
            fuelPercent,
            todayDistanceKm,
            tripStartedAt,
            externalTrackerId: mapping.externalVehicleId,
            currentJob: toJobLink(activeJob, 'current'),
            nextJob: toJobLink(nextJob, 'next'),
            trailToday: trailRows
              .slice()
              .reverse()
              .map((point) => ({
                latitude: point.latitude,
                longitude: point.longitude,
                recordedAt: point.recordedAt.toISOString(),
              })),
          };
        }),
    );

    return {
      tracking,
      vehicles,
      generatedAt: new Date().toISOString(),
    };
  }

  async buildFleetTrips(companyId: string, from: Date, _to: Date): Promise<FleetOwnerTripsResponse> {
    const capability = await this.resolveFleetCapability(companyId);
    if (capability !== 'available') {
      return { trips: [], capability, generatedAt: new Date().toISOString() };
    }

    const snapshot = await this.buildFleetLiveMapSnapshot(companyId);
    const trips = snapshot.vehicles
      .filter((vehicle) => vehicle.trailToday.length >= 2)
      .map((vehicle) => {
        const trail = vehicle.trailToday;
        const start = trail[0]!;
        const end = trail[trail.length - 1]!;
        return {
          id: `${vehicle.vehicleId}:${from.toISOString().slice(0, 10)}`,
          vehicleId: vehicle.vehicleId,
          vehicleName: vehicle.name,
          registration: vehicle.registration,
          driverName: vehicle.driverName,
          startedAt: start.recordedAt,
          endedAt: end.recordedAt,
          startArea: vehicle.address,
          endArea: vehicle.address,
          distanceKm: vehicle.todayDistanceKm,
          drivingMinutes: null,
          idleMinutes: null,
          linkedJobId: vehicle.currentJob?.jobId ?? null,
          linkedJobTitle: vehicle.currentJob?.title ?? null,
          pointCount: trail.length,
        };
      });

    return { trips, capability, generatedAt: new Date().toISOString() };
  }

  async buildFleetDrivers(companyId: string): Promise<FleetOwnerDriversResponse> {
    const capability = await this.resolveFleetCapability(companyId);
    if (capability !== 'available') {
      return { drivers: [], capability, generatedAt: new Date().toISOString() };
    }

    const snapshot = await this.buildFleetLiveMapSnapshot(companyId);
    const byDriver = new Map<string, (typeof snapshot.vehicles)[number]>();

    for (const vehicle of snapshot.vehicles) {
      const key = vehicle.driverName?.trim() || vehicle.technicianName?.trim();
      if (!key) continue;
      if (!byDriver.has(key)) {
        byDriver.set(key, vehicle);
      }
    }

    const drivers = [...byDriver.entries()].map(([driverName, vehicle]) => ({
      driverId: vehicle.externalTrackerId,
      driverName,
      assignedVehicleId: vehicle.vehicleId,
      assignedVehicleRegistration: vehicle.registration,
      linkedVehicleId: vehicle.vehicleId,
      status: vehicle.displayState,
      todayDistanceKm: vehicle.todayDistanceKm,
      currentJob: vehicle.currentJob,
      lastPositionAt: vehicle.recordedAt,
      lastArea: vehicle.address,
    }));

    return { drivers, capability, generatedAt: new Date().toISOString() };
  }

  async buildFleetEvents(companyId: string): Promise<FleetOwnerEventsResponse> {
    const capability = await this.resolveFleetCapability(companyId);
    if (capability !== 'available') {
      return { events: [], capability, generatedAt: new Date().toISOString() };
    }

    const snapshot = await this.buildFleetLiveMapSnapshot(companyId);
    const events = snapshot.vehicles.flatMap((vehicle) => {
      const items = [];
      if (vehicle.isStale) {
        items.push({
          id: `stale:${vehicle.vehicleId}`,
          vehicleId: vehicle.vehicleId,
          registration: vehicle.registration,
          driverName: vehicle.driverName,
          eventType: 'gps_stale',
          severity: 'warning' as const,
          occurredAt: vehicle.recordedAt ?? new Date().toISOString(),
          description: 'GPS position exceeds 2 minute freshness threshold',
          acknowledged: false,
          linkedJobId: vehicle.currentJob?.jobId ?? null,
        });
      }
      if (vehicle.isTrackerOffline) {
        items.push({
          id: `offline:${vehicle.vehicleId}`,
          vehicleId: vehicle.vehicleId,
          registration: vehicle.registration,
          driverName: vehicle.driverName,
          eventType: 'tracker_offline',
          severity: 'critical' as const,
          occurredAt: new Date().toISOString(),
          description: 'No GPS position received from Cartrack for mapped vehicle',
          acknowledged: false,
          linkedJobId: null,
        });
      }
      if (vehicle.displayState === 'driving' && (vehicle.speedKmh ?? 0) > 120) {
        items.push({
          id: `speed:${vehicle.vehicleId}:${vehicle.recordedAt}`,
          vehicleId: vehicle.vehicleId,
          registration: vehicle.registration,
          driverName: vehicle.driverName,
          eventType: 'speeding',
          severity: 'warning' as const,
          occurredAt: vehicle.recordedAt ?? new Date().toISOString(),
          description: `Speed ${Math.round(vehicle.speedKmh ?? 0)} km/h reported by Cartrack`,
          acknowledged: false,
          linkedJobId: vehicle.currentJob?.jobId ?? null,
        });
      }
      return items;
    });

    return { events, capability, generatedAt: new Date().toISOString() };
  }

  private async resolveFleetCapability(companyId: string): Promise<FleetCapabilityReason> {
    const connection = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'cartrack'),
      ),
    });

    if (!connection?.credentialsEncrypted) {
      return 'not_connected';
    }
    if (connection.status !== 'connected') {
      return 'temporarily_unavailable';
    }
    return 'available';
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

    if (!connection.credentialsEncrypted) {
      throw new IntegrationsError(
        'NOT_CONNECTED',
        'Cartrack is not connected. Save valid credentials before syncing.',
      );
    }

    if (
      connection.status !== 'connected' &&
      connection.status !== 'error' &&
      connection.status !== 'pending'
    ) {
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

  private async getNextCartrackScheduledSyncAt(companyId: string): Promise<string | null> {
    const schedule = await this.db.query.integrationSyncSchedules.findFirst({
      where: and(
        eq(integrationSyncSchedules.companyId, companyId),
        eq(integrationSyncSchedules.enabled, true),
      ),
      orderBy: [desc(integrationSyncSchedules.nextRunAt)],
    });

    return schedule?.nextRunAt?.toISOString() ?? null;
  }

  private async recordConnectionAudit(
    companyId: string,
    userId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId,
      category: 'integrations',
      action,
      entityType: 'integration_connection',
      entityId: null,
      userId,
      metadata,
    });
  }

  private async recordAutoMappingAudit(
    companyId: string,
    metadata: {
      externalVehicleId: string;
      externalRegistration: string | null;
      vehicleId: string;
    },
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId,
      category: 'integrations',
      action: 'cartrack_vehicle_auto_mapped',
      entityType: 'integration_vehicle_mapping',
      entityId: metadata.vehicleId,
      userId: null,
      metadata,
    });
  }
}

function toMappingSummary(
  row: typeof integrationVehicleMappings.$inferSelect & {
    vehicle: typeof vehicles.$inferSelect | null;
  },
  companyVehicles: Array<typeof vehicles.$inferSelect>,
): IntegrationVehicleMappingSummary {
  const match = matchVehicleByRegistration(companyVehicles, row.externalRegistration);
  const reviewCategory = deriveMappingReviewCategory({
    status: row.status,
    vehicleId: row.vehicleId,
    match,
  });

  return {
    id: row.id,
    externalVehicleId: row.externalVehicleId,
    externalRegistration: row.externalRegistration,
    externalName: row.externalName,
    status: row.status,
    reviewCategory,
    reviewLabel: INTEGRATION_MAPPING_REVIEW_LABELS[reviewCategory],
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

function deriveCartrackSyncHealth(
  connection: typeof integrationConnections.$inferSelect,
): IntegrationSyncHealth {
  if (connection.status === 'connected' && !connection.lastError) {
    return 'healthy';
  }

  if (connection.status === 'connected' && connection.lastError) {
    return 'degraded';
  }

  if (connection.status === 'error') {
    return 'failed';
  }

  return 'unknown';
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

function normalizeRegistrationKey(registration: string | null | undefined): string | null {
  if (!registration) {
    return null;
  }

  const normalized = registration.trim().toLowerCase().replace(/[\s\-_/]/g, '');
  return normalized || null;
}

function resolveCartrackVehicleMapping(
  status: import('../lib/cartrack.client.js').CartrackVehicleStatusRecord,
  mappingByExternalId: Map<string, { status: string; vehicleId: string | null }>,
  mappingByRegistration: Map<string, { status: string; vehicleId: string | null }>,
) {
  const byId = mappingByExternalId.get(status.externalVehicleId);
  if (byId) {
    return byId;
  }

  const normalizedRegistration = normalizeRegistrationKey(status.externalRegistration);
  if (normalizedRegistration) {
    return mappingByRegistration.get(normalizedRegistration) ?? null;
  }

  return null;
}

function deriveMovementState(input: {
  speedKmh: number | null;
  ignitionOn: boolean | null;
  hasPosition: boolean;
}): 'moving' | 'parked' | 'idling' | 'off_duty' | 'unknown' {
  if (!input.hasPosition) {
    return 'unknown';
  }

  if (input.ignitionOn === false) {
    return 'off_duty';
  }

  if ((input.speedKmh ?? 0) > 5) {
    return 'moving';
  }

  if (input.ignitionOn === true) {
    return 'idling';
  }

  return 'parked';
}

function readString(payload: Record<string, unknown> | null, keys: string[]): string | null {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readBoolean(payload: Record<string, unknown> | null, keys: string[]): boolean | null {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function readNumber(payload: Record<string, unknown> | null, keys: string[]): number | null {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function computeTrailDistanceKm(
  trailRows: Array<{ latitude: number; longitude: number }>,
): number | null {
  if (trailRows.length < 2) return null;
  let total = 0;
  for (let i = 1; i < trailRows.length; i += 1) {
    total += haversineKm(
      trailRows[i - 1]!.latitude,
      trailRows[i - 1]!.longitude,
      trailRows[i]!.latitude,
      trailRows[i]!.longitude,
    );
  }
  return Math.round(total * 10) / 10;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
