/**
 * YG-CUTOVER-001F — paperless field → invoice → payment contracts (web).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PAPERLESS_COMPLETION_STEPS,
  assertNoClientFinancialLeak,
  evaluatePaperlessCompletionSequence,
  toTechnicianInvoicePaymentStrip,
  validateAuraFinanceCompletionPack,
} from '@titan/shared';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), 'utf8');
}

describe('YG-CUTOVER-001F paperless Technician → invoice → payment', () => {
  it('mobile job detail wires controlled sequence, pause/resume, and on-site payment', () => {
    const page = read('pages/mobile/MobileJobDetailPage.tsx');
    assert.match(page, /PaperlessCompletionSequence/);
    assert.match(page, /evaluatePaperlessCompletionSequence/);
    assert.match(page, /pauseMobileTimeEntry/);
    assert.match(page, /resumeMobileTimeEntry/);
    assert.match(page, /materialsNotRequired/);
    assert.match(page, /clientFacingNotes/);
    assert.match(page, /internalNotes/);
    assert.match(page, /Take card payment/);
    assert.match(page, /never enter card PAN/);
    assert.match(page, /Stop the job timer/);
    assert.doesNotMatch(page, /\bprofit\b|\bwages?\b|\bJPE\b|\bmarginCents\b/i);
  });

  it('API client exposes paperless payment + timer pause routes', () => {
    const client = read('lib/mobile-api-client.ts');
    assert.match(client, /time\/\$\{timeEntryId\}\/pause/);
    assert.match(client, /time\/\$\{timeEntryId\}\/resume/);
    assert.match(client, /on-site-payment/);
    assert.match(client, /payment-strip/);
    assert.match(client, /arrival-prompt/);
  });

  it('sequence + AURA pack + technician strip stay isolation-safe', () => {
    assert.equal(PAPERLESS_COMPLETION_STEPS.length, 6);
    const seq = evaluatePaperlessCompletionSequence({
      workRequested: 'x',
      findings: 'y',
      workPerformed: 'z',
      clientFacingNotes: 'ok',
      internalNotes: 'secret',
      outstandingRecommended: null,
      hasMaterialsOrExplicitNone: true,
      hasSlipOrExpenseEvidence: true,
      hasBeforePhoto: true,
      hasAfterPhoto: true,
      checklistComplete: true,
      hasSignature: true,
      signerName: 'Client',
      labourStopped: true,
      openLabourEntries: 0,
    });
    assert.equal(seq.canSubmit, true);
    const pack = validateAuraFinanceCompletionPack({
      assignedJobId: 'j',
      hasAcceptedQuote: true,
      hasApprovedSellPrices: true,
      pendingVariationCount: 0,
      hasJobCard: true,
      hasWorkPerformed: true,
      materialCount: 0,
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
    assert.equal(pack.readyForDraftInvoice, true);
    const strip = toTechnicianInvoicePaymentStrip({
      invoiceId: 'i',
      invoiceNumber: 'INV-1',
      amountDueCents: 5000,
      amountPaidCents: 0,
      jobId: 'j',
    });
    assert.equal(assertNoClientFinancialLeak(strip).length, 0);
  });
});
