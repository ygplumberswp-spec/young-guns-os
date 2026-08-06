import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  answerFinanceAuraQuestion,
  buildFinanceAuraAlertDraftsFromSignals,
  buildFinanceAuraBusinessContext,
  buildFinanceAuraRecommendationDraftsFromSignals,
  canAccessFinanceAuraAgent,
  canApproveFinanceAuraAgent,
  canWriteFinanceAuraAgent,
  emptyFinanceAuraXeroLinkStatus,
  FINANCE_AURA_AGENT_PRODUCT_COPY,
  getFinanceAuraAgentIdentity,
  listFinanceAuraAuraConnections,
  unavailableFinanceAuraBusinessContext,
} from './finance-aura-agent.js';

describe('finance aura agent foundation', () => {
  it('RBAC: Owner + finance perms; Technician/Client denied; Owner approves', () => {
    assert.equal(
      canAccessFinanceAuraAgent({
        roleName: 'Manager',
        permissions: ['finance:read'],
      }),
      true,
    );
    assert.equal(
      canAccessFinanceAuraAgent({
        roleName: 'Technician',
        permissions: ['*', 'finance:write'],
      }),
      false,
    );
    assert.equal(
      canAccessFinanceAuraAgent({
        roleName: 'Client',
        permissions: ['finance:read'],
      }),
      false,
    );
    assert.equal(
      canAccessFinanceAuraAgent({
        roleName: 'Company Owner',
        permissions: [],
      }),
      true,
    );
    assert.equal(
      canWriteFinanceAuraAgent({
        roleName: 'Manager',
        permissions: ['finance:read'],
      }),
      false,
    );
    assert.equal(
      canWriteFinanceAuraAgent({
        roleName: 'Accountant',
        permissions: ['finance:write'],
      }),
      true,
    );
    assert.equal(
      canApproveFinanceAuraAgent({
        roleName: 'Accountant',
        permissions: ['finance:write'],
      }),
      false,
    );
    assert.equal(
      canApproveFinanceAuraAgent({
        roleName: 'Company Owner',
        permissions: ['finance:write'],
      }),
      true,
    );
    assert.equal(
      canApproveFinanceAuraAgent({
        roleName: 'Platform Owner',
        permissions: [],
      }),
      true,
    );
  });

  it('never invents financial context when empty', () => {
    const empty = unavailableFinanceAuraBusinessContext();
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.outstandingReceivableCents, null);
    assert.equal(empty.overdueAmountCents, null);
    assert.equal(empty.recentPaymentTotalCents, null);
    assert.equal(empty.xero.availability, 'unavailable');
    assert.equal(empty.xero.connectionStatus, null);

    const xero = emptyFinanceAuraXeroLinkStatus();
    assert.equal(xero.availability, 'unavailable');
    assert.ok(xero.rationale.toLowerCase().includes('not invented') || xero.rationale.includes('not invented'));
  });

  it('builds context only from provided real counts', () => {
    const ctx = buildFinanceAuraBusinessContext({
      invoiceCount: 2,
      paymentCount: 1,
      jobLinkedInvoiceCount: 1,
      customerWithInvoicesCount: 1,
      outstandingReceivableCents: 50000,
      overdueInvoiceCount: 1,
      overdueAmountCents: 25000,
      paidInFullInvoiceCount: 1,
      recentPaymentCount30d: 1,
      recentPaymentTotalCents: 10000,
      xero: {
        availability: 'available',
        connectionStatus: 'connected',
        lastSyncAt: null,
        invoicesWithXeroNumber: 1,
        paymentsWithXeroId: 0,
        rationale: 'Connected with imported markers.',
      },
    });
    assert.equal(ctx.availability, 'available');
    assert.equal(ctx.outstandingReceivableCents, 50000);
    assert.ok(ctx.summary.includes('2 invoice'));
  });

  it('recommendation/alert drafts are grounded and never auto-execute', () => {
    const drafts = buildFinanceAuraRecommendationDraftsFromSignals({
      overdueInvoices: [
        {
          invoiceId: '11111111-1111-1111-1111-111111111111',
          customerId: '22222222-2222-2222-2222-222222222222',
          outstandingCents: 12000,
          currency: 'ZAR',
          daysOverdue: 14,
        },
      ],
      outstandingReceivableCents: 12000,
      recentPaymentCount30d: 0,
      invoiceCount: 1,
      paymentCount: 0,
      xero: emptyFinanceAuraXeroLinkStatus(),
      jobUnlinkedOpenInvoiceCount: 1,
      currency: 'ZAR',
    });
    assert.ok(drafts.length >= 2);
    assert.ok(drafts.some((d) => d.kind === 'collections'));
    assert.ok(drafts.every((d) => d.recommendation.toLowerCase().includes('draft') || d.recommendation.includes('Owner') || d.recommendation.includes('not')));

    const alerts = buildFinanceAuraAlertDraftsFromSignals({
      overdueInvoices: [
        {
          invoiceId: '11111111-1111-1111-1111-111111111111',
          customerId: null,
          outstandingCents: 12000,
          currency: 'ZAR',
          daysOverdue: 14,
        },
      ],
      outstandingReceivableCents: 12000,
      recentPaymentCount30d: 0,
      invoiceCount: 1,
      paymentCount: 0,
      xero: emptyFinanceAuraXeroLinkStatus(),
      jobUnlinkedOpenInvoiceCount: 0,
      currency: 'ZAR',
    });
    assert.ok(alerts.some((a) => a.kind === 'overdue_invoices'));
  });

  it('question answers stay honest when unavailable', () => {
    const answer = answerFinanceAuraQuestion({
      question: 'What is overdue?',
      context: unavailableFinanceAuraBusinessContext(),
    });
    assert.equal(answer.availability, 'unavailable');
    assert.equal(answer.autoExecuted, false);
    assert.ok(answer.answer.toLowerCase().includes('unavailable') || answer.answer.includes('not invent'));
  });

  it('identity registers finance with Command Centre / Agent Network keys', () => {
    const identity = getFinanceAuraAgentIdentity();
    assert.equal(identity.agentKey, 'finance');
    assert.equal(identity.registry.commandCentreKey, 'finance');
    assert.equal(identity.registry.agentNetworkKey, 'finance');
    assert.equal(identity.autoExecuteFinancialMutations, false);
    assert.ok(identity.capabilities.includes('draft_finance_recommendation'));

    const connections = listFinanceAuraAuraConnections();
    assert.ok(connections.some((c) => c.target === 'command_centre'));
    assert.ok(connections.some((c) => c.target === 'xero_settings'));
    assert.ok(FINANCE_AURA_AGENT_PRODUCT_COPY.thisLayer.includes('Finance AURA Agent'));
  });
});
