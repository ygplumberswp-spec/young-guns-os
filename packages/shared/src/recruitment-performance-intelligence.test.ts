import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCapacityImprovementDraft,
  buildHiringDraftProposal,
  buildInterviewDraftProposal,
  buildPerformanceInsightDraft,
  buildRpiPerformanceSnapshot,
  buildRpiPipelineBuckets,
  buildRpiRecruitmentSnapshot,
  buildRpiWorkforcePlanningSnapshot,
  buildTrainingRecommendationDraft,
  buildWorkforceRiskDraft,
  canAccessRecruitmentPerformanceIntelligence,
  canAccessRpiSelfPerformanceView,
  canApproveRpiHiringDrafts,
  canWriteRecruitmentPerformanceIntelligence,
  defaultRpiSettings,
  requiresOwnerExecuteForStage,
  RPI_PRODUCT_COPY,
} from './recruitment-performance-intelligence.js';

describe('recruitment & performance intelligence', () => {
  it('RBAC: Owner/Admin only for recruitment & others performance; Technician/Client denied', () => {
    assert.equal(
      canAccessRecruitmentPerformanceIntelligence({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      true,
    );
    assert.equal(
      canAccessRecruitmentPerformanceIntelligence({
        roleName: 'Admin',
        permissions: ['workforce:read'],
      }),
      true,
    );
    assert.equal(
      canAccessRecruitmentPerformanceIntelligence({
        roleName: 'Technician',
        permissions: ['*'],
      }),
      false,
    );
    assert.equal(
      canAccessRecruitmentPerformanceIntelligence({
        roleName: 'Client',
        permissions: ['workforce:read'],
      }),
      false,
    );
    assert.equal(
      canWriteRecruitmentPerformanceIntelligence({
        roleName: 'Manager',
        permissions: ['workforce:write'],
      }),
      false,
    );
    assert.equal(
      canApproveRpiHiringDrafts({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      true,
    );
    assert.equal(
      canAccessRpiSelfPerformanceView({
        roleName: 'Technician',
        permissions: ['jobs:read'],
      }),
      true,
    );
  });

  it('snapshots stay unavailable without real records — never invent candidates/scores', () => {
    const emptyRecruitment = buildRpiRecruitmentSnapshot({
      candidateCount: 0,
      applicationCount: 0,
      activePipelineCount: 0,
      interviewStageCount: 0,
      hiredCount: 0,
      rejectedCount: 0,
      pendingHiringApprovals: 0,
      pendingInterviewApprovals: 0,
    });
    assert.equal(emptyRecruitment.availability, 'unavailable');
    assert.ok(/not invented/i.test(emptyRecruitment.rationale));

    const emptyPerf = buildRpiPerformanceSnapshot({
      technicianCount: 0,
      skillRecordCount: 0,
      trainingRecordCount: 0,
      jobsCompletedSample: 0,
      timesheetHoursSample: 0,
    });
    assert.equal(emptyPerf.availability, 'unavailable');

    const emptyPlan = buildRpiWorkforcePlanningSnapshot({
      activeTechnicianCount: 0,
      openJobAssignmentCount: 0,
      interviewPipelineCount: 0,
      timesheetHoursSample: 0,
    });
    assert.equal(emptyPlan.availability, 'unavailable');
  });

  it('hiring + interview drafts never auto-hire', () => {
    assert.equal(requiresOwnerExecuteForStage('hired'), true);
    const draft = buildHiringDraftProposal({
      candidateName: 'Ada',
      fromStage: 'interview',
      toStage: 'hired',
    });
    assert.ok(/Owner approval/i.test(draft.body));
    assert.ok(/No automatic hiring/i.test(draft.body));
    const interview = buildInterviewDraftProposal({ candidateName: 'Ada' });
    assert.ok(/Does not auto-advance hiring/i.test(interview.body));
  });

  it('AURA capacity/risk/training drafts are recommendations only', () => {
    const capacity = buildCapacityImprovementDraft({
      openJobAssignmentCount: 4,
      activeTechnicianCount: 2,
    });
    assert.ok(/Recommendation only/i.test(capacity.body));
    const risk = buildWorkforceRiskDraft({ callbackCount: 1, interviewBacklog: 2 });
    assert.ok(/never auto-executes/i.test(risk.body));
    const training = buildTrainingRecommendationDraft({
      displayName: 'Tech A',
      gapNote: 'no gas certification recorded',
    });
    assert.ok(/Draft only/i.test(training.body));
    const perf = buildPerformanceInsightDraft({
      displayName: 'Tech A',
      jobsCompleted: 2,
      callbacks: 0,
      skillCount: 1,
      timesheetHours: 12,
    });
    assert.ok(/timesheet hour/i.test(perf.body));
  });

  it('pipeline buckets + settings invariants', () => {
    const buckets = buildRpiPipelineBuckets([
      { id: '1', status: 'interview' },
      { id: '2', status: 'interview' },
    ]);
    assert.equal(buckets.find((b) => b.stage === 'interview')?.count, 2);
    assert.ok(RPI_PRODUCT_COPY.thisLayer.includes('No automatic hiring'));
    const settings = defaultRpiSettings();
    assert.equal(settings.autoHiringEnabled, false);
    assert.equal(settings.inventScoresEnabled, false);
    assert.equal(settings.interviewWorkflowEnabled, true);
    assert.equal(settings.auraSuggestionsEnabled, true);
  });
});
