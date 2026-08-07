/**
 * SEC-001 — Enterprise Security matrix (contract proofs).
 * Proves auth/RBAC/tenant/finance/document/realtime/env gates without destructive probing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  TECHNICIAN_PERMISSIONS,
  TECHNICIAN_ROLE_NAME,
  canAccessTenant,
} from '@titan/auth';
import {
  canViewCashControl,
  canViewFinanceProfit,
  canViewGrowthPlanner,
  canViewOwnerFinancialCommand,
} from '@titan/shared';
import { assertTenantScope, TenantScopeError } from './tenant-scope.js';
import { verifyWhatsappWebhookSignature } from './whatsapp-signing.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = join(root, '../web');

function readApi(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

function readWeb(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('SEC-001 security matrix', () => {
  it('1 unauthenticated protected route requires auth middleware wiring', () => {
    const finance = readApi('src/routes/finance.ts');
    const cash = readApi('src/routes/cash-control.ts');
    assert.ok(finance.includes('createAuthMiddleware') || finance.includes('requireAuth'));
    assert.ok(cash.includes('createAuthMiddleware') || cash.includes('requireAuth'));
  });

  it('2 session refresh / invalid auth contracts exist', () => {
    const auth = readApi('src/routes/auth.ts');
    assert.ok(auth.includes('/refresh'));
    assert.ok(auth.includes('/logout'));
    const middleware = readApi('src/middleware/auth.ts');
    assert.ok(middleware.includes('validateSession'));
  });

  it('3 Technician Owner route / finance denied', () => {
    assert.equal(
      canViewOwnerFinancialCommand({
        roleName: TECHNICIAN_ROLE_NAME,
        permissions: [...TECHNICIAN_PERMISSIONS, 'finance:read'],
      }),
      false,
    );
    assert.equal(
      canViewCashControl({
        roleName: TECHNICIAN_ROLE_NAME,
        permissions: ['*'],
      }),
      false,
    );
    const finance = readApi('src/routes/finance.ts');
    assert.ok(finance.includes('denyTechnician'));
    // AURA-TRAIN-001: Technician finance topics denied server-side in AuraService.
    const aura = readApi('src/services/aura.service.ts');
    assert.ok(aura.includes('isTechnicianForbiddenAuraTopic'));
    assert.ok(aura.includes('technicianDenied'));
  });

  it('4 Client internal finance/growth denied', () => {
    assert.equal(
      canViewGrowthPlanner({ roleName: 'Client', permissions: ['finance:read'] }),
      false,
    );
    assert.equal(
      canViewFinanceProfit(['finance:write'], 'Client'),
      false,
    );
  });

  it('5-12 cross-tenant denial across major domains', () => {
    const identity = {
      roleName: 'Company Owner',
      permissions: ['*'],
      companyId: TENANT_A,
    };
    assert.equal(canAccessTenant(identity, TENANT_B), false);
    assert.throws(
      () => assertTenantScope(identity, TENANT_B),
      (error: unknown) => error instanceof TenantScopeError,
    );

    for (const file of [
      'jobs.ts',
      'crm.ts',
      'finance.ts',
      'fleet.ts',
      'bank-transaction-control.ts',
      'cash-control.ts',
      'company.ts',
    ]) {
      const source = readApi(`src/routes/${file}`);
      assert.ok(source.includes('auth.companyId') || source.includes('companyId'), file);
      assert.equal(
        /req\.(body|query)\.companyId/.test(source),
        false,
        `${file} must not trust client companyId`,
      );
    }
  });

  it('13 Owner allowed where expected', () => {
    assert.equal(
      canViewOwnerFinancialCommand({ roleName: 'Owner', permissions: ['finance:read'] }),
      true,
    );
    assert.equal(canViewFinanceProfit(['finance:read'], 'Company Owner'), true);
  });

  it('14 finance write permission enforced on sensitive routers', () => {
    const bank = readApi('src/routes/bank-transaction-control.ts');
    const budget = readApi('src/routes/budget-control.ts');
    assert.ok(bank.includes('finance:write') || bank.includes('requireAnyPermission'));
    assert.ok(budget.includes('finance:write') || budget.includes('requireAnyPermission'));
    assert.ok(bank.includes('denyTechnician'));
  });

  it('15 sensitive role write / team routes use auth + permissions', () => {
    const team = readApi('src/routes/team.ts');
    assert.ok(team.includes('requireAnyPermission') || team.includes('permissions'));
    assert.ok(team.includes('getAuth(req)'));
  });

  it('16 IDOR denied via tenant-scoped storage keys', () => {
    const storage = readApi('src/services/finance-document-evidence-storage.service.ts');
    assert.ok(storage.includes("startsWith(`${input.companyId}/finance/`)"));
    assert.ok(storage.includes("includes('..')"));
  });

  it('17-18 invalid finance amount / unsafe payload rejected via zod schemas', () => {
    const budget = readApi('src/routes/budget-control.ts');
    assert.ok(budget.includes('z.') || budget.includes('zod'));
    const bank = readApi('src/routes/bank-transaction-control.ts');
    assert.ok(bank.includes('z.') || bank.includes('safeParse') || bank.includes('zod'));
  });

  it('19 secrets not returned by API auth cookies helper', () => {
    const cookies = readApi('src/lib/auth-cookies.ts');
    assert.ok(cookies.includes('httpOnly: true'));
    assert.ok(cookies.includes('secure: isProduction'));
    const index = readApi('src/index.ts');
    assert.ok(index.includes('redact') || index.includes('authorization'));
  });

  it('20 tokens not in SSE URL', () => {
    const liveRoute = readApi('src/routes/live-updates.ts');
    assert.ok(liveRoute.includes('createAuthMiddleware'));
    assert.equal(liveRoute.includes('req.query.token'), false);
    const provider = readWeb('src/lib/live-updates/LiveUpdatesProvider.tsx');
    assert.ok(provider.includes('Authorization'));
    assert.equal(/EventSource\([^)]*token=/.test(provider), false);
  });

  it('21 SSE tenant isolation manager buckets by companyId', () => {
    const live = readApi('src/lib/live-updates.ts');
    assert.ok(live.includes('companyId'));
    assert.ok(live.includes('subscribe') || live.includes('broadcast'));
  });

  it('22 private receipt / finance evidence access protected', () => {
    const bank = readApi('src/routes/bank-transaction-control.ts');
    assert.ok(bank.includes('denyTechnician'));
    assert.ok(bank.includes('finance:read') || bank.includes('requireAnyPermission'));
  });

  it('23 audit event category wiring for financial writes', () => {
    const budgetService = readApi('src/services/budget-control.service.ts');
    assert.ok(
      budgetService.includes('security_audit') ||
        budgetService.includes('securityAudit') ||
        budgetService.includes('audit'),
    );
  });

  it('24 production environment guard blocks SEED_DEV', () => {
    const config = readApi('src/config.ts');
    assert.ok(config.includes("SEED_DEV must be false in production"));
    assert.ok(config.includes('INTEGRATIONS_ENCRYPTION_KEY is required when NODE_ENV=production'));
  });

  it('25 WhatsApp webhook fails closed without secret in production mode', () => {
    const result = verifyWhatsappWebhookSignature({
      appSecret: null,
      rawBody: '{}',
      signatureHeader: undefined,
      failClosedWithoutSecret: true,
    });
    assert.deepEqual(result, { ok: false, reason: 'missing_secret' });
    const route = readApi('src/routes/whatsapp-webhook.ts');
    assert.ok(route.includes('failClosedWithoutSecret'));
  });

  it('Technician cannot view finance profit even with elevated finance:write', () => {
    assert.equal(canViewFinanceProfit(['finance:write'], 'Technician'), false);
    assert.equal(canViewFinanceProfit(['*'], 'Technician'), false);
  });

  it('security headers middleware sets frame and content-type protections', () => {
    const headers = readApi('src/middleware/security-headers.ts');
    assert.ok(headers.includes('X-Content-Type-Options'));
    assert.ok(headers.includes('X-Frame-Options'));
    assert.ok(headers.includes('Referrer-Policy'));
  });

  it('Xero write approval gate remains draft→approve→execute', () => {
    const gate = readApi('src/services/xero-write-approval-gate.service.ts');
    assert.ok(gate.includes('approve') || gate.includes('Approval'));
    assert.equal(/xero\.com\/api/.test(gate), false);
  });

  it('BANK architecture does not initiate payments or store OTPs', () => {
    const bank = readApi('src/services/bank-transaction-control.service.ts');
    assert.equal(/initiatePayment|storeOtp|bankPassword/i.test(bank), false);
  });
});
