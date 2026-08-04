import puppeteer, { type Browser } from 'puppeteer';
import {
  buildFinanceDocumentPreviewHtml,
  isValidPdfBuffer,
  type FinanceDocumentPreviewModel,
} from '@titan/shared';
import {
  CHROMIUM_PDF_LAUNCH_ARGS,
  FINANCE_PDF_RENDER_TIMEOUT_MS,
  resolveChromiumExecutablePath,
} from '../lib/chromium-executable.js';

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

export async function launchFinancePdfBrowser(): Promise<Browser> {
  const resolution = await resolveChromiumExecutablePath();
  if (!resolution.executablePath) {
    throw new FinanceDocumentPdfError(
      'CHROMIUM_UNAVAILABLE',
      'Headless Chromium is not available for PDF rendering. Install Chromium in the API image or set PUPPETEER_EXECUTABLE_PATH.',
    );
  }

  return puppeteer.launch({
    headless: true,
    executablePath: resolution.executablePath,
    args: [...CHROMIUM_PDF_LAUNCH_ARGS],
    timeout: FINANCE_PDF_RENDER_TIMEOUT_MS,
  });
}

/** Document engine print HTML → genuine application/pdf via headless Chromium. */
export class PuppeteerFinanceDocumentPdfRenderer implements FinanceDocumentPdfRenderer {
  async renderPreviewPdf(model: FinanceDocumentPreviewModel): Promise<Buffer> {
    const html = buildFinanceDocumentPreviewHtml(model);
    const browser = await launchFinancePdfBrowser();

    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(FINANCE_PDF_RENDER_TIMEOUT_MS);
      await page.setContent(html, { waitUntil: 'load', timeout: FINANCE_PDF_RENDER_TIMEOUT_MS });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        timeout: FINANCE_PDF_RENDER_TIMEOUT_MS,
      });
      const buffer = Buffer.from(pdf);
      if (!isValidPdfBuffer(buffer)) {
        throw new FinanceDocumentPdfError('PDF_RENDER_FAILED', 'Renderer did not produce a valid PDF');
      }
      return buffer;
    } catch (error) {
      if (error instanceof FinanceDocumentPdfError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new FinanceDocumentPdfError('PDF_RENDER_FAILED', message);
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

export async function probeFinancePdfRendererAvailability(): Promise<{
  available: boolean;
  source: 'env' | 'candidate' | 'bundled' | 'none';
}> {
  const resolution = await resolveChromiumExecutablePath();
  return {
    available: resolution.executablePath != null,
    source: resolution.source,
  };
}
