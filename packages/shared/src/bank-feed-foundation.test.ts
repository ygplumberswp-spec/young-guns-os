import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertBankFeedIntakeSafety,
  assertNoBankFeedClientLeak,
  assertNoForbiddenBankCredentials,
  assertRow108SafetyGates,
  assertRow109PlusNotStartedDuringRow108,
  assertRoyalCapeUnchangedForRow108,
  assertXlsxStatementIntakeUnavailable,
  buildBankFeedConnection,
  canManageBankFeedFoundation,
  canViewBankFeedFoundation,
  maskBankAccountIdentity,
  projectBankConnectionCard,
  redactBankFeedSecretsForApi,
  resolveBankFeedCapability,
  resolveFoundationOperatingMode,
  validateStatementIntakeUpload,
} from './bank-feed-foundation.js';

describe('Row 108 bank feed foundation', () => {
  it('1-3 provider-neutral model; unavailable falls back safely', () => {
    const cap = resolveBankFeedCapability({ providerIdsPresent: ['xero', 'yoco'] });
    assert.equal(cap.liveProviderFeedAvailable, false);
    assert.equal(cap.mode, 'PROVIDER_UNAVAILABLE');
    assert.equal(resolveFoundationOperatingMode(cap), 'CONTROLLED_STATEMENT_IMPORT');

    const live = resolveBankFeedCapability({
      legitimateProviderFeedConfigured: true,
      providerIdsPresent: ['stitch'],
    });
    assert.equal(live.mode, 'PROVIDER_FEED');
  });

  it('4-8 controlled CSV intake; XLSX unavailable; hash; malformed rejected; preview', () => {
    const csv = validateStatementIntakeUpload({
      filename: 'fnb.csv',
      mimeType: 'text/csv',
      contentBytes: 120,
      fileHashSha256: 'abc123',
    });
    assert.equal(csv.ok, true);
    assert.equal(csv.stage, 'preview');
    assert.equal(csv.originalFilePreserved, true);
    assert.equal(csv.fileHashSha256, 'abc123');

    const xlsx = assertXlsxStatementIntakeUnavailable();
    assert.equal(xlsx.xlsxImportAvailable, false);
    assert.equal(xlsx.fallback, 'CSV_ONLY');

    const bad = validateStatementIntakeUpload({
      filename: 'bad.pdf',
      mimeType: 'application/pdf',
      contentBytes: 10,
      fileHashSha256: 'x',
    });
    assert.equal(bad.ok, false);

    const malformed = validateStatementIntakeUpload({
      filename: 'bad.csv',
      mimeType: 'text/csv',
      contentBytes: 10,
      fileHashSha256: 'x',
      malformed: true,
    });
    assert.equal(malformed.stage, 'rejected');
    assert.ok(malformed.warnings.includes('MALFORMED_FILE'));
  });

  it('9 masked account identity', () => {
    assert.equal(maskBankAccountIdentity({ accountNumber: '1234567890' }), '••••7890');
  });

  it('10-14 no username/password/PIN/OTP/card; tokens hidden', () => {
    assert.throws(() => assertNoForbiddenBankCredentials({ username: 'u', password: 'p' }));
    assert.throws(() => assertNoForbiddenBankCredentials({ pin: '1234' }));
    assert.throws(() => assertNoForbiddenBankCredentials({ otp: '999999' }));
    assert.throws(() => assertNoForbiddenBankCredentials({ cvv: '123' }));
    const redacted = redactBankFeedSecretsForApi({
      id: '1',
      serverTokenReference: 'secret',
      accessToken: 'tok',
      status: 'STATEMENT_IMPORT_ONLY',
    });
    assert.equal('serverTokenReference' in redacted, false);
    assert.equal('accessToken' in redacted, false);
  });

  it('15-18 tenant + RBAC', () => {
    const cap = resolveBankFeedCapability();
    const a = buildBankFeedConnection({
      companyId: 'co-a',
      bankName: 'FNB',
      capability: cap,
      accountCode: '099',
    });
    const b = buildBankFeedConnection({
      companyId: 'co-b',
      bankName: 'FNB',
      capability: cap,
      accountCode: '099',
    });
    assert.notEqual(a.companyId, b.companyId);
    assert.equal(canManageBankFeedFoundation({ roleName: 'owner' }), true);
    assert.equal(canManageBankFeedFoundation({ roleName: 'technician' }), false);
    assert.equal(canViewBankFeedFoundation({ roleName: 'client' }), false);
    assert.throws(() => assertNoBankFeedClientLeak({ serverTokenReference: 'x' }));
  });

  it('19-24 no match/reconcile/JPE/Xero/payment/balance', () => {
    const gates = assertBankFeedIntakeSafety();
    assert.equal(gates.autoMatching, false);
    assert.equal(gates.jpePosting, false);
    assert.equal(gates.xeroWrites, 0);
    assert.equal(gates.paymentInitiation, false);
    assert.equal(gates.fabricatedBalance, false);
    assert.throws(() => assertBankFeedIntakeSafety({ autoMatching: true }));
    assert.throws(() => assertBankFeedIntakeSafety({ jpePosted: true }));
    assert.throws(() => assertBankFeedIntakeSafety({ xeroWrites: 1 }));
    assert.throws(() => assertBankFeedIntakeSafety({ paymentInitiated: true }));
    assert.throws(() => assertBankFeedIntakeSafety({ balanceFabricated: true }));

    const preview = validateStatementIntakeUpload({
      filename: 'a.csv',
      mimeType: 'text/csv',
      contentBytes: 20,
      fileHashSha256: 'h',
    });
    assert.equal(preview.autoMatchingPerformed, false);
    assert.equal(preview.reconciliationMutated, false);
    assert.equal(preview.jpePosted, false);
    assert.equal(preview.xeroWrites, 0);
  });

  it('25-26 audit/safety + connection card truth + Royal Cape + cleanup', () => {
    const cap = resolveBankFeedCapability();
    const conn = buildBankFeedConnection({
      companyId: 'co',
      bankName: 'FNB',
      capability: cap,
      accountNumber: '62123456789',
    });
    assert.equal(conn.status, 'STATEMENT_IMPORT_ONLY');
    const card = projectBankConnectionCard(conn);
    assert.equal(card.connectedClaim, false);
    assert.equal(card.primaryAction, 'IMPORT_STATEMENT');

    const fake = buildBankFeedConnection({
      companyId: 'co',
      bankName: 'FNB',
      capability: resolveBankFeedCapability({
        legitimateProviderFeedConfigured: true,
        providerIdsPresent: ['stitch'],
      }),
    });
    assert.equal(fake.status, 'AWAITING_CONSENT');
    assert.equal(projectBankConnectionCard(fake).connectedClaim, false);

    const gates = assertRow108SafetyGates({ row92AutomationEnabled: false });
    assert.equal(gates.rows109to116NotStarted, true);
    assert.equal(gates.moneyMovement, 0);
    assert.throws(() => assertRow109PlusNotStartedDuringRow108(true));
    assertRoyalCapeUnchangedForRow108({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
  });
});
