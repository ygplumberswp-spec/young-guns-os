import { and, desc, eq } from 'drizzle-orm';
import type {
  AuraMemoryCategory,
  AuraMemorySummary,
  CreateAuraMemoryRequest,
  UpdateAuraMemoryRequest,
} from '@titan/shared';
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
};

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
      orderBy: [desc(auraMemory.importance), desc(auraMemory.updatedAt)],
    });

    return rows.map(toMemorySummary);
  }

  async createMemory(
    scope: TenantScope,
    input: CreateAuraMemoryRequest,
  ): Promise<AuraMemorySummary> {
    const information = input.information.trim();

    if (!information) {
      throw new MemoryError('VALIDATION_ERROR', 'Memory information is required');
    }

    const importance = clampImportance(input.importance ?? 3);

    const [created] = await this.db
      .insert(auraMemory)
      .values({
        companyId: scope.companyId,
        createdByUserId: scope.userId,
        category: input.category ?? 'business_rule',
        information,
        importance,
      })
      .returning();

    if (!created) {
      throw new MemoryError('CREATE_FAILED', 'Unable to create memory');
    }

    return toMemorySummary(created);
  }

  async updateMemory(
    companyId: string,
    memoryId: string,
    input: UpdateAuraMemoryRequest,
  ): Promise<AuraMemorySummary> {
    const existing = await this.db.query.auraMemory.findFirst({
      where: and(eq(auraMemory.id, memoryId), eq(auraMemory.companyId, companyId)),
    });

    if (!existing) {
      throw new MemoryError('NOT_FOUND', 'Memory not found');
    }

    const information = input.information?.trim();

    if (input.information !== undefined && !information) {
      throw new MemoryError('VALIDATION_ERROR', 'Memory information is required');
    }

    const [updated] = await this.db
      .update(auraMemory)
      .set({
        category: input.category ?? existing.category,
        information: information ?? existing.information,
        importance:
          input.importance !== undefined ? clampImportance(input.importance) : existing.importance,
        updatedAt: new Date(),
      })
      .where(and(eq(auraMemory.id, memoryId), eq(auraMemory.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new MemoryError('UPDATE_FAILED', 'Unable to update memory');
    }

    return toMemorySummary(updated);
  }

  async deleteMemory(companyId: string, memoryId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(auraMemory)
      .where(and(eq(auraMemory.id, memoryId), eq(auraMemory.companyId, companyId)))
      .returning();

    return Boolean(deleted);
  }

  async buildAuraContext(companyId: string): Promise<AuraMemoryContext> {
    const rows = await this.db.query.auraMemory.findMany({
      where: eq(auraMemory.companyId, companyId),
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
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function clampImportance(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}
