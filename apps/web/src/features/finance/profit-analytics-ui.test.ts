import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('FIN-002 Profit Analytics UI', () => {
  it('FinanceNav links to profit-analytics route', () => {
    const navSource = readFileSync(join(here, 'FinanceNav.tsx'), 'utf8');
    assert.match(navSource, /\/finance\/profit-analytics/);
    assert.match(navSource, /Profit Analytics/);
  });

  it('page gates with canViewProfitAnalytics and period tabs', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/ProfitAnalyticsPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /canViewProfitAnalytics/);
    assert.match(pageSource, /fetchProfitAnalyticsDashboard/);
    assert.match(pageSource, /Overview/);
    assert.match(pageSource, /Top gross profit/);
    assert.match(pageSource, /Services/);
    assert.match(pageSource, /Customers/);
    assert.match(pageSource, /Labour/);
    assert.match(pageSource, /Materials \/ Suppliers/);
    assert.match(pageSource, /This Week/);
    assert.match(pageSource, /This Month/);
    assert.match(pageSource, /Last Month/);
    assert.match(pageSource, /profit-analytics__metrics/);
    assert.match(pageSource, /Data Quality/);
  });

  it('App registers /finance/profit-analytics', () => {
    const appSource = readFileSync(join(here, '../../App.tsx'), 'utf8');
    assert.match(appSource, /path="\/finance\/profit-analytics"/);
    assert.match(appSource, /ProfitAnalyticsPage/);
  });

  it('responsive CSS covers desktop tablet and mobile breakpoints', () => {
    const css = readFileSync(join(here, '../../index.css'), 'utf8');
    assert.match(css, /profit-analytics__metrics/);
    assert.match(css, /@media \(max-width: 1024px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
  });
});
