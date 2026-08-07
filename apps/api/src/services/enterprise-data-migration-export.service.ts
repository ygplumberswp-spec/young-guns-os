import type { DmEntityType, DmSourceFormat } from '@titan/shared';
import type { CrmService } from './crm.service.js';
import type { LeadsService } from './leads.service.js';
import type { FinanceService } from './finance.service.js';
import type { JobsService } from './jobs.service.js';
import type { InventoryService } from './inventory.service.js';
import type { ProcurementService } from './procurement.service.js';
import type { FleetService } from './fleet.service.js';

type ExportDeps = {
  crmService: CrmService;
  leadsService: LeadsService;
  financeService: FinanceService;
  jobsService: JobsService;
  inventoryService: InventoryService;
  procurementService: ProcurementService;
  fleetService: FleetService;
};

export class EnterpriseDataMigrationExportService {
  constructor(private readonly deps: ExportDeps) {}

  async exportModule(
    companyId: string,
    entityType: DmEntityType | null,
    sourceFormat: DmSourceFormat,
    filters: Record<string, unknown>,
  ): Promise<{ recordCount: number; fileName: string; exportContent: string }> {
    const rows = await this.fetchRows(companyId, entityType, filters);
    const fileName = `${entityType ?? 'company'}_export.${sourceFormat === 'json' ? 'json' : 'csv'}`;
    const exportContent =
      sourceFormat === 'json' ? JSON.stringify({ records: rows }, null, 2) : this.toCsv(rows);

    return { recordCount: rows.length, fileName, exportContent };
  }

  private async fetchRows(
    companyId: string,
    entityType: DmEntityType | null,
    _filters: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    switch (entityType) {
      case 'customer':
        return (await this.deps.crmService.listCustomers(companyId)).map((c) => ({
          name: c.name,
          email: c.email,
          phone: c.phone,
          status: c.status,
        }));
      case 'lead':
        return (await this.deps.leadsService.listLeads(companyId)).map((l) => ({
          title: l.title,
          contactName: l.contactName,
          contactEmail: l.contactEmail,
          contactPhone: l.contactPhone,
          status: l.status,
        }));
      case 'supplier':
        return (await this.deps.procurementService.listSuppliers(companyId)).map((s) => ({
          name: s.name,
          email: s.email,
          phone: s.phone,
          status: s.status,
        }));
      case 'job':
        return (await this.deps.jobsService.listJobs(companyId)).map((j) => ({
          title: j.title,
          customerName: j.customerName,
          status: j.status,
          scheduledAt: j.scheduledAt,
        }));
      case 'quote':
        return (await this.deps.financeService.listQuotes(companyId)).map((q) => ({
          quoteNumber: q.displayQuoteNumber,
          customerName: q.customerName,
          amountCents: q.amountCents,
          status: q.status,
        }));
      case 'invoice':
        return (await this.deps.financeService.listInvoices(companyId)).map((i) => ({
          invoiceNumber: i.displayOfficialInvoiceNumber,
          customerName: i.customerName,
          amountCents: i.amountCents,
          status: i.status,
        }));
      case 'payment':
        return (await this.deps.financeService.listPayments(companyId)).map((p) => ({
          invoiceNumber: p.invoiceNumber,
          customerName: p.customerName,
          amountCents: p.amountCents,
        }));
      case 'inventory':
        return (await this.deps.inventoryService.listItems(companyId)).map((item) => ({
          sku: item.sku,
          name: item.name,
          status: item.status,
        }));
      case 'vehicle':
        return (await this.deps.fleetService.listVehicles(companyId)).map((v) => ({
          name: v.name,
          licensePlate: v.licensePlate,
          make: v.make,
          model: v.model,
          status: v.status,
        }));
      default:
        return [];
    }
  }

  private toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]!);
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((header) => csvEscape(String(row[header] ?? ''))).join(','));
    }
    return lines.join('\n');
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
