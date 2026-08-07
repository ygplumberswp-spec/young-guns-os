/**
 * SYS-001 — Dashboard / route consistency contracts for Owner Command Centre.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = join(here, '../..');

function read(relFromWebSrc: string): string {
  return readFileSync(join(webSrc, relFromWebSrc), 'utf8');
}

describe('SYS-001 Owner dashboard + finance route consistency', () => {
  it('dashboard pulse drill-downs match registered finance routes', () => {
    const pulse = readFileSync(join(here, 'OwnerCommandFinancePulse.tsx'), 'utf8');
    const app = read('App.tsx');
    const links = [
      '/finance/owner-command',
      '/finance/cash-control',
      '/finance/budget-control',
      '/finance/growth-planner',
      '/finance/operating-profit',
      '/finance/invoices?filter=outstanding',
      '/finance/invoices?filter=overdue',
    ];
    for (const href of links) {
      assert.ok(pulse.includes(href), `pulse missing ${href}`);
      const path = href.split('?')[0]!;
      assert.ok(app.includes(`path="${path}"`), `App missing ${path}`);
    }
  });

  it('Financial Truth does not invent zeros; uses displayValue from summary', () => {
    const finance = readFileSync(join(here, 'FinancialTruthPanel.tsx'), 'utf8');
    assert.ok(finance.includes('displayValue'));
    assert.ok(finance.includes('/finance/owner-command'));
    assert.ok(finance.includes('/finance/growth-planner'));
  });

  it('Owner dashboard remains full-bleed OWNER-001 shell', () => {
    const page = read('pages/dashboard/DashboardPage.tsx');
    const dash = readFileSync(join(here, 'ExecutiveDashboard.tsx'), 'utf8');
    assert.ok(page.includes('exec-dashboard-page--owner001'));
    assert.ok(dash.includes('exec-dashboard--owner001'));
    assert.ok(dash.includes('BusinessHeartbeatPanel'));
    assert.ok(dash.includes('LiveOperationsPanel'));
    assert.ok(dash.includes('AuraExecutiveRecommendationsPanel'));
  });

  it('FinanceNav includes closed FIN/GROWTH surfaces', () => {
    const nav = read('features/finance/FinanceNav.tsx');
    for (const label of [
      '/finance/owner-command',
      '/finance/cash-control',
      '/finance/profit-analytics',
      '/finance/operating-profit',
      '/finance/budget-control',
      '/finance/growth-planner',
    ]) {
      assert.ok(nav.includes(label), `FinanceNav missing ${label}`);
    }
  });
});
