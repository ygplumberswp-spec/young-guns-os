import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFrfActionDraftsFromSignals,
  buildFrfBudgetPlanVariance,
  buildFrfExpenseReport,
  buildFrfForecast,
  buildFrfInsightDraftsFromSignals,
  buildFrfInvoiceReport,
  buildFrfJobProfitabilityReport,
  buildFrfPaymentReport,
  buildFrfProfitReport,
  buildFrfRevenueReport,
  canAccessFinanceReportingForecast,
  canApproveFinanceReportingForecast,
  canWriteFinanceReportingForecast,
  computeFrfForecastConfidence,
  FRF_MIN_HISTORY_MONTHS,
  FRF_PRODUCT_COPY,
  listFrfAuraConnections,
} from './finance-reporting-forecast.js';

describe('finance reporting & forecasting', () => {
  it('RBAC extends Finance AURA Agent — Technician/Client denied; Owner approves', () => {
    assert.equal(
      canAccessFinanceReportingForecast({
        roleName: 'Technician',
        permissions: ['finance:write'],
      }),
      false,
    );
    assert.equal(
      canAccessFinanceReportingForecast({ roleName: 'Client', permissions: ['*'] }),
      false,
    );
    assert.equal(
      canAccessFinanceReportingForecast({ roleName: 'Company Owner', permissions: [] }),
      true,
    );
    assert.equal(
      canWriteFinanceReportingForecast({
        roleName: 'Accountant',
        permissions: ['finance:write'],
      }),
      true,
    );
    assert.equal(
      canApproveFinanceReportingForecast({
        roleName: 'Accountant',
        permissions: ['finance:write'],
      }),
      false,
    );
    assert.equal(
      canApproveFinanceReportingForecast({ roleName: 'Company Owner', permissions: [] }),
      true,
    );
  });

  it('revenue report unavailable without invoices — never invents', () => {
    const empty = buildFrfRevenueReport({ invoices: [] });
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.totalCents, null);
    assert.ok(empty.gaps.length > 0);
  });

  it('revenue and payment reports from real rows', () => {
    const now = new Date('2026-08-03T12:00:00.000Z');
    const revenue = buildFrfRevenueReport({
      now,
      invoices: [
        {
          id: 'inv-1',
          status: 'paid',
          totalCents: 10_000,
          amountCents: 10_000,
          amountPaidCents: 10_000,
          issuedAt: '2026-06-01T00:00:00.000Z',
          createdAt: '2026-06-01T00:00:00.000Z',
          customerId: 'c1',
        },
        {
          id: 'inv-2',
          status: 'cancelled',
          totalCents: 99_999,
          amountCents: 99_999,
          amountPaidCents: 0,
          issuedAt: '2026-07-01T00:00:00.000Z',
          createdAt: '2026-07-01T00:00:00.000Z',
          customerId: null,
        },
      ],
    });
    assert.equal(revenue.availability, 'available');
    assert.equal(revenue.totalCents, 10_000);
    assert.equal(revenue.lineCount, 1);

    const payment = buildFrfPaymentReport({
      now,
      payments: [
        {
          id: 'p1',
          amountCents: 4_000,
          method: 'eft',
          paidAt: '2026-08-01T00:00:00.000Z',
          invoiceId: 'inv-1',
        },
      ],
    });
    assert.equal(payment.availability, 'available');
    assert.equal(payment.totalCents, 4_000);
  });

  it('expense unavailable without POs; profit margin null without costs', () => {
    assert.equal(buildFrfExpenseReport({ purchaseOrders: [] }).availability, 'unavailable');
    const profit = buildFrfProfitReport({
      revenueCents: 5_000,
      costCents: null,
      marginCents: null,
      jobsWithCostData: 0,
      jobCount: 2,
    });
    assert.equal(profit.availability, 'available');
    assert.equal(profit.totalCents, null);
    assert.ok(profit.gaps.some((g) => g.toLowerCase().includes('cost')));
  });

  it('invoice and job profitability reports from real rows; margins not invented', () => {
    const invoice = buildFrfInvoiceReport({
      invoices: [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-1',
          status: 'overdue',
          totalCents: 10_000,
          amountCents: 10_000,
          amountPaidCents: 0,
          dueDate: '2026-07-01T00:00:00.000Z',
          issuedAt: '2026-06-01T00:00:00.000Z',
          createdAt: '2026-06-01T00:00:00.000Z',
          customerId: 'c1',
        },
      ],
      now: new Date('2026-08-03T12:00:00.000Z'),
    });
    assert.equal(invoice.availability, 'available');
    assert.equal(invoice.kind, 'invoice');
    assert.ok(invoice.lines.some((l) => l.key === 'overdue' && l.amountCents === 10_000));

    const jp = buildFrfJobProfitabilityReport({
      jobs: [
        {
          jobId: 'j1',
          jobNumber: 'J-1',
          title: 'Geyser',
          revenueCents: 8_000,
          costCents: null,
          marginCents: null,
          costAvailability: 'unavailable',
          costGapReason: 'No real unit costs',
        },
      ],
    });
    assert.equal(jp.kind, 'job_profitability');
    assert.equal(jp.totalCents, null);
    assert.ok(jp.gaps.some((g) => g.toLowerCase().includes('margin')));
  });

  it('forecast returns insufficient_history when thin — projected null', () => {
    const now = new Date('2026-08-03T12:00:00.000Z');
    const thin = buildFrfForecast({
      kind: 'revenue',
      now,
      historySeries: [
        { periodKey: '2026-03', label: 'Mar 2026', amountCents: 0 },
        { periodKey: '2026-04', label: 'Apr 2026', amountCents: 0 },
        { periodKey: '2026-05', label: 'May 2026', amountCents: 0 },
        { periodKey: '2026-06', label: 'Jun 2026', amountCents: 1000 },
        { periodKey: '2026-07', label: 'Jul 2026', amountCents: 2000 },
        { periodKey: '2026-08', label: 'Aug 2026', amountCents: 0 },
      ],
    });
    assert.equal(thin.availability, 'insufficient_history');
    assert.equal(thin.projectedSeries, null);
    assert.equal(thin.projectedTotalCents, null);
    assert.equal(thin.confidence, 'unavailable');
    assert.equal(thin.minHistoryRequired, FRF_MIN_HISTORY_MONTHS);
    assert.ok(thin.assumptions.length >= 3);
    assert.ok(thin.methodology.length > 20);

    const ready = buildFrfForecast({
      kind: 'cashflow',
      now,
      horizonMonths: 3,
      historySeries: [
        { periodKey: '2026-03', label: 'Mar 2026', amountCents: 1000 },
        { periodKey: '2026-04', label: 'Apr 2026', amountCents: 2000 },
        { periodKey: '2026-05', label: 'May 2026', amountCents: 3000 },
        { periodKey: '2026-06', label: 'Jun 2026', amountCents: 0 },
        { periodKey: '2026-07', label: 'Jul 2026', amountCents: 0 },
        { periodKey: '2026-08', label: 'Aug 2026', amountCents: 0 },
      ],
    });
    assert.equal(ready.availability, 'available');
    assert.ok(ready.projectedSeries);
    assert.equal(ready.projectedSeries!.length, 3);
    assert.equal(ready.projectedSeries![0]!.amountCents, 2000);
    assert.ok(['low', 'medium', 'high'].includes(ready.confidence));
    assert.ok(ready.confidenceRationale.length > 10);
    assert.ok(ready.summary.toLowerCase().includes('heuristic'));
    assert.equal(
      computeFrfForecastConfidence({
        availability: 'unavailable',
        historyMonthsUsed: 0,
        activeAmountsCents: [],
      }).confidence,
      'unavailable',
    );
  });

  it('budget variance null when actuals missing; insights/actions grounded', () => {
    const variance = buildFrfBudgetPlanVariance({
      budgetedRevenueCents: 10_000,
      budgetedExpenseCents: 4_000,
      actualRevenueCents: null,
      actualExpenseCents: 5_000,
    });
    assert.equal(variance.revenueVarianceCents, null);
    assert.equal(variance.expenseVarianceCents, 1_000);

    const unavailableForecast = buildFrfForecast({
      kind: 'revenue',
      historySeries: [],
    });
    const insights = buildFrfInsightDraftsFromSignals({
      revenue: buildFrfRevenueReport({
        invoices: [
          {
            id: 'i',
            status: 'sent',
            totalCents: 100,
            amountCents: 100,
            amountPaidCents: 0,
            issuedAt: '2026-01-01T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
            customerId: null,
          },
        ],
      }),
      payment: buildFrfPaymentReport({ payments: [] }),
      expense: buildFrfExpenseReport({ purchaseOrders: [] }),
      revenueForecast: unavailableForecast,
      cashflowForecast: unavailableForecast,
    });
    assert.ok(insights.some((i) => i.target === 'command_centre'));

    const actions = buildFrfActionDraftsFromSignals({
      revenueForecast: buildFrfForecast({
        kind: 'revenue',
        historySeries: [
          { periodKey: '2026-06', label: 'Jun', amountCents: 1 },
          { periodKey: '2026-07', label: 'Jul', amountCents: 1 },
        ],
      }),
      expense: buildFrfExpenseReport({ purchaseOrders: [] }),
      payment: buildFrfPaymentReport({ payments: [] }),
    });
    assert.ok(actions.some((a) => a.kind === 'review_forecast'));
    assert.ok(FRF_PRODUCT_COPY.thisLayer.includes('insufficient_history'));
    assert.ok(listFrfAuraConnections().some((c) => c.target === 'command_centre'));
    assert.ok(listFrfAuraConnections().some((c) => c.target === 'finance_aura_agent'));
    assert.ok(listFrfAuraConnections().some((c) => c.target === 'dashboard'));
  });
});
