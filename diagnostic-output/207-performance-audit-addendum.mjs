#!/usr/bin/env node
/**
 * Staging performance probe — records curl timings and vite bundle stats.
 * Usage: node diagnostic-output/207-performance-audit-addendum.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://young-guns-os-staging.up.railway.app';
const WEB = 'https://comfortable-determination-staging.up.railway.app';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GIT = '/usr/bin/git';

function git(args) {
  try {
    return execFileSync(GIT, args, { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function curlTiming(url) {
  const out = execFileSync('/usr/bin/curl', [
    '-sS',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}\t%{time_namelookup}\t%{time_connect}\t%{time_starttransfer}\t%{time_total}\t%{size_download}',
    url,
  ]);
  const [http, dns, connect, ttfb, total, size] = String(out).trim().split('\t');
  return {
    http: Number(http),
    dnsMs: Math.round(Number(dns) * 1000),
    connectMs: Math.round(Number(connect) * 1000),
    ttfbMs: Math.round(Number(ttfb) * 1000),
    totalMs: Math.round(Number(total) * 1000),
    sizeBytes: Number(size),
  };
}

function bundleStats() {
  const dist = join(ROOT, 'apps/web/dist/assets');
  const files = readdirSync(dist).filter((f) => f.endsWith('.js'));
  const chunks = files
    .map((file) => {
      const path = join(dist, file);
      const size = statSync(path).size;
      return { file, sizeBytes: size, sizeKb: Math.round(size / 1024) };
    })
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 12);
  const index = files.find((f) => f.startsWith('index-'));
  const aura = files.find((f) => f.startsWith('useAuraChat-'));
  return {
    totalJsFiles: files.length,
    indexChunkKb: index ? Math.round(statSync(join(dist, index)).size / 1024) : null,
    auraChatChunkKb: aura ? Math.round(statSync(join(dist, aura)).size / 1024) : null,
    largestChunks: chunks,
  };
}

const endpoints = [
  { name: 'api_health_ready', url: `${API}/api/v1/health/ready` },
  { name: 'web_index', url: `${WEB}/` },
  { name: 'api_customers_unauth', url: `${API}/api/v1/crm/customers?limit=20` },
  { name: 'api_jobs_unauth', url: `${API}/api/v1/jobs?limit=20` },
  { name: 'api_invoices_unauth', url: `${API}/api/v1/finance/invoices?limit=20` },
  { name: 'api_background_work_unauth', url: `${API}/api/v1/background-work/status` },
  { name: 'api_analytics_unauth', url: `${API}/api/v1/analytics/dashboard` },
];

const report = {
  generatedAt: new Date().toISOString(),
  environment: 'staging',
  apiOrigin: API,
  webOrigin: WEB,
  branch: git(['branch', '--show-current']),
  commit: git(['rev-parse', '--short', 'HEAD']),
  probes: Object.fromEntries(endpoints.map((e) => [e.name, curlTiming(e.url)])),
  bundle: bundleStats(),
  notes: [
    'Unauthenticated API probes measure edge + auth rejection latency only (HTTP 401 expected).',
    'Authenticated route and AURA message timings require staging credentials — not invented here.',
  ],
};

const outPath = join(ROOT, 'diagnostic-output/207-performance-audit-addendum.json');
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
