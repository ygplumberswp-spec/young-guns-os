import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFinanceDocumentPreviewModel,
  countPdfPages,
  isValidPdfBuffer,
} from '@titan/shared';
import {
  probeFinancePdfRendererAvailability,
  renderFinanceDocumentPreviewPdf,
} from './finance-document-pdf.service.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function line(description: string, unitPriceCents = 45000) {
  return { description, quantity: 1, unitPriceCents, vatRateBps: 1500 };
}

function buildLongInvoice(lineCount: number) {
  const lines = Array.from({ length: lineCount }, (_, index) =>
    line(`Line item ${index + 1} — extended plumbing labour and materials`, 12500 + index * 100),
  );
  return buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    customer: { name: 'Long Customer Name (Pty) Ltd — Cape Town Northern Suburbs Account' },
    customerReference: 'PO-2026-EXTENDED-REFERENCE',
    addresses: {
      billingAddress:
        '123 Very Long Street Name Extension, Industrial Business Park West, Cape Town, 7441',
      siteAddress:
        '456 Site Access Road, Behind Main Complex Block C, Table View, Cape Town, 7441',
      postalAddress:
        '456 Site Access Road, Behind Main Complex Block C, Table View, Cape Town, 7441',
    },
    workCompleted:
      'Completed full geyser replacement, pressure testing, valve installation, and system commissioning with extended customer walkthrough.',
    warranty: { text: '90 day workmanship on installed components', months: 3 },
    recommendedMaintenance: {
      text: 'Schedule annual plumbing inspection',
      items: [{ label: 'Flush geyser' }, { label: 'Check PRV' }, { label: 'Inspect anode' }],
    },
    lines,
  });
}

test('genuine Puppeteer PDF renders multi-page invoice documents when Chromium is available', async (t) => {
  const probe = await probeFinancePdfRendererAvailability();
  if (!probe.available) {
    t.skip(`Chromium unavailable (${probe.source})`);
    return;
  }

  const artifactDir = join(repoRoot, 'test-results', 'j66d');
  mkdirSync(artifactDir, { recursive: true });

  const cases = [
    { name: '1-line', lineCount: 1, minPages: 1 },
    { name: '30-line', lineCount: 30, minPages: 2 },
    { name: '100-line', lineCount: 100, minPages: 3 },
  ] as const;

  for (const scenario of cases) {
    const model = buildLongInvoice(scenario.lineCount);
    const pdf = await renderFinanceDocumentPreviewPdf(model);
    assert.ok(isValidPdfBuffer(pdf), `${scenario.name}: valid PDF signature`);
    const pages = countPdfPages(pdf);
    assert.ok(pages >= scenario.minPages, `${scenario.name}: expected >= ${scenario.minPages}, got ${pages}`);
    const artifactPath = join(artifactDir, `invoice-${scenario.name}.pdf`);
    writeFileSync(artifactPath, pdf);
  }
});
