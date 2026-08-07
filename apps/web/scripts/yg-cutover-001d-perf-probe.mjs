#!/usr/bin/env node
/**
 * YG-CUTOVER-001D — measurable shell + bundle evidence (staging + local build).
 * Authenticated dashboard timings require credentials; those are recorded as contracts.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const repoRoot = resolve(webRoot, '../..');
const outDir = join(repoRoot, 'diagnostic-output');
mkdirSync(outDir, { recursive: true });

const STAGING_WEB = 'https://comfortable-determination-staging.up.railway.app';
const STAGING_API = 'https://young-guns-os-staging.up.railway.app';

function curlTiming(url) {
  const format = [
    'http_code=%{http_code}',
    'time_namelookup=%{time_namelookup}',
    'time_connect=%{time_connect}',
    'time_starttransfer=%{time_starttransfer}',
    'time_total=%{time_total}',
    'size_download=%{size_download}',
  ].join(';');
  try {
    const out = execSync(`curl -sS -o /dev/null -w '${format}' '${url}'`, {
      encoding: 'utf8',
      timeout: 30000,
    });
    const map = Object.fromEntries(
      out
        .trim()
        .split(';')
        .map((part) => {
          const [k, v] = part.split('=');
          return [k, Number(v)];
        }),
    );
    return {
      url,
      httpCode: map.http_code,
      ttfbMs: Math.round((map.time_starttransfer ?? 0) * 1000),
      totalMs: Math.round((map.time_total ?? 0) * 1000),
      bytes: map.size_download ?? 0,
    };
  } catch (error) {
    return { url, error: String(error), ttfbMs: null, totalMs: null };
  }
}

function largestJsChunks(distAssetsDir, limit = 8) {
  if (!existsSync(distAssetsDir)) return [];
  return readdirSync(distAssetsDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => {
      const path = join(distAssetsDir, name);
      return { name, bytes: statSync(path).size };
    })
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

const dashSource = readFileSync(
  join(webRoot, 'src/features/dashboard/ExecutiveDashboard.tsx'),
  'utf8',
);
const appSource = readFileSync(join(webRoot, 'src/App.tsx'), 'utf8');

const progressivePaintContract = {
  unit: 'ms_after_auth_ready',
  before_001d: {
    criticalPathIncludes: [
      'executive-summary',
      'OwnerCommandFinancePulse (finance/owner-command + growth-planner immediately)',
      'ops@120',
      'fleet/Cartrack@180',
      'support@320',
      'Maps config+script only after LiveOperationsPanel mount + markers',
    ],
    blockingFullPageSpinners: ['ProtectedRoute session', 'TechnicianRoute Loading… duplicate'],
  },
  after_001d: {
    shellFirst: true,
    sequence: [
      { surface: 'auth session (ProtectedRoute only)', deferMs: 0 },
      { surface: 'executive-summary → AURA + Heartbeat + Attention/Jobs cards', deferMs: 0 },
      { surface: 'ops intelligence', deferMs: 120 },
      { surface: 'Cartrack + Maps warmup (config+script)', deferMs: 180 },
      { surface: 'OwnerCommandFinancePulse', deferMs: 250 },
      { surface: 'Connections / Quick tools', deferMs: 320 },
      { surface: 'Maps panel mount reuses warmed script', deferMs: '≥180' },
    ],
    codeEvidence: {
      deferFinancePulse: /DEFER_FINANCE_PULSE_MS\s*=\s*250/.test(dashSource),
      warmMaps: /warmGoogleMapsForDashboard/.test(dashSource),
      lazyPortal: /routes\/portal-pages/.test(appSource),
      lazyMobile: /routes\/mobile-pages/.test(appSource),
    },
  },
};

const shellProbes = [
  curlTiming(`${STAGING_WEB}/`),
  curlTiming(`${STAGING_API}/api/v1/health/ready`),
];

const distAssets = join(webRoot, 'dist/assets');
const chunks = largestJsChunks(distAssets);
const indexChunk = chunks.find((c) => c.name.startsWith('index-')) ?? null;

const report = {
  label: 'YG-CUTOVER-001D-perf-probe',
  capturedAt: new Date().toISOString(),
  staging: { web: STAGING_WEB, api: STAGING_API },
  shellTimings: shellProbes,
  progressivePaintContract,
  localBundle: {
    note: existsSync(distAssets)
      ? 'Post-build chunk sizes from apps/web/dist/assets'
      : 'No dist/ yet — run pnpm --filter @titan/web build',
    largestJs: chunks,
    indexChunkBytes: indexChunk?.bytes ?? null,
  },
  authDashboardNote:
    'Authenticated time-to-shell / time-to-useful-dashboard requires staging session credentials; client progressive-paint schedule above is the enforceable 001D contract.',
  productionTouched: 0,
};

writeFileSync(join(outDir, 'yg-cutover-001d-perf-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
