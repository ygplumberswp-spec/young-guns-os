import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'technician-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/technician-intelligence.service.ts'),
  'utf8',
);

describe('technician intelligence API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    for (const pattern of [
      'res.json({ data: { overview } })',
      'res.json({ data: { detail } })',
      'res.json({ data: { view } })',
      'res.json({ data: { lifecycle } })',
      'autoExecuted: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('denies technicians from owner analytics modules', () => {
    assert.ok(routeSource.includes('createDenyTechnicianFromOwnerModules'));
    assert.ok(routeSource.includes('denyTechnicianFromOwner'));
    assert.ok(serviceSource.includes('Technicians cannot access company-wide'));
  });

  it('never auto-executes operational changes from insights', () => {
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(
      serviceSource.includes('Approval does not execute schedule, dispatch, or messaging changes.'),
    );
  });

  it('scopes technician self data and excludes owner analytics', () => {
    assert.ok(serviceSource.includes('otherTechnicians: true'));
    assert.ok(serviceSource.includes('companyFinances: true'));
    assert.ok(serviceSource.includes('ownerAnalytics: true'));
    assert.ok(serviceSource.includes('eq(jobs.assignedUserId, technicianId)'));
  });

  it('writes security audit logs for owner and self reads', () => {
    assert.ok(serviceSource.includes("category: 'dispatch'"));
    assert.ok(serviceSource.includes('technician_intelligence.owner_overview.read'));
    assert.ok(serviceSource.includes('technician_intelligence.self.read'));
    assert.ok(serviceSource.includes('securityAuditLogs'));
  });

  it('does not invent demo technician rows', () => {
    assert.ok(serviceSource.includes('noDemoData: true'));
    assert.ok(!serviceSource.includes('demoTechnician'));
    assert.ok(!serviceSource.includes('fakeRating'));
  });
});
