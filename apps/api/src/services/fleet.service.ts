import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type {
  CreateVehicleRequest,
  FleetStats,
  JobAssignee,
  UpdateVehicleRequest,
  VehicleDetail,
  VehicleSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { users, vehicles } from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';

export class FleetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FleetError';
  }
}

export type AuraFleetContext = {
  totalCount: number;
  availableCount: number;
  inUseCount: number;
  maintenanceCount: number;
  assignedCount: number;
  vehicles: Array<{
    id: string;
    name: string;
    licensePlate: string;
    status: string;
    make: string | null;
    model: string | null;
    assignedUserName: string | null;
  }>;
  focusedVehicle: {
    id: string;
    name: string;
    licensePlate: string;
    status: string;
    make: string | null;
    model: string | null;
    year: number | null;
    vin: string | null;
    assignedUserName: string | null;
    notes: string | null;
  } | null;
};

export class FleetService {
  constructor(private readonly db: DatabaseClient) {}

  async listVehicles(companyId: string): Promise<VehicleSummary[]> {
    const rows = await this.db.query.vehicles.findMany({
      where: eq(vehicles.companyId, companyId),
      with: { assignedUser: true },
      orderBy: [desc(vehicles.updatedAt)],
    });

    return rows.map(toVehicleSummary);
  }

  async getVehicle(companyId: string, vehicleId: string): Promise<VehicleDetail | null> {
    const vehicle = await this.db.query.vehicles.findFirst({
      where: and(eq(vehicles.id, vehicleId), eq(vehicles.companyId, companyId)),
      with: { assignedUser: true },
    });

    if (!vehicle) {
      return null;
    }

    return toVehicleDetail(vehicle);
  }

  async createVehicle(companyId: string, input: CreateVehicleRequest): Promise<VehicleDetail> {
    const name = input.name.trim();
    const licensePlate = input.licensePlate.trim();

    if (!name) {
      throw new FleetError('VALIDATION_ERROR', 'Vehicle name is required');
    }

    if (!licensePlate) {
      throw new FleetError('VALIDATION_ERROR', 'License plate is required');
    }

    if (input.year !== undefined && input.year !== null) {
      validateYear(input.year);
    }

    if (input.assignedUserId) {
      await this.ensureAssigneeBelongsToCompany(companyId, input.assignedUserId);
    }

    const [created] = await this.db
      .insert(vehicles)
      .values({
        companyId,
        name,
        make: normalizeOptionalText(input.make),
        model: normalizeOptionalText(input.model),
        year: input.year ?? null,
        licensePlate,
        vin: normalizeOptionalText(input.vin),
        status: input.status ?? 'available',
        assignedUserId: input.assignedUserId ?? null,
        notes: normalizeOptionalText(input.notes),
      })
      .returning();

    if (!created) {
      throw new FleetError('CREATE_FAILED', 'Unable to create vehicle');
    }

    return (await this.getVehicle(companyId, created.id))!;
  }

  async updateVehicle(
    companyId: string,
    vehicleId: string,
    input: UpdateVehicleRequest,
  ): Promise<VehicleDetail> {
    const existing = await this.getVehicle(companyId, vehicleId);

    if (!existing) {
      throw new FleetError('NOT_FOUND', 'Vehicle not found');
    }

    if (input.name !== undefined && !input.name.trim()) {
      throw new FleetError('VALIDATION_ERROR', 'Vehicle name is required');
    }

    if (input.licensePlate !== undefined && !input.licensePlate.trim()) {
      throw new FleetError('VALIDATION_ERROR', 'License plate is required');
    }

    if (input.year !== undefined && input.year !== null) {
      validateYear(input.year);
    }

    if (input.assignedUserId) {
      await this.ensureAssigneeBelongsToCompany(companyId, input.assignedUserId);
    }

    const [updated] = await this.db
      .update(vehicles)
      .set({
        name: input.name === undefined ? existing.name : input.name.trim(),
        make: input.make === undefined ? existing.make : normalizeOptionalText(input.make),
        model: input.model === undefined ? existing.model : normalizeOptionalText(input.model),
        year: input.year === undefined ? existing.year : input.year,
        licensePlate:
          input.licensePlate === undefined ? existing.licensePlate : input.licensePlate.trim(),
        vin: input.vin === undefined ? existing.vin : normalizeOptionalText(input.vin),
        status: input.status ?? existing.status,
        assignedUserId:
          input.assignedUserId === undefined
            ? existing.assignedUserId
            : (input.assignedUserId ?? null),
        notes: input.notes === undefined ? existing.notes : normalizeOptionalText(input.notes),
        updatedAt: new Date(),
      })
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new FleetError('UPDATE_FAILED', 'Unable to update vehicle');
    }

    if (input.status !== undefined && input.status !== existing.status) {
      emitBusinessEvent({
        companyId,
        eventType: 'vehicle.status_changed',
        entityType: 'vehicle',
        entityId: vehicleId,
        payload: {
          vehicle: {
            id: vehicleId,
            status: updated.status,
          },
        },
      });
    }

    return (await this.getVehicle(companyId, vehicleId))!;
  }

  async listAssignees(companyId: string): Promise<JobAssignee[]> {
    const members = await this.db.query.users.findMany({
      where: and(eq(users.companyId, companyId), eq(users.isActive, true)),
      with: { role: true },
      orderBy: [asc(users.firstName), asc(users.lastName)],
    });

    return members.map((member) => ({
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      roleName: member.role?.name ?? 'Unknown',
    }));
  }

  async getStats(companyId: string): Promise<FleetStats> {
    const [totalRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(vehicles)
      .where(eq(vehicles.companyId, companyId));

    const statusRows = await this.db
      .select({
        status: vehicles.status,
        count: sql<number>`count(*)::int`,
      })
      .from(vehicles)
      .where(eq(vehicles.companyId, companyId))
      .groupBy(vehicles.status);

    const [assignedRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(vehicles)
      .where(and(eq(vehicles.companyId, companyId), sql`${vehicles.assignedUserId} is not null`));

    const statusCounts = Object.fromEntries(statusRows.map((row) => [row.status, row.count]));

    return {
      totalCount: totalRow?.count ?? 0,
      availableCount: statusCounts.available ?? 0,
      inUseCount: statusCounts.in_use ?? 0,
      maintenanceCount: statusCounts.maintenance ?? 0,
      assignedCount: assignedRow?.count ?? 0,
    };
  }

  async buildAuraContext(companyId: string, vehicleId?: string): Promise<AuraFleetContext> {
    const stats = await this.getStats(companyId);

    const vehicleRows = await this.db.query.vehicles.findMany({
      where: eq(vehicles.companyId, companyId),
      with: { assignedUser: true },
      orderBy: [desc(vehicles.updatedAt)],
      limit: 15,
    });

    let focusedVehicle: AuraFleetContext['focusedVehicle'] = null;

    if (vehicleId) {
      const focused = await this.getVehicle(companyId, vehicleId);

      if (focused) {
        focusedVehicle = {
          id: focused.id,
          name: focused.name,
          licensePlate: focused.licensePlate,
          status: focused.status,
          make: focused.make,
          model: focused.model,
          year: focused.year,
          vin: focused.vin,
          assignedUserName: focused.assignedUserName,
          notes: focused.notes,
        };
      }
    }

    return {
      totalCount: stats.totalCount,
      availableCount: stats.availableCount,
      inUseCount: stats.inUseCount,
      maintenanceCount: stats.maintenanceCount,
      assignedCount: stats.assignedCount,
      vehicles: vehicleRows.map((row) => ({
        id: row.id,
        name: row.name,
        licensePlate: row.licensePlate,
        status: row.status,
        make: row.make,
        model: row.model,
        assignedUserName: formatAssigneeName(row.assignedUser),
      })),
      focusedVehicle,
    };
  }

  private async ensureAssigneeBelongsToCompany(companyId: string, userId: string) {
    const member = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.companyId, companyId), eq(users.isActive, true)),
    });

    if (!member) {
      throw new FleetError('ASSIGNEE_NOT_FOUND', 'Assigned team member not found');
    }
  }
}

function toVehicleSummary(
  row: typeof vehicles.$inferSelect & {
    assignedUser: typeof users.$inferSelect | null;
  },
): VehicleSummary {
  return {
    id: row.id,
    name: row.name,
    make: row.make,
    model: row.model,
    year: row.year,
    licensePlate: row.licensePlate,
    vin: row.vin,
    status: row.status,
    assignedUserId: row.assignedUserId,
    assignedUserName: formatAssigneeName(row.assignedUser),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toVehicleDetail(
  row: typeof vehicles.$inferSelect & {
    assignedUser: typeof users.$inferSelect | null;
  },
): VehicleDetail {
  return {
    ...toVehicleSummary(row),
    notes: row.notes,
  };
}

function formatAssigneeName(user: typeof users.$inferSelect | null | undefined): string | null {
  if (!user) {
    return null;
  }

  return `${user.firstName} ${user.lastName}`.trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateYear(year: number) {
  const currentYear = new Date().getFullYear();

  if (!Number.isInteger(year) || year < 1900 || year > currentYear + 1) {
    throw new FleetError('VALIDATION_ERROR', `Year must be between 1900 and ${currentYear + 1}`);
  }
}
