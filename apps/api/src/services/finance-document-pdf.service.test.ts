import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFinanceDocumentPreviewModel, isValidPdfBuffer } from '@titan/shared';
import {
  FinanceDocumentPdfError,
  probeFinancePdfRendererAvailability,
  renderFinanceDocumentPreviewPdf,
  setFinanceDocumentPdfRenderer,
} from './finance-document-pdf.service.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const financeRouteSource = readFileSync(join(repoRoot, 'apps/api/src/routes/finance.ts'), 'utf8');
const chromiumSource = readFileSync(
  join(repoRoot, 'apps/api/src/lib/chromium-executable.ts'),
  'utf8',
);
const pdfServiceSource = readFileSync(
  join(repoRoot, 'apps/api/src/services/finance-document-pdf.service.ts'),
  'utf8',
);
const sharedChromiumPdfSource = readFileSync(
  join(repoRoot, 'apps/api/src/services/chromium-pdf.service.ts'),
  'utf8',
);

test('finance preview/pdf route returns application/pdf from document engine renderer', () => {
  assert.match(financeRouteSource, /\/documents\/preview\/pdf/);
  assert.match(financeRouteSource, /application\/pdf/);
  assert.match(financeRouteSource, /renderFinanceDocumentPreviewPdf/);
  assert.doesNotMatch(financeRouteSource, /previewDocument[\s\S]*?\.insert\(/);
});

test('finance PDF renderer resolves executable path without downloading on startup', () => {
  assert.match(chromiumSource, /PUPPETEER_EXECUTABLE_PATH/);
  assert.match(chromiumSource, /CHROMIUM_CANDIDATE_PATHS/);
  assert.match(pdfServiceSource, /launchFinancePdfBrowser/);
  assert.match(pdfServiceSource, /CHROMIUM_UNAVAILABLE/);
  assert.match(pdfServiceSource, /renderHtmlToPdf/);
  assert.match(sharedChromiumPdfSource, /browser\.close\(\)/);
});

test('probeFinancePdfRendererAvailability reports availability shape', async () => {
  const probe = await probeFinancePdfRendererAvailability();
  assert.equal(typeof probe.available, 'boolean');
  assert.ok(['env', 'candidate', 'bundled', 'none'].includes(probe.source));
});

test('renderFinanceDocumentPreviewPdf surfaces renderer failures clearly', async () => {
  setFinanceDocumentPdfRenderer({
    async renderPreviewPdf() {
      throw new FinanceDocumentPdfError('CHROMIUM_UNAVAILABLE', 'Chromium missing');
    },
  });

  await assert.rejects(
    () =>
      renderFinanceDocumentPreviewPdf(
        buildFinanceDocumentPreviewModel({
          kind: 'quote',
          lines: [{ description: 'Line', quantity: 1, unitPriceCents: 100, vatRateBps: 1500 }],
        }),
      ),
    (error: unknown) =>
      error instanceof FinanceDocumentPdfError && error.code === 'CHROMIUM_UNAVAILABLE',
  );
  setFinanceDocumentPdfRenderer(null);
});

test('renderFinanceDocumentPreviewPdf produces a valid PDF signature via renderer hook', async () => {
  setFinanceDocumentPdfRenderer({
    async renderPreviewPdf(model) {
      assert.equal(model.documentType, 'quote');
      assert.match(model.documentNumber, /Draft — Xero quote number pending/);
      return Buffer.from('%PDF-1.7\n% mock finance preview\n');
    },
  });

  const model = buildFinanceDocumentPreviewModel({
    kind: 'quote',
    lines: [{ description: 'Emergency call-out', quantity: 1, unitPriceCents: 45000, vatRateBps: 1500 }],
  });

  const pdf = await renderFinanceDocumentPreviewPdf(model);
  assert.ok(isValidPdfBuffer(pdf));
  setFinanceDocumentPdfRenderer(null);
});

test('invoice preview PDF renderer receives VAT totals from unsaved editor model', async () => {
  setFinanceDocumentPdfRenderer({
    async renderPreviewPdf(model) {
      assert.equal(model.documentType, 'invoice');
      assert.equal(model.totals.totalCents, 80500);
      return Buffer.from('%PDF-1.4 invoice preview');
    },
  });

  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    lines: [
      { description: 'Call-out', quantity: 1, unitPriceCents: 50000, vatRateBps: 1500 },
      { description: 'Parts', quantity: 2, unitPriceCents: 10000, vatRateBps: 1500 },
    ],
  });

  const pdf = await renderFinanceDocumentPreviewPdf(model);
  assert.ok(isValidPdfBuffer(pdf));
  setFinanceDocumentPdfRenderer(null);
});
