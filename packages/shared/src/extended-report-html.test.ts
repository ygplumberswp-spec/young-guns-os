import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComplianceCocRegisterReportHtml,
  buildComplianceSupportReportHtml,
  buildFleetOperationsReportHtml,
  buildFleetVehicleActivityReportHtml,
  buildInspectionReportHtml,
} from './extended-report-html.js';
import { assertExtendedReportHtmlSafe, COMPLIANCE_COC_LEGAL_NOTICE } from './extended-report-source-policy.js';

const header = {
  reportReference: 'TEST-001',
  companyName: 'Young Guns Plumbing',
  generatedAt: '2026-08-05T12:00:00.000Z',
  timezone: 'Africa/Johannesburg',
  periodStart: '2026-07-01',
  periodEnd: '2026-08-05',
  snapshotDate: null,
  dataSourceNote: 'Fixture data',
  dataQualityWarnings: [] as string[],
  dataLimitations: [] as string[],
};

test('inspection HTML includes checklist and hides internal notes for client audience', () => {
  const html = buildInspectionReportHtml({
    ...header,
    reportKind: 'inspection',
    audience: 'client',
    inspectionReference: 'INS-001',
    customerName: 'Fixture Customer',
    propertyName: 'Main House',
    siteAddress: '1 Test Street',
    inspectionDate: '2026-08-01',
    inspectorName: 'Inspector A',
    inspectionType: 'Plumbing',
    reasonForInspection: 'Annual check',
    areasInspected: ['Kitchen'],
    checklistResults: [{ label: 'Pressure test', result: 'Pass', note: null }],
    findings: ['Minor drip'],
    readings: [{ label: 'Pressure', value: '350 kPa' }],
    defects: [],
    workRequired: [],
    urgency: null,
    photos: [],
    attachments: [],
    customerComments: null,
    inspectorNotes: 'Internal inspector note',
    internalNotes: 'Secret internal note',
    recommendedActions: [],
    recommendedMaintenance: null,
    signatures: [],
    cocRecommendationState: null,
    jobReference: 'YG-1001',
  });
  assert.match(html, /Inspection Report/);
  assert.doesNotMatch(html, /Secret internal note/);
  assert.doesNotMatch(html, /Internal inspector note/);
  assertExtendedReportHtmlSafe(html, 'client');
});

test('compliance support HTML includes legal notice', () => {
  const html = buildComplianceSupportReportHtml({
    ...header,
    reportKind: 'compliance_coc_support',
    audience: 'internal',
    legalNotice: COMPLIANCE_COC_LEGAL_NOTICE,
    customerName: 'Fixture Customer',
    propertyName: null,
    jobReference: 'YG-1001',
    workDescription: 'Geyser install',
    workDate: '2026-08-01',
    responsiblePlumberName: null,
    plumberRegistrationNote: 'Not recorded',
    checklistResults: [],
    inspectionResults: [],
    equipmentDetails: [],
    measurements: [],
    photos: [],
    supportingEvidence: [],
    cocCertificateReference: null,
    cocIssueDate: null,
    cocAttachmentState: 'Official COC not attached',
    outstandingComplianceItems: [],
    recommendedCorrectiveWork: [],
    signatures: [],
  });
  assert.match(html, /Compliance and COC Support Report/);
  assert.match(html, /does not replace/i);
  assertExtendedReportHtmlSafe(html, 'internal');
});

test('fleet vehicle activity HTML excludes coordinates', () => {
  const html = buildFleetVehicleActivityReportHtml({
    ...header,
    reportKind: 'fleet_vehicle_activity',
    vehicleReference: 'Bakkie 1',
    registrationNumber: 'CA 123-456',
    makeModel: 'Toyota Hilux',
    assignedDriverName: 'Driver A',
    freshnessState: 'recently_synced',
    lastSuccessfulSyncAt: '2026-08-05T10:00:00.000Z',
    tripCount: 2,
    totalDistanceKm: 45.2,
    totalDrivingMinutes: 90,
    totalStopMinutes: 15,
    eventCount: 1,
    eventTypes: [{ type: 'speeding', count: 1 }],
    odometerReading: null,
    licenceExpiryNote: null,
    maintenanceDueNote: null,
    lastStoredPositionNote: 'Last stored position recorded at 2026-08-05T10:00:00.000Z. Not a live location.',
    metrics: [],
    trips: [
      {
        startedAt: '2026-08-01T08:00:00.000Z',
        endedAt: '2026-08-01T09:00:00.000Z',
        distanceKm: 22.1,
        drivingMinutes: 45,
        stopMinutes: 5,
      },
    ],
    events: [{ occurredAt: '2026-08-01T08:30:00.000Z', eventType: 'speeding', severity: 'warning', note: null }],
  });
  assert.match(html, /Fleet Vehicle Activity Report/);
  assert.doesNotMatch(html, /latitude/i);
  assert.doesNotMatch(html, /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/);
  assertExtendedReportHtmlSafe(html, 'internal');
});

test('fleet operations and register HTML render table sections', () => {
  const opsHtml = buildFleetOperationsReportHtml({
    ...header,
    reportKind: 'fleet_operations',
    freshnessState: 'current',
    lastSuccessfulSyncAt: '2026-08-05T10:00:00.000Z',
    activeVehicleCount: 2,
    vehiclesWithTripData: 1,
    totalTrips: 3,
    totalDistanceKm: 120,
    totalDrivingMinutes: 180,
    eventBreakdown: [],
    staleVehicleCount: 0,
    neverSyncedVehicleCount: 0,
    maintenanceDueCount: 0,
    licenceExpiryWarningCount: 0,
    unassignedVehicleCount: 1,
    metrics: [],
    vehicles: [
      {
        vehicleReference: 'Bakkie 1',
        registrationNumber: 'CA 123-456',
        tripCount: 3,
        distanceKm: 120,
        freshnessState: 'current',
        assignedDriverName: 'Driver A',
        flags: [],
      },
    ],
  });
  assert.match(opsHtml, /Fleet Operations Summary/);

  const registerHtml = buildComplianceCocRegisterReportHtml({
    ...header,
    reportKind: 'compliance_coc_register',
    filterSummary: '2026-07-01 to 2026-08-05',
    rows: [
      {
        jobReference: 'YG-1001',
        customerName: 'Fixture Customer',
        propertyName: 'Main House',
        workDate: '2026-08-01',
        responsiblePlumberName: null,
        registrationReference: null,
        cocStatus: 'review',
        certificateNumber: null,
        issueDate: null,
        attachmentState: 'COC pending',
        outstandingAction: 'Workflow status: review',
        inspectionStatus: null,
        dataQualityWarning: null,
      },
    ],
  });
  assert.match(registerHtml, /Compliance and COC Register Report/);
});
