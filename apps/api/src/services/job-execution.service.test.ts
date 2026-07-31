import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DatabaseClient } from '@titan/db';
import {
  ACTION_TARGET_PHASE,
  availableActionsForPhase,
  documentMatchesPhase,
  getJobIdsForUserIncludingCrew,
  hasStoredPhotoEvidence,
  hasStoredSignatureEvidence,
  toCrewMemberSummary,
  toMaterialLineSummary,
  toVariationSummary,
  toVehicleAssignmentSummary,
  userHasJobAccess,
} from './job-execution.service.js';

/**
 * Pure-logic + fake-db coverage that does not require a live database.
 * Full transactional flows (assignCrew, transition, completeGated) are covered
 * by the disposable staging verification scripts alongside the migration.
 */
describe('availableActionsForPhase', () => {
  it('excludes the office-only reopen action', () => {
    const actions = availableActionsForPhase('completed');
    assert.equal(actions.includes('reopen'), false);
  });

  it('lists actions reachable from assigned', () => {
    const actions = availableActionsForPhase('assigned');
    assert.deepEqual(actions.sort(), ['accept', 'en_route'].sort());
  });

  it('lists actions reachable from in_progress', () => {
    const actions = availableActionsForPhase('in_progress');
    assert.deepEqual(
      actions.sort(),
      ['pause', 'await_customer', 'await_parts', 'await_approval', 'ready_to_complete', 'complete'].sort(),
    );
  });
});

describe('ACTION_TARGET_PHASE', () => {
  it('maps every workflow action to a resulting phase', () => {
    for (const [action, phase] of Object.entries(ACTION_TARGET_PHASE)) {
      assert.equal(typeof phase, 'string', `${action} should map to a phase`);
    }
  });
});

describe('documentMatchesPhase', () => {
  it('prefers explicit metadata.phase over title text', () => {
    const doc = { title: 'Random photo', metadata: { phase: 'before' } };
    assert.equal(documentMatchesPhase(doc, 'before'), true);
    assert.equal(documentMatchesPhase(doc, 'after'), false);
  });

  it('falls back to matching the title when metadata is absent', () => {
    const doc = { title: 'Before photo of geyser', metadata: null };
    assert.equal(documentMatchesPhase(doc, 'before'), true);
    assert.equal(documentMatchesPhase(doc, 'after'), false);
  });

  it('is case-insensitive', () => {
    const doc = { title: 'AFTER shot', metadata: null };
    assert.equal(documentMatchesPhase(doc, 'after'), true);
  });
});

describe('hasStoredPhotoEvidence', () => {
  it('requires a stored binary — a placeholder photo without storageKey does not satisfy the gate', () => {
    const docs = [
      { title: 'Before photo', metadata: null, documentationType: 'photo', storageKey: null },
    ];
    assert.equal(hasStoredPhotoEvidence(docs, 'before'), false);
  });

  it('is satisfied once the matching phase photo has a storageKey', () => {
    const docs = [
      { title: 'Before photo', metadata: null, documentationType: 'photo', storageKey: 'company/job/a.bin' },
    ];
    assert.equal(hasStoredPhotoEvidence(docs, 'before'), true);
    assert.equal(hasStoredPhotoEvidence(docs, 'after'), false);
  });

  it('ignores stored binaries on non-photo documentation types', () => {
    const docs = [
      {
        title: 'Before photo',
        metadata: null,
        documentationType: 'customer_signature',
        storageKey: 'company/job/a.bin',
      },
    ];
    assert.equal(hasStoredPhotoEvidence(docs, 'before'), false);
  });
});

describe('hasStoredSignatureEvidence', () => {
  it('is false when no customer_signature doc has a storageKey', () => {
    const docs = [{ documentationType: 'customer_signature', storageKey: null }];
    assert.equal(hasStoredSignatureEvidence(docs), false);
  });

  it('is true once a customer_signature doc has a storageKey', () => {
    const docs = [
      { documentationType: 'photo', storageKey: 'company/job/a.bin' },
      { documentationType: 'customer_signature', storageKey: 'company/job/b.bin' },
    ];
    assert.equal(hasStoredSignatureEvidence(docs), true);
  });
});

describe('summary mappers', () => {
  it('maps a crew member row to a summary with trimmed display name', () => {
    const summary = toCrewMemberSummary(
      {
        id: 'crew-1',
        userId: 'user-1',
        crewRole: 'crew_leader',
        isPrimary: true,
        assignedAt: new Date('2026-01-01T00:00:00Z'),
      } as never,
      { firstName: 'Jane', lastName: 'Doe' },
    );
    assert.equal(summary.userName, 'Jane Doe');
    assert.equal(summary.isPrimary, true);
    assert.equal(summary.assignedAt, '2026-01-01T00:00:00.000Z');
  });

  it('maps a vehicle assignment row to a summary', () => {
    const summary = toVehicleAssignmentSummary(
      { id: 'va-1', vehicleId: 'v-1', assignedAt: new Date('2026-01-02T00:00:00Z') } as never,
      { name: 'Bakkie 1', licensePlate: 'CA123456' },
    );
    assert.equal(summary.vehicleName, 'Bakkie 1');
    assert.equal(summary.licensePlate, 'CA123456');
  });

  it('maps a variation row to a summary', () => {
    const summary = toVariationSummary({
      id: 'var-1',
      status: 'pending',
      title: 'Extra piping required',
      siteCondition: 'Corroded pipe found behind wall',
      explanation: 'Needs replacement before proceeding',
      labourEffect: null,
      materialEffect: null,
      proposedScope: null,
      createdByUserId: 'user-1',
      createdAt: new Date('2026-01-03T00:00:00Z'),
      authorizedAt: null,
    } as never);
    assert.equal(summary.status, 'pending');
    assert.equal(summary.authorizedAt, null);
  });

  it('maps a material line row to a summary', () => {
    const summary = toMaterialLineSummary({
      id: 'ml-1',
      description: '15mm copper pipe',
      quantity: '3.500',
      unit: 'm',
      materialSource: 'vehicle_stock',
      inventoryItemId: null,
      supplierReference: null,
      notes: null,
      recordedByUserId: 'user-1',
      createdAt: new Date('2026-01-04T00:00:00Z'),
    } as never);
    assert.equal(summary.quantity, '3.500');
    assert.equal(summary.materialSource, 'vehicle_stock');
  });
});

describe('userHasJobAccess', () => {
  it('grants access to the legacy single assignee', async () => {
    const db = makeFakeDb({
      job: { assignedUserId: 'user-1' },
      crewMember: null,
    });

    const hasAccess = await userHasJobAccess(db, 'company-1', 'job-1', 'user-1');
    assert.equal(hasAccess, true);
  });

  it('grants access to an active crew member who is not the primary assignee', async () => {
    const db = makeFakeDb({
      job: { assignedUserId: 'user-1' },
      crewMember: { id: 'crew-2' },
    });

    const hasAccess = await userHasJobAccess(db, 'company-1', 'job-1', 'user-2');
    assert.equal(hasAccess, true);
  });

  it('denies access when the user is neither assignee nor active crew', async () => {
    const db = makeFakeDb({
      job: { assignedUserId: 'user-1' },
      crewMember: null,
    });

    const hasAccess = await userHasJobAccess(db, 'company-1', 'job-1', 'user-3');
    assert.equal(hasAccess, false);
  });

  it('denies access when the job does not exist', async () => {
    const db = makeFakeDb({ job: null, crewMember: null });

    const hasAccess = await userHasJobAccess(db, 'company-1', 'missing-job', 'user-1');
    assert.equal(hasAccess, false);
  });
});

describe('getJobIdsForUserIncludingCrew', () => {
  it('unions legacy assignee jobs with active crew jobs, de-duplicated', async () => {
    const db = makeFakeDb({
      assignedJobs: [{ id: 'job-1' }, { id: 'job-2' }],
      crewJobs: [{ jobId: 'job-2' }, { jobId: 'job-3' }],
    });

    const jobIds = await getJobIdsForUserIncludingCrew(db, 'company-1', 'user-1');
    assert.deepEqual([...jobIds].sort(), ['job-1', 'job-2', 'job-3']);
  });

  it('returns an empty array when the user has no jobs', async () => {
    const db = makeFakeDb({ assignedJobs: [], crewJobs: [] });

    const jobIds = await getJobIdsForUserIncludingCrew(db, 'company-1', 'user-1');
    assert.deepEqual(jobIds, []);
  });
});

/** Minimal fake satisfying the subset of DatabaseClient.query used by the pure helpers under test. */
function makeFakeDb(fixture: {
  job?: { assignedUserId: string | null } | null;
  crewMember?: { id: string } | null;
  assignedJobs?: Array<{ id: string }>;
  crewJobs?: Array<{ jobId: string }>;
}): DatabaseClient {
  return {
    query: {
      jobs: {
        findFirst: async () => fixture.job ?? null,
        findMany: async () => fixture.assignedJobs ?? [],
      },
      jobCrewMembers: {
        findFirst: async () => fixture.crewMember ?? null,
        findMany: async () => fixture.crewJobs ?? [],
      },
    },
  } as unknown as DatabaseClient;
}
