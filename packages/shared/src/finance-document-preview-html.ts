/**
 * Document engine print/HTML serialization for finance preview PDFs.
 * Official Young Guns Plumbing quote and invoice layout — dynamic HTML, not flat images.
 */

import {
  DOCUMENT_COLOR_TOKENS,
  DOCUMENT_PRINT_TOKENS,
  YOUNG_GUNS_BANK_DETAILS,
  YOUNG_GUNS_CONTACT,
  documentSectionLabel,
} from './document-engine.js';
import type { FinanceDocumentPreviewModel } from './finance-document-preview.js';
import {
  YOUNG_GUNS_REVIEW_HEADING,
  YOUNG_GUNS_SLOGAN,
  documentStatusColor,
  documentStatusTone,
} from './young-guns-theme.js';

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

function card(title: string, icon: string, inner: string): string {
  const body = inner.trim() || '<p class="titan-doc__body-text">—</p>';
  return `
    <section class="titan-doc__info-card">
      <h3 class="titan-doc__info-card-title"><span class="titan-doc__info-icon" aria-hidden="true">${icon}</span>${escapeHtml(title)}</h3>
      <div class="titan-doc__info-card-body">${body}</div>
    </section>`;
}

export function buildFinanceDocumentPrintCss(): string {
  const c = DOCUMENT_COLOR_TOKENS;
  const p = DOCUMENT_PRINT_TOKENS;
  return `
  @page { size: ${p.pageWidthMm}mm ${p.pageHeightMm}mm portrait; margin: ${p.marginMm}mm; }
  body { margin: 0; background: ${c.pageBackground}; color: ${c.textBody}; font-family: Inter, Montserrat, Arial, sans-serif; font-size: ${p.bodyPt}pt; }
  .titan-doc { padding: 0; display: flex; flex-direction: column; gap: 6mm; }
  .titan-doc__panel { position: relative; overflow: hidden; background: linear-gradient(180deg, ${c.panelBackgroundRaised} 0%, ${c.panelBackground} 100%); border: 1px solid ${c.panelBorder}; border-radius: 8px; padding: 5mm 6mm; break-inside: avoid; }
  .titan-doc__artwork { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 90% at 12% -10%, rgba(31,122,236,0.2) 0%, transparent 60%), radial-gradient(90% 70% at 100% 0%, rgba(14,79,168,0.16) 0%, transparent 55%); opacity: 0.85; }
  .titan-doc__panel > * { position: relative; }
  .titan-doc__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .titan-doc__brand-mark { margin: 0; font-size: 28pt; font-weight: 800; letter-spacing: 0.04em; color: ${c.labelBlue}; line-height: 1; }
  .titan-doc__brand-name { margin: 4px 0 0; font-size: 13pt; color: ${c.textPrimary}; font-weight: 700; }
  .titan-doc__brand-tagline { margin: 2px 0 0; color: ${c.textMuted}; font-size: 9pt; }
  .titan-doc__doc-type-wrap { text-align: right; border-left: 2px solid ${c.labelBlue}; padding-left: 10px; }
  .titan-doc__doc-type-label { margin: 0; color: ${c.labelBlue}; text-transform: uppercase; letter-spacing: 0.1em; font-size: 11pt; font-weight: 700; }
  .titan-doc__doc-number { margin: 6px 0 0; font-size: 12pt; color: ${c.textPrimary}; font-weight: 700; }
  .titan-doc__contact-strip { display: flex; flex-wrap: wrap; gap: 10px 18px; font-size: 9pt; color: ${c.textMuted}; }
  .titan-doc__contact-strip strong { color: ${c.textPrimary}; }
  .titan-doc__cards-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4mm; }
  .titan-doc__info-card { background: ${c.panelBackground}; border: 1px solid ${c.panelBorder}; border-radius: 8px; padding: 4mm; break-inside: avoid; }
  .titan-doc__info-card-title { margin: 0 0 8px; font-size: 10pt; color: ${c.textPrimary}; display: flex; align-items: center; gap: 6px; }
  .titan-doc__info-icon { display: inline-flex; width: 18px; height: 18px; border-radius: 50%; background: ${c.brandBlue}; color: #fff; align-items: center; justify-content: center; font-size: 9pt; }
  .titan-doc__field-label { display: block; color: ${c.labelBlue}; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; }
  .titan-doc__field-value { display: block; color: ${c.textPrimary}; margin-top: 2px; font-size: ${p.importantPt}pt; }
  .titan-doc__status { display: inline-block; padding: 6px 12px; border-radius: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 11pt; border: 1px solid ${c.panelBorder}; }
  .titan-doc__section-title { margin: 0 0 10px; color: ${c.textPrimary}; font-size: ${p.sectionHeadingPt}pt; }
  .titan-doc__body-text { margin: 0; white-space: pre-wrap; line-height: 1.45; }
  .titan-doc__table { width: 100%; border-collapse: collapse; }
  .titan-doc__table thead th { text-align: left; background: linear-gradient(180deg, ${c.bannerFrom} 0%, ${c.bannerTo} 100%); color: ${c.textPrimary}; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 6px; border: none; }
  .titan-doc__table tbody td { padding: 8px 6px; border-bottom: 1px solid ${c.panelBorder}; vertical-align: top; background: ${c.panelBackgroundRaised}; }
  .titan-doc__num { text-align: right; font-variant-numeric: tabular-nums; }
  .titan-doc__totals-wrap { display: flex; gap: 6mm; flex-wrap: wrap; }
  .titan-doc__totals { margin-left: auto; width: min(100%, 280px); display: flex; flex-direction: column; gap: 6px; }
  .titan-doc__totals-row { display: flex; justify-content: space-between; gap: 12px; }
  .titan-doc__totals-row--grand { font-size: 13pt; font-weight: 700; color: ${c.textPrimary}; background: linear-gradient(180deg, ${c.bannerFrom} 0%, ${c.bannerTo} 100%); padding: 8px 10px; border-radius: 6px; margin-top: 4px; }
  .titan-doc__checklist { margin: 0; padding-left: 18px; }
  .titan-doc__checklist li { margin: 4px 0; color: ${c.textBody}; }
  .titan-doc__bank { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; font-size: ${p.importantPt}pt; }
  .titan-doc__review { text-align: center; padding: 4mm; }
  .titan-doc__stars { color: #facc15; letter-spacing: 2px; font-size: 14pt; }
  .titan-doc__footer { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; color: ${c.textMuted}; font-size: 9pt; border-top: 1px solid ${c.panelBorder}; padding-top: 4mm; }
  .titan-doc__slogan { color: ${c.labelBlue}; font-style: italic; font-size: 10pt; }
  .titan-doc__photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .titan-doc__photo img { width: 100%; height: auto; border-radius: 6px; border: 1px solid ${c.panelBorder}; display: block; }
`;
}

const PRINT_CSS = buildFinanceDocumentPrintCss();

function documentTypeHeading(model: FinanceDocumentPreviewModel): string {
  return model.documentType === 'invoice' ? 'TAX INVOICE' : 'QUOTE';
}

function customerCardTitle(model: FinanceDocumentPreviewModel): string {
  return model.documentType === 'invoice' ? 'Billed To' : 'Prepared For';
}

function statusCardTitle(model: FinanceDocumentPreviewModel): string {
  return model.documentType === 'invoice' ? 'Invoice Status' : 'Quote Status';
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildFinanceDocumentPreviewHtml(model: FinanceDocumentPreviewModel): string {
  const panels: string[] = [];
  const statusTone = documentStatusTone(model.status);
  const statusColor = documentStatusColor(statusTone);

  panels.push(`
    <section class="titan-doc__panel">
      <div class="titan-doc__artwork" aria-hidden="true"></div>
      <header class="titan-doc__header">
        <div>
          <p class="titan-doc__brand-mark">YGP</p>
          <h1 class="titan-doc__brand-name">${escapeHtml(YOUNG_GUNS_CONTACT.tradingName)}</h1>
          <p class="titan-doc__brand-tagline">${escapeHtml(YOUNG_GUNS_CONTACT.tagline)}</p>
        </div>
        <div class="titan-doc__doc-type-wrap">
          <p class="titan-doc__doc-type-label">${escapeHtml(documentTypeHeading(model))}</p>
          <p class="titan-doc__doc-number">${escapeHtml(model.documentNumber)}</p>
        </div>
      </header>
      <div class="titan-doc__contact-strip" style="margin-top:6mm;">
        <span><strong>Phone</strong> ${escapeHtml(YOUNG_GUNS_CONTACT.phone)}</span>
        <span><strong>Email</strong> ${escapeHtml(YOUNG_GUNS_CONTACT.email)}</span>
        <span><strong>Location</strong> ${escapeHtml(YOUNG_GUNS_CONTACT.location)}</span>
      </div>
    </section>
  `);

  const billedTo = [
    field('Customer', model.customer?.name ?? null),
    field('Contact', model.customer?.contactPerson ?? null),
    field('Email', model.customer?.email ?? null),
    field('Phone', model.customer?.phone ?? null),
    field('Billing address', model.documentAddresses.billingAddress),
    field('Postal address', model.documentAddresses.postalAddress),
  ].join('');

  const jobDetails = [
    field('Property / site', model.documentAddresses.siteAddress ?? model.property.addressLine),
    field('Job reference', model.job?.reference ?? null),
    field('Technician', model.job?.technician ?? null),
    field('Scheduled / completed', formatDate(model.job?.scheduledAt)),
    field('Customer reference', model.customerReference),
  ].join('');

  const metaDetails = [
    field('Issued', formatDate(model.issuedAt) ?? 'Draft — not yet issued'),
    model.documentType === 'invoice'
      ? field('Due date', formatDate(model.dueDate))
      : field('Valid until', formatDate(model.dueDate)),
  ].join('');

  const statusInner = `
    <span class="titan-doc__status" style="color:${statusColor};border-color:${statusColor};">${escapeHtml(formatStatusLabel(model.status))}</span>
    ${metaDetails}
  `;

  panels.push(`
    <div class="titan-doc__cards-row">
      ${card(customerCardTitle(model), '👤', billedTo)}
      ${card('Job Details', '🔧', jobDetails)}
      ${card(statusCardTitle(model), '✓', statusInner)}
    </div>
  `);

  const visibleSections = model.sections.filter((section) => section.visible);

  for (const section of visibleSections) {
    const text =
      typeof section.payload.text === 'string' ? section.payload.text.trim() : '';
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

    if (section.kind === 'recommended_maintenance') {
      const items = Array.isArray((section.payload as { items?: unknown }).items)
        ? ((section.payload as { items: Array<{ label?: string; description?: string }> }).items ?? [])
        : [];
      const body = text;
      if (!body && items.length === 0) continue;
      const list = items
        .map((item) => `<li>${escapeHtml(item.label ?? item.description ?? '')}</li>`)
        .join('');
      panels.push(`
        <section class="titan-doc__panel">
          <h2 class="titan-doc__section-title">${escapeHtml(documentSectionLabel('recommended_maintenance'))}</h2>
          ${body ? `<p class="titan-doc__body-text">${escapeHtml(body)}</p>` : ''}
          ${list ? `<ul class="titan-doc__checklist">${list}</ul>` : ''}
        </section>
      `);
    }
  }

  const pdfImages = (model.attachments ?? []).filter((item) => item.mimeType.startsWith('image/'));
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

  if (model.lineItems.length > 0) {
    const rows = model.lineItems
      .map(
        (line) => `
      <tr>
        <td class="titan-doc__num">${line.quantity}</td>
        <td>${escapeHtml(line.description)}</td>
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
              <th class="titan-doc__num">Qty</th>
              <th>Description</th>
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
      <div class="titan-doc__totals-wrap">
        <div style="flex:1;"></div>
        <div class="titan-doc__totals">
          <div class="titan-doc__totals-row"><span>Subtotal</span><span>${escapeHtml(formatMoney(model.totals.subtotalCents, model.totals.currency))}</span></div>
          <div class="titan-doc__totals-row"><span>${escapeHtml(model.vatRateLabel)}</span><span>${escapeHtml(formatMoney(model.totals.vatCents, model.totals.currency))}</span></div>
          <div class="titan-doc__totals-row titan-doc__totals-row--grand"><span>Total</span><span>${escapeHtml(formatMoney(model.totals.totalCents, model.totals.currency))}</span></div>
        </div>
      </div>
    </section>
  `);

  if (!model.hidePaymentOptions && model.documentType === 'invoice') {
    panels.push(`
      <section class="titan-doc__panel">
        <h2 class="titan-doc__section-title">${escapeHtml(documentSectionLabel('payment_options'))}</h2>
        <div class="titan-doc__bank">
          ${field('Account Name', YOUNG_GUNS_BANK_DETAILS.accountName)}
          ${field('Bank', YOUNG_GUNS_BANK_DETAILS.bank)}
          ${field('Account Number', YOUNG_GUNS_BANK_DETAILS.accountNumber)}
          ${field('Branch Code', YOUNG_GUNS_BANK_DETAILS.branchCode)}
          ${field('Reference', model.documentNumber)}
        </div>
        <p class="titan-doc__body-text">${escapeHtml(YOUNG_GUNS_BANK_DETAILS.referenceInstruction)}.</p>
      </section>
    `);
  }

  panels.push(`
    <section class="titan-doc__panel titan-doc__review">
      <h2 class="titan-doc__section-title">${escapeHtml(YOUNG_GUNS_REVIEW_HEADING)}</h2>
      <p class="titan-doc__stars" aria-label="Five star rating">★★★★★</p>
      <p class="titan-doc__body-text">If you were happy with our service, we would appreciate a Google review.</p>
    </section>
  `);

  panels.push(`
    <section class="titan-doc__panel">
      <footer class="titan-doc__footer">
        <span><strong>${escapeHtml(YOUNG_GUNS_CONTACT.tradingName)}</strong> · ${escapeHtml(YOUNG_GUNS_CONTACT.location)}</span>
        <span>${escapeHtml(YOUNG_GUNS_CONTACT.phone)} · ${escapeHtml(YOUNG_GUNS_CONTACT.email)}</span>
        <span class="titan-doc__slogan">${escapeHtml(YOUNG_GUNS_SLOGAN)}</span>
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
