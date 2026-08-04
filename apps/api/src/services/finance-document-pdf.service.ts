import puppeteer from 'puppeteer';
import {
  buildFinanceDocumentPreviewHtml,
  isValidPdfBuffer,
  type FinanceDocumentPreviewModel,
} from '@titan/shared';

export class FinanceDocumentPdfError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceDocumentPdfError';
  }
}

export type FinanceDocumentPdfRenderer = {
  renderPreviewPdf(model: FinanceDocumentPreviewModel): Promise<Buffer>;
};

/** Document engine print HTML → genuine application/pdf via headless Chromium. */
export class PuppeteerFinanceDocumentPdfRenderer implements FinanceDocumentPdfRenderer {
  async renderPreviewPdf(model: FinanceDocumentPreviewModel): Promise<Buffer> {
    const html = buildFinanceDocumentPreviewHtml(model);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });
      const buffer = Buffer.from(pdf);
      if (!isValidPdfBuffer(buffer)) {
        throw new FinanceDocumentPdfError('PDF_RENDER_FAILED', 'Renderer did not produce a valid PDF');
      }
      return buffer;
    } finally {
      await browser.close();
    }
  }
}

let defaultRenderer: FinanceDocumentPdfRenderer | null = null;

export function getFinanceDocumentPdfRenderer(): FinanceDocumentPdfRenderer {
  if (!defaultRenderer) {
    defaultRenderer = new PuppeteerFinanceDocumentPdfRenderer();
  }
  return defaultRenderer;
}

export function setFinanceDocumentPdfRenderer(renderer: FinanceDocumentPdfRenderer | null): void {
  defaultRenderer = renderer;
}

export async function renderFinanceDocumentPreviewPdf(
  model: FinanceDocumentPreviewModel,
): Promise<Buffer> {
  return getFinanceDocumentPdfRenderer().renderPreviewPdf(model);
}
