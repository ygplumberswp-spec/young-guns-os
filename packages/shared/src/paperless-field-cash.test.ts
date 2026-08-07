import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PAPERLESS_COMPLETION_STEPS,
  applyLabourTimerPause,
  applyLabourTimerResume,
  assertNoClientFinancialLeak,
  buildCartrackArrivalPrompt,
  computeWorkingDurationMinutes,
  evaluatePaperlessCompletionSequence,
  toClientSafeCompletionPack,
  toTechnicianInvoicePaymentStrip,
  validateAuraFinanceCompletionPack,
  validateOnSitePaymentEvidence,
} from './paperless-field-cash.js';

describe('YG-CUTOVER-001F paperless field → cash', () => {
  it('defines the controlled 6-step completion sequence', () => {
    assert.equal(PAPERLESS_COMPLETION_STEPS.length, 6);
    assert.equal(PAPERLESS_COMPLETION_STEPS[0]!.key, 'job_card');
    assert.equal(PAPERLESS_COMPLETION_STEPS[5]!.key, 'stop_job');
  });

  it('blocks submit while labour timer is open', () => {
    const result = evaluatePaperlessCompletionSequence({
      workRequested: 'Fix geyser',
      findings: 'Element failed',
      workPerformed: 'Replaced element',
      clientFacingNotes: 'Done',
      internalNotes: 'Cost note',
      outstandingRecommended: null,
      hasMaterialsOrExplicitNone: true,
      hasSlipOrExpenseEvidence: true,
      hasBeforePhoto: true,
      hasAfterPhoto: true,
      checklistComplete: true,
      hasSignature: true,
      signerName: 'Client',
      labourStopped: false,
      openLabourEntries: 1,
    });
    assert.equal(result.canSubmit, false);
    assert.equal(result.currentStep, 'stop_job');
  });

  it('AURA pack reports inconsistencies and never invents readiness', () => {
    const pack = validateAuraFinanceCompletionPack({
      assignedJobId: 'job-1',
      hasAcceptedQuote: false,
      hasApprovedSellPrices: false,
      pendingVariationCount: 1,
      hasJobCard: true,
      hasWorkPerformed: true,
      materialCount: 1,
      slipOrReceiptCount: 0,
      labourEntryCount: 1,
      openLabourCount: 0,
      hasBeforePhoto: true,
      hasAfterPhoto: true,
      hasSignature: true,
      existingInvoiceId: null,
      timerAnomaly: false,
      duplicatedSlipDetected: false,
      incompleteQuotedWork: false,
    });
    assert.equal(pack.readyForDraftInvoice, false);
    assert.ok(pack.issues.some((i) => i.code === 'no_accepted_quote'));
    assert.ok(pack.issues.some((i) => i.code === 'pending_variation'));
    assert.ok(pack.issues.some((i) => i.code === 'material_without_slip'));
  });

  it('client safe pack strips internal financial fields', () => {
    const client = toClientSafeCompletionPack({
      jobNumber: 'YG-1',
      workPerformed: 'Fixed',
      clientFacingNotes: 'All good',
      outstandingRecommended: null,
      hasBeforePhoto: true,
      hasAfterPhoto: true,
      hasSignature: true,
      signerName: 'Ann',
      signedAt: '2026-08-07T12:00:00.000Z',
      internal: { labourCostCents: 999, marginCents: 100, internalNotes: 'secret' },
    });
    assert.equal(client.audience, 'client');
    assert.equal(assertNoClientFinancialLeak(client).length, 0);
    assert.equal('labourCostCents' in client, false);
  });

  it('technician invoice strip never exposes profit', () => {
    const strip = toTechnicianInvoicePaymentStrip({
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-1',
      amountDueCents: 10000,
      amountPaidCents: 2500,
      jobId: 'job-1',
    });
    assert.equal(strip.paymentStatus, 'part_paid');
    assert.equal(strip.amountDueCents, 7500);
    assert.equal(assertNoClientFinancialLeak(strip).length, 0);
  });

  it('timer pause/resume reduces working duration', () => {
    const meta = applyLabourTimerPause({}, '2026-08-07T10:30:00.000Z');
    const resumed = applyLabourTimerResume(meta, '2026-08-07T10:45:00.000Z');
    const minutes = computeWorkingDurationMinutes({
      startedAt: '2026-08-07T10:00:00.000Z',
      endedAt: '2026-08-07T11:00:00.000Z',
      pauses: resumed.paperlessTimer!.pauses,
    });
    assert.equal(minutes, 45);
  });

  it('Cartrack arrival prompts but never auto-starts labour', () => {
    const prompt = buildCartrackArrivalPrompt({
      cartrackAvailable: true,
      proximityMatch: true,
      ignitionOff: true,
      jobId: 'job-1',
      jobNumber: '1234',
    });
    assert.equal(prompt.shouldPrompt, true);
    assert.equal(prompt.autoStartLabour, false);
    assert.match(prompt.message ?? '', /Start job timer/);
  });

  it('rejects PAN/CVV/PIN and duplicate payment references', () => {
    const bad = validateOnSitePaymentEvidence(
      {
        invoiceId: 'inv',
        jobId: 'job',
        customerId: 'cust',
        amountCents: 100,
        method: 'card_terminal',
        providerTerminal: 'Yoco-1',
        paymentReference: 'REF-1',
        paidAt: '2026-08-07T12:00:00.000Z',
        cardNumber: '4111111111111111',
      },
      [],
      1000,
    );
    assert.equal(bad.ok, false);

    const dup = validateOnSitePaymentEvidence(
      {
        invoiceId: 'inv',
        jobId: 'job',
        customerId: 'cust',
        amountCents: 100,
        method: 'card_terminal',
        providerTerminal: 'Yoco-1',
        paymentReference: 'REF-1',
        paidAt: '2026-08-07T12:00:00.000Z',
      },
      ['REF-1'],
      1000,
    );
    assert.equal(dup.ok, false);

    const ok = validateOnSitePaymentEvidence(
      {
        invoiceId: 'inv',
        jobId: 'job',
        customerId: 'cust',
        amountCents: 100,
        method: 'card_terminal',
        providerTerminal: 'Yoco-1',
        paymentReference: 'REF-2',
        paidAt: '2026-08-07T12:00:00.000Z',
      },
      ['REF-1'],
      1000,
    );
    assert.equal(ok.ok, true);
  });
});
