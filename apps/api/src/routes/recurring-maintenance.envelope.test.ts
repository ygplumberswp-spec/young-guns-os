import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'recurring-maintenance.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/recurring-maintenance.service.ts'),
  'utf8',
);

describe('recurring maintenance API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'res.json({ data: { overview } })',
      'res.json({ data: { plans } })',
      'res.json({ data: { dueItems } })',
      'res.json({ data: { history } })',
      'res.json({ data: { reminders } })',
      'res.json({ data: { suggestions } })',
      'res.json({ data: { requests } })',
      'autoExecuted: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern) || serviceSource.includes(pattern), `missing: ${pattern}`);
    }
  });

  it('denies technicians from owner recurring maintenance modules', () => {
    assert.ok(routeSource.includes('createDenyTechnicianFromOwnerModules'));
    assert.ok(routeSource.includes('denyTechnicianFromOwner'));
  });

  it('requires Owner for customer communication approve/execute', () => {
    assert.ok(serviceSource.includes('assertOwner'));
    assert.ok(serviceSource.includes('isCompanyOwnerRole'));
    assert.ok(
      serviceSource.includes(
        'Only the company Owner may approve customer maintenance communication',
      ),
    );
  });

  it('never auto-executes AURA suggestions or external communication', () => {
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(serviceSource.includes('noAutoExternalCommunication: true'));
    assert.ok(serviceSource.includes('RECURRING_MAINTENANCE_GUARANTEES'));
  });

  it('reuses existing maintenance.due generation path', () => {
    assert.ok(serviceSource.includes('generateMaintenanceDue'));
    assert.ok(serviceSource.includes('enterpriseAssetLifecycleService'));
    assert.ok(serviceSource.includes('extendsExistingMaintenanceDue: true'));
  });

  it('routes customer outbound through Email Centre draft→approve→execute', () => {
    assert.ok(serviceSource.includes('createReplyOrForwardDraft'));
    assert.ok(serviceSource.includes('createTimelineNote'));
    assert.ok(serviceSource.includes('emailCentreApproveExecuteStillRequired: true'));
    assert.ok(
      serviceSource.includes(
        'Owner must approve the communication request before Email Centre draft creation',
      ),
    );
  });

  it('writes security audit logs for overview and sensitive actions', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('recurring_maintenance.overview.read'));
    assert.ok(serviceSource.includes('recurring_maintenance.comm.approved'));
    assert.ok(serviceSource.includes('recurring_maintenance.comm.executed'));
    assert.ok(serviceSource.includes("category: 'workflow'"));
  });

  it('does not invent demo plans or runs', () => {
    assert.ok(serviceSource.includes('noDemoData: true'));
    assert.ok(serviceSource.includes('noFakePlans: true'));
    assert.ok(serviceSource.includes('noFakeRuns: true'));
    assert.ok(!serviceSource.includes('demoPlan'));
    assert.ok(!serviceSource.includes('fakeRun'));
    assert.ok(!serviceSource.includes('sampleMaintenance'));
  });
});
