import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHrIntelEmploymentSummary,
  buildHrIntelPayrollSnapshot,
  buildHrIntelQualificationComplianceRows,
  buildHrIntelQualificationComplianceSnapshot,
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
    assert.ok(connections.some((c) => c.target === 'compliance' && c.availability === 'unavailable'));
  });

  it('qualification compliance derives from real certification expiry only', () => {
    const now = new Date('2026-08-03T00:00:00.000Z');
    const rows = buildHrIntelQualificationComplianceRows({
      now,
      qualifications: [
        {
          userId: 'u1',
          displayName: 'Ada',
          certificationId: 'c1',
          certificationKey: 'wireman',
          name: 'Wireman Licence',
          expiresAt: '2026-07-01T00:00:00.000Z',
        },
        {
          userId: 'u2',
          displayName: 'Grace',
          certificationId: 'c2',
          certificationKey: 'working-at-height',
          name: 'Working at Height',
          expiresAt: '2026-09-01T00:00:00.000Z',
        },
        {
          userId: 'u3',
          displayName: 'Linus',
          certificationId: 'c3',
          certificationKey: 'first-aid',
          name: 'First Aid',
          expiresAt: '2027-06-01T00:00:00.000Z',
        },
        {
          userId: 'u4',
          displayName: 'Edsger',
          certificationId: 'c4',
          certificationKey: 'no-expiry',
          name: 'Trade Test',
          expiresAt: null,
        },
      ],
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.state, 'expired');
    assert.equal(rows[1]!.state, 'expiring_soon');

    const snapshot = buildHrIntelQualificationComplianceSnapshot({
      trackedQualificationCount: 4,
      withExpiryCount: 3,
      rows,
    });
    assert.equal(snapshot.availability, 'available');
    assert.equal(snapshot.expiredCount, 1);
    assert.equal(snapshot.expiringSoonCount, 1);
    assert.equal(snapshot.affectedEmployeeCount, 2);

    assert.equal(
      buildHrIntelQualificationComplianceSnapshot({
        trackedQualificationCount: 0,
        withExpiryCount: 0,
        rows: [],
      }).availability,
      'unavailable',
    );
    assert.equal(
      buildHrIntelQualificationComplianceSnapshot({
        trackedQualificationCount: 5,
        withExpiryCount: 0,
        rows: [],
      }).availability,
      'unavailable',
    );

    const connections = listHrIntelConnections({ qualificationComplianceAvailable: true });
    const compliance = connections.find((c) => c.target === 'compliance');
    assert.equal(compliance?.href, '/legal-compliance');
    assert.equal(compliance?.availability, 'available');

    const drafts = buildHrIntelRecommendationDrafts({
      skillGaps: [],
      trainingNeeds: [],
      techniciansAvailable: 0,
      techniciansAssigned: 0,
      openJobAssignments: 0,
      distinctSkillCount: 0,
      activeTechnicianCount: 0,
      qualificationComplianceRows: rows,
    });
    const complianceDraft = drafts.find((d) => /Qualification compliance/.test(d.title));
    assert.ok(complianceDraft);
    assert.match(complianceDraft!.body, /never auto-suspends work/i);
  });
});
