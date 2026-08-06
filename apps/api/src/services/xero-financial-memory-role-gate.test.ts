import test from 'node:test';
import assert from 'node:assert/strict';
import {
  XeroFinancialMemoryError,
  XeroFinancialMemoryService,
} from './xero-financial-memory.service.js';

/**
 * The tenant's owner role is named "Company Owner" in every seeded company. Staging proved the
 * consequence: the Owner's own request for a customer's Xero financial history came back 403
 * "restricted to Owner, Admin, Accountant and Manager roles".
 */
const PAST_THE_GATE = 'reached the customer lookup';

function serviceWithGateProbe() {
  const db = {
    query: {
      customers: {
        findFirst: async () => {
          throw new Error(PAST_THE_GATE);
        },
      },
    },
  };

  return new XeroFinancialMemoryService(
    db as unknown as ConstructorParameters<typeof XeroFinancialMemoryService>[0],
    {} as unknown as ConstructorParameters<typeof XeroFinancialMemoryService>[1],
  );
}

async function attempt(role: string): Promise<'allowed' | 'forbidden'> {
  const service = serviceWithGateProbe();
  try {
    await service.getCustomerFinancialHistory(
      { companyId: 'company-1', userId: 'user-1', role },
      'customer-1',
    );
    throw new Error('expected the probe to throw');
  } catch (error) {
    if (error instanceof XeroFinancialMemoryError && error.code === 'FORBIDDEN') return 'forbidden';
    if (error instanceof Error && error.message === PAST_THE_GATE) return 'allowed';
    throw error;
  }
}

test('the Company Owner can read the financial history built for them', async () => {
  assert.equal(await attempt('Company Owner'), 'allowed');
  assert.equal(await attempt('company owner'), 'allowed');
});

test('the finance roles keep their access', async () => {
  for (const role of ['Owner', 'Admin', 'Accountant', 'Manager']) {
    assert.equal(await attempt(role), 'allowed', role);
  }
});

test('technician, dispatcher, client and platform-wide roles stay denied', async () => {
  for (const role of ['Technician', 'Dispatcher', 'Client', 'Member', 'Platform Owner']) {
    assert.equal(await attempt(role), 'forbidden', role);
  }
});
