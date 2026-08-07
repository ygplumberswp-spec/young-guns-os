import { and, eq } from 'drizzle-orm';
import type { XeroMappingConflictMetadata } from '@titan/shared';
import { detectXeroMappingConflict } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { integrationConnectors, integrationSyncConflicts } from '@titan/db';

export type ApplyMappingUpdateResult =
  | { applied: true; conflict: null }
  | { applied: false; conflict: XeroMappingConflictMetadata };

export class XeroMappingConflictService {
  constructor(private readonly db: DatabaseClient) {}

  detectInvoiceConflict(
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
  ): XeroMappingConflictMetadata | null {
    return detectXeroMappingConflict({
      entityType: 'invoice',
      local,
      remote,
    });
  }

  async recordConflict(input: {
    companyId: string;
    entityType: string;
    entityId: string;
    conflict: XeroMappingConflictMetadata;
  }): Promise<void> {
    const connector = await this.db.query.integrationConnectors.findFirst({
      where: and(
        eq(integrationConnectors.companyId, input.companyId),
        eq(integrationConnectors.connectorKey, 'xero'),
      ),
    });

    if (!connector) {
      return;
    }

    await this.db.insert(integrationSyncConflicts).values({
      companyId: input.companyId,
      connectorId: connector.id,
      entityType: input.entityType,
      entityId: input.entityId,
      conflictType: input.conflict.kind,
      status: 'detected',
      metadata: {
        ...input.conflict,
      },
    });
  }

  applyInvoiceMappingUpdate(input: {
    companyId: string;
    entityId: string;
    local: Record<string, unknown>;
    remote: Record<string, unknown>;
  }): ApplyMappingUpdateResult {
    const conflict = this.detectInvoiceConflict(input.local, input.remote);
    if (conflict) {
      return { applied: false, conflict };
    }
    return { applied: true, conflict: null };
  }
}
