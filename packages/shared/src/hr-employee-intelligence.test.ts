import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHrIntelEmploymentSummary,
  buildHrIntelPayrollSnapshot,
  buildHrIntelRecommendationDrafts,
  buildHrIntelSkillGaps,
  buildHrIntelSkillsIntelligenceSnapshot,
  buildHrIntelTimesheetSnapshot,
  buildHrIntelWorkforceAvailabilitySnapshot,
  buildHrIntelWorkforceSnapshot,
  canAccessHrEmployeeIntelligence,
  canAccessHrEmployeeSelfView,
  defaultHrIntelSettings,
  deriveHrIntelAvailabilitySignal,
  listHrIntelConnections,
} from './hr-employee-intelligence.js';

describe('hr employee intelligence foundation', () => {
  it('RBAC Owner/Admin only; Technician/Client/Manager denied', () => {
    assert.equal(canAccessHrEmployeeIntelligence({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(canAccessHrEmployeeIntelligence({ roleName: 'Admin', permissions: [] }), true);
    assert.equal(
      canAccessHrEmployeeIntelligence({
        roleName: 'Manager',
        permissions: ['workforce_intelligence:manage'],
      }),
      false,
    );
    assert.equal(canAccessHrEmployeeIntelligence({ roleName: 'Technician', permissions: ['*'] }), false);
    assert.equal(canAccessHrEmployeeIntelligence({ roleName: 'Client', permissions: [] }), false);
    assert.equal(canAccessHrEmployeeSelfView({ roleName: 'Technician', permissions: [] }), true);
    assert.equal(canAccessHrEmployeeSelfView({ roleName: 'Client', permissions: [] }), false);
  });

  it('skills/capacity recommendations are drafts only', () => {
    const gaps = buildHrIntelSkillGaps({
      employees: [
        {
          userId: 'u1',
          displayName: 'Ada',
          roleName: 'Technician',
          isActive: true,
          isTechnicianRole: true,
          skillCount: 0,
          qualificationCount: 0,
          plannedTrainingCount: 0,
        },
      ],
    });
    assert.equal(gaps[0]!.gapKind, 'no_skills');
    const drafts = buildHrIntelRecommendationDrafts({
      skillGaps: gaps,
      trainingNeeds: [],
      techniciansAvailable: 0,
      techniciansAssigned: 2,
      openJobAssignments: 3,
      distinctSkillCount: 1,
      activeTechnicianCount: 2,
    });
    assert.ok(drafts.some((d) => d.kind === 'skill_gap' || d.kind === 'capacity_issue'));
    assert.ok(drafts.every((d) => /recommendation|draft|never auto/i.test(d.body)));
    assert.equal(defaultHrIntelSettings().autoHrActionsEnabled, false);
    assert.equal(deriveHrIntelAvailabilitySignal({ isActive: true, assignedOpenJobCount: 0 }), 'available');
  });

  it('honest unavailable + scheduling/recruitment connections', () => {
    assert.equal(
      buildHrIntelWorkforceSnapshot({
        activeUserCount: 0,
        inactiveUserCount: 0,
        technicianCount: 0,
        profileCount: 0,
        skillRecordCount: 0,
        qualificationCount: 0,
        trainingRecordCount: 0,
      }).availability,
      'unavailable',
    );
    assert.equal(
      buildHrIntelWorkforceAvailabilitySnapshot({
        activeEmployeeCount: 0,
        techniciansAvailable: 0,
        techniciansAssigned: 0,
        openJobAssignments: 0,
      }).availability,
      'unavailable',
    );
    assert.equal(
      buildHrIntelSkillsIntelligenceSnapshot({
        distinctSkillCount: 0,
        skillGapCount: 0,
        trainingNeedCount: 0,
        skillRecordCount: 0,
      }).availability,
      'unavailable',
    );
    assert.equal(buildHrIntelTimesheetSnapshot({ timesheetCount: 0 }).availability, 'unavailable');
    assert.equal(
      buildHrIntelPayrollSnapshot({ periodCount: 0, providerAdapterCount: 0 }).availability,
      'unavailable',
    );
    assert.equal(buildHrIntelEmploymentSummary({ hasProfile: false }).availability, 'unavailable');
    const connections = listHrIntelConnections({
      timesheetsAvailable: false,
      payrollAvailable: false,
      recruitmentAvailable: false,
    });
    assert.ok(connections.some((c) => c.target === 'scheduling' && c.status === 'available_link'));
    assert.ok(connections.some((c) => c.target === 'jobs'));
    assert.ok(connections.some((c) => c.target === 'technician_intelligence'));
    assert.ok(connections.some((c) => c.target === 'recruitment' && c.availability === 'unavailable'));
  });
});
