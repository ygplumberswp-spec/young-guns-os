import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDmHistoricalMigrationReport,
  buildHistoricalMigrationReport,
  buildXeroHistoricalMigrationReport,
  extractHistoricalSourceDateFromRow,
  observeHistoricalRecordDate,
  resolveHistoricalDiscoveredCount,
  resolveHistoricalSyncMode,
  YOUNG_GUNS_FULL_HISTORY_POLICY,
  YOUNG_GUNS_KNOWN_PROVIDER_LIMITATIONS,
} from './historical-full-history.js';

describe('Young Guns full-history migration addendum', () => {
  it('forbids arbitrary date cutoffs and starts in FULL_HISTORY', () => {
    assert.equal(YOUNG_GUNS_FULL_HISTORY_POLICY.noArbitraryDateCutoff, true);
    assert.equal(YOUNG_GUNS_FULL_HISTORY_POLICY.syncMode, 'FULL_HISTORY');
    assert.equal(YOUNG_GUNS_FULL_HISTORY_POLICY.postInitialSyncMode, 'INCREMENTAL');
    assert.ok(YOUNG_GUNS_KNOWN_PROVIDER_LIMITATIONS.length >= 3);
  });

  it('stays on FULL_HISTORY until every stage is clean, then allows INCREMENTAL', () => {
    assert.equal(
      resolveHistoricalSyncMode({ noDateFloorApplied: true, everyStageFullySynced: false }),
      'FULL_HISTORY',
    );
    assert.equal(
      resolveHistoricalSyncMode({ noDateFloorApplied: false, everyStageFullySynced: true }),
      'INCREMENTAL',
    );
    assert.equal(
      resolveHistoricalSyncMode({
        noDateFloorApplied: false,
        everyStageFullySynced: true,
        forceFullHistory: true,
      }),
      'FULL_HISTORY',
    );
  });

  it('tracks oldest/newest source dates without inventing missing ones', () => {
    let bounds = observeHistoricalRecordDate(
      { oldestRecordDate: null, newestRecordDate: null },
      '2020-01-15T00:00:00.000Z',
    );
    bounds = observeHistoricalRecordDate(bounds, '2024-06-01T12:00:00.000Z');
    bounds = observeHistoricalRecordDate(bounds, null);
    assert.equal(bounds.oldestRecordDate, '2020-01-15T00:00:00.000Z');
    assert.equal(bounds.newestRecordDate, '2024-06-01T12:00:00.000Z');
  });

  it('builds a final migration report with required Owner fields', () => {
    const report = buildXeroHistoricalMigrationReport({
      noDateFloorApplied: true,
      everyStageFullySynced: false,
      stageCounts: [
        {
          entityType: 'invoices',
          createdCount: 10,
          updatedCount: 2,
          unchangedCount: 3,
          skippedCount: 1,
          failedCount: 1,
          pulledCount: 15,
          oldestRecordDate: '2018-03-01T00:00:00.000Z',
          newestRecordDate: '2026-08-01T00:00:00.000Z',
        },
        {
          entityType: 'payments',
          createdCount: 5,
          updatedCount: 0,
          unchangedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          pulledCount: 5,
          oldestRecordDate: '2019-01-01T00:00:00.000Z',
          newestRecordDate: '2026-07-15T00:00:00.000Z',
        },
      ],
    });

    assert.equal(report.syncMode, 'FULL_HISTORY');
    assert.equal(report.noDateFloorApplied, true);
    assert.equal(report.arbitraryDateCutoffForbidden, true);
    assert.equal(report.oldestRecordDateImported, '2018-03-01T00:00:00.000Z');
    assert.equal(report.newestRecordDateImported, '2026-08-01T00:00:00.000Z');
    assert.equal(report.totalRecordsDiscovered, 22);
    assert.equal(report.createdCount, 15);
    assert.equal(report.updatedCount, 2);
    assert.equal(report.unchangedCount, 3);
    assert.equal(report.skippedCount, 1);
    assert.equal(report.failedCount, 1);
    assert.ok(report.providerLimitations.some((item) => item.entityType === 'jobs'));
    assert.match(report.summary, /Full-history import/);
  });

  it('discovers from pulled+skipped+failed when explicit discovered is omitted', () => {
    assert.equal(
      resolveHistoricalDiscoveredCount({
        createdCount: 4,
        updatedCount: 1,
        unchangedCount: 2,
        skippedCount: 1,
        failedCount: 1,
        pulledCount: 7,
      }),
      9,
    );
  });

  it('reports non-executable DM entities as unavailable rather than fabricating them', () => {
    const report = buildDmHistoricalMigrationReport({
      entityType: 'vehicle',
      sourceProvider: 'CSV',
      executable: false,
      unsupportedMessage: 'UNSUPPORTED / REQUIRES IMPLEMENTATION',
      results: [
        { outcome: 'failed', sourceData: { issuedAt: '2021-05-01' } },
        { outcome: 'skipped', sourceData: {} },
      ],
    });
    assert.equal(report.failedCount, 1);
    assert.equal(report.skippedCount, 1);
    assert.ok(
      report.providerLimitations.some(
        (item) =>
          item.entityType === 'vehicle' && item.remediation === 'manual_import',
      ),
    );
  });

  it('counts linked DM rows as unchanged and created rows as created', () => {
    const report = buildDmHistoricalMigrationReport({
      entityType: 'customer',
      sourceProvider: 'CSV',
      executable: true,
      linkedRowNumbers: [2],
      results: [
        {
          outcome: 'imported',
          mutation: 'created',
          sourceData: { issuedAt: '2020-01-01', name: 'A' },
        },
        {
          outcome: 'imported',
          mutation: 'unchanged',
          sourceData: { issuedAt: '2022-01-01', name: 'B' },
        },
      ],
    });
    assert.equal(report.createdCount, 1);
    assert.equal(report.unchangedCount, 1);
    assert.equal(report.totalRecordsDiscovered, 2);
    assert.equal(report.oldestRecordDateImported?.slice(0, 10), '2020-01-01');
  });

  it('extracts source dates from common historical row fields', () => {
    assert.equal(
      extractHistoricalSourceDateFromRow({ paidAt: '2023-11-04T10:00:00.000Z' })?.slice(0, 10),
      '2023-11-04',
    );
    assert.equal(extractHistoricalSourceDateFromRow({ name: 'no date' }), null);
  });

  it('never applies a silent date floor in the aggregate report builder', () => {
    const report = buildHistoricalMigrationReport({
      syncMode: 'FULL_HISTORY',
      noDateFloorApplied: true,
      entities: [],
      includeKnownYoungGunsLimitations: false,
    });
    assert.equal(report.arbitraryDateCutoffForbidden, true);
    assert.equal(report.noDateFloorApplied, true);
    assert.equal(report.oldestRecordDateImported, null);
    assert.equal(report.newestRecordDateImported, null);
  });
});
