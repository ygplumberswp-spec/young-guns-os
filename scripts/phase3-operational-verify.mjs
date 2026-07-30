#!/usr/bin/env node
/**
 * Phase 3 operational verification — API health, logo uploads, page timings.
 * Does not print secrets or .env contents.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000';
const REPORT_PATH = process.env.REPORT_PATH ?? 'audit-output/phase3-operational-verification.json';

const OWNER_PAGES = [
  { name: 'Login', path: '/auth/login', public: true },
  { name: 'Dashboard', path: '/' },
  { name: 'Customers', path: '/crm' },
  { name: 'Jobs', path: '/jobs' },
  { name: 'Scheduling', path: '/scheduling' },
  { name: 'Quotes', path: '/finance/quotes' },
  { name: 'Invoices', path: '/finance/invoices' },
  { name: 'Payments', path: '/finance/payments' },
  { name: 'Sales', path: '/sales-intelligence' },
  { name: 'Marketing', path: '/marketing-intelligence' },
  { name: 'Integrations', path: '/integrations' },
  { name: 'Mission Control', path: '/mission-control' },
  { name: 'Security', path: '/security' },
  { name: 'Platform Health', path: '/platform-health' },
  { name: 'Release Center', path: '/release-center' },
  { name: 'Company Profile', path: '/settings/company' },
  { name: 'Settings About', path: '/settings/about' },
  { name: 'Owner AI Chat', path: '/aura' },
];

const PERFORMANCE_PAGES = [
  { name: 'Dashboard', path: '/' },
  { name: 'Integrations', path: '/integrations' },
  { name: 'Marketing', path: '/marketing-intelligence' },
  { name: 'Mission Control', path: '/mission-control' },
  { name: 'Owner AI Chat', path: '/aura' },
];

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'tablet', width: 1024, height: 768 },
  { label: 'mobile', width: 390, height: 844 },
];

function loadEnvEmailPassword() {
  try {
    const envPath = new URL('../apps/api/.env', import.meta.url);
    const raw = readFileSync(envPath, 'utf8');
    const email = raw.match(/^VERIFY_EMAIL=(.+)$/m)?.[1]?.trim();
    const password = raw.match(/^VERIFY_PASSWORD=(.+)$/m)?.[1]?.trim();
    return { email, password };
  } catch {
    return { email: process.env.VERIFY_EMAIL, password: process.env.VERIFY_PASSWORD };
  }
}

async function timedFetch(label, url, init) {
  const start = performance.now();
  const res = await fetch(url, init);
  const ms = Math.round(performance.now() - start);
  return { label, url, status: res.status, ms, ok: res.ok };
}

function tinyPngBase64() {
  // 1x1 red PNG
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

function tinyJpegBase64() {
  // minimal JPEG bytes
  const buf = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xff, 0xc4, 0x00, 0x14,
    0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0x80, 0xff, 0xd9,
  ]);
  return buf.toString('base64');
}

function tinyWebpBase64() {
  const buf = Buffer.from(
    'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=',
    'base64',
  );
  return buf.toString('base64');
}

async function signupTestUser() {
  const suffix = Date.now();
  const payload = {
    companyName: `Verify Co ${suffix}`,
    email: `verify.${suffix}@example.com`,
    password: 'VerifyTestPass123!',
    firstName: 'Verify',
    lastName: 'Operator',
  };
  const res = await fetch(`${API}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return {
    status: res.status,
    token: body?.data?.session?.accessToken ?? null,
    email: payload.email,
    password: payload.password,
  };
}

async function login(email, password) {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, token: body?.data?.session?.accessToken ?? null, body };
}

async function uploadLogo(token, mimeType, dataBase64) {
  const res = await fetch(`${API}/api/v1/company/media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ kind: 'logo', mimeType, dataBase64 }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function deleteLogo(token, fileId) {
  const res = await fetch(`${API}/api/v1/company/media/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status };
}

async function mediaStatus(token) {
  const res = await fetch(`${API}/api/v1/company/media/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, configured: body?.data?.configured ?? false };
}

async function fetchProfile(token) {
  const res = await fetch(`${API}/api/v1/company/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return body?.data?.profile ?? null;
}

async function runPlaywrightChecks(accessToken) {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    return { available: false, reason: 'playwright not installed' };
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();

      if (accessToken) {
        await page.addInitScript((token) => {
          localStorage.setItem('titan_access_token', token);
        }, accessToken);
      }

      for (const route of OWNER_PAGES) {
        const url = `${WEB}${route.path}`;
        const start = performance.now();
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(500);
        const ms = Math.round(performance.now() - start);
        const content = await page.content();
        const hasAttribution = content.includes('Created by Young Guns Plumbing');
        const hasZarVisible =
          /Currency:\s*ZAR|\bZAR\b/.test(content) &&
          !route.path.includes('/settings/company') &&
          route.path !== '/auth/login';

        results.push({
          viewport: viewport.label,
          page: route.name,
          path: route.path,
          status: response?.status() ?? 0,
          loadMs: ms,
          hasAttributionOnPage: hasAttribution,
          unexpectedZar: hasZarVisible,
          hasIdentity: content.includes('app-header__identity'),
          hasErrorText: /form-error|Unable to load|Something went wrong/i.test(content),
        });
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  return { available: true, results };
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    webUrl: WEB,
    apiUrl: API,
    health: {},
    auth: {},
    logoUploads: [],
    mediaStatus: null,
    performance: [],
    playwright: null,
    errors: [],
  };

  report.health.basic = await timedFetch('health', `${API}/api/v1/health`);
  report.health.ready = await timedFetch('ready', `${API}/api/v1/health/ready`);

  const { email, password } = loadEnvEmailPassword();
  let token = null;

  if (email && password) {
    const auth = await login(email, password);
    report.auth.login = { status: auth.status, hasToken: Boolean(auth.token), mode: 'login' };
    token = auth.token;
  }

  if (!token) {
    const signup = await signupTestUser();
    report.auth.signup = { status: signup.status, hasToken: Boolean(signup.token), mode: 'signup' };
    token = signup.token;
  }

  if (token) {
    report.mediaStatus = await mediaStatus(token);

    for (const [label, mime, data] of [
      ['png', 'image/png', tinyPngBase64()],
      ['jpeg', 'image/jpeg', tinyJpegBase64()],
      ['webp', 'image/webp', tinyWebpBase64()],
    ]) {
      const result = await uploadLogo(token, mime, data);
      const fileId = result.body?.data?.file?.id ?? result.body?.data?.profile?.preferences?.logoFileId;
      report.logoUploads.push({ format: label, status: result.status, fileId: fileId ?? null });
    }

    const profile = await fetchProfile(token);
    const logoFileId = profile?.preferences?.logoFileId;
    if (logoFileId) {
      const mediaRes = await timedFetch('logo-fetch', `${API}/api/v1/company/media/${logoFileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      report.logoFetch = mediaRes;

      const del = await deleteLogo(token, logoFileId);
      report.logoDelete = del;
      const profileAfter = await fetchProfile(token);
      report.logoRemoved = profileAfter?.preferences?.logoFileId == null;
    }

    for (const page of PERFORMANCE_PAGES) {
      report.performance.push(await timedFetch(page.name, `${WEB}${page.path}`));
    }

    report.playwright = await runPlaywrightChecks(token);
  } else {
    report.errors.push('Unable to authenticate for operational verification');
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Verification report written to ${REPORT_PATH}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
