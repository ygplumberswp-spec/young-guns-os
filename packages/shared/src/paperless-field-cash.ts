/**
 * YG-CUTOVER-001F — Paperless Technician → Invoice → Payment orchestration.
 * Pure contracts: sequence, AURA validation, client/internal isolation, timer, payments.
 */

export const YG_CUTOVER_001F_LABEL = 'YG-CUTOVER-001F' as const;

/** Controlled completion sequence — do not reorder. */
export const PAPERLESS_COMPLETION_STEPS = [
  { id: 1, key: 'job_card', label: 'Job Card details' },
  { id: 2, key: 'materials_slips', label: 'Materials / slips' },
  { id: 3, key: 'final_description', label: 'Final description' },
  { id: 4, key: 'completion_evidence', label: 'Completion evidence' },
  { id: 5, key: 'client_signature', label: 'Electronic client signature' },
  { id: 6, key: 'stop_job', label: 'Stop job / submit' },
] as const;

export type PaperlessCompletionStepKey = (typeof PAPERLESS_COMPLETION_STEPS)[number]['key'];

export type PaperlessSequenceInput = {
  workRequested: string | null | undefined;
  findings: string | null | undefined;
  workPerformed: string | null | undefined;
  clientFacingNotes: string | null | undefined;
  internalNotes: string | null | undefined;
  outstandingRecommended: string | null | undefined;
  hasMaterialsOrExplicitNone: boolean;
  hasSlipOrExpenseEvidence: boolean;
  hasBeforePhoto: boolean;
  hasAfterPhoto: boolean;
  checklistComplete: boolean;
  hasSignature: boolean;
  signerName: string | null | undefined;
  labourStopped: boolean;
  openLabourEntries: number;
};

export type PaperlessSequenceStepStatus = {
  key: PaperlessCompletionStepKey;
  complete: boolean;
  blockers: string[];
};

export function evaluatePaperlessCompletionSequence(
  input: PaperlessSequenceInput,
): {
  steps: PaperlessSequenceStepStatus[];
  canSubmit: boolean;
  currentStep: PaperlessCompletionStepKey | 'done';
} {
  const steps: PaperlessSequenceStepStatus[] = [
    {
      key: 'job_card',
      complete: Boolean(input.workRequested?.trim() && input.findings?.trim() && input.workPerformed?.trim()),
      blockers: [
        !input.workRequested?.trim() ? 'work_requested' : null,
        !input.findings?.trim() ? 'findings' : null,
        !input.workPerformed?.trim() ? 'work_performed' : null,
      ].filter(Boolean) as string[],
    },
    {
      key: 'materials_slips',
      complete: input.hasMaterialsOrExplicitNone,
      blockers: [
        !input.hasMaterialsOrExplicitNone ? 'materials_or_none' : null,
        input.hasMaterialsOrExplicitNone && !input.hasSlipOrExpenseEvidence
          ? 'slip_recommended'
          : null,
      ].filter((b): b is string => Boolean(b) && b !== 'slip_recommended'),
    },
    {
      key: 'final_description',
      complete: Boolean(input.workPerformed?.trim() && input.clientFacingNotes !== undefined),
      blockers: !input.workPerformed?.trim() ? ['final_work_performed'] : [],
    },
    {
      key: 'completion_evidence',
      complete: input.hasBeforePhoto && input.hasAfterPhoto && input.checklistComplete,
      blockers: [
        !input.hasBeforePhoto ? 'before_photo' : null,
        !input.hasAfterPhoto ? 'after_photo' : null,
        !input.checklistComplete ? 'checklist' : null,
      ].filter(Boolean) as string[],
    },
    {
      key: 'client_signature',
      complete: input.hasSignature && Boolean(input.signerName?.trim()),
      blockers: [
        !input.hasSignature ? 'signature' : null,
        !input.signerName?.trim() ? 'signer_name' : null,
      ].filter(Boolean) as string[],
    },
    {
      key: 'stop_job',
      complete: input.labourStopped && input.openLabourEntries === 0,
      blockers: [
        !input.labourStopped || input.openLabourEntries > 0 ? 'open_labour_timer' : null,
      ].filter(Boolean) as string[],
    },
  ];

  const canSubmit = steps.every((s) => s.complete);
  const firstIncomplete = steps.find((s) => !s.complete);
  return {
    steps,
    canSubmit,
    currentStep: canSubmit ? 'done' : (firstIncomplete?.key ?? 'job_card'),
  };
}

/** AURA Finance completion-pack inconsistency codes — report, never invent. */
export type AuraFinancePackIssueCode =
  | 'material_without_slip'
  | 'slip_without_material'
  | 'unapproved_extra_work'
  | 'duplicated_slip'
  | 'incomplete_quoted_work'
  | 'timer_anomaly'
  | 'missing_signature'
  | 'missing_before_after'
  | 'no_accepted_quote'
  | 'open_labour'
  | 'pending_variation'
  | 'work_continues';

export type AuraFinancePackIssue = {
  code: AuraFinancePackIssueCode;
  severity: 'blocker' | 'warning';
  message: string;
};

export type AuraFinancePackInput = {
  assignedJobId: string | null;
  hasAcceptedQuote: boolean;
  hasApprovedSellPrices: boolean;
  pendingVariationCount: number;
  hasJobCard: boolean;
  hasWorkPerformed: boolean;
  materialCount: number;
  slipOrReceiptCount: number;
  labourEntryCount: number;
  openLabourCount: number;
  hasBeforePhoto: boolean;
  hasAfterPhoto: boolean;
  hasSignature: boolean;
  existingInvoiceId: string | null;
  timerAnomaly: boolean;
  duplicatedSlipDetected: boolean;
  incompleteQuotedWork: boolean;
};

export function validateAuraFinanceCompletionPack(
  input: AuraFinancePackInput,
): {
  readyForDraftInvoice: boolean;
  issues: AuraFinancePackIssue[];
} {
  const issues: AuraFinancePackIssue[] = [];

  if (!input.assignedJobId) {
    issues.push({
      code: 'incomplete_quoted_work',
      severity: 'blocker',
      message: 'No assigned job — cannot prepare invoice.',
    });
  }
  if (!input.hasAcceptedQuote || !input.hasApprovedSellPrices) {
    issues.push({
      code: 'no_accepted_quote',
      severity: 'blocker',
      message: 'No accepted quote / approved sell prices — draft invoice blocked (pricing truth).',
    });
  }
  if (input.pendingVariationCount > 0) {
    issues.push({
      code: 'pending_variation',
      severity: 'blocker',
      message: 'Unapproved variation(s) must be authorised before invoice inclusion.',
    });
  }
  if (!input.hasJobCard || !input.hasWorkPerformed) {
    issues.push({
      code: 'incomplete_quoted_work',
      severity: 'blocker',
      message: 'Job Card / work performed incomplete.',
    });
  }
  if (input.materialCount > 0 && input.slipOrReceiptCount === 0) {
    issues.push({
      code: 'material_without_slip',
      severity: 'warning',
      message: 'Materials logged without supplier slip / receipt evidence.',
    });
  }
  if (input.slipOrReceiptCount > 0 && input.materialCount === 0) {
    issues.push({
      code: 'slip_without_material',
      severity: 'warning',
      message: 'Slip/receipt uploaded without a material entry.',
    });
  }
  if (input.duplicatedSlipDetected) {
    issues.push({
      code: 'duplicated_slip',
      severity: 'blocker',
      message: 'Duplicate slip evidence detected.',
    });
  }
  if (input.incompleteQuotedWork) {
    issues.push({
      code: 'incomplete_quoted_work',
      severity: 'warning',
      message: 'Quoted work appears incomplete versus Job Card.',
    });
  }
  if (input.timerAnomaly || input.openLabourCount > 0) {
    issues.push({
      code: 'timer_anomaly',
      severity: 'blocker',
      message: 'Labour timer anomaly or open timer — stop job before invoicing.',
    });
  }
  if (!input.hasSignature) {
    issues.push({
      code: 'missing_signature',
      severity: 'blocker',
      message: 'Client signature missing.',
    });
  }
  if (!input.hasBeforePhoto || !input.hasAfterPhoto) {
    issues.push({
      code: 'missing_before_after',
      severity: 'blocker',
      message: 'Before/After photos incomplete.',
    });
  }
  if (input.labourEntryCount === 0) {
    issues.push({
      code: 'timer_anomaly',
      severity: 'blocker',
      message: 'No labour time recorded.',
    });
  }

  const blockers = issues.filter((i) => i.severity === 'blocker');
  return {
    readyForDraftInvoice: blockers.length === 0 && !input.existingInvoiceId,
    issues,
  };
}

/** Fields forever forbidden on client-facing Job Card / completion / invoice projections. */
export const CLIENT_FORBIDDEN_FINANCIAL_FIELDS = [
  'supplierCostCents',
  'costPriceCents',
  'unitCostCents',
  'wageRateCents',
  'internalLabourCostCents',
  'labourCostCents',
  'travelCostCents',
  'markupBps',
  'marginBps',
  'marginCents',
  'profitCents',
  'jpe',
  'jobProfitability',
  'internalNotes',
  'supplierReceipts',
  'supplierSlips',
] as const;

export type ClientSafeCompletionPack = {
  audience: 'client';
  jobNumber: string | null;
  workPerformed: string | null;
  clientFacingNotes: string | null;
  outstandingRecommended: string | null;
  hasBeforePhoto: boolean;
  hasAfterPhoto: boolean;
  hasSignature: boolean;
  signerName: string | null;
  signedAt: string | null;
};

export type InternalCompletionPack = {
  audience: 'internal';
  jobNumber: string | null;
  customerName: string | null;
  siteAddress: string | null;
  technicians: string[];
  completedAt: string | null;
  workPerformed: string | null;
  clientFacingNotes: string | null;
  internalNotes: string | null;
  findings: string | null;
  materials: Array<{ description: string; quantity: number; supplierReference: string | null }>;
  slipCount: number;
  labour: Array<{ technicianName: string; minutes: number }>;
  travel: {
    verificationState: 'verified' | 'unverified_owner_review' | 'unavailable';
    travelMinutes: number | null;
    travelDistanceKm: number | null;
  };
  invoice: {
    id: string | null;
    number: string | null;
    status: string | null;
    amountDueCents: number | null;
    paymentStatus: 'unpaid' | 'part_paid' | 'paid' | 'unknown';
  };
  financialInternal: {
    labourCostCents: number | null;
    materialCostCents: number | null;
    expenseCents: number | null;
    marginCents: number | null;
  };
};

export function toClientSafeCompletionPack(pack: {
  jobNumber: string | null;
  workPerformed: string | null;
  clientFacingNotes: string | null;
  outstandingRecommended: string | null;
  hasBeforePhoto: boolean;
  hasAfterPhoto: boolean;
  hasSignature: boolean;
  signerName: string | null;
  signedAt: string | null;
  /** Any internal payload — must never leak. */
  internal?: Record<string, unknown>;
}): ClientSafeCompletionPack {
  return {
    audience: 'client',
    jobNumber: pack.jobNumber,
    workPerformed: pack.workPerformed,
    clientFacingNotes: pack.clientFacingNotes,
    outstandingRecommended: pack.outstandingRecommended,
    hasBeforePhoto: pack.hasBeforePhoto,
    hasAfterPhoto: pack.hasAfterPhoto,
    hasSignature: pack.hasSignature,
    signerName: pack.signerName,
    signedAt: pack.signedAt,
  };
}

export function assertNoClientFinancialLeak(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const leaks: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key;
      if (
        (CLIENT_FORBIDDEN_FINANCIAL_FIELDS as readonly string[]).includes(key) &&
        child != null &&
        child !== false
      ) {
        leaks.push(next);
      }
      walk(child, next);
    }
  };
  walk(payload, '');
  return leaks;
}

/** Technician-visible invoice strip after approval — never costs/margins. */
export type TechnicianInvoicePaymentStrip = {
  invoiceId: string;
  invoiceNumber: string | null;
  amountDueCents: number;
  currency: string;
  paymentStatus: 'unpaid' | 'part_paid' | 'paid';
  jobId: string;
};

export function toTechnicianInvoicePaymentStrip(input: {
  invoiceId: string;
  invoiceNumber: string | null;
  amountDueCents: number;
  amountPaidCents: number;
  currency?: string;
  jobId: string;
}): TechnicianInvoicePaymentStrip {
  const due = Math.max(0, input.amountDueCents);
  const paid = Math.max(0, input.amountPaidCents);
  let paymentStatus: TechnicianInvoicePaymentStrip['paymentStatus'] = 'unpaid';
  if (paid <= 0) paymentStatus = 'unpaid';
  else if (paid < due) paymentStatus = 'part_paid';
  else paymentStatus = 'paid';
  return {
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    amountDueCents: Math.max(0, due - paid),
    currency: input.currency ?? 'ZAR',
    paymentStatus,
    jobId: input.jobId,
  };
}

/** Labour timer pause segments stored in time-entry metadata (server authority). */
export type LabourTimerPauseSegment = {
  pausedAt: string;
  resumedAt: string | null;
};

export type LabourTimerMetadata = {
  paperlessTimer?: {
    pauses: LabourTimerPauseSegment[];
    status: 'running' | 'paused' | 'stopped';
  };
};

export function applyLabourTimerPause(
  metadata: Record<string, unknown>,
  pausedAtIso: string,
): LabourTimerMetadata & Record<string, unknown> {
  const existing = (metadata.paperlessTimer as LabourTimerMetadata['paperlessTimer']) ?? {
    pauses: [],
    status: 'running' as const,
  };
  if (existing.status === 'paused') return { ...metadata, paperlessTimer: existing };
  return {
    ...metadata,
    paperlessTimer: {
      pauses: [...existing.pauses, { pausedAt: pausedAtIso, resumedAt: null }],
      status: 'paused',
    },
  };
}

export function applyLabourTimerResume(
  metadata: Record<string, unknown>,
  resumedAtIso: string,
): LabourTimerMetadata & Record<string, unknown> {
  const existing = (metadata.paperlessTimer as LabourTimerMetadata['paperlessTimer']) ?? {
    pauses: [],
    status: 'running' as const,
  };
  const pauses = existing.pauses.map((p, idx) =>
    idx === existing.pauses.length - 1 && p.resumedAt == null
      ? { ...p, resumedAt: resumedAtIso }
      : p,
  );
  return {
    ...metadata,
    paperlessTimer: { pauses, status: 'running' },
  };
}

export function computeWorkingDurationMinutes(input: {
  startedAt: string;
  endedAt: string;
  pauses: LabourTimerPauseSegment[];
}): number {
  const start = Date.parse(input.startedAt);
  const end = Date.parse(input.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  let pauseMs = 0;
  for (const pause of input.pauses) {
    const p0 = Date.parse(pause.pausedAt);
    const p1 = pause.resumedAt ? Date.parse(pause.resumedAt) : end;
    if (Number.isFinite(p0) && Number.isFinite(p1) && p1 > p0) pauseMs += p1 - p0;
  }
  return Math.max(0, Math.round((end - start - pauseMs) / 60_000));
}

/** Cartrack arrival may prompt — never silently create labour. */
export type CartrackArrivalPrompt = {
  shouldPrompt: boolean;
  jobId: string | null;
  jobNumber: string | null;
  message: string | null;
  autoStartLabour: false;
  verificationState: 'verified_proximity' | 'unverified_owner_review' | 'unavailable';
};

export function buildCartrackArrivalPrompt(input: {
  cartrackAvailable: boolean;
  proximityMatch: boolean;
  ignitionOff: boolean;
  jobId: string | null;
  jobNumber: string | null;
}): CartrackArrivalPrompt {
  if (!input.cartrackAvailable) {
    return {
      shouldPrompt: false,
      jobId: input.jobId,
      jobNumber: input.jobNumber,
      message: null,
      autoStartLabour: false,
      verificationState: 'unavailable',
    };
  }
  if (input.ignitionOff && input.proximityMatch && input.jobId) {
    return {
      shouldPrompt: true,
      jobId: input.jobId,
      jobNumber: input.jobNumber,
      message: `Looks like you arrived at Job #${input.jobNumber ?? input.jobId.slice(0, 8)}. Start job timer?`,
      autoStartLabour: false,
      verificationState: 'verified_proximity',
    };
  }
  if (input.ignitionOff && !input.proximityMatch) {
    return {
      shouldPrompt: false,
      jobId: input.jobId,
      jobNumber: input.jobNumber,
      message: null,
      autoStartLabour: false,
      verificationState: 'unverified_owner_review',
    };
  }
  return {
    shouldPrompt: false,
    jobId: input.jobId,
    jobNumber: input.jobNumber,
    message: null,
    autoStartLabour: false,
    verificationState: 'unverified_owner_review',
  };
}

export type OnSitePaymentEvidenceInput = {
  invoiceId: string;
  jobId: string;
  customerId: string;
  amountCents: number;
  method: 'card_terminal' | 'payment_link_qr' | 'other_authorised';
  providerTerminal: string | null;
  paymentReference: string;
  paidAt: string;
  /** Forbidden — must never be accepted. */
  cardNumber?: string | null;
  cvv?: string | null;
  pin?: string | null;
};

export type OnSitePaymentEvidenceDecision =
  | { ok: true; evidence: Omit<OnSitePaymentEvidenceInput, 'cardNumber' | 'cvv' | 'pin'> }
  | { ok: false; reason: string };

export function validateOnSitePaymentEvidence(
  input: OnSitePaymentEvidenceInput,
  existingReferences: readonly string[],
  invoiceAmountDueCents: number,
): OnSitePaymentEvidenceDecision {
  if (input.cardNumber || input.cvv || input.pin) {
    return { ok: false, reason: 'Card PAN/CVV/PIN must never be stored.' };
  }
  const ref = input.paymentReference.trim();
  if (!ref) return { ok: false, reason: 'Payment reference required.' };
  if (existingReferences.map((r) => r.toLowerCase()).includes(ref.toLowerCase())) {
    return { ok: false, reason: 'Duplicate payment reference.' };
  }
  if (input.amountCents <= 0) return { ok: false, reason: 'Amount must be positive.' };
  if (input.amountCents > invoiceAmountDueCents) {
    return { ok: false, reason: 'Payment would over-settle the invoice.' };
  }
  const { cardNumber: _c, cvv: _v, pin: _p, ...safe } = input;
  return { ok: true, evidence: { ...safe, paymentReference: ref } };
}

export const PAPERLESS_OWNER_PACK_SECTIONS = [
  'JOB',
  'WORK',
  'EVIDENCE',
  'LABOUR',
  'TRAVEL',
  'MATERIALS',
  'FINANCIAL_STATUS',
] as const;
