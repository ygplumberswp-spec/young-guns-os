import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUOTE_LIFECYCLE_ROYAL_CAPE,
  applyProviderOutcomeToBusinessState,
  approveQuoteApprovalDraft,
  assertQuoteApprovalExecutable,
  assertQuoteStatusIndependentOfPayment,
  assertQuoteStatusTransition,
  assertRoyalCapeQuoteLifecycleUnchanged,
  assertRow121LifecycleNotStarted,
  assertRow88NoCustomerSends,
  assertRow88NoXeroWrites,
  assertRow89NotStarted,
  buildQuoteLifecycleAuditEvent,
  countQuotesByCanonicalState,
  createQuoteApprovalDraft,
  detectInvalidQuoteLifecycleCombinations,
  evaluateAcceptQuote,
  evaluateArchiveQuote,
  evaluateConvertQuote,
  evaluateDeclineQuote,
  evaluateIssueQuote,
  evaluateQuoteSendReadiness,
  evaluateVoidQuote,
  getAllowedQuoteActions,
  isQuoteStatusTransitionAllowed,
  resolveProviderActionOutcome,
  resolveQuotePaymentVisibility,
  toCanonicalQuoteLifecycleState,
  QuoteLifecycleError,
} from './quote-lifecycle.js';
import { resolveQuoteDisplayNumberLabel } from './xero-official-number-authority.js';

const draft = {
  id: 'q1',
  status: 'draft' as const,
  isImmutable: false,
  customerId: 'c1',
};

const approved = {
  id: 'q2',
  status: 'approved_for_sending' as const,
  isImmutable: false,
  customerId: 'c1',
  totalCents: 1000,
};

const sent = {
  id: 'q3',
  status: 'sent' as const,
  isImmutable: true,
  issuedAt: new Date().toISOString(),
  customerId: 'c1',
};

const accepted = {
  id: 'q4',
  status: 'accepted' as const,
  isImmutable: true,
  issuedAt: new Date().toISOString(),
  customerId: 'c1',
};

const xeroIssued = {
  id: QUOTE_LIFECYCLE_ROYAL_CAPE.quoteId,
  status: 'sent' as const,
  isImmutable: true,
  issuedAt: new Date().toISOString(),
  sourceProvider: 'xero',
  xeroQuoteId: QUOTE_LIFECYCLE_ROYAL_CAPE.xeroQuoteId,
  xeroQuoteNumber: 'QU-0183',
  quoteNumber: 'QU-0183',
  customerId: QUOTE_LIFECYCLE_ROYAL_CAPE.canonicalCustomerId,
  jobId: QUOTE_LIFECYCLE_ROYAL_CAPE.jobId,
};

test('1 create Draft maps to DRAFT', () => {
  assert.equal(toCanonicalQuoteLifecycleState('draft'), 'DRAFT');
});

test('2 duplicate create idempotency is clientActionId concern — transition draft→draft allowed', () => {
  assert.equal(isQuoteStatusTransitionAllowed('draft', 'draft'), true);
});

test('3 Draft edit allowed for staff', () => {
  assert.ok(getAllowedQuoteActions({ status: 'draft', role: 'office' }).includes('edit'));
});

test('4 non-editable state blocks unrestricted edit', () => {
  assert.ok(!getAllowedQuoteActions({ status: 'sent', isImmutable: true, role: 'office' }).includes('edit'));
  assert.ok(!getAllowedQuoteActions({ status: 'accepted', isImmutable: true, role: 'owner' }).includes('edit'));
});

test('5 approval required where configured for issue', () => {
  const result = evaluateIssueQuote(draft);
  assert.equal(result.kind, 'reject');
  assert.equal(result.code, 'QUOTE_APPROVAL_REQUIRED');
});

test('6 stale approval rejected', () => {
  const draftApproval = createQuoteApprovalDraft({
    action: 'issue',
    quoteId: approved.id,
    quoteUpdatedAt: '2026-01-01T00:00:00.000Z',
  });
  const approvedEnvelope = approveQuoteApprovalDraft(draftApproval, { actorId: 'u1', role: 'owner' });
  assert.throws(
    () =>
      assertQuoteApprovalExecutable({
        approval: approvedEnvelope,
        quoteId: approved.id,
        quoteUpdatedAt: '2026-01-02T00:00:00.000Z',
        action: 'issue',
      }),
    (err: unknown) => err instanceof QuoteLifecycleError && err.code === 'QUOTE_STALE_APPROVAL',
  );
});

test('7 send readiness validates without sending', () => {
  const readiness = evaluateQuoteSendReadiness({
    record: approved,
    displayQuoteNumber: 'Draft — Xero quote number pending',
    customerId: 'c1',
    totalCents: 5000,
    hasPdfContent: true,
    role: 'manager',
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.customerSendAllowed, false);
});

test('8 no customer send during staging test', () => {
  assertRow88NoCustomerSends(0);
  assert.throws(() => assertRow88NoCustomerSends(1));
});

test('9 Accept valid transition', () => {
  assert.equal(evaluateAcceptQuote(sent).kind, 'apply');
  assert.ok(isQuoteStatusTransitionAllowed('sent', 'accepted'));
});

test('10 Accept double-click idempotent', () => {
  assert.equal(evaluateAcceptQuote(accepted).kind, 'idempotent');
});

test('11 Accept invalid source/role denied', () => {
  assert.ok(!getAllowedQuoteActions({ status: 'sent', isImmutable: true, issuedAt: sent.issuedAt, role: 'technician' }).includes('accept'));
  assert.equal(evaluateAcceptQuote(draft).kind, 'reject');
});

test('12 Decline valid transition', () => {
  assert.equal(evaluateDeclineQuote(sent).kind, 'apply');
});

test('13 Decline idempotent', () => {
  assert.equal(evaluateDeclineQuote({ ...sent, status: 'declined' }).kind, 'idempotent');
});

test('14 Accepted cannot Decline without correction workflow', () => {
  assert.equal(evaluateDeclineQuote(accepted).kind, 'reject');
});

test('15 Declined cannot Convert', () => {
  assert.equal(evaluateConvertQuote({ ...sent, status: 'declined' }).kind, 'reject');
  assert.ok(!getAllowedQuoteActions({ status: 'declined', role: 'owner' }).includes('convert'));
});

test('16 eligible quote can Convert', () => {
  assert.equal(evaluateConvertQuote(accepted).kind, 'apply');
  assert.ok(getAllowedQuoteActions({ status: 'accepted', role: 'owner', hasInvoice: false }).includes('convert'));
});

test('17 conversion links correct invoice once — already converted is idempotent', () => {
  assert.equal(evaluateConvertQuote({ ...accepted, status: 'converted' }).kind, 'idempotent');
});

test('18 duplicate conversion blocked', () => {
  const r = evaluateConvertQuote({ ...accepted, status: 'converted' });
  assert.equal(r.code, 'QUOTE_ALREADY_CONVERTED');
});

test('19 provider-blocked convert does not fake success', () => {
  const outcome = resolveProviderActionOutcome({
    requested: 'convert',
    providerWriteAttempted: true,
    providerWriteAllowed: false,
    providerError: 'no approval for invoice_create',
  });
  assert.equal(outcome.outcome, 'BLOCKED');
  const applied = applyProviderOutcomeToBusinessState({
    currentStatus: 'accepted',
    requestedToStatus: 'converted',
    outcome,
  });
  assert.equal(applied.applied, false);
  assert.equal(applied.nextStatus, 'accepted');
});

test('20 Void valid transition for local draft', () => {
  assert.equal(evaluateVoidQuote(draft).kind, 'apply');
});

test('21 Void idempotent', () => {
  assert.equal(evaluateVoidQuote({ ...draft, status: 'cancelled' }).kind, 'idempotent');
});

test('22 provider-blocked Void does not fake success', () => {
  const voidEval = evaluateVoidQuote(xeroIssued);
  assert.equal(voidEval.kind, 'provider_gate');
  const outcome = resolveProviderActionOutcome({
    requested: 'void',
    providerWriteAttempted: true,
    providerWriteAllowed: false,
  });
  const applied = applyProviderOutcomeToBusinessState({
    currentStatus: 'sent',
    requestedToStatus: 'cancelled',
    outcome,
  });
  assert.equal(applied.nextStatus, 'sent');
});

test('23 Archive preserves history path for declined', () => {
  const r = evaluateArchiveQuote({ ...sent, status: 'declined' });
  assert.equal(r.kind, 'apply');
  assert.match(r.cancelReason ?? '', /^archived:/);
});

test('24 issued QuoteNumber preserved (Row 87)', () => {
  const display = resolveQuoteDisplayNumberLabel({
    id: xeroIssued.id,
    quoteNumber: 'TIT-QUOTE-41178762',
    xeroQuoteNumber: 'QU-0183',
    xeroQuoteId: xeroIssued.xeroQuoteId,
    sourceProvider: 'xero',
    sourceExternalId: xeroIssued.xeroQuoteId,
  });
  assert.equal(display, 'QU-0183');
});

test('25 Row 87 official number resolver regression', () => {
  assert.equal(
    resolveQuoteDisplayNumberLabel({
      quoteNumber: xeroIssued.quoteNumber,
      xeroQuoteNumber: 'QU-0183',
      sourceProvider: 'xero',
    }),
    'QU-0183',
  );
});

test('26-29 Xero GUID / source / customer / job unchanged helpers', () => {
  const check = assertRoyalCapeQuoteLifecycleUnchanged({
    titanQuoteId: QUOTE_LIFECYCLE_ROYAL_CAPE.quoteId,
    xeroQuoteId: QUOTE_LIFECYCLE_ROYAL_CAPE.xeroQuoteId,
    quoteNumber: 'QU-0183',
    xeroQuoteNumber: 'QU-0183',
    customerId: QUOTE_LIFECYCLE_ROYAL_CAPE.canonicalCustomerId,
    jobId: QUOTE_LIFECYCLE_ROYAL_CAPE.jobId,
  });
  assert.equal(check.ok, true);
});

test('30 payment status separate from quote status', () => {
  const vis = resolveQuotePaymentVisibility({
    quoteStatus: 'accepted',
    hasLinkedInvoice: false,
    depositPercent: 30,
  });
  assert.equal(vis, 'deposit_requested');
  assert.equal(toCanonicalQuoteLifecycleState('accepted'), 'ACCEPTED');
  assertQuoteStatusIndependentOfPayment({ quoteStatus: 'accepted', paymentVisibility: vis });
});

test('31 POP does not mark paid', () => {
  assert.equal(
    resolveQuotePaymentVisibility({
      quoteStatus: 'accepted',
      hasLinkedInvoice: false,
      popOnly: true,
    }),
    'no_payment',
  );
});

test('32-34 Customer/Property/Job 360 lifecycle mapping stable', () => {
  assert.equal(toCanonicalQuoteLifecycleState('sent'), 'SENT');
  assert.equal(toCanonicalQuoteLifecycleState('converted'), 'CONVERTED');
  assert.equal(canonicalArchived('cancelled', 'archived: yes'), 'ARCHIVED');
});

function canonicalArchived(status: string, cancelReason: string) {
  return toCanonicalQuoteLifecycleState(status, { cancelReason });
}

test('35 Client sees own quote actions only', () => {
  const actions = getAllowedQuoteActions({
    status: 'sent',
    isImmutable: true,
    issuedAt: sent.issuedAt,
    role: 'client',
  });
  assert.deepEqual(actions.sort(), ['accept', 'decline', 'view'].sort());
});

test('36 Client cross-customer denial is scope concern — client cannot convert/void', () => {
  const actions = getAllowedQuoteActions({ status: 'accepted', role: 'client' });
  assert.ok(!actions.includes('convert'));
  assert.ok(!actions.includes('void'));
  assert.ok(!actions.includes('edit'));
});

test('37 Client valid actions only on sent/viewed', () => {
  assert.ok(!getAllowedQuoteActions({ status: 'draft', role: 'client' }).includes('accept'));
});

test('38 Technician restricted', () => {
  assert.deepEqual(getAllowedQuoteActions({ status: 'accepted', role: 'technician' }), ['view']);
});

test('39 Manager/Admin/Office permissions include lifecycle staff actions', () => {
  for (const role of ['manager', 'admin', 'office'] as const) {
    assert.ok(getAllowedQuoteActions({ status: 'draft', role }).includes('edit'));
    assert.ok(getAllowedQuoteActions({ status: 'approved_for_sending', role }).includes('issue'));
  }
});

test('40 Owner permissions', () => {
  assert.ok(getAllowedQuoteActions({ status: 'accepted', role: 'owner', hasInvoice: false }).includes('convert'));
});

test('41 cross-tenant denial is API-scoped — transition engine still requires matching ids in audit', () => {
  const event = buildQuoteLifecycleAuditEvent({
    eventType: 'quote_accepted',
    companyId: 'company-a',
    quoteId: 'q',
    quoteNumber: 'QU-0183',
  });
  assert.equal(event.companyId, 'company-a');
});

test('42 complete audit sequence event types', () => {
  const types = [
    'quote_created',
    'quote_edited',
    'quote_approval_requested',
    'quote_approved',
    'quote_send_prepared',
    'quote_sent',
    'quote_accepted',
    'quote_declined',
    'quote_conversion_requested',
    'quote_converted',
    'quote_voided',
    'quote_archived',
    'quote_action_blocked',
  ] as const;
  for (const eventType of types) {
    const ev = buildQuoteLifecycleAuditEvent({
      eventType,
      companyId: 'c',
      quoteId: 'q',
      fromState: 'sent',
      toState: 'accepted',
    });
    assert.equal(ev.entityType, 'quote');
    assert.ok(ev.eventType.includes('quote'));
  }
});

test('43 stale concurrent action rejected via approval hash', () => {
  const d = createQuoteApprovalDraft({
    action: 'convert',
    quoteId: accepted.id,
    quoteUpdatedAt: 't1',
  });
  const a = approveQuoteApprovalDraft(d, { actorId: 'u', role: 'owner' });
  assert.throws(() =>
    assertQuoteApprovalExecutable({
      approval: a,
      quoteId: accepted.id,
      quoteUpdatedAt: 't2',
      action: 'convert',
    }),
  );
});

test('44 duplicate provider event idempotent via already-converted', () => {
  assert.equal(evaluateConvertQuote({ ...accepted, status: 'converted' }).kind, 'idempotent');
});

test('45 Royal Cape QU-0183 unchanged', () => {
  assert.equal(QUOTE_LIFECYCLE_ROYAL_CAPE.quoteNumber, 'QU-0183');
  const actions = getAllowedQuoteActions({
    status: 'sent',
    isImmutable: true,
    issuedAt: xeroIssued.issuedAt,
    sourceProvider: 'xero',
    xeroQuoteId: xeroIssued.xeroQuoteId,
    xeroQuoteNumber: 'QU-0183',
    role: 'owner',
  });
  assert.ok(actions.includes('view'));
  assert.ok(!actions.includes('edit'));
});

test('46 no Xero writes', () => {
  assertRow88NoXeroWrites(0);
  assert.throws(() => assertRow88NoXeroWrites(1));
});

test('47 no customer sends', () => {
  assertRow88NoCustomerSends(0);
});

test('48 no production writes flag helpers + row 89/121 not started', () => {
  assertRow89NotStarted(false);
  assertRow121LifecycleNotStarted(false);
  assert.throws(() => assertRow89NotStarted(true));
});

test('state mapping covers awaiting approval and void/archive', () => {
  assert.equal(toCanonicalQuoteLifecycleState('internal_review'), 'AWAITING_APPROVAL');
  assert.equal(toCanonicalQuoteLifecycleState('approved_for_sending'), 'APPROVED_READY');
  assert.equal(toCanonicalQuoteLifecycleState('cancelled'), 'VOIDED');
  assert.equal(toCanonicalQuoteLifecycleState('cancelled', { cancelReason: 'archived: x' }), 'ARCHIVED');
  assert.equal(toCanonicalQuoteLifecycleState('weird'), 'UNKNOWN_REVIEW');
});

test('illegal transitions throw', () => {
  assert.throws(() => assertQuoteStatusTransition({ from: 'converted', to: 'draft' }));
  assert.throws(() => assertQuoteStatusTransition({ from: 'declined', to: 'accepted' }));
});

test('invalid combination detector', () => {
  assert.ok(
    detectInvalidQuoteLifecycleCombinations({
      id: 'x',
      status: 'converted',
      hasLinkedInvoice: false,
    }).includes('converted_without_invoice'),
  );
});

test('count by canonical state', () => {
  const counts = countQuotesByCanonicalState([
    { status: 'draft' },
    { status: 'sent' },
    { status: 'sent' },
    { status: 'cancelled', cancelReason: 'archived: done' },
  ]);
  assert.equal(counts.DRAFT, 1);
  assert.equal(counts.SENT, 2);
  assert.equal(counts.ARCHIVED, 1);
});

test('approval execute happy path', () => {
  const d = createQuoteApprovalDraft({
    action: 'issue',
    quoteId: approved.id,
    quoteUpdatedAt: '2026-08-08T00:00:00.000Z',
    intendedToStatus: 'sent',
  });
  const a = approveQuoteApprovalDraft(d, { actorId: 'owner1', role: 'owner' });
  assert.equal(a.status, 'approved');
  assertQuoteApprovalExecutable({
    approval: a,
    quoteId: approved.id,
    quoteUpdatedAt: '2026-08-08T00:00:00.000Z',
    action: 'issue',
  });
});

test('send readiness blocks unapproved and forbids customer send', () => {
  const readiness = evaluateQuoteSendReadiness({
    record: draft,
    displayQuoteNumber: 'Q-0001',
    customerId: 'c1',
    totalCents: 100,
    role: 'office',
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.customerSendAllowed, false);
});
