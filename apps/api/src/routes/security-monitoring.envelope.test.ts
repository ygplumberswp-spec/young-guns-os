import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'security-monitoring.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/security-monitoring.service.ts'),
  'utf8',
);
const sharedSource = readFileSync(
  join(here, '../../../../packages/shared/src/security-monitoring.ts'),
  'utf8',
);
const schemaSource = readFileSync(
  join(here, '../../../../packages/db/src/schema/security-monitoring.ts'),
  'utf8',
);
const migrationSource = readFileSync(
  join(here, '../../../../packages/db/drizzle/0169_security_monitoring.sql'),
  'utf8',
);

describe('security monitoring API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoRemediated: false as const',
      'autoExecuted: false as const',
      'credentialsExposed: false as const',
      'inventedThreatData: false as const',
      'fakeBusinessData: false as const',
      'approvalRequired: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
    assert.ok(!routeSource.includes('autoRemediated: true'));
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!routeSource.includes('credentialsExposed: true'));
    assert.ok(!routeSource.includes('inventedThreatData: true'));
    assert.ok(!routeSource.includes('fakeBusinessData: true'));
  });

  it('applies the envelope to every response that returns data', () => {
    const dataResponses = routeSource.match(/res\.(?:status\(\d+\)\.)?json\(\{ data:/g) ?? [];
    const envelopeUses = routeSource.match(/\.\.\.HONESTY_FLAGS/g) ?? [];
    assert.ok(dataResponses.length >= 7, 'expected the full endpoint surface');
    assert.equal(
      envelopeUses.length,
      dataResponses.length,
      'every data response must carry the honesty envelope',
    );
  });

  it('gates the whole router behind auth and a role check', () => {
    assert.ok(routeSource.includes('router.use(requireAuth)'));
    assert.ok(routeSource.includes('canReadSecmonMonitoring'));
    assert.ok(routeSource.includes("code: 'FORBIDDEN'"));
    assert.ok(routeSource.includes('The service re-checks the same rules'));
  });

  it('denies technicians and clients by role before any permission is read', () => {
    const start = sharedSource.indexOf('export function resolveSecmonAudienceScope');
    assert.ok(start > -1, 'scope resolver must exist');
    const scopeFn = sharedSource.slice(start, start + 1200);
    const denialIndex = scopeFn.indexOf('isSecmonHardDeniedRole');
    const wildcardIndex = scopeFn.indexOf("includes('*')");
    assert.ok(denialIndex > -1, 'role denial must be present');
    assert.ok(wildcardIndex > -1, 'wildcard handling must be present');
    assert.ok(
      denialIndex < wildcardIndex,
      'the hard role denial must run before any wildcard permission is considered',
    );
  });

  it('re-checks access inside the service on every path', () => {
    assert.ok(serviceSource.includes('private assertRead('));
    assert.ok(serviceSource.includes('private assertOwner('));
    assert.ok(serviceSource.includes('private assertTriage('));
    for (const method of [
      'async getDashboard(',
      'async updateSettings(',
      'async triageSignal(',
      'async openIncident(',
      'async updateIncident(',
      'async decideRecommendation(',
      'async listAudit(',
    ]) {
      const index = serviceSource.indexOf(method);
      assert.ok(index > -1, `missing method: ${method}`);
      const body = serviceSource.slice(index, index + 900);
      assert.ok(
        body.includes('this.assertRead(') || body.includes('this.assertOwner('),
        `${method} must re-check access`,
      );
    }
  });

  it('requires the owner for settings and for deciding a recommendation', () => {
    for (const method of ['async updateSettings(', 'async decideRecommendation(']) {
      const index = serviceSource.indexOf(method);
      const body = serviceSource.slice(index, index + 900);
      assert.ok(body.includes('this.assertOwner('), `${method} must be owner gated`);
    }
  });

  it('never carries out a high-risk operation of its own', () => {
    for (const forbidden of [
      '.delete(users)',
      '.delete(sessions)',
      'revokeSession',
      'rotateCredential',
      'disconnectIntegration',
      'deleteAccount',
      'removePermission',
    ]) {
      assert.ok(
        !serviceSource.includes(forbidden),
        `service must not perform a high-risk operation: ${forbidden}`,
      );
    }
    assert.ok(serviceSource.includes('executed: false'));
    assert.ok(!serviceSource.includes('executed: true'));
  });

  it('only writes to its own tables and never to the security evidence tables', () => {
    const writes = serviceSource.match(/this\.db\s*\n?\s*\.(?:insert|update|delete)\(([^)]+)\)/g) ?? [];
    assert.ok(writes.length > 0, 'expected some writes');
    for (const write of writes) {
      assert.ok(
        /secmon(Settings|SignalStates|Incidents|ActionDrafts|AuditEvents)/.test(write),
        `write must target a secmon table only: ${write}`,
      );
    }
    for (const evidenceTable of [
      'securityLoginEvents',
      'securityAuditLogs',
      'securityPermissionGrants',
      'securityAiEvents',
      'securityCommAccessLogs',
      'securityApiRateCounters',
      'securityTenantPolicies',
      'sessions',
      'integrationConnections',
    ]) {
      assert.ok(serviceSource.includes(evidenceTable), `${evidenceTable} should be read`);
      assert.ok(
        !new RegExp(`insert\\(${evidenceTable}\\)`).test(serviceSource),
        `${evidenceTable} must never be written`,
      );
      assert.ok(
        !new RegExp(`update\\(${evidenceTable}\\)`).test(serviceSource),
        `${evidenceTable} must never be written`,
      );
      assert.ok(
        !new RegExp(`delete\\(${evidenceTable}\\)`).test(serviceSource),
        `${evidenceTable} must never be deleted from`,
      );
    }
  });

  it('scopes every read and write by companyId', () => {
    const companyScoped = serviceSource.match(/companyId/g) ?? [];
    assert.ok(companyScoped.length > 30, 'companyId must be threaded throughout');
    for (const table of [
      'securityLoginEvents',
      'securityAuditLogs',
      'securityPermissionGrants',
      'secmonIncidents',
      'secmonAuditEvents',
    ]) {
      assert.ok(
        serviceSource.includes(`eq(${table}.companyId,`),
        `${table} must be filtered by companyId`,
      );
    }
  });

  it('redacts secrets and network detail before anything leaves the service', () => {
    for (const helper of [
      'redactSecmonIp',
      'redactSecmonUserAgent',
      'redactSecmonSecretsInText',
      'scrubSecmonMetadata',
      'maskSecmonEmail',
    ]) {
      assert.ok(serviceSource.includes(helper), `service must use ${helper}`);
    }
    // The audit trail is written through the scrubber, never with raw detail.
    const recordEvent = serviceSource.slice(serviceSource.indexOf('private async recordEvent('));
    assert.ok(recordEvent.includes('scrubSecmonMetadata(detail)'));
  });

  it('never selects a credential column', () => {
    for (const column of [
      'refreshTokenHash',
      'passwordHash',
      'securityPasswordHistory',
      'securityWebauthnCredentials',
      'accessToken',
      'clientSecret',
    ]) {
      assert.ok(
        !serviceSource.includes(column),
        `service must not touch credential material: ${column}`,
      );
    }
  });

  it('keeps serious signals visible and gaps in coverage honest', () => {
    assert.ok(sharedSource.includes('export function mustAlwaysSurfaceSecmonSignal'));
    assert.ok(sharedSource.includes("SECMON_NEVER_SUPPRESS_AT_OR_ABOVE: SecmonSeverity = 'high'"));
    assert.ok(serviceSource.includes('buildSecmonUnavailableSignal'));
    assert.ok(serviceSource.includes('a blind spot never reads as an all-clear'));
  });

  it('groups duplicates and ranks by severity before display', () => {
    assert.ok(serviceSource.includes('groupSecmonSignals'));
    assert.ok(serviceSource.includes('sortSecmonSignals'));
    assert.ok(serviceSource.includes('applySecmonSeverityFloor'));
  });

  it('labels every statement as a fact or a recommendation and never invents a source', () => {
    assert.ok(sharedSource.includes("export type SecmonStatementKind = 'fact' | 'aura_recommendation'"));
    assert.ok(serviceSource.includes("statementKind: 'fact'"));
    assert.ok(serviceSource.includes("statementKind: 'aura_recommendation' as const"));
    assert.ok(serviceSource.includes('SECMON_ATTRIBUTION_BOUNDARY'));
    assert.ok(sharedSource.includes('has not been identified and is not asserted'));
  });

  it('requires cited evidence before a recommendation can be decided', () => {
    const index = serviceSource.indexOf('async decideRecommendation(');
    const body = serviceSource.slice(index, index + 2500);
    assert.ok(body.includes('evidence.length === 0'));
    assert.ok(body.includes('cannot be decided without cited evidence'));
    assert.ok(migrationSource.includes('jsonb_array_length(evidence) > 0'));
  });

  it('pins the no-remediation and no-secret invariants in the database', () => {
    assert.ok(migrationSource.includes('CHECK (auto_remediation_enabled = false)'));
    assert.ok(migrationSource.includes('CHECK (expose_secrets_enabled = false)'));
    assert.ok(migrationSource.includes('CHECK (executed = false)'));
    assert.ok(schemaSource.includes('autoRemediationEnabled'));
    assert.ok(schemaSource.includes('exposeSecretsEnabled'));
  });

  it('keeps the audit trail append-only', () => {
    assert.ok(!serviceSource.includes('update(secmonAuditEvents)'));
    assert.ok(!serviceSource.includes('delete(secmonAuditEvents)'));
    assert.ok(serviceSource.includes('insert(secmonAuditEvents)'));
    assert.ok(schemaSource.includes('Append-only trail'));
  });

  it('carries no fake or placeholder business data', () => {
    for (const source of [routeSource, serviceSource, sharedSource]) {
      for (const marker of ['lorem', 'faker', 'Math.random()', 'dummyData', 'mockCompany']) {
        assert.ok(!source.toLowerCase().includes(marker.toLowerCase()), `found marker: ${marker}`);
      }
    }
  });

  it('exposes the endpoint surface the department needs', () => {
    for (const route of [
      "router.get('/dashboard'",
      "router.get('/settings'",
      "router.patch('/settings'",
      "router.post('/signals/:signalKey/triage'",
      "router.post('/incidents'",
      "router.patch('/incidents/:incidentId'",
      "router.post('/recommendations/:recommendationKey/decide'",
      "router.get('/audit'",
    ]) {
      assert.ok(routeSource.includes(route), `missing route: ${route}`);
    }
  });
});
