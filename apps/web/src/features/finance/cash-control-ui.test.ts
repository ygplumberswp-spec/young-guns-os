import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('CASH-001 finance UI', () => {
  it('FinanceNav links to cash-control route', () => {
    const navSource = readFileSync(join(here, 'FinanceNav.tsx'), 'utf8');
    assert.match(navSource, /\/finance\/cash-control/);
    assert.match(navSource, /Cash Control/);
  });

  it('cash control page uses canViewCashControl and loads summary/ledger/issues', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/CashControlPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /canViewCashControl/);
    assert.match(pageSource, /fetchCashControlSummary/);
    assert.match(pageSource, /fetchCashControlLedger/);
    assert.match(pageSource, /fetchCashControlIssues/);
    assert.match(pageSource, /fetchCashControlJob/);
    assert.match(pageSource, /Known Net Cash Movement/);
    assert.match(pageSource, /Every-Rand Ledger/);
    assert.match(pageSource, /Needs Attention/);
  });

  it('App registers /finance/cash-control route', () => {
    const appSource = readFileSync(join(here, '../../App.tsx'), 'utf8');
    assert.match(appSource, /path="\/finance\/cash-control"/);
    assert.match(appSource, /CashControlPage/);
  });
});
