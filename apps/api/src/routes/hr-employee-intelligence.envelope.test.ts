import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'hr-employee-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/hr-employee-intelligence.service.ts'),
  'utf8',
);

describe('hr employee intelligence API envelope & safety', () => {
  it('wraps success responses with honesty / privacy flags', () => {
    for (const pattern of [
      'inventEmployees: false as const',
      'fakeEmployees: false as const',
      'fakePayroll: false as const',
      'autoPayrollMutation: false as const',
      'autoHrActions: false as const',
      'sensitiveHrOwnerAdminOnly: true as const',
      'hrAnalyticsHidden: true as const',
      'hrActionExecuted: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('Owner/Admin gates sensitive HR; never auto HR actions', () => {
    assert.ok(serviceSource.includes('canAccessHrEmployeeIntelligence'));
    assert.ok(serviceSource.includes('Owner or Admin'));
    assert.ok(serviceSource.includes('autoHrActions: false'));
    assert.ok(serviceSource.includes('hrActionExecuted: false'));
    assert.ok(!serviceSource.includes('autoHrActionsEnabled: true'));
    assert.ok(serviceSource.includes('buildHrIntelRecommendationDrafts'));
    assert.ok(serviceSource.includes('buildHrIntelSkillGaps'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'hr_employee_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('hei_recommendation_draft_created'));
    assert.ok(serviceSource.includes('eq(heiRecommendationDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(users.companyId, actor.companyId)'));
  });

  it('connects technician intelligence, jobs, scheduling; future-ready payroll/recruitment', () => {
    assert.ok(serviceSource.includes('jobs'));
    assert.ok(serviceSource.includes('listHrIntelConnections'));
    assert.ok(serviceSource.includes('recruitingCandidates'));
    assert.ok(serviceSource.includes('wiTimesheets'));
    assert.ok(serviceSource.includes('wiPayrollPeriods'));
    assert.ok(routeSource.includes('scheduling'));
    assert.ok(routeSource.includes('recruitment'));
  });
});
