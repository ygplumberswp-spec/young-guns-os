/**
 * Extended operational report export kinds (Phase J-6.7E).
 * Inspection, fleet, and compliance/COC PDF exports.
 */

import type { OperationalReportPhoto, OperationalReportSignature } from './operational-report.js';

export const EXTENDED_REPORT_KINDS = [
  'inspection',
  'fleet_vehicle_activity',
  'fleet_operations',
  'compliance_coc_support',
  'compliance_coc_register',
] as const;

export type ExtendedReportKind = (typeof EXTENDED_REPORT_KINDS)[number];

export type ExtendedReportAudience = 'internal' | 'technician' | 'client';

export type ExtendedReportHeader = {
  reportReference: string;
  reportKind: ExtendedReportKind;
  companyName: string;
  generatedAt: string;
  timezone: string;
  periodStart: string | null;
  periodEnd: string | null;
  snapshotDate: string | null;
  dataSourceNote: string;
  dataQualityWarnings: string[];
  dataLimitations: string[];
};

export type ExtendedMetricLine = {
  label: string;
  displayValue: string;
  note: string | null;
  state: 'recorded' | 'measured_zero' | 'not_recorded' | 'unavailable' | 'unsupported';
};

export type InspectionChecklistItem = {
  label: string;
  result: string;
  note: string | null;
};

export type InspectionReportContext = ExtendedReportHeader & {
  reportKind: 'inspection';
  audience: ExtendedReportAudience;
  inspectionReference: string;
  customerName: string;
  propertyName: string | null;
  siteAddress: string | null;
  inspectionDate: string | null;
  inspectorName: string | null;
  inspectionType: string | null;
  reasonForInspection: string | null;
  areasInspected: string[];
  checklistResults: InspectionChecklistItem[];
  findings: string[];
  readings: Array<{ label: string; value: string }>;
  defects: string[];
  workRequired: string[];
  urgency: string | null;
  photos: OperationalReportPhoto[];
  attachments: Array<{ title: string }>;
  customerComments: string | null;
  inspectorNotes: string | null;
  internalNotes: string | null;
  recommendedActions: string[];
  recommendedMaintenance: string | null;
  signatures: OperationalReportSignature[];
  cocRecommendationState: string | null;
  jobReference: string;
};

export type FleetTripLine = {
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  drivingMinutes: number;
  stopMinutes: number;
};

export type FleetEventLine = {
  occurredAt: string;
  eventType: string;
  severity: string | null;
  note: string | null;
};

export type FleetVehicleActivityReportContext = ExtendedReportHeader & {
  reportKind: 'fleet_vehicle_activity';
  vehicleReference: string;
  registrationNumber: string;
  makeModel: string | null;
  assignedDriverName: string | null;
  freshnessState: string;
  lastSuccessfulSyncAt: string | null;
  tripCount: number | null;
  totalDistanceKm: number | null;
  totalDrivingMinutes: number | null;
  totalStopMinutes: number | null;
  eventCount: number | null;
  eventTypes: Array<{ type: string; count: number }>;
  odometerReading: string | null;
  licenceExpiryNote: string | null;
  maintenanceDueNote: string | null;
  lastStoredPositionNote: string | null;
  metrics: ExtendedMetricLine[];
  trips: FleetTripLine[];
  events: FleetEventLine[];
};

export type FleetOperationsVehicleLine = {
  vehicleReference: string;
  registrationNumber: string;
  tripCount: number;
  distanceKm: number;
  freshnessState: string;
  assignedDriverName: string | null;
  flags: string[];
};

export type FleetOperationsReportContext = ExtendedReportHeader & {
  reportKind: 'fleet_operations';
  freshnessState: string;
  lastSuccessfulSyncAt: string | null;
  activeVehicleCount: number;
  vehiclesWithTripData: number;
  totalTrips: number | null;
  totalDistanceKm: number | null;
  totalDrivingMinutes: number | null;
  eventBreakdown: Array<{ type: string; count: number }>;
  staleVehicleCount: number;
  neverSyncedVehicleCount: number;
  maintenanceDueCount: number;
  licenceExpiryWarningCount: number;
  unassignedVehicleCount: number;
  metrics: ExtendedMetricLine[];
  vehicles: FleetOperationsVehicleLine[];
};

export type ComplianceSupportReportContext = ExtendedReportHeader & {
  reportKind: 'compliance_coc_support';
  audience: ExtendedReportAudience;
  legalNotice: string;
  customerName: string;
  propertyName: string | null;
  jobReference: string;
  workDescription: string | null;
  workDate: string | null;
  responsiblePlumberName: string | null;
  plumberRegistrationNote: string | null;
  checklistResults: InspectionChecklistItem[];
  inspectionResults: string[];
  equipmentDetails: string[];
  measurements: Array<{ label: string; value: string }>;
  photos: OperationalReportPhoto[];
  supportingEvidence: Array<{ title: string; state: string }>;
  cocCertificateReference: string | null;
  cocIssueDate: string | null;
  cocAttachmentState: string;
  outstandingComplianceItems: string[];
  recommendedCorrectiveWork: string[];
  signatures: OperationalReportSignature[];
};

export type CocRegisterRow = {
  jobReference: string;
  customerName: string;
  propertyName: string | null;
  workDate: string | null;
  responsiblePlumberName: string | null;
  registrationReference: string | null;
  cocStatus: string;
  certificateNumber: string | null;
  issueDate: string | null;
  attachmentState: string;
  outstandingAction: string | null;
  inspectionStatus: string | null;
  dataQualityWarning: string | null;
};

export type ComplianceCocRegisterReportContext = ExtendedReportHeader & {
  reportKind: 'compliance_coc_register';
  filterSummary: string;
  rows: CocRegisterRow[];
};

export type ExtendedReportContext =
  | InspectionReportContext
  | FleetVehicleActivityReportContext
  | FleetOperationsReportContext
  | ComplianceSupportReportContext
  | ComplianceCocRegisterReportContext;

export function extendedReportKindLabel(kind: ExtendedReportKind): string {
  switch (kind) {
    case 'inspection':
      return 'Inspection Report';
    case 'fleet_vehicle_activity':
      return 'Fleet Vehicle Activity Report';
    case 'fleet_operations':
      return 'Fleet Operations Summary';
    case 'compliance_coc_support':
      return 'Compliance and COC Support Report';
    case 'compliance_coc_register':
      return 'Compliance and COC Register Report';
  }
}

export function extendedReportFilename(kind: ExtendedReportKind, reference: string): string {
  const slug =
    kind === 'inspection'
      ? 'inspection'
      : kind === 'fleet_vehicle_activity'
        ? 'fleet-vehicle-activity'
        : kind === 'fleet_operations'
          ? 'fleet-operations'
          : kind === 'compliance_coc_support'
            ? 'compliance-coc-support'
            : 'compliance-coc-register';
  const safeRef = reference.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 32) || 'report';
  return `${slug}-${safeRef}.pdf`;
}

export function extendedMetric(
  label: string,
  input: {
    displayValue?: string;
    state?: ExtendedMetricLine['state'];
    note?: string | null;
  },
): ExtendedMetricLine {
  const state = input.state ?? 'not_recorded';
  let displayValue = input.displayValue;
  if (!displayValue) {
    if (state === 'unavailable' || state === 'unsupported') {
      displayValue = 'Not available from current verified data';
    } else if (state === 'not_recorded') {
      displayValue = 'Not recorded';
    } else if (state === 'measured_zero') {
      displayValue = '0';
    } else {
      displayValue = '—';
    }
  }
  return { label, displayValue, note: input.note ?? null, state };
}

export function isJobInspectionEligible(input: {
  jobType: string | null;
  hasSdInspection: boolean;
  hasInspectionDocument: boolean;
  hasInspectionForm: boolean;
}): boolean {
  if (input.hasSdInspection || input.hasInspectionDocument || input.hasInspectionForm) {
    return true;
  }
  const normalized = input.jobType?.trim().toLowerCase() ?? '';
  return normalized.includes('inspection');
}

export function projectInspectionForAudience(
  ctx: InspectionReportContext,
  audience: ExtendedReportAudience,
): InspectionReportContext {
  if (audience === 'internal') return ctx;
  return {
    ...ctx,
    audience,
    internalNotes: null,
    inspectorNotes: audience === 'client' ? null : ctx.inspectorNotes,
  };
}

export function projectComplianceSupportForAudience(
  ctx: ComplianceSupportReportContext,
  audience: ExtendedReportAudience,
): ComplianceSupportReportContext {
  if (audience === 'internal') return ctx;
  return {
    ...ctx,
    audience,
    outstandingComplianceItems:
      audience === 'client'
        ? ctx.outstandingComplianceItems.filter((i) => !i.toLowerCase().includes('internal'))
        : ctx.outstandingComplianceItems,
  };
}
