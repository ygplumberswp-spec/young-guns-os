/**
 * YG-CUTOVER-001 — Contract proofs (no production mutation).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  TECHNICIAN_PERMISSIONS,
  TECHNICIAN_ROLE_NAME,
  INVITE_ALLOWED_ROLE_NAMES,
  MANAGER_ROLE_NAME,
} from '@titan/auth';
import {
  YG_CUTOVER_MIGRATION_PLAN,
  YG_CUTOVER_OWNER_CLICKPATH,
  YG_CUTOVER_ROLLBACK_TRIGGERS,
  buildYgCutoverDecisionCard,
  canViewOwnerFinancialCommand,
  isYgCutoverTechnicianForbiddenSurface,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));

describe('YG-CUTOVER-001 contracts', () => {
  it('Owner click-path has 13 ordered steps and migration is non-executing', () => {
    assert.equal(YG_CUTOVER_OWNER_CLICKPATH.length, 13);
    assert.ok(YG_CUTOVER_MIGRATION_PLAN.every((s) => s.executeInThisPhase === false));
    assert.ok(YG_CUTOVER_ROLLBACK_TRIGGERS.includes('tenant/RBAC leak'));
  });

  it('team invites allow Manager/Technician but not Owner/Client via invite set', () => {
    assert.equal(INVITE_ALLOWED_ROLE_NAMES.has(MANAGER_ROLE_NAME), true);
    assert.equal(INVITE_ALLOWED_ROLE_NAMES.has(TECHNICIAN_ROLE_NAME), true);
    assert.equal(INVITE_ALLOWED_ROLE_NAMES.has('Company Owner'), false);
    assert.equal(INVITE_ALLOWED_ROLE_NAMES.has('Client'), false);
  });

  it('Technician hard denials remain for finance and Owner surfaces', () => {
    assert.equal(
      canViewOwnerFinancialCommand({
        roleName: TECHNICIAN_ROLE_NAME,
        permissions: [...TECHNICIAN_PERMISSIONS, 'finance:read'],
      }),
      false,
    );
    assert.equal(isYgCutoverTechnicianForbiddenSurface('bank'), true);
    assert.equal(isYgCutoverTechnicianForbiddenSurface('crm_list'), true);
    const aura = readFileSync(join(here, './aura.service.ts'), 'utf8');
    assert.match(aura, /technicianDenied/);
  });

  it('decision card stays BLOCKED without credentials and never treats prompt as GO', () => {
    const card = buildYgCutoverDecisionCard({
      userAudit: {
        status: 'blocked_no_credentials',
        companyId: '095aef76-fef5-4139-af37-a42f2d7e2faf',
        auditedAt: null,
        users: [],
        roleCounts: {},
        missingSlots: ['admin-office', 'technician'],
        p0Closed: false,
        note: 'blocked',
      },
    });
    assert.equal(card.verdict, 'BLOCKED');
    assert.equal(card.explicitOwnerApprovalRequired, 'YES');
    assert.equal(card.thisPromptIsNotApproval, true);
  });

  it('user audit script refuses production and invents no people', () => {
    const script = readFileSync(
      join(here, '../../../../packages/db/scripts/yg-cutover-001-user-audit.mjs'),
      'utf8',
    );
    assert.match(script, /rshuiaghmtrvvilhqpwm/);
    assert.match(script, /REFUSED|BLOCKED/);
    assert.doesNotMatch(script, /insert into users/i);
    assert.doesNotMatch(script, /createInvite\(/);
  });
});
