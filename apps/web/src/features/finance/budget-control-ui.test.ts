import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('FIN-004 Budget Control UI', () => {
  it('FinanceNav links to budget-control route', () => {
    const navSource = readFileSync(join(here, 'FinanceNav.tsx'), 'utf8');
    assert.match(navSource, /\/finance\/budget-control/);
    assert.match(navSource, /Budget Control/);
  });

  it('page gates with canViewBudgetControl and plan sections', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/BudgetControlPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /canViewBudgetControl/);
    assert.match(pageSource, /canWriteBudgetControl/);
    assert.match(pageSource, /fetchBudgetControlDashboard/);
    assert.match(pageSource, /Monthly Plan/);
    assert.match(pageSource, /Actual vs Target/);
    assert.match(pageSource, /Forecast/);
    assert.match(pageSource, /Overhead Budget/);
    assert.match(pageSource, /Needs Attention/);
    assert.match(pageSource, /FORECAST/);
    assert.match(pageSource, /budget-control__metrics/);
  });

  it('App registers /finance/budget-control', () => {
    const appSource = readFileSync(join(here, '../../App.tsx'), 'utf8');
    assert.match(appSource, /path="\/finance\/budget-control"/);
    assert.match(appSource, /BudgetControlPage/);
  });

  it('FIN-001 includes light Budget vs Actual link without redesign', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/OwnerFinancialCommandPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /\/finance\/budget-control/);
    assert.match(pageSource, /Budget vs Actual/);
  });

  it('responsive CSS covers desktop tablet and mobile breakpoints', () => {
    const css = readFileSync(join(here, '../../index.css'), 'utf8');
    assert.match(css, /budget-control__metrics/);
    assert.match(css, /@media \(max-width: 1024px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
  });
});
