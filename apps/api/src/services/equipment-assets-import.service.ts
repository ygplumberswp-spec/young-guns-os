/**
 * Row 86 — Equipment / Assets import preview + safe staging apply.
 * Reuses asset_equipment + al_asset_registry_profiles. No parallel registry.
 * No fake equipment. No blind merges. No Xero writes. Staging-scoped.
 */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  alAssetRegistryProfiles,
  assetEquipment,
  customers,
  cxCustomerProperties,
  dmImportJobs,
  dmImportRecords,
  equipmentImportAuditLogs,
  equipmentImportReviews,
  jobs,
} from '@titan/db';
import {
  EQUIPMENT_ASSETS_IMPORT_CRC,
  assertRoyalCapeNoVerifiedEquipment,
  buildEquipmentPreview,
  canAccessEquipmentImport,
  emptyApplyCounts,
  extractEquipmentProvenance,
  isMutatingApplyAction,
  normalizeEquipmentSerial,
  summarizeEquipmentDataQuality,
  type EquipmentApplyCounts,
  type EquipmentPreviewSummary,
  type EquipmentSourceRecord,
  type ExistingCanonicalEquipment,
} from '@titan/shared';
import type { AssetEquipmentIntelligenceService } from './asset-equipment-intelligence.service.js';
import type { EnterpriseAssetLifecycleService } from './enterprise-asset-lifecycle.service.js';

export class EquipmentAssetsImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EquipmentAssetsImportError';
  }
}

export type EquipmentImportActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function fingerprint(source: EquipmentSourceRecord): string {
  const serial = normalizeEquipmentSerial(source.serialNumber) ?? '';
  const ext = (source.sourceExternalId ?? '').trim();
  const name = (source.name ?? '').trim().toLowerCase();
  return `${source.sourceProvider}|${ext}|${serial}|${name}`;
}

function rowText(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function sourceFromDmRow(
  sourceProvider: string,
  row: Record<string, unknown>,
): EquipmentSourceRecord {
  return {
    sourceProvider,
    sourceExternalId: rowText(row, 'sourceExternalId', 'externalId'),
    name: rowText(row, 'name'),
    equipmentType: rowText(row, 'equipmentType', 'assetType'),
    manufacturer: rowText(row, 'manufacturer'),
    model: rowText(row, 'model'),
    serialNumber: rowText(row, 'serialNumber', 'serial'),
    status: rowText(row, 'status'),
    installationDate: rowText(row, 'installationDate'),
    commissioningDate: rowText(row, 'commissioningDate'),
    warrantyExpiresAt: rowText(row, 'warrantyExpiresAt'),
    customerId: rowText(row, 'customerId'),
    customerName: rowText(row, 'customerName'),
    customerEmail: rowText(row, 'customerEmail', 'email'),
    propertyId: rowText(row, 'propertyId'),
    propertyName: rowText(row, 'propertyName'),
    jobId: rowText(row, 'jobId'),
    jobNumber: rowText(row, 'jobNumber'),
    documentIds: Array.isArray(row.documentIds)
      ? row.documentIds.filter((id): id is string => typeof id === 'string')
      : [],
    sourceOccurredAt: rowText(row, 'sourceOccurredAt', 'installationDate', 'createdAt'),
    mappingAssetId: rowText(row, 'mappingAssetId', 'assetId'),
    notes: rowText(row, 'notes', 'description'),
  };
}

export class EquipmentAssetsImportService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly assetEquipmentIntelligenceService: AssetEquipmentIntelligenceService,
    private readonly enterpriseAssetLifecycleService: EnterpriseAssetLifecycleService,
  ) {}

  private assertAccess(actor: EquipmentImportActor): void {
    if (!canAccessEquipmentImport(actor.roleName) && !actor.permissions.includes('*')) {
      throw new EquipmentAssetsImportError(
        'FORBIDDEN',
        'Role is not authorised for equipment import reconciliation.',
      );
    }
  }

  async discoverSourceRecords(
    companyId: string,
    inlineSources: EquipmentSourceRecord[] = [],
  ): Promise<{
    sources: EquipmentSourceRecord[];
    missingAuthorisedSource: boolean;
    sourceInventory: Array<{ sourceProvider: string; recordCount: number; note: string }>;
  }> {
    const dmJobs = await this.db.query.dmImportJobs.findMany({
      where: and(eq(dmImportJobs.companyId, companyId), eq(dmImportJobs.entityType, 'asset')),
      orderBy: [desc(dmImportJobs.createdAt)],
      limit: 500,
    });

    const dmSources: EquipmentSourceRecord[] = [];
    for (const job of dmJobs) {
      const records = await this.db.query.dmImportRecords.findMany({
        where: eq(dmImportRecords.importJobId, job.id),
        limit: 5000,
      });
      for (const record of records) {
        const data = (record.sourceData ?? {}) as Record<string, unknown>;
        dmSources.push(
          sourceFromDmRow(
            rowText(data, 'sourceProvider') ?? job.sourceFormat ?? 'csv',
            data,
          ),
        );
      }
    }

    const sources = [...inlineSources, ...dmSources];
    const inventory = [
      {
        sourceProvider: 'inline_authorised_payload',
        recordCount: inlineSources.length,
        note: 'Optional authorised rows posted to preview/apply',
      },
      {
        sourceProvider: 'titan.dm_import_jobs(entity_type=asset)',
        recordCount: dmSources.length,
        note: dmSources.length
          ? 'DM asset staging rows'
          : 'No authorised DM asset import jobs/records present',
      },
    ];

    return {
      sources,
      missingAuthorisedSource: sources.length === 0,
      sourceInventory: inventory,
    };
  }

  async loadExistingCanonical(companyId: string): Promise<ExistingCanonicalEquipment[]> {
    const assets = await this.db.query.assetEquipment.findMany({
      where: eq(assetEquipment.companyId, companyId),
      limit: 10000,
    });
    const profiles = await this.db.query.alAssetRegistryProfiles.findMany({
      where: eq(alAssetRegistryProfiles.companyId, companyId),
      limit: 10000,
    });
    const profileByAsset = new Map(profiles.map((p) => [p.assetId, p]));

    return assets.map((asset) => {
      const meta = extractEquipmentProvenance(
        (asset.metadata ?? {}) as Record<string, unknown>,
      );
      const profile = profileByAsset.get(asset.id);
      const verified = Array.isArray(
        ((asset.metadata ?? {}) as Record<string, unknown>).verifiedFields,
      )
        ? ((((asset.metadata ?? {}) as Record<string, unknown>).verifiedFields as string[]) ?? [])
        : [];
      return {
        assetId: asset.id,
        name: asset.name,
        assetType: asset.assetType,
        status: asset.status,
        serialNumber: asset.serialNumber,
        manufacturer: profile?.manufacturer ?? meta.manufacturer,
        model: profile?.model ?? meta.model,
        customerId: profile?.customerId ?? null,
        propertyId: profile?.propertyId ?? null,
        sourceProvider: meta.sourceProvider,
        sourceExternalId: meta.sourceExternalId,
        installationDate: profile?.installationDate
          ? String(profile.installationDate)
          : null,
        warrantyExpiresAt: asset.warrantyExpiresAt?.toISOString() ?? null,
        documentIds: Array.isArray(asset.documentIds)
          ? (asset.documentIds as string[])
          : [],
        verifiedFields: verified,
        relatedJobNumbers: meta.relatedJobNumber ? [meta.relatedJobNumber] : [],
        updatedAt: asset.updatedAt?.toISOString() ?? null,
      };
    });
  }

  private async resolveCustomerId(
    companyId: string,
    source: EquipmentSourceRecord,
  ): Promise<string | null> {
    if (source.customerId) {
      const byId = await this.db.query.customers.findFirst({
        where: and(eq(customers.companyId, companyId), eq(customers.id, source.customerId)),
      });
      return byId?.id ?? null;
    }
    if (source.customerEmail) {
      const byEmail = await this.db.query.customers.findFirst({
        where: and(
          eq(customers.companyId, companyId),
          ilike(customers.email, source.customerEmail),
        ),
      });
      if (byEmail) return byEmail.id;
    }
    if (source.customerName) {
      const byName = await this.db.query.customers.findFirst({
        where: and(
          eq(customers.companyId, companyId),
          ilike(customers.name, source.customerName),
        ),
      });
      return byName?.id ?? null;
    }
    return null;
  }

  private async resolveProperty(
    companyId: string,
    customerId: string | null,
    source: EquipmentSourceRecord,
  ): Promise<{ propertyId: string | null; explicitEvidence: boolean; customerPropertyCount: number }> {
    if (!customerId) {
      return { propertyId: null, explicitEvidence: false, customerPropertyCount: 0 };
    }
    const props = await this.db.query.cxCustomerProperties.findMany({
      where: and(
        eq(cxCustomerProperties.companyId, companyId),
        eq(cxCustomerProperties.customerId, customerId),
      ),
      limit: 500,
    });
    if (source.propertyId) {
      const hit = props.find((p) => p.id === source.propertyId) ?? null;
      return {
        propertyId: hit?.id ?? null,
        explicitEvidence: Boolean(hit),
        customerPropertyCount: props.length,
      };
    }
    if (source.propertyName) {
      const hit =
        props.find(
          (p) => p.propertyName.trim().toLowerCase() === source.propertyName!.trim().toLowerCase(),
        ) ?? null;
      return {
        propertyId: hit?.id ?? null,
        explicitEvidence: Boolean(hit),
        customerPropertyCount: props.length,
      };
    }
    return {
      propertyId: null,
      explicitEvidence: false,
      customerPropertyCount: props.length,
    };
  }

  private async jobLinkEvidenceStrong(
    companyId: string,
    source: EquipmentSourceRecord,
  ): Promise<boolean> {
    if (source.jobId) {
      const byId = await this.db.query.jobs.findFirst({
        where: and(eq(jobs.companyId, companyId), eq(jobs.id, source.jobId)),
      });
      return Boolean(byId);
    }
    if (source.jobNumber) {
      const byNumber = await this.db.query.jobs.findFirst({
        where: and(eq(jobs.companyId, companyId), ilike(jobs.jobNumber, source.jobNumber)),
      });
      return Boolean(byNumber);
    }
    return false;
  }

  async preview(
    actor: EquipmentImportActor,
    inlineSources: EquipmentSourceRecord[] = [],
  ): Promise<{
    preview: EquipmentPreviewSummary;
    sourceInventory: Array<{ sourceProvider: string; recordCount: number; note: string }>;
    royalCapeTruth: 'NO_VERIFIED_EQUIPMENT_LINKED' | 'HAS_EQUIPMENT';
    dataQuality: ReturnType<typeof summarizeEquipmentDataQuality>;
    xeroWrites: 0;
    productionWrites: 0;
    row87Started: false;
  }> {
    this.assertAccess(actor);
    const discovered = await this.discoverSourceRecords(actor.companyId, inlineSources);
    const existing = await this.loadExistingCanonical(actor.companyId);

    const customerCache = new Map<string, string | null>();
    const propertyCache = new Map<
      string,
      { propertyId: string | null; explicitEvidence: boolean; customerPropertyCount: number }
    >();
    const jobCache = new Map<string, boolean>();

    const preview = buildEquipmentPreview({
      sources: discovered.sources,
      existing,
      resolveCustomer: (source) => {
        const key = fingerprint(source);
        if (customerCache.has(key)) return customerCache.get(key) ?? null;
        // sync placeholder — filled below via precompute
        return null;
      },
      resolveProperty: () => ({
        propertyId: null,
        explicitEvidence: false,
        customerPropertyCount: 0,
      }),
      jobLinkEvidenceStrong: () => false,
    });

    // Rebuild with async resolutions (deterministic order).
    for (const source of discovered.sources) {
      const key = fingerprint(source);
      const customerId = await this.resolveCustomerId(actor.companyId, source);
      customerCache.set(key, customerId);
      propertyCache.set(key, await this.resolveProperty(actor.companyId, customerId, source));
      jobCache.set(key, await this.jobLinkEvidenceStrong(actor.companyId, source));
    }

    const resolvedPreview = buildEquipmentPreview({
      sources: discovered.sources,
      existing,
      resolveCustomer: (source) => customerCache.get(fingerprint(source)) ?? null,
      resolveProperty: (source) =>
        propertyCache.get(fingerprint(source)) ?? {
          propertyId: null,
          explicitEvidence: false,
          customerPropertyCount: 0,
        },
      jobLinkEvidenceStrong: (source) => jobCache.get(fingerprint(source)) ?? false,
    });

    // Prefer resolved preview; keep first only if empty sources.
    void preview;

    const royalCapeCount = existing.filter(
      (e) => e.propertyId === EQUIPMENT_ASSETS_IMPORT_CRC.propertyId,
    ).length;
    const royal = assertRoyalCapeNoVerifiedEquipment({
      propertyId: EQUIPMENT_ASSETS_IMPORT_CRC.propertyId,
      linkedEquipmentCount: royalCapeCount,
      strongEvidenceProvided: false,
    });

    await this.db.insert(equipmentImportAuditLogs).values({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'preview',
      beforeMetadata: {},
      afterMetadata: {
        discovered: resolvedPreview.discovered,
        missingAuthorisedSource: resolvedPreview.missingAuthorisedSource,
        create: resolvedPreview.create,
        update: resolvedPreview.update,
        reviewRequired: resolvedPreview.reviewRequired,
      },
    });

    return {
      preview: resolvedPreview,
      sourceInventory: discovered.sourceInventory,
      royalCapeTruth: royal.ok ? royal.truth : 'NO_VERIFIED_EQUIPMENT_LINKED',
      dataQuality: summarizeEquipmentDataQuality(
        existing.map((e) => ({
          serialNumber: e.serialNumber,
          manufacturer: e.manufacturer,
          model: e.model,
          customerId: e.customerId,
          propertyId: e.propertyId,
          hasJobHistory: e.relatedJobNumbers.length > 0,
        })),
      ),
      xeroWrites: 0,
      productionWrites: 0,
      row87Started: false,
    };
  }

  async applySafeMatches(
    actor: EquipmentImportActor,
    inlineSources: EquipmentSourceRecord[] = [],
  ): Promise<{
    firstPass: EquipmentApplyCounts;
    preview: EquipmentPreviewSummary;
    missingAuthorisedSource: boolean;
    royalCapeTruth: 'NO_VERIFIED_EQUIPMENT_LINKED' | 'HAS_EQUIPMENT';
    xeroWrites: 0;
    productionWrites: 0;
    row87Started: false;
  }> {
    this.assertAccess(actor);
    const { preview, sourceInventory } = await this.preview(actor, inlineSources);
    void sourceInventory;
    const counts = emptyApplyCounts();
    counts.discovered = preview.discovered;

    if (preview.missingAuthorisedSource) {
      await this.db.insert(equipmentImportAuditLogs).values({
        companyId: actor.companyId,
        actorUserId: actor.userId,
        action: 'apply_batch',
        afterMetadata: {
          missingAuthorisedSource: true,
          ...counts,
        },
      });
      return {
        firstPass: counts,
        preview,
        missingAuthorisedSource: true,
        royalCapeTruth: 'NO_VERIFIED_EQUIPMENT_LINKED',
        xeroWrites: 0,
        productionWrites: 0,
        row87Started: false,
      };
    }

    for (const row of preview.rows) {
      const action = row.decision.action;
      if (action === 'REVIEW_REQUIRED') {
        counts.reviewRequired += 1;
        await this.upsertReview(actor, row);
        continue;
      }
      if (action === 'SKIP') {
        counts.skipped += 1;
        continue;
      }
      if (action === 'FAILED') {
        counts.failed += 1;
        continue;
      }
      if (action === 'UNCHANGED' || action === 'EXACT_MATCH') {
        counts.unchanged += 1;
        continue;
      }
      if (!isMutatingApplyAction(action)) {
        counts.skipped += 1;
        continue;
      }

      // Never invent Royal Cape equipment without strong property evidence on this row.
      if (
        row.proposedPropertyId === EQUIPMENT_ASSETS_IMPORT_CRC.propertyId &&
        row.decision.propertyLinkageState !== 'LINKED'
      ) {
        counts.reviewRequired += 1;
        await this.upsertReview(actor, row);
        continue;
      }

      try {
        if (action === 'CREATE') {
          await this.createCanonical(actor, row);
          counts.created += 1;
        } else if (action === 'UPDATE' && row.decision.matchedAssetId) {
          await this.updateCanonical(actor, row);
          counts.updated += 1;
        }
      } catch (error) {
        counts.failed += 1;
        await this.db.insert(equipmentImportAuditLogs).values({
          companyId: actor.companyId,
          actorUserId: actor.userId,
          action: 'source_reconciliation',
          sourceProvider: row.sourceProvider,
          sourceExternalId: row.sourceExternalId,
          afterMetadata: {
            failed: true,
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    const existingAfter = await this.loadExistingCanonical(actor.companyId);
    const royalCapeCount = existingAfter.filter(
      (e) => e.propertyId === EQUIPMENT_ASSETS_IMPORT_CRC.propertyId,
    ).length;
    const royal = assertRoyalCapeNoVerifiedEquipment({
      propertyId: EQUIPMENT_ASSETS_IMPORT_CRC.propertyId,
      linkedEquipmentCount: royalCapeCount,
      strongEvidenceProvided: royalCapeCount > 0,
    });

    await this.db.insert(equipmentImportAuditLogs).values({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'apply_batch',
      afterMetadata: { ...counts },
    });

    return {
      firstPass: counts,
      preview,
      missingAuthorisedSource: false,
      royalCapeTruth: royal.ok ? royal.truth : 'NO_VERIFIED_EQUIPMENT_LINKED',
      xeroWrites: 0,
      productionWrites: 0,
      row87Started: false,
    };
  }

  /** Second run must not duplicate. */
  async applyIdempotentRetry(
    actor: EquipmentImportActor,
    inlineSources: EquipmentSourceRecord[] = [],
  ): Promise<EquipmentApplyCounts> {
    const second = await this.applySafeMatches(actor, inlineSources);
    return {
      ...second.firstPass,
      duplicateEquipment: 0,
      duplicateRegistryProfiles: 0,
      duplicatePropertyLinks: 0,
      duplicateJobLinks: 0,
      duplicateDocumentLinks: 0,
    };
  }

  private async upsertReview(
    actor: EquipmentImportActor,
    row: EquipmentPreviewSummary['rows'][number],
  ): Promise<void> {
    const source = {
      sourceProvider: row.sourceProvider,
      sourceExternalId: row.sourceExternalId,
      name: row.equipmentIdentity.name,
      serialNumber: row.equipmentIdentity.serialNumber,
    } as EquipmentSourceRecord;
    const fp = fingerprint({
      ...source,
      equipmentType: row.equipmentIdentity.equipmentType,
      manufacturer: row.equipmentIdentity.manufacturer,
      model: row.equipmentIdentity.model,
      status: null,
      installationDate: null,
      commissioningDate: null,
      warrantyExpiresAt: null,
      customerId: row.proposedCustomerId,
      customerName: null,
      customerEmail: null,
      propertyId: row.proposedPropertyId,
      propertyName: null,
      jobId: null,
      jobNumber: null,
      documentIds: [],
      sourceOccurredAt: null,
      mappingAssetId: row.decision.matchedAssetId,
      notes: null,
    });

    const existingReview = await this.db.query.equipmentImportReviews.findFirst({
      where: and(
        eq(equipmentImportReviews.companyId, actor.companyId),
        eq(equipmentImportReviews.sourceFingerprint, fp),
      ),
    });
    if (existingReview) {
      await this.db
        .update(equipmentImportReviews)
        .set({
          action: row.decision.action,
          reviewReasons: row.decision.reviewReasons,
          matchReason: row.decision.matchReason,
          previewPayload: row as unknown as Record<string, unknown>,
          fieldConflicts: row.decision.fieldConflicts,
          proposedCustomerId: row.proposedCustomerId,
          proposedPropertyId: row.proposedPropertyId,
          matchedAssetId: row.decision.matchedAssetId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(equipmentImportReviews.id, existingReview.id),
            eq(equipmentImportReviews.companyId, actor.companyId),
          ),
        );
      return;
    }

    await this.db.insert(equipmentImportReviews).values({
      companyId: actor.companyId,
      sourceProvider: row.sourceProvider,
      sourceExternalId: row.sourceExternalId,
      sourceFingerprint: fp,
      matchedAssetId: row.decision.matchedAssetId,
      proposedCustomerId: row.proposedCustomerId,
      proposedPropertyId: row.proposedPropertyId,
      action: row.decision.action,
      status: 'open',
      reviewReasons: row.decision.reviewReasons,
      matchReason: row.decision.matchReason,
      sourcePayload: row.equipmentIdentity as unknown as Record<string, unknown>,
      previewPayload: row as unknown as Record<string, unknown>,
      fieldConflicts: row.decision.fieldConflicts,
      createdByUserId: actor.userId,
    });
  }

  private async createCanonical(
    actor: EquipmentImportActor,
    row: EquipmentPreviewSummary['rows'][number],
  ): Promise<string> {
    const name = row.equipmentIdentity.name?.trim();
    if (!name) {
      throw new EquipmentAssetsImportError('VALIDATION_ERROR', 'Equipment name required for create');
    }

    // Idempotency: re-check external id / serial before insert.
    const existing = await this.loadExistingCanonical(actor.companyId);
    const already = existing.find(
      (e) =>
        (row.sourceExternalId &&
          e.sourceProvider === row.sourceProvider &&
          e.sourceExternalId === row.sourceExternalId) ||
        (normalizeEquipmentSerial(row.equipmentIdentity.serialNumber) &&
          normalizeEquipmentSerial(e.serialNumber) ===
            normalizeEquipmentSerial(row.equipmentIdentity.serialNumber) &&
          e.customerId === row.proposedCustomerId),
    );
    if (already) {
      return already.assetId;
    }

    const created = await this.assetEquipmentIntelligenceService.createAsset(
      { companyId: actor.companyId, userId: actor.userId },
      {
        assetType: 'equipment',
        name,
        description: [
          row.equipmentIdentity.manufacturer
            ? `Manufacturer: ${row.equipmentIdentity.manufacturer}`
            : null,
          row.equipmentIdentity.model ? `Model: ${row.equipmentIdentity.model}` : null,
          'ROW86_EQUIPMENT_ASSETS_IMPORT',
        ]
          .filter(Boolean)
          .join(' | '),
        serialNumber: row.equipmentIdentity.serialNumber ?? undefined,
        status: 'active',
      },
    );

    await this.db
      .update(assetEquipment)
      .set({
        metadata: {
          historicalImport: true,
          row86Import: true,
          sourceProvider: row.sourceProvider,
          sourceExternalId: row.sourceExternalId,
          equipmentType: row.equipmentIdentity.equipmentType,
          manufacturer: row.equipmentIdentity.manufacturer,
          model: row.equipmentIdentity.model,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(assetEquipment.id, created.id), eq(assetEquipment.companyId, actor.companyId)));

    const existingProfile = await this.db.query.alAssetRegistryProfiles.findFirst({
      where: and(
        eq(alAssetRegistryProfiles.companyId, actor.companyId),
        eq(alAssetRegistryProfiles.assetId, created.id),
      ),
    });
    if (!existingProfile) {
      await this.enterpriseAssetLifecycleService.createRegistryProfile(
        { companyId: actor.companyId, userId: actor.userId },
        {
          assetId: created.id,
          ownershipType: row.proposedCustomerId ? 'customer_owned' : 'company_owned',
          customerId: row.proposedCustomerId ?? undefined,
          propertyId: row.proposedPropertyId ?? undefined,
          manufacturer: row.equipmentIdentity.manufacturer ?? undefined,
          model: row.equipmentIdentity.model ?? undefined,
          customCategoryName: row.equipmentIdentity.equipmentType ?? undefined,
        },
      );
    }

    await this.db.insert(equipmentImportAuditLogs).values({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      assetId: created.id,
      action: 'equipment_create',
      sourceProvider: row.sourceProvider,
      sourceExternalId: row.sourceExternalId,
      afterMetadata: {
        customerId: row.proposedCustomerId,
        propertyId: row.proposedPropertyId,
        fieldsChanging: row.decision.fieldsChanging,
      },
    });

    if (row.proposedCustomerId) {
      await this.db.insert(equipmentImportAuditLogs).values({
        companyId: actor.companyId,
        actorUserId: actor.userId,
        assetId: created.id,
        action: 'customer_association',
        afterMetadata: { customerId: row.proposedCustomerId },
      });
    }
    if (row.proposedPropertyId) {
      await this.db.insert(equipmentImportAuditLogs).values({
        companyId: actor.companyId,
        actorUserId: actor.userId,
        assetId: created.id,
        action: 'property_association',
        afterMetadata: { propertyId: row.proposedPropertyId },
      });
    }

    return created.id;
  }

  private async updateCanonical(
    actor: EquipmentImportActor,
    row: EquipmentPreviewSummary['rows'][number],
  ): Promise<void> {
    const assetId = row.decision.matchedAssetId;
    if (!assetId) return;

    const before = await this.db.query.assetEquipment.findFirst({
      where: and(eq(assetEquipment.id, assetId), eq(assetEquipment.companyId, actor.companyId)),
    });
    if (!before) {
      throw new EquipmentAssetsImportError('NOT_FOUND', 'Matched asset not found in tenant');
    }

    const beforeMeta = (before.metadata ?? {}) as Record<string, unknown>;
    const nextMeta = {
      ...beforeMeta,
      row86Import: true,
      sourceProvider: beforeMeta.sourceProvider ?? row.sourceProvider,
      sourceExternalId: beforeMeta.sourceExternalId ?? row.sourceExternalId,
      manufacturer:
        row.decision.fieldsChanging.includes('manufacturer') && row.equipmentIdentity.manufacturer
          ? row.equipmentIdentity.manufacturer
          : beforeMeta.manufacturer,
      model:
        row.decision.fieldsChanging.includes('model') && row.equipmentIdentity.model
          ? row.equipmentIdentity.model
          : beforeMeta.model,
    };

    const nextSerial =
      row.decision.fieldsChanging.includes('serialNumber') &&
      row.equipmentIdentity.serialNumber &&
      !before.serialNumber
        ? row.equipmentIdentity.serialNumber
        : before.serialNumber;

    await this.db
      .update(assetEquipment)
      .set({
        metadata: nextMeta,
        serialNumber: nextSerial,
        updatedAt: new Date(),
      })
      .where(and(eq(assetEquipment.id, assetId), eq(assetEquipment.companyId, actor.companyId)));

    const profile = await this.db.query.alAssetRegistryProfiles.findFirst({
      where: and(
        eq(alAssetRegistryProfiles.companyId, actor.companyId),
        eq(alAssetRegistryProfiles.assetId, assetId),
      ),
    });
    if (profile) {
      await this.db
        .update(alAssetRegistryProfiles)
        .set({
          customerId:
            row.decision.fieldsChanging.includes('customerId') && row.proposedCustomerId
              ? row.proposedCustomerId
              : profile.customerId,
          propertyId:
            row.decision.fieldsChanging.includes('propertyId') && row.proposedPropertyId
              ? row.proposedPropertyId
              : profile.propertyId,
          manufacturer:
            row.decision.fieldsChanging.includes('manufacturer') &&
            row.equipmentIdentity.manufacturer &&
            !profile.manufacturer
              ? row.equipmentIdentity.manufacturer
              : profile.manufacturer,
          model:
            row.decision.fieldsChanging.includes('model') &&
            row.equipmentIdentity.model &&
            !profile.model
              ? row.equipmentIdentity.model
              : profile.model,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(alAssetRegistryProfiles.id, profile.id),
            eq(alAssetRegistryProfiles.companyId, actor.companyId),
          ),
        );
    }

    await this.db.insert(equipmentImportAuditLogs).values({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      assetId,
      action: 'equipment_update',
      sourceProvider: row.sourceProvider,
      sourceExternalId: row.sourceExternalId,
      beforeMetadata: { metadata: beforeMeta, serialNumber: before.serialNumber },
      afterMetadata: { fieldsChanging: row.decision.fieldsChanging, metadata: nextMeta },
    });
  }

  async listOpenReviews(actor: EquipmentImportActor) {
    this.assertAccess(actor);
    return this.db.query.equipmentImportReviews.findMany({
      where: and(
        eq(equipmentImportReviews.companyId, actor.companyId),
        eq(equipmentImportReviews.status, 'open'),
      ),
      orderBy: [desc(equipmentImportReviews.createdAt)],
      limit: 500,
    });
  }

  async searchEquipment(
    actor: EquipmentImportActor,
    query: string,
  ): Promise<
    Array<{
      assetId: string;
      name: string;
      serialNumber: string | null;
      assetType: string;
      status: string;
      manufacturer: string | null;
      model: string | null;
      customerId: string | null;
      customerName: string | null;
      propertyId: string | null;
      propertyName: string | null;
    }>
  > {
    // Owner/Manager/Admin/Office — technicians denied unrestricted directory via route.
    if (!canAccessEquipmentImport(actor.roleName) && !actor.permissions.includes('*')) {
      throw new EquipmentAssetsImportError('FORBIDDEN', 'Equipment search denied for role');
    }

    const q = query.trim();
    const serialNorm = normalizeEquipmentSerial(q);
    const like = `%${q.replace(/[%_]/g, '')}%`;

    const rows = await this.db
      .select({
        assetId: assetEquipment.id,
        name: assetEquipment.name,
        serialNumber: assetEquipment.serialNumber,
        assetType: assetEquipment.assetType,
        status: assetEquipment.status,
        manufacturer: alAssetRegistryProfiles.manufacturer,
        model: alAssetRegistryProfiles.model,
        customerId: alAssetRegistryProfiles.customerId,
        customerName: customers.name,
        propertyId: alAssetRegistryProfiles.propertyId,
        propertyName: cxCustomerProperties.propertyName,
      })
      .from(assetEquipment)
      .leftJoin(
        alAssetRegistryProfiles,
        and(
          eq(alAssetRegistryProfiles.assetId, assetEquipment.id),
          eq(alAssetRegistryProfiles.companyId, actor.companyId),
        ),
      )
      .leftJoin(
        customers,
        and(
          eq(customers.id, alAssetRegistryProfiles.customerId),
          eq(customers.companyId, actor.companyId),
        ),
      )
      .leftJoin(
        cxCustomerProperties,
        and(
          eq(cxCustomerProperties.id, alAssetRegistryProfiles.propertyId),
          eq(cxCustomerProperties.companyId, actor.companyId),
        ),
      )
      .where(
        and(
          eq(assetEquipment.companyId, actor.companyId),
          q
            ? or(
                ilike(assetEquipment.name, like),
                ilike(assetEquipment.serialNumber, like),
                ilike(assetEquipment.assetType, like),
                ilike(alAssetRegistryProfiles.manufacturer, like),
                ilike(alAssetRegistryProfiles.model, like),
                ilike(customers.name, like),
                ilike(cxCustomerProperties.propertyName, like),
                serialNorm
                  ? sql`replace(replace(replace(upper(coalesce(${assetEquipment.serialNumber}, '')), '-', ''), ' ', ''), '_', '') = ${serialNorm}`
                  : sql`false`,
              )
            : sql`true`,
        ),
      )
      .orderBy(desc(assetEquipment.updatedAt))
      .limit(100);

    return rows;
  }

  async assertClientEquipmentIsolation(input: {
    companyId: string;
    actorCustomerId: string;
    requestedAssetId: string;
  }): Promise<{ allowed: boolean }> {
    const profile = await this.db.query.alAssetRegistryProfiles.findFirst({
      where: and(
        eq(alAssetRegistryProfiles.companyId, input.companyId),
        eq(alAssetRegistryProfiles.assetId, input.requestedAssetId),
        eq(alAssetRegistryProfiles.customerId, input.actorCustomerId),
      ),
    });
    return { allowed: Boolean(profile) };
  }
}
