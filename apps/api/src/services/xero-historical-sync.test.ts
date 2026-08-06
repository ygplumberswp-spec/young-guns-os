import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildAuraEvidenceGuidance,
  buildUnavailableAttribution,
  resolveEvidenceCoverage,
  type XeroHistoryCoverage,
} from '@titan/shared';
import {
  XERO_PAGE_RUNAWAY_LIMIT,
  XERO_PAGE_SIZE,
  hasMoreXeroPages,
  normalizeXeroDate,
  resolveRateLimitDelayMs,
} from '../lib/xero.client.js';
import {
  XERO_IMPORT_STAGES,
  advanceToNextStage,
  createInitialImportJobState,
  hasRecoverableImportCheckpoint,
  importJobStateToSummary,
  isStageComplete,
  parseImportJobState,
} from './xero-import-job.processor.js';
import { OAUTH_SCOPES } from './xero-oauth.service.js';

const SYNC_SERVICE_SOURCE = readFileSync(
  new URL('./xero-sync.service.ts', import.meta.url),
  'utf8',
);
const CLIENT_SOURCE = readFileSync(new URL('../lib/xero.client.ts', import.meta.url), 'utf8');

// --- Historical sync rule 1 & 2: no arbitrary date limit, no record cap ---

test('a new import applies no date floor by default', () => {
  const state = createInitialImportJobState();
  assert.equal(
    state.checkpoint.modifiedSince,
    null,
    'default import must pull complete history, not a recent slice',
  );
});

test('client list helpers carry no fixed page ceiling', () => {
  // The previous implementation capped every list at 50 pages (5,000 records) and returned the
  // truncated result silently.
  assert.equal(
    /while \(page <= 50\)/.test(CLIENT_SOURCE),
    false,
    'a hardcoded 50-page cap would truncate history',
  );
  assert.ok(
    XERO_PAGE_RUNAWAY_LIMIT > 1000,
    'runaway guard must be far above any real tenant size',
  );
  assert.ok(
    /PAGINATION_RUNAWAY/.test(CLIENT_SOURCE),
    'hitting the guard must raise rather than return a truncated list',
  );
});

// --- Historical sync rule 3: pagination terminates only on a short page ---

test('pagination continues while Xero returns full pages', () => {
  assert.equal(hasMoreXeroPages(XERO_PAGE_SIZE), true);
  assert.equal(hasMoreXeroPages(XERO_PAGE_SIZE - 1), false);
  assert.equal(hasMoreXeroPages(0), false);
});

test('a paged stage is only complete on a short or empty page', () => {
  const checkpoint = createInitialImportJobState().checkpoint;
  assert.equal(isStageComplete('invoices', checkpoint, XERO_PAGE_SIZE), false);
  assert.equal(isStageComplete('invoices', checkpoint, XERO_PAGE_SIZE - 1), true);
  assert.equal(isStageComplete('invoices', checkpoint, 0), true);
});

test('unpaged stages complete after their single response', () => {
  const checkpoint = createInitialImportJobState().checkpoint;
  assert.equal(isStageComplete('accounts', checkpoint, XERO_PAGE_SIZE), true);
  assert.equal(isStageComplete('tracking_categories', checkpoint, XERO_PAGE_SIZE), true);
});

// --- Historical sync rule 4: rate-limit compliance ---

test('rate limit backoff honours the Retry-After Xero sends', () => {
  assert.equal(resolveRateLimitDelayMs('45', 1), 45_000);
  assert.equal(resolveRateLimitDelayMs('60', 3), 60_000, 'header wins over attempt backoff');
});

test('rate limit backoff falls back to exponential growth without a header', () => {
  assert.equal(resolveRateLimitDelayMs(null, 1), 2_000);
  assert.equal(resolveRateLimitDelayMs('', 3), 8_000);
  assert.equal(resolveRateLimitDelayMs('not-a-number', 2), 4_000);
});

test('a hostile Retry-After cannot stall a run indefinitely', () => {
  assert.equal(resolveRateLimitDelayMs('99999', 1), 5 * 60_000);
});

// --- Historical sync rule 5: resumable checkpoints ---

test('every stage has a checkpoint that survives a round trip', () => {
  const state = createInitialImportJobState();
  state.checkpoint.stage = 'bills';
  state.checkpoint.billsPage = 7;
  state.checkpoint.attachmentsOffset = 125;

  const restored = parseImportJobState(importJobStateToSummary(state));

  assert.equal(restored.checkpoint.stage, 'bills');
  assert.equal(restored.checkpoint.billsPage, 7);
  assert.equal(restored.checkpoint.attachmentsOffset, 125);
});

test('mid-pipeline progress is recognised as resumable', () => {
  const state = createInitialImportJobState();
  assert.equal(hasRecoverableImportCheckpoint(state), false);

  state.checkpoint.creditNotesPage = 3;
  assert.equal(hasRecoverableImportCheckpoint(state), true);
});

test('stages advance in dependency order and terminate', () => {
  const state = createInitialImportJobState();
  const visited = [state.checkpoint.stage];

  while (advanceToNextStage(state)) {
    visited.push(state.checkpoint.stage);
  }

  assert.deepEqual(visited, XERO_IMPORT_STAGES);
  assert.equal(
    visited.indexOf('accounts') < visited.indexOf('invoices'),
    true,
    'accounts must land before invoices so line items resolve to real accounts',
  );
  assert.equal(
    visited.indexOf('attachments'),
    visited.length - 1,
    'attachments must land last, once their parents exist',
  );
});

// --- Entity coverage: the entities the scope requires ---

test('import covers every entity named in the scope document', () => {
  for (const stage of [
    'accounts',
    'tracking_categories',
    'contacts',
    'quotes',
    'invoices',
    'bills',
    'credit_notes',
    'payments',
    'bank_transactions',
    'attachments',
  ] as const) {
    assert.ok(XERO_IMPORT_STAGES.includes(stage), `${stage} must be an import stage`);
  }
});

test('bills are fetched as ACCPAY, separately from ACCREC invoices', () => {
  assert.ok(/Type=="\$\{type\}"/.test(CLIENT_SOURCE) || /ACCPAY/.test(CLIENT_SOURCE));
  assert.ok(/listBillsPage/.test(CLIENT_SOURCE), 'a dedicated bills pager must exist');
});

test('archived contacts are requested so the contact count can match Xero', () => {
  assert.ok(
    /includeArchived: true/.test(CLIENT_SOURCE),
    'Xero omits archived contacts unless asked, which would under-count history',
  );
});

test('OAuth requests the attachment scope', () => {
  assert.ok(
    OAUTH_SCOPES.includes('accounting.attachments'),
    'attachments cannot import without their scope',
  );
  for (const scope of [
    'accounting.settings',
    'accounting.contacts',
    'accounting.invoices',
    'accounting.payments',
    'accounting.banktransactions',
    'offline_access',
  ]) {
    assert.ok(OAUTH_SCOPES.includes(scope), `${scope} is required`);
  }
});

// --- Provider date format: Xero serialises dates as MS-JSON, not ISO ---

test('MS-JSON provider dates parse instead of throwing Invalid time value', () => {
  // Staging import of a real organisation failed on 17,674 invoices and 747 quotes with
  // "Invalid time value" because `/Date(...)/` reached `new Date(...)` unparsed.
  const normalized = normalizeXeroDate('/Date(1518652800000+0000)/');

  assert.equal(normalized, '2018-02-15T00:00:00.000Z');
  assert.doesNotThrow(() => new Date(normalized!).toISOString());
  assert.equal(new Date(normalized!).toISOString().slice(0, 10), '2018-02-15');
});

test('date-only and offset-less provider values stay on their Xero calendar day', () => {
  // Parsed in local time these would slide a day backwards east of UTC.
  assert.equal(normalizeXeroDate('2018-02-15')?.slice(0, 10), '2018-02-15');
  assert.equal(normalizeXeroDate('2018-02-15T00:00:00')?.slice(0, 10), '2018-02-15');
});

test('unparseable or absent provider dates become null rather than an invalid Date', () => {
  for (const value of [null, undefined, '', '   ', 'not-a-date', '/Date()/']) {
    assert.equal(normalizeXeroDate(value), null, `${String(value)} must normalise to null`);
  }
});

test('every provider date field is normalised before it reaches the database', () => {
  for (const field of [
    'issueDate: pickDate(quote',
    'expiryDate: pickDate(quote',
    'issueDate: pickDate(invoice',
    'dueDate: pickDate(invoice',
    'date: pickDate(transaction',
    'date: pickDate(payment',
    'date: pickDate(creditNote',
    'date: pickDate(allocation',
  ]) {
    assert.ok(CLIENT_SOURCE.includes(field), `${field} must go through the Xero date parser`);
  }
});

// --- Historical sync rule 8: no silent skips ---

test('every skip path writes a log row before continuing', () => {
  // A skipped record must leave a trace with its Xero ID and reason.
  const skipBlocks = SYNC_SERVICE_SOURCE.split('counts.skippedCount += 1;').slice(1);
  assert.ok(skipBlocks.length > 0, 'expected skip paths to exist');

  for (const [index, block] of skipBlocks.entries()) {
    const untilContinue = block.split('continue;')[0] ?? '';
    assert.ok(
      untilContinue.includes('writeLog') || untilContinue.includes('recordPaymentAllocation'),
      `skip path ${index} drops a record without a log row`,
    );
  }
});

test('unallocated payments are retained rather than dropped', () => {
  assert.ok(
    /recordPaymentAllocation/.test(SYNC_SERVICE_SOURCE),
    'payments with no resolvable invoice must still be recorded as allocations',
  );
});

// --- Ledger integrity: no drift from Xero ---

test('payment import does not re-add an amount Xero already reported as paid', () => {
  assert.equal(
    /amountPaidCents: nextPaidCents/.test(SYNC_SERVICE_SOURCE) &&
      /invoiceMapping\.invoice\.amountPaidCents \?\? 0\) \+ paymentCents/.test(
        SYNC_SERVICE_SOURCE,
      ),
    false,
    'adding the payment on top of Xero AmountPaid double-counts and drifts from the ledger',
  );
});

// --- Evidence and coverage honesty ---

test('coverage is partial while a full historical import has not finished', () => {
  const result = resolveEvidenceCoverage({
    recordCount: 120,
    failedCount: 0,
    skippedCount: 0,
    fullHistorySynced: false,
  });
  assert.equal(result.coverage, 'partial');
  assert.ok(result.rationale.length > 0);
});

test('any failed or skipped record downgrades coverage to partial', () => {
  assert.equal(
    resolveEvidenceCoverage({
      recordCount: 500,
      failedCount: 1,
      skippedCount: 0,
      fullHistorySynced: true,
    }).coverage,
    'partial',
  );
  assert.equal(
    resolveEvidenceCoverage({
      recordCount: 500,
      failedCount: 0,
      skippedCount: 2,
      fullHistorySynced: true,
    }).coverage,
    'partial',
  );
});

test('coverage is complete only on a clean full import', () => {
  assert.equal(
    resolveEvidenceCoverage({
      recordCount: 500,
      failedCount: 0,
      skippedCount: 0,
      fullHistorySynced: true,
    }).coverage,
    'complete',
  );
});

test('an absent figure is unavailable with a reason, never zero', () => {
  const attribution = buildUnavailableAttribution('No invoices imported.', 'sum of invoices');
  assert.equal(attribution.coverage, 'unavailable');
  assert.equal(attribution.recordCount, 0);
  assert.ok(attribution.coverageRationale.length > 0);
});

// --- AURA guidance ---

function coverage(overrides: Partial<XeroHistoryCoverage> = {}): XeroHistoryCoverage {
  return {
    connected: true,
    fullHistorySyncedAt: '2026-08-01T00:00:00.000Z',
    noDateFloorApplied: true,
    lastIncrementalSyncAt: '2026-08-03T00:00:00.000Z',
    stale: false,
    staleRationale: null,
    entities: [],
    overallCoverage: 'complete',
    overallRationale: 'Full Xero history imported.',
    ...overrides,
  };
}

test('AURA is always told to cite records and classify every claim', () => {
  const guidance = buildAuraEvidenceGuidance(coverage()).join(' ');
  assert.ok(/Xero ID/.test(guidance));
  assert.ok(/Xero fact/.test(guidance) && /recommendation/.test(guidance));
  assert.ok(/never perform a write|Never propose or perform a write/i.test(guidance));
});

test('AURA is told to refuse outright when Xero is not connected', () => {
  const guidance = buildAuraEvidenceGuidance(coverage({ connected: false })).join(' ');
  assert.ok(/Refuse all questions/i.test(guidance));
});

test('AURA is told to scope answers when history is partial', () => {
  const guidance = buildAuraEvidenceGuidance(
    coverage({ overallCoverage: 'partial', overallRationale: 'Bills incomplete.' }),
  ).join(' ');
  assert.ok(/partial/i.test(guidance) && /Scope every answer/i.test(guidance));
});

test('AURA is told to present stale figures as "as at", not as current', () => {
  const guidance = buildAuraEvidenceGuidance(
    coverage({ stale: true, staleRationale: 'Last sync 5 days ago.' }),
  ).join(' ');
  assert.ok(/stale/i.test(guidance) && /as at/i.test(guidance));
});

test('AURA is told to refuse questions about entities with no imported history', () => {
  const guidance = buildAuraEvidenceGuidance(
    coverage({
      overallCoverage: 'partial',
      entities: [
        {
          entity: 'bills',
          importedCount: 0,
          lastSyncedAt: null,
          failedCount: 0,
          skippedCount: 0,
          coverageState: 'not_started',
          coverage: 'unavailable',
          coverageRationale: 'No import has ever run for bills.',
        },
      ],
    }),
  ).join(' ');
  assert.ok(/bills/.test(guidance) && /Refuse questions/i.test(guidance));
});
