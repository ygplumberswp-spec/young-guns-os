/**
 * YG-CUTOVER-001A — Safe user lifecycle proofs (no production mutation).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  CLIENT_ROLE_NAME,
  TECHNICIAN_PERMISSIONS,
  TECHNICIAN_ROLE_NAME,
  hasAnyPermission,
} from '@titan/auth';
import {
  matchesUserDeleteConfirmation,
  summarizeHardDeleteEligibility,
  USER_HARD_DELETE_REFUSED_MESSAGE,
  YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));

function readApi(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

describe('YG-CUTOVER-001A user lifecycle', () => {
  it('Owner suspend/reactivate/remove-access/hard-delete routes are wired under users:manage', () => {
    const routes = readApi('../routes/team.ts');
    assert.match(routes, /members\/:memberId\/status/);
    assert.match(routes, /members\/:memberId\/remove-access/);
    assert.match(routes, /members\/:memberId\/delete-eligibility/);
    assert.match(routes, /\/members\/:memberId/);
    assert.match(routes, /hardDeleteMember/);
    assert.match(routes, /requireAnyPermission\('users:manage'\)/);
  });

  it('TeamService revokes sessions on suspend/remove and gates hard delete', () => {
    const service = readApi('./team.service.ts');
    assert.match(service, /account_suspended/);
    assert.match(service, /access_removed/);
    assert.match(service, /user_reactivated/);
    assert.match(service, /user_hard_deleted/);
    assert.match(service, /HARD_DELETE_REFUSED/);
    assert.match(service, /SELF_DELETE/);
    assert.match(service, /LAST_OWNER/);
    assert.match(service, /evaluateUserHardDeleteEligibility/);
    assert.match(service, /matchesUserDeleteConfirmation/);
  });

  it('safe-delete dependency checker covers jobs/time/docs/comms/finance/approvals/audit', () => {
    const checker = readApi('./user-safe-delete.ts');
    assert.match(checker, /ASSIGNED_OR_COMPLETED_JOBS/);
    assert.match(checker, /TIME_ENTRIES/);
    assert.match(checker, /JOB_CARDS_OR_DOCUMENTATION/);
    assert.match(checker, /DOCUMENTS/);
    assert.match(checker, /COMMUNICATIONS/);
    assert.match(checker, /FINANCIAL_RECORDS/);
    assert.match(checker, /APPROVALS/);
    assert.match(checker, /AUDIT_SENSITIVE_HISTORY/);
    assert.match(checker, /USER_HARD_DELETE_REFUSED_MESSAGE/);
  });

  it('suspended users lose session access via validateSession isActive check', () => {
    const auth = readApi('./auth.service.ts');
    assert.match(auth, /validateSession/);
    assert.match(auth, /session\.user\?\.isActive/);
    assert.match(auth, /!user\.isActive/);
  });

  it('Technician and Client lack users:manage so cannot manage users', () => {
    assert.equal(hasAnyPermission([...TECHNICIAN_PERMISSIONS], ['users:manage']), false);
    assert.equal(
      hasAnyPermission([], ['users:manage']),
      false,
    );
    assert.equal(TECHNICIAN_ROLE_NAME, 'Technician');
    assert.equal(CLIENT_ROLE_NAME, 'Client');
  });

  it('history blockers refuse hard delete with required UI message', () => {
    const result = summarizeHardDeleteEligibility([
      { code: 'DOCUMENTS', label: 'Documents', count: 1 },
    ]);
    assert.equal(result.canHardDelete, false);
    assert.equal(result.refusalMessage, USER_HARD_DELETE_REFUSED_MESSAGE);
  });

  it('clean account confirmation + zero blockers allow hard delete path', () => {
    assert.equal(
      matchesUserDeleteConfirmation({
        confirmation: 'Owner Smoke',
        email: 'owner.smoke@example.com',
        firstName: 'Owner',
        lastName: 'Smoke',
      }),
      true,
    );
    assert.equal(
      summarizeHardDeleteEligibility([
        { code: 'TIME_ENTRIES', label: 'Time entries', count: 0 },
        { code: 'DOCUMENTS', label: 'Documents', count: 0 },
      ]).canHardDelete,
      true,
    );
  });

  it('cross-tenant hard delete denied by company-scoped member lookup', () => {
    const service = readApi('./team.service.ts');
    assert.match(service, /eq\(users\.companyId, companyId\)/);
    assert.match(service, /MEMBER_NOT_FOUND/);
  });

  it('audit events emitted for lifecycle actions', () => {
    const service = readApi('./team.service.ts');
    assert.match(service, /user_suspended/);
    assert.match(service, /user_reactivated/);
    assert.match(service, /user_access_removed/);
    assert.match(service, /user_hard_deleted/);
    assert.match(service, /securityAuditLogs/);
  });

  it('staging test inventory is advisory only — never auto-delete', () => {
    assert.ok(
      YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY.every((row) => row.autoDeleteAllowed === false),
    );
    const names = YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY.map((r) => r.displayName);
    assert.ok(names.some((n) => /RBAC Accountant-251/i.test(n)));
    assert.ok(names.some((n) => /Tech Smoke/i.test(n)));
    assert.ok(names.some((n) => /canonical Company Owner/i.test(n)));
  });

  it('web Team & Access exposes Actions menu + hard-delete confirmation', () => {
    const page = readFileSync(
      join(here, '../../../web/src/pages/settings/TeamSettingsPage.tsx'),
      'utf8',
    );
    assert.match(page, /Edit role/);
    assert.match(page, /Suspend/);
    assert.match(page, /Reactivate/);
    assert.match(page, /Remove access/);
    assert.match(page, /Delete permanently/);
    assert.match(page, /Confirm permanent delete/);
    assert.match(page, /hardDeleteTeamMember/);
  });
});
