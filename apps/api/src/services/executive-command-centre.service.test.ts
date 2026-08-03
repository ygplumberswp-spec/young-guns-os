import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DatabaseClient } from '@titan/db';
import {
  ExecutiveCommandCentreError,
  ExecutiveCommandCentreService,
  type EcActor,
} from './executive-command-centre.service.js';

/**
 * Stub database. Any read that reaches it returns no row, which is how a
 * tenant-filtered query behaves when the requested row belongs to another
 * company. Every touch is recorded so a denial can be proven to have happened
 * before any data access.
 */
function createStubDb() {
  const touches: string[] = [];
  const noRow = async () => {
    touches.push('read');
    return undefined;
  };
  const db = {
    query: {
      ecSettings: { findFirst: noRow },
      ecActionDrafts: { findFirst: noRow, findMany: async () => { touches.push('read'); return []; } },
      ecInsights: { findFirst: noRow, findMany: async () => { touches.push('read'); return []; } },
    },
    insert: () => {
      touches.push('write');
      return {
        values: () => ({
          onConflictDoNothing: () => ({ returning: async () => [] }),
          returning: async () => [],
        }),
      };
    },
    update: () => {
      touches.push('write');
      return { set: () => ({ where: () => ({ returning: async () => [] }) }) };
    },
    select: () => {
      touches.push('read');
      return { from: () => ({ where: () => ({ groupBy: async () => [] }) }) };
    },
  };
  return { db: db as unknown as DatabaseClient, touches };
}

function actor(roleName: string, permissions: string[] = [], companyId = 'company-a'): EcActor {
  return { companyId, userId: 'user-1', roleName, permissions };
}

const NON_OWNER_ROLES = [
  'Technician',
  'Client',
  'Manager',
  'Dispatcher',
  'Accountant',
  'Office Admin',
  'Staff',
];

describe('ExecutiveCommandCentreService — Owner-only enforcement', () => {
  it('denies every non-owner role on every endpoint, even with wildcard permissions', async () => {
    for (const roleName of NON_OWNER_ROLES) {
      const { db, touches } = createStubDb();
      const service = new ExecutiveCommandCentreService(db);
      const who = actor(roleName, ['*', 'executive:read', 'finance:read', 'agents:read']);

      const calls: Array<[string, () => Promise<unknown>]> = [
        ['getDashboard', () => service.getDashboard(who)],
        ['getSettings', () => service.getSettings(who)],
        ['updateSettings', () => service.updateSettings(who, { riskDetectionEnabled: false })],
        ['listActionDrafts', () => service.listActionDrafts(who)],
        [
          'createActionDraft',
          () => service.createActionDraft(who, { title: 't', body: 'b' }),
        ],
        [
          'decideActionDraft',
          () => service.decideActionDraft(who, 'action-1', { decision: 'approve' }),
        ],
        ['refreshActionDrafts', () => service.refreshActionDrafts(who, {})],
        ['listInsights', () => service.listInsights(who)],
        ['createInsight', () => service.createInsight(who, { title: 't', insight: 'i' })],
        [
          'acknowledgeInsight',
          () => service.acknowledgeInsight(who, 'insight-1', { status: 'acknowledged' }),
        ],
      ];

      for (const [name, call] of calls) {
        await assert.rejects(
          call,
          (error: unknown) => {
            assert.ok(
              error instanceof ExecutiveCommandCentreError,
              `${roleName}/${name} threw the wrong error type`,
            );
            assert.equal(error.code, 'FORBIDDEN', `${roleName}/${name} must be FORBIDDEN`);
            assert.match(error.message, /Owner only/);
            return true;
          },
          `${roleName} must be denied on ${name}`,
        );
      }

      // Denial must happen before any database access.
      assert.deepEqual(touches, [], `${roleName} must not reach the database`);
    }
  });

  it('allows owner roles past the access gate', async () => {
    for (const roleName of ['Company Owner', 'Owner', 'Platform Owner']) {
      const { db } = createStubDb();
      const service = new ExecutiveCommandCentreService(db);
      // The stub returns no rows, so this fails on data rather than on access.
      await assert.rejects(
        () => service.getSettings(actor(roleName)),
        (error: unknown) => {
          assert.ok(error instanceof ExecutiveCommandCentreError);
          assert.notEqual(error.code, 'FORBIDDEN', `${roleName} must pass the access gate`);
          return true;
        },
      );
    }
  });
});

describe('ExecutiveCommandCentreService — tenant isolation', () => {
  it('refuses to link an action draft that the tenant filter did not return', async () => {
    const { db } = createStubDb();
    const service = new ExecutiveCommandCentreService(db);
    // A draft id belonging to another company yields no row under the
    // companyId filter, so the insight must be rejected rather than linked.
    await assert.rejects(
      () =>
        service.createInsight(actor('Company Owner'), {
          title: 'Cross tenant attempt',
          insight: 'Linking a draft from another company.',
          sourceActionId: '00000000-0000-0000-0000-000000000001',
        }),
      (error: unknown) => {
        assert.ok(error instanceof ExecutiveCommandCentreError);
        assert.equal(error.code, 'NOT_FOUND');
        assert.match(error.message, /Source action draft not found/);
        return true;
      },
    );
  });

  it('refuses to decide an action draft the tenant filter did not return', async () => {
    const { db } = createStubDb();
    const service = new ExecutiveCommandCentreService(db);
    await assert.rejects(
      () =>
        service.decideActionDraft(actor('Company Owner'), 'other-company-action', {
          decision: 'approve',
        }),
      (error: unknown) => {
        assert.ok(error instanceof ExecutiveCommandCentreError);
        assert.equal(error.code, 'NOT_FOUND');
        return true;
      },
    );
  });

  it('refuses to acknowledge an insight the tenant filter did not return', async () => {
    const { db } = createStubDb();
    const service = new ExecutiveCommandCentreService(db);
    await assert.rejects(
      () =>
        service.acknowledgeInsight(actor('Company Owner'), 'other-company-insight', {
          status: 'acknowledged',
        }),
      (error: unknown) => {
        assert.ok(error instanceof ExecutiveCommandCentreError);
        assert.equal(error.code, 'NOT_FOUND');
        return true;
      },
    );
  });
});
