import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const dashboardSource = readFileSync(
  fileURLToPath(new URL('./ExecutiveDashboard.tsx', import.meta.url)),
  'utf8',
);
const pulseSource = readFileSync(
  fileURLToPath(new URL('./OwnerCommandFinancePulse.tsx', import.meta.url)),
  'utf8',
);
const financeSource = readFileSync(
  fileURLToPath(new URL('./FinancialTruthPanel.tsx', import.meta.url)),
  'utf8',
);
const activeJobsSource = readFileSync(
  fileURLToPath(new URL('./ActiveJobsPanel.tsx', import.meta.url)),
  'utf8',
);
const completedSource = readFileSync(
  fileURLToPath(new URL('./CompletedTodayPanel.tsx', import.meta.url)),
  'utf8',
);
const pageSource = readFileSync(
  fileURLToPath(new URL('../../pages/dashboard/DashboardPage.tsx', import.meta.url)),
  'utf8',
);
const css = readFileSync(fileURLToPath(new URL('../../index.css', import.meta.url)), 'utf8');
const layoutCss = readFileSync(
  fileURLToPath(new URL('../../styles/layout-grid.css', import.meta.url)),
  'utf8',
);

describe('OWNER-001 Owner Command Centre finalisation', () => {
  it('uses full-bleed owner001 shell without narrow max-width', () => {
    assert.match(pageSource, /exec-dashboard-page--owner001/);
    assert.match(dashboardSource, /exec-dashboard--owner001/);
    assert.match(css, /max-width:\s*none/);
    assert.doesNotMatch(css, /\.exec-dashboard-page\s*\{[^}]*max-width:\s*\d/);
    assert.match(layoutCss, /--titan-content-max-width:\s*none/);
  });

  it('composes FIN-001 and GROWTH-001 via existing APIs only', () => {
    assert.match(dashboardSource, /OwnerCommandFinancePulse/);
    assert.match(pulseSource, /fetchOwnerFinancialCommandDashboard/);
    assert.match(pulseSource, /fetchGrowthPlannerPlan/);
    assert.match(pulseSource, /canViewOwnerFinancialCommand/);
    assert.match(pulseSource, /canViewGrowthPlanner/);
    assert.doesNotMatch(pulseSource, /computeKnownOperatingProfit|revenueTargetCents\s*\+/);
    assert.match(pulseSource, /Growth status/);
    assert.match(pulseSource, /Jobs required/);
  });

  it('financial truth links to finance modules without inventing zeros', () => {
    assert.match(financeSource, /\/finance\/owner-command/);
    assert.match(financeSource, /\/finance\/growth-planner/);
    assert.match(financeSource, /\/finance\/cash-control/);
    assert.match(financeSource, /\/finance\/budget-control/);
    assert.match(financeSource, /displayValue/);
    assert.doesNotMatch(financeSource, /amountCents\s*\?\?\s*0\s*[,}].*formatMoney/);
  });

  it('keeps multi-column desktop packing and only stacks on mobile', () => {
    assert.match(css, /\.exec-dashboard-row--finance/);
    assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
    assert.match(css, /@media \(max-width: 760px\)/);
    assert.match(css, /order:\s*1/);
    // Must not collapse all rows to one column at the old 1280px laptop breakpoint.
    assert.doesNotMatch(
      css,
      /@media \(max-width: 1280px\)\s*\{[^}]*exec-dashboard-row--finance[^}]*minmax\(0, 1fr\);(?!\s*minmax)/,
    );
  });

  it('MOBILE-001: phone hierarchy puts AURA before heartbeat/jobs/finance', () => {
    const mobileBlock = css.match(
      /@media \(max-width: 760px\)\s*\{[\s\S]*?\.exec-dashboard-region--tools[\s\S]*?order:\s*7;/,
    )?.[0];
    assert.ok(mobileBlock, 'expected 760px owner001 order block');
    const aura = mobileBlock.indexOf('.exec-dashboard-region--aura');
    const heartbeat = mobileBlock.indexOf('.exec-dashboard-region--heartbeat');
    const jobs = mobileBlock.indexOf('.exec-dashboard-region--jobs');
    const finance = mobileBlock.indexOf('.exec-dashboard-region--finance');
    assert.ok(aura >= 0 && heartbeat > aura, 'AURA region must precede heartbeat');
    assert.ok(jobs > heartbeat, 'jobs must follow heartbeat/attention block');
    assert.ok(finance > jobs, 'finance must follow jobs on phone');
    assert.match(mobileBlock, /\.exec-dashboard-region--aura\s*\{\s*order:\s*1;/);
  });

  it('YG-CUTOVER-001B: AURA is a primary DOM surface before heartbeat (not after fleet)', () => {
    const auraIdx = dashboardSource.indexOf('exec-dashboard-region--aura');
    const heartbeatIdx = dashboardSource.indexOf('exec-dashboard-region--heartbeat');
    const fleetIdx = dashboardSource.indexOf('sectionName="Live fleet map"');
    assert.ok(auraIdx >= 0, 'AURA region present');
    assert.ok(heartbeatIdx > auraIdx, 'AURA must precede Business Heartbeat in DOM');
    assert.ok(fleetIdx > auraIdx, 'AURA must precede Live Fleet Map in DOM');
    assert.match(dashboardSource, /canAccessDashboardAuraSurface/);
  });

  it('uses compact empty states for jobs panels', () => {
    assert.match(activeJobsSource, /exec-panel-empty--compact/);
    assert.match(activeJobsSource, /No active jobs/);
    assert.match(completedSource, /exec-panel-empty--compact/);
    assert.match(completedSource, /No jobs completed today/);
  });

  it('retains fleet map, AURA, connections, and support rows', () => {
    assert.match(dashboardSource, /LiveOperationsPanel/);
    assert.match(dashboardSource, /AuraExecutiveRecommendationsPanel/);
    assert.match(dashboardSource, /AuraExecutiveChatLauncher/);
    assert.match(dashboardSource, /ConnectionsPanel compact/);
    assert.match(dashboardSource, /OutstandingInvoicesPanel/);
    assert.match(dashboardSource, /TeamPerformancePanel/);
  });

  it('does not introduce a new finance calculation engine in the dashboard', () => {
    assert.doesNotMatch(dashboardSource, /knownGrossProfitCents\s*\+|invoicedRevenueCents\s*-/);
    assert.match(dashboardSource, /fetchExecutiveDashboardSummary/);
  });
});
