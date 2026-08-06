import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import {
  ACCOUNTANT_PERMISSIONS,
  ACCOUNTANT_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  DISPATCHER_PERMISSIONS,
  DISPATCHER_ROLE_NAME,
  LEGACY_MEMBER_ROLE_NAME,
  LEGACY_OWNER_ROLE_NAME,
  MANAGER_PERMISSIONS,
  MANAGER_ROLE_NAME,
  MEMBER_PERMISSIONS,
  OWNER_PERMISSIONS,
  PLATFORM_CROSS_TENANT_PERMISSION,
  PLATFORM_OWNER_ROLE_NAME,
  TECHNICIAN_PERMISSIONS,
  TECHNICIAN_ROLE_NAME,
  type StaffIdentity,
} from '@titan/auth';
import type { DatabaseClient } from '@titan/db';
import { createRequireTenantCompanyParam } from '../middleware/authorization-guards.js';
import {
  assertTenantScope,
  resolveScopedCompanyId,
  TenantScopeError,
} from './tenant-scope.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

type RoleFixture = {
  label: string;
  roleName: string;
  permissions: readonly string[];
};

/** Canonical staff roles that must never cross tenant boundaries. */
const STAFF_ROLE_FIXTURES: RoleFixture[] = [
  { label: 'Company Owner', roleName: COMPANY_OWNER_ROLE_NAME, permissions: OWNER_PERMISSIONS },
  { label: 'Legacy Owner', roleName: LEGACY_OWNER_ROLE_NAME, permissions: OWNER_PERMISSIONS },
  { label: 'Manager', roleName: MANAGER_ROLE_NAME, permissions: MANAGER_PERMISSIONS },
  { label: 'Dispatcher', roleName: DISPATCHER_ROLE_NAME, permissions: DISPATCHER_PERMISSIONS },
  { label: 'Accountant', roleName: ACCOUNTANT_ROLE_NAME, permissions: ACCOUNTANT_PERMISSIONS },
  { label: 'Technician', roleName: TECHNICIAN_ROLE_NAME, permissions: TECHNICIAN_PERMISSIONS },
  { label: 'Legacy Member', roleName: LEGACY_MEMBER_ROLE_NAME, permissions: MEMBER_PERMISSIONS },
];

/**
 * Pilot-critical API domains (execution plan risk #4).
 * Each domain maps to service queries filtered by auth.companyId.
 */
const TENANT_SCOPED_DOMAINS = [
  'jobs',
  'customers',
  'leads',
  'finance_quotes',
  'finance_invoices',
  'finance_payments',
  'inventory',
  'scheduling',
  'team',
  'procurement',
  'fleet',
] as const;

function staffIdentity(
  fixture: RoleFixture,
  companyId = TENANT_A,
): StaffIdentity & { companyId: string } {
  return {
    roleName: fixture.roleName,
    permissions: [...fixture.permissions],
    companyId,
  };
}

function expectCrossTenantDenied(fn: () => void): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof TenantScopeError);
    assert.equal(error.code, 'CROSS_TENANT_DENIED');
    return true;
  });
}

const routesDir = join(dirname(fileURLToPath(import.meta.url)), '../routes');

function readRouteSource(filename: string): string {
  return readFileSync(join(routesDir, filename), 'utf8');
}

describe('cross-tenant denial matrix — role × resource scope', () => {
  for (const fixture of STAFF_ROLE_FIXTURES) {
    for (const domain of TENANT_SCOPED_DOMAINS) {
      it(`denies ${fixture.label} cross-tenant access to ${domain}`, () => {
        const identity = staffIdentity(fixture);
        expectCrossTenantDenied(() => assertTenantScope(identity, TENANT_B));
      });
    }
  }

  it('allows Platform Owner cross-tenant for every pilot domain', () => {
    const platformOwner = {
      roleName: PLATFORM_OWNER_ROLE_NAME,
      permissions: ['*', PLATFORM_CROSS_TENANT_PERMISSION],
      companyId: TENANT_A,
    };
    for (const _domain of TENANT_SCOPED_DOMAINS) {
      assert.doesNotThrow(() => assertTenantScope(platformOwner, TENANT_B));
    }
  });
});

describe('cross-tenant denial matrix — forged tenant selection', () => {
  for (const fixture of STAFF_ROLE_FIXTURES) {
    it(`rejects ${fixture.label} forged companyId query`, () => {
      const identity = staffIdentity(fixture);
      assert.equal(resolveScopedCompanyId(identity, null), TENANT_A);
      expectCrossTenantDenied(() => resolveScopedCompanyId(identity, TENANT_B));
    });
  }

  it('allows Platform Owner to scope another tenant explicitly', () => {
    const platformOwner = {
      roleName: PLATFORM_OWNER_ROLE_NAME,
      permissions: ['*', PLATFORM_CROSS_TENANT_PERMISSION],
      companyId: TENANT_A,
    };
    assert.equal(resolveScopedCompanyId(platformOwner, TENANT_B), TENANT_B);
  });
});

describe('cross-tenant denial matrix — key route wiring', () => {
  const routeChecks: Array<{
    file: string;
    mustInclude: string[];
    mustExclude?: string[];
  }> = [
    {
      file: 'jobs.ts',
      mustInclude: [
        'jobsService.getJob(companyId',
        'getAuth(req)',
      ],
    },
    {
      file: 'crm.ts',
      mustInclude: [
        'crmService.getCustomer(\n        companyId,',
        'getAuth(req)',
      ],
    },
    {
      file: 'leads.ts',
      mustInclude: [
        'leadsService.getLeadDetail(companyId',
        'getAuth(req)',
      ],
    },
    {
      file: 'finance.ts',
      mustInclude: [
        'financeService.getQuoteDetail(auth.companyId',
        'financeService.getInvoiceDetail(auth.companyId',
        'getAuth(req)',
      ],
    },
    {
      file: 'inventory.ts',
      mustInclude: [
        'inventoryService.listItems(auth.companyId',
        'getAuth(req)',
      ],
    },
    {
      file: 'scheduling.ts',
      mustInclude: ['getAuth(req)', 'auth.companyId'],
    },
    {
      file: 'team.ts',
      mustInclude: ['teamService.listRoles(auth.companyId', 'getAuth(req)'],
    },
    {
      file: 'procurement.ts',
      mustInclude: ['getAuth(req)', '{ companyId } = getAuth(req)'],
    },
    {
      file: 'fleet.ts',
      mustInclude: ['getAuth(req)', '{ companyId } = getAuth(req)'],
    },
  ];

  for (const check of routeChecks) {
    it(`${check.file} scopes detail/list handlers to auth.companyId`, () => {
      const source = readRouteSource(check.file);
      for (const pattern of check.mustInclude) {
        assert.ok(source.includes(pattern), `${check.file} missing tenant scope wiring: ${pattern}`);
      }
      for (const pattern of check.mustExclude ?? []) {
        assert.equal(source.includes(pattern), false, `${check.file} must not use ${pattern}`);
      }
      assert.equal(
        /req\.(body|query|params)\.companyId/.test(source),
        false,
        `${check.file} must not trust client-supplied companyId`,
      );
    });
  }
});

describe('cross-tenant denial matrix — tenant company param guard', () => {
  const mockDb = {
    insert: () => ({
      values: async () => undefined,
    }),
  } as unknown as DatabaseClient;

  const guard = createRequireTenantCompanyParam(mockDb, (req) => {
    const value = req.params.companyId;
    return Array.isArray(value) ? value[0] : value;
  });

  async function invokeGuard(input: {
    roleName: string;
    permissions: string[];
    companyId: string;
    targetCompanyId: string;
  }): Promise<{ status: number; body: unknown }> {
    let status = 200;
    let body: unknown;

    const req = {
      params: { companyId: input.targetCompanyId },
      path: '/platform/companies/:companyId',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'denial-matrix-test' },
      auth: {
        userId: 'user-test',
        companyId: input.companyId,
        roleName: input.roleName,
        permissions: input.permissions,
      },
    } as unknown as Request;

    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as Response;

    let nextCalled = false;
    await guard(req, res, () => {
      nextCalled = true;
    });

    return { status: nextCalled ? status : status, body };
  }

  it('returns 403 when Company Owner targets another tenant company param', async () => {
    const result = await invokeGuard({
      roleName: COMPANY_OWNER_ROLE_NAME,
      permissions: [...OWNER_PERMISSIONS],
      companyId: TENANT_A,
      targetCompanyId: TENANT_B,
    });
    assert.equal(result.status, 403);
    assert.deepEqual(result.body, {
      error: { code: 'FORBIDDEN', message: 'You cannot access another company' },
    });
  });

  it('allows Platform Owner to target another tenant company param', async () => {
    const result = await invokeGuard({
      roleName: PLATFORM_OWNER_ROLE_NAME,
      permissions: ['*', PLATFORM_CROSS_TENANT_PERMISSION],
      companyId: TENANT_A,
      targetCompanyId: TENANT_B,
    });
    assert.equal(result.status, 200);
  });
});
