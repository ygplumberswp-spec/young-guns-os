import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFcpActionDraftsFromSignals,
  buildFcpCashflowIntelligence,
  buildFcpInsightDraftsFromSignals,
  buildFcpProfitIntelligence,
  canAccessFinanceCashflowProfit,
  canApproveFinanceCashflowProfit,
  canWriteFinanceCashflowProfit,
  FCP_PRODUCT_COPY,
  listFcpAuraConnections,
  unavailableFcpCashflow,
  unavailableFcpProfit,
} from './finance-cashflow-profit.js';

describe('finance cashflow & profit intelligence', () => {
  it('RBAC extends Finance AURA Agent — Technician/Client denied; Owner approves', () => {
    assert.equal(
      canAccessFinanceCashflowProfit({ roleName: 'Technician', permissions: ['finance:write'] }),
      false,
    );
    assert.equal(
      canAccessFinanceCashflowProfit({ roleName: 'Client', permissions: ['*'] }),
      false,
    );
    assert.equal(
      canAccessFinanceCashflowProfit({ roleName: 'Company Owner', permissions: [] }),
      true,
    );
    assert.equal(
      canWriteFinanceCashflowProfit({ roleName: 'Accountant', permissions: ['finance:write'] }),
      true,
    );
    assert.equal(
      canApproveFinanceCashflowProfit({
        roleName: 'Accountant',
        permissions: ['finance:write'],
      }),
      false,
    );
    assert.equal(
      canApproveFinanceCashflowProfit({ roleName: 'Company Owner', permissions: [] }),
      true,
    );
  });

  it('cashflow unavailable without invoices/payments — never invents', () => {
    const empty = buildFcpCashflowIntelligence({
      invoices: [],
      payments: [],
      purchaseOrders: [],
    });
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.incomeCents, null);
    assert.equal(empty.expenseCents, null);
    assert.equal(empty.cashPositionCents, null);
    assert.ok(empty.gaps.length > 0);
    assert.deepEqual(unavailableFcpCashflow().availability, 'unavailable');
  });

  it('cashflow income from payments; expense unavailable without POs', () => {
    const now = new Date('2026-08-03T12:00:00.000Z');
    const result = buildFcpCashflowIntelligence({
      now,
      invoices: [
        {
          id: 'inv-1',
          status: 'overdue',
          totalCents: 10_000,
          amountCents: 10_000,
          amountPaidCents: 0,
          dueDate: '2026-07-01T00:00:00.000Z',
          issuedAt: '2026-06-01T00:00:00.000Z',
          createdAt: '2026-06-01T00:00:00.000Z',
          xeroInvoiceNumber: 'XERO-1',
        },
      ],
      payments: [
        {
          id: 'pay-1',
          amountCents: 5_000,
          paidAt: '2026-08-01T00:00:00.000Z',
          xeroPaymentId: null,
        },
      ],
      purchaseOrders: [],
    });
    assert.equal(result.availability, 'available');
    assert.equal(result.incomeCents, 5_000);
    assert.equal(result.expenseCents, null);
    assert.equal(result.cashPositionCents, null);
    assert.equal(result.overdueInvoiceCount, 1);
    assert.equal(result.xero.availability, 'available');
    assert.ok(result.gaps.some((g) => g.toLowerCase().includes('expense')));
    assert.ok(result.warnings.length >= 1);
  });

  it('profit margins unavailable without real unit costs', () => {
    const result = buildFcpProfitIntelligence({
      jobs: [{ id: 'job-1', jobNumber: 'J-1', title: 'Geyser install', jobType: 'install' }],
      invoices: [
        {
          jobId: 'job-1',
          status: 'paid',
          totalCents: 20_000,
          amountCents: 20_000,
          amountPaidCents: 20_000,
        },
      ],
      materialLines: [
        {
          jobId: 'job-1',
          status: 'used',
          quantity: '2',
          fulfilledQuantity: null,
          unitCostCents: 0,
          materialSource: 'warehouse_stock',
          inventoryItemId: null,
        },
      ],
      inventoryItemsWithCost: 0,
    });
    assert.equal(result.availability, 'available');
    assert.equal(result.revenueCents, 20_000);
    assert.equal(result.costCents, null);
    assert.equal(result.marginCents, null);
    assert.equal(result.inventoryCostAvailability, 'unavailable');
    assert.equal(result.byJob[0]?.costAvailability, 'unavailable');
    assert.deepEqual(unavailableFcpProfit().availability, 'unavailable');
  });

  it('profit margin computed only when material unit costs exist', () => {
    const result = buildFcpProfitIntelligence({
      jobs: [{ id: 'job-1', jobNumber: 'J-1', title: 'Leak repair', jobType: 'repair' }],
      invoices: [
        {
          jobId: 'job-1',
          status: 'paid',
          totalCents: 10_000,
          amountCents: 10_000,
          amountPaidCents: 10_000,
        },
      ],
      materialLines: [
        {
          jobId: 'job-1',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: null,
          unitCostCents: 4_000,
          materialSource: 'warehouse_stock',
          inventoryItemId: 'item-1',
        },
      ],
      inventoryItemsWithCost: 1,
    });
    assert.equal(result.costCents, 4_000);
    assert.equal(result.marginCents, 6_000);
    assert.equal(result.marginBps, 6_000);
    assert.equal(result.inventoryCostAvailability, 'available');
  });

  it('insight/action drafts never invent when both unavailable', () => {
    const cashflow = unavailableFcpCashflow();
    const profit = unavailableFcpProfit();
    assert.equal(buildFcpInsightDraftsFromSignals({ cashflow, profit }).length, 0);
    const actions = buildFcpActionDraftsFromSignals({ cashflow, profit });
    assert.ok(actions.every((a) => a.kind !== 'collections_push' || cashflow.overdueInvoiceCount > 0));
  });

  it('product copy and aura connections present', () => {
    assert.ok(FCP_PRODUCT_COPY.financeAuraAgent.includes('Finance AURA Agent'));
    const links = listFcpAuraConnections();
    assert.ok(links.some((l) => l.href === '/finance-aura-agent'));
    assert.ok(links.some((l) => l.target === 'xero_settings'));
  });

  it('cashflow exposes incoming payments (30d) and risks from real rows', () => {
    const now = new Date('2026-08-03T12:00:00.000Z');
    const result = buildFcpCashflowIntelligence({
      now,
      invoices: [
        {
          id: 'inv-1',
          status: 'overdue',
          totalCents: 10_000,
          amountCents: 10_000,
          amountPaidCents: 0,
          dueDate: '2026-07-01T00:00:00.000Z',
          issuedAt: '2026-06-01T00:00:00.000Z',
          createdAt: '2026-06-01T00:00:00.000Z',
          xeroInvoiceNumber: null,
        },
      ],
      payments: [
        {
          id: 'pay-recent',
          amountCents: 3_000,
          paidAt: '2026-07-20T00:00:00.000Z',
          xeroPaymentId: null,
        },
        {
          id: 'pay-old',
          amountCents: 2_000,
          paidAt: '2026-05-01T00:00:00.000Z',
          xeroPaymentId: null,
        },
      ],
      purchaseOrders: [],
    });
    assert.equal(result.incomingPaymentsCents, 3_000);
    assert.equal(result.incomingPaymentCount, 1);
    assert.equal(result.incomeCents, 5_000);
    assert.ok(result.risks.length >= 1);
  });

  it('labour minutes from timesheets; labour cost stays unavailable', () => {
    const result = buildFcpProfitIntelligence({
      jobs: [{ id: 'job-1', jobNumber: 'J-1', title: 'Service', jobType: 'repair' }],
      invoices: [
        {
          jobId: 'job-1',
          status: 'paid',
          totalCents: 10_000,
          amountCents: 10_000,
          amountPaidCents: 10_000,
        },
      ],
      materialLines: [
        {
          jobId: 'job-1',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: null,
          unitCostCents: 2_000,
          materialSource: 'warehouse_stock',
          inventoryItemId: 'item-1',
        },
      ],
      labourByJob: [{ jobId: 'job-1', durationMinutes: 90 }],
      inventoryItemsWithCost: 1,
    });
    assert.equal(result.labourMinutesTotal, 90);
    assert.equal(result.labourCostCents, null);
    assert.equal(result.labourCostAvailability, 'unavailable');
    assert.equal(result.byJob[0]?.labourMinutes, 90);
    assert.equal(result.byJob[0]?.labourCostCents, null);
    assert.equal(result.materialCostCents, 2_000);
  });

  it('insight drafts include outstanding money and poor performing services', () => {
    const cashflow = buildFcpCashflowIntelligence({
      now: new Date('2026-08-03T12:00:00.000Z'),
      invoices: [
        {
          id: 'inv-1',
          status: 'sent',
          totalCents: 8_000,
          amountCents: 8_000,
          amountPaidCents: 0,
          dueDate: '2026-09-01T00:00:00.000Z',
          issuedAt: '2026-08-01T00:00:00.000Z',
          createdAt: '2026-08-01T00:00:00.000Z',
          xeroInvoiceNumber: null,
        },
      ],
      payments: [
        {
          id: 'pay-1',
          amountCents: 1_000,
          paidAt: '2026-08-02T00:00:00.000Z',
          xeroPaymentId: null,
        },
      ],
      purchaseOrders: [],
    });
    const profit = buildFcpProfitIntelligence({
      jobs: [
        { id: 'job-1', jobNumber: 'J-1', title: 'Leak', jobType: 'repair' },
        { id: 'job-2', jobNumber: 'J-2', title: 'Leak 2', jobType: 'repair' },
      ],
      invoices: [
        {
          jobId: 'job-1',
          status: 'paid',
          totalCents: 5_000,
          amountCents: 5_000,
          amountPaidCents: 5_000,
        },
        {
          jobId: 'job-2',
          status: 'paid',
          totalCents: 5_000,
          amountCents: 5_000,
          amountPaidCents: 5_000,
        },
      ],
      materialLines: [
        {
          jobId: 'job-1',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: null,
          unitCostCents: 4_500,
          materialSource: 'warehouse_stock',
          inventoryItemId: 'i1',
        },
        {
          jobId: 'job-2',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: null,
          unitCostCents: 4_500,
          materialSource: 'warehouse_stock',
          inventoryItemId: 'i1',
        },
      ],
      inventoryItemsWithCost: 1,
    });
    const drafts = buildFcpInsightDraftsFromSignals({ cashflow, profit });
    assert.ok(drafts.some((d) => d.kind === 'outstanding_money'));
    assert.ok(drafts.some((d) => d.kind === 'poor_performing_service'));
  });

});
