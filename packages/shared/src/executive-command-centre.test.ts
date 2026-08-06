import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEcActionDraft,
  buildEcOpportunities,
  buildEcRisks,
  buildEcSummary,
  canAccessExecutiveCommandCentre,
  canApproveExecutiveCommandCentre,
  canManageExecutiveCommandCentreSettings,
  canWriteExecutiveCommandCentre,
  defaultEcSettings,
  EC_PANEL_LABELS,
  EC_PRODUCT_COPY,
  ecCount,
  ecMoney,
  ecPanelAvailability,
  isEcPanelKey,
  listEcConnections,
  type EcCashPanel,
  type EcFleetPanel,
  type EcJobsPanel,
  type EcMarketingPanel,
  type EcOutstandingPanel,
  type EcProfitPanel,
  type EcRevenuePanel,
  type EcSalesPanel,
  type EcStaffPanel,
} from './executive-command-centre.js';

const OWNER = { roleName: 'Company Owner', permissions: [] as string[] };

describe('executive command centre', () => {
  it('Owner only — staff, manager, accountant, technician and client denied even with wildcard', () => {
    assert.equal(canAccessExecutiveCommandCentre(OWNER), true);
    assert.equal(
      canAccessExecutiveCommandCentre({ roleName: 'Platform Owner', permissions: [] }),
      true,
    );
    assert.equal(canAccessExecutiveCommandCentre({ roleName: 'Owner', permissions: [] }), true);

    // A broad permission set must not substitute for an owner role.
    for (const roleName of [
      'Technician',
      'Client',
      'Manager',
      'Dispatcher',
      'Accountant',
      'Office Admin',
      'Staff',
    ]) {
      assert.equal(
        canAccessExecutiveCommandCentre({ roleName, permissions: ['*'] }),
        false,
        `${roleName} must be denied`,
      );
      assert.equal(
        canWriteExecutiveCommandCentre({ roleName, permissions: ['*', 'executive:read'] }),
        false,
        `${roleName} must not write`,
      );
      assert.equal(
        canApproveExecutiveCommandCentre({ roleName, permissions: ['*'] }),
        false,
        `${roleName} must not approve`,
      );
      assert.equal(
        canManageExecutiveCommandCentreSettings({ roleName, permissions: ['*'] }),
        false,
        `${roleName} must not manage settings`,
      );
    }

    assert.equal(canAccessExecutiveCommandCentre({ roleName: null, permissions: ['*'] }), false);
  });

  it('never invents financial figures — missing values stay null with a reason', () => {
    const missing = ecMoney(null, 'ZAR', 'No real invoice rows yet.');
    assert.equal(missing.availability, 'unavailable');
    assert.equal(missing.amountCents, null);
    assert.equal(missing.rationale, 'No real invoice rows yet.');

    // A missing figure must never be coerced to zero.
    assert.notEqual(missing.amountCents, 0);

    assert.equal(ecMoney(undefined, 'ZAR', 'x').amountCents, null);
    assert.equal(ecMoney(Number.NaN, 'ZAR', 'x').availability, 'unavailable');

    const present = ecMoney(150_00, 'ZAR', 'unused');
    assert.equal(present.availability, 'available');
    assert.equal(present.amountCents, 150_00);
    assert.equal(present.rationale, '');

    // Zero is a real figure and must stay available.
    assert.equal(ecMoney(0, 'ZAR', 'x').availability, 'available');
    assert.equal(ecMoney(0, 'ZAR', 'x').amountCents, 0);

    assert.equal(ecCount(null, 'no rows').value, null);
    assert.equal(ecCount(4, 'unused').value, 4);
  });

  it('panel availability degrades to partial rather than claiming completeness', () => {
    const ok = ecMoney(1, 'ZAR', '');
    const missing = ecMoney(null, 'ZAR', 'gap');
    assert.equal(ecPanelAvailability([ok, ok]), 'available');
    assert.equal(ecPanelAvailability([ok, missing]), 'partial');
    assert.equal(ecPanelAvailability([missing, missing]), 'unavailable');
    assert.equal(ecPanelAvailability([]), 'unavailable');
  });

  it('risks and opportunities derive only from real signals and never self-resolve', () => {
    const cash: EcCashPanel = {
      availability: 'available',
      cashPositionCents: ecMoney(-5000, 'ZAR', ''),
      incomingPaymentsCents: ecMoney(100, 'ZAR', ''),
      expenseCents: ecMoney(5100, 'ZAR', ''),
      rationale: '',
    };
    const outstanding: EcOutstandingPanel = {
      availability: 'available',
      outstandingReceivableCents: ecMoney(9000, 'ZAR', ''),
      overdueAmountCents: ecMoney(4000, 'ZAR', ''),
      overdueInvoiceCount: 6,
      rationale: '',
    };
    const profit: EcProfitPanel = {
      availability: 'partial',
      revenueCents: ecMoney(10_000, 'ZAR', ''),
      costCents: ecMoney(null, 'ZAR', 'No real unit costs captured.'),
      marginCents: ecMoney(null, 'ZAR', 'Cost data incomplete.'),
      marginBps: null,
      jobCount: 10,
      jobsWithCostData: 3,
      labourCostRationale: 'Labour cost excluded until a real rate exists.',
      rationale: '',
    };
    const jobs: EcJobsPanel = {
      availability: 'available',
      total: 60,
      newCount: 10,
      scheduledCount: 20,
      inProgressCount: 25,
      completedCount: 5,
      cancelledCount: 0,
      openCount: 55,
      rationale: '',
    };
    const fleet: EcFleetPanel = {
      availability: 'available',
      total: 5,
      availableCount: 1,
      inUseCount: 0,
      maintenanceCount: 2,
      outOfServiceCount: 2,
      rationale: '',
    };
    const sales: EcSalesPanel = {
      availability: 'available',
      openOpportunityCount: 0,
      wonOpportunityCount: 0,
      lostOpportunityCount: 0,
      openLeadCount: 7,
      convertedLeadCount: 0,
      openPipelineCents: ecMoney(null, 'ZAR', 'No estimated values recorded.'),
      rationale: '',
    };
    const staff: EcStaffPanel = {
      availability: 'available',
      activeCount: 0,
      inactiveCount: 2,
      total: 2,
      rationale: '',
    };

    const risks = buildEcRisks({ cash, outstanding, profit, jobs, fleet, sales, staff });
    const kinds = risks.map((r) => r.kind);
    assert.ok(kinds.includes('cash_shortfall'));
    assert.ok(kinds.includes('overdue_receivable'));
    assert.ok(kinds.includes('margin_unknown'));
    assert.ok(kinds.includes('job_backlog'));
    assert.ok(kinds.includes('fleet_downtime'));
    assert.ok(kinds.includes('sales_pipeline_stall'));
    assert.ok(kinds.includes('staffing_gap'));
    assert.ok(risks.every((r) => r.autoResolved === false));

    // An unavailable margin must surface as a visibility risk, never a number.
    const marginRisk = risks.find((r) => r.kind === 'margin_unknown');
    assert.ok(marginRisk?.detail.includes('unavailable'));

    const marketing: EcMarketingPanel = {
      availability: 'available',
      total: 3,
      activeCount: 1,
      draftCount: 2,
      completedCount: 0,
      rationale: '',
    };
    const opportunities = buildEcOpportunities({ sales, jobs, fleet, marketing, profit });
    const oppKinds = opportunities.map((o) => o.kind);
    assert.ok(oppKinds.includes('unconverted_lead'));
    assert.ok(oppKinds.includes('marketing_reach'));
    assert.ok(oppKinds.includes('margin_improvement'));
    // Pipeline value is unavailable, so no pipeline opportunity may be claimed.
    assert.ok(!oppKinds.includes('open_pipeline'));
    assert.ok(opportunities.every((o) => o.autoExecuted === false));
  });

  it('settings invariants forbid auto-execution and invented figures', () => {
    const settings = defaultEcSettings();
    assert.equal(settings.autoExecuteActionsEnabled, false);
    assert.equal(settings.inventFinancialFiguresEnabled, false);
    assert.equal(settings.financePanelsEnabled, true);
    assert.equal(settings.riskDetectionEnabled, true);

    const draft = buildEcActionDraft({
      panelLabel: EC_PANEL_LABELS.cash,
      title: 'Review cash position',
      detail: 'Cash position is negative over the window.',
    });
    assert.ok(draft.title.startsWith('Cash position —'));
    assert.ok(draft.body.includes('Owner approval required'));
    assert.ok(draft.body.includes('never executes'));
    assert.ok(draft.body.includes('No figure is invented'));

    assert.ok(isEcPanelKey('revenue'));
    assert.ok(!isEcPanelKey('payroll'));
    assert.ok(!isEcPanelKey(null));

    // Links out to existing surfaces rather than rebuilding them.
    const connections = listEcConnections();
    assert.ok(connections.some((c) => c.href === '/aura/command-centre'));
    assert.ok(connections.some((c) => c.module === 'finance_cashflow_profit'));
    assert.ok(connections.every((c) => c.href.startsWith('/')));
    assert.ok(EC_PRODUCT_COPY.auraCommandCentre.includes('does not rebuild'));
    assert.ok(EC_PRODUCT_COPY.thisLayer.includes('never invented'));
  });

  it('summary reports unavailable panels honestly', () => {
    const revenue: EcRevenuePanel = {
      availability: 'unavailable',
      invoicedCents: ecMoney(null, 'ZAR', 'none'),
      collectedCents: ecMoney(null, 'ZAR', 'none'),
      invoiceCount: 0,
      paymentCount: 0,
      rationale: 'No real invoice or payment rows yet.',
    };
    const profit: EcProfitPanel = {
      availability: 'unavailable',
      revenueCents: ecMoney(null, 'ZAR', 'none'),
      costCents: ecMoney(null, 'ZAR', 'none'),
      marginCents: ecMoney(null, 'ZAR', 'none'),
      marginBps: null,
      jobCount: 0,
      jobsWithCostData: 0,
      labourCostRationale: 'n/a',
      rationale: 'n/a',
    };
    const cash: EcCashPanel = {
      availability: 'unavailable',
      cashPositionCents: ecMoney(null, 'ZAR', 'none'),
      incomingPaymentsCents: ecMoney(null, 'ZAR', 'none'),
      expenseCents: ecMoney(null, 'ZAR', 'none'),
      rationale: 'n/a',
    };
    const jobs: EcJobsPanel = {
      availability: 'unavailable',
      total: 0,
      newCount: 0,
      scheduledCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      openCount: 0,
      rationale: 'No real job rows yet.',
    };
    const summary = buildEcSummary({
      revenue,
      profit,
      cash,
      jobs,
      riskCount: 0,
      opportunityCount: 0,
      unavailableCount: 4,
    });
    assert.ok(summary.includes('Revenue unavailable'));
    assert.ok(summary.includes('never estimated'));
    assert.ok(summary.includes('4 panel(s) report unavailable'));
  });
});
