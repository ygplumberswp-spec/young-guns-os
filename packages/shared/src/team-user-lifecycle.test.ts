import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchesUserDeleteConfirmation,
  summarizeHardDeleteEligibility,
  USER_HARD_DELETE_REFUSED_MESSAGE,
  YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY,
} from './team-user-lifecycle.js';

describe('YG-CUTOVER-001A team user lifecycle contracts', () => {
  it('confirmation matches email or display name case-insensitively', () => {
    assert.equal(
      matchesUserDeleteConfirmation({
        confirmation: 'Tech Smoke',
        email: 'tech.smoke@example.com',
        firstName: 'Tech',
        lastName: 'Smoke',
      }),
      true,
    );
    assert.equal(
      matchesUserDeleteConfirmation({
        confirmation: 'tech.smoke@example.com',
        email: 'tech.smoke@example.com',
        firstName: 'Tech',
        lastName: 'Smoke',
      }),
      true,
    );
    assert.equal(
      matchesUserDeleteConfirmation({
        confirmation: 'wrong',
        email: 'tech.smoke@example.com',
        firstName: 'Tech',
        lastName: 'Smoke',
      }),
      false,
    );
  });

  it('hard delete refused message is exact when blockers exist', () => {
    const refused = summarizeHardDeleteEligibility([
      { code: 'TIME_ENTRIES', label: 'Time entries', count: 2 },
    ]);
    assert.equal(refused.canHardDelete, false);
    assert.equal(refused.refusalMessage, USER_HARD_DELETE_REFUSED_MESSAGE);
    assert.equal(
      USER_HARD_DELETE_REFUSED_MESSAGE,
      'This user has business history and cannot be permanently deleted. Deactivate access instead.',
    );

    const ok = summarizeHardDeleteEligibility([
      { code: 'TIME_ENTRIES', label: 'Time entries', count: 0 },
    ]);
    assert.equal(ok.canHardDelete, true);
    assert.equal(ok.refusalMessage, null);
  });

  it('staging inventory never auto-deletes and protects canonical Owner', () => {
    assert.ok(YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY.length >= 8);
    assert.ok(
      YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY.every((row) => row.autoDeleteAllowed === false),
    );
    const owner = YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY.find((row) =>
      row.displayName.toLowerCase().includes('canonical company owner'),
    );
    assert.ok(owner);
    assert.equal(owner?.classification, 'REQUIRED_FOR_TEST_HARNESS');
  });
});
