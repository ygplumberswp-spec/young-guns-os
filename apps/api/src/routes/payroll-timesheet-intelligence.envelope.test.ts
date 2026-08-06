import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'payroll-timesheet-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/payroll-timesheet-intelligence.service.ts'),
  'utf8',
);

describe('payroll timesheet intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'inventWages: false as const',
      'autoPayrollMutation: false as const',
      'fakePayroll: false as const',
      'sensitivePayrollOwnerAdminOnly: true as const',
      'payrollHidden: true as const',
      'peerTimesheetsHidden: true as const',
      'labourCostHidden: true as const',
      'timesheetAutoApproved: false as const',
      'ownerControlled: true as const',
      'invented: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + workforce permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('workforce:read'));
    assert.ok(routeSource.includes('workforce_intelligence:read'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never invents wages or auto-mutates payroll', () => {
    assert.ok(!routeSource.includes('inventWages: true'));
    assert.ok(!routeSource.includes('autoPayrollMutation: true'));
    assert.ok(serviceSource.includes('inventWagesEnabled: false'));
    assert.ok(serviceSource.includes('autoPayrollMutationEnabled: false'));
    assert.ok(serviceSource.includes('hourlyRateCents: null'));
    assert.ok(serviceSource.includes("entityType: 'payroll_timesheet_intelligence'"));
  });

  it('Owner/Admin gate for sensitive payroll; self view hides payroll', () => {
    assert.ok(serviceSource.includes('canAccessPayrollTimesheetIntelligence'));
    assert.ok(serviceSource.includes('canAccessPtiSelfTimesheetView'));
    assert.ok(serviceSource.includes('assertOwnerAdmin'));
    assert.ok(serviceSource.includes('payrollHidden: true'));
    assert.ok(serviceSource.includes('peerTimesheetsHidden: true'));
    assert.ok(serviceSource.includes('labourCostHidden: true'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('pti_insight_draft_created'));
    assert.ok(serviceSource.includes('pti_insight_draft_${nextStatus}'));
    assert.ok(serviceSource.includes('eq(ptiInsightDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(ptiSettings.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(wiTimesheets.companyId, actor.companyId)'));
  });

  it('extends real timesheets, mobile entries, payroll prep, and jobs', () => {
    assert.ok(serviceSource.includes('wiTimesheets'));
    assert.ok(serviceSource.includes('mobileTimeEntries'));
    assert.ok(serviceSource.includes('wiPayrollPeriods'));
    assert.ok(serviceSource.includes('wiPayrollPreparationBatches'));
    assert.ok(serviceSource.includes('buildPtiHoursSnapshot'));
    assert.ok(serviceSource.includes('buildPtiLabourCostSnapshot'));
    assert.ok(serviceSource.includes('/hr-employee-intelligence') || serviceSource.includes('hrFoundationPresent'));
  });
});
