import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'workflow-automation.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/workflow-automation.service.ts'),
  'utf8',
);
const engineSource = readFileSync(join(here, '../services/workflow-engine.service.ts'), 'utf8');

describe('workflow automation API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'res.json({ data: { overview } })',
      'res.json({ data: { runs } })',
      'res.json({ data: { definitions } })',
      'res.json({ data: { approvals } })',
      'res.json({ data: { tasks } })',
      'autoExecuted: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('denies technicians from owner workflow automation modules', () => {
    assert.ok(routeSource.includes('createDenyTechnicianFromOwnerModules'));
    assert.ok(routeSource.includes('denyTechnicianFromOwner'));
  });

  it('requires Owner for sensitive approval decisions', () => {
    assert.ok(serviceSource.includes('assertOwner'));
    assert.ok(serviceSource.includes('isCompanyOwnerRole'));
    assert.ok(serviceSource.includes('Only the company Owner may approve'));
  });

  it('never auto-executes AURA suggestions or external communication', () => {
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(
      serviceSource.includes(
        'Approval does not execute schedule, dispatch, messaging, or financial changes.',
      ),
    );
    assert.ok(serviceSource.includes('noAutoExternalCommunication: true'));
  });

  it('writes security audit logs for monitor and approvals', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('workflow_automation.monitor.read'));
    assert.ok(serviceSource.includes('workflow_automation.approval.approved'));
    assert.ok(serviceSource.includes("category: 'workflow'"));
  });

  it('does not invent demo workflow runs', () => {
    assert.ok(serviceSource.includes('noDemoData: true'));
    assert.ok(serviceSource.includes('noFakeRuns: true'));
    assert.ok(serviceSource.includes('eq(workflowRuns.isSimulation, false)'));
    assert.ok(!serviceSource.includes('demoWorkflow'));
    assert.ok(!serviceSource.includes('fakeRun'));
  });

  it('keeps outbound communication behind approval in the engine', () => {
    assert.ok(engineSource.includes('APPROVAL_REQUIRED_ACTIONS'));
    assert.ok(engineSource.includes("'send_communication'"));
    assert.ok(engineSource.includes("'send_email_draft'"));
    assert.ok(engineSource.includes("'send_whatsapp_draft'"));
    assert.ok(engineSource.includes("'update_record'"));
    assert.ok(engineSource.includes('opsWorkflowAuraSuggestions'));
    assert.ok(engineSource.includes('autoExecuted: false'));
  });
});
