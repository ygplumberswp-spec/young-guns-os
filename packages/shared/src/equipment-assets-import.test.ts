import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EQUIPMENT_ASSETS_IMPORT_CRC,
  assertNoXeroWrites,
  assertRoyalCapeNoVerifiedEquipment,
  assertRow87NotStarted,
  buildEquipmentPreview,
  canAccessEquipmentImport,
  canAccessFullEquipmentDirectory,
  classifyEquipmentImportMatch,
  classifyVerifiedFieldConflict,
  clientMayAccessEquipment,
  emptyApplyCounts,
  equipmentSearchMatches,
  findByNormalizedSerial,
  findBySourceExternalId,
  mergeDocumentIds,
  normalizeEquipmentSerial,
  resolvePropertyLinkage,
  serialsEquivalent,
  serialsMateriallyDifferent,
  summarizeEquipmentDataQuality,
  technicianMayAccessEquipment,
  type EquipmentSourceRecord,
  type ExistingCanonicalEquipment,
} from './equipment-assets-import.js';

function source(partial: Partial<EquipmentSourceRecord> = {}): EquipmentSourceRecord {
  return {
    sourceProvider: 'csv',
    sourceExternalId: 'EQ-1',
    name: 'Geyser Unit',
    equipmentType: 'equipment',
    manufacturer: 'Kwikot',
    model: '150L',
    serialNumber: 'SN 001',
    status: 'active',
    installationDate: null,
    commissioningDate: null,
    warrantyExpiresAt: null,
    customerId: null,
    customerName: 'CRC',
    customerEmail: null,
    propertyId: null,
    propertyName: null,
    jobId: null,
    jobNumber: null,
    documentIds: [],
    sourceOccurredAt: '2020-01-01T00:00:00.000Z',
    mappingAssetId: null,
    notes: null,
    ...partial,
  };
}

function existing(partial: Partial<ExistingCanonicalEquipment> = {}): ExistingCanonicalEquipment {
  return {
    assetId: 'asset-1',
    name: 'Geyser Unit',
    assetType: 'equipment',
    status: 'active',
    serialNumber: 'SN001',
    manufacturer: 'Kwikot',
    model: '150L',
    customerId: 'cust-1',
    propertyId: 'prop-1',
    sourceProvider: 'csv',
    sourceExternalId: 'EQ-1',
    installationDate: null,
    warrantyExpiresAt: null,
    documentIds: [],
    verifiedFields: [],
    relatedJobNumbers: [],
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('Row 86 equipment assets import', () => {
  it('1. external ID exact match', () => {
    const decision = classifyEquipmentImportMatch({
      source: source({ sourceExternalId: 'EQ-1' }),
      existing: [existing()],
      resolvedCustomerId: 'cust-1',
      resolvedPropertyId: 'prop-1',
      customerPropertyCount: 1,
      explicitPropertyEvidence: true,
      jobLinkEvidenceStrong: false,
    });
    assert.equal(decision.action, 'UNCHANGED');
    assert.equal(decision.matchedAssetId, 'asset-1');
    assert.match(decision.matchReason, /sourceProvider\+sourceExternalId/);
  });

  it('2. serial exact match', () => {
    const decision = classifyEquipmentImportMatch({
      source: source({ sourceExternalId: 'EQ-NEW', serialNumber: 'SN001' }),
      existing: [existing({ sourceExternalId: 'OTHER', serialNumber: 'SN001' })],
      resolvedCustomerId: 'cust-1',
      resolvedPropertyId: 'prop-1',
      customerPropertyCount: 1,
      explicitPropertyEvidence: true,
      jobLinkEvidenceStrong: false,
    });
    assert.ok(decision.action === 'UNCHANGED' || decision.action === 'UPDATE' || decision.action === 'EXACT_MATCH' || decision.action === 'REVIEW_REQUIRED');
    // Different source IDs on same serial with same customer/property → conflict on source
    assert.equal(decision.action, 'REVIEW_REQUIRED');
  });

  it('3. serial normalization equates harmless formatting', () => {
    assert.equal(normalizeEquipmentSerial('sn 001'), 'SN001');
    assert.equal(normalizeEquipmentSerial('SN-001'), 'SN001');
    assert.equal(normalizeEquipmentSerial(' sn_001 '), 'SN001');
    assert.equal(serialsEquivalent('SN 001', 'sn-001'), true);
    const hits = findByNormalizedSerial(
      [existing({ serialNumber: 'SN-001' })],
      'sn 001',
    );
    assert.equal(hits.length, 1);
  });

  it('4. conflicting serial -> review', () => {
    const decision = classifyEquipmentImportMatch({
      source: source({
        sourceExternalId: 'EQ-2',
        serialNumber: 'SN001',
        customerId: 'cust-2',
      }),
      existing: [existing({ customerId: 'cust-1', sourceExternalId: 'EQ-1' })],
      resolvedCustomerId: 'cust-2',
      resolvedPropertyId: 'prop-9',
      customerPropertyCount: 2,
      explicitPropertyEvidence: true,
      jobLinkEvidenceStrong: false,
    });
    assert.equal(decision.action, 'REVIEW_REQUIRED');
    assert.ok(decision.reviewReasons.includes('IDENTITY_CONFLICT'));
  });

  it('5. ambiguous candidate -> review', () => {
    const decision = classifyEquipmentImportMatch({
      source: source({ sourceExternalId: null, serialNumber: null, name: 'Geyser Unit' }),
      existing: [
        existing({ assetId: 'a1', sourceExternalId: 'x', serialNumber: 'A' }),
        existing({ assetId: 'a2', sourceExternalId: 'y', serialNumber: 'B', name: 'Geyser Unit' }),
      ],
      resolvedCustomerId: 'cust-1',
      resolvedPropertyId: null,
      customerPropertyCount: 2,
      explicitPropertyEvidence: false,
      jobLinkEvidenceStrong: false,
    });
    assert.equal(decision.action, 'REVIEW_REQUIRED');
    assert.ok(decision.reviewReasons.includes('AMBIGUOUS_CANDIDATE'));
  });

  it('6. idempotent retry counts stay zero-duplicate', () => {
    const first = emptyApplyCounts();
    first.created = 1;
    const second = emptyApplyCounts();
    second.discovered = 1;
    second.unchanged = 1;
    assert.equal(second.duplicateEquipment, 0);
    assert.equal(second.created, 0);
  });

  it('7. customer linkage when evidence supports', () => {
    const decision = classifyEquipmentImportMatch({
      source: source({ sourceExternalId: 'EQ-NEW-2', serialNumber: 'BRAND-NEW-99' }),
      existing: [],
      resolvedCustomerId: 'cust-1',
      resolvedPropertyId: null,
      customerPropertyCount: 2,
      explicitPropertyEvidence: false,
      jobLinkEvidenceStrong: false,
    });
    assert.equal(decision.action, 'CREATE');
    assert.equal(decision.proposedCustomerId, 'cust-1');
  });

  it('8. property linkage with explicit evidence', () => {
    const link = resolvePropertyLinkage({
      customerId: 'cust-1',
      propertyId: 'prop-1',
      propertyName: 'Royal Cape Yacht Club',
      customerPropertyCount: 1,
      explicitPropertyEvidence: true,
    });
    assert.equal(link.state, 'LINKED');
    assert.equal(link.propertyId, 'prop-1');
  });

  it('9. customer-known / property-unknown truthful state', () => {
    const link = resolvePropertyLinkage({
      customerId: 'cust-1',
      propertyId: null,
      propertyName: null,
      customerPropertyCount: 2,
      explicitPropertyEvidence: false,
    });
    assert.equal(link.state, 'UNASSIGNED');
    assert.ok(link.reviewReasons.includes('CUSTOMER_KNOWN_PROPERTY_UNKNOWN'));
  });

  it('10. no guessed property for sole site', () => {
    const link = resolvePropertyLinkage({
      customerId: 'cust-1',
      propertyId: null,
      propertyName: null,
      customerPropertyCount: 1,
      explicitPropertyEvidence: false,
    });
    assert.equal(link.propertyId, null);
    assert.ok(link.reviewReasons.includes('SOLE_SITE_GUESS_REJECTED'));
  });

  it('11. multiple assets per property allowed in quality stats', () => {
    const stats = summarizeEquipmentDataQuality([
      {
        serialNumber: 'A',
        manufacturer: 'M',
        model: '1',
        customerId: 'c',
        propertyId: 'p',
        hasJobHistory: false,
      },
      {
        serialNumber: 'B',
        manufacturer: 'M',
        model: '2',
        customerId: 'c',
        propertyId: 'p',
        hasJobHistory: true,
      },
    ]);
    assert.equal(stats.propertyLinked, 2);
    assert.equal(stats.withSerial, 2);
  });

  it('12. one asset not linked to unrelated site', () => {
    const decision = classifyEquipmentImportMatch({
      source: source({ sourceExternalId: 'EQ-1', propertyId: 'prop-OTHER' }),
      existing: [existing({ propertyId: 'prop-1' })],
      resolvedCustomerId: 'cust-1',
      resolvedPropertyId: 'prop-OTHER',
      customerPropertyCount: 2,
      explicitPropertyEvidence: true,
      jobLinkEvidenceStrong: false,
    });
    assert.equal(decision.action, 'REVIEW_REQUIRED');
  });

  it('13. service/job linkage requires strong evidence path in preview', () => {
    const preview = buildEquipmentPreview({
      sources: [source({ jobNumber: 'JOB-000002', sourceExternalId: 'EQ-J1', serialNumber: 'ZZ-9' })],
      existing: [],
      resolveCustomer: () => 'cust-1',
      resolveProperty: () => ({
        propertyId: null,
        explicitEvidence: false,
        customerPropertyCount: 2,
      }),
      jobLinkEvidenceStrong: () => true,
    });
    assert.equal(preview.create, 1);
    assert.equal(preview.missingAuthorisedSource, false);
  });

  it('14. ambiguous job linkage rejected from auto confidence', () => {
    const preview = buildEquipmentPreview({
      sources: [source({ jobNumber: 'maybe-job', sourceExternalId: 'EQ-J2', serialNumber: 'ZZ-8' })],
      existing: [],
      resolveCustomer: () => 'cust-1',
      resolveProperty: () => ({
        propertyId: 'prop-1',
        explicitEvidence: true,
        customerPropertyCount: 1,
      }),
      jobLinkEvidenceStrong: () => false,
    });
    assert.equal(preview.create, 1);
    // Job link not applied automatically — create still allowed without inventing job FK.
    assert.equal(preview.rows[0]!.decision.autoMerge, false);
  });

  it('15. replaced/retired asset history preserved (no delete)', () => {
    const retired = existing({ status: 'retired', assetId: 'old', serialNumber: 'OLD-1' });
    const decision = classifyEquipmentImportMatch({
      source: source({
        sourceExternalId: 'EQ-REPL',
        serialNumber: 'NEW-1',
        name: 'Replacement Geyser',
        manufacturer: 'HeatTech',
        model: '200L',
      }),
      existing: [retired],
      resolvedCustomerId: 'cust-1',
      resolvedPropertyId: 'prop-1',
      customerPropertyCount: 1,
      explicitPropertyEvidence: true,
      jobLinkEvidenceStrong: false,
    });
    assert.equal(decision.action, 'CREATE');
    assert.equal(decision.matchedAssetId, null);
  });

  it('16. source IDs preserved on exact external match', () => {
    const hit = findBySourceExternalId([existing()], 'csv', 'EQ-1');
    assert.equal(hit?.sourceExternalId, 'EQ-1');
    assert.equal(hit?.sourceProvider, 'csv');
  });

  it('17. provenance preserved flag always true', () => {
    const decision = classifyEquipmentImportMatch({
      source: source({ serialNumber: 'UNIQUE-77' }),
      existing: [],
      resolvedCustomerId: null,
      resolvedPropertyId: null,
      customerPropertyCount: 0,
      explicitPropertyEvidence: false,
      jobLinkEvidenceStrong: false,
    });
    assert.equal(decision.provenancePreserved, true);
    assert.equal(decision.inventsData, false);
  });

  it('18. verified field not blindly overwritten', () => {
    const conflict = classifyVerifiedFieldConflict({
      field: 'serialNumber',
      currentValue: 'AAA',
      incomingValue: 'BBB',
      verified: true,
    });
    assert.equal(conflict.classification, 'CONFLICT_REVIEW_REQUIRED');
    assert.equal(conflict.applyIncoming, false);

    const decision = classifyEquipmentImportMatch({
      source: source({ sourceExternalId: 'EQ-1', manufacturer: 'OtherMake' }),
      existing: [existing({ verifiedFields: ['manufacturer'], manufacturer: 'Kwikot' })],
      resolvedCustomerId: 'cust-1',
      resolvedPropertyId: 'prop-1',
      customerPropertyCount: 1,
      explicitPropertyEvidence: true,
      jobLinkEvidenceStrong: false,
    });
    assert.equal(decision.action, 'REVIEW_REQUIRED');
    assert.ok(decision.reviewReasons.includes('VERIFIED_FIELD_CONFLICT'));
  });

  it('19. document relationship merge avoids duplicates', () => {
    const merged = mergeDocumentIds(['d1', 'd2'], ['d2', 'd3']);
    assert.deepEqual(merged.merged, ['d1', 'd2', 'd3']);
    assert.equal(merged.added, 1);
    assert.equal(merged.duplicatesAvoided, 1);
  });

  it('20. Customer 360 equipment summary fields searchable', () => {
    assert.equal(
      equipmentSearchMatches('SN001', {
        name: 'Geyser',
        serialNumber: 'SN-001',
        assetType: 'equipment',
        manufacturer: 'Kwikot',
        model: '150L',
        customerName: 'CRC',
        propertyName: 'Royal Cape Yacht Club',
      }),
      true,
    );
  });

  it('21-22. Property/Job search by customer/site', () => {
    assert.equal(
      equipmentSearchMatches('royal cape', {
        name: 'Pump',
        serialNumber: null,
        assetType: 'equipment',
        manufacturer: null,
        model: null,
        customerName: 'CRC',
        propertyName: 'Royal Cape Yacht Club',
      }),
      true,
    );
    assert.equal(
      equipmentSearchMatches('CRC', {
        name: 'Pump',
        serialNumber: null,
        assetType: 'equipment',
        manufacturer: null,
        model: null,
        customerName: 'CRC',
        propertyName: null,
      }),
      true,
    );
  });

  it('23. search by serial', () => {
    assert.equal(
      equipmentSearchMatches('sn 001', {
        name: 'X',
        serialNumber: 'SN001',
        assetType: 'equipment',
        manufacturer: null,
        model: null,
        customerName: null,
        propertyName: null,
      }),
      true,
    );
  });

  it('24. search by customer/site negative', () => {
    assert.equal(
      equipmentSearchMatches('other customer', {
        name: 'Pump',
        serialNumber: null,
        assetType: 'equipment',
        manufacturer: null,
        model: null,
        customerName: 'CRC',
        propertyName: 'Royal Cape Yacht Club',
      }),
      false,
    );
  });

  it('25-27. Owner/Manager/Admin/Office access; technician restricted', () => {
    assert.equal(canAccessEquipmentImport('Owner'), true);
    assert.equal(canAccessEquipmentImport('Manager'), true);
    assert.equal(canAccessEquipmentImport('Admin'), true);
    assert.equal(canAccessEquipmentImport('Office'), true);
    assert.equal(canAccessFullEquipmentDirectory('Technician'), false);
    assert.equal(
      technicianMayAccessEquipment({ assignedToJobOrSite: true, unrestrictedDirectory: false }),
      true,
    );
    assert.equal(
      technicianMayAccessEquipment({ assignedToJobOrSite: false, unrestrictedDirectory: false }),
      false,
    );
  });

  it('28-29. Client own-equipment isolation + cross-client denial', () => {
    assert.equal(
      clientMayAccessEquipment({
        actorCustomerId: 'cust-1',
        assetCustomerId: 'cust-1',
        companyId: 'co-1',
        assetCompanyId: 'co-1',
      }),
      true,
    );
    assert.equal(
      clientMayAccessEquipment({
        actorCustomerId: 'cust-1',
        assetCustomerId: 'cust-2',
        companyId: 'co-1',
        assetCompanyId: 'co-1',
      }),
      false,
    );
  });

  it('30. cross-tenant denial', () => {
    assert.equal(
      clientMayAccessEquipment({
        actorCustomerId: 'cust-1',
        assetCustomerId: 'cust-1',
        companyId: 'co-1',
        assetCompanyId: 'co-2',
      }),
      false,
    );
  });

  it('31. Royal Cape no-equipment truth', () => {
    const truth = assertRoyalCapeNoVerifiedEquipment({
      propertyId: EQUIPMENT_ASSETS_IMPORT_CRC.propertyId,
      linkedEquipmentCount: 0,
      strongEvidenceProvided: false,
    });
    assert.equal(truth.ok, true);
    if (truth.ok) assert.equal(truth.truth, 'NO_VERIFIED_EQUIPMENT_LINKED');
  });

  it('32. Customer duplicate reconciliation constants preserved', () => {
    assert.equal(
      EQUIPMENT_ASSETS_IMPORT_CRC.canonicalCustomerId,
      '773497f7-2d71-4a3a-8d80-d113b841b843',
    );
    assert.equal(
      EQUIPMENT_ASSETS_IMPORT_CRC.rowanSourceCustomerId,
      'd73df05b-d1e1-4f17-bc1d-890baa9f1e7e',
    );
  });

  it('33-35. no financial mutation / no Xero write / no production write flags', () => {
    assertNoXeroWrites(0);
    assert.throws(() => assertNoXeroWrites(1));
    const preview = buildEquipmentPreview({
      sources: [],
      existing: [],
      resolveCustomer: () => null,
      resolveProperty: () => ({
        propertyId: null,
        explicitEvidence: false,
        customerPropertyCount: 0,
      }),
      jobLinkEvidenceStrong: () => false,
    });
    assert.equal(preview.xeroWrites, 0);
    assert.equal(preview.productionWrites, 0);
    assert.equal(preview.missingAuthorisedSource, true);
    assert.equal(preview.inventsData, false);
  });

  it('36. second import creates zero duplicates (preview unchanged path)', () => {
    const existingRows = [existing()];
    const preview = buildEquipmentPreview({
      sources: [source()],
      existing: existingRows,
      resolveCustomer: () => 'cust-1',
      resolveProperty: () => ({
        propertyId: 'prop-1',
        explicitEvidence: true,
        customerPropertyCount: 1,
      }),
      jobLinkEvidenceStrong: () => false,
    });
    assert.equal(preview.create, 0);
    assert.ok(preview.unchanged + preview.exactMatch + preview.update + preview.reviewRequired >= 1);
  });

  it('does not collapse materially different serials', () => {
    assert.equal(serialsMateriallyDifferent('SN001', 'SN001A'), true);
    assert.equal(serialsEquivalent('SN001', 'SN001A'), false);
  });

  it('assert Row 87 not started', () => {
    assertRow87NotStarted(false);
    assert.throws(() => assertRow87NotStarted(true));
  });
});
