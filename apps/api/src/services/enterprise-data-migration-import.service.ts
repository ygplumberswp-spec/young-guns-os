import type { DmEntityType, DmRecordOutcome } from '@titan/shared';
import type { CrmService } from './crm.service.js';
import type { LeadsService } from './leads.service.js';
import type { ProcurementService } from './procurement.service.js';
import type { InventoryService } from './inventory.service.js';

export type ImportRowResult = {
  rowNumber: number;
  outcome: DmRecordOutcome;
  targetEntityId: string | null;
  errorMessage: string | null;
  sourceData: Record<string, string>;
};

type ImportDeps = {
  crmService: CrmService;
  leadsService: LeadsService;
  procurementService: ProcurementService;
  inventoryService: InventoryService;
};

export class EnterpriseDataMigrationImportService {
  constructor(private readonly deps: ImportDeps) {}

  async importApprovedRows(
    companyId: string,
    userId: string,
    entityType: DmEntityType,
    rows: Record<string, string>[],
    skipRows: Set<number>,
  ): Promise<ImportRowResult[]> {
    const results: ImportRowResult[] = [];

    for (let index = 0; index < rows.length; index++) {
      const rowNumber = index + 1;
      const row = rows[index]!;

      if (skipRows.has(rowNumber)) {
        results.push({
          rowNumber,
          outcome: 'skipped',
          targetEntityId: null,
          errorMessage: null,
          sourceData: row,
        });
        continue;
      }

      try {
        const targetEntityId = await this.importRow(companyId, userId, entityType, row);
        results.push({
          rowNumber,
          outcome: 'imported',
          targetEntityId,
          errorMessage: null,
          sourceData: row,
        });
      } catch (error) {
        results.push({
          rowNumber,
          outcome: 'failed',
          targetEntityId: null,
          errorMessage: error instanceof Error ? error.message : 'Import failed',
          sourceData: row,
        });
      }
    }

    return results;
  }

  private async importRow(
    companyId: string,
    userId: string,
    entityType: DmEntityType,
    row: Record<string, string>,
  ): Promise<string> {
    switch (entityType) {
      case 'customer': {
        const created = await this.deps.crmService.createCustomer(companyId, {
          name: row.name!.trim(),
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          status: (row.status as 'active' | 'inactive' | undefined) ?? undefined,
          notes: row.notes?.trim() || null,
        });
        return created.id;
      }
      case 'lead': {
        const { isValidSaMobile } = await import('@titan/shared');
        const rawPhone = row.contactPhone?.trim() || null;
        const created = await this.deps.leadsService.createLead(
          { companyId, userId },
          {
            title: row.title!.trim(),
            contactName: row.contactName!.trim(),
            contactEmail: row.contactEmail?.trim() || null,
            contactPhone: rawPhone && isValidSaMobile(rawPhone) ? rawPhone : null,
            notes: row.notes?.trim() || null,
            acknowledgePlaceholderEmail: true,
            duplicateOverrideReason: 'enterprise_data_migration_import',
          },
        );
        return created.lead.id;
      }
      case 'supplier': {
        const created = await this.deps.procurementService.createSupplier(companyId, {
          name: row.name!.trim(),
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          notes: row.notes?.trim() || null,
        });
        return created.id;
      }
      case 'inventory': {
        const created = await this.deps.inventoryService.createItem(companyId, {
          sku: row.sku!.trim(),
          name: row.name!.trim(),
          status: (row.status as 'active' | 'inactive' | undefined) ?? undefined,
        });
        return created.id;
      }
      default:
        throw new Error(`Import not yet supported for entity type "${entityType}".`);
    }
  }
}
