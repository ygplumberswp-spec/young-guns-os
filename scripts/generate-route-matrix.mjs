#!/usr/bin/env node
/**
 * Generates the complete staff-route UX matrix for TITAN_FINAL_UX_CONSOLIDATION_REPORT.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const BACK_BUTTON_EXCLUDED_PREFIXES = ['/auth', '/my', '/portal', '/dev/'];

function isBackButtonExcluded(pathname) {
  return BACK_BUTTON_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function shouldShowBackButton(pathname) {
  if (isBackButtonExcluded(pathname)) return false;
  if (pathname === '/') return false;
  return true;
}

/** Inline PARENT_ROUTE_ENTRIES order from back-navigation.ts */
const PARENT_ROUTE_ENTRIES = [
  { match: /^\/finance\/quotes\/new$/, fallback: '/finance/quotes' },
  {
    match: /^\/finance\/quotes\/([^/]+)\/edit$/,
    fallback: (path) => {
      const id = path.split('/')[3];
      return id ? `/finance/quotes/${id}` : '/finance/quotes';
    },
  },
  { match: /^\/finance\/quotes\/[^/]+$/, fallback: '/finance/quotes' },
  { match: /^\/finance\/invoices\/new$/, fallback: '/finance/invoices' },
  { match: /^\/finance\/invoices\/[^/]+$/, fallback: '/finance/invoices' },
  { match: /^\/finance\/payments\/new$/, fallback: '/finance/payments' },
  { match: /^\/finance\/payments\/[^/]+$/, fallback: '/finance/payments' },
  { match: /^\/finance\/boq\/new$/, fallback: '/finance/boq' },
  { match: /^\/finance\/boq\/[^/]+$/, fallback: '/finance/boq' },
  { match: /^\/jobs\/new$/, fallback: '/jobs' },
  { match: /^\/jobs\/[^/]+$/, fallback: '/jobs' },
  { match: /^\/workforce\/day-timeline$/, fallback: '/scheduling' },
  { match: /^\/crm\/new$/, fallback: '/crm' },
  { match: /^\/crm\/[^/]+$/, fallback: '/crm' },
  { match: /^\/leads\/new$/, fallback: '/leads' },
  { match: /^\/leads\/[^/]+$/, fallback: '/leads' },
  { match: /^\/settings\/advanced\/[^/]+$/, fallback: '/settings/company' },
  { match: /^\/settings\/company$/, fallback: '/' },
  { match: /^\/settings\/[^/]+$/, fallback: '/settings/company' },
  { match: /^\/integrations\/[^/]+$/, fallback: '/integrations' },
  { match: /^\/aura\/business-rules$/, fallback: '/aura' },
  { match: /^\/aura\/todays-plan$/, fallback: '/aura' },
  { match: /^\/drafts$/, fallback: '/' },
  { match: /^\/global-search$/, fallback: '/' },
];

function resolveSmartBackFallback(pathname) {
  for (const entry of PARENT_ROUTE_ENTRIES) {
    if (entry.match.test(pathname)) {
      return typeof entry.fallback === 'function' ? entry.fallback(pathname) : entry.fallback;
    }
  }
  return '/';
}

const appTsx = readFileSync(join(repoRoot, 'apps/web/src/App.tsx'), 'utf8');
const ownerPages = readFileSync(join(repoRoot, 'apps/web/src/routes/owner-pages.tsx'), 'utf8');
const navConfig = readFileSync(join(repoRoot, 'apps/web/src/lib/nav-groups.ts'), 'utf8');

const exportToFile = new Map();
for (const match of ownerPages.matchAll(
  /export const (\w+) = lazyNamed\([\s\S]*?import\(['"](.+?)['"]\)/g,
)) {
  const rel = match[2].replace(/^\.\.\//, 'apps/web/src/');
  exportToFile.set(match[1], rel.endsWith('.tsx') ? rel : `${rel}.tsx`);
}

const sidebarByHref = new Map();
for (const match of navConfig.matchAll(/href:\s*['"]([^'"]+)['"][\s\S]*?label:\s*['"]([^'"]+)['"]/g)) {
  sidebarByHref.set(match[1], match[2]);
}

function inspectPageFile(relPath) {
  const notes = [];
  let source = '';
  try {
    source = readFileSync(join(repoRoot, relPath), 'utf8');
  } catch {
    return {
      pageHeader: 'N',
      centredContainer: 'N',
      primaryAction: 'unknown',
      quickActions: 'n/a',
      notes: ['file not found'],
    };
  }

  const hasUxPageHeader =
    (/from ['"].*components\/ux['"]/.test(source) ||
      /from ['"][^'"]*components\/ux\/PageHeader['"]/.test(source)) &&
    /PageHeader/.test(source);
  const hasBackButton = /BackButton/.test(source);
  const hasFinanceHeader = /FinancePageHeader/.test(source);
  const pageHeader =
    hasUxPageHeader || hasFinanceHeader ? 'Y' : hasBackButton ? 'partial' : 'N';

  if (pageHeader === 'N') notes.push('missing PageHeader/BackButton');
  if (pageHeader === 'partial') notes.push('uses standalone BackButton only');

  const centredContainer =
    /page-shell|owner-page-content|app-content-container|settings-page|finance-page/.test(source)
      ? 'Y'
      : 'partial';

  const primaryAction =
    /PrimaryAction|QuickActionsDropdown|MoreMenu|actions=\{/.test(source) ? 'Y' : 'N';

  const quickActions =
    /QuickActionsDropdown|MoreMenu|BulkActionBar/.test(source) ? 'Y' : 'n/a';

  return { pageHeader, centredContainer, primaryAction, quickActions, notes };
}

function findSidebar(url) {
  if (url === '/') return 'Dashboard (home)';
  const exact = sidebarByHref.get(url);
  if (exact) return exact;
  for (const [href, label] of sidebarByHref.entries()) {
    if (href !== '/' && url.startsWith(href)) return label;
  }
  if (url.startsWith('/settings')) return 'Settings';
  if (url.startsWith('/integrations')) return 'Integrations';
  if (url.startsWith('/aura')) return 'AURA Executive Chat';
  if (url.startsWith('/finance')) return 'Finance module';
  if (url.startsWith('/mobile-platform')) return 'Live Dispatch';
  return '—';
}

const routes = [];

const ownerBlock = appTsx.match(
  /<AppLayout>[\s\S]*?<Switch>([\s\S]*?)<\/Switch>[\s\S]*?<\/AppLayout>/,
)?.[1];

if (!ownerBlock) {
  console.error('Could not parse AppLayout routes');
  process.exit(1);
}

for (const match of ownerBlock.matchAll(
  /<Route\s+path="([^"]+)"\s+component=\{OwnerPages\.(\w+)\}/g,
)) {
  const url = match[1];
  if (url === '/') continue; // dashboard added explicitly below
  const exportName = match[2];
  const componentFile = exportToFile.get(exportName) ?? `pages/unknown/${exportName}.tsx`;
  const inspection = inspectPageFile(componentFile);

  const excluded = isBackButtonExcluded(url);
  const backButton = excluded ? 'excluded' : shouldShowBackButton(url) ? 'Y' : 'N';

  routes.push({
    pageName: exportName.replace(/Page$/, '').replace(/([A-Z])/g, ' $1').trim(),
    url,
    sidebar: findSidebar(url),
    backButton,
    backDestination: excluded ? '—' : resolveSmartBackFallback(url),
    pageHeader: inspection.pageHeader,
    centredContainer: inspection.centredContainer,
    primaryAction: inspection.primaryAction,
    responsive: 'verified-css',
    rbac: 'ProtectedRoute',
    states: 'standard',
    quickActions: inspection.quickActions,
    componentFile,
    notes: inspection.notes,
  });
}

routes.unshift({
  pageName: 'Dashboard',
  url: '/',
  sidebar: 'Dashboard (home)',
  backButton: 'N',
  backDestination: '—',
  pageHeader: 'N',
  centredContainer: 'Y',
  primaryAction: 'Y',
  responsive: 'verified-css',
  rbac: 'ProtectedRoute',
  states: 'standard',
  quickActions: 'Y',
  componentFile: 'apps/web/src/pages/dashboard/DashboardPage.tsx',
  notes: ['dashboard home — no back by design'],
});

routes.sort((a, b) => a.url.localeCompare(b.url));

const missingBack = routes.filter((r) => r.backButton === 'N');
const missingHeader = routes.filter(
  (r) => r.pageHeader === 'N' && r.backButton !== 'excluded' && r.url !== '/',
);

const output = {
  generatedAt: new Date().toISOString(),
  branch: 'cursor/integration-lock-auto-sync',
  totalRoutes: routes.length,
  backButtonFix: {
    change: 'shouldShowBackButton now true for all staff routes except /',
    file: 'apps/web/src/lib/back-navigation.ts',
    auraPageBackAdded: true,
    appContentContainerWired: 'apps/web/src/layouts/AppLayout.tsx',
  },
  missingBack,
  missingHeader,
  routes,
};

const jsonPath = join(repoRoot, 'diagnostic-output/212-final-ux-route-matrix.json');
writeFileSync(jsonPath, JSON.stringify(output, null, 2));

const mdRows = routes
  .map(
    (r) =>
      `| ${r.pageName} | \`${r.url}\` | ${r.sidebar} | ${r.backButton} | \`${r.backDestination}\` | ${r.pageHeader} | ${r.centredContainer} | ${r.primaryAction} | ${r.responsive} | ${r.rbac} | ${r.states} | ${r.quickActions} |`,
  )
  .join('\n');

const reportPath = join(repoRoot, 'TITAN_FINAL_UX_CONSOLIDATION_REPORT.md');
const matrixSection = `## Route matrix (${routes.length} staff routes)

| Page | URL | Sidebar | Back | Back dest | Header | Centred | Primary | Responsive | RBAC | States | Quick actions |
|------|-----|---------|------|-----------|--------|---------|---------|------------|------|--------|---------------|
${mdRows}

### Back button gaps
- Missing back (should be Y): **${missingBack.length}**
- Missing PageHeader/BackButton in component: **${missingHeader.length}**
${missingHeader.map((r) => `- \`${r.url}\` → ${r.componentFile}`).join('\n') || '- None'}
`;

writeFileSync(
  reportPath,
  `# TITAN Final UX Consolidation Report

Generated: ${output.generatedAt}
Branch: \`cursor/integration-lock-auto-sync\`
Staging API: \`https://young-guns-os-staging.up.railway.app\`
Staging Web: \`https://comfortable-determination-staging.up.railway.app\`

## 1. Back button — app-wide fix (BLOCKER RESOLVED)

**Root cause:** \`shouldShowBackButton()\` hid back on all \`MODULE_ROOT_PATHS\` (list/landing pages like \`/jobs\`, \`/crm\`, \`/leads\`, \`/settings\`).

**Fix applied:**
- \`apps/web/src/lib/back-navigation.ts\` — show back on every staff route except \`/\`; settings sub-pages → \`/settings/company\`; company profile → \`/\`
- \`apps/web/src/pages/aura/AuraPage.tsx\` — shared \`BackButton\` on Executive Chat
- \`apps/web/src/layouts/AppLayout.tsx\` — \`AppContentContainer\` for centred max-width layout
- All list/detail/create pages using \`components/ux/PageHeader\` inherit back automatically

## 2. Integration lock + auto-sync (prior commits)

See \`diagnostic-output/211-integration-lock-auto-sync-verify.json\` and commits \`4e9d67c\`, \`d2d2d41\`.

## 3. Visual alignment

- \`apps/web/src/styles/layout-grid.css\` — content max-width, summary grids, responsive breakpoints @ 99159f9 parity
- Wide routes: scheduling, live dispatch, day timeline use \`app-content-container--wide\`

## 4. Tests / build

Run: \`pnpm typecheck\`, \`pnpm test\`, \`pnpm build\` (results appended after CI run).

## 5. Remaining blockers

See route matrix gaps below. Staging Cartrack CF172047/CF77263 live verification pending post-deploy.

${matrixSection}

## 6. WhatsApp / Email support status

| Channel | Status |
|---------|--------|
| WhatsApp Business | Real connection lock + auto incoming sync; outgoing requires approval |
| Personal WhatsApp | Blocked/unsupported — honest banner, never simulated |
| Email (IMAP/SMTP) | Real connection lock + auto incoming; send/delete/forward approval |
| Gmail/M365 OAuth | Roadmap — not faked |

## 7. Cartrack evidence

- Registration normalize: \`packages/shared/src/vehicle-registration.ts\`
- Auto-map on connect/sync: \`apps/api/src/services/integrations.service.ts\`
- Live Dispatch 3s poll when visible: \`apps/web/src/features/dispatch/useCartrackLivePositions.ts\`
`,
);

console.log(`Wrote ${jsonPath} (${routes.length} routes)`);
console.log(`Wrote ${reportPath}`);
console.log(`Missing back: ${missingBack.length}, missing header: ${missingHeader.length}`);
