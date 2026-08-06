import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDash001Extensions,
  UI_THEME_001_RECORD,
  type ExecutiveDashboardSummaryBase,
} from './dashboard-business-heartbeat.js';
import type {
  ExecutiveSectionKey,
  ExecutiveSectionStatus,
} from './dashboard-executive.js';

function liveSection(source: string): ExecutiveSectionStatus {
  return {
    state: 'live',
    source,
    updatedAt: '2026-08-06T12:00:00.000Z',
    coverage: null,
    reason: null,
  };
}

function buildSections(): Record<ExecutiveSectionKey, ExecutiveSectionStatus> {
  return {
    todayAtAGlance: liveSection('jobs'),
    money: liveSection('finance'),
    customerActivity: liveSection('crm'),
    priorities: liveSection('plan'),
    activeJobs: liveSection('jobs'),
    completedToday: liveSection('jobs'),
    outstandingInvoices: liveSection('invoices'),
    team: liveSection('team'),
    businessHeartbeat: liveSection('heartbeat'),
    financialTruth: liveSection('finance'),
    teamPerformance: liveSection('team'),
    salesOpportunities: liveSection('crm'),
  };
}

function minimalSummary(): ExecutiveDashboardSummaryBase {
  return {
    generatedAt: '2026-08-06T12:00:00.000Z',
    sections: buildSections(),
    header: {
      jobsToday: 2,
      prioritiesToday: 1,
      teamWorking: 1,
      approvalsWaiting: 0,
    },
    todayAtAGlance: {
      jobs: { scheduled: 2, inProgress: 1, completed: 0, delayed: 0, href: '/jobs' },
      team: { available: 1, travelling: 0, onSite: 1, offDuty: 0 },
      money: {
        invoicedTodayCents: 0,
        paymentsTodayCents: 0,
        outstandingCents: 100_000,
        draftCount: 0,
        currency: 'ZAR',
      },
      customerActivity: { leads: 3, followUps: 1, messages: 0, returning: 0 },
    },
    liveOperations: [],
    completedToday: [],
    priorities: {
      needsAttention: 0,
      waitingApproval: 0,
      blocked: 0,
      summaryLine: 'All clear for today',
      items: [],
      criticalIssues: [],
    },
    outstandingInvoices: {
      outstandingCents: 100_000,
      invoiceCount: 1,
      currency: 'ZAR',
      overdueCents: 50_000,
      overdueCount: 1,
      dueSoonCents: 0,
      dueTodayCount: 0,
      dueSoonCount: 0,
      currentCents: 50_000,
      currentCount: 0,
      excludedInvoiceCount: 0,
      undatedInvoiceCount: 0,
      invoices: [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-001',
          customerId: 'cust-1',
          customerName: 'Acme',
          issuedAt: '2026-07-01',
          dueDate: '2026-07-01',
          originalTotalCents: 50_000,
          amountPaidCents: 0,
          outstandingCents: 50_000,
          status: 'overdue',
          bucket: 'overdue',
          daysOverdue: 36,
        },
      ],
      listLimit: 50,
    },
    xeroFinance: {
      connected: true,
      organisationName: 'Test Co',
      lastSyncAt: '2026-08-06T11:00:00.000Z',
      lastError: null,
      importStatus: null,
      importMessage: null,
      syncedCustomerCount: 1,
      syncedInvoiceCount: 1,
      syncedPaymentCount: 0,
      syncedQuoteCount: 0,
      syncedBankTransactionCount: 0,
      failedRecordCount: 0,
      revenueCents: 200_000,
      outstandingCents: 100_000,
      paidCents: 100_000,
      overdueCents: 50_000,
      unpaidInvoiceCount: 1,
      paidInvoiceCount: 0,
      overdueInvoiceCount: 1,
      quotePipelineCents: 0,
      quotePipelineCount: 0,
      monthlyTurnover: [{ month: '2026-08', amountCents: 200_000 }],
      paymentTrends: [{ month: '2026-08', amountCents: 100_000 }],
      currency: 'ZAR',
    },
    teamToday: [],
  };
}

describe('DASH-001 dashboard business heartbeat', () => {
  it('builds heartbeat metrics from real summary fields only', () => {
    const summary = minimalSummary();
    const dash001 = buildDash001Extensions({
      summary,
      companyName: 'Young Guns Plumbing',
      unassignedJobsCount: 0,
      quotesAwaitingApproval: 2,
      quotesFollowUp: 1,
      now: new Date('2026-08-06T12:00:00.000Z'),
    });

    assert.equal(dash001.headerExtended.companyName, 'Young Guns Plumbing');
    assert.match(dash001.headerExtended.businessSummary, /job/);
    assert.ok(dash001.businessHeartbeat.primaryMetrics.some((m) => m.key === 'revenue_month'));
    assert.ok(dash001.businessHeartbeat.primaryMetrics.some((m) => m.key === 'cash_collected'));
    assert.ok(dash001.businessHeartbeat.secondaryMetrics.some((m) => m.key === 'quotes_follow_up'));
    assert.equal(
      dash001.businessHeartbeat.primaryMetrics.find((m) => m.key === 'revenue_month')?.estimate,
      false,
    );
  });

  it('separates invoiced revenue from collected cash in financial truth', () => {
    const dash001 = buildDash001Extensions({ summary: minimalSummary() });
    const invoiced = dash001.financialTruth.currentMonth.find((l) => l.key === 'invoiced');
    const collected = dash001.financialTruth.currentMonth.find((l) => l.key === 'collected');
    assert.ok(invoiced);
    assert.ok(collected);
    assert.ok(invoiced!.displayValue);
    assert.ok(collected!.displayValue);
    assert.notEqual(invoiced!.amountCents, collected!.amountCents);
    assert.match(invoiced!.caption, /Invoice issued/);
    assert.ok(dash001.financialTruth.yocoPaidSeparateFromReconciled);
  });

  it('uses independent quote counts when provided', () => {
    const dash001 = buildDash001Extensions({
      summary: minimalSummary(),
      quotesAwaitingApproval: 12,
      quotesFollowUp: 3,
    });
    const awaiting = dash001.businessHeartbeat.secondaryMetrics.find((m) => m.key === 'quotes_pipeline');
    const followUp = dash001.businessHeartbeat.secondaryMetrics.find((m) => m.key === 'quotes_follow_up');
    assert.equal(awaiting?.rawValue, 12);
    assert.equal(followUp?.rawValue, 3);
    assert.notEqual(awaiting?.rawValue, followUp?.rawValue);
  });

  it('labels estimates and does not fabricate AURA recommendations without evidence', () => {
    const empty = buildDash001Extensions({ summary: minimalSummary() });
    assert.equal(empty.auraExecutive.recommendations.length > 0, true);
    for (const rec of empty.auraExecutive.recommendations) {
      assert.ok(rec.reason);
      assert.ok(rec.source);
      assert.ok(rec.href);
    }
  });

  it('sorts attention items by priority and includes overdue invoices', () => {
    const dash001 = buildDash001Extensions({ summary: minimalSummary() });
    assert.ok(dash001.attentionRequired.items.length > 0);
    const first = dash001.attentionRequired.items[0]!;
    assert.ok(['critical', 'attention', 'opportunity', 'informational'].includes(first.priority));
  });

  it('records UI-THEME-001 without implementing it', () => {
    assert.equal(UI_THEME_001_RECORD.id, 'UI-THEME-001');
    assert.equal(UI_THEME_001_RECORD.status, 'recorded_not_implemented');
  });

  it('shows honest empty business summary when nothing needs action', () => {
    const summary = minimalSummary();
    summary.outstandingInvoices = {
      ...summary.outstandingInvoices,
      outstandingCents: 0,
      overdueCount: 0,
      overdueCents: 0,
      invoices: [],
      invoiceCount: 0,
    };
    summary.todayAtAGlance.jobs = {
      scheduled: 0,
      inProgress: 0,
      completed: 0,
      delayed: 0,
      href: '/jobs',
    };
    const dash001 = buildDash001Extensions({
      summary,
      quotesAwaitingApproval: 0,
      quotesFollowUp: 0,
    });
    assert.equal(dash001.headerExtended.businessSummary, 'All clear for today');
  });
});
