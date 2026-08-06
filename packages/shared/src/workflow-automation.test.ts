import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterSafeRecordUpdates,
  isSensitiveWorkflowAction,
  monitorBucketToRunStatuses,
  OPS_WORKFLOW_ACTION_CATALOG,
  OPS_WORKFLOW_TRIGGER_CATALOG,
  WORKFLOW_AUTOMATION_GUARANTEES,
} from './workflow-automation.js';

describe('workflow-automation guarantees', () => {
  it('never auto-executes or invents demo data', () => {
    assert.equal(WORKFLOW_AUTOMATION_GUARANTEES.noDemoData, true);
    assert.equal(WORKFLOW_AUTOMATION_GUARANTEES.noFakeRuns, true);
    assert.equal(WORKFLOW_AUTOMATION_GUARANTEES.autoExecuted, false);
    assert.equal(WORKFLOW_AUTOMATION_GUARANTEES.noAutoExternalCommunication, true);
    assert.equal(WORKFLOW_AUTOMATION_GUARANTEES.auraSuggestionsDraftOnly, true);
    assert.equal(WORKFLOW_AUTOMATION_GUARANTEES.ownerApprovalForSensitiveActions, true);
  });
});

describe('workflow-automation catalogs', () => {
  it('covers the Operations product trigger set', () => {
    const labels = OPS_WORKFLOW_TRIGGER_CATALOG.map((t) => t.label);
    for (const required of [
      'New lead created',
      'Customer created',
      'Quote created',
      'Quote accepted',
      'Job booked',
      'Job assigned',
      'Job completed',
      'Invoice created',
      'Payment received',
      'Maintenance due',
    ]) {
      assert.ok(labels.includes(required), `missing trigger: ${required}`);
    }
    assert.ok(OPS_WORKFLOW_TRIGGER_CATALOG.every((t) => t.wired));
  });

  it('marks external communication as approval-required', () => {
    const external = OPS_WORKFLOW_ACTION_CATALOG.filter((a) => a.externalCommunication);
    assert.ok(external.length >= 2);
    assert.ok(external.every((a) => a.requiresOwnerApproval));
    assert.equal(isSensitiveWorkflowAction('send_communication'), true);
    assert.equal(isSensitiveWorkflowAction('update_record'), true);
    assert.equal(isSensitiveWorkflowAction('create_task'), false);
    assert.equal(isSensitiveWorkflowAction('trigger_aura_suggestion'), false);
  });
});

describe('workflow-automation monitor buckets', () => {
  it('maps UI buckets to real run statuses', () => {
    assert.deepEqual(monitorBucketToRunStatuses('active'), [
      'pending',
      'running',
      'awaiting_approval',
    ]);
    assert.deepEqual(monitorBucketToRunStatuses('completed'), ['completed', 'skipped']);
    assert.deepEqual(monitorBucketToRunStatuses('failed'), ['failed']);
    assert.deepEqual(monitorBucketToRunStatuses('awaiting_approval'), ['awaiting_approval']);
  });
});

describe('workflow-automation safe record updates', () => {
  it('allows only scoped customer/job fields', () => {
    const customer = filterSafeRecordUpdates('customer', {
      notes: 'Call back',
      status: 'active',
      email: 'evil@example.com',
    });
    assert.ok(customer);
    assert.deepEqual(customer.safeUpdates, { notes: 'Call back', status: 'active' });
    assert.equal(filterSafeRecordUpdates('invoice', { amountCents: 1 }), null);
    assert.equal(filterSafeRecordUpdates('job', { title: 'x' }), null);
  });
});
