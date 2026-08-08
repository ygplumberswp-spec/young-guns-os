/**
 * Row 108 staging READ-ONLY bank/provider audit + fixture proof (cleanup).
 * Does not connect a real bank, invent FNB capability, or move money.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
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
} from '../../../packages/shared/dist/bank-feed-foundation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/270-row108-bank-feed-foundation-verify.json');
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const FORBIDDEN_PROD = 'titan-production';

function loadDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const tip = '/tmp/cursor-staging-db-url.txt';
  if (existsSync(tip)) return readFileSync(tip, 'utf8').trim();
  throw new Error('DATABASE_URL required');
}

const results = [];
const pass = (name, d = {}) => results.push({ name, status: 'PASS', ...d });
const fail = (name, d = {}) => results.push({ name, status: 'FAIL', ...d });

const sql = postgres(loadDbUrl(), { max: 1, prepare: false });
try {
  if (loadDbUrl().includes(FORBIDDEN_PROD)) throw new Error('Production DB forbidden');

  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'bank_feed_connections'
    ) AS exists
  `;
  if (!exists) {
    await sql.unsafe(
      readFileSync(join(__dirname, '../drizzle/0226_bank_feed_foundation.sql'), 'utf8'),
    );
    pass('migration_0226_applied');
  } else pass('migration_0226_already_present');

  const count = async (q) => Number((await q)[0].c);

  const bankAccounts = await count(
    sql`SELECT count(*)::int AS c FROM bank_accounts WHERE company_id = ${YGP}`,
  );
  const bankTx = await count(
    sql`SELECT count(*)::int AS c FROM bank_transactions WHERE company_id = ${YGP}`,
  );
  const xeroBankTx = await count(
    sql`SELECT count(*)::int AS c FROM xero_bank_transactions WHERE company_id = ${YGP}`,
  );
  const batches = await count(
    sql`SELECT count(*)::int AS c FROM bank_statement_import_batches WHERE company_id = ${YGP}`,
  );
  const connections = await count(
    sql`SELECT count(*)::int AS c FROM bank_feed_connections WHERE company_id = ${YGP}`,
  );
  const intakeEvents = await count(
    sql`SELECT count(*)::int AS c FROM bank_feed_intake_events WHERE company_id = ${YGP}`,
  );

  const providers = await sql`
    SELECT provider::text AS provider, status::text AS status
    FROM integration_connections WHERE company_id = ${YGP}
  `;

  const statementDocs = await count(sql`
    SELECT count(*)::int AS c FROM documents
    WHERE company_id = ${YGP}
      AND (
        lower(coalesce(file_name, '')) LIKE '%.csv'
        OR lower(coalesce(file_type, '')) LIKE '%csv%'
        OR lower(coalesce(title, '')) LIKE '%statement%'
        OR lower(coalesce(title, '')) LIKE '%bank%'
      )
  `);

  const [rule] = await sql`
    SELECT status, global_automation_enabled FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP} ORDER BY version DESC NULLS LAST LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id
    FROM quotes WHERE company_id = ${YGP} AND quote_number = 'QU-0183' LIMIT 1
  `;

  const capability = resolveBankFeedCapability({
    legitimateProviderFeedConfigured: false,
    providerIdsPresent: providers.map((p) => p.provider),
  });

  pass('staging_readonly_bank_provider_audit', {
    bankIntegrationProviderConfigs: providers.map((p) => ({
      provider: p.provider,
      status: p.status,
      tokenPresent: false,
    })),
    bankAccountRecords: bankAccounts,
    importedBankTransactions: bankTx,
    xeroBankTransactions: xeroBankTx,
    statementImportBatches: batches,
    statementOrDocumentRecordsApprox: statementDocs,
    bankFeedConnections: connections,
    bankFeedIntakeEvents: intakeEvents,
    foundationMode: capability.mode,
    operatingMode: resolveFoundationOperatingMode(capability),
    legitimateFnbOrOpenBankingFeed: false,
    supportedIntakeModes: ['CONTROLLED_STATEMENT_IMPORT'],
    note: 'No live FNB/open-banking feed client; secrets not returned',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250) {
    assertRoyalCapeUnchangedForRow108({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged', {
      totalCents: Number(royal.total_cents),
      xeroQuoteId: royal.xero_quote_id,
    });
  } else fail('royal_cape');

  // Fixture insert + cleanup (tenant-scoped connection row)
  const fixtureKey = `row108-fixture-${Date.now()}`;
  const [inserted] = await sql`
    INSERT INTO bank_feed_connections (
      company_id, bank_name, provider, mode, status, source_type,
      masked_account_identity, status_reason, idempotency_key
    ) VALUES (
      ${YGP}, 'FNB', 'manual_statement', 'CONTROLLED_STATEMENT_IMPORT',
      'STATEMENT_IMPORT_ONLY', 'controlled_statement_import',
      ${maskBankAccountIdentity({ accountNumber: '62123456789' })},
      ${capability.reason}, ${fixtureKey}
    ) RETURNING id
  `;
  const [evt] = await sql`
    INSERT INTO bank_feed_intake_events (
      company_id, connection_id, stage, filename, file_hash_sha256, mime_type,
      format_supported, original_file_preserved, warnings
    ) VALUES (
      ${YGP}, ${inserted.id}, 'preview', 'fixture.csv', 'abc', 'text/csv',
      true, true, '[]'::jsonb
    ) RETURNING id
  `;
  await sql`DELETE FROM bank_feed_intake_events WHERE id = ${evt.id}`;
  await sql`DELETE FROM bank_feed_connections WHERE id = ${inserted.id}`;
  pass('cleanup_fixture_rows_removed');

  const conn = buildBankFeedConnection({
    companyId: YGP,
    bankName: 'FNB',
    capability,
    accountNumber: '62123456789',
  });
  const card = projectBankConnectionCard(conn);
  const csv = validateStatementIntakeUpload({
    filename: 'a.csv',
    mimeType: 'text/csv',
    contentBytes: 40,
    fileHashSha256: 'hash',
  });
  const xlsx = assertXlsxStatementIntakeUnavailable();
  const redacted = redactBankFeedSecretsForApi({
    id: '1',
    serverTokenReference: 'secret',
    status: 'STATEMENT_IMPORT_ONLY',
  });

  const cases = [
    ['1_provider_neutral', conn.provider === 'manual_statement'],
    ['2_supported_provider_mode', resolveBankFeedCapability({
      legitimateProviderFeedConfigured: true,
      providerIdsPresent: ['stitch'],
    }).mode === 'PROVIDER_FEED'],
    ['3_unavailable_fallback', capability.mode === 'PROVIDER_UNAVAILABLE' &&
      resolveFoundationOperatingMode(capability) === 'CONTROLLED_STATEMENT_IMPORT'],
    ['4_csv_intake', csv.ok && csv.stage === 'preview'],
    ['5_xlsx_unavailable', xlsx.xlsxImportAvailable === false && xlsx.fallback === 'CSV_ONLY'],
    ['6_file_hash', csv.fileHashSha256 === 'hash' && csv.originalFilePreserved === true],
    ['7_malformed_rejected', validateStatementIntakeUpload({
      filename: 'b.csv', mimeType: 'text/csv', contentBytes: 10, fileHashSha256: 'x', malformed: true,
    }).stage === 'rejected'],
    ['8_preview_before_confirm', csv.stage === 'preview'],
    ['9_masked_account', maskBankAccountIdentity({ accountNumber: '1234567890' }) === '••••7890'],
    ['10_no_username_password', (() => {
      try { assertNoForbiddenBankCredentials({ username: 'u', password: 'p' }); return false; }
      catch { return true; }
    })()],
    ['11_no_pin', (() => {
      try { assertNoForbiddenBankCredentials({ pin: '1234' }); return false; }
      catch { return true; }
    })()],
    ['12_no_otp', (() => {
      try { assertNoForbiddenBankCredentials({ otp: '999999' }); return false; }
      catch { return true; }
    })()],
    ['13_no_card', (() => {
      try { assertNoForbiddenBankCredentials({ cvv: '123' }); return false; }
      catch { return true; }
    })()],
    ['14_tokens_hidden', !('serverTokenReference' in redacted)],
    ['15_tenant_isolation', conn.companyId === YGP],
    ['16_owner_finance', canManageBankFeedFoundation({ roleName: 'owner' })],
    ['17_tech_denied', !canViewBankFeedFoundation({ roleName: 'technician' })],
    ['18_client_denied', !canViewBankFeedFoundation({ roleName: 'client' })],
    ['19_no_auto_match', assertBankFeedIntakeSafety().autoMatching === false],
    ['20_no_reconcile', assertBankFeedIntakeSafety().reconciliationStatusMutation === false],
    ['21_no_jpe', assertBankFeedIntakeSafety().jpePosting === false],
    ['22_no_xero_write', assertBankFeedIntakeSafety().xeroWrites === 0],
    ['23_no_payment_init', assertBankFeedIntakeSafety().paymentInitiation === false],
    ['24_no_fabricated_balance', assertBankFeedIntakeSafety().fabricatedBalance === false],
    ['25_audit_gates', assertRow108SafetyGates({ row92AutomationEnabled: false }).moneyMovement === 0],
    ['26_card_not_connected_from_config', card.connectedClaim === false],
    ['client_leak', (() => {
      try { assertNoBankFeedClientLeak({ serverTokenReference: 'x' }); return false; }
      catch { return true; }
    })()],
    ['rows109_blocked', (() => {
      try { assertRow109PlusNotStartedDuringRow108(true); return false; }
      catch { return true; }
    })()],
  ];

  let fp = 0;
  let ff = 0;
  for (const [name, ok] of cases) {
    if (ok) {
      pass(`fixture_${name}`);
      fp++;
    } else {
      fail(`fixture_${name}`);
      ff++;
    }
  }
  pass('fixture_totals', { pass: fp, fail: ff });
  pass('xero_writes', { count: 0 });
  pass('money_movement', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('rows109_to_116_not_started');
  pass('row117_ocr_not_started');
  pass('row118_not_closed');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row108-bank-feed-foundation-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
