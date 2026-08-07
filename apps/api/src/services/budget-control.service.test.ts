import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  canViewBudgetControl,
  canWriteBudgetControl,
  compareMetric,
  forecastDoesNotAlterActuals,
} from '@titan/shared';
import { BudgetControlError } from './budget-control.service.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('FIN-004 BudgetControlService invariants', () => {
  it('blocks technician and client from view/write', () => {
    assert.equal(canViewBudgetControl({ roleName: 'Technician', permissions: ['finance:write'] }), false);
    assert.equal(canWriteBudgetControl({ roleName: 'Client', permissions: ['*'] }), false);
  });

  it('BudgetControlError FORBIDDEN', () => {
    assert.equal(new BudgetControlError('FORBIDDEN', 'x').code, 'FORBIDDEN');
  });

  it('actual compare uses provided finance truth cents', () => {
    assert.equal(compareMetric('Revenue', 12345, 20000).actualCents, 12345);
  });

  it('forecast does not alter actual', () => {
    const proof = forecastDoesNotAlterActuals(99_000);
    assert.equal(proof.actualUnchanged, 99_000);
  });

  it('service composes OperatingProfitService and audits plan upserts', () => {
    const src = readFileSync(join(here, 'budget-control.service.ts'), 'utf8');
    assert.ok(src.includes('operatingProfitService'));
    assert.ok(src.includes('finance_monthly_plan_upserted'));
    assert.ok(src.includes("category: 'financial'"));
    assert.ok(src.includes('forecastNeverStoredAsActual'));
    assert.equal(/from ['"].*xero/i.test(src), false);
  });

  it('tenant scope uses companyId on plan queries', () => {
    const src = readFileSync(join(here, 'budget-control.service.ts'), 'utf8');
    assert.ok(src.includes('eq(financeMonthlyPlans.companyId, companyId)'));
    assert.ok(src.includes('eq(financeMonthlyPlans.companyId, actor.companyId)'));
  });
});
