import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildComplianceCocRegisterReportHtml,
  buildComplianceSupportReportHtml,
  buildFleetOperationsReportHtml,
  buildFleetVehicleActivityReportHtml,
  buildInspectionReportHtml,
  countPdfPages,
  extendedMetric,
  isValidPdfBuffer,
  COMPLIANCE_COC_LEGAL_NOTICE,
} from '@titan/shared';
import { probeChromiumPdfAvailability, renderHtmlToPdf } from './chromium-pdf.service.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const artifactDir = join(repoRoot, 'test-results', 'j67e');

const header = {
  companyName: 'Young Guns Plumbing',
  generatedAt: '2026-08-05T12:00:00.000Z',
  timezone: 'Africa/Johannesburg',
  periodStart: '2026-01-01',
  periodEnd: '2026-08-05',
  snapshotDate: null,
  dataSourceNote: 'Fixture — multipage proof',
  dataQualityWarnings: [] as string[],
  dataLimitations: ['Fixture data only'],
};

test('genuine Puppeteer PDF renders multi-page extended reports when Chromium is available', async (t) => {
  const probe = await probeChromiumPdfAvailability();
  if (!probe.available) {
    t.skip(`Chromium unavailable (${probe.source})`);
    return;
  }

  mkdirSync(artifactDir, { recursive: true });

  const registerRows = Array.from({ length: 80 }, (_, i) => ({
    jobReference: `YG-${3000 + i}`,
    customerName: `Customer ${i}`,
    propertyName: i % 2 === 0 ? 'Main House' : null,
    workDate: '2026-03-15',
    responsiblePlumberName: null,
    registrationReference: null,
    cocStatus: i % 3 === 0 ? 'issued' : 'review',
    certificateNumber: i % 3 === 0 ? `COC-${i}` : null,
    issueDate: i % 3 === 0 ? '2026-03-20' : null,
    attachmentState: i % 3 === 0 ? 'Official COC attached' : 'COC pending',
    outstandingAction: i % 3 === 0 ? null : 'Workflow pending',
    inspectionStatus: null,
    dataQualityWarning: null,
  }));

  const fleetVehicles = Array.from({ length: 40 }, (_, i) => ({
    vehicleReference: `Vehicle ${i}`,
    registrationNumber: `CA ${100 + i}-${i}`,
    tripCount: 5 + (i % 10),
    distanceKm: 100 + i * 3,
    freshnessState: 'recently_synced',
    assignedDriverName: i % 2 === 0 ? `Driver ${i}` : null,
    flags: i % 5 === 0 ? ['Unassigned'] : [],
  }));

  const scenarios = [
    {
      name: 'inspection-minimal',
      html: buildInspectionReportHtml({
        ...header,
        reportReference: 'INS-MIN',
        reportKind: 'inspection',
        audience: 'internal',
        inspectionReference: 'INS-001',
        customerName: 'Fixture Customer',
        propertyName: 'Main House',
        siteAddress: '1 Test Street',
        inspectionDate: '2026-08-01',
        inspectorName: 'Inspector A',
        inspectionType: 'Plumbing',
        reasonForInspection: 'Annual check',
        areasInspected: ['Kitchen', 'Bathroom'],
        checklistResults: [{ label: 'Pressure test', result: 'Pass', note: null }],
        findings: ['Minor drip under basin'],
        readings: [{ label: 'Pressure', value: '350 kPa' }],
        defects: [],
        workRequired: [],
        urgency: null,
        photos: [],
        attachments: [],
        customerComments: null,
        inspectorNotes: 'Checked all fixtures',
        internalNotes: 'Follow up in 6 months',
        recommendedActions: ['Replace washer'],
        recommendedMaintenance: 'Annual inspection',
        signatures: [],
        cocRecommendationState: 'COC may be required',
        jobReference: 'YG-1001',
      }),
      minPages: 1,
    },
    {
      name: 'compliance-support-legal-notice',
      html: buildComplianceSupportReportHtml({
        ...header,
        reportReference: 'CCS-MIN',
        reportKind: 'compliance_coc_support',
        audience: 'client',
        legalNotice: COMPLIANCE_COC_LEGAL_NOTICE,
        customerName: 'Fixture Customer',
        propertyName: null,
        jobReference: 'YG-1001',
        workDescription: 'Geyser installation',
        workDate: '2026-08-01',
        responsiblePlumberName: null,
        plumberRegistrationNote: 'Not recorded in TITAN',
        checklistResults: [{ label: 'Earth bonding', result: 'pass', note: null }],
        inspectionResults: ['Visual inspection complete'],
        equipmentDetails: ['150L geyser'],
        measurements: [{ label: 'Earth resistance', value: 'Not recorded' }],
        photos: [],
        supportingEvidence: [{ title: 'Workflow intake', state: 'review' }],
        cocCertificateReference: null,
        cocIssueDate: null,
        cocAttachmentState: 'Official COC not attached',
        outstandingComplianceItems: ['Awaiting COC issue'],
        recommendedCorrectiveWork: [],
        signatures: [],
      }),
      minPages: 1,
    },
    {
      name: 'fleet-vehicle-activity-long-trips',
      html: buildFleetVehicleActivityReportHtml({
        ...header,
        reportReference: 'FVA-LONG',
        reportKind: 'fleet_vehicle_activity',
        vehicleReference: 'Bakkie 1',
        registrationNumber: 'CA 123-456',
        makeModel: 'Toyota Hilux',
        assignedDriverName: 'Driver A',
        freshnessState: 'recently_synced',
        lastSuccessfulSyncAt: '2026-08-05T10:00:00.000Z',
        tripCount: 50,
        totalDistanceKm: 1200,
        totalDrivingMinutes: 2400,
        totalStopMinutes: 300,
        eventCount: 12,
        eventTypes: [{ type: 'speeding', count: 12 }],
        odometerReading: null,
        licenceExpiryNote: null,
        maintenanceDueNote: null,
        lastStoredPositionNote: 'Last stored position recorded at 2026-08-05T10:00:00.000Z. Not a live location.',
        metrics: [
          extendedMetric('Trips', { displayValue: '50', state: 'recorded' }),
          extendedMetric('Distance', { displayValue: '1200.0 km', state: 'recorded' }),
        ],
        trips: Array.from({ length: 50 }, (_, i) => ({
          startedAt: `2026-0${(i % 8) + 1}-01T08:00:00.000Z`,
          endedAt: `2026-0${(i % 8) + 1}-01T10:00:00.000Z`,
          distanceKm: 20 + i,
          drivingMinutes: 90 + i,
          stopMinutes: 10,
        })),
        events: Array.from({ length: 12 }, (_, i) => ({
          occurredAt: `2026-0${(i % 8) + 1}-02T09:00:00.000Z`,
          eventType: 'speeding',
          severity: 'warning',
          note: `Event ${i}`,
        })),
      }),
      minPages: 2,
    },
    {
      name: 'fleet-operations-40-vehicles',
      html: buildFleetOperationsReportHtml({
        ...header,
        reportReference: 'FOS-LONG',
        reportKind: 'fleet_operations',
        freshnessState: 'recently_synced',
        lastSuccessfulSyncAt: '2026-08-05T10:00:00.000Z',
        activeVehicleCount: 40,
        vehiclesWithTripData: 35,
        totalTrips: 200,
        totalDistanceKm: 4500,
        totalDrivingMinutes: 8000,
        eventBreakdown: [{ type: 'speeding', count: 15 }],
        staleVehicleCount: 2,
        neverSyncedVehicleCount: 0,
        maintenanceDueCount: 3,
        licenceExpiryWarningCount: 0,
        unassignedVehicleCount: 5,
        metrics: [extendedMetric('Vehicles', { displayValue: '40', state: 'recorded' })],
        vehicles: fleetVehicles,
      }),
      minPages: 2,
    },
    {
      name: 'compliance-coc-register-80-rows',
      html: buildComplianceCocRegisterReportHtml({
        ...header,
        reportReference: 'CCR-LONG',
        reportKind: 'compliance_coc_register',
        filterSummary: '2026-01-01 to 2026-08-05; all statuses',
        rows: registerRows,
      }),
      minPages: 2,
    },
  ];

  for (const scenario of scenarios) {
    const buffer = await renderHtmlToPdf(scenario.html);
    assert.ok(isValidPdfBuffer(buffer), `${scenario.name} should produce valid PDF`);
    const pages = await countPdfPages(buffer);
    assert.ok(pages >= scenario.minPages, `${scenario.name} expected >= ${scenario.minPages} pages, got ${pages}`);
    writeFileSync(join(artifactDir, `${scenario.name}.pdf`), buffer);
  }
});
