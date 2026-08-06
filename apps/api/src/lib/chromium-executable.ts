import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

/** Container and common host paths — checked in order after env override. */
export const CHROMIUM_CANDIDATE_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
] as const;

export type ChromiumResolution = {
  executablePath: string | null;
  source: 'env' | 'candidate' | 'bundled' | 'none';
};

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a headless Chromium executable without downloading at runtime.
 * Prefers PUPPETEER_EXECUTABLE_PATH, then known system paths, then Puppeteer's bundled binary.
 */
export async function resolveChromiumExecutablePath(): Promise<ChromiumResolution> {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (envPath && (await isExecutable(envPath))) {
    return { executablePath: envPath, source: 'env' };
  }

  for (const candidate of CHROMIUM_CANDIDATE_PATHS) {
    if (await isExecutable(candidate)) {
      return { executablePath: candidate, source: 'candidate' };
    }
  }

  try {
    const puppeteer = await import('puppeteer');
    const bundled = await Promise.resolve(puppeteer.default.executablePath?.());
    if (typeof bundled === 'string' && (await isExecutable(bundled))) {
      return { executablePath: bundled, source: 'bundled' };
    }
  } catch {
    // Puppeteer unavailable in this runtime — treat as not configured.
  }

  return { executablePath: null, source: 'none' };
}

/** Railway/container-safe launch arguments for headless PDF rendering. */
export const CHROMIUM_PDF_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
] as const;

export const FINANCE_PDF_RENDER_TIMEOUT_MS = 30_000;
