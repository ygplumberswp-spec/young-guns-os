/**
 * Reusable Young Guns branded report shell for printable/downloadable reports.
 * Reports without PDF/export yet inherit tokens only — see REPORT_EXPORT_STATUS.
 */

import {
  DOCUMENT_COLOR_TOKENS,
  DOCUMENT_PRINT_TOKENS,
  documentVariantLabel,
  YOUNG_GUNS_CONTACT,
  type TitanReportKind,
} from './document-engine.js';
import { operationalReportKindLabel, type OperationalReportKind } from './operational-report.js';
import { workforceReportKindLabel, type WorkforceReportKind } from './workforce-report.js';
import { YOUNG_GUNS_SLOGAN } from './young-guns-theme.js';

export type YoungGunsReportShellInput = {
  /** Document-engine report kind (legacy section-based reports). */
  reportKind?: TitanReportKind;
  /** Operational PDF export kind — preferred for job/completion/service/maintenance exports. */
  operationalKind?: OperationalReportKind;
  /** Workforce PDF export kind — technician activity, timesheet, productivity, operations summary. */
  workforceKind?: WorkforceReportKind;
  reportTitle?: string | null;
  periodLabel?: string | null;
  generatedAt?: string | null;
  filterSummary?: string | null;
  bodyHtml: string;
  pageNumber?: number | null;
  pageCount?: number | null;
};

/** Local implementation status for operational report PDF exports. */
export const REPORT_EXPORT_STATUS: Record<string, 'implemented' | 'not_yet_implemented'> = {
  job: 'implemented',
  completion: 'implemented',
  service: 'implemented',
  maintenance: 'implemented',
  inspection: 'not_yet_implemented',
  technician_activity: 'implemented',
  technician_timesheet: 'implemented',
  technician_productivity: 'implemented',
  workforce_operations: 'implemented',
  technician: 'implemented',
  finance: 'not_yet_implemented',
  customer: 'not_yet_implemented',
  fleet: 'not_yet_implemented',
  compliance_coc: 'not_yet_implemented',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildYoungGunsReportShellCss(): string {
  const c = DOCUMENT_COLOR_TOKENS;
  const p = DOCUMENT_PRINT_TOKENS;
  return `
    @page { size: ${p.pageWidthMm}mm ${p.pageHeightMm}mm portrait; margin: ${p.marginMm}mm; }
    body { margin: 0; background: ${c.pageBackground}; color: ${c.textBody}; font-family: Inter, Arial, sans-serif; font-size: ${p.bodyPt}pt; }
    .yg-report { display: flex; flex-direction: column; gap: 6mm; }
    .yg-report__header { display: flex; justify-content: space-between; gap: 12px; border: 1px solid ${c.panelBorder}; border-radius: 8px; padding: 5mm 6mm; background: linear-gradient(180deg, ${c.panelBackgroundRaised} 0%, ${c.panelBackground} 100%); }
    .yg-report__brand { margin: 0; color: ${c.textPrimary}; font-size: 14pt; font-weight: 700; }
    .yg-report__tagline { margin: 2px 0 0; color: ${c.textMuted}; font-size: 9pt; }
    .yg-report__title { margin: 0; color: ${c.labelBlue}; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11pt; }
    .yg-report__meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; font-size: 9pt; color: ${c.textMuted}; }
    .yg-report__meta strong { color: ${c.textPrimary}; }
    .yg-report__body { border: 1px solid ${c.panelBorder}; border-radius: 8px; padding: 5mm 6mm; background: ${c.panelBackground}; }
    .yg-report__body section { margin-bottom: 1.25rem; }
    .yg-report__body section h2 { margin: 0 0 0.5rem; font-size: 10.5pt; color: ${c.labelBlue}; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid ${c.panelBorder}; padding-bottom: 0.25rem; }
    .yg-report__body .muted { color: ${c.textMuted}; font-size: 9pt; }
    .yg-report__body ul { padding-left: 1.2rem; margin: 0.35rem 0; }
    .yg-report__body a { color: ${c.labelBlue}; }
    .yg-report__footer { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; color: ${c.textMuted}; font-size: 8.5pt; border-top: 1px solid ${c.panelBorder}; padding-top: 3mm; }
    .yg-report__slogan { color: ${c.labelBlue}; font-style: italic; }
  `;
}

/** Branded HTML shell wrapping report body content for print/PDF pipelines. */
export function buildYoungGunsReportShellHtml(input: YoungGunsReportShellInput): string {
  const variant = input.workforceKind
    ? workforceReportKindLabel(input.workforceKind)
    : input.operationalKind
      ? operationalReportKindLabel(input.operationalKind)
      : input.reportKind
        ? documentVariantLabel({ type: 'report', reportKind: input.reportKind })
        : 'Report';
  const title = input.reportTitle?.trim() || variant;
  const pageLabel =
    input.pageNumber && input.pageCount
      ? `Page ${input.pageNumber} of ${input.pageCount}`
      : input.pageNumber
        ? `Page ${input.pageNumber}`
        : null;

  return `<!DOCTYPE html>
<html lang="en-ZA">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${buildYoungGunsReportShellCss()}</style>
</head>
<body>
  <article class="yg-report">
    <header class="yg-report__header">
      <div>
        <h1 class="yg-report__brand">${escapeHtml(YOUNG_GUNS_CONTACT.tradingName)}</h1>
        <p class="yg-report__tagline">${escapeHtml(YOUNG_GUNS_CONTACT.tagline)}</p>
      </div>
      <div>
        <p class="yg-report__title">${escapeHtml(variant)}</p>
        <p class="yg-report__brand" style="font-size:12pt;margin-top:4px;">${escapeHtml(title)}</p>
      </div>
    </header>
    <div class="yg-report__meta">
      ${input.periodLabel ? `<div><strong>Period</strong><br />${escapeHtml(input.periodLabel)}</div>` : ''}
      ${input.generatedAt ? `<div><strong>Generated</strong><br />${escapeHtml(input.generatedAt)}</div>` : ''}
      ${input.filterSummary ? `<div style="grid-column:1/-1;"><strong>Filters</strong><br />${escapeHtml(input.filterSummary)}</div>` : ''}
    </div>
    <section class="yg-report__body">${input.bodyHtml}</section>
    <footer class="yg-report__footer">
      <span>${escapeHtml(YOUNG_GUNS_CONTACT.tradingName)} · ${escapeHtml(YOUNG_GUNS_CONTACT.phone)} · ${escapeHtml(YOUNG_GUNS_CONTACT.email)}</span>
      <span class="yg-report__slogan">${escapeHtml(YOUNG_GUNS_SLOGAN)}</span>
      ${pageLabel ? `<span>${escapeHtml(pageLabel)}</span>` : ''}
    </footer>
  </article>
</body>
</html>`;
}
