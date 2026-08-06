import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  ACCOUNTANT_PERMISSIONS,
  ACCOUNTANT_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  DISPATCHER_PERMISSIONS,
  DISPATCHER_ROLE_NAME,
  LEGACY_MEMBER_ROLE_NAME,
  MANAGER_PERMISSIONS,
  MANAGER_ROLE_NAME,
  MEMBER_PERMISSIONS,
  OWNER_PERMISSIONS,
  TECHNICIAN_PERMISSIONS,
  TECHNICIAN_ROLE_NAME,
  type StaffIdentity,
} from '@titan/auth';
import {
  evaluatePilotApiAction,
  isPilotApiActionDenied,
  PILOT_API_ACTIONS,
  type PilotApiAction,
} from './role-forbidden-api-action.js';

type RoleFixture = {
  label: string;
  identity: StaffIdentity;
};

const ROLE_FIXTURES: RoleFixture[] = [
  {
    label: 'Company Owner',
    identity: { roleName: COMPANY_OWNER_ROLE_NAME, permissions: [...OWNER_PERMISSIONS] },
  },
  {
    label: 'Manager',
    identity: { roleName: MANAGER_ROLE_NAME, permissions: [...MANAGER_PERMISSIONS] },
  },
  {
    label: 'Dispatcher',
    identity: { roleName: DISPATCHER_ROLE_NAME, permissions: [...DISPATCHER_PERMISSIONS] },
  },
  {
    label: 'Accountant',
    identity: { roleName: ACCOUNTANT_ROLE_NAME, permissions: [...ACCOUNTANT_PERMISSIONS] },
  },
  {
    label: 'Technician',
    identity: { roleName: TECHNICIAN_ROLE_NAME, permissions: [...TECHNICIAN_PERMISSIONS] },
  },
  {
    label: 'Legacy Member',
    identity: { roleName: LEGACY_MEMBER_ROLE_NAME, permissions: [...MEMBER_PERMISSIONS] },
  },
];

/** Expected denial matrix — pilot-critical forbidden actions by role. */
const EXPECTED_DENIALS: Record<string, PilotApiAction[]> = {
  Technician: [
    'finance.quotes.create',
    'finance.quotes.list',
    'dispatch.schedule.write',
    'team.invites.create',
    'integrations.manage',
    'customers.create',
    'inventory.stock.write',
    'agents.manage',
    'boq.create',
    'documents.pack.approve',
  ],
  Accountant: [
    'dispatch.schedule.write',
    'team.invites.create',
    'customers.create',
    'inventory.stock.write',
    'agents.manage',
  ],
  Dispatcher: [
    'finance.quotes.create',
    'team.invites.create',
    'integrations.manage',
    'inventory.stock.write',
    'agents.manage',
    'boq.create',
  ],
  'Legacy Member': [
    'finance.quotes.create',
    'finance.quotes.list',
    'dispatch.schedule.write',
    'team.invites.create',
    'integrations.manage',
    'customers.create',
    'inventory.stock.write',
    'agents.manage',
    'boq.create',
    'documents.pack.approve',
  ],
};

const EXPECTED_ALLOWS: Record<string, PilotApiAction[]> = {
  'Company Owner': PILOT_API_ACTIONS.map((action) => action.id),
  Manager: PILOT_API_ACTIONS.map((action) => action.id),
  Accountant: [
    'finance.quotes.create',
    'finance.quotes.list',
    'integrations.manage',
    'boq.create',
    'documents.pack.approve',
  ],
  Dispatcher: [
    'finance.quotes.list',
    'dispatch.schedule.write',
    'customers.create',
    'documents.pack.approve',
  ],
};

const routesDir = join(dirname(fileURLToPath(import.meta.url)), '../routes');

function readRouteSource(filename: string): string {
  return readFileSync(join(routesDir, filename), 'utf8');
}

describe('role-forbidden API action — pilot action catalog', () => {
  it('defines ten pilot-critical domain actions', () => {
    assert.equal(PILOT_API_ACTIONS.length, 10);
    const domains = new Set(PILOT_API_ACTIONS.map((action) => action.domain));
    assert.ok(domains.has('finance'));
    assert.ok(domains.has('scheduling'));
    assert.ok(domains.has('integrations'));
  });
});

describe('role-forbidden API action — expected denial matrix', () => {
  for (const fixture of ROLE_FIXTURES) {
    const expectedDenied = EXPECTED_DENIALS[fixture.label] ?? [];
    for (const actionId of expectedDenied) {
      it(`denies ${fixture.label} for ${actionId}`, () => {
        const decision = evaluatePilotApiAction(fixture.identity, actionId);
        assert.equal(decision.allowed, false, `${fixture.label} should be denied ${actionId}`);
      });
    }

    const expectedAllowed = EXPECTED_ALLOWS[fixture.label] ?? [];
    for (const actionId of expectedAllowed) {
      it(`allows ${fixture.label} for ${actionId}`, () => {
        const decision = evaluatePilotApiAction(fixture.identity, actionId);
        assert.equal(decision.allowed, true, `${fixture.label} should be allowed ${actionId}`);
      });
    }
  }
});

describe('role-forbidden API action — technician owner-module guard', () => {
  it('blocks technician from finance routes before permission check', () => {
    const decision = evaluatePilotApiAction(
      { roleName: TECHNICIAN_ROLE_NAME, permissions: ['finance:write'] },
      'finance.quotes.create',
    );
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.reason, 'technician_owner_module');
    }
  });

  it('blocks technician from BOQ and document pack approve actions', () => {
    for (const actionId of ['boq.create', 'documents.pack.approve'] as const) {
      assert.equal(
        isPilotApiActionDenied(
          { roleName: TECHNICIAN_ROLE_NAME, permissions: ['finance:write', 'documents:write'] },
          actionId,
        ),
        true,
        actionId,
      );
    }
  });
});

describe('role-forbidden API action — dispatcher vs accountant finance boundary', () => {
  it('allows dispatcher finance read but denies finance write', () => {
    const dispatcher = ROLE_FIXTURES.find((fixture) => fixture.label === 'Dispatcher')!.identity;
    assert.equal(evaluatePilotApiAction(dispatcher, 'finance.quotes.list').allowed, true);
    assert.equal(evaluatePilotApiAction(dispatcher, 'finance.quotes.create').allowed, false);
  });

  it('allows accountant finance write but denies dispatch schedule write', () => {
    const accountant = ROLE_FIXTURES.find((fixture) => fixture.label === 'Accountant')!.identity;
    assert.equal(evaluatePilotApiAction(accountant, 'finance.quotes.create').allowed, true);
    assert.equal(evaluatePilotApiAction(accountant, 'dispatch.schedule.write').allowed, false);
  });
});

describe('role-forbidden API action — key route permission wiring', () => {
  const routeChecks: Array<{ file: string; mustInclude: string[] }> = [
    {
      file: 'finance.ts',
      mustInclude: [
        "requireAnyPermission('finance:write')",
        "requireAnyPermission('finance:read', 'finance:write')",
        'createDenyTechnicianFromOwnerModules',
      ],
    },
    {
      file: 'scheduling.ts',
      mustInclude: ["requireAnyPermission('dispatch:write')"],
    },
    {
      file: 'team.ts',
      mustInclude: ["requireAnyPermission('users:manage')"],
    },
    {
      file: 'integrations.ts',
      mustInclude: ["requireAnyPermission('integrations:manage')"],
    },
    {
      file: 'boq.ts',
      mustInclude: [
        "requireAnyPermission('finance:write')",
        'createDenyTechnicianFromOwnerModules',
      ],
    },
    {
      file: 'job-document-packs.ts',
      mustInclude: [
        "requireAnyPermission('documents:write')",
        'createDenyTechnicianFromOwnerModules',
      ],
    },
  ];

  for (const check of routeChecks) {
    it(`${check.file} wires pilot forbidden-action permissions`, () => {
      const source = readRouteSource(check.file);
      for (const pattern of check.mustInclude) {
        assert.ok(source.includes(pattern), `${check.file} missing: ${pattern}`);
      }
    });
  }
});
