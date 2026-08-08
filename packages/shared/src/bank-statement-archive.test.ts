import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertBankArchiveVisibilityDenied,
  assertNoBankArchiveClientLeak,
  assertRow114SafetyGates,
  buildBankStatementArchiveEvidence,
  canViewBankStatementArchive,
  projectBankStatementArchiveForClient,
} from './bank-statement-archive.js';

describe('Row 114 statement archive + visibility', () => {
  it('preserves source evidence; never invents period', () => {
    const ev = buildBankStatementArchiveEvidence({
      companyId: 'co',
      importBatchId: 'b1',
      originalFilename: 'fnb-aug.csv',
      fileChecksumSha256: 'abc123',
      sourceProvider: 'manual_statement',
      bankAccountCode: '099',
      accountNumber: '62123456789',
      importedAt: '2026-08-08T10:00:00Z',
      actorUserId: 'u1',
      storageKey: 'bank-statements/co/b1/file.csv',
      mimeType: 'text/csv',
    });
    assert.equal(ev.originalFilename, 'fnb-aug.csv');
    assert.equal(ev.fileSourceHash, 'abc123');
    assert.equal(ev.maskedAccountIdentity, '••••6789');
    assert.equal(ev.statementPeriodFrom, null);
    assert.equal(ev.inventedMetadata, false);
    assert.throws(() =>
      buildBankStatementArchiveEvidence({
        companyId: 'co',
        importBatchId: 'b1',
        originalFilename: 'x.csv',
        fileChecksumSha256: 'h',
        importedAt: '2026-08-08T10:00:00Z',
        inventStatementPeriod: true,
      }),
    );
    // Partial period → both null (not invented)
    const partial = buildBankStatementArchiveEvidence({
      companyId: 'co',
      importBatchId: 'b1',
      originalFilename: 'x.csv',
      fileChecksumSha256: 'h',
      importedAt: '2026-08-08T10:00:00Z',
      statementPeriodFrom: '2026-08-01',
    });
    assert.equal(partial.statementPeriodFrom, null);
    assert.equal(partial.statementPeriodTo, null);
  });

  it('Owner/Finance allowed; Tech/Sub Tech/Client denied surfaces', () => {
    assert.equal(canViewBankStatementArchive({ roleName: 'owner' }), true);
    assert.equal(canViewBankStatementArchive({ roleName: 'office', permissions: ['finance:read'] }), true);
    assert.equal(canViewBankStatementArchive({ roleName: 'technician' }), false);
    assert.equal(canViewBankStatementArchive({ roleName: 'Sub Tech' }), false);
    assert.equal(canViewBankStatementArchive({ roleName: 'client' }), false);
    assert.throws(() =>
      assertBankArchiveVisibilityDenied({ roleName: 'technician', surface: 'bank_statements' }),
    );
    assert.throws(() =>
      assertBankArchiveVisibilityDenied({ roleName: 'client', surface: 'balances' }),
    );
    assert.throws(() =>
      assertBankArchiveVisibilityDenied({
        roleName: 'sub_tech',
        surface: 'reconciliation_internals',
      }),
    );
  });

  it('client leak + safety; storage key redacted for client projection', () => {
    const ev = buildBankStatementArchiveEvidence({
      companyId: 'co',
      importBatchId: 'b1',
      originalFilename: 'x.csv',
      fileChecksumSha256: 'h',
      importedAt: '2026-08-08T10:00:00Z',
      storageKey: 'secret/path',
    });
    const projected = projectBankStatementArchiveForClient(ev);
    assert.equal(projected.storageKey, null);
    assert.throws(() => assertNoBankArchiveClientLeak({ storageKey: 'x' }));
    assert.throws(() => assertNoBankArchiveClientLeak({ bankBalance: 1 }));
    assert.equal(assertRow114SafetyGates({ row92AutomationEnabled: false }).row117NotStarted, true);
  });
});
