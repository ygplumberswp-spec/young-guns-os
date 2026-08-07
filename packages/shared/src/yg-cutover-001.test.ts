import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  YG_CUTOVER_ADMIN_ACCEPTANCE,
  YG_CUTOVER_CLIENT_ACCEPTANCE,
  YG_CUTOVER_COMPANY_CONFIG,
  YG_CUTOVER_MIGRATION_PLAN,
  YG_CUTOVER_OWNER_CLICKPATH,
  YG_CUTOVER_PRODUCTION_PRECHECK,
  YG_CUTOVER_PROVIDER_READINESS,
  YG_CUTOVER_REQUIRED_USER_SLOTS,
  YG_CUTOVER_ROLLBACK_TRIGGERS,
  YG_CUTOVER_TECHNICIAN_ACCEPTANCE,
  buildYgCutoverDecisionCard,
  classifyYgCutoverRoleFamily,
  evaluateYgCutoverUserSlots,
  isYgCutoverTechnicianForbiddenSurface,
  maskYgCutoverEmail,
} from './yg-cutover-001.js';
import {
  canViewCashControl,
  canViewOwnerFinancialCommand,
  getAuraRoleAccessRule,
  isTechnicianForbiddenAuraTopic,
} from './index.js';

describe('YG-CUTOVER-001 user slots', () => {
  it('requires Owner, Admin/Office, Technician individual slots without inventing people', () => {
    assert.ok(YG_CUTOVER_REQUIRED_USER_SLOTS.some((s) => s.slotId === 'owner' && s.minCount === 1));
    assert.ok(YG_CUTOVER_REQUIRED_USER_SLOTS.some((s) => s.slotId === 'admin-office' && s.minCount === 1));
    assert.ok(YG_CUTOVER_REQUIRED_USER_SLOTS.some((s) => s.slotId === 'technician' && s.minCount === 1));
    assert.equal(classifyYgCutoverRoleFamily('Company Owner'), 'Owner');
    assert.equal(classifyYgCutoverRoleFamily('Manager'), 'Admin');
    assert.equal(classifyYgCutoverRoleFamily('Technician'), 'Technician');
    assert.equal(maskYgCutoverEmail('owner@younggunsplumbingcpt.co.za')?.includes('***'), true);
  });

  it('marks P0 open when Admin/Technician missing', () => {
    const onlyOwner = evaluateYgCutoverUserSlots([
      {
        idPrefix: 'aaaaaaaa',
        emailMasked: 'o***r@example.com',
        roleName: 'Company Owner',
        roleFamily: 'Owner',
        isActive: true,
        mfaConfigured: null,
        invitePending: false,
      },
    ]);
    assert.equal(onlyOwner.p0Closed, false);
    assert.ok(onlyOwner.missingSlots.includes('admin-office'));
    assert.ok(onlyOwner.missingSlots.includes('technician'));
  });

  it('marks P0 closed only when Owner+Admin+Technician present', () => {
    const full = evaluateYgCutoverUserSlots([
      {
        idPrefix: '11111111',
        emailMasked: 'o***r@example.com',
        roleName: 'Owner',
        roleFamily: 'Owner',
        isActive: true,
        mfaConfigured: true,
        invitePending: false,
      },
      {
        idPrefix: '22222222',
        emailMasked: 'a***n@example.com',
        roleName: 'Manager',
        roleFamily: 'Admin',
        isActive: true,
        mfaConfigured: false,
        invitePending: false,
      },
      {
        idPrefix: '33333333',
        emailMasked: 't***h@example.com',
        roleName: 'Technician',
        roleFamily: 'Technician',
        isActive: true,
        mfaConfigured: false,
        invitePending: false,
      },
    ]);
    assert.equal(full.p0Closed, true);
    assert.deepEqual(full.missingSlots, []);
  });
});

describe('YG-CUTOVER-001 hard role verification', () => {
  it('Technician finance/Owner surfaces denied', () => {
    assert.equal(getAuraRoleAccessRule('Technician')?.mayAccessCompanyFinance, false);
    assert.equal(
      canViewOwnerFinancialCommand({
        roleName: 'Technician',
        permissions: ['finance:read', 'jobs:read'],
      }),
      false,
    );
    assert.equal(canViewCashControl({ roleName: 'Technician', permissions: ['*'] }), false);
    assert.equal(isTechnicianForbiddenAuraTopic('Show payroll and bank transactions'), true);
    assert.equal(isYgCutoverTechnicianForbiddenSurface('finance'), true);
    assert.equal(isYgCutoverTechnicianForbiddenSurface('owner dashboard'), true);
    assert.equal(isYgCutoverTechnicianForbiddenSurface('job_card'), false);
  });
});

describe('YG-CUTOVER-001 acceptance + migration', () => {
  it('Owner click-path covers 13 required actions', () => {
    assert.equal(YG_CUTOVER_OWNER_CLICKPATH.length, 13);
    assert.equal(YG_CUTOVER_OWNER_CLICKPATH[0]?.id, 'owner-login');
    assert.equal(YG_CUTOVER_OWNER_CLICKPATH.at(-1)?.id, 'owner-integrations');
    assert.ok(YG_CUTOVER_ADMIN_ACCEPTANCE.length >= 5);
    assert.ok(YG_CUTOVER_TECHNICIAN_ACCEPTANCE.some((s) => s.id === 'tech-forbid-finance'));
    assert.ok(YG_CUTOVER_CLIENT_ACCEPTANCE.some((s) => s.id === 'client-deny-other'));
  });

  it('migration plan is non-executing and includes rollback triggers', () => {
    assert.ok(YG_CUTOVER_MIGRATION_PLAN.every((s) => s.executeInThisPhase === false));
    assert.ok(YG_CUTOVER_ROLLBACK_TRIGGERS.includes('wrong Xero organisation'));
    assert.ok(YG_CUTOVER_PRODUCTION_PRECHECK.length >= 10);
    assert.equal(YG_CUTOVER_PROVIDER_READINESS.xero.status, 'PASS');
    assert.equal(YG_CUTOVER_PROVIDER_READINESS.debt.yocoLivePayments, 'explicit Owner GO only');
    assert.ok(YG_CUTOVER_COMPANY_CONFIG.every((c) => typeof c.blocksCutover === 'boolean'));
  });
});

describe('YG-CUTOVER-001 decision card', () => {
  it('returns BLOCKED when Owner/user credentials unavailable', () => {
    const card = buildYgCutoverDecisionCard({
      userAudit: {
        status: 'blocked_no_credentials',
        companyId: '095aef76-fef5-4139-af37-a42f2d7e2faf',
        auditedAt: null,
        users: [],
        roleCounts: {},
        missingSlots: ['admin-office', 'technician'],
        p0Closed: false,
        note: 'No DATABASE_URL',
      },
    });
    assert.equal(card.verdict, 'BLOCKED');
    assert.equal(card.p0Closed, 'NO');
    assert.equal(card.productionReady, 'NO');
    assert.equal(card.explicitOwnerApprovalRequired, 'YES');
    assert.equal(card.thisPromptIsNotApproval, true);
  });

  it('returns NOT_READY when audit shows only Owner', () => {
    const card = buildYgCutoverDecisionCard({
      userAudit: {
        status: 'stale_evidence',
        companyId: '095aef76-fef5-4139-af37-a42f2d7e2faf',
        auditedAt: '2026-08-01T00:00:00.000Z',
        users: [
          {
            idPrefix: '095aef76',
            emailMasked: 'y***p@gmail.com',
            roleName: 'Owner',
            roleFamily: 'Owner',
            isActive: true,
            mfaConfigured: null,
            invitePending: false,
          },
        ],
        roleCounts: { Owner: 1 },
        missingSlots: ['admin-office', 'technician'],
        p0Closed: false,
        note: 'cleanup audit',
      },
    });
    assert.equal(card.verdict, 'NOT_READY');
    assert.equal(card.productionReady, 'NO');
  });

  it('returns READY only when verified P0 users closed', () => {
    const card = buildYgCutoverDecisionCard({
      userAudit: {
        status: 'verified',
        companyId: '095aef76-fef5-4139-af37-a42f2d7e2faf',
        auditedAt: '2026-08-07T00:00:00.000Z',
        users: [
          {
            idPrefix: 'a',
            emailMasked: 'o***r@example.com',
            roleName: 'Owner',
            roleFamily: 'Owner',
            isActive: true,
            mfaConfigured: true,
            invitePending: false,
          },
          {
            idPrefix: 'b',
            emailMasked: 'a***n@example.com',
            roleName: 'Manager',
            roleFamily: 'Admin',
            isActive: true,
            mfaConfigured: false,
            invitePending: false,
          },
          {
            idPrefix: 'c',
            emailMasked: 't***h@example.com',
            roleName: 'Technician',
            roleFamily: 'Technician',
            isActive: true,
            mfaConfigured: false,
            invitePending: false,
          },
        ],
        roleCounts: { Owner: 1, Manager: 1, Technician: 1 },
        missingSlots: [],
        p0Closed: true,
        note: 'live audit',
      },
    });
    assert.equal(card.verdict, 'READY');
    assert.equal(card.p0Closed, 'YES');
    assert.equal(card.productionReady, 'YES');
    assert.equal(card.explicitOwnerApprovalRequired, 'YES');
  });
});
