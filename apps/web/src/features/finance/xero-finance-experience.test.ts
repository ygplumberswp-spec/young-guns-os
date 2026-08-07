import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('XERO-003 finance experience', () => {
  it('quote and invoice list pages show freshness line not Sync Now', () => {
    const quoteSource = readFileSync(
      join(here, '../../pages/finance/QuoteListPage.tsx'),
      'utf8',
    );
    const invoiceSource = readFileSync(
      join(here, '../../pages/finance/InvoiceListPage.tsx'),
      'utf8',
    );

    assert.match(quoteSource, /FinanceFreshnessLine/);
    assert.match(invoiceSource, /FinanceFreshnessLine/);
    assert.match(quoteSource, /useXeroFinanceRefresh/);
    assert.doesNotMatch(quoteSource, /Sync Now/i);
    assert.doesNotMatch(invoiceSource, /Sync Now/i);
  });

  it('useXeroFinanceRefresh slows refresh when page hidden', () => {
    const source = readFileSync(join(here, 'useXeroFinanceRefresh.ts'), 'utf8');
    assert.match(source, /visibilitychange/);
    assert.match(source, /HIDDEN_REFRESH_MS/);
    assert.match(source, /VISIBLE_REFRESH_MS/);
  });
});
