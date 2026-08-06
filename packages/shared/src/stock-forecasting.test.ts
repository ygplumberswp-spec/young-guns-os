import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSfForecastSnapshot,
  buildSfReorderRecommendationDraft,
  canAccessStockForecasting,
  canApproveStockForecasting,
  canManageStockForecastingSettings,
  canWriteStockForecasting,
  computeAvgDailyDemand,
  computeDaysOfCover,
  computeSeasonalDemand,
  computeShortageRisk,
  computeTrend,
  defaultSfSettings,
  listSfAuraConnections,
  SF_PRODUCT_COPY,
  suggestedForecastReorderQty,
  suggestedReorderByDate,
  unavailableSeasonalDemand,
} from './stock-forecasting.js';

describe('stock forecasting & automation', () => {
  it('RBAC: Technician/Client denied; write needs inventory/procurement write; Owner approves', () => {
    assert.equal(
      canAccessStockForecasting({ roleName: 'Manager', permissions: ['inventory:read'] }),
      true,
    );
    assert.equal(
      canAccessStockForecasting({
        roleName: 'Technician',
        permissions: ['*', 'inventory:write'],
      }),
      false,
    );
    assert.equal(
      canAccessStockForecasting({ roleName: 'Client', permissions: ['inventory:read'] }),
      false,
    );
    assert.equal(
      canWriteStockForecasting({ roleName: 'Manager', permissions: ['inventory:read'] }),
      false,
    );
    assert.equal(
      canWriteStockForecasting({ roleName: 'Manager', permissions: ['inventory:write'] }),
      true,
    );
    assert.equal(
      canApproveStockForecasting({
        roleName: 'Company Owner',
        permissions: ['inventory:write'],
      }),
      true,
    );
    assert.equal(
      canApproveStockForecasting({
        roleName: 'Manager',
        permissions: ['inventory:write'],
      }),
      false,
    );
    assert.equal(
      canManageStockForecastingSettings({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      true,
    );
  });

  it('demand stays unavailable without sufficient real issue history — never invents', () => {
    const empty = computeAvgDailyDemand({
      totalConsumed: 0,
      windowDays: 30,
      issueEventCount: 0,
      minIssueEvents: 3,
    });
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.avgDailyDemand, null);
    assert.ok(/not invented/i.test(empty.rationale));

    const thin = computeAvgDailyDemand({
      totalConsumed: 2,
      windowDays: 30,
      issueEventCount: 2,
      minIssueEvents: 3,
    });
    assert.equal(thin.availability, 'unavailable');

    const ok = computeAvgDailyDemand({
      totalConsumed: 30,
      windowDays: 30,
      issueEventCount: 5,
      minIssueEvents: 3,
    });
    assert.equal(ok.availability, 'available');
    assert.equal(ok.avgDailyDemand, 1);
  });

  it('forecast snapshot unavailable when no forecastable items', () => {
    const snap = buildSfForecastSnapshot({
      itemCount: 4,
      forecastableCount: 0,
      unavailableCount: 4,
      highRiskCount: 0,
    });
    assert.equal(snap.availability, 'unavailable');
    assert.ok(/not invented/i.test(snap.rationale));
  });

  it('cover, risk, trend, and reorder qty use real inputs only', () => {
    assert.equal(computeDaysOfCover({ quantityOnHand: 10, avgDailyDemand: 2 }), 5);
    assert.equal(computeDaysOfCover({ quantityOnHand: 10, avgDailyDemand: null }), null);

    assert.equal(
      computeShortageRisk({
        availability: 'available',
        quantityOnHand: 0,
        reorderLevel: 5,
        projectedDaysOfCover: 0,
        leadTimeDays: 3,
      }),
      'high',
    );
    assert.equal(
      computeShortageRisk({
        availability: 'unavailable',
        quantityOnHand: 100,
        reorderLevel: 5,
        projectedDaysOfCover: null,
        leadTimeDays: null,
      }),
      'unavailable',
    );

    assert.equal(
      computeTrend({
        firstHalfConsumed: 10,
        secondHalfConsumed: 20,
        availability: 'available',
      }),
      'up',
    );
    assert.equal(
      computeTrend({
        firstHalfConsumed: 0,
        secondHalfConsumed: 0,
        availability: 'unavailable',
      }),
      'unavailable',
    );

    assert.equal(
      suggestedForecastReorderQty({
        quantityOnHand: 2,
        reorderLevel: 10,
        avgDailyDemand: 1,
        leadTimeDays: 7,
        coverTargetDays: 14,
      }),
      12,
    );
  });

  it('recommendation drafts are recommendations only — never auto-purchase language as execution', () => {
    const draft = buildSfReorderRecommendationDraft({
      kind: 'buy_soon',
      sku: 'PIPE-20',
      name: '20mm pipe',
      suggestedQuantity: 8,
      suggestedReorderBy: '2026-08-10',
      shortageRisk: 'high',
      avgDailyDemand: 1.2,
      projectedDaysOfCover: 4,
      leadTimeDays: 5,
      seasonal: unavailableSeasonalDemand('insufficient history for test'),
      assumptions: ['Window 30d', 'Lead time from supplier_products'],
    });
    assert.ok(/draft|Owner approval|Never auto/i.test(draft.body));
    assert.ok(draft.whatToBuy.includes('PIPE-20'));
    assert.ok(draft.whenToBuy.includes('2026-08-10'));
    assert.ok(draft.expectedUsage.length > 0);

    const by = suggestedReorderByDate({
      projectedDaysOfCover: 10,
      leadTimeDays: 3,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });
    assert.equal(by, '2026-08-08');

    const settings = defaultSfSettings();
    assert.equal(settings.autoReorderEnabled, false);
    assert.equal(settings.autoPurchaseEnabled, false);
    assert.ok(SF_PRODUCT_COPY.thisLayer.includes('Never invents demand'));
    assert.ok(listSfAuraConnections().some((c) => c.href === '/procurement-intelligence'));
  });

  it('seasonal demand uses real comparable periods only — never invents when history insufficient', () => {
    const none = computeSeasonalDemand({
      points: [],
      now: new Date('2026-08-03T00:00:00.000Z'),
      minPeriodEvents: 2,
    });
    assert.equal(none.availability, 'unavailable');
    assert.ok(/not invented/i.test(none.rationale));

    const sparse = computeSeasonalDemand({
      points: [
        { at: new Date('2026-08-01T00:00:00.000Z'), consumed: 1 },
        { at: new Date('2025-08-01T00:00:00.000Z'), consumed: 1 },
      ],
      now: new Date('2026-08-03T00:00:00.000Z'),
      minPeriodEvents: 2,
    });
    assert.equal(sparse.availability, 'unavailable');

    const yoy = computeSeasonalDemand({
      points: [
        { at: new Date('2026-08-01T00:00:00.000Z'), consumed: 4 },
        { at: new Date('2026-08-02T00:00:00.000Z'), consumed: 6 },
        { at: new Date('2025-08-01T00:00:00.000Z'), consumed: 2 },
        { at: new Date('2025-08-15T00:00:00.000Z'), consumed: 3 },
      ],
      now: new Date('2026-08-03T00:00:00.000Z'),
      minPeriodEvents: 2,
    });
    assert.equal(yoy.availability, 'available');
    assert.equal(yoy.method, 'month_over_year');
    assert.ok((yoy.index ?? 0) > 1);
    assert.equal(yoy.direction, 'higher');
  });

});