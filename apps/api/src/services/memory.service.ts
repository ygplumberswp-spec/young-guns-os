import { and, desc, eq } from 'drizzle-orm';
import { canWriteCompanyMemory } from '@titan/auth';
import type {
  AuraMemoryCategory,
  AuraMemorySummary,
  CreateAuraMemoryRequest,
  UpdateAuraMemoryRequest,
} from '@titan/shared';
import { findDuplicateAuraMemory } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { auraMemory } from '@titan/db';

export class MemoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
  roleName?: string;
  permissions?: string[];
};

function assertCompanyMemoryWrite(scope: TenantScope): void {
  if (
    !scope.roleName ||
    !canWriteCompanyMemory({ roleName: scope.roleName, permissions: scope.permissions ?? [] })
  ) {
    throw new MemoryError(
      'FORBIDDEN',
      'Only company owners and admins may manage permanent AURA memory rules',
    );
  }
}

export type AuraMemoryContext = {
  memoryCount: number;
  memories: Array<{
    category: AuraMemoryCategory;
    information: string;
    importance: number;
  }>;
};

export class MemoryService {
  constructor(private readonly db: DatabaseClient) {}

  async listMemories(companyId: string): Promise<AuraMemorySummary[]> {
    const rows = await this.db.query.auraMemory.findMany({
      where: eq(auraMemory.companyId, companyId),
      orderBy: [desc(auraMemory.updatedAt), desc(auraMemory.importance)],
    });

    return rows.map(toMemorySummary);
  }

  async createMemory(
    scope: TenantScope,
    input: CreateAuraMemoryRequest,
  ): Promise<AuraMemorySummary> {
    assertCompanyMemoryWrite(scope);

    const information = input.information.trim();

    if (!information) {
      throw new MemoryError('VALIDATION_ERROR', 'Memory information is required');
    }

    const existing = await this.db.query.auraMemory.findMany({
      where: eq(auraMemory.companyId, scope.companyId),
    });
    const duplicate = findDuplicateAuraMemory(existing, information);

    if (duplicate) {
      throw new MemoryError('DUPLICATE', 'This business rule already exists in company memory');
    }

    const importance = clampImportance(input.importance ?? 3);

    const [created] = await this.db
      .insert(auraMemory)
      .values({
        companyId: scope.companyId,
        createdByUserId: scope.userId,
        updatedByUserId: scope.userId,
        category: input.category ?? 'business_rule',
        information,
        importance,
        enabled: true,
      })
      .returning();

    if (!created) {
      throw new MemoryError('CREATE_FAILED', 'Unable to create memory');
    }

    return toMemorySummary(created);
  }

  async updateMemory(
    scope: TenantScope,
    memoryId: string,
    input: UpdateAuraMemoryRequest,
  ): Promise<AuraMemorySummary> {
    assertCompanyMemoryWrite(scope);

    const existing = await this.db.query.auraMemory.findFirst({
      where: and(eq(auraMemory.id, memoryId), eq(auraMemory.companyId, scope.companyId)),
    });

    if (!existing) {
      throw new MemoryError('NOT_FOUND', 'Memory not found');
    }

    const information = input.information?.trim();

    if (input.information !== undefined && !information) {
      throw new MemoryError('VALIDATION_ERROR', 'Memory information is required');
    }

    if (information) {
      const siblings = await this.db.query.auraMemory.findMany({
        where: eq(auraMemory.companyId, scope.companyId),
      });
      const duplicate = findDuplicateAuraMemory(
        siblings.filter((row) => row.id !== memoryId),
        information,
      );

      if (duplicate) {
        throw new MemoryError('DUPLICATE', 'This business rule already exists in company memory');
      }
    }

    const [updated] = await this.db
      .update(auraMemory)
      .set({
        category: input.category ?? existing.category,
        information: information ?? existing.information,
        importance:
          input.importance !== undefined ? clampImportance(input.importance) : existing.importance,
        enabled: input.enabled ?? existing.enabled,
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(auraMemory.id, memoryId), eq(auraMemory.companyId, scope.companyId)))
      .returning();

    if (!updated) {
      throw new MemoryError('UPDATE_FAILED', 'Unable to update memory');
    }

    return toMemorySummary(updated);
  }

  async deleteMemory(scope: TenantScope, memoryId: string): Promise<boolean> {
    assertCompanyMemoryWrite(scope);

    const [deleted] = await this.db
      .delete(auraMemory)
      .where(and(eq(auraMemory.id, memoryId), eq(auraMemory.companyId, scope.companyId)))
      .returning();

    return Boolean(deleted);
  }

  async buildAuraContext(companyId: string): Promise<AuraMemoryContext> {
    const rows = await this.db.query.auraMemory.findMany({
      where: and(eq(auraMemory.companyId, companyId), eq(auraMemory.enabled, true)),
      orderBy: [desc(auraMemory.importance), desc(auraMemory.updatedAt)],
      limit: 20,
    });

    return {
      memoryCount: rows.length,
      memories: rows.map((row) => ({
        category: row.category,
        information: row.information,
        importance: row.importance,
      })),
    };
  }
}

function toMemorySummary(row: typeof auraMemory.$inferSelect): AuraMemorySummary {
  return {
    id: row.id,
    category: row.category,
    information: row.information,
    importance: row.importance,
    enabled: row.enabled,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function clampImportance(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}
