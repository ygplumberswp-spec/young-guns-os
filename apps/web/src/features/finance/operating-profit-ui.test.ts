import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('FIN-003 Operating Profit UI', () => {
  it('FinanceNav links to operating-profit route', () => {
    const navSource = readFileSync(join(here, 'FinanceNav.tsx'), 'utf8');
    assert.match(navSource, /\/finance\/operating-profit/);
    assert.match(navSource, /Operating Profit/);
  });

  it('page gates with canViewOperatingProfit and period tabs', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/OperatingProfitPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /canViewOperatingProfit/);
    assert.match(pageSource, /fetchOperatingProfitDashboard/);
    assert.match(pageSource, /Operating Profit/);
    assert.match(pageSource, /Cash View/);
    assert.match(pageSource, /Overhead Breakdown/);
    assert.match(pageSource, /Needs Attention/);
    assert.match(pageSource, /This Month/);
    assert.match(pageSource, /Known operating cash movement/);
    assert.match(pageSource, /operating-profit__metrics/);
  });

  it('App registers /finance/operating-profit', () => {
    const appSource = readFileSync(join(here, '../../App.tsx'), 'utf8');
    assert.match(appSource, /path="\/finance\/operating-profit"/);
    assert.match(appSource, /OperatingProfitPage/);
  });

  it('FIN-001 includes light link to operating profit without redesign', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/OwnerFinancialCommandPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /\/finance\/operating-profit/);
    assert.match(pageSource, /Known Operating Profit/);
  });

  it('responsive CSS covers desktop tablet and mobile breakpoints', () => {
    const css = readFileSync(join(here, '../../index.css'), 'utf8');
    assert.match(css, /operating-profit__metrics/);
    assert.match(css, /@media \(max-width: 1024px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
  });
});
