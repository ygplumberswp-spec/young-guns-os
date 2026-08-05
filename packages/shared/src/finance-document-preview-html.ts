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
  financePreviewPhotoSectionTitle,
  formatVerifiedWebsiteDisplay,
  groupFinancePreviewAttachments,
} from './finance-document-preview-sections.js';
import { buildPaymentQrSvg } from './qr-code.js';
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

function escapeAttr(value: string): string {
  return escapeHtml(value);
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

function sectionPanel(title: string, inner: string): string {
  if (!inner.trim()) return '';
  return `
    <section class="titan-doc__panel titan-doc__section">
      <h2 class="titan-doc__section-title">${escapeHtml(title)}</h2>
      ${inner}
    </section>`;
}

function renderPhotoGrid(items: Array<{ fileName: string; mimeType: string; caption: string | null; dataUrl: string | null }>): string {
  const figures = items
    .filter((item) => item.mimeType.startsWith('image/') && item.dataUrl)
    .map(
      (item) => `
      <figure class="titan-doc__photo">
        <img src="${item.dataUrl}" alt="${escapeAttr(item.fileName)}" />
        ${item.caption?.trim() ? `<figcaption>${escapeHtml(item.caption.trim())}</figcaption>` : ''}
      </figure>`,
    )
    .join('');
  if (!figures) return '';
  return `<div class="titan-doc__photo-grid">${figures}</div>`;
}

function renderFileReferences(
  items: Array<{ fileName: string; mimeType: string; caption: string | null }>,
): string {
  if (items.length === 0) return '';
  const rows = items
    .map(
      (item) =>
        `<li><span class="titan-doc__attachment-name">${escapeHtml(item.fileName)}</span>${item.caption?.trim() ? ` — ${escapeHtml(item.caption.trim())}` : ''}</li>`,
    )
    .join('');
  return `<ul class="titan-doc__attachment-list">${rows}</ul>`;
}

export function buildFinanceDocumentPrintCss(): string {
  const c = DOCUMENT_COLOR_TOKENS;
  const p = DOCUMENT_PRINT_TOKENS;
  return `
  @page { size: ${p.pageWidthMm}mm ${p.pageHeightMm}mm portrait; margin: ${p.marginMm}mm; }
  body { margin: 0; background: ${c.pageBackground}; color: ${c.textBody}; font-family: Inter, Montserrat, Arial, sans-serif; font-size: ${p.bodyPt}pt; }
  .titan-doc { padding: 0; display: flex; flex-direction: column; gap: 6mm; }
  .titan-doc__panel { position: relative; overflow: hidden; background: linear-gradient(180deg, ${c.panelBackgroundRaised} 0%, ${c.panelBackground} 100%); border: 1px solid ${c.panelBorder}; border-radius: 8px; padding: 5mm 6mm; break-inside: avoid-page; page-break-inside: avoid; }
  .titan-doc__section { break-inside: avoid-page; page-break-inside: avoid; }
  .titan-doc__section-title { break-after: avoid-page; page-break-after: avoid; orphans: 3; widows: 3; }
  .titan-doc__artwork { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 90% at 12% -10%, rgba(31,122,236,0.2) 0%, transparent 60%), radial-gradient(90% 70% at 100% 0%, rgba(14,79,168,0.16) 0%, transparent 55%); opacity: 0.85; }
  .titan-doc__panel > * { position: relative; }
  .titan-doc__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .titan-doc__brand-mark { margin: 0; font-size: 28pt; font-weight: 800; letter-spacing: 0.04em; color: ${c.labelBlue}; line-height: 1; }
  .titan-doc__brand-name { margin: 4px 0 0; font-size: 13pt; color: ${c.textPrimary}; font-weight: 700; }
  .titan-doc__brand-tagline { margin: 2px 0 0; color: ${c.textMuted}; font-size: 9pt; }
  .titan-doc__doc-type-wrap { text-align: right; border-left: 2px solid ${c.labelBlue}; padding-left: 10px; }
  .titan-doc__doc-type-label { margin: 0; color: ${c.labelBlue}; text-transform: uppercase; letter-spacing: 0.1em; font-size: 11pt; font-weight: 700; }
  .titan-doc__doc-number { margin: 6px 0 0; font-size: 12pt; color: ${c.textPrimary}; font-weight: 700; word-break: break-word; }
  .titan-doc__contact-strip { display: flex; flex-wrap: wrap; gap: 10px 18px; font-size: 9pt; color: ${c.textMuted}; }
  .titan-doc__contact-strip strong { color: ${c.textPrimary}; }
  .titan-doc__cards-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4mm; }
  @media (max-width: 720px) { .titan-doc__cards-row { grid-template-columns: 1fr; } }
  .titan-doc__info-card { background: ${c.panelBackground}; border: 1px solid ${c.panelBorder}; border-radius: 8px; padding: 4mm; break-inside: avoid-page; page-break-inside: avoid; }
  .titan-doc__info-card-title { margin: 0 0 8px; font-size: 10pt; color: ${c.textPrimary}; display: flex; align-items: center; gap: 6px; }
  .titan-doc__info-icon { display: inline-flex; width: 18px; height: 18px; border-radius: 50%; background: ${c.brandBlue}; color: #fff; align-items: center; justify-content: center; font-size: 9pt; }
  .titan-doc__field-label { display: block; color: ${c.labelBlue}; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; }
  .titan-doc__field-value { display: block; color: ${c.textPrimary}; margin-top: 2px; font-size: ${p.importantPt}pt; word-break: break-word; }
  .titan-doc__status { display: inline-block; padding: 6px 12px; border-radius: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 11pt; border: 1px solid ${c.panelBorder}; }
  .titan-doc__section-title { margin: 0 0 10px; color: ${c.textPrimary}; font-size: ${p.sectionHeadingPt}pt; }
  .titan-doc__body-text { margin: 0; white-space: pre-wrap; line-height: 1.45; font-size: ${p.bodyPt}pt; }
  .titan-doc__table { width: 100%; border-collapse: collapse; }
  .titan-doc__table thead { display: table-header-group; }
  .titan-doc__table thead th { text-align: left; background: linear-gradient(180deg, ${c.bannerFrom} 0%, ${c.bannerTo} 100%); color: ${c.textPrimary}; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 6px; border: none; }
  .titan-doc__table tbody td { padding: 8px 6px; border-bottom: 1px solid ${c.panelBorder}; vertical-align: top; background: ${c.panelBackgroundRaised}; word-break: break-word; }
  .titan-doc__table tbody tr { break-inside: avoid-page; page-break-inside: avoid; }
  .titan-doc__num { text-align: right; font-variant-numeric: tabular-nums; }
  .titan-doc__totals-wrap { display: flex; gap: 6mm; flex-wrap: wrap; break-inside: avoid-page; page-break-inside: avoid; }
  .titan-doc__totals { margin-left: auto; width: min(100%, 280px); display: flex; flex-direction: column; gap: 6px; }
  .titan-doc__totals-row { display: flex; justify-content: space-between; gap: 12px; }
  .titan-doc__totals-row--grand { font-size: 13pt; font-weight: 700; color: ${c.textPrimary}; background: linear-gradient(180deg, ${c.bannerFrom} 0%, ${c.bannerTo} 100%); padding: 8px 10px; border-radius: 6px; margin-top: 4px; }
  .titan-doc__checklist { margin: 0; padding-left: 18px; }
  .titan-doc__checklist li { margin: 4px 0; color: ${c.textBody}; font-size: ${p.bodyPt}pt; }
  .titan-doc__bank { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; font-size: ${p.importantPt}pt; }
  .titan-doc__bank .titan-doc__field-value { font-size: 12pt; font-weight: 600; }
  .titan-doc__pay { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .titan-doc__pay-qr svg { width: 96px; height: 96px; }
  .titan-doc__pay-button { display: inline-block; padding: 10px 16px; border-radius: 6px; background: ${c.brandBlue}; color: #fff; text-decoration: none; font-weight: 700; }
  .titan-doc__review { text-align: center; padding: 4mm; }
  .titan-doc__stars { color: #facc15; letter-spacing: 2px; font-size: 14pt; }
  .titan-doc__footer { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; color: ${c.textMuted}; font-size: 9pt; border-top: 1px solid ${c.panelBorder}; padding-top: 4mm; break-inside: avoid-page; page-break-inside: avoid; }
  .titan-doc__slogan { color: ${c.labelBlue}; font-style: italic; font-size: 10pt; }
  .titan-doc__photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .titan-doc__photo img { width: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; border: 1px solid ${c.panelBorder}; display: block; background: ${c.panelBackgroundRaised}; }
  .titan-doc__photo figcaption { margin-top: 4px; font-size: 8.5pt; color: ${c.textMuted}; }
  .titan-doc__attachment-list { margin: 0; padding-left: 18px; }
  .titan-doc__attachment-name { font-weight: 600; color: ${c.textPrimary}; }
  .titan-doc__subsection-title { margin: 12px 0 6px; font-size: 10pt; color: ${c.labelBlue}; text-transform: uppercase; letter-spacing: 0.06em; }
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
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderVisibleTextSections(model: FinanceDocumentPreviewModel, panels: string[]): void {
  for (const section of model.sections.filter((s) => s.visible)) {
    const text = typeof section.payload.text === 'string' ? section.payload.text.trim() : '';
    if (
      (section.kind === 'scope_of_work' ||
        section.kind === 'terms_exclusions' ||
        section.kind === 'work_completed' ||
        section.kind === 'custom') &&
      text
    ) {
      panels.push(
        sectionPanel(documentSectionLabel(section.kind), `<p class="titan-doc__body-text">${escapeHtml(text)}</p>`),
      );
    }

    if (section.kind === 'warranty' && text) {
      const months =
        typeof section.payload.months === 'number' && section.payload.months > 0
          ? `<p class="titan-doc__body-text">Period: ${section.payload.months} month(s)</p>`
          : '';
      panels.push(
        sectionPanel(
          documentSectionLabel('warranty'),
          `${months}<p class="titan-doc__body-text">${escapeHtml(text)}</p>`,
        ),
      );
    }

    if (section.kind === 'recommended_maintenance') {
      const items = Array.isArray((section.payload as { items?: unknown }).items)
        ? ((section.payload as { items: Array<{ label?: string; description?: string }> }).items ?? [])
        : [];
      if (!text && items.length === 0) continue;
      const list = items
        .map((item) => `<li>${escapeHtml(item.label ?? item.description ?? '')}</li>`)
        .join('');
      panels.push(
        sectionPanel(
          documentSectionLabel('recommended_maintenance'),
          `${text ? `<p class="titan-doc__body-text">${escapeHtml(text)}</p>` : ''}${list ? `<ul class="titan-doc__checklist">${list}</ul>` : ''}`,
        ),
      );
    }

    if (section.kind === 'coc_attachment' && model.coc?.status === 'attached') {
      panels.push(
        sectionPanel(
          documentSectionLabel('coc_attachment'),
          `<p class="titan-doc__body-text">Certificate of Compliance: ${escapeHtml(model.coc.fileName)} (attached to this job record).</p>`,
        ),
      );
    }

    if (section.kind === 'contact_help') {
      const website = formatVerifiedWebsiteDisplay(YOUNG_GUNS_CONTACT.website);
      panels.push(
        sectionPanel(
          documentSectionLabel('contact_help'),
          `<div class="titan-doc__bank">
            ${field('Phone', YOUNG_GUNS_CONTACT.phone)}
            ${field('Email', YOUNG_GUNS_CONTACT.email)}
            ${field('Location', YOUNG_GUNS_CONTACT.location)}
            ${website ? field('Website', website) : ''}
          </div>
          <p class="titan-doc__body-text">For assistance with this document, contact Young Guns Plumbing during business hours.</p>`,
        ),
      );
    }
  }
}

function renderPhotoSections(model: FinanceDocumentPreviewModel, panels: string[]): void {
  const grouped = groupFinancePreviewAttachments(model.attachments ?? []);
  const hasBeforeAfter = grouped.before.length > 0 || grouped.after.length > 0;

  if (hasBeforeAfter) {
    let inner = '';
    if (grouped.before.length > 0) {
      inner += `<h3 class="titan-doc__subsection-title">Before</h3>${renderPhotoGrid(grouped.before)}`;
    }
    if (grouped.after.length > 0) {
      inner += `<h3 class="titan-doc__subsection-title">After</h3>${renderPhotoGrid(grouped.after)}`;
    }
    if (grouped.additional.length > 0) {
      inner += `<h3 class="titan-doc__subsection-title">Additional</h3>${renderPhotoGrid(grouped.additional)}`;
    }
    panels.push(sectionPanel('Before & After Photos', inner));
  } else {
    const images = [...grouped.additional, ...grouped.before, ...grouped.after];
    const grid = renderPhotoGrid(images);
    if (grid) {
      panels.push(sectionPanel(financePreviewPhotoSectionTitle(grouped), grid));
    }
  }

  const fileRefs = renderFileReferences(grouped.files);
  if (fileRefs) {
    panels.push(sectionPanel('Supporting Attachments', fileRefs));
  }
}

export function buildFinanceDocumentPreviewHtml(model: FinanceDocumentPreviewModel): string {
  const panels: string[] = [];
  const statusTone = documentStatusTone(model.status);
  const statusColor = documentStatusColor(statusTone);
  const websiteDisplay = formatVerifiedWebsiteDisplay(YOUNG_GUNS_CONTACT.website);

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
        ${websiteDisplay ? `<span><strong>Website</strong> ${escapeHtml(websiteDisplay)}</span>` : ''}
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

  renderVisibleTextSections(model, panels);

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
      <section class="titan-doc__panel titan-doc__section">
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

  const totalsRows = [
    `<div class="titan-doc__totals-row"><span>Subtotal</span><span>${escapeHtml(formatMoney(model.totals.subtotalCents, model.totals.currency))}</span></div>`,
    `<div class="titan-doc__totals-row"><span>${escapeHtml(model.vatRateLabel)}</span><span>${escapeHtml(formatMoney(model.totals.vatCents, model.totals.currency))}</span></div>`,
  ];
  if (model.documentType === 'invoice' && model.totals.depositReceivedCents > 0) {
    totalsRows.push(
      `<div class="titan-doc__totals-row"><span>Deposit received</span><span>${escapeHtml(formatMoney(model.totals.depositReceivedCents, model.totals.currency))}</span></div>`,
    );
  }
  if (model.documentType === 'invoice' && model.totals.amountPaidCents > 0) {
    totalsRows.push(
      `<div class="titan-doc__totals-row"><span>Amount paid</span><span>${escapeHtml(formatMoney(model.totals.amountPaidCents, model.totals.currency))}</span></div>`,
    );
  }
  totalsRows.push(
    `<div class="titan-doc__totals-row titan-doc__totals-row--grand"><span>Total</span><span>${escapeHtml(formatMoney(model.totals.totalCents, model.totals.currency))}</span></div>`,
  );
  if (model.documentType === 'invoice' && model.totals.outstandingCents > 0 && !model.hidePaymentOptions) {
    totalsRows.push(
      `<div class="titan-doc__totals-row"><span>Balance due</span><span>${escapeHtml(formatMoney(model.totals.outstandingCents, model.totals.currency))}</span></div>`,
    );
  }

  panels.push(`
    <section class="titan-doc__panel titan-doc__section">
      <div class="titan-doc__totals-wrap">
        <div style="flex:1;"></div>
        <div class="titan-doc__totals">${totalsRows.join('')}</div>
      </div>
    </section>
  `);

  renderPhotoSections(model, panels);

  if (!model.hidePaymentOptions && model.documentType === 'invoice') {
    let paymentInner = '';
    if (model.paymentUrl) {
      let qrSvg = '';
      try {
        qrSvg = buildPaymentQrSvg(model.paymentUrl);
      } catch {
        qrSvg = '';
      }
      paymentInner += `
        <div class="titan-doc__pay">
          ${qrSvg ? `<div class="titan-doc__pay-qr">${qrSvg}</div>` : ''}
          <div>
            <a class="titan-doc__pay-button" href="${escapeAttr(model.paymentUrl)}">Pay securely with Yoco</a>
            <p class="titan-doc__body-text">Scan the QR code or use the button to pay by card.</p>
          </div>
        </div>`;
    }
    paymentInner += `
      <h3 class="titan-doc__subsection-title">EFT / Bank Transfer</h3>
      <div class="titan-doc__bank">
        ${field('Account Name', YOUNG_GUNS_BANK_DETAILS.accountName)}
        ${field('Bank', YOUNG_GUNS_BANK_DETAILS.bank)}
        ${field('Account Number', YOUNG_GUNS_BANK_DETAILS.accountNumber)}
        ${field('Branch Code', YOUNG_GUNS_BANK_DETAILS.branchCode)}
        ${field('Account Type', YOUNG_GUNS_BANK_DETAILS.accountType)}
        ${field('Reference', model.documentNumber)}
      </div>
      <p class="titan-doc__body-text">${escapeHtml(YOUNG_GUNS_BANK_DETAILS.referenceInstruction)}.</p>`;
    panels.push(sectionPanel(documentSectionLabel('payment_options'), paymentInner));
  }

  if (model.showReviewSection) {
    let reviewInner = `
      <h2 class="titan-doc__section-title">${escapeHtml(YOUNG_GUNS_REVIEW_HEADING)}</h2>
      <p class="titan-doc__stars" aria-label="Five star rating">★★★★★</p>`;
    if (model.reviewUrl && model.reviewQrSvg) {
      reviewInner += `
        <div class="titan-doc__pay">
          <div class="titan-doc__pay-qr">${model.reviewQrSvg}</div>
          <p class="titan-doc__body-text">Scan to leave us a Google review, or visit:<br /><a href="${escapeAttr(model.reviewUrl)}">${escapeHtml(model.reviewUrl)}</a></p>
        </div>`;
    } else {
      reviewInner += `<p class="titan-doc__body-text">If you were happy with our service, we would appreciate a Google review.</p>`;
    }
    panels.push(`<section class="titan-doc__panel titan-doc__review">${reviewInner}</section>`);
  }

  panels.push(`
    <section class="titan-doc__panel">
      <footer class="titan-doc__footer">
        <span><strong>${escapeHtml(YOUNG_GUNS_CONTACT.tradingName)}</strong> · ${escapeHtml(YOUNG_GUNS_CONTACT.location)}</span>
        <span>${escapeHtml(YOUNG_GUNS_CONTACT.phone)} · ${escapeHtml(YOUNG_GUNS_CONTACT.email)}</span>
        ${websiteDisplay ? `<span>${escapeHtml(websiteDisplay)}</span>` : ''}
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

/** Counts PDF pages using /Type /Page markers — suitable for Puppeteer-generated PDFs. */
export function countPdfPages(buffer: Uint8Array | Buffer): number {
  const text = Buffer.from(buffer).toString('latin1');
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length ?? 0;
}

/** Validates a buffer begins with a PDF signature. */
export function isValidPdfBuffer(buffer: Uint8Array | Buffer): boolean {
  if (buffer.length < 5) return false;
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d;
}
