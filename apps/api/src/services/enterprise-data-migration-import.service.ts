import { and, eq, ilike, or, sql } from 'drizzle-orm';
import type { DmEntityType, DmRecordOutcome, DmSourceFormat } from '@titan/shared';
import {
  HISTORICAL_IMPORT_UNSUPPORTED_MESSAGE,
  isPhysicalStockImportCandidate,
  mapDmFormatToHistoricalProvider,
  normalizeHistoricalDocumentNumber,
  normalizeSupplierNameForMatch,
  parseHistoricalAmountToCents,
  paymentImportCreatesLedgerEntry,
  preferXeroCanonicalRecord,
  previewInventoryStockImpact,
  scoreEquipmentHistoricalMatch,
  toDbSourceProvider,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  alAssetRegistryProfiles,
  assetEquipment,
  cxCustomerProperties,
  inventoryItems,
  invoices,
  jobNumberCounters,
  jobs,
  payments,
  quotes,
} from '@titan/db';
import type { CrmService } from './crm.service.js';
import type { LeadsService } from './leads.service.js';
import type { ProcurementService } from './procurement.service.js';
import type { InventoryService } from './inventory.service.js';
import type { DocumentsService } from './documents.service.js';
import type { AssetEquipmentIntelligenceService } from './asset-equipment-intelligence.service.js';
import type { EnterpriseAssetLifecycleService } from './enterprise-asset-lifecycle.service.js';

export type ImportRowResult = {
  rowNumber: number;
  outcome: DmRecordOutcome;
  targetEntityId: string | null;
  errorMessage: string | null;
  sourceData: Record<string, string>;
};

export type HistoricalImportContext = {
  importJobId: string;
  sourceFormat: DmSourceFormat;
  /** Rows resolved as merge/link → reuse existing entity id (idempotent). */
  linkRows?: Map<number, string>;
  /** Inventory rows where replace was explicitly approved for stock overwrite. */
  replaceStockRows?: Set<number>;
  rowNumber?: number;
};

type ImportDeps = {
  db: DatabaseClient;
  crmService: CrmService;
  leadsService: LeadsService;
  procurementService: ProcurementService;
  inventoryService: InventoryService;
  documentsService: DocumentsService;
  assetEquipmentIntelligenceService: AssetEquipmentIntelligenceService;
  enterpriseAssetLifecycleService: EnterpriseAssetLifecycleService;
};

function rowText(row: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) return value;
  }
  return null;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapQuoteStatus(value: string | null | undefined): typeof quotes.$inferInsert.status {
  const normalized = (value ?? 'draft').trim().toLowerCase().replace(/\s+/g, '_');
  const allowed = new Set([
    'draft',
    'internal_review',
    'approved_for_sending',
    'sent',
    'viewed',
    'accepted',
    'declined',
    'expired',
    'superseded',
    'converted',
    'cancelled',
  ]);
  return (allowed.has(normalized) ? normalized : 'draft') as typeof quotes.$inferInsert.status;
}

function mapInvoiceStatus(value: string | null | undefined): typeof invoices.$inferInsert.status {
  const normalized = (value ?? 'draft').trim().toLowerCase();
  const allowed = new Set(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled']);
  return (allowed.has(normalized) ? normalized : 'draft') as typeof invoices.$inferInsert.status;
}

function mapJobStatus(value: string | null | undefined): typeof jobs.$inferInsert.status {
  const normalized = (value ?? 'new').trim().toLowerCase().replace(/\s+/g, '_');
  const allowed = new Set(['new', 'scheduled', 'in_progress', 'completed', 'cancelled']);
  return (allowed.has(normalized) ? normalized : 'new') as typeof jobs.$inferInsert.status;
}

function mapPaymentMethod(value: string | null | undefined): typeof payments.$inferInsert.method {
  const normalized = (value ?? 'other').trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'cash' || normalized === 'card' || normalized === 'bank_transfer') {
    return normalized;
  }
  return 'other';
}

export class EnterpriseDataMigrationImportService {
  constructor(private readonly deps: ImportDeps) {}

  async importApprovedRows(
    companyId: string,
    userId: string,
    entityType: DmEntityType,
    rows: Record<string, string>[],
    skipRows: Set<number>,
    context?: HistoricalImportContext,
  ): Promise<ImportRowResult[]> {
    const results: ImportRowResult[] = [];

    for (let index = 0; index < rows.length; index++) {
      const rowNumber = index + 1;
      const row = rows[index]!;

      if (skipRows.has(rowNumber)) {
        results.push({
          rowNumber,
          outcome: 'skipped',
          targetEntityId: context?.linkRows?.get(rowNumber) ?? null,
          errorMessage: null,
          sourceData: row,
        });
        continue;
      }

      const linkedId = context?.linkRows?.get(rowNumber);
      if (linkedId) {
        results.push({
          rowNumber,
          outcome: 'imported',
          targetEntityId: linkedId,
          errorMessage: null,
          sourceData: row,
        });
        continue;
      }

      try {
        const targetEntityId = await this.importRow(
          companyId,
          userId,
          entityType,
          row,
          context ? { ...context, rowNumber } : context,
        );
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
    context?: HistoricalImportContext,
  ): Promise<string> {
    switch (entityType) {
      case 'customer':
        return this.importCustomer(companyId, row);
      case 'lead':
        return this.importLead(companyId, userId, row);
      case 'supplier':
        return this.importSupplier(companyId, row, context);
      case 'inventory':
        return this.importInventory(companyId, row, context);
      case 'contact':
        return this.importContact(companyId, row);
      case 'property':
        return this.importProperty(companyId, row, context);
      case 'asset':
        return this.importAsset(companyId, userId, row, context);
      case 'job':
        return this.importJob(companyId, userId, row, context);
      case 'quote':
        return this.importQuote(companyId, row, context);
      case 'invoice':
        return this.importInvoice(companyId, row, context);
      case 'payment':
        return this.importPayment(companyId, userId, row, context);
      case 'price_book':
        return this.importPriceBook(companyId, row, context);
      case 'document':
        return this.importDocument(companyId, userId, row, context);
      default:
        throw new Error(
          `${HISTORICAL_IMPORT_UNSUPPORTED_MESSAGE} Entity type "${entityType}".`,
        );
    }
  }

  private provenance(row: Record<string, string>, context?: HistoricalImportContext) {
    const provider = toDbSourceProvider(
      mapDmFormatToHistoricalProvider(
        rowText(row, 'sourceProvider') ?? context?.sourceFormat ?? 'csv',
      ),
    );
    return {
      sourceProvider: provider,
      sourceExternalId: rowText(row, 'sourceExternalId', 'externalId'),
      sourceImportJobId: context?.importJobId ?? null,
      sourceSyncedAt: new Date(),
    };
  }

  private async resolveCustomerId(
    companyId: string,
    row: Record<string, string>,
  ): Promise<string> {
    const customerId = rowText(row, 'customerId');
    if (customerId) return customerId;

    const email = rowText(row, 'customerEmail', 'email');
    const name = rowText(row, 'customerName', 'name');
    const customers = await this.deps.crmService.listCustomers(companyId, email ?? name);
    if (email) {
      const byEmail = customers.find(
        (customer) => (customer.email ?? '').toLowerCase() === email.toLowerCase(),
      );
      if (byEmail) return byEmail.id;
    }
    if (name) {
      const byName = customers.find(
        (customer) => customer.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (byName) return byName.id;
    }
    if (!name) {
      throw new Error('Customer name or email is required to resolve the historical customer.');
    }
    const created = await this.deps.crmService.createCustomer(companyId, {
      name,
      email: email ?? null,
      phone: rowText(row, 'customerPhone', 'phone'),
      notes: 'Created during historical import',
    });
    return created.id;
  }

  private async importCustomer(companyId: string, row: Record<string, string>): Promise<string> {
    const email = rowText(row, 'email');
    const name = rowText(row, 'name');
    if (!name) throw new Error('Customer name is required.');

    const existing = await this.deps.crmService.listCustomers(companyId, email ?? name);
    const match =
      (email &&
        existing.find((customer) => (customer.email ?? '').toLowerCase() === email.toLowerCase())) ||
      existing.find((customer) => customer.name.trim().toLowerCase() === name.toLowerCase());
    if (match) return match.id;

    const created = await this.deps.crmService.createCustomer(companyId, {
      name,
      email: email ?? null,
      phone: rowText(row, 'phone'),
      status: (row.status as 'active' | 'inactive' | undefined) ?? undefined,
      notes: rowText(row, 'notes'),
    });
    return created.id;
  }

  private async importLead(
    companyId: string,
    userId: string,
    row: Record<string, string>,
  ): Promise<string> {
    const { isValidSaMobile } = await import('@titan/shared');
    const rawPhone = rowText(row, 'contactPhone');
    const created = await this.deps.leadsService.createLead(
      { companyId, userId },
      {
        title: rowText(row, 'title')!,
        contactName: rowText(row, 'contactName')!,
        contactEmail: rowText(row, 'contactEmail'),
        contactPhone: rawPhone && isValidSaMobile(rawPhone) ? rawPhone : null,
        notes: rowText(row, 'notes'),
        acknowledgePlaceholderEmail: true,
        duplicateOverrideReason: 'enterprise_data_migration_import',
      },
    );
    return created.lead.id;
  }

  private async importSupplier(
    companyId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const name = rowText(row, 'name');
    if (!name) throw new Error('Supplier name is required.');
    const email = rowText(row, 'email');
    const supplierCode = rowText(row, 'supplierCode', 'code');
    const provenance = this.provenance(row, context);
    const existing = await this.deps.procurementService.listSuppliers(companyId);

    if (provenance.sourceExternalId) {
      const byExternal = existing.find(
        (supplier) =>
          (supplier.sourceProvider ?? '') === provenance.sourceProvider &&
          (supplier.sourceExternalId ?? '') === provenance.sourceExternalId,
      );
      if (byExternal) return byExternal.id;
    }
    if (supplierCode) {
      const byCode = existing.find(
        (supplier) => (supplier.supplierCode ?? '').toLowerCase() === supplierCode.toLowerCase(),
      );
      if (byCode) return byCode.id;
    }
    if (email) {
      const byEmail = existing.find(
        (supplier) => (supplier.email ?? '').toLowerCase() === email.toLowerCase(),
      );
      if (byEmail) return byEmail.id;
    }
    const normalized = normalizeSupplierNameForMatch(name);
    const exactNameMatches = existing.filter(
      (supplier) => normalizeSupplierNameForMatch(supplier.name) === normalized,
    );
    if (exactNameMatches.length === 1) return exactNameMatches[0]!.id;
    if (exactNameMatches.length > 1) {
      throw new Error(
        `Low-confidence supplier match for "${name}" — multiple normalised name matches require REVIEW.`,
      );
    }

    const created = await this.deps.procurementService.createSupplier(companyId, {
      name,
      email,
      phone: rowText(row, 'phone'),
      address: rowText(row, 'address'),
      notes: rowText(row, 'notes'),
      supplierCode,
      category: rowText(row, 'category'),
      sourceProvider: provenance.sourceProvider,
      sourceExternalId: provenance.sourceExternalId,
      status: (row.status as 'active' | 'inactive' | undefined) ?? undefined,
    });
    return created.id;
  }

  private async importInventory(
    companyId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const sku = rowText(row, 'sku');
    const name = rowText(row, 'name');
    if (!sku || !name) throw new Error('Inventory SKU and name are required.');

    const physical = isPhysicalStockImportCandidate({
      name,
      description: rowText(row, 'description'),
      category: rowText(row, 'category'),
      itemType: rowText(row, 'itemType'),
    });
    if (!physical.accepted) {
      throw new Error(physical.reason ?? 'Not physical stock.');
    }

    const existingItems = await this.deps.inventoryService.listItems(companyId);
    const match = existingItems.find((item) => item.sku.toLowerCase() === sku.toLowerCase());
    const proposedQtyRaw = rowText(row, 'quantity');
    const proposedQty =
      proposedQtyRaw && /^-?\d+(\.\d+)?$/.test(proposedQtyRaw.replace(/,/g, ''))
        ? Math.trunc(Number(proposedQtyRaw.replace(/,/g, '')))
        : null;

    const locations = await this.deps.inventoryService.listLocations(companyId);
    let locationId = locations[0]?.id ?? null;
    let locationName = locations[0]?.name ?? null;
    const locationHint = rowText(row, 'location');
    if (locationHint) {
      const found = locations.find(
        (location) => location.name.toLowerCase() === locationHint.toLowerCase(),
      );
      if (found) {
        locationId = found.id;
        locationName = found.name;
      }
    }
    if (!locationId && proposedQty != null && proposedQty >= 0) {
      const createdLocation = await this.deps.inventoryService.createLocation(companyId, {
        name: locationHint ?? 'Main Warehouse',
      });
      locationId = createdLocation.id;
      locationName = createdLocation.name;
    }

    const overwriteResolved = Boolean(
      context?.rowNumber && context.replaceStockRows?.has(context.rowNumber),
    );
    const impact = previewInventoryStockImpact({
      sku,
      itemExists: Boolean(match),
      existingQuantityOnHand: match?.totalQuantityOnHand ?? 0,
      proposedQuantity: proposedQty,
      locationName,
      overwriteResolved,
    });
    if (proposedQty != null && proposedQty < 0) {
      throw new Error('Negative stock is refused.');
    }

    let itemId = match?.id;
    if (!itemId) {
      const created = await this.deps.inventoryService.createItem(companyId, {
        sku,
        name,
        description: [
          rowText(row, 'description'),
          rowText(row, 'category') ? `Category: ${rowText(row, 'category')}` : null,
          'HISTORICAL_INVENTORY — physical stock catalogue.',
        ]
          .filter(Boolean)
          .join(' | '),
        status: (row.status as 'active' | 'inactive' | undefined) ?? undefined,
        sellPriceCents: parseHistoricalAmountToCents(row.sellPriceCents) ?? undefined,
        unitCostCents: parseHistoricalAmountToCents(row.unitCostCents) ?? undefined,
        unit: rowText(row, 'unit') ?? undefined,
      });
      itemId = created.id;
    }

    if (impact.willWriteStock && locationId && proposedQty != null && proposedQty >= 0) {
      await this.deps.inventoryService.setStockLevel(companyId, {
        itemId,
        locationId,
        quantityOnHand: proposedQty,
        reason: overwriteResolved
          ? 'historical_import_replace_approved'
          : 'historical_import_new_item_stock',
      });
    }

    return itemId;
  }

  private async importAsset(
    companyId: string,
    userId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const name = rowText(row, 'name');
    if (!name) throw new Error('Asset/equipment name is required.');
    const serialNumber = rowText(row, 'serialNumber', 'serial');
    const provenance = this.provenance(row, context);
    const manufacturer = rowText(row, 'manufacturer');
    const model = rowText(row, 'model');
    const equipmentType = rowText(row, 'equipmentType', 'assetType') ?? 'equipment';

    const existingAssets = await this.deps.db.query.assetEquipment.findMany({
      where: eq(assetEquipment.companyId, companyId),
      limit: 5000,
    });

    if (provenance.sourceExternalId) {
      const byExternal = existingAssets.find((asset) => {
        const meta = (asset.metadata ?? {}) as Record<string, unknown>;
        return (
          meta.sourceProvider === provenance.sourceProvider &&
          meta.sourceExternalId === provenance.sourceExternalId
        );
      });
      if (byExternal) return byExternal.id;
    }

    let customerId: string | null = null;
    let propertyId: string | null = null;
    try {
      customerId = await this.resolveCustomerId(companyId, row);
      propertyId = await this.resolvePropertyId(companyId, customerId, row);
    } catch {
      customerId = null;
      propertyId = null;
    }

    if (serialNumber) {
      const serialMatches = existingAssets.filter(
        (asset) => (asset.serialNumber ?? '').toLowerCase() === serialNumber.toLowerCase(),
      );
      if (serialMatches.length === 1) {
        const scored = scoreEquipmentHistoricalMatch({
          serialMatch: true,
          customerMatch: Boolean(customerId),
          propertyMatch: Boolean(propertyId),
          manufacturerModelMatch: Boolean(manufacturer || model),
        });
        if (scored.requiresHumanReview && !customerId) {
          throw new Error(
            `Low-confidence equipment match for serial ${serialNumber} — REVIEW required.`,
          );
        }
        return serialMatches[0]!.id;
      }
      if (serialMatches.length > 1) {
        throw new Error(
          `Ambiguous serial number ${serialNumber} — multiple assets require REVIEW.`,
        );
      }
    }

    const assetTypeRaw = (equipmentType || 'equipment').toLowerCase().replace(/\s+/g, '_');
    const assetType = (
      ['vehicle', 'machinery', 'tool', 'equipment', 'office_asset', 'it_equipment', 'rented_asset']
        .includes(assetTypeRaw)
        ? assetTypeRaw
        : 'equipment'
    ) as
      | 'vehicle'
      | 'machinery'
      | 'tool'
      | 'equipment'
      | 'office_asset'
      | 'it_equipment'
      | 'rented_asset';

    const created = await this.deps.assetEquipmentIntelligenceService.createAsset(
      { companyId, userId },
      {
        assetType,
        name,
        description: [
          rowText(row, 'notes', 'description'),
          manufacturer ? `Manufacturer: ${manufacturer}` : null,
          model ? `Model: ${model}` : null,
          'HISTORICAL_EQUIPMENT_IMPORT',
        ]
          .filter(Boolean)
          .join(' | '),
        serialNumber: serialNumber ?? undefined,
        warrantyExpiresAt: rowText(row, 'warrantyExpiresAt') ?? undefined,
        locationText: rowText(row, 'location') ?? undefined,
        status: 'active',
      },
    );

    await this.deps.db
      .update(assetEquipment)
      .set({
        metadata: {
          historicalImport: true,
          sourceProvider: provenance.sourceProvider,
          sourceExternalId: provenance.sourceExternalId,
          sourceImportJobId: provenance.sourceImportJobId,
          equipmentType,
          manufacturer,
          model,
          relatedJobNumber: rowText(row, 'jobNumber'),
        },
        updatedAt: new Date(),
      })
      .where(and(eq(assetEquipment.id, created.id), eq(assetEquipment.companyId, companyId)));

    const existingProfile = await this.deps.db.query.alAssetRegistryProfiles.findFirst({
      where: and(
        eq(alAssetRegistryProfiles.companyId, companyId),
        eq(alAssetRegistryProfiles.assetId, created.id),
      ),
    });
    if (!existingProfile) {
      await this.deps.enterpriseAssetLifecycleService.createRegistryProfile(
        { companyId, userId },
        {
          assetId: created.id,
          ownershipType: customerId ? 'customer_owned' : 'company_owned',
          customerId: customerId ?? undefined,
          propertyId: propertyId ?? undefined,
          manufacturer: manufacturer ?? undefined,
          model: model ?? undefined,
          installationDate: rowText(row, 'installationDate') ?? undefined,
          customCategoryName: equipmentType,
          warrantyDetails: rowText(row, 'warrantyExpiresAt')
            ? { expiresAt: rowText(row, 'warrantyExpiresAt') }
            : {},
        },
      );
    }

    return created.id;
  }

  /** Contacts are not a separate archive table — upsert onto matched customer contact fields. */
  private async importContact(companyId: string, row: Record<string, string>): Promise<string> {
    const customerId = await this.resolveCustomerId(companyId, {
      ...row,
      customerName: rowText(row, 'customerName', 'name') ?? '',
      customerEmail: rowText(row, 'customerEmail', 'email') ?? '',
    });
    await this.deps.crmService.updateCustomer(companyId, customerId, {
      contactPerson: rowText(row, 'name', 'contactPerson'),
      email: rowText(row, 'email') ?? undefined,
      phone: rowText(row, 'phone') ?? undefined,
    });
    return customerId;
  }

  private async importProperty(
    companyId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const customerId = await this.resolveCustomerId(companyId, row);
    const propertyName = rowText(row, 'propertyName', 'name');
    if (!propertyName) throw new Error('Property name is required.');

    const existing = await this.deps.crmService.listCustomerProperties(companyId, customerId);
    const address = rowText(row, 'address', 'street') ?? '';
    const duplicate = existing.find((property) => {
      const sameName = property.propertyName.trim().toLowerCase() === propertyName.toLowerCase();
      const sameStreet =
        address &&
        (property.street ?? '').trim().toLowerCase() === address.toLowerCase();
      return sameName || Boolean(sameStreet && sameName);
    });
    if (duplicate) return duplicate.id;

    const provenance = this.provenance(row, context);
    const created = await this.deps.crmService.createCustomerProperty(companyId, customerId, {
      propertyName,
      street: rowText(row, 'street', 'address'),
      city: rowText(row, 'city'),
      suburb: rowText(row, 'suburb'),
      postalCode: rowText(row, 'postalCode', 'postcode'),
      formattedAddress: rowText(row, 'address', 'street'),
    });

    await this.deps.db
      .update(cxCustomerProperties)
      .set({
        metadata: {
          historicalImport: true,
          ...provenance,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cxCustomerProperties.id, created.id),
          eq(cxCustomerProperties.companyId, companyId),
        ),
      );

    return created.id;
  }

  private async resolvePropertyId(
    companyId: string,
    customerId: string,
    row: Record<string, string>,
  ): Promise<string | null> {
    const propertyName = rowText(row, 'propertyName');
    if (!propertyName) return null;
    const existing = await this.deps.crmService.listCustomerProperties(companyId, customerId);
    const match = existing.find(
      (property) => property.propertyName.trim().toLowerCase() === propertyName.toLowerCase(),
    );
    return match?.id ?? null;
  }

  private async resolveJobId(
    companyId: string,
    row: Record<string, string>,
  ): Promise<string | null> {
    const jobId = rowText(row, 'jobId');
    if (jobId) return jobId;
    const jobNumber = rowText(row, 'jobNumber');
    if (!jobNumber) return null;
    const existing = await this.deps.db.query.jobs.findFirst({
      where: and(
        eq(jobs.companyId, companyId),
        ilike(jobs.jobNumber, jobNumber),
      ),
    });
    return existing?.id ?? null;
  }

  private async bumpJobNumberCounterIfNeeded(companyId: string, jobNumber: string): Promise<void> {
    const match = jobNumber.match(/(\d+)\s*$/);
    if (!match) return;
    const numeric = Number(match[1]);
    if (!Number.isFinite(numeric) || numeric <= 0) return;

    await this.deps.db
      .insert(jobNumberCounters)
      .values({ companyId, lastValue: numeric })
      .onConflictDoNothing({ target: jobNumberCounters.companyId });

    await this.deps.db.execute(sql`
      UPDATE job_number_counters
      SET last_value = GREATEST(last_value, ${numeric}), updated_at = now()
      WHERE company_id = ${companyId}
    `);
  }

  private async importJob(
    companyId: string,
    userId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const customerId = await this.resolveCustomerId(companyId, row);
    const title = rowText(row, 'title');
    if (!title) throw new Error('Job title is required.');

    const jobNumber = rowText(row, 'jobNumber');
    if (jobNumber) {
      const existing = await this.deps.db.query.jobs.findFirst({
        where: and(eq(jobs.companyId, companyId), ilike(jobs.jobNumber, jobNumber)),
      });
      if (existing) return existing.id;
    }

    const external = this.provenance(row, context);
    if (external.sourceExternalId) {
      const byExternal = await this.deps.db.query.jobs.findFirst({
        where: and(
          eq(jobs.companyId, companyId),
          eq(jobs.sourceProvider, external.sourceProvider),
          eq(jobs.sourceExternalId, external.sourceExternalId),
        ),
      });
      if (byExternal) return byExternal.id;
    }

    const propertyId = await this.resolvePropertyId(companyId, customerId, row);
    const customer = await this.deps.crmService.getCustomer(companyId, customerId);
    const status = mapJobStatus(rowText(row, 'status'));
    const historicalFlags = [
      'HISTORICAL_PARTIAL_RECORD',
      'NO_PHOTOS_IMPORTED',
      'PAYMENT_PROOF_NOT_AVAILABLE',
      'NO_COC_IMPORTED',
      'ORIGINAL_JOB_CARD_NOT_AVAILABLE',
    ];

    const [created] = await this.deps.db
      .insert(jobs)
      .values({
        companyId,
        customerId,
        propertyId,
        jobNumber: jobNumber ?? null,
        title,
        jobType: rowText(row, 'jobType') ?? 'historical_import',
        description: rowText(row, 'description') ?? 'Historical job imported into TITAN Job 360.',
        status,
        priority: 'normal',
        scheduledAt: parseOptionalDate(rowText(row, 'scheduledAt')),
        notes: rowText(row, 'notes'),
        snapshotStreet: rowText(row, 'street', 'address'),
        snapshotSuburb: rowText(row, 'suburb'),
        snapshotCity: rowText(row, 'city'),
        snapshotPostalCode: rowText(row, 'postalCode', 'postcode'),
        snapshotFormattedAddress: rowText(row, 'address', 'street'),
        snapshotSiteContactName:
          rowText(row, 'siteContactName') ?? customer?.contactPerson ?? customer?.name ?? null,
        snapshotSiteContactMobile: rowText(row, 'siteContactMobile', 'phone') ?? customer?.phone ?? null,
        snapshotSiteContactEmail: rowText(row, 'siteContactEmail', 'email') ?? customer?.email ?? null,
        snapshotCustomerName: customer?.name ?? rowText(row, 'customerName'),
        createdByUserId: userId,
        intakeMetadata: {
          historicalImport: true,
          sourceProvider: external.sourceProvider,
          sourceExternalId: external.sourceExternalId,
          sourceImportJobId: external.sourceImportJobId,
        },
        sourceProvider: external.sourceProvider,
        sourceExternalId: external.sourceExternalId,
        sourceImportJobId: external.sourceImportJobId,
        historicalFlags,
      })
      .returning();

    if (!created) throw new Error('Unable to create historical job.');
    if (jobNumber) await this.bumpJobNumberCounterIfNeeded(companyId, jobNumber);
    return created.id;
  }

  private async importQuote(
    companyId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const quoteNumber = rowText(row, 'quoteNumber');
    if (!quoteNumber) throw new Error('Original quote number is required for historical import.');

    const amountCents = parseHistoricalAmountToCents(rowText(row, 'amountCents', 'totalCents'));
    if (amountCents == null) throw new Error('Quote amount is required.');

    const provenance = this.provenance(row, context);

    // Prefer existing Xero (or prior import) record — never duplicate commercial identity.
    const quoteMatchFilters = [
      eq(quotes.quoteNumber, quoteNumber),
      eq(quotes.xeroQuoteNumber, quoteNumber),
    ];
    if (provenance.sourceExternalId) {
      quoteMatchFilters.push(
        and(
          eq(quotes.sourceProvider, provenance.sourceProvider),
          eq(quotes.sourceExternalId, provenance.sourceExternalId),
        )!,
      );
    }
    const existingMatches = await this.deps.db.query.quotes.findMany({
      where: and(eq(quotes.companyId, companyId), or(...quoteMatchFilters)),
      limit: 10,
    });
    const preferred = preferXeroCanonicalRecord(existingMatches);
    if (preferred) {
      const jobId = await this.resolveJobId(companyId, row);
      if (jobId && !preferred.jobId) {
        await this.deps.db
          .update(quotes)
          .set({ jobId, updatedAt: new Date() })
          .where(and(eq(quotes.id, preferred.id), eq(quotes.companyId, companyId)));
      }
      return preferred.id;
    }

    const customerId = await this.resolveCustomerId(companyId, row);
    const jobId = await this.resolveJobId(companyId, row);
    const propertyId = jobId
      ? null
      : await this.resolvePropertyId(companyId, customerId, row);
    const vatCents = parseHistoricalAmountToCents(rowText(row, 'vatCents')) ?? 0;
    const subtotalCents = Math.max(amountCents - vatCents, 0);
    const status = mapQuoteStatus(rowText(row, 'status'));
    const title = rowText(row, 'title', 'customerName') ?? quoteNumber;

    const [created] = await this.deps.db
      .insert(quotes)
      .values({
        companyId,
        customerId,
        jobId,
        propertyId,
        quoteNumber,
        title,
        status,
        amountCents,
        subtotalCents,
        vatCents,
        totalCents: amountCents,
        currency: rowText(row, 'currency') ?? 'ZAR',
        issuedAt: parseOptionalDate(rowText(row, 'issuedAt')) ?? undefined,
        validUntil: parseOptionalDate(rowText(row, 'validUntil')),
        notes: rowText(row, 'notes') ?? 'Historical quote imported into TITAN',
        internalNotes: 'HISTORICAL IMPORT — original number retained; not renumbered.',
        ...provenance,
      })
      .returning();

    if (!created) throw new Error('Unable to create historical quote.');
    return created.id;
  }

  private async importInvoice(
    companyId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const invoiceNumber = rowText(row, 'invoiceNumber');
    if (!invoiceNumber) {
      throw new Error('Original invoice number is required for historical import.');
    }

    const amountCents = parseHistoricalAmountToCents(rowText(row, 'amountCents', 'totalCents'));
    if (amountCents == null) throw new Error('Invoice amount is required.');

    const provenance = this.provenance(row, context);
    const invoiceMatchFilters = [
      eq(invoices.invoiceNumber, invoiceNumber),
      eq(invoices.xeroInvoiceNumber, invoiceNumber),
    ];
    if (provenance.sourceExternalId) {
      invoiceMatchFilters.push(
        and(
          eq(invoices.sourceProvider, provenance.sourceProvider),
          eq(invoices.sourceExternalId, provenance.sourceExternalId),
        )!,
      );
    }
    const existingMatches = await this.deps.db.query.invoices.findMany({
      where: and(eq(invoices.companyId, companyId), or(...invoiceMatchFilters)),
      limit: 10,
    });
    const preferred = preferXeroCanonicalRecord(existingMatches);
    if (preferred) {
      const jobId = await this.resolveJobId(companyId, row);
      if (jobId && !preferred.jobId) {
        await this.deps.db
          .update(invoices)
          .set({ jobId, updatedAt: new Date() })
          .where(and(eq(invoices.id, preferred.id), eq(invoices.companyId, companyId)));
      }
      return preferred.id;
    }

    const customerId = await this.resolveCustomerId(companyId, row);
    const jobId = await this.resolveJobId(companyId, row);
    const quoteNumber = rowText(row, 'quoteNumber');
    let quoteId: string | null = null;
    if (quoteNumber) {
      const quote = await this.deps.db.query.quotes.findFirst({
        where: and(eq(quotes.companyId, companyId), eq(quotes.quoteNumber, quoteNumber)),
      });
      quoteId = quote?.id ?? null;
    }

    const vatCents = parseHistoricalAmountToCents(rowText(row, 'vatCents')) ?? 0;
    const subtotalCents = Math.max(amountCents - vatCents, 0);
    const status = mapInvoiceStatus(rowText(row, 'status'));
    const isXero = provenance.sourceProvider === 'xero';

    const [created] = await this.deps.db
      .insert(invoices)
      .values({
        companyId,
        customerId,
        jobId,
        quoteId,
        invoiceNumber,
        xeroInvoiceNumber: isXero ? invoiceNumber : null,
        numberAuthority: isXero ? 'xero' : 'historical_import',
        title: rowText(row, 'title', 'customerName') ?? invoiceNumber,
        status,
        amountCents,
        subtotalCents,
        vatCents,
        totalCents: amountCents,
        amountPaidCents: status === 'paid' ? amountCents : 0,
        currency: rowText(row, 'currency') ?? 'ZAR',
        issuedAt: parseOptionalDate(rowText(row, 'issuedAt')) ?? new Date(),
        dueDate: parseOptionalDate(rowText(row, 'dueDate')),
        notes: rowText(row, 'notes') ?? 'Historical invoice imported into TITAN',
        ...provenance,
      })
      .returning();

    if (!created) throw new Error('Unable to create historical invoice.');
    return created.id;
  }

  private async importPayment(
    companyId: string,
    userId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const kindRaw = (rowText(row, 'kind') ?? 'PAYMENT_RECORD').toUpperCase();
    const kind =
      kindRaw.includes('PROOF') || kindRaw === 'POP'
        ? ('PROOF_OF_PAYMENT_DOCUMENT' as const)
        : ('PAYMENT_RECORD' as const);

    const invoiceNumber = rowText(row, 'invoiceNumber');
    if (!invoiceNumber) throw new Error('Invoice number is required for payment import.');

    const invoice = await this.deps.db.query.invoices.findFirst({
      where: and(
        eq(invoices.companyId, companyId),
        or(eq(invoices.invoiceNumber, invoiceNumber), eq(invoices.xeroInvoiceNumber, invoiceNumber)),
      ),
    });
    if (!invoice) {
      throw new Error(`Invoice ${invoiceNumber} not found — import/link the invoice first.`);
    }

    // Proof-of-payment alone never creates a confirmed paid ledger entry.
    if (!paymentImportCreatesLedgerEntry(kind, true)) {
      const doc = await this.deps.documentsService.createDocument(
        { companyId, userId },
        {
          title: rowText(row, 'title') ?? `Proof of payment — ${invoiceNumber}`,
          fileName: rowText(row, 'fileName') ?? `pop-${normalizeHistoricalDocumentNumber(invoiceNumber)}.pdf`,
          jobId: invoice.jobId,
          customerId: invoice.customerId,
        },
      );
      return doc.id;
    }

    const amountCents = parseHistoricalAmountToCents(rowText(row, 'amountCents'));
    if (amountCents == null || amountCents <= 0) {
      throw new Error('Payment amount is required for payment records.');
    }

    const provenance = this.provenance(row, context);
    if (provenance.sourceExternalId) {
      const existing = await this.deps.db.query.payments.findFirst({
        where: and(
          eq(payments.companyId, companyId),
          eq(payments.sourceProvider, provenance.sourceProvider),
          eq(payments.sourceExternalId, provenance.sourceExternalId),
        ),
      });
      if (existing) return existing.id;
    }

    const reference = rowText(row, 'reference');
    if (reference) {
      const byRef = await this.deps.db.query.payments.findFirst({
        where: and(
          eq(payments.companyId, companyId),
          eq(payments.invoiceId, invoice.id),
          eq(payments.reference, reference),
          eq(payments.amountCents, amountCents),
        ),
      });
      if (byRef) return byRef.id;
    }

    const [created] = await this.deps.db
      .insert(payments)
      .values({
        companyId,
        invoiceId: invoice.id,
        amountCents,
        currency: invoice.currency,
        method: mapPaymentMethod(rowText(row, 'method')),
        reference,
        paidAt: parseOptionalDate(rowText(row, 'paidAt')) ?? new Date(),
        notes: rowText(row, 'notes') ?? 'Historical payment imported into TITAN',
        recordedByUserId: userId,
        ...provenance,
      })
      .returning();

    if (!created) throw new Error('Unable to create historical payment.');

    const nextPaid = Math.min(invoice.totalCents, (invoice.amountPaidCents ?? 0) + amountCents);
    const nextStatus =
      nextPaid >= invoice.totalCents ? 'paid' : nextPaid > 0 ? 'partial' : invoice.status;
    await this.deps.db
      .update(invoices)
      .set({
        amountPaidCents: nextPaid,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.companyId, companyId)));

    return created.id;
  }

  /**
   * Price book = catalogue sell prices only.
   * Uses inventory item rows for SKU/code identity but never writes stock levels.
   * Matched SKUs do not overwrite current pricing.
   */
  private async importPriceBook(
    companyId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const code = rowText(row, 'code', 'sku');
    const name = rowText(row, 'name');
    if (!code || !name) throw new Error('Price book code and name are required.');

    const existing = await this.deps.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.companyId, companyId), ilike(inventoryItems.sku, code)),
    });
    if (existing) {
      // Do not silently overwrite current pricing.
      return existing.id;
    }

    const sellPriceCents = parseHistoricalAmountToCents(rowText(row, 'sellPriceCents', 'amountCents'));
    if (sellPriceCents == null) throw new Error('Price book sell price is required.');

    const provenance = this.provenance(row, context);
    const created = await this.deps.inventoryService.createItem(companyId, {
      sku: code,
      name,
      description: [
        rowText(row, 'description'),
        rowText(row, 'category') ? `Category: ${rowText(row, 'category')}` : null,
        rowText(row, 'taxTreatment') ? `Tax: ${rowText(row, 'taxTreatment')}` : null,
        'HISTORICAL_PRICE_BOOK — catalogue only; not stock on hand.',
        `source=${provenance.sourceProvider}`,
        provenance.sourceExternalId ? `externalId=${provenance.sourceExternalId}` : null,
      ]
        .filter(Boolean)
        .join(' | '),
      unit: rowText(row, 'unit') ?? 'each',
      sellPriceCents,
      unitCostCents: 0,
      status: 'active',
    });
    return created.id;
  }

  private async importDocument(
    companyId: string,
    userId: string,
    row: Record<string, string>,
    context?: HistoricalImportContext,
  ): Promise<string> {
    const fileName = rowText(row, 'fileName', 'title');
    if (!fileName) throw new Error('Document fileName is required.');

    const jobId = await this.resolveJobId(companyId, row);
    let customerId: string | null = null;
    try {
      customerId = await this.resolveCustomerId(companyId, row);
    } catch {
      customerId = null;
    }

    if (rowText(row, 'quoteNumber')) {
      const quoteNumber = rowText(row, 'quoteNumber')!;
      const quote = await this.deps.db.query.quotes.findFirst({
        where: and(eq(quotes.companyId, companyId), eq(quotes.quoteNumber, quoteNumber)),
      });
      if (quote) {
        customerId = quote.customerId;
      }
    }
    if (rowText(row, 'invoiceNumber')) {
      const invoiceNumber = rowText(row, 'invoiceNumber')!;
      const invoice = await this.deps.db.query.invoices.findFirst({
        where: and(
          eq(invoices.companyId, companyId),
          or(eq(invoices.invoiceNumber, invoiceNumber), eq(invoices.xeroInvoiceNumber, invoiceNumber)),
        ),
      });
      if (invoice) {
        customerId = invoice.customerId;
      }
    }

    const provenance = this.provenance(row, context);
    const photoPhase = rowText(row, 'photoPhase');
    const title =
      rowText(row, 'title') ??
      (photoPhase ? `Historical ${photoPhase} photo` : fileName);

    const created = await this.deps.documentsService.createDocument(
      { companyId, userId },
      {
        title,
        fileName,
        jobId,
        customerId,
        description: [
          photoPhase ? `photoPhase=${photoPhase}` : null,
          `source=${provenance.sourceProvider}`,
          provenance.sourceExternalId ? `externalId=${provenance.sourceExternalId}` : null,
          provenance.sourceImportJobId ? `importJobId=${provenance.sourceImportJobId}` : null,
          'HISTORICAL_ATTACHMENT',
        ]
          .filter(Boolean)
          .join(' | '),
      },
    );
    return created.id;
  }
}
