/**
 * YG-LIVE-001 — Contract proofs (no production mutation, no provider writes).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  TECHNICIAN_PERMISSIONS,
  TECHNICIAN_ROLE_NAME,
} from '@titan/auth';
import {
  YG_LIVE_CUTOVER_PLAN,
  YG_LIVE_STAGING_COMPANY_ID,
  YG_LIVE_WHATSAPP_COEXISTENCE,
  YG_LIVE_WORKFLOW_CHAIN,
  canViewOwnerFinancialCommand,
  isYgLiveHardStop,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));

function readApi(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

describe('YG-LIVE-001 contracts', () => {
  it('preserves canonical Young Guns company id constant', () => {
    assert.equal(YG_LIVE_STAGING_COMPANY_ID, '095aef76-fef5-4139-af37-a42f2d7e2faf');
    assert.deepEqual(YG_LIVE_WORKFLOW_CHAIN.slice(0, 3), ['Lead', 'Customer', 'Property']);
  });

  it('WhatsApp coexistence remains eligibility-gated (no blind migration)', () => {
    assert.equal(YG_LIVE_WHATSAPP_COEXISTENCE.result, 'REQUIRES_META_ELIGIBILITY_CHECK');
    assert.equal(YG_LIVE_WHATSAPP_COEXISTENCE.titanEmbeddedSignupCoexistenceImplemented, false);
    assert.ok(YG_LIVE_CUTOVER_PLAN.every((step) => step.executeInThisPhase === false));
  });

  it('Technician finance denial remains server-side in AURA + Owner finance', () => {
    assert.equal(
      canViewOwnerFinancialCommand({
        roleName: TECHNICIAN_ROLE_NAME,
        permissions: [...TECHNICIAN_PERMISSIONS, 'finance:read'],
      }),
      false,
    );
    const aura = readApi('./aura.service.ts');
    assert.match(aura, /isTechnicianForbiddenAuraTopic/);
    assert.match(aura, /technicianDenied/);
  });

  it('hard-stop detector covers phone-access and Xero risks', () => {
    assert.equal(isYgLiveHardStop('risk of deleting historical chats'), true);
    assert.equal(isYgLiveHardStop('unsafe payment activation'), true);
  });

  it('read-only inventory script refuses production ref', () => {
    const script = readFileSync(
      join(here, '../../../../packages/db/scripts/yg-live-001-staging-inventory.mjs'),
      'utf8',
    );
    assert.match(script, /rshuiaghmtrvvilhqpwm/);
    assert.match(script, /REFUSED/);
    assert.match(script, /095aef76-fef5-4139-af37-a42f2d7e2faf/);
    assert.doesNotMatch(script, /delete from/i);
    assert.doesNotMatch(script, /insert into/i);
  });
});
