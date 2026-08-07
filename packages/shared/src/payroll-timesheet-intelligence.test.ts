import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildApprovalBacklogInsightDraft,
  buildAuraWorkforceInsightDraft,
  buildCapacityIssueDraft,
  buildLabourCostGapInsightDraft,
  buildOvertimeInsightDraft,
  buildProductivityInsightDraft,
  buildPtiCostForecastSnapshot,
  buildPtiHoursSnapshot,
  buildPtiLabourCostSnapshot,
  buildPtiPayrollSummarySnapshot,
  buildSchedulingOpportunityDraft,
  canAccessPayrollTimesheetIntelligence,
  canAccessPtiSelfTimesheetView,
  canApprovePtiInsightDrafts,
  canManagePtiSettings,
  canWritePayrollTimesheetIntelligence,
  defaultPtiSettings,
  listPtiConnections,
  parseHours,
  PAYROLL_TIMESHEET_INTELLIGENCE_KEY,
  PTI_PRODUCT_COPY,
} from './payroll-timesheet-intelligence.js';

describe('payroll timesheet intelligence foundation', () => {
  it('RBAC: Owner/Admin only for sensitive surface; Technician/Client/Manager denied', () => {
    assert.equal(PAYROLL_TIMESHEET_INTELLIGENCE_KEY, 'payroll-timesheet-intelligence');
    assert.equal(
      canAccessPayrollTimesheetIntelligence({
        roleName: 'Company Owner',
        permissions: [],
      }),
      true,
    );
    assert.equal(
      canAccessPayrollTimesheetIntelligence({
        roleName: 'Admin',
        permissions: ['workforce:read'],
      }),
      true,
    );
    assert.equal(
      canAccessPayrollTimesheetIntelligence({
        roleName: 'Manager',
        permissions: ['workforce:read', 'workforce_intelligence:manage', '*'],
      }),
      false,
    );
    assert.equal(
      canAccessPayrollTimesheetIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'workforce:write'],
      }),
      false,
    );
    assert.equal(
      canAccessPayrollTimesheetIntelligence({
        roleName: 'Client',
        permissions: ['workforce:read'],
      }),
      false,
    );
    assert.equal(
      canWritePayrollTimesheetIntelligence({
        roleName: 'Owner',
        permissions: [],
      }),
      true,
    );
    assert.equal(
      canApprovePtiInsightDrafts({
        roleName: 'Admin',
        permissions: [],
      }),
      true,
    );
    assert.equal(
      canManagePtiSettings({
        roleName: 'Platform Owner',
        permissions: [],
      }),
      true,
    );
  });

  it('self view allows technicians; clients denied', () => {
    assert.equal(
      canAccessPtiSelfTimesheetView({ roleName: 'Technician', permissions: [] }),
      true,
    );
    assert.equal(canAccessPtiSelfTimesheetView({ roleName: 'Client', permissions: [] }), false);
  });

  it('hours/labour snapshots stay unavailable or partial without wage rate — never invent wages', () => {
    const emptyHours = buildPtiHoursSnapshot({
      timesheetCount: 0,
      mobileEntryCount: 0,
      totalStandardHours: 0,
      totalOvertimeHours: 0,
      totalTravelHours: 0,
      pendingApprovalCount: 0,
    });
    assert.equal(emptyHours.availability, 'unavailable');
    assert.ok(/not invented/i.test(emptyHours.rationale));

    const labourNoMinutes = buildPtiLabourCostSnapshot({
      labourMinutes: 0,
      hourlyRateCents: null,
    });
    assert.equal(labourNoMinutes.availability, 'unavailable');
    assert.equal(labourNoMinutes.labourCostCents, null);
    assert.equal(labourNoMinutes.hourlyRateCents, null);

    const labourPartial = buildPtiLabourCostSnapshot({
      labourMinutes: 480,
      hourlyRateCents: null,
    });
    assert.equal(labourPartial.availability, 'partial');
    assert.equal(labourPartial.labourCostCents, null);
    assert.ok(/not invented/i.test(labourPartial.rationale));

    const payrollEmpty = buildPtiPayrollSummarySnapshot({
      periodCount: 0,
      batchCount: 0,
      exportedBatchCount: 0,
      earningsTotalCents: 0,
    });
    assert.equal(payrollEmpty.availability, 'unavailable');

    const forecast = buildPtiCostForecastSnapshot({
      recentWeekHours: 38,
      priorWeekHours: 40,
      hourlyRateCents: null,
    });
    assert.equal(forecast.availability, 'partial');
    assert.equal(forecast.forecastLabourCostCents, null);
    assert.ok(/not invented/i.test(forecast.rationale));
  });

  it('insight drafts and settings never invent wages; connections include HR and workforce', () => {
    const ot = buildOvertimeInsightDraft({
      userName: 'Alex Tech',
      overtimeHours: 10,
      thresholdHours: 8,
    });
    assert.equal(ot.kind, 'overtime');
    assert.ok(/not invented|Owner approval/i.test(ot.body));

    const backlog = buildApprovalBacklogInsightDraft({ pendingCount: 3 });
    assert.equal(backlog.kind, 'approval_backlog');
    assert.ok(/never auto-approved/i.test(backlog.body));

    const gap = buildLabourCostGapInsightDraft({ labourMinutes: 1200 });
    assert.equal(gap.kind, 'labour_cost');
    assert.ok(/never invents wages/i.test(gap.body));

    const settings = defaultPtiSettings();
    assert.equal(settings.inventWagesEnabled, false);
    assert.equal(settings.autoPayrollMutationEnabled, false);

    const connections = listPtiConnections({ hrFoundationPresent: true });
    assert.ok(connections.some((c) => c.href === '/hr-employee-intelligence'));
    assert.ok(connections.some((c) => c.href === '/workforce-intelligence'));
    assert.ok(PTI_PRODUCT_COPY.thisLayer.includes('No invented wages'));
    assert.equal(parseHours('8.5'), 8.5);
    assert.equal(parseHours(null), 0);
  });
});

describe('AURA workforce insight draft builders', () => {
  it('buildAuraWorkforceInsightDraft maps kinds to valid targets with draft-only copy', () => {
    const overtimeTrend = buildAuraWorkforceInsightDraft({
      kind: 'overtime_trend',
      title: 'Overtime trend rising',
      supportingSignals: ['12h overtime this week', '3 technicians over threshold'],
      recommendation: 'Review roster before next dispatch cycle.',
    });
    assert.equal(overtimeTrend.target, 'scheduling');
    assert.equal(overtimeTrend.title, 'Overtime trend rising');
    assert.ok(/draft recommendation only/i.test(overtimeTrend.insight));
    assert.ok(/Not invented wages/i.test(overtimeTrend.insight));
    assert.ok(/12h overtime this week/.test(overtimeTrend.insight));

    const labourRisk = buildAuraWorkforceInsightDraft({
      kind: 'labour_cost_risk',
      title: 'Labour cost visibility gap',
      supportingSignals: ['480 labour minutes without wage rate'],
      recommendation: 'Connect payroll provider before cost planning.',
    });
    assert.equal(labourRisk.target, 'payroll');

    const productivity = buildAuraWorkforceInsightDraft({
      kind: 'productivity_pattern',
      title: 'Low job-linked hours',
      supportingSignals: ['40% job-linked ratio'],
      recommendation: 'Audit non-job time entries.',
    });
    assert.equal(productivity.target, 'timesheets');

    const scheduling = buildAuraWorkforceInsightDraft({
      kind: 'scheduling_opportunity',
      title: 'Clear approval backlog',
      supportingSignals: ['5 pending approvals'],
      recommendation: 'Approve timesheets before scheduling changes.',
    });
    assert.equal(scheduling.target, 'scheduling');

    const capacity = buildAuraWorkforceInsightDraft({
      kind: 'capacity_issue',
      title: 'Capacity pressure — 10h overtime',
      supportingSignals: ['overtime_hours=10', 'pending_approvals=3'],
      recommendation: 'Review roster capacity before dispatch load.',
    });
    assert.equal(capacity.target, 'scheduling');
    assert.ok(/capacity_issue|capacity issue/i.test(capacity.insight));
  });

  it('buildProductivityInsightDraft uses job_time kind within schema enum', () => {
    const draft = buildProductivityInsightDraft({
      userName: 'Sam Tech',
      jobLinkedHours: 32,
      totalHours: 40,
    });
    assert.equal(draft.kind, 'job_time');
    assert.ok(/Sam Tech/.test(draft.title));
    assert.ok(/80% job-linked/.test(draft.body));
    assert.ok(/not invented hours/i.test(draft.body));
    assert.ok(/Owner approval required/i.test(draft.body));
  });

  it('buildCapacityIssueDraft surfaces capacity pressure without mutations', () => {
    const draft = buildCapacityIssueDraft({
      pendingApprovalCount: 3,
      overtimeHours: 10,
      activeTechnicianCount: 4,
    });
    assert.ok(/Capacity pressure/i.test(draft.title));
    assert.ok(/does not auto-reschedule/i.test(draft.body));
    assert.ok(/Owner approval required/i.test(draft.recommendation));
  });

  it('buildSchedulingOpportunityDraft picks approval_backlog or overtime kind', () => {
    const backlog = buildSchedulingOpportunityDraft({
      pendingApprovalCount: 4,
      overtimeHours: 6,
    });
    assert.equal(backlog.kind, 'approval_backlog');
    assert.ok(/never auto-approved/i.test(backlog.body));
    assert.ok(/4 timesheet/.test(backlog.body));

    const overtime = buildSchedulingOpportunityDraft({
      pendingApprovalCount: 0,
      overtimeHours: 12,
    });
    assert.equal(overtime.kind, 'overtime');
    assert.ok(/12h overtime/.test(overtime.body));
    assert.ok(/not an automatic schedule/i.test(overtime.body));
  });
});
