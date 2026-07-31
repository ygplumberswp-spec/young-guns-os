import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listMissionControlSnapshots } from './tenant-capability-mission-control.js';

describe('tenant capability mission control snapshots', () => {
  it('includes only attention-required capabilities', () => {
    const snapshots = listMissionControlSnapshots([
      {
        id: '1',
        slug: 'healthy-cap',
        name: 'Healthy',
        status: 'active',
        healthState: { status: 'healthy' },
      },
      {
        id: '2',
        slug: 'failed-cap',
        name: 'Failed',
        status: 'failed_deployment',
        healthState: { status: 'failed' },
      },
      { id: '3', slug: 'draft-cap', name: 'Draft', status: 'draft', healthState: null },
      {
        id: '4',
        slug: 'approval-cap',
        name: 'Approval',
        status: 'awaiting_approval',
        healthState: null,
      },
    ]);

    assert.equal(snapshots.length, 2);
    assert.equal(
      snapshots.some((item) => item.metrics.capabilityId === '2'),
      true,
    );
    assert.equal(
      snapshots.some((item) => item.metrics.capabilityId === '4'),
      true,
    );
    assert.equal(
      snapshots.every((item) => String(item.metrics.manageHref).includes('/aura/capabilities/')),
      true,
    );
  });
});
