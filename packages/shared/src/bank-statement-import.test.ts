import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANK_STATEMENT_REVIEW_STATUS,
  canManageBankStatementImport,
  canViewBankStatementImport,
  isSupportedBankStatementMime,
  sanitizeBankStatementFilename,
} from './bank-statement-import.js';

const OWNER_PERMISSIONS = ['*'] as const;
const TECHNICIAN_PERMISSIONS = ['jobs:read', 'jobs:write'] as const;

test('BANK-IMPORT-001 owner and finance admin can manage import', () => {
  assert.equal(
    canManageBankStatementImport({ roleName: 'Company Owner', permissions: OWNER_PERMISSIONS }),
    true,
  );
  assert.equal(
    canManageBankStatementImport({ roleName: 'Accountant', permissions: ['finance:write'] }),
    true,
  );
});

test('BANK-IMPORT-001 technician and client denied', () => {
  assert.equal(
    canManageBankStatementImport({ roleName: 'Technician', permissions: TECHNICIAN_PERMISSIONS }),
    false,
  );
  assert.equal(canManageBankStatementImport({ roleName: 'Client', permissions: [] }), false);
  assert.equal(
    canViewBankStatementImport({ roleName: 'Technician', permissions: TECHNICIAN_PERMISSIONS }),
    false,
  );
});

test('BANK-IMPORT-001 unauthorised office staff denied write', () => {
  assert.equal(
    canManageBankStatementImport({ roleName: 'Dispatcher', permissions: ['finance:read'] }),
    false,
  );
});

test('BANK-IMPORT-001 sanitises unsafe filenames', () => {
  assert.equal(sanitizeBankStatementFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeBankStatementFilename('my statement (1).csv'), 'my_statement_1_.csv');
});

test('BANK-IMPORT-001 supports CSV mime and extension only', () => {
  assert.equal(isSupportedBankStatementMime('text/csv', 'statement.csv'), true);
  assert.equal(isSupportedBankStatementMime('application/pdf', 'statement.pdf'), false);
});

test('BANK-IMPORT-001 review status is imported awaiting review', () => {
  assert.equal(BANK_STATEMENT_REVIEW_STATUS, 'imported_awaiting_review');
});
