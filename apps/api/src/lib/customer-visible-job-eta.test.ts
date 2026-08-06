import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCustomerVisibleJobEtaAt } from './customer-visible-job-eta.js';

describe('resolveCustomerVisibleJobEtaAt', () => {
  it('returns scheduled window for open assigned jobs', () => {
    const scheduledAt = new Date('2026-08-01T10:00:00.000Z');
    const eta = resolveCustomerVisibleJobEtaAt({
      assignedUserId: 'tech-1',
      status: 'scheduled',
      scheduledAt,
      scheduledEndAt: null,
    });
    assert.equal(eta, scheduledAt.toISOString());
  });

  it('prefers scheduled end when present', () => {
    const scheduledEndAt = new Date('2026-08-01T12:00:00.000Z');
    const eta = resolveCustomerVisibleJobEtaAt({
      assignedUserId: 'tech-1',
      status: 'in_progress',
      scheduledAt: new Date('2026-08-01T10:00:00.000Z'),
      scheduledEndAt,
    });
    assert.equal(eta, scheduledEndAt.toISOString());
  });

  it('returns null when job is completed or unassigned', () => {
    assert.equal(
      resolveCustomerVisibleJobEtaAt({
        assignedUserId: 'tech-1',
        status: 'completed',
        scheduledAt: new Date(),
        scheduledEndAt: null,
      }),
      null,
    );
    assert.equal(
      resolveCustomerVisibleJobEtaAt({
        assignedUserId: null,
        status: 'scheduled',
        scheduledAt: new Date(),
        scheduledEndAt: null,
      }),
      null,
    );
  });
});
