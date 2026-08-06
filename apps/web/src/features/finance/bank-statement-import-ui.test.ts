import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('BANK-IMPORT-001 finance UI', () => {
  it('FinanceNav links to bank statement import route', () => {
    const navSource = readFileSync(join(here, 'FinanceNav.tsx'), 'utf8');
    assert.match(navSource, /\/finance\/bank-transactions\/import/);
    assert.match(navSource, /Bank Transactions/);
  });

  it('import page requires preview before approval', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/BankStatementImportPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /createBankStatementPreview/);
    assert.match(pageSource, /approveBankStatementBatch/);
    assert.match(pageSource, /Run dry-run preview/);
    assert.match(pageSource, /imported_awaiting_review|Imported — awaiting review/);
    assert.doesNotMatch(pageSource, /onChange=\{.*createBankStatementPreview/s);
  });

  it('import page denies technician via shared RBAC helpers', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/BankStatementImportPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /canManageBankStatementImport/);
    assert.match(pageSource, /canViewBankStatementImport/);
  });
});
