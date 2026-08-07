import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  YG_LIVE_CUTOVER_PLAN,
  YG_LIVE_OWNER_ACCEPTANCE_CHECKLIST,
  YG_LIVE_PERSONAL_NUMBER_CAPTURE_DESIGN,
  YG_LIVE_PRODUCTION_PREREQUISITES,
  YG_LIVE_STAGING_COMPANY_ID,
  YG_LIVE_TENANT_CONFIG_CHECKLIST,
  YG_LIVE_TENANT_IDENTITY,
  YG_LIVE_WHATSAPP_COEXISTENCE,
  YG_LIVE_WORKFLOW_CHAIN,
  countYgLiveAcceptanceSteps,
  isYgLiveHardStop,
} from './yg-live-001.js';
import { YOUNG_GUNS_REFERENCE_COMPANY_ID } from './finance-tenant-pricebook.js';
import {
  AURA_ROLE_ACCESS_MATRIX,
  canViewCashControl,
  canViewOwnerFinancialCommand,
  getAuraRoleAccessRule,
  isTechnicianForbiddenAuraTopic,
} from './index.js';

describe('YG-LIVE-001 tenant identity', () => {
  it('binds to canonical Young Guns company id without inventing a second tenant', () => {
    assert.equal(YG_LIVE_STAGING_COMPANY_ID, YOUNG_GUNS_REFERENCE_COMPANY_ID);
    assert.equal(YG_LIVE_TENANT_IDENTITY.currency, 'ZAR');
    assert.equal(YG_LIVE_TENANT_IDENTITY.timezone, 'Africa/Johannesburg');
    assert.equal(YG_LIVE_TENANT_IDENTITY.locale, 'en-ZA');
    assert.equal(YG_LIVE_TENANT_IDENTITY.tradingName, 'Young Guns Plumbing');
    assert.ok(YG_LIVE_TENANT_CONFIG_CHECKLIST.some((i) => i.id === 'canonical-company'));
    assert.ok(
      YG_LIVE_TENANT_CONFIG_CHECKLIST.some(
        (i) => i.id === 'vat-number' && i.status === 'owner_config_required',
      ),
    );
  });
});

describe('YG-LIVE-001 hard role model', () => {
  it('keeps Technician field-only and finance denied', () => {
    assert.equal(getAuraRoleAccessRule('Technician')?.mayAccessCompanyFinance, false);
    assert.equal(getAuraRoleAccessRule('Technician')?.jobScope, 'assigned_only');
    assert.equal(getAuraRoleAccessRule('Client')?.jobScope, 'own_client_only');
    assert.equal(AURA_ROLE_ACCESS_MATRIX.length, 4);
    assert.equal(
      canViewOwnerFinancialCommand({
        roleName: 'Technician',
        permissions: ['finance:read', 'mobile:read', 'jobs:read'],
      }),
      false,
    );
    assert.equal(
      canViewCashControl({ roleName: 'Technician', permissions: ['*'] }),
      false,
    );
    assert.equal(isTechnicianForbiddenAuraTopic('Show bank transactions and payroll.'), true);
  });

  it('keeps Client away from company finance', () => {
    assert.equal(getAuraRoleAccessRule('Client')?.mayAccessCompanyFinance, false);
    assert.equal(
      canViewOwnerFinancialCommand({ roleName: 'Client', permissions: ['finance:read'] }),
      false,
    );
  });
});

describe('YG-LIVE-001 WhatsApp coexistence feasibility', () => {
  it('requires Meta eligibility and forbids blind real-number migration', () => {
    assert.equal(YG_LIVE_WHATSAPP_COEXISTENCE.result, 'REQUIRES_META_ELIGIBILITY_CHECK');
    assert.equal(YG_LIVE_WHATSAPP_COEXISTENCE.metaOfficialSupport, true);
    assert.equal(YG_LIVE_WHATSAPP_COEXISTENCE.titanEmbeddedSignupCoexistenceImplemented, false);
    assert.equal(YG_LIVE_WHATSAPP_COEXISTENCE.isFinalYoungGunsBusinessNumber, false);
    assert.equal(YG_LIVE_WHATSAPP_COEXISTENCE.personalNumberPath.coexistenceApplies, false);
    assert.ok(YG_LIVE_WHATSAPP_COEXISTENCE.hardStops.some((s) => /deregister/i.test(s)));
    assert.equal(YG_LIVE_WHATSAPP_COEXISTENCE.historyMigration.titanImporterImplemented, false);
    assert.equal(YG_LIVE_WHATSAPP_COEXISTENCE.historyMigration.personalBulkImportForbidden, true);
  });

  it('personal capture defaults private and never auto-imports all chats', () => {
    assert.ok(YG_LIVE_PERSONAL_NUMBER_CAPTURE_DESIGN.forbidden.some((f) => /every chat/i.test(f)));
    assert.equal(YG_LIVE_PERSONAL_NUMBER_CAPTURE_DESIGN.ambiguityPolicy, 'review_required_never_guess');
    assert.ok(YG_LIVE_PERSONAL_NUMBER_CAPTURE_DESIGN.excludeSignals.includes('exclude_from_titan'));
  });
});

describe('YG-LIVE-001 acceptance + cutover (prepare only)', () => {
  it('covers Owner/Admin/Technician/Client click-paths', () => {
    assert.ok(countYgLiveAcceptanceSteps() >= 12);
    assert.ok(countYgLiveAcceptanceSteps('Owner') >= 6);
    assert.ok(countYgLiveAcceptanceSteps('Admin') >= 1);
    assert.ok(countYgLiveAcceptanceSteps('Technician') >= 1);
    assert.ok(countYgLiveAcceptanceSteps('Client') >= 1);
    assert.ok(YG_LIVE_OWNER_ACCEPTANCE_CHECKLIST.every((s) => s.clickPath && s.expect && s.mustNot));
  });

  it('cutover plan is complete and non-executing', () => {
    const phases = new Set(YG_LIVE_CUTOVER_PLAN.map((s) => s.phase));
    for (const required of [
      'PRECHECK',
      'BACKUP',
      'PRODUCTION_MIGRATION',
      'CONFIG',
      'USERS',
      'PROVIDERS',
      'SMOKE_TEST',
      'OWNER_ACCEPTANCE',
      'ROLLBACK_CRITERIA',
    ]) {
      assert.ok(phases.has(required as never), required);
    }
    assert.ok(YG_LIVE_CUTOVER_PLAN.every((s) => s.executeInThisPhase === false));
    assert.ok(YG_LIVE_PRODUCTION_PREREQUISITES.length >= 10);
    assert.deepEqual(YG_LIVE_WORKFLOW_CHAIN[0], 'Lead');
    assert.deepEqual(YG_LIVE_WORKFLOW_CHAIN.at(-1), 'Owner Dashboard');
  });

  it('hard-stop detector catches WhatsApp/finance/tenant risks', () => {
    assert.equal(isYgLiveHardStop('risk of losing WhatsApp phone access'), true);
    assert.equal(isYgLiveHardStop('wrong Xero organisation'), true);
    assert.equal(isYgLiveHardStop('routine UI copy tweak'), false);
  });
});
