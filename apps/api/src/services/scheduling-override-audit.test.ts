import assert from 'node:assert/strict';
import test from 'node:test';

test('scheduling override audit payload contract', () => {
  const auditRow = {
    companyId: 'company-1',
    jobId: 'job-1',
    userId: 'owner-1',
    reason: 'Customer emergency — approved by owner',
    conflictSummary: {
      conflicts: [{ type: 'overlap', message: 'Overlaps with job #1042.', severity: 'block' }],
    },
  };

  assert.ok(auditRow.reason.trim().length >= 3);
  assert.equal(Array.isArray(auditRow.conflictSummary.conflicts), true);
  assert.equal(auditRow.conflictSummary.conflicts[0].type, 'overlap');
});
