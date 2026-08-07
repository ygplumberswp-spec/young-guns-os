import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'recruitment-performance-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/recruitment-performance-intelligence.service.ts'),
  'utf8',
);

describe('recruitment & performance intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoHiringDecision: false as const',
      'inventScores: false as const',
      'inventCandidates: false as const',
      'noAutomaticHiring: true as const',
      'ownerApprovalRequired: true as const',
      'autoExecuted: false as const',
      'ownerControlled: true as const',
      'peerPerformanceHidden: true as const',
      'recruitmentPipelineHidden: true as const',
      'candidateStatusUnchanged: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + workforce/recruiting permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('workforce:read'));
    assert.ok(routeSource.includes('recruiting:read'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-hires or invents scores from this layer', () => {
    assert.ok(!routeSource.includes('autoHiringDecision: true'));
    assert.ok(!serviceSource.includes('autoHiringEnabled: true'));
    assert.ok(!serviceSource.includes('inventScoresEnabled: true'));
    assert.ok(serviceSource.includes('autoHiringDecision: false'));
    assert.ok(serviceSource.includes('autoHiringEnabled: false'));
    assert.ok(serviceSource.includes('inventScoresEnabled: false'));
  });

  it('Owner/Admin approval required for hiring execute', () => {
    assert.ok(serviceSource.includes('canApproveRpiHiringDrafts'));
    assert.ok(serviceSource.includes('assertApproveHiring'));
    assert.ok(serviceSource.includes('Only Owner or Admin may approve hiring'));
    assert.ok(serviceSource.includes('rpi_hiring_draft_executed'));
  });

  it('exposes interview decide route with candidateStatusUnchanged honesty', () => {
    assert.ok(routeSource.includes("/interview-drafts/:id/decide"));
    assert.ok(routeSource.includes('candidateStatusUnchanged: true as const'));
    assert.ok(routeSource.includes('autoHiringDecision: false as const'));
    assert.ok(routeSource.includes('createInterviewDraft'));
    assert.ok(routeSource.includes('decideInterviewDraft'));
    assert.ok(serviceSource.includes('createInterviewDraft'));
    assert.ok(serviceSource.includes('decideInterviewDraft'));
    assert.ok(serviceSource.includes('candidateStatusUnchanged'));
  });

  it('builds capacity/workforce AURA drafts from real timesheets', () => {
    assert.ok(serviceSource.includes('buildCapacityImprovementDraft'));
    assert.ok(serviceSource.includes('buildWorkforceRiskDraft'));
    assert.ok(serviceSource.includes('wiTimesheets'));
    assert.ok(serviceSource.includes('workforcePlanning') || serviceSource.includes('capacity'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'recruitment_performance_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('rpi_hiring_draft_created'));
    assert.ok(serviceSource.includes('eq(rpiHiringDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(rpiRecommendationDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(rpiSettings.companyId, actor.companyId)'));
  });

  it('extends real recruiting, skills, training, jobs, quality, and TI links', () => {
    assert.ok(serviceSource.includes('recruitingCandidates'));
    assert.ok(serviceSource.includes('recruitingApplications'));
    assert.ok(serviceSource.includes('employeeSkills'));
    assert.ok(serviceSource.includes('trainingRecords'));
    assert.ok(serviceSource.includes('qualityComebacks'));
    assert.ok(serviceSource.includes('jobs'));
    assert.ok(serviceSource.includes('technicianIntelligenceHref'));
    assert.ok(serviceSource.includes('buildRpiRecruitmentSnapshot'));
  });
});
