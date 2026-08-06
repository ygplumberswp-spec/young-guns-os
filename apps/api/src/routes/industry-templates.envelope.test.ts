import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'industry-templates.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/industry-templates.service.ts'),
  'utf8',
);
const sharedSource = readFileSync(
  join(here, '../../../../packages/shared/src/industry-templates.ts'),
  'utf8',
);
const schemaSource = readFileSync(
  join(here, '../../../../packages/db/src/schema/industry-templates.ts'),
  'utf8',
);
const migrationSource = readFileSync(
  join(here, '../../../../packages/db/drizzle/0170_industry_templates.sql'),
  'utf8',
);
const existingPackSchema = readFileSync(
  join(here, '../../../../packages/db/src/schema/enterprise-industry-packs.ts'),
  'utf8',
);

describe('industry templates API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'configuresExistingCore: true as const',
      'duplicatedPlatform: false as const',
      'seededTenantRecords: false as const',
      'fakeBusinessData: false as const',
      'unreviewedComplianceAsserted: false as const',
      'approvalRequiredForLiveChanges: true as const',
      'versionHistoryPreserved: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
    assert.ok(!routeSource.includes('duplicatedPlatform: true'));
    assert.ok(!routeSource.includes('seededTenantRecords: true'));
    assert.ok(!routeSource.includes('fakeBusinessData: true'));
    assert.ok(!routeSource.includes('unreviewedComplianceAsserted: true'));
  });

  it('applies the envelope to every response that returns data', () => {
    const dataResponses = routeSource.match(/res\.(?:status\(\d+\)\.)?json\(\{ data:/g) ?? [];
    const envelopeUses = routeSource.match(/\.\.\.HONESTY_FLAGS/g) ?? [];
    assert.ok(dataResponses.length >= 10, 'expected the full endpoint surface');
    assert.equal(
      envelopeUses.length,
      dataResponses.length,
      'every data response must carry the honesty envelope',
    );
  });

  it('gates the whole router behind auth and a role check', () => {
    assert.ok(routeSource.includes('router.use(requireAuth)'));
    assert.ok(routeSource.includes('canReadItplTemplates'));
    assert.ok(routeSource.includes("code: 'FORBIDDEN'"));
    assert.ok(routeSource.includes('the service re-checks'));
  });

  it('denies clients by role before any permission is read', () => {
    const start = sharedSource.indexOf('export function resolveItplScope');
    assert.ok(start > -1, 'scope resolver must exist');
    const scopeFn = sharedSource.slice(start, start + 1200);
    const clientIndex = scopeFn.indexOf('isItplClientRole');
    const wildcardIndex = scopeFn.indexOf("includes('*')");
    assert.ok(clientIndex > -1, 'client denial must be present');
    assert.ok(wildcardIndex > -1, 'wildcard handling must be present');
    assert.ok(
      clientIndex < wildcardIndex,
      'the client denial must run before any wildcard permission is considered',
    );
    const technicianIndex = scopeFn.indexOf('isItplTechnicianRole');
    assert.ok(
      technicianIndex > -1 && technicianIndex < wildcardIndex,
      'technicians must be classified before a wildcard is considered',
    );
  });

  it('re-checks access inside the service on every path', () => {
    assert.ok(serviceSource.includes('private assertRead('));
    assert.ok(serviceSource.includes('private assertEdit('));
    assert.ok(serviceSource.includes('private assertOwner('));
    for (const method of [
      'async getDashboard(',
      'async updateSettings(',
      'async createTemplate(',
      'async listTemplates(',
      'async getTemplate(',
      'async saveVersion(',
      'async submitVersion(',
      'async decideVersion(',
      'async activateTemplate(',
      'async listAudit(',
    ]) {
      const index = serviceSource.indexOf(method);
      assert.ok(index > -1, `missing method: ${method}`);
      const body = serviceSource.slice(index, index + 700);
      assert.ok(body.includes('this.assertRead('), `${method} must re-check access`);
    }
  });

  it('keeps activation and approval with the owner alone', () => {
    for (const method of ['async decideVersion(', 'async activateTemplate(', 'async updateSettings(']) {
      const index = serviceSource.indexOf(method);
      const body = serviceSource.slice(index, index + 700);
      assert.ok(body.includes('this.assertOwner('), `${method} must be owner gated`);
    }
    assert.ok(sharedSource.includes('export function canActivateItplTemplate'));
  });

  it('requires an approved version before anything goes live', () => {
    const index = serviceSource.indexOf('async activateTemplate(');
    const body = serviceSource.slice(index, index + 2500);
    assert.ok(body.includes('canItplVersionActivate('));
    assert.ok(body.includes('Only an approved version can become the active configuration'));
    assert.ok(sharedSource.includes("return status === 'approved'"));
  });

  it('rejects business records in a template in both directions', () => {
    assert.ok(serviceSource.includes('private assertNoBusinessRecords('));
    for (const method of ['async createTemplate(', 'async saveVersion(']) {
      const index = serviceSource.indexOf(method);
      const body = serviceSource.slice(index, index + 2200);
      assert.ok(body.includes('this.assertNoBusinessRecords('), `${method} must guard records`);
    }
    assert.ok(sharedSource.includes('export function findItplBusinessRecordFields'));
    assert.ok(serviceSource.includes('seededTenantRecords: false'));
  });

  it('never writes a business record table of its own', () => {
    const writes = serviceSource.match(/this\.db\s*\n?\s*\.(?:insert|update|delete)\(([^)]+)\)/g) ?? [];
    assert.ok(writes.length > 0, 'expected some writes');
    for (const write of writes) {
      assert.ok(
        /itpl(Settings|Templates|TemplateVersions|Activations|AuditEvents)/.test(write),
        `write must target an itpl table only: ${write}`,
      );
    }
    for (const businessTable of [
      'customers',
      'jobs',
      'quotes',
      'invoices',
      'leads',
      'properties',
    ]) {
      assert.ok(
        !new RegExp(`insert\\(${businessTable}\\)`).test(serviceSource),
        `${businessTable} must never be written by a template`,
      );
    }
  });

  it('scopes every read and write by companyId', () => {
    const companyScoped = serviceSource.match(/companyId/g) ?? [];
    assert.ok(companyScoped.length > 30, 'companyId must be threaded throughout');
    for (const table of [
      'itplTemplates',
      'itplTemplateVersions',
      'itplActivations',
      'itplAuditEvents',
      'itplSettings',
    ]) {
      assert.ok(
        serviceSource.includes(`eq(${table}.companyId,`),
        `${table} must be filtered by companyId`,
      );
    }
  });

  it('uses a table prefix that does not collide with the existing industry packs', () => {
    const newTables = [...migrationSource.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(
      (match) => match[1],
    );
    assert.ok(newTables.length >= 5, 'expected the template tables');
    for (const table of newTables) {
      assert.ok(table.startsWith('itpl_'), `${table} must use the itpl_ prefix`);
      assert.ok(
        !existingPackSchema.includes(`pgTable('${table}'`),
        `${table} collides with an existing industry pack table`,
      );
    }
    const newTypes = [...migrationSource.matchAll(/CREATE TYPE (\w+)/g)].map((match) => match[1]);
    for (const type of newTypes) {
      assert.ok(type.startsWith('itpl_'), `${type} must use the itpl_ prefix`);
      assert.ok(
        !existingPackSchema.includes(`pgEnum('${type}'`),
        `${type} collides with an existing industry pack enum`,
      );
    }
  });

  it('configures existing capability rather than inventing new modules', () => {
    assert.ok(sharedSource.includes('export const ITPL_KNOWN_CAPABILITY_REFS'));
    assert.ok(sharedSource.includes('export function isItplKnownCapabilityRef'));
    assert.ok(sharedSource.includes('does not exist in TITAN'));
    assert.ok(sharedSource.includes('ITPL_SINGLE_CORE_STATEMENT'));
    assert.ok(sharedSource.includes('never creates a separate application'));
  });

  it('keeps the plumbing configuration pointing at capabilities that already ship', () => {
    assert.ok(sharedSource.includes('export const ITPL_PLUMBING_BLUEPRINT'));
    assert.ok(sharedSource.includes('ITPL_PLUMBING_CAPABILITY_REFS'));
    for (const jobType of ['geyser', 'drains', 'leaks', 'bathroom_renovation']) {
      assert.ok(sharedSource.includes(`'${jobType}'`), `plumbing must keep the ${jobType} type`);
    }
    // The plumbing template references the existing COC configuration rather
    // than restating a standard of its own.
    assert.ok(sharedSource.includes('DEFAULT_YG_COC_SETTINGS'));
  });

  it('never asserts an unreviewed compliance standard', () => {
    assert.ok(sharedSource.includes('ITPL_COMPLIANCE_UNREVIEWED_NOTE'));
    assert.ok(sharedSource.includes('TITAN does not assert that this standard applies'));
    assert.ok(sharedSource.includes("support: 'requires_compliance_review'"));
    assert.ok(migrationSource.includes('CHECK (allow_unreviewed_compliance_claims = false)'));
  });

  it('pins the approval, compliance and seeding invariants in the database', () => {
    assert.ok(migrationSource.includes('CHECK (require_approval_for_live_changes = true)'));
    assert.ok(migrationSource.includes('CHECK (allow_unreviewed_compliance_claims = false)'));
    assert.ok(migrationSource.includes('CHECK (seed_tenant_records = false)'));
    assert.ok(schemaSource.includes('requireApprovalForLiveChanges'));
    assert.ok(schemaSource.includes('seedTenantRecords'));
  });

  it('allows only one active template per company', () => {
    assert.ok(
      migrationSource.includes(
        'ON itpl_templates (company_id) WHERE is_active = true',
      ),
    );
    assert.ok(migrationSource.includes('CONSTRAINT itpl_templates_active_ck'));
  });

  it('keeps version history append-only', () => {
    assert.ok(migrationSource.includes('itpl_versions_template_number_uidx'));
    assert.ok(!serviceSource.includes('delete(itplTemplateVersions)'));
    assert.ok(!serviceSource.includes('delete(itplActivations)'));
    assert.ok(!serviceSource.includes('update(itplAuditEvents)'));
    assert.ok(!serviceSource.includes('delete(itplAuditEvents)'));
    assert.ok(serviceSource.includes('insert(itplAuditEvents)'));
    assert.ok(serviceSource.includes('The previous version is never edited'));
  });

  it('records a version for every change and never edits the definition in place', () => {
    const save = serviceSource.slice(serviceSource.indexOf('async saveVersion('));
    assert.ok(save.includes('insert(itplTemplateVersions)'));
    assert.ok(save.includes('versionNumber: (latest[0]?.versionNumber ?? 0) + 1'));
    assert.ok(save.includes('resolveItplChangeImpact('));
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
      "router.get('/templates'",
      "router.post('/templates'",
      "router.get('/templates/:templateId'",
      "router.post('/templates/:templateId/versions'",
      "router.post('/templates/:templateId/versions/:versionId/submit'",
      "router.post('/templates/:templateId/versions/:versionId/decide'",
      "router.post('/templates/:templateId/activate'",
      "router.get('/audit'",
    ]) {
      assert.ok(routeSource.includes(route), `missing route: ${route}`);
    }
  });
});
