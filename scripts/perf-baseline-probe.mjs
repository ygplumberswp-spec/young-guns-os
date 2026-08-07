#!/usr/bin/env node
/**
 * PERF-001 — unauthenticated staging + local bundle probes.
 * Authenticated route timings require Owner session (documented separately).
 */
import { execSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const webDist = join(repoRoot, 'apps/web/dist/assets');
const stagingWeb = 'https://comfortable-determination-staging.up.railway.app';
const stagingApi = 'https://young-guns-os-staging.up.railway.app';

async function curlTiming(url) {
  const out = execSync(
    `curl -sS -o /dev/null -w '%{http_code}\\t%{time_starttransfer}\\t%{time_total}' '${url}'`,
    { encoding: 'utf8' },
  ).trim();
  const [http, ttfb, total] = out.split('\t');
  return { url, http: Number(http), ttfbMs: Math.round(Number(ttfb) * 1000), totalMs: Math.round(Number(total) * 1000) };
}

function bundleStats() {
  let files;
  try {
    files = readdirSync(webDist).filter((f) => f.endsWith('.js'));
  } catch {
    return { error: 'Run pnpm --filter @titan/web run build first' };
  }
  const chunks = files
    .map((name) => {
      const path = join(webDist, name);
      const bytes = statSync(path).size;
      return { name, bytes, kb: Math.round(bytes / 1024) };
    })
    .sort((a, b) => b.bytes - a.bytes);
  const index = chunks.find((c) => c.name.startsWith('index-'));
  const aura = chunks.find((c) => c.name.startsWith('useAuraChat-'));
  const dashboard = chunks.find((c) => c.name.startsWith('DashboardPage-'));
  return {
    chunkCount: chunks.length,
    mainIndexBytes: index?.bytes ?? null,
    mainIndexKb: index?.kb ?? null,
    auraChatBytes: aura?.bytes ?? null,
    dashboardPageBytes: dashboard?.bytes ?? null,
    top10: chunks.slice(0, 10),
  };
}

const probes = [
  `${stagingWeb}/`,
  `${stagingWeb}/health`,
  `${stagingApi}/api/v1/health/ready`,
  `${stagingApi}/api/v1/crm/customers?limit=20`,
  `${stagingApi}/api/v1/jobs?limit=20`,
  `${stagingApi}/api/v1/finance/invoices?limit=20`,
  `${stagingApi}/api/v1/dashboard/executive-summary`,
];

const results = {
  generatedAt: new Date().toISOString(),
  label: 'TITAN-PERF-001-baseline-probe',
  branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim(),
  head: execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim(),
  stagingWeb,
  stagingApi,
  stagingDbRef: 'cpkuwtaipjxeipvbssvn',
  productionForbidden: 'rshuiaghmtrvvilhqpwm',
  networkProbes: [],
  bundles: bundleStats(),
  note: 'Authenticated Owner route timings not captured — requires staging login session.',
};

for (const url of probes) {
  results.networkProbes.push(await curlTiming(url));
}

const outPath = join(repoRoot, 'diagnostic-output/titan-perf-001-baseline-probe.json');
writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
