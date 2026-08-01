#!/usr/bin/env node
/**
 * Phase 0 route reconciliation probe — find unaccounted routes.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const app = readFileSync(resolve(repoRoot, 'apps/web/src/App.tsx'), 'utf8');
const md = readFileSync(resolve(repoRoot, 'TITAN_FINAL_ROUTE_AND_GAP_MATRIX.md'), 'utf8');
const json = JSON.parse(
  readFileSync(resolve(repoRoot, 'diagnostic-output/212-final-ux-route-matrix.json'), 'utf8'),
);

function extractStaffFromMatrix() {
  const staffSection = md.split('## Staff route matrix')[1]?.split('## Mobile routes')[0] ?? '';
  const routes = [];
  for (const m of staffSection.matchAll(/\| [^|]+ \| `([^`]+)` \|/g)) {
    routes.push(m[1]);
  }
  return routes;
}

function extractVerdicts(sectionName, nextSection) {
  const section = md.split(sectionName)[1]?.split(nextSection)[0] ?? '';
  const routes = [];
  for (const m of section.matchAll(/\| ([^|]+) \| `([^`]+)`[\s\S]*?\*\*(GO|HOLD|NO-GO)\*\*/g)) {
    routes.push({ page: m[1].trim(), route: m[2], verdict: m[3] });
  }
  return routes;
}

function extractAuthRoutes() {
  const routes = [];
  for (const m of app.matchAll(/<Route path="(\/auth[^"]+)"/g)) {
    routes.push(m[1]);
  }
  return routes;
}

function extractNestedRoutes(nestPath, prefix) {
  const re = new RegExp(`<Route path="${nestPath.replace('/', '\\/')}" nest>[\\s\\S]*?<\\/Route>`);
  const block = app.match(re)?.[0];
  if (!block) return [];
  const routes = [];
  for (const m of block.matchAll(/<Route path="([^"]+)"/g)) {
    const p = m[1];
    routes.push(prefix + (p === '/' ? '' : p.startsWith('/') ? p : `/${p}`));
  }
  return routes;
}

function extractStaffFromApp() {
  const ownerNest = app.match(/<Route path="\/" nest>[\s\S]*?<AppLayout>[\s\S]*?<Switch>([\s\S]*?)<\/Switch>/);
  if (!ownerNest) return [];
  const block = ownerNest[1];
  const routes = [];
  for (const m of block.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const p = m[1];
    if (p.includes('Redirect') || p.includes('platform-health')) continue;
    routes.push(p.startsWith('/') ? p : `/${p}`);
  }
  // Also catch redirect-only routes
  for (const m of block.matchAll(/path="([^"]+)"[\s\S]*?Redirect to="([^"]+)"/g)) {
    routes.push(m[1].startsWith('/') ? m[1] : `/${m[1]}`);
  }
  return [...new Set(routes)].sort();
}

const matrixStaff = extractStaffFromMatrix();
const jsonStaff = json.routes.map((r) => r.url);
const appStaff = extractStaffFromApp();
const authRoutes = extractAuthRoutes();
const mobileRoutes = extractNestedRoutes('/mobile', '/mobile');
const portalRoutes = [
  ...extractNestedRoutes('/my', '/my'),
  '/my/login',
  '/my/accept-invite',
];

const staffVerdicts = extractVerdicts('## Staff route matrix', '## Mobile routes');
const mobileVerdicts = extractVerdicts('## Mobile routes', '## Customer portal routes');
const portalVerdicts = extractVerdicts('## Customer portal routes', '## Phase');

const allClassified = [...staffVerdicts, ...mobileVerdicts, ...portalVerdicts];
const verdictCounts = { GO: 0, HOLD: 0, 'NO-GO': 0 };
for (const r of allClassified) verdictCounts[r.verdict]++;

const inJsonNotMatrix = jsonStaff.filter((r) => !matrixStaff.includes(r));
const inMatrixNotJson = matrixStaff.filter((r) => !jsonStaff.includes(r));
const inAppNotMatrix = appStaff.filter((r) => !matrixStaff.includes(r) && r !== '/platform-health');
const inAppNotJson = appStaff.filter((r) => !jsonStaff.includes(r) && r !== '/platform-health');

const inventoriedTotal = matrixStaff.length + mobileRoutes.length + portalRoutes.length + authRoutes.length;
const classifiedTotal = verdictCounts.GO + verdictCounts.HOLD + verdictCounts['NO-GO'];

console.log(JSON.stringify({
  matrixStaffCount: matrixStaff.length,
  jsonStaffCount: jsonStaff.length,
  appStaffCount: appStaff.length,
  mobileCount: mobileRoutes.length,
  portalCount: portalRoutes.length,
  authCount: authRoutes.length,
  inventoriedFromSections: inventoriedTotal,
  classifiedTotal,
  verdictCounts,
  executiveSummary: { total: 158, go: 56, hold: 42, nogo: 53, sum: 151, gap: 7 },
  inJsonNotMatrix,
  inMatrixNotJson,
  inAppNotMatrix,
  inAppNotJson,
  authRoutes,
  mobileRoutes,
  portalRoutes,
  portalInMatrix: portalVerdicts.map((r) => r.route),
  portalMissingFromMatrix: portalRoutes.filter((r) => !portalVerdicts.some((v) => v.route === r)),
  staffMissingVerdict: matrixStaff.filter((r) => !staffVerdicts.some((v) => v.route === r)),
}, null, 2));
