import { buildYoungGunsReportShellHtml } from './young-guns-report-shell.js';
import type {
  MaintenanceReportContext,
  OperationalJobReportContext,
  OperationalReportAudience,
  OperationalReportKind,
  OperationalReportPhoto,
  OperationalReportSignature,
} from './operational-report.js';
import { operationalReportKindLabel, resolveJobContextForAudience, resolveMaintenanceContextForAudience } from './operational-report.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function buildJobDerivedBody(ctx: OperationalJobReportContext, kind: OperationalReportKind): string {
  const sections: string[] = [];

  sections.push(
    section(
      'Report summary',
      renderList(
        [
          `Report type: ${operationalReportKindLabel(kind)}`,
          ctx.jobNumber ? `Job number: ${ctx.jobNumber}` : null,
          `Job title: ${ctx.jobTitle}`,
          `Status: ${ctx.jobStatus}`,
          ctx.priority ? `Priority: ${ctx.priority}` : null,
          ctx.scheduledAt ? `Scheduled: ${ctx.scheduledAt}` : null,
          ctx.completedAt ? `Completed: ${ctx.completedAt}` : null,
          `Completion: ${ctx.completionStatus}`,
        ].filter((v): v is string => Boolean(v)),
        'No summary available.',
      ),
    ),
  );

  sections.push(
    section(
      'Customer',
      renderList(
        [
          `Name: ${ctx.customerName}`,
          ctx.customerContact ? `Contact: ${ctx.customerContact}` : null,
          ctx.customerEmail ? `Email: ${ctx.customerEmail}` : null,
          ctx.customerPhone ? `Phone: ${ctx.customerPhone}` : null,
        ].filter((v): v is string => Boolean(v)),
        'Customer details unavailable.',
      ),
    ),
  );

  const addressLines = [
    ctx.propertyName ? `Property: ${ctx.propertyName}` : null,
    ctx.siteAddress ? `Site: ${ctx.siteAddress}` : null,
    ...ctx.addressLines,
  ].filter((v): v is string => Boolean(v));

  sections.push(section('Property / site', renderList(addressLines, 'No property address recorded.')));

  if (ctx.mapPlaceUrl) {
    sections.push(
      section(
        'Map',
        `<p><a href="${escapeHtml(ctx.mapPlaceUrl)}">View on Google Maps</a></p><p class="muted">${escapeHtml(ctx.mapNote ?? '')}</p>`,
      ),
    );
  }

  sections.push(section('Assigned technician', renderParagraph(ctx.technicianName, 'No technician assigned.')));
  sections.push(section('Job description', renderParagraph(ctx.jobDescription, 'No job description recorded.')));

  if (ctx.diagnosis) {
    sections.push(section('Diagnosis', renderParagraph(ctx.diagnosis, 'No diagnosis recorded.')));
  }

  sections.push(section('Work completed', renderParagraph(ctx.workCompleted, 'No work-completed summary recorded.')));

  if (ctx.internalNotes) {
    sections.push(section('Internal notes', renderParagraph(ctx.internalNotes, 'No internal notes.')));
  }

  if (ctx.materials.length) {
    sections.push(
      section(
        'Materials / parts used',
        renderList(
          ctx.materials.map((m) => `${m.description} — ${m.quantity} ${m.unit} (${m.status})`),
          'No materials recorded.',
        ),
      ),
    );
  }

  if (ctx.photosBefore.length) {
    sections.push(section('Before photos', renderPhotos(ctx.photosBefore, 'No before photos.')));
  }
  if (ctx.photosDuring.length) {
    sections.push(section('During photos', renderPhotos(ctx.photosDuring, 'No during photos.')));
  }
  if (ctx.photosAfter.length) {
    sections.push(section('After photos', renderPhotos(ctx.photosAfter, 'No after photos.')));
  }
  if (ctx.supportingPhotos.length) {
    sections.push(section('Supporting photos', renderPhotos(ctx.supportingPhotos, 'No supporting photos.')));
  }

  if (ctx.attachments.length) {
    sections.push(
      section(
        'Attachments',
        renderList(ctx.attachments.map((a) => a.title), 'No attachments.'),
      ),
    );
  }

  sections.push(section('Signatures', renderSignatures(ctx.signatures)));

  if (ctx.recommendedMaintenance) {
    sections.push(section('Recommended maintenance', renderParagraph(ctx.recommendedMaintenance, '')));
  }
  if (ctx.warrantyNotes) {
    sections.push(section('Warranty', renderParagraph(ctx.warrantyNotes, '')));
  }

  sections.push(
    section(
      'Certificate of Compliance',
      ctx.cocState === 'attached' && ctx.cocReference
        ? `<p>COC evidence attached: ${escapeHtml(ctx.cocReference)}</p>`
        : '<p class="muted">No COC evidence attached.</p>',
    ),
  );

  if (ctx.quoteLabel) {
    sections.push(section('Linked quote', renderParagraph(ctx.quoteLabel, '')));
  }
  if (ctx.invoiceLabel) {
    sections.push(section('Linked invoice', renderParagraph(ctx.invoiceLabel, '')));
  }

  return sections.join('\n');
}

export function buildOperationalJobReportHtml(input: {
  kind: OperationalReportKind;
  audience: OperationalReportAudience;
  ctx: OperationalJobReportContext;
  generatedAt: string;
}): string {
  const ctx = resolveJobContextForAudience(input.ctx, input.audience);
  const bodyHtml = `
    <p class="muted">Reference ${escapeHtml(ctx.reportReference)} · Generated ${escapeHtml(input.generatedAt)}</p>
    ${buildJobDerivedBody(ctx, input.kind)}
  `;

  return buildYoungGunsReportShellHtml({
    operationalKind: input.kind,
    reportTitle: `${operationalReportKindLabel(input.kind)} — ${ctx.jobNumber ?? ctx.jobTitle}`,
    generatedAt: input.generatedAt,
    bodyHtml,
  });
}

export function buildServiceReportHtml(input: {
  ctx: OperationalJobReportContext;
  audience: OperationalReportAudience;
  generatedAt: string;
}): string {
  const ctx = resolveJobContextForAudience(input.ctx, input.audience);
  const sections: string[] = [
    section(
      'Service summary',
      renderList(
        [
          ctx.jobNumber ? `Job: ${ctx.jobNumber}` : null,
          `Customer: ${ctx.customerName}`,
          ctx.siteAddress ? `Site: ${ctx.siteAddress}` : null,
          ctx.scheduledAt ? `Service date: ${ctx.scheduledAt}` : null,
          ctx.technicianName ? `Technician: ${ctx.technicianName}` : null,
          `Status: ${ctx.jobStatus}`,
        ].filter((v): v is string => Boolean(v)),
        'No service summary.',
      ),
    ),
    section('Reported issue / description', renderParagraph(ctx.jobDescription, 'No reported issue recorded.')),
    section('Inspection / findings', renderParagraph(ctx.diagnosis, 'No inspection findings recorded.')),
    section('Work performed', renderParagraph(ctx.workCompleted, 'No work performed summary recorded.')),
  ];

  if (ctx.materials.length) {
    sections.push(
      section(
        'Materials used',
        renderList(
          ctx.materials.map((m) => `${m.description} — ${m.quantity} ${m.unit}`),
          'No materials recorded.',
        ),
      ),
    );
  }

  const allPhotos = [...ctx.photosBefore, ...ctx.photosDuring, ...ctx.photosAfter, ...ctx.supportingPhotos];
  sections.push(section('Photos', renderPhotos(allPhotos, 'No photos attached.')));
  if (input.audience === 'internal' && input.ctx.internalNotes) {
    sections.push(
      section('Outstanding concerns', renderParagraph(input.ctx.internalNotes, 'No outstanding concerns recorded.')),
    );
  } else if (input.audience !== 'internal') {
    sections.push(section('Outstanding concerns', renderParagraph(null, 'No outstanding concerns recorded.')));
  }
  sections.push(section('Recommended maintenance', renderParagraph(ctx.recommendedMaintenance, 'No recommendations recorded.')));
  sections.push(section('Warranty notes', renderParagraph(ctx.warrantyNotes, 'No warranty notes recorded.')));
  sections.push(section('Signatures', renderSignatures(ctx.signatures)));

  return buildYoungGunsReportShellHtml({
    operationalKind: 'service',
    reportTitle: `Service Report — ${ctx.jobNumber ?? ctx.jobTitle}`,
    generatedAt: input.generatedAt,
    bodyHtml: `<p class="muted">Reference ${escapeHtml(ctx.reportReference)}</p>${sections.join('\n')}`,
  });
}

export function buildMaintenanceReportHtml(input: {
  ctx: MaintenanceReportContext;
  audience?: OperationalReportAudience;
  generatedAt: string;
}): string {
  const audience = input.audience ?? 'internal';
  const ctx = resolveMaintenanceContextForAudience(input.ctx, audience);
  const sections = [
    section(
      'Maintenance summary',
      renderList(
        [
          `Plan: ${ctx.planName}`,
          `Plan status: ${ctx.planStatus}`,
          ctx.visitDate ? `Visit date: ${ctx.visitDate}` : null,
          `Run status: ${ctx.runStatus}`,
          ctx.customerName ? `Customer: ${ctx.customerName}` : null,
          ctx.propertyAddress ? `Property: ${ctx.propertyAddress}` : null,
          ctx.technicianName ? `Technician: ${ctx.technicianName}` : null,
        ].filter((v): v is string => Boolean(v)),
        'No maintenance summary.',
      ),
    ),
    section('Tasks completed', renderList(ctx.tasksCompleted, 'No completed tasks recorded.')),
    section('Tasks not completed', renderList(ctx.tasksNotCompleted, 'None recorded.')),
    section('Findings', renderParagraph(ctx.findings, 'No findings recorded.')),
  ];

  if (ctx.materials.length) {
    sections.push(
      section(
        'Materials used',
        renderList(
          ctx.materials.map((m) => `${m.description} — ${m.quantity} ${m.unit}`),
          'No materials recorded.',
        ),
      ),
    );
  }

  sections.push(section('Photos', renderPhotos(ctx.photos, 'No photos attached.')));
  sections.push(section('Risk / attention items', renderList(ctx.riskItems, 'No risk items recorded.')));
  sections.push(
    section(
      'Recommended next maintenance',
      renderParagraph(
        ctx.recommendedNext,
        ctx.nextDueAt ? `Next due: ${ctx.nextDueAt}` : 'No next maintenance date configured.',
      ),
    ),
  );
  if (audience === 'internal' && input.ctx.notes) {
    sections.push(section('Notes', renderParagraph(input.ctx.notes, '')));
  }
  sections.push(section('Signatures', renderSignatures(ctx.signatures)));

  return buildYoungGunsReportShellHtml({
    operationalKind: 'maintenance',
    reportTitle: `Maintenance Report — ${ctx.planName}`,
    generatedAt: input.generatedAt,
    bodyHtml: `<p class="muted">Reference ${escapeHtml(ctx.reportReference)}</p>${sections.join('\n')}`,
  });
}
