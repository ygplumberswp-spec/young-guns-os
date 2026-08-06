import assert from 'node:assert/strict';
import test from 'node:test';
import { mapWorkflowActionToCommunicationHook } from '@titan/shared';
import { DispatchCommunicationService } from './dispatch-communication.service.js';

test('DispatchCommunicationService.assessWorkflowActionHook maps mobile transitions', () => {
  const service = new DispatchCommunicationService(
    {} as never,
    {} as never,
  );
  assert.equal(service.assessWorkflowActionHook('en_route'), 'technician_en_route');
  assert.equal(service.assessWorkflowActionHook('complete'), 'job_completed');
  assert.equal(service.assessWorkflowActionHook('arrive'), null);
  assert.equal(mapWorkflowActionToCommunicationHook('en_route'), 'technician_en_route');
});
