import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('FIN-001 Owner Financial Command UI', () => {
  it('FinanceNav links to owner-command route', () => {
    const navSource = readFileSync(join(here, 'FinanceNav.tsx'), 'utf8');
    assert.match(navSource, /\/finance\/owner-command/);
    assert.match(navSource, /Command/);
  });

  it('page gates with canViewOwnerFinancialCommand and period tabs', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/OwnerFinancialCommandPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /canViewOwnerFinancialCommand/);
    assert.match(pageSource, /fetchOwnerFinancialCommandDashboard/);
    assert.match(pageSource, /Financial Heartbeat/);
    assert.match(pageSource, /Cash Movement/);
    assert.match(pageSource, /Known Net Cash Movement/);
    assert.match(pageSource, /Needs Attention/);
    assert.match(pageSource, /Today/);
    assert.match(pageSource, /This Week/);
    assert.match(pageSource, /This Month/);
    assert.match(pageSource, /owner-fin-command__metrics/);
  });

  it('App registers /finance/owner-command', () => {
    const appSource = readFileSync(join(here, '../../App.tsx'), 'utf8');
    assert.match(appSource, /path="\/finance\/owner-command"/);
    assert.match(appSource, /OwnerFinancialCommandPage/);
  });

  it('responsive CSS covers desktop tablet and mobile breakpoints', () => {
    const css = readFileSync(join(here, '../../index.css'), 'utf8');
    assert.match(css, /owner-fin-command__metrics/);
    assert.match(css, /@media \(max-width: 1024px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
  });
});
