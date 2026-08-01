import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyMemberDraft,
  membersFromExecution,
  validateCrewAssignmentDraft,
} from './crew-assignment-utils';

test('validateCrewAssignmentDraft rejects fewer than two members', () => {
  assert.equal(
    validateCrewAssignmentDraft([createEmptyMemberDraft(true)]),
    'Assign between 2 and 4 crew members (Young Guns runs 2–4 workers per vehicle).',
  );
});

test('validateCrewAssignmentDraft rejects duplicate users', () => {
  const error = validateCrewAssignmentDraft([
    { userId: 'u1', crewRole: 'crew_leader', isPrimary: true },
    { userId: 'u1', crewRole: 'assistant', isPrimary: false },
  ]);
  assert.equal(error, 'Each crew member must be unique.');
});

test('validateCrewAssignmentDraft requires exactly one primary', () => {
  const error = validateCrewAssignmentDraft([
    { userId: 'u1', crewRole: 'crew_leader', isPrimary: false },
    { userId: 'u2', crewRole: 'assistant', isPrimary: false },
  ]);
  assert.equal(error, 'Mark exactly one crew member as the lead.');
});

test('membersFromExecution maps saved crew when two or more exist', () => {
  const drafts = membersFromExecution(
    [
      {
        id: '1',
        userId: 'u1',
        userName: 'Alex',
        crewRole: 'crew_leader',
        isPrimary: true,
        assignedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        userId: 'u2',
        userName: 'Ben',
        crewRole: 'assistant',
        isPrimary: false,
        assignedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    null,
  );
  assert.deepEqual(drafts, [
    { userId: 'u1', crewRole: 'crew_leader', isPrimary: true },
    { userId: 'u2', crewRole: 'assistant', isPrimary: false },
  ]);
});

test('membersFromExecution seeds two rows from fallback assignee', () => {
  const drafts = membersFromExecution([], 'tech-1');
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0]?.userId, 'tech-1');
  assert.equal(drafts[0]?.isPrimary, true);
  assert.equal(drafts[1]?.userId, '');
});
