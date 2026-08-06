import puppeteer, { type Browser } from 'puppeteer';
import { isValidPdfBuffer } from '@titan/shared';
import {
  CHROMIUM_PDF_LAUNCH_ARGS,
  FINANCE_PDF_RENDER_TIMEOUT_MS,
  resolveChromiumExecutablePath,
} from '../lib/chromium-executable.js';

export class ChromiumPdfError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ChromiumPdfError';
  }
}

export async function launchChromiumPdfBrowser(): Promise<Browser> {
  const resolution = await resolveChromiumExecutablePath();
  if (!resolution.executablePath) {
    throw new ChromiumPdfError(
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

/** Renders print-ready HTML to a genuine application/pdf buffer via headless Chromium. */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchChromiumPdfBrowser();

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
      throw new ChromiumPdfError('PDF_RENDER_FAILED', 'Renderer did not produce a valid PDF');
    }
    return buffer;
  } catch (error) {
    if (error instanceof ChromiumPdfError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ChromiumPdfError('PDF_RENDER_FAILED', message);
  } finally {
    await browser.close();
  }
}

export async function probeChromiumPdfAvailability(): Promise<{
  available: boolean;
  source: 'env' | 'candidate' | 'bundled' | 'none';
}> {
  const resolution = await resolveChromiumExecutablePath();
  return {
    available: resolution.executablePath != null,
    source: resolution.source,
  };
}
