/**
 * Client Completion Report Generator — customer-facing job completion reports.
 *
 * Persists as a report row + linked Documents metadata record (HTML body).
 * Delivery reuses Email Centre (draft → approve → execute) and Communication Timeline.
 * Google Maps: place URL only when real coordinates/placeId exist — never invent.
 */

import { buildGoogleMapsPlaceUrl } from './google-maps.js';
import { buildYoungGunsReportShellHtml } from './young-guns-report-shell.js';

export const COMPLETION_REPORT_SECTION_IDS = [
  'customer_details',
  'property_details',
  'property_map',
  'job_details',
  'diagnosis',
  'work_completed',
  'materials_used',
  'technician_details',
  'photos_before',
  'photos_during',
  'photos_after',
  'quote',
  'boq',
  'invoice',
  'payment_receipt',
  'coc',
  'warranty',
  'customer_signature',
] as const;

export type CompletionReportSectionId = (typeof COMPLETION_REPORT_SECTION_IDS)[number];

export type CompletionReportStatus =
  | 'draft'
  | 'generated'
  | 'ready_to_send'
  | 'sent'
  | 'cancelled';

export type CompletionReportMapAvailability =
  | 'place_url'
  | 'unavailable_no_coordinates'
  | 'unavailable_no_property';

export const COMPLETION_REPORT_STATUS_OPTIONS: Array<{
  value: CompletionReportStatus;
  label: string;
}> = [
  { value: 'draft', label: 'Draft' },
  { value: 'generated', label: 'Generated' },
  { value: 'ready_to_send', label: 'Ready To Send' },
  { value: 'sent', label: 'Sent' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const COMPLETION_REPORT_SECTION_OPTIONS: Array<{
  value: CompletionReportSectionId;
  label: string;
  description: string;
}> = [
  { value: 'customer_details', label: 'Customer details', description: 'Name and contact' },
  { value: 'property_details', label: 'Property details', description: 'Address and property name' },
  {
    value: 'property_map',
    label: 'Property map',
    description: 'Google Maps place link when coordinates exist',
  },
  { value: 'job_details', label: 'Job details', description: 'Job number, type, dates' },
  { value: 'diagnosis', label: 'Diagnosis', description: 'From completion snapshot' },
  { value: 'work_completed', label: 'Work completed', description: 'Work performed summary' },
  { value: 'materials_used', label: 'Materials used', description: 'Recorded material lines' },
  { value: 'technician_details', label: 'Technician details', description: 'Crew / completer' },
  { value: 'photos_before', label: 'Before photos', description: 'Evidence phase: before' },
  { value: 'photos_during', label: 'During photos', description: 'Evidence phase: during' },
  { value: 'photos_after', label: 'After photos', description: 'Evidence phase: after' },
  { value: 'quote', label: 'Quote', description: 'Linked quotation reference' },
  { value: 'boq', label: 'BOQ', description: 'Linked bill of quantities' },
  { value: 'invoice', label: 'Invoice', description: 'Linked invoice reference' },
  { value: 'payment_receipt', label: 'Payment receipt', description: 'Linked receipt reference' },
  { value: 'coc', label: 'COC', description: 'Certificate of compliance evidence/docs' },
  { value: 'warranty', label: 'Warranty', description: 'Warranty documents' },
  { value: 'customer_signature', label: 'Customer signature', description: 'Captured signature' },
];

export type CompletionReportSectionAvailability = {
  sectionId: CompletionReportSectionId;
  label: string;
  available: boolean;
  reason: string | null;
  defaultIncluded: boolean;
};

export type CompletionReportPhotoRef = {
  id: string;
  title: string;
  evidencePhase: string | null;
  downloadPath: string | null;
};

export type CompletionReportMaterialLine = {
  description: string;
  quantity: string;
  unit: string;
  status: string;
};

export type CompletionReportSectionPayload = {
  customer?: { name: string; email: string | null; phone: string | null; contactPerson: string | null };
  property?: {
    propertyName: string | null;
    formattedAddress: string | null;
    addressLines: string[];
  };
  map?: {
    availability: CompletionReportMapAvailability;
    placeUrl: string | null;
    note: string;
    latitude: number | null;
    longitude: number | null;
  };
  job?: {
    jobNumber: string | null;
    title: string;
    jobType: string | null;
    status: string;
    completedAt: string | null;
  };
  diagnosis?: string | null;
  workCompleted?: string | null;
  materials?: CompletionReportMaterialLine[];
  technician?: { name: string | null; completedByUserId: string | null };
  photosBefore?: CompletionReportPhotoRef[];
  photosDuring?: CompletionReportPhotoRef[];
  photosAfter?: CompletionReportPhotoRef[];
  quote?: { id: string; label: string } | null;
  boq?: { id: string; label: string } | null;
  invoice?: { id: string; label: string } | null;
  paymentReceipt?: { id: string; label: string } | null;
  coc?: Array<{ id: string; title: string; source: 'document' | 'evidence' }>;
  warranty?: Array<{ id: string; title: string; source: 'document' | 'evidence' }>;
  customerSignature?: {
    present: boolean;
    signatureDocId: string | null;
    customerRepName: string | null;
    unavailableReason: string | null;
  };
};

export type CompletionReportPreview = {
  jobId: string;
  customerId: string;
  propertyId: string | null;
  invoiceId: string | null;
  quoteId: string | null;
  boqDocumentId: string | null;
  suggestedTitle: string;
  sections: CompletionReportSectionAvailability[];
  mapAvailability: CompletionReportMapAvailability;
  mapPlaceUrl: string | null;
};

export type CompletionReportSummary = {
  id: string;
  reportNumber: string;
  title: string;
  status: CompletionReportStatus;
  jobId: string;
  jobTitle: string | null;
  customerId: string;
  customerName: string | null;
  propertyId: string | null;
  invoiceId: string | null;
  documentId: string | null;
  includedSections: CompletionReportSectionId[];
  mapAvailability: CompletionReportMapAvailability;
  mapPlaceUrl: string | null;
  emailDraftId: string | null;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
  sentAt: string | null;
};

export type CompletionReportDetail = CompletionReportSummary & {
  notes: string | null;
  quoteId: string | null;
  boqDocumentId: string | null;
  sectionPayload: CompletionReportSectionPayload;
  htmlBody: string | null;
  deliveryNote: string;
};

export type CreateCompletionReportRequest = {
  jobId: string;
  title?: string;
  notes?: string | null;
  includedSections?: CompletionReportSectionId[];
  clientActionId?: string | null;
};

export type UpdateCompletionReportRequest = {
  title?: string;
  notes?: string | null;
  includedSections?: CompletionReportSectionId[];
};

export type PrepareCompletionReportEmailRequest = {
  to?: string[];
  subject?: string;
  bodyText?: string;
  clientActionId?: string | null;
};

export type CompletionReportEmailDraftResult = {
  report: CompletionReportDetail;
  draftId: string;
  sendProvider: 'gmail_api';
  composePath: 'gmail_draft_approve_execute';
  note: string;
  emailCentrePath: string;
};

const EDITABLE_STATUSES = new Set<CompletionReportStatus>(['draft', 'generated', 'ready_to_send']);

export function isCompletionReportSectionId(value: string): value is CompletionReportSectionId {
  return (COMPLETION_REPORT_SECTION_IDS as readonly string[]).includes(value);
}

export function normalizeIncludedSections(
  sections: readonly string[] | null | undefined,
): CompletionReportSectionId[] {
  const seen = new Set<CompletionReportSectionId>();
  const result: CompletionReportSectionId[] = [];
  for (const raw of sections ?? []) {
    if (!isCompletionReportSectionId(raw) || seen.has(raw)) continue;
    seen.add(raw);
    result.push(raw);
  }
  return result;
}

export function defaultIncludedSections(
  availability: CompletionReportSectionAvailability[],
): CompletionReportSectionId[] {
  return availability.filter((s) => s.available && s.defaultIncluded).map((s) => s.sectionId);
}

export function canEditCompletionReport(report: { status: CompletionReportStatus }): boolean {
  return EDITABLE_STATUSES.has(report.status);
}

export function nextCompletionReportAction(
  status: CompletionReportStatus,
): { label: string; nextStatus: CompletionReportStatus } | null {
  if (status === 'draft') {
    return { label: 'Generate Report', nextStatus: 'generated' };
  }
  if (status === 'generated') {
    return { label: 'Mark Ready To Send', nextStatus: 'ready_to_send' };
  }
  return null;
}

export function resolveCompletionReportMapAvailability(input: {
  propertyId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  address?: string | null;
}): {
  availability: CompletionReportMapAvailability;
  placeUrl: string | null;
  note: string;
} {
  if (!input.propertyId && input.latitude == null && input.longitude == null && !input.placeId) {
    return {
      availability: 'unavailable_no_property',
      placeUrl: null,
      note: 'No property or coordinates are linked to this job — map image omitted.',
    };
  }

  const placeUrl = buildGoogleMapsPlaceUrl({
    latitude: input.latitude,
    longitude: input.longitude,
    placeId: input.placeId,
    address: input.address,
  });

  const hasCoords =
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude);

  if (!placeUrl || (!hasCoords && !input.placeId?.trim())) {
    return {
      availability: 'unavailable_no_coordinates',
      placeUrl: null,
      note: 'Property coordinates are not available — map image omitted (coordinates are never invented).',
    };
  }

  return {
    availability: 'place_url',
    placeUrl,
    note: 'Google Maps place link included from stored coordinates/place ID. Static map imagery requires Maps Static API provisioning.',
  };
}

export function sectionLabel(sectionId: CompletionReportSectionId): string {
  return (
    COMPLETION_REPORT_SECTION_OPTIONS.find((option) => option.value === sectionId)?.label ??
    sectionId
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderList(items: string[]): string {
  if (!items.length) return '<p><em>None recorded.</em></p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

/** Pure HTML builder for customer-facing completion reports (print/PDF via browser). */
export function buildCompletionReportHtml(input: {
  title: string;
  reportNumber: string;
  includedSections: CompletionReportSectionId[];
  payload: CompletionReportSectionPayload;
  generatedAt: string;
}): string {
  const sections: string[] = [];

  for (const sectionId of input.includedSections) {
    const heading = escapeHtml(sectionLabel(sectionId));
    let body = '<p><em>Not available.</em></p>';

    switch (sectionId) {
      case 'customer_details': {
        const c = input.payload.customer;
        if (c) {
          body = renderList(
            [
              `Name: ${c.name}`,
              c.contactPerson ? `Contact: ${c.contactPerson}` : null,
              c.email ? `Email: ${c.email}` : null,
              c.phone ? `Phone: ${c.phone}` : null,
            ].filter((v): v is string => Boolean(v)),
          );
        }
        break;
      }
      case 'property_details': {
        const p = input.payload.property;
        if (p) {
          body = renderList(
            [
              p.propertyName ? `Property: ${p.propertyName}` : null,
              p.formattedAddress ? `Address: ${p.formattedAddress}` : null,
              ...p.addressLines,
            ].filter((v): v is string => Boolean(v)),
          );
        }
        break;
      }
      case 'property_map': {
        const m = input.payload.map;
        if (m?.availability === 'place_url' && m.placeUrl) {
          body = `<p><a href="${escapeHtml(m.placeUrl)}">View property on Google Maps</a></p><p class="muted">${escapeHtml(m.note)}</p>`;
        } else {
          body = `<p class="muted">${escapeHtml(m?.note ?? 'Map unavailable.')}</p>`;
        }
        break;
      }
      case 'job_details': {
        const j = input.payload.job;
        if (j) {
          body = renderList(
            [
              j.jobNumber ? `Job number: ${j.jobNumber}` : null,
              `Title: ${j.title}`,
              j.jobType ? `Type: ${j.jobType}` : null,
              `Status: ${j.status}`,
              j.completedAt ? `Completed: ${j.completedAt}` : null,
            ].filter((v): v is string => Boolean(v)),
          );
        }
        break;
      }
      case 'diagnosis':
        body = input.payload.diagnosis
          ? `<p>${escapeHtml(input.payload.diagnosis)}</p>`
          : '<p><em>No diagnosis recorded on the completion snapshot.</em></p>';
        break;
      case 'work_completed':
        body = input.payload.workCompleted
          ? `<p>${escapeHtml(input.payload.workCompleted)}</p>`
          : '<p><em>No work-completed summary recorded.</em></p>';
        break;
      case 'materials_used':
        body = renderList(
          (input.payload.materials ?? []).map(
            (line) => `${line.description} — ${line.quantity} ${line.unit} (${line.status})`,
          ),
        );
        break;
      case 'technician_details': {
        const t = input.payload.technician;
        body = t?.name
          ? `<p>${escapeHtml(t.name)}</p>`
          : '<p><em>Technician name not available.</em></p>';
        break;
      }
      case 'photos_before':
        body = renderList(
          (input.payload.photosBefore ?? []).map((p) =>
            p.downloadPath ? `${p.title} (${p.downloadPath})` : p.title,
          ),
        );
        break;
      case 'photos_during':
        body = renderList(
          (input.payload.photosDuring ?? []).map((p) =>
            p.downloadPath ? `${p.title} (${p.downloadPath})` : p.title,
          ),
        );
        break;
      case 'photos_after':
        body = renderList(
          (input.payload.photosAfter ?? []).map((p) =>
            p.downloadPath ? `${p.title} (${p.downloadPath})` : p.title,
          ),
        );
        break;
      case 'quote':
        body = input.payload.quote
          ? `<p>${escapeHtml(input.payload.quote.label)} (ref ${escapeHtml(input.payload.quote.id)})</p>`
          : '<p><em>No quote linked.</em></p>';
        break;
      case 'boq':
        body = input.payload.boq
          ? `<p>${escapeHtml(input.payload.boq.label)} (ref ${escapeHtml(input.payload.boq.id)})</p>`
          : '<p><em>No BOQ linked.</em></p>';
        break;
      case 'invoice':
        body = input.payload.invoice
          ? `<p>${escapeHtml(input.payload.invoice.label)} (ref ${escapeHtml(input.payload.invoice.id)})</p>`
          : '<p><em>No invoice linked.</em></p>';
        break;
      case 'payment_receipt':
        body = input.payload.paymentReceipt
          ? `<p>${escapeHtml(input.payload.paymentReceipt.label)} (ref ${escapeHtml(input.payload.paymentReceipt.id)})</p>`
          : '<p><em>No payment receipt linked.</em></p>';
        break;
      case 'coc':
        body = renderList((input.payload.coc ?? []).map((d) => `${d.title} [${d.source}]`));
        break;
      case 'warranty':
        body = renderList((input.payload.warranty ?? []).map((d) => `${d.title} [${d.source}]`));
        break;
      case 'customer_signature': {
        const sig = input.payload.customerSignature;
        if (sig?.present) {
          body = `<p>Signed by ${escapeHtml(sig.customerRepName ?? 'customer representative')}${sig.signatureDocId ? ` (evidence ${escapeHtml(sig.signatureDocId)})` : ''}.</p>`;
        } else {
          body = `<p class="muted">${escapeHtml(sig?.unavailableReason ?? 'Signature not captured.')}</p>`;
        }
        break;
      }
      default:
        break;
    }

    sections.push(`<section><h2>${heading}</h2>${body}</section>`);
  }

  const bodyHtml = `
    <p class="muted">Report ${escapeHtml(input.reportNumber)} · Generated ${escapeHtml(input.generatedAt)}</p>
    ${sections.join('\n    ')}
  `;

  return buildYoungGunsReportShellHtml({
    reportKind: 'service',
    reportTitle: input.title,
    generatedAt: input.generatedAt,
    bodyHtml,
  });
}

export function completionReportDeliveryNote(input: {
  status: CompletionReportStatus;
  documentId: string | null;
  emailDraftId: string | null;
}): string {
  if (input.status === 'cancelled') {
    return 'Report cancelled — not customer-facing.';
  }
  if (!input.documentId) {
    return 'Generate the report to create a Documents record (HTML) before attaching or sending.';
  }
  if (input.emailDraftId) {
    return 'Email Centre draft created with report attachment link. Approve then execute in Email Centre (Gmail). Resend remains transactional-only.';
  }
  if (input.status === 'ready_to_send' || input.status === 'generated') {
    return 'Report document ready. Attach via Email Centre (kind=report) or add a Communication Timeline note. Send only after Gmail draft → approve → execute.';
  }
  return 'Draft report — select sections, then generate.';
}
