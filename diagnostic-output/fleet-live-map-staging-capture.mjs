#!/usr/bin/env node
/** Capture /fleet/live-map staging screenshots (disposable tenant — UI shell only). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'fleet-live-map-staging');
const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';

async function signupOwner() {
  const suffix = randomBytes(4).toString('hex');
  const email = `fleet227-${suffix}@staging-verify.local`;
  const password = `Fleet227!${suffix}`;
  const res = await fetch(`${API}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'Fleet',
      lastName: 'Verify',
      companyName: `Fleet Verify ${suffix}`,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || 'signup failed');
  return json.data.accessToken;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await signupOwner();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  await context.addInitScript((accessToken) => {
    localStorage.setItem('titan_access_token', accessToken);
  }, token);

  const page = await context.newPage();
  await page.goto(`${WEB}/fleet/live-map`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);

  const heading = await page.locator('h1, .page-header__title').first().textContent();
  const bodyText = await page.locator('body').innerText();
  const hasNotImplemented = /NOT IMPLEMENTED|Today's dispatch board/i.test(bodyText);
  const hasFleetLiveMap = /Fleet Live Map/i.test(bodyText);

  await page.screenshot({ path: path.join(OUT, 'fleet-live-map-desktop-1440.png'), fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'fleet-live-map-mobile-375.png'), fullPage: true });

  await browser.close();

  const meta = {
    capturedAt: new Date().toISOString(),
    route: '/fleet/live-map',
    heading: heading?.trim() ?? null,
    hasFleetLiveMapHeading: hasFleetLiveMap,
    hasLegacyNotImplemented: hasNotImplemented,
    hasDispatchBoardHeading: /Today's dispatch board/i.test(bodyText),
    screenshots: [
      'diagnostic-output/fleet-live-map-staging/fleet-live-map-desktop-1440.png',
      'diagnostic-output/fleet-live-map-staging/fleet-live-map-mobile-375.png',
    ],
    note: 'Disposable tenant — map empty state expected; verifies route renders Fleet Live Map not legacy dispatch.',
  };
  fs.writeFileSync(path.join(OUT, 'capture-meta.json'), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
