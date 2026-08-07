import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  buildOwnerFinancialAttentionQueue,
  canViewOwnerFinancialCommand,
  separateEconomicAndCashProfit,
} from '@titan/shared';
import { OwnerFinancialCommandError } from './owner-financial-command.service.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('FIN-001 OwnerFinancialCommandService invariants', () => {
  it('blocks technician and client', () => {
    assert.equal(
      canViewOwnerFinancialCommand({ roleName: 'Technician', permissions: ['finance:read'] }),
      false,
    );
    assert.equal(
      canViewOwnerFinancialCommand({ roleName: 'Client', permissions: ['portal.invoices:read'] }),
      false,
    );
    assert.equal(
      canViewOwnerFinancialCommand({ roleName: 'Owner', permissions: ['finance:read'] }),
      true,
    );
  });

  it('OwnerFinancialCommandError carries FORBIDDEN', () => {
    const err = new OwnerFinancialCommandError('FORBIDDEN', 'blocked');
    assert.equal(err.code, 'FORBIDDEN');
  });

  it('keeps economic and cash profit separate', () => {
    const split = separateEconomicAndCashProfit({
      knownGrossProfitCents: 100,
      knownRealisedCashProfitCents: 40,
    });
    assert.equal(split.areSeparate, true);
    assert.notEqual(split.economicProfitCents, split.cashProfitCents);
  });

  it('attention queue surfaces unexplained debit and loss job', () => {
    const items = buildOwnerFinancialAttentionQueue({
      cashIssues: {
        unexplainedDebits: { count: 1, amountCents: 720000 },
        unexplainedCredits: { count: 0, amountCents: 0 },
        partialAllocations: { count: 0, amountCents: 0 },
        missingReceipts: { count: 1, amountCents: 1000 },
        unknownSuppliers: { count: 0, amountCents: 0 },
        unpaidJobCosts: { count: 1, amountCents: 5000 },
        outstandingCustomerInvoices: { count: 0, amountCents: 0 },
      },
      costQueue: {
        summary: {
          completedJobsNeedingReview: 1,
          missingLabourJobs: 0,
          missingCostEvidence: 0,
          unallocatedCostsCents: 0,
          unallocatedCostsCount: 0,
          outstandingCustomerCashCents: 0,
          lowMarginJobs: 1,
          lossJobs: 1,
          provisionalProfitabilityJobs: 0,
        },
        marginProblems: [],
        completedJobsNeedingReview: [],
        missingLabour: [],
        missingMaterialCost: [],
        provisionalProfitability: [],
      },
      overdueCents: 10000,
      overdueCount: 1,
    });
    assert.ok(items.some((i) => i.kind === 'unexplained_debit'));
    assert.ok(items.some((i) => i.kind === 'loss_job'));
    assert.ok(items.some((i) => i.kind === 'missing_receipt'));
    assert.ok(items.some((i) => i.kind === 'unpaid_job_cost'));
  });

  it('tenant scope contract on service queries', () => {
    const source = readFileSync(join(here, 'owner-financial-command.service.ts'), 'utf8');
    assert.ok(source.includes('eq(invoices.companyId, companyId)'));
    assert.ok(source.includes('eq(jobProfitabilitySnapshots.companyId, companyId)'));
    assert.ok(source.includes('getOwnerQueue(actor.companyId'));
    assert.ok(source.includes('cashControlService.getSummary'));
  });

  it('does not invent bank balance field', () => {
    const source = readFileSync(join(here, 'owner-financial-command.service.ts'), 'utf8');
    assert.ok(source.includes('knownNetCashMovementCents'));
    assert.equal(source.includes('bankBalance'), false);
  });
});
