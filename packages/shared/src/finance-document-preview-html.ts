/**
 * Document engine print/HTML serialization for finance preview PDFs.
 * Uses the same preview model and branding tokens as TitanDocumentView.
 */

import {
  YOUNG_GUNS_CONTACT,
  documentSectionLabel,
  documentVariantLabel,
} from './document-engine.js';
import type { FinanceDocumentPreviewModel } from './finance-document-preview.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(cents: number, currency = 'ZAR'): string {
  const whole = Math.trunc(Math.abs(cents) / 100);
  const fraction = String(Math.abs(cents) % 100).padStart(2, '0');
  const grouped = whole.toLocaleString('en-ZA');
  return `${cents < 0 ? '-' : ''}${currency} ${grouped}.${fraction}`;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: '2-digit' });
}

function field(label: string, value: string | null | undefined): string {
  if (!value?.trim()) return '';
  return `<div class="titan-doc__field"><span class="titan-doc__field-label">${escapeHtml(label)}</span><span class="titan-doc__field-value">${escapeHtml(value)}</span></div>`;
}

const PRINT_CSS = `
  @page { size: A4 portrait; margin: 10mm; }
  body { margin: 0; background: #04070d; color: #e6edf6; font-family: Inter, Arial, sans-serif; font-size: 10.5pt; }
  .titan-doc { padding: 0; display: flex; flex-direction: column; gap: 8mm; }
  .titan-doc__panel { position: relative; overflow: hidden; background: linear-gradient(180deg, #0e1522 0%, #0a0f18 100%); border: 1px solid #233043; border-radius: 8px; padding: 5mm 6mm; break-inside: avoid; }
  .titan-doc__header { display: flex; justify-content: space-between; gap: 16px; }
  .titan-doc__brand-name { margin: 0; font-size: 20pt; color: #fff; }
  .titan-doc__brand-tagline { margin: 4px 0 0; color: #a4b3c6; }
  .titan-doc__doc-type-label { margin: 0; color: #54a6ff; text-transform: uppercase; letter-spacing: 0.08em; font-size: 9.5pt; }
  .titan-doc__doc-number { margin: 6px 0 0; font-size: 13pt; color: #fff; font-weight: 700; }
  .titan-doc__section-title { margin: 0 0 10px; color: #fff; font-size: 12.5pt; }
  .titan-doc__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; }
  .titan-doc__field-label { display: block; color: #54a6ff; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.06em; }
  .titan-doc__field-value { display: block; color: #fff; margin-top: 2px; }
  .titan-doc__body-text { margin: 0; white-space: pre-wrap; line-height: 1.45; }
  .titan-doc__table { width: 100%; border-collapse: collapse; }
  .titan-doc__table th { text-align: left; color: #54a6ff; font-size: 9.5pt; border-bottom: 1px solid #233043; padding: 6px 4px; }
  .titan-doc__table td { padding: 8px 4px; border-bottom: 1px solid #233043; vertical-align: top; }
  .titan-doc__num { text-align: right; font-variant-numeric: tabular-nums; }
  .titan-doc__totals { margin-left: auto; width: min(100%, 280px); display: flex; flex-direction: column; gap: 6px; }
  .titan-doc__totals-row { display: flex; justify-content: space-between; gap: 12px; }
  .titan-doc__totals-row--grand { font-size: 13pt; font-weight: 700; color: #fff; border-top: 1px solid #233043; padding-top: 8px; margin-top: 4px; }
  .titan-doc__footer { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; color: #a4b3c6; font-size: 9.5pt; }
  .titan-doc__photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .titan-doc__photo { margin: 0; break-inside: avoid; }
  .titan-doc__photo img { width: 100%; height: auto; border-radius: 6px; border: 1px solid #233043; display: block; }
  .titan-doc__photo figcaption { margin-top: 4px; color: #a4b3c6; font-size: 9pt; }
  .titan-doc__attachment-list { margin: 0; padding-left: 18px; }
  .titan-doc__attachment-list li { margin: 4px 0; }
`;

export function buildFinanceDocumentPreviewHtml(model: FinanceDocumentPreviewModel): string {
  const variantLabel = documentVariantLabel({ type: model.documentType });
  const visibleSections = model.sections.filter((section) => section.visible);

  const panels: string[] = [];

  panels.push(`
    <section class="titan-doc__panel">
      <header class="titan-doc__header">
        <div>
          <h1 class="titan-doc__brand-name">${escapeHtml(YOUNG_GUNS_CONTACT.tradingName)}</h1>
          <p class="titan-doc__brand-tagline">${escapeHtml(YOUNG_GUNS_CONTACT.tagline)}</p>
        </div>
        <div>
          <p class="titan-doc__doc-type-label">${escapeHtml(variantLabel)}</p>
          <p class="titan-doc__doc-number">${escapeHtml(model.documentNumber)}</p>
        </div>
      </header>
    </section>
  `);

  panels.push(`
    <section class="titan-doc__panel">
      <h2 class="titan-doc__section-title">${escapeHtml(documentSectionLabel('document_meta'))}</h2>
      <div class="titan-doc__grid">
        ${field('Reference', model.documentNumber)}
        ${field('Customer reference', model.customerReference)}
        ${field('Issued', formatDate(model.issuedAt) ?? 'Draft — not yet issued')}
        ${field('Due', formatDate(model.dueDate))}
      </div>
    </section>
  `);

  panels.push(`
    <section class="titan-doc__panel">
      <h2 class="titan-doc__section-title">${escapeHtml(documentSectionLabel('customer_property'))}</h2>
      <div class="titan-doc__grid">
        ${field('Customer', model.customer?.name ?? null)}
        ${field('Contact', model.customer?.contactPerson ?? null)}
        ${field('Email', model.customer?.email ?? null)}
        ${field('Phone', model.customer?.phone ?? null)}
        ${field('Billing address', model.documentAddresses.billingAddress)}
        ${field('Site address', model.documentAddresses.siteAddress)}
        ${field('Postal address', model.documentAddresses.postalAddress)}
      </div>
    </section>
  `);

  if (model.job?.reference) {
    panels.push(`
      <section class="titan-doc__panel">
        <h2 class="titan-doc__section-title">${escapeHtml(documentSectionLabel('job_details'))}</h2>
        <div class="titan-doc__grid">${field('Job', model.job.reference)}</div>
      </section>
    `);
  }

  for (const section of visibleSections) {
    const text = typeof section.payload.text === 'string' ? section.payload.text.trim() : '';
    if (
      (section.kind === 'scope_of_work' ||
        section.kind === 'terms_exclusions' ||
        section.kind === 'custom') &&
      text
    ) {
      panels.push(`
        <section class="titan-doc__panel">
          <h2 class="titan-doc__section-title">${escapeHtml(documentSectionLabel(section.kind))}</h2>
          <p class="titan-doc__body-text">${escapeHtml(text)}</p>
        </section>
      `);
    }
  }

  const pdfImages = (model.attachments ?? []).filter((item) => item.mimeType.startsWith('image/'));
  const pdfFiles = (model.attachments ?? []).filter((item) => item.mimeType === 'application/pdf');

  if (pdfImages.length > 0) {
    const figures = pdfImages
      .map(
        (item) => `
      <figure class="titan-doc__photo">
        <img src="${item.dataUrl}" alt="${escapeHtml(item.fileName)}" />
        ${item.caption?.trim() ? `<figcaption>${escapeHtml(item.caption.trim())}</figcaption>` : ''}
      </figure>`,
      )
      .join('');
    panels.push(`
      <section class="titan-doc__panel">
        <h2 class="titan-doc__section-title">${escapeHtml(documentSectionLabel('image_gallery'))}</h2>
        <div class="titan-doc__photo-grid">${figures}</div>
      </section>
    `);
  }

  if (pdfFiles.length > 0) {
    const items = pdfFiles
      .map((item) => `<li>${escapeHtml(item.caption?.trim() || item.fileName)}</li>`)
      .join('');
    panels.push(`
      <section class="titan-doc__panel">
        <h2 class="titan-doc__section-title">Attachments</h2>
        <ul class="titan-doc__attachment-list">${items}</ul>
      </section>
    `);
  }

  if (model.lineItems.length > 0) {
    const rows = model.lineItems
      .map(
        (line) => `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        <td class="titan-doc__num">${line.quantity}</td>
        <td class="titan-doc__num">${escapeHtml(formatMoney(line.unitPriceCents))}</td>
        <td class="titan-doc__num">${escapeHtml(formatMoney(line.lineSubtotalCents))}</td>
      </tr>`,
      )
      .join('');

    panels.push(`
      <section class="titan-doc__panel">
        <h2 class="titan-doc__section-title">${escapeHtml(documentSectionLabel('line_items'))}</h2>
        <table class="titan-doc__table">
          <thead>
            <tr>
              <th>Description</th>
              <th class="titan-doc__num">Qty</th>
              <th class="titan-doc__num">Unit Price</th>
              <th class="titan-doc__num">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `);
  }

  panels.push(`
    <section class="titan-doc__panel">
      <h2 class="titan-doc__section-title">${escapeHtml(documentSectionLabel('totals'))}</h2>
      <div class="titan-doc__totals">
        <div class="titan-doc__totals-row"><span>Subtotal</span><span>${escapeHtml(formatMoney(model.totals.subtotalCents, model.totals.currency))}</span></div>
        <div class="titan-doc__totals-row"><span>${escapeHtml(model.vatRateLabel)}</span><span>${escapeHtml(formatMoney(model.totals.vatCents, model.totals.currency))}</span></div>
        <div class="titan-doc__totals-row titan-doc__totals-row--grand"><span>Total</span><span>${escapeHtml(formatMoney(model.totals.totalCents, model.totals.currency))}</span></div>
      </div>
    </section>
  `);

  panels.push(`
    <section class="titan-doc__panel">
      <footer class="titan-doc__footer">
        <span><strong>${escapeHtml(YOUNG_GUNS_CONTACT.tradingName)}</strong> — ${escapeHtml(YOUNG_GUNS_CONTACT.tagline)}</span>
        <span>${escapeHtml(YOUNG_GUNS_CONTACT.phone)} · ${escapeHtml(YOUNG_GUNS_CONTACT.email)} · ${escapeHtml(YOUNG_GUNS_CONTACT.website)}</span>
      </footer>
    </section>
  `);

  return `<!DOCTYPE html>
<html lang="en-ZA">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.downloadFilename.replace(/\.pdf$/i, ''))}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <article class="titan-doc">${panels.join('')}</article>
</body>
</html>`;
}

/** Validates a buffer begins with a PDF signature. */
export function isValidPdfBuffer(buffer: Uint8Array | Buffer): boolean {
  if (buffer.length < 5) return false;
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d;
}
