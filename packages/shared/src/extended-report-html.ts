import { buildYoungGunsReportShellHtml } from './young-guns-report-shell.js';
import {
  COMPLIANCE_COC_LEGAL_NOTICE,
  FLEET_NO_LIVE_LOCATION_NOTE,
  FLEET_STORED_DATA_NOTE,
} from './extended-report-source-policy.js';
import type {
  ComplianceCocRegisterReportContext,
  ComplianceSupportReportContext,
  ExtendedMetricLine,
  ExtendedReportKind,
  FleetOperationsReportContext,
  FleetVehicleActivityReportContext,
  InspectionReportContext,
} from './extended-report.js';
import { extendedReportKindLabel } from './extended-report.js';
import type { OperationalReportPhoto, OperationalReportSignature } from './operational-report.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function renderParagraph(text: string | null | undefined, emptyLabel: string): string {
  const trimmed = text?.trim();
  if (!trimmed) return `<p class="muted">${escapeHtml(emptyLabel)}</p>`;
  return `<p>${escapeHtml(trimmed)}</p>`;
}

function renderList(items: string[], emptyLabel: string): string {
  if (!items.length) return `<p class="muted">${escapeHtml(emptyLabel)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderMetrics(metrics: ExtendedMetricLine[]): string {
  if (!metrics.length) return '<p class="muted">No metrics recorded.</p>';
  const rows = metrics
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.label)}</td><td>${escapeHtml(m.displayValue)}</td><td class="muted">${escapeHtml(m.note ?? '')}</td></tr>`,
    )
    .join('');
  return `<table class="ext-table"><thead><tr><th>Metric</th><th>Value</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPhotos(photos: OperationalReportPhoto[], emptyLabel: string): string {
  if (!photos.length) return `<p class="muted">${escapeHtml(emptyLabel)}</p>`;
  return photos
    .map((photo) => {
      const caption = photo.caption?.trim() || photo.title;
      if (photo.dataUrl) {
        return `<figure class="report-photo"><img src="${photo.dataUrl}" alt="${escapeHtml(caption)}" style="max-width:100%;height:auto;" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
      }
      return `<p>${escapeHtml(caption)}</p>`;
    })
    .join('\n');
}

function renderSignatures(signatures: OperationalReportSignature[]): string {
  if (!signatures.length) return '<p class="muted">No signatures captured.</p>';
  return signatures
    .map((sig) => {
      const label = sig.role === 'customer' ? 'Customer' : 'Technician';
      if (sig.present && sig.dataUrl) {
        return `<figure class="report-signature"><p><strong>${label}</strong>${sig.signedBy ? ` — ${escapeHtml(sig.signedBy)}` : ''}</p><img src="${sig.dataUrl}" alt="${escapeHtml(label)} signature" style="max-height:80px;" /></figure>`;
      }
      if (sig.present && sig.signedBy) {
        return `<p><strong>${label}:</strong> Signed by ${escapeHtml(sig.signedBy)}</p>`;
      }
      return `<p class="muted"><strong>${label}:</strong> ${escapeHtml(sig.unavailableReason ?? 'Not captured')}</p>`;
    })
    .join('\n');
}

function extendedShellExtraCss(): string {
  return `
    .ext-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .ext-table th, .ext-table td { border: 1px solid #d0d7de; padding: 4px 6px; text-align: left; vertical-align: top; }
    .ext-table th { background: #f6f8fa; }
    .legal-notice { border: 1px solid #c9a227; background: #fffbea; padding: 8px 10px; border-radius: 6px; font-size: 9pt; }
  `;
}

function shell(
  kind: ExtendedReportKind,
  ctx: {
    reportReference: string;
    companyName: string;
    periodStart: string | null;
    periodEnd: string | null;
    snapshotDate: string | null;
    timezone: string;
    generatedAt: string;
    dataSourceNote: string;
    filterSummary?: string | null;
    dataQualityWarnings: string[];
    dataLimitations: string[];
  },
  body: string,
): string {
  const periodLabel = ctx.snapshotDate
    ? `Snapshot ${ctx.snapshotDate} (${ctx.timezone})`
    : ctx.periodStart && ctx.periodEnd
      ? `${ctx.periodStart} to ${ctx.periodEnd} (${ctx.timezone})`
      : ctx.timezone;

  const warnings =
    ctx.dataQualityWarnings.length > 0
      ? section(
          'Data quality warnings',
          `<ul>${ctx.dataQualityWarnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`,
        )
      : '';

  const limitations =
    ctx.dataLimitations.length > 0
      ? section(
          'Data limitations',
          `<ul>${ctx.dataLimitations.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
        )
      : '';

  return buildYoungGunsReportShellHtml({
    extendedKind: kind,
    reportTitle: extendedReportKindLabel(kind),
    periodLabel,
    generatedAt: ctx.generatedAt,
    filterSummary:
      ctx.filterSummary ??
      `${ctx.dataSourceNote}${ctx.periodStart ? '' : ''}`,
    bodyHtml: `<style>${extendedShellExtraCss()}</style>${body}${warnings}${limitations}`,
  });
}

export function buildInspectionReportHtml(ctx: InspectionReportContext): string {
  const checklistRows = ctx.checklistResults.length
    ? ctx.checklistResults
        .map(
          (item) =>
            `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.result)}</td><td class="muted">${escapeHtml(item.note ?? '')}</td></tr>`,
        )
        .join('')
    : '';

  const body = [
    section(
      'Inspection summary',
      renderList(
        [
          `Reference: ${ctx.inspectionReference}`,
          `Job: ${ctx.jobReference}`,
          ctx.inspectionDate ? `Inspection date: ${ctx.inspectionDate}` : null,
          ctx.inspectorName ? `Inspector: ${ctx.inspectorName}` : null,
          ctx.inspectionType ? `Type: ${ctx.inspectionType}` : null,
          ctx.reasonForInspection ? `Reason: ${ctx.reasonForInspection}` : null,
          ctx.urgency ? `Urgency: ${ctx.urgency}` : null,
        ].filter((v): v is string => Boolean(v)),
        'No inspection summary recorded.',
      ),
    ),
    section(
      'Customer and site',
      renderList(
        [
          `Customer: ${ctx.customerName}`,
          ctx.propertyName ? `Property: ${ctx.propertyName}` : null,
          ctx.siteAddress ? `Site: ${ctx.siteAddress}` : null,
        ].filter((v): v is string => Boolean(v)),
        'No customer or site details recorded.',
      ),
    ),
    section('Areas inspected', renderList(ctx.areasInspected, 'No areas recorded.')),
    section(
      'Checklist results',
      checklistRows
        ? `<table class="ext-table"><thead><tr><th>Item</th><th>Result</th><th>Note</th></tr></thead><tbody>${checklistRows}</tbody></table>`
        : '<p class="muted">No checklist results recorded.</p>',
    ),
    section('Findings', renderList(ctx.findings, 'No findings recorded.')),
    section(
      'Readings',
      ctx.readings.length
        ? `<ul>${ctx.readings.map((r) => `<li><strong>${escapeHtml(r.label)}:</strong> ${escapeHtml(r.value)}</li>`).join('')}</ul>`
        : '<p class="muted">No readings recorded.</p>',
    ),
    section('Defects', renderList(ctx.defects, 'No defects recorded.')),
    section('Work required', renderList(ctx.workRequired, 'No remedial work recorded.')),
    section('Recommended actions', renderList(ctx.recommendedActions, 'No recommendations recorded.')),
    section('Recommended maintenance', renderParagraph(ctx.recommendedMaintenance, 'No maintenance recommendation recorded.')),
    section('Photos', renderPhotos(ctx.photos, 'No inspection photos attached.')),
    section(
      'Attachments',
      ctx.attachments.length
        ? `<ul>${ctx.attachments.map((a) => `<li>${escapeHtml(a.title)}</li>`).join('')}</ul>`
        : '<p class="muted">No attachments recorded.</p>',
    ),
    section('Customer comments', renderParagraph(ctx.customerComments, 'No customer comments recorded.')),
    ctx.audience !== 'client'
      ? section('Inspector notes', renderParagraph(ctx.inspectorNotes, 'No inspector notes recorded.'))
      : '',
    ctx.audience === 'internal'
      ? section('Internal notes', renderParagraph(ctx.internalNotes, 'No internal notes recorded.'))
      : '',
    section('COC recommendation', renderParagraph(ctx.cocRecommendationState, 'No COC recommendation recorded.')),
    section('Signatures', renderSignatures(ctx.signatures)),
    section('Data source', `<p class="muted">${escapeHtml(ctx.dataSourceNote)}</p>`),
  ]
    .filter(Boolean)
    .join('');

  return shell('inspection', ctx, body);
}

export function buildFleetVehicleActivityReportHtml(ctx: FleetVehicleActivityReportContext): string {
  const tripRows = ctx.trips.length
    ? ctx.trips
        .map(
          (t) =>
            `<tr><td>${escapeHtml(t.startedAt)}</td><td>${escapeHtml(t.endedAt)}</td><td>${t.distanceKm.toFixed(1)}</td><td>${Math.round(t.drivingMinutes)}</td><td>${Math.round(t.stopMinutes)}</td></tr>`,
        )
        .join('')
    : '';

  const eventRows = ctx.events.length
    ? ctx.events
        .map(
          (e) =>
            `<tr><td>${escapeHtml(e.occurredAt)}</td><td>${escapeHtml(e.eventType)}</td><td>${escapeHtml(e.severity ?? '')}</td><td class="muted">${escapeHtml(e.note ?? '')}</td></tr>`,
        )
        .join('')
    : '';

  const body = [
    section(
      'Vehicle summary',
      renderList(
        [
          `Vehicle: ${ctx.registrationNumber}`,
          ctx.makeModel ? `Make/model: ${ctx.makeModel}` : null,
          ctx.assignedDriverName ? `Assigned driver: ${ctx.assignedDriverName}` : null,
          `Freshness: ${ctx.freshnessState}`,
          ctx.lastSuccessfulSyncAt ? `Last sync: ${ctx.lastSuccessfulSyncAt}` : null,
          ctx.lastStoredPositionNote ? ctx.lastStoredPositionNote : null,
        ].filter((v): v is string => Boolean(v)),
        'No vehicle summary available.',
      ),
    ),
    section('Summary metrics', renderMetrics(ctx.metrics)),
    section(
      'Trip history (stored GPS segmentation)',
      tripRows
        ? `<table class="ext-table"><thead><tr><th>Started</th><th>Ended</th><th>Distance (km)</th><th>Driving (min)</th><th>Stop (min)</th></tr></thead><tbody>${tripRows}</tbody></table>`
        : '<p class="muted">No trip segments derived from stored GPS data for this period.</p>',
    ),
    section(
      'Driver behaviour events',
      eventRows
        ? `<table class="ext-table"><thead><tr><th>When</th><th>Event</th><th>Severity</th><th>Note</th></tr></thead><tbody>${eventRows}</tbody></table>`
        : '<p class="muted">No stored behaviour events for this period.</p>',
    ),
    section(
      'Data source',
      `<p class="muted">${escapeHtml(ctx.dataSourceNote)}</p><p class="muted">${escapeHtml(FLEET_STORED_DATA_NOTE)}</p><p class="muted">${escapeHtml(FLEET_NO_LIVE_LOCATION_NOTE)}</p>`,
    ),
  ].join('');

  return shell('fleet_vehicle_activity', ctx, body);
}

export function buildFleetOperationsReportHtml(ctx: FleetOperationsReportContext): string {
  const vehicleRows = ctx.vehicles.length
    ? ctx.vehicles
        .map(
          (v) =>
            `<tr><td>${escapeHtml(v.registrationNumber)}</td><td>${v.tripCount}</td><td>${v.distanceKm.toFixed(1)}</td><td>${escapeHtml(v.freshnessState)}</td><td>${escapeHtml(v.assignedDriverName ?? '')}</td><td class="muted">${escapeHtml(v.flags.join('; '))}</td></tr>`,
        )
        .join('')
    : '';

  const body = [
    section(
      'Fleet overview',
      renderList(
        [
          `Active vehicles: ${ctx.activeVehicleCount}`,
          `Vehicles with trip data: ${ctx.vehiclesWithTripData}`,
          ctx.totalTrips != null ? `Total trips: ${ctx.totalTrips}` : 'Total trips: Not recorded',
          ctx.totalDistanceKm != null
            ? `Total distance: ${ctx.totalDistanceKm.toFixed(1)} km`
            : 'Total distance: Not recorded',
          `Freshness: ${ctx.freshnessState}`,
          ctx.lastSuccessfulSyncAt ? `Last sync: ${ctx.lastSuccessfulSyncAt}` : null,
          `Stale vehicles: ${ctx.staleVehicleCount}`,
          `Never synced: ${ctx.neverSyncedVehicleCount}`,
        ].filter((v): v is string => Boolean(v)),
        'No fleet overview available.',
      ),
    ),
    section('Summary metrics', renderMetrics(ctx.metrics)),
    section(
      'Vehicle breakdown',
      vehicleRows
        ? `<table class="ext-table"><thead><tr><th>Registration</th><th>Trips</th><th>Distance (km)</th><th>Freshness</th><th>Driver</th><th>Flags</th></tr></thead><tbody>${vehicleRows}</tbody></table>`
        : '<p class="muted">No vehicles with stored activity in this period.</p>',
    ),
    section(
      'Data source',
      `<p class="muted">${escapeHtml(ctx.dataSourceNote)}</p><p class="muted">${escapeHtml(FLEET_STORED_DATA_NOTE)}</p>`,
    ),
  ].join('');

  return shell('fleet_operations', ctx, body);
}

export function buildComplianceSupportReportHtml(ctx: ComplianceSupportReportContext): string {
  const checklistRows = ctx.checklistResults.length
    ? ctx.checklistResults
        .map(
          (item) =>
            `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.result)}</td><td class="muted">${escapeHtml(item.note ?? '')}</td></tr>`,
        )
        .join('')
    : '';

  const body = [
    section(
      'Legal notice',
      `<p class="legal-notice">${escapeHtml(ctx.legalNotice || COMPLIANCE_COC_LEGAL_NOTICE)}</p>`,
    ),
    section(
      'Job and work summary',
      renderList(
        [
          `Job: ${ctx.jobReference}`,
          `Customer: ${ctx.customerName}`,
          ctx.propertyName ? `Property: ${ctx.propertyName}` : null,
          ctx.workDate ? `Work date: ${ctx.workDate}` : null,
          ctx.workDescription ? `Work: ${ctx.workDescription}` : null,
          ctx.responsiblePlumberName ? `Responsible plumber: ${ctx.responsiblePlumberName}` : null,
          ctx.plumberRegistrationNote ? `Registration: ${ctx.plumberRegistrationNote}` : null,
        ].filter((v): v is string => Boolean(v)),
        'No work summary recorded.',
      ),
    ),
    section(
      'Checklist / inspection results',
      checklistRows
        ? `<table class="ext-table"><thead><tr><th>Item</th><th>Result</th><th>Note</th></tr></thead><tbody>${checklistRows}</tbody></table>`
        : '<p class="muted">No checklist results recorded.</p>',
    ),
    section('Inspection results', renderList(ctx.inspectionResults, 'No inspection results recorded.')),
    section('Equipment details', renderList(ctx.equipmentDetails, 'No equipment details recorded.')),
    section(
      'Measurements',
      ctx.measurements.length
        ? `<ul>${ctx.measurements.map((m) => `<li><strong>${escapeHtml(m.label)}:</strong> ${escapeHtml(m.value)}</li>`).join('')}</ul>`
        : '<p class="muted">No measurements recorded.</p>',
    ),
    section('Photos', renderPhotos(ctx.photos, 'No supporting photos attached.')),
    section(
      'Supporting evidence',
      ctx.supportingEvidence.length
        ? `<ul>${ctx.supportingEvidence.map((e) => `<li>${escapeHtml(e.title)} — ${escapeHtml(e.state)}</li>`).join('')}</ul>`
        : '<p class="muted">No supporting evidence linked.</p>',
    ),
    section(
      'COC status',
      renderList(
        [
          `Attachment state: ${ctx.cocAttachmentState}`,
          ctx.cocCertificateReference ? `Certificate ref: ${ctx.cocCertificateReference}` : null,
          ctx.cocIssueDate ? `Issue date: ${ctx.cocIssueDate}` : null,
        ].filter((v): v is string => Boolean(v)),
        'COC status not recorded.',
      ),
    ),
    section(
      'Outstanding compliance items',
      renderList(ctx.outstandingComplianceItems, 'No outstanding items recorded.'),
    ),
    section(
      'Recommended corrective work',
      renderList(ctx.recommendedCorrectiveWork, 'No corrective work recommendations recorded.'),
    ),
    section('Signatures', renderSignatures(ctx.signatures)),
    section('Data source', `<p class="muted">${escapeHtml(ctx.dataSourceNote)}</p>`),
  ].join('');

  return shell('compliance_coc_support', ctx, body);
}

export function buildComplianceCocRegisterReportHtml(ctx: ComplianceCocRegisterReportContext): string {
  const rows = ctx.rows.length
    ? ctx.rows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.jobReference)}</td><td>${escapeHtml(r.customerName)}</td><td>${escapeHtml(r.propertyName ?? '')}</td><td>${escapeHtml(r.workDate ?? '')}</td><td>${escapeHtml(r.responsiblePlumberName ?? '')}</td><td>${escapeHtml(r.cocStatus)}</td><td>${escapeHtml(r.certificateNumber ?? '')}</td><td>${escapeHtml(r.issueDate ?? '')}</td><td>${escapeHtml(r.attachmentState)}</td><td class="muted">${escapeHtml(r.outstandingAction ?? '')}</td></tr>`,
        )
        .join('')
    : '';

  const body = [
    section('Register filters', `<p class="muted">${escapeHtml(ctx.filterSummary)}</p>`),
    section(
      'COC register',
      rows
        ? `<table class="ext-table"><thead><tr><th>Job</th><th>Customer</th><th>Property</th><th>Work date</th><th>Plumber</th><th>Status</th><th>Cert #</th><th>Issued</th><th>Attachment</th><th>Outstanding</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="muted">No COC/compliance records match the selected filters.</p>',
    ),
    section(
      'Legal notice',
      `<p class="legal-notice">${escapeHtml(COMPLIANCE_COC_LEGAL_NOTICE)}</p>`,
    ),
    section('Data source', `<p class="muted">${escapeHtml(ctx.dataSourceNote)}</p>`),
  ].join('');

  return shell('compliance_coc_register', ctx, body);
}
