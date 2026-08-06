import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveStageCoverageState } from '@titan/shared';
import { hasTrustworthyFullHistory, resolveEntityCoverageWrite } from './xero-sync.service.js';
import { emptyImportCounts } from './xero-import-job.shared.js';
import {
  buildImportSyncResult,
  clearStaleStageFailuresOnResume,
  createInitialImportJobState,
  importJobStateToSummary,
  parseImportJobState,
} from './xero-import-job.processor.js';

const SYNC_SERVICE_SOURCE = readFileSync(
  new URL('./xero-sync.service.ts', import.meta.url),
  'utf8',
);

const NOW = new Date('2026-08-04T05:00:00.000Z');

function counts(overrides: Partial<ReturnType<typeof emptyImportCounts>> = {}) {
  return { ...emptyImportCounts(), ...overrides };
}

// --- Write path: only a stage that finished successfully may claim complete history ---

test('a stage that imported nothing while records failed is never recorded as complete', () => {
  // Observed on bank_transactions: 0 imported, 3,095 failed, yet full_history_synced_at was set.
  const write = resolveEntityCoverageWrite({
    stage: 'bank_transactions',
    counts: counts({ failedCount: 3095, skippedCount: 1 }),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: true,
    existing: null,
    now: NOW,
  });

  assert.equal(write.fullHistorySyncedAt ?? null, null);
  assert.equal(write.modifiedSinceWatermark ?? null, null);
  assert.equal(write.importedCount, 0);
  assert.equal(write.failedCount, 3095);
  assert.equal(write.skippedCount, 1);
});

test('a stage that failed part way through cannot claim complete history for what it did import', () => {
  const write = resolveEntityCoverageWrite({
    stage: 'attachments',
    counts: counts({ createdCount: 4, updatedCount: 1, failedCount: 5 }),
    failedStage: 'attachments',
    stageError: 'Xero rejected the request. Verify the tenant ID and granted scopes.',
    isFullHistoryRun: true,
    existing: null,
    now: NOW,
  });

  assert.equal(write.fullHistorySyncedAt ?? null, null);
  assert.equal(write.importedCount, 5);
  assert.equal(write.failedCount, 5);
  assert.match(write.lastError ?? '', /granted scopes/);
});

test('a clean full-history stage claims complete history and its watermark', () => {
  const write = resolveEntityCoverageWrite({
    stage: 'invoices',
    counts: counts({ createdCount: 7, updatedCount: 92 }),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: true,
    existing: null,
    now: NOW,
  });

  assert.equal(write.fullHistorySyncedAt, NOW);
  assert.equal(write.modifiedSinceWatermark, NOW);
  assert.equal(write.importedCount, 99);
  assert.equal(write.lastError, null);
});

test('a stage Xero returned no records for completes honestly rather than staying unproven', () => {
  const write = resolveEntityCoverageWrite({
    stage: 'credit_notes',
    counts: counts(),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: true,
    existing: null,
    now: NOW,
  });

  assert.equal(write.fullHistorySyncedAt, NOW);
  assert.equal(write.importedCount, 0);
  assert.equal(write.failedCount, 0);

  const { state, coverage } = resolveStageCoverageState({
    importedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    fullHistorySynced: true,
  });
  assert.equal(state, 'complete');
  assert.equal(coverage, 'unavailable', 'an empty entity has nothing to answer from');
});

test('an incremental run keeps a complete-history claim an earlier clean run earned', () => {
  const earned = new Date('2026-08-01T00:00:00.000Z');
  const write = resolveEntityCoverageWrite({
    stage: 'contacts',
    counts: counts({ updatedCount: 12 }),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: false,
    existing: { fullHistorySyncedAt: earned, importedCount: 676, failedCount: 0 },
    now: NOW,
  });

  assert.equal('fullHistorySyncedAt' in write, false, 'the earned claim must be left untouched');
});

test('an incremental run does not shrink what an entity is recorded as holding', () => {
  // Observed on staging: the incremental returned 61 modified invoices, and the coverage row went
  // from 585 imported to 61 — so the Owner's evidence for a fully imported ledger read 61.
  const earned = new Date('2026-08-04T09:09:15.895Z');
  const write = resolveEntityCoverageWrite({
    stage: 'invoices',
    counts: counts({ updatedCount: 61 }),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: false,
    existing: { fullHistorySyncedAt: earned, importedCount: 585, failedCount: 0 },
    now: NOW,
  });

  assert.equal(write.importedCount, 585);
});

test('an entity the incremental did not touch keeps its history instead of reading as empty', () => {
  // The bill on staging. Xero returned nothing for it, and the row went to 0 imported, which the
  // read path words as "Xero returned no records, so there is nothing to answer from".
  const earned = new Date('2026-08-04T09:09:20.776Z');
  const write = resolveEntityCoverageWrite({
    stage: 'bills',
    counts: counts(),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: false,
    existing: { fullHistorySyncedAt: earned, importedCount: 1, failedCount: 0 },
    now: NOW,
  });

  assert.equal(write.importedCount, 1);
  assert.equal(
    resolveStageCoverageState({
      importedCount: write.importedCount,
      failedCount: write.failedCount,
      skippedCount: write.skippedCount,
      fullHistorySynced: true,
    }).coverage,
    'complete',
  );
});

test('records an incremental creates are added to the holding', () => {
  const earned = new Date('2026-08-04T09:22:36.222Z');
  const write = resolveEntityCoverageWrite({
    stage: 'payments',
    counts: counts({ createdCount: 3, updatedCount: 48 }),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: false,
    existing: { fullHistorySyncedAt: earned, importedCount: 511, failedCount: 0 },
    now: NOW,
  });

  assert.equal(write.importedCount, 514, 'three payments that did not exist before now do');
});

test('a full historical run remains authoritative over the recorded count', () => {
  const write = resolveEntityCoverageWrite({
    stage: 'invoices',
    counts: counts({ updatedCount: 585 }),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: true,
    existing: { fullHistorySyncedAt: null, importedCount: 9_999, failedCount: 0 },
    now: NOW,
  });

  assert.equal(write.importedCount, 585, 'a complete re-pull replaces an inherited figure');
});

test('the first run for an entity records what it imported even when incremental', () => {
  const write = resolveEntityCoverageWrite({
    stage: 'bank_transactions',
    counts: counts({ createdCount: 42 }),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: false,
    existing: null,
    now: NOW,
  });

  assert.equal(write.importedCount, 42);
});

// --- Stale pre-fix coverage rows are recomputed, not believed ---

test('a stale complete-history claim is cleared on the next write, with the correction recorded', () => {
  const stale = new Date('2026-08-03T23:24:39.453Z');
  const write = resolveEntityCoverageWrite({
    stage: 'bank_transactions',
    counts: counts({ failedCount: 2 }),
    failedStage: null,
    stageError: null,
    isFullHistoryRun: true,
    existing: { fullHistorySyncedAt: stale, importedCount: 0, failedCount: 3095 },
    now: NOW,
  });

  assert.equal(write.fullHistorySyncedAt, null);
  assert.equal(write.modifiedSinceWatermark, null);
  assert.match(write.lastError ?? '', /stale complete-history claim/);
  assert.match(write.lastError ?? '', /3095 failed/, 'the evidence it replaced is not erased');
});

test('a stored complete-history timestamp is only trusted when the row agrees with it', () => {
  const timestamp = new Date('2026-08-03T23:24:39.453Z');
  assert.equal(hasTrustworthyFullHistory({ fullHistorySyncedAt: timestamp, failedCount: 0 }), true);
  assert.equal(
    hasTrustworthyFullHistory({ fullHistorySyncedAt: timestamp, failedCount: 3095 }),
    false,
    'a row written before completion was checked must not be believed',
  );
  assert.equal(hasTrustworthyFullHistory({ fullHistorySyncedAt: null, failedCount: 0 }), false);
});

test('the read path recomputes stale rows from their own counts', () => {
  // The stale bank_transactions row as observed in staging.
  const row = { fullHistorySyncedAt: new Date(), importedCount: 0, failedCount: 3095 };
  const { state, coverage, rationale } = resolveStageCoverageState({
    importedCount: row.importedCount,
    failedCount: row.failedCount,
    skippedCount: 1,
    fullHistorySynced: hasTrustworthyFullHistory(row),
  });

  assert.equal(state, 'failed');
  assert.notEqual(coverage, 'complete');
  assert.match(rationale, /3095 record\(s\) failed/);
});

// --- Coverage states ---

test('all records failed is FAILED, never complete', () => {
  const { state, coverage } = resolveStageCoverageState({
    importedCount: 0,
    failedCount: 5,
    skippedCount: 0,
    fullHistorySynced: false,
  });
  assert.equal(state, 'failed');
  assert.equal(coverage, 'unavailable');
});

test('zero fetched with nothing failed and no full pull is NOT_STARTED', () => {
  const { state, coverage } = resolveStageCoverageState({
    importedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    fullHistorySynced: false,
  });
  assert.equal(state, 'not_started');
  assert.equal(coverage, 'unavailable');
});

test('a stage no run has ever touched is NOT_STARTED', () => {
  const { state, rationale } = resolveStageCoverageState({
    importedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    fullHistorySynced: false,
    everSynced: false,
  });
  assert.equal(state, 'not_started');
  assert.match(rationale, /No import has recorded any evidence/);
});

test('partial success stays PARTIAL even after a full pull', () => {
  const { state, coverage, rationale } = resolveStageCoverageState({
    importedCount: 3062,
    failedCount: 16,
    skippedCount: 2,
    fullHistorySynced: true,
  });
  assert.equal(state, 'partial');
  assert.equal(coverage, 'partial');
  assert.match(rationale, /16 record\(s\) failed and 2 were skipped/);
});

test('an interrupted stage is INTERRUPTED and covers only what it imported', () => {
  const { state, coverage, rationale } = resolveStageCoverageState({
    importedCount: 249,
    failedCount: 0,
    skippedCount: 0,
    fullHistorySynced: false,
    interrupted: true,
  });
  assert.equal(state, 'interrupted');
  assert.equal(coverage, 'partial');
  assert.match(rationale, /stopped before finishing/);
});

test('an interrupted stage that imported nothing has no coverage at all', () => {
  const { state, coverage } = resolveStageCoverageState({
    importedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    fullHistorySynced: false,
    everSynced: true,
    interrupted: true,
  });
  assert.equal(state, 'interrupted');
  assert.equal(coverage, 'unavailable');
});

test('a clean full-history stage is COMPLETE', () => {
  const { state, coverage } = resolveStageCoverageState({
    importedCount: 676,
    failedCount: 0,
    skippedCount: 0,
    fullHistorySynced: true,
  });
  assert.equal(state, 'complete');
  assert.equal(coverage, 'complete');
});

test('complete over failed records requires an explicitly configured partial policy', () => {
  const evidence = {
    importedCount: 500,
    failedCount: 3,
    skippedCount: 0,
    fullHistorySynced: true,
  } as const;

  assert.equal(resolveStageCoverageState(evidence).state, 'partial');
  assert.equal(
    resolveStageCoverageState({ ...evidence, partialHistoryPolicy: 'strict' }).state,
    'partial',
  );

  const documented = resolveStageCoverageState({
    ...evidence,
    partialHistoryPolicy: 'allow_documented_partial',
  });
  assert.equal(documented.state, 'complete');
  assert.match(documented.rationale, /3 failed/, 'the permitted gap must still be stated');
});

test('a documented partial policy cannot rescue a stage that imported nothing', () => {
  const { state } = resolveStageCoverageState({
    importedCount: 0,
    failedCount: 9,
    skippedCount: 0,
    fullHistorySynced: true,
    partialHistoryPolicy: 'allow_documented_partial',
  });
  assert.equal(state, 'failed');
});

// --- Interrupted batches never look like finished stages ---

test('a stage that fetched no page in a batch is left open instead of recorded as covered', () => {
  // A batch whose budget ran out before the first fetch left lastBatchSize at 0, which
  // isStageComplete reads as "the last page was short" — and the stage was recorded as complete
  // history having imported nothing.
  assert.match(
    SYNC_SERVICE_SOURCE,
    /if \(pagesProcessed === 0\) \{\s*return \{ stageComplete: false, budgetExhausted: true \};/,
    'a batch that processed no page must not fall through to the stage-complete check',
  );
});

// --- lastSyncAt is not claimed for a run that skipped past failures ---

test('failures a resume moves past are carried, not erased', () => {
  const state = createInitialImportJobState({ checkpoint: { stage: 'bank_transactions' } });
  state.completedStages = ['contacts', 'quotes', 'invoices'];
  state.invoices.failedCount = 585;
  state.quotes.failedCount = 2;
  state.bankTransactions.createdCount = 3062;

  clearStaleStageFailuresOnResume(state);

  assert.equal(state.invoices.failedCount, 0, 'the resumed run will not retry these');
  assert.equal(state.carriedFailureCount, 587);
  assert.equal(
    parseImportJobState(importJobStateToSummary(state)).carriedFailureCount,
    587,
    'the carried total must survive a checkpoint round trip',
  );

  const result = buildImportSyncResult(state, 'job-id', null);
  assert.equal(result.syncedAt, null, 'an incomplete run has no synced-at to claim');
  assert.match(result.message, /587 record\(s\) failed in stages this run resumed past/);
});

test('a run with nothing carried still reports a clean sync', () => {
  const state = createInitialImportJobState({ checkpoint: { stage: 'attachments' } });
  state.contacts.createdCount = 676;

  clearStaleStageFailuresOnResume(state);

  assert.equal(state.carriedFailureCount, 0);
  const result = buildImportSyncResult(state, 'job-id', NOW.toISOString());
  assert.equal(result.success, true);
  assert.match(result.message, /Xero sync complete/);
});

test('lastSyncAt is only refreshed when the run covered everything', () => {
  assert.match(
    SYNC_SERVICE_SOURCE,
    /const coveredEverything = success && \(state\.carriedFailureCount \?\? 0\) === 0;/,
    'a resumed run that skipped failed records must not refresh lastSyncAt',
  );
});
