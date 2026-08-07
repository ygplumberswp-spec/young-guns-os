/**
 * JPE-003 — READ-ONLY staging linkage backlog analysis. Never writes job IDs.
 * Usage: node --import tsx src/bin/jpe-003-staging-linkage-analysis.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '@titan/db';
import { JobLinkageControlService } from '../services/job-linkage-control.service.js';
import { JobProfitabilityService } from '../services/job-profitability.service.js';
import { JobCostControlService } from '../services/job-cost-control.service.js';

const STAGING = 'cpkuwtaipjxeipvbssvn';
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const YG = '095aef76-fef5-4139-af37-a42f2d7e2faf';

function loadEnv(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[s.slice(0, i).trim()] = v;
  }
  return out;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
if (!fs.existsSync(envPath)) {
  console.error('BLOCKED: apps/api/.env.staging.local not found');
  process.exit(2);
}

const env = loadEnv(envPath);
if (!env.DATABASE_URL?.includes(STAGING) || env.DATABASE_URL.includes(FORBIDDEN)) {
  console.error('BLOCKED: staging guard');
  process.exit(2);
}

const db = createDb(env.DATABASE_URL);
const profitabilityService = new JobProfitabilityService(db);
const costControlService = new JobCostControlService(db, profitabilityService);
const linkageService = new JobLinkageControlService(db, profitabilityService, costControlService);

const analysis = await linkageService.runReadOnlyLinkageAnalysis(YG);

const output = {
  label: 'jpe-003-staging-linkage-analysis',
  generatedAt: new Date().toISOString(),
  stagingRef: STAGING,
  companyId: YG,
  readOnly: true,
  historicalJobIdsWritten: 0,
  table: {
    unlinkedInvoices: analysis.categories.unlinkedInvoices,
    unlinkedQuotes: analysis.categories.unlinkedQuotes,
    deterministicMatches: analysis.categories.deterministicMatches,
    highConfidenceSuggestions: analysis.categories.highConfidenceSuggestions,
    ambiguous: analysis.categories.ambiguous,
    noCandidate: analysis.categories.noCandidate,
  },
  examples: analysis.examples,
};

const outDir = path.resolve(repoRoot, 'diagnostic-output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'jpe-003-staging-linkage-analysis.json');
fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
console.error(`Wrote ${outFile}`);
