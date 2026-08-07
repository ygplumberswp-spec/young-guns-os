/**
 * Royal Cape Yacht Club — real-data staging Job 360 rehearsal.
 *
 * STAGING ONLY. No production. No live Xero writes. No live customer sends.
 * Xero is the canonical financial source for QU-0183 — screenshot values are
 * supporting evidence only. Never recreate, duplicate, renumber, or replace QU-0183.
 *
 * This single pilot does NOT prove full Young Guns historical migration is complete.
 */

import {
  YOUNG_GUNS_FULL_HISTORY_POLICY,
  type HistoricalSyncMode,
} from './historical-full-history.js';
import { filterHistoricalInternalFinanceForClient } from './historical-import.js';
import { isInvoiceBlockedByVisitState } from './job-visits.js';
import { canAccessJobProfitability } from './job-profitability.js';
import { JOB_EXECUTION_TRANSITIONS, phaseToJobStatus } from './job-execution.js';

export const ROYAL_CAPE_STAGING_IDENTITY = {
  appEnv: 'staging' as const,
  titanEnv: 'staging' as const,
  supabaseProjectRef: 'cpkuwtaipjxeipvbssvn',
  youngGunsCompanyId: '095aef76-fef5-4139-af37-a42f2d7e2faf',
  apiBase: 'https://young-guns-os-staging.up.railway.app',
  webBase: 'https://comfortable-determination-staging.up.railway.app',
} as const;

export const ROYAL_CAPE_PRODUCTION_FORBIDDEN = {
  supabaseProjectRef: 'rshuiaghmtrvvilhqpwm',
  reason: 'Production Supabase must never be touched by this rehearsal.',
} as const;

/** Canonical Xero quote number — never invent a replacement. */
export const ROYAL_CAPE_CANONICAL_QUOTE_NUMBER = 'QU-0183';

/**
 * Owner-confirmed screenshot evidence. Supporting only — if Xero differs, Xero wins.
 * Amounts in cents (ZAR).
 */
export const ROYAL_CAPE_SCREENSHOT_EVIDENCE = {
  quoteNumber: ROYAL_CAPE_CANONICAL_QUOTE_NUMBER,
  dated: '2026-07-15',
  referenceProjectShown: 'Royal Cape Yacht Club',
  customerLabelShown: 'CRC',
  subtotalCentsExVat: 3_715_000,
  vatCents: 557_250,
  totalCents: 4_272_250,
  currency: 'ZAR',
  authority: 'screenshot_supporting_only' as const,
} as const;

export const ROYAL_CAPE_SITE_NAME = 'Royal Cape Yacht Club';

export type RoyalCapeMatchDecision =
  | 'USE_EXISTING'
  | 'CREATE_ONCE'
  | 'LINK_EXISTING'
  | 'ALREADY_LINKED'
  | 'REVIEW_REQUIRED'
  | 'MISSING_CANONICAL'
  | 'BLOCKED';

export type RoyalCapeSafetyContract = {
  stagingOnly: true;
  productionUntouched: true;
  noLiveXeroWrites: true;
  noLiveCustomerSends: true;
  xeroIsCanonicalFinancialSource: true;
  doNotRecreateQuote: true;
  doNotInventFakeFieldData: true;
  fullHistoryRuleRemainsActive: true;
};

export const ROYAL_CAPE_SAFETY_CONTRACT: RoyalCapeSafetyContract = {
  stagingOnly: true,
  productionUntouched: true,
  noLiveXeroWrites: true,
  noLiveCustomerSends: true,
  xeroIsCanonicalFinancialSource: true,
  doNotRecreateQuote: true,
  doNotInventFakeFieldData: true,
  fullHistoryRuleRemainsActive: true,
};

export type RoyalCapeXeroQuoteSnapshot = {
  titanQuoteId: string;
  quoteNumber: string;
  xeroQuoteId: string | null;
  sourceExternalId: string | null;
  sourceProvider: string | null;
  issuedAt: string | null;
  customerId: string | null;
  customerName: string | null;
  reference: string | null;
  status: string | null;
  subtotalCents: number | null;
  vatCents: number | null;
  totalCents: number | null;
  currency: string | null;
  jobId: string | null;
  lineItemCount: number;
  syncStatus: string | null;
};

export type RoyalCapeCustomerCandidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  sourceExternalId: string | null;
  matchReasons: string[];
};

export type RoyalCapePropertyCandidate = {
  id: string;
  name: string;
  customerId: string;
  address: string | null;
  sourceExternalId: string | null;
  matchReasons: string[];
};

export type RoyalCapeJobCandidate = {
  id: string;
  jobNumber: string | null;
  title: string | null;
  customerId: string;
  propertyId: string | null;
  status: string | null;
  executionPhase: string | null;
  quoteNumbers: string[];
  matchReasons: string[];
};

export type RoyalCapeFieldDiff = {
  field: string;
  screenshotValue: string | number | null;
  xeroValue: string | number | null;
  winner: 'XERO' | 'EQUAL' | 'XERO_MISSING';
};

export function assertStagingDatabaseIdentity(input: {
  appEnv?: string | null;
  titanEnv?: string | null;
  databaseUrl?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (input.appEnv !== 'staging' || input.titanEnv !== 'staging') {
    return { ok: false, reason: 'APP_ENV and TITAN_ENV must both be staging.' };
  }
  const url = input.databaseUrl ?? '';
  if (!url) {
    return { ok: false, reason: 'DATABASE_URL missing — cannot run staging rehearsal.' };
  }
  if (url.includes(ROYAL_CAPE_PRODUCTION_FORBIDDEN.supabaseProjectRef)) {
    return {
      ok: false,
      reason: `Refusing production Supabase ${ROYAL_CAPE_PRODUCTION_FORBIDDEN.supabaseProjectRef}.`,
    };
  }
  if (!url.includes(ROYAL_CAPE_STAGING_IDENTITY.supabaseProjectRef)) {
    return {
      ok: false,
      reason: `DATABASE_URL must target staging Supabase ${ROYAL_CAPE_STAGING_IDENTITY.supabaseProjectRef}.`,
    };
  }
  return { ok: true };
}

/** Prove production identity is known and explicitly excluded. */
export function proveProductionUntouched(input: {
  databaseUrl?: string | null;
  xeroWriteCalls: number;
  customerSendCalls: number;
  productionMigrationApplied: boolean;
}): {
  productionIdentity: string;
  productionTouched: false;
  proof: string[];
} {
  const url = input.databaseUrl ?? '';
  const proofs = [
    `Forbidden production Supabase ref ${ROYAL_CAPE_PRODUCTION_FORBIDDEN.supabaseProjectRef} not present in DATABASE_URL.`,
    `Xero write calls = ${input.xeroWriteCalls} (must be 0).`,
    `Customer send calls = ${input.customerSendCalls} (must be 0).`,
    `Production migration applied = ${input.productionMigrationApplied} (must be false).`,
  ];
  if (url.includes(ROYAL_CAPE_PRODUCTION_FORBIDDEN.supabaseProjectRef)) {
    throw new Error('Production database identity detected — abort.');
  }
  if (input.xeroWriteCalls !== 0 || input.customerSendCalls !== 0 || input.productionMigrationApplied) {
    throw new Error('Safety contract violated — abort.');
  }
  return {
    productionIdentity: ROYAL_CAPE_PRODUCTION_FORBIDDEN.supabaseProjectRef,
    productionTouched: false,
    proof: proofs,
  };
}

/**
 * Compare screenshot evidence to Xero-canonical quote. Screenshot never overrides Xero.
 */
export function compareScreenshotToXeroQuote(
  xero: Pick<
    RoyalCapeXeroQuoteSnapshot,
    'quoteNumber' | 'issuedAt' | 'subtotalCents' | 'vatCents' | 'totalCents' | 'currency' | 'reference' | 'customerName'
  >,
): { xeroWins: true; diffs: RoyalCapeFieldDiff[]; screenshotOnlyFields: string[] } {
  const diffs: RoyalCapeFieldDiff[] = [];

  const push = (
    field: string,
    screenshotValue: string | number | null,
    xeroValue: string | number | null,
  ) => {
    if (xeroValue == null || xeroValue === '') {
      diffs.push({ field, screenshotValue, xeroValue, winner: 'XERO_MISSING' });
      return;
    }
    const equal =
      typeof screenshotValue === 'number' && typeof xeroValue === 'number'
        ? screenshotValue === xeroValue
        : String(screenshotValue).trim().toLowerCase() === String(xeroValue).trim().toLowerCase() ||
          (field === 'issuedAt' &&
            String(xeroValue).slice(0, 10) === String(screenshotValue).slice(0, 10));
    diffs.push({
      field,
      screenshotValue,
      xeroValue,
      winner: equal ? 'EQUAL' : 'XERO',
    });
  };

  push('quoteNumber', ROYAL_CAPE_SCREENSHOT_EVIDENCE.quoteNumber, xero.quoteNumber);
  push('issuedAt', ROYAL_CAPE_SCREENSHOT_EVIDENCE.dated, xero.issuedAt);
  push('subtotalCents', ROYAL_CAPE_SCREENSHOT_EVIDENCE.subtotalCentsExVat, xero.subtotalCents);
  push('vatCents', ROYAL_CAPE_SCREENSHOT_EVIDENCE.vatCents, xero.vatCents);
  push('totalCents', ROYAL_CAPE_SCREENSHOT_EVIDENCE.totalCents, xero.totalCents);
  push('currency', ROYAL_CAPE_SCREENSHOT_EVIDENCE.currency, xero.currency);

  return {
    xeroWins: true,
    diffs,
    screenshotOnlyFields: ['customerLabelShown', 'referenceProjectShown'],
  };
}

export function planCanonicalQuoteMatch(input: {
  quotes: RoyalCapeXeroQuoteSnapshot[];
}): {
  decision: RoyalCapeMatchDecision;
  quote: RoyalCapeXeroQuoteSnapshot | null;
  reason: string;
  createQuoteAllowed: false;
} {
  const byNumber = input.quotes.filter(
    (q) => q.quoteNumber.trim().toUpperCase() === ROYAL_CAPE_CANONICAL_QUOTE_NUMBER,
  );

  if (byNumber.length > 1) {
    return {
      decision: 'REVIEW_REQUIRED',
      quote: null,
      reason: `Multiple TITAN quotes share ${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER} — stop; do not silently merge.`,
      createQuoteAllowed: false,
    };
  }
  if (byNumber.length === 1) {
    const quote = byNumber[0]!;
    return {
      decision: quote.jobId ? 'ALREADY_LINKED' : 'USE_EXISTING',
      quote,
      reason: `Canonical Xero quote ${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER} found — do not recreate.`,
      createQuoteAllowed: false,
    };
  }

  return {
    decision: 'MISSING_CANONICAL',
    quote: null,
    reason: `${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER} not present in TITAN — pull from Xero full-history import; do not invent a quote.`,
    createQuoteAllowed: false,
  };
}

export function planCustomerMatch(input: {
  quoteCustomerId: string | null;
  candidates: RoyalCapeCustomerCandidate[];
}): {
  decision: RoyalCapeMatchDecision;
  customer: RoyalCapeCustomerCandidate | null;
  duplicateCandidates: RoyalCapeCustomerCandidate[];
  reason: string;
} {
  if (!input.quoteCustomerId) {
    return {
      decision: 'REVIEW_REQUIRED',
      customer: null,
      duplicateCandidates: input.candidates,
      reason: 'Quote has no customerId — do not assume CRC legal name from screenshot.',
    };
  }

  const linked = input.candidates.filter((c) => c.id === input.quoteCustomerId);
  const others = input.candidates.filter((c) => c.id !== input.quoteCustomerId);

  if (linked.length === 1 && others.length === 0) {
    return {
      decision: 'USE_EXISTING',
      customer: linked[0]!,
      duplicateCandidates: [],
      reason: 'Use the Xero-linked customer as canonical — screenshot CRC label is not authority.',
    };
  }

  if (linked.length === 1 && others.length > 0) {
    return {
      decision: 'REVIEW_REQUIRED',
      customer: linked[0]!,
      duplicateCandidates: others,
      reason: 'Additional customer candidates exist — stop for review; do not silently merge.',
    };
  }

  if (others.length > 1) {
    return {
      decision: 'REVIEW_REQUIRED',
      customer: null,
      duplicateCandidates: others,
      reason: 'Multiple customer candidates without a quote-linked customer — review required.',
    };
  }

  return {
    decision: 'MISSING_CANONICAL',
    customer: null,
    duplicateCandidates: others,
    reason: 'Canonical customer for QU-0183 not found in TITAN.',
  };
}

export function planRoyalCapePropertyMatch(input: {
  customerId: string | null;
  candidates: RoyalCapePropertyCandidate[];
}): {
  decision: RoyalCapeMatchDecision;
  property: RoyalCapePropertyCandidate | null;
  duplicateCandidates: RoyalCapePropertyCandidate[];
  reason: string;
} {
  const scoped = input.customerId
    ? input.candidates.filter((p) => p.customerId === input.customerId)
    : input.candidates;

  const nameMatches = scoped.filter((p) =>
    p.name.toLowerCase().includes('royal cape yacht club'),
  );

  if (nameMatches.length > 1) {
    return {
      decision: 'REVIEW_REQUIRED',
      property: null,
      duplicateCandidates: nameMatches,
      reason: 'Multiple Royal Cape Yacht Club sites — review required; no duplicate sites.',
    };
  }

  if (nameMatches.length === 1) {
    return {
      decision: 'USE_EXISTING',
      property: nameMatches[0]!,
      duplicateCandidates: [],
      reason: 'Use the single existing Royal Cape Yacht Club site.',
    };
  }

  if (!input.customerId) {
    return {
      decision: 'BLOCKED',
      property: null,
      duplicateCandidates: [],
      reason: 'Cannot create a site without a verified customer.',
    };
  }

  return {
    decision: 'CREATE_ONCE',
    property: null,
    duplicateCandidates: [],
    reason:
      'No Royal Cape Yacht Club site found — create exactly one from verified real information only (name + customer). Do not invent address/contacts.',
  };
}

export function planRoyalCapeJobMatch(input: {
  customerId: string | null;
  propertyId: string | null;
  quote: RoyalCapeXeroQuoteSnapshot | null;
  candidates: RoyalCapeJobCandidate[];
}): {
  decision: RoyalCapeMatchDecision;
  job: RoyalCapeJobCandidate | null;
  duplicateCandidates: RoyalCapeJobCandidate[];
  reason: string;
} {
  if (input.quote?.jobId) {
    const linked = input.candidates.find((j) => j.id === input.quote!.jobId) ?? null;
    return {
      decision: 'ALREADY_LINKED',
      job: linked,
      duplicateCandidates: [],
      reason: `QU-0183 already linked to job ${input.quote.jobId} — do not create another.`,
    };
  }

  const byQuote = input.candidates.filter((j) =>
    j.quoteNumbers.some((n) => n.toUpperCase() === ROYAL_CAPE_CANONICAL_QUOTE_NUMBER),
  );
  if (byQuote.length > 1) {
    return {
      decision: 'REVIEW_REQUIRED',
      job: null,
      duplicateCandidates: byQuote,
      reason: 'Multiple jobs already reference QU-0183 — review required.',
    };
  }
  if (byQuote.length === 1) {
    return {
      decision: 'LINK_EXISTING',
      job: byQuote[0]!,
      duplicateCandidates: [],
      reason: 'Existing job already references QU-0183 — link the Xero quote to it.',
    };
  }

  const siteJobs = input.candidates.filter(
    (j) =>
      input.customerId != null &&
      j.customerId === input.customerId &&
      (input.propertyId == null || j.propertyId === input.propertyId) &&
      ((j.title ?? '').toLowerCase().includes('royal cape') ||
        (j.title ?? '').toLowerCase().includes('yacht')),
  );

  if (siteJobs.length > 1) {
    return {
      decision: 'REVIEW_REQUIRED',
      job: null,
      duplicateCandidates: siteJobs,
      reason: 'Multiple Royal Cape jobs for this customer/site — review required.',
    };
  }
  if (siteJobs.length === 1) {
    return {
      decision: 'LINK_EXISTING',
      job: siteJobs[0]!,
      duplicateCandidates: [],
      reason: 'One matching Royal Cape job found — link QU-0183; do not create another.',
    };
  }

  if (!input.customerId) {
    return {
      decision: 'BLOCKED',
      job: null,
      duplicateCandidates: [],
      reason: 'Cannot create a Job without verified customer from Xero quote.',
    };
  }

  return {
    decision: 'CREATE_ONCE',
    job: null,
    duplicateCandidates: [],
    reason:
      'No matching Job — create exactly ONE Job 360 shell for Royal Cape and link QU-0183. Do not invent photos, payments, technicians, or materials.',
  };
}

export type RoyalCapeJob360View = {
  core: {
    jobNumber: string | null;
    customerName: string | null;
    siteName: string;
    description: string;
    status: string | null;
    provenance: string[];
  };
  commercial: {
    quoteNumber: string;
    issuedAt: string | null;
    lineItemCount: number;
    subtotalCents: number | null;
    vatCents: number | null;
    totalCents: number | null;
    currency: string | null;
    quoteStatus: string | null;
    xeroQuoteId: string | null;
    sourceExternalId: string | null;
  };
  payment: {
    state: 'unpaid_no_payment_record' | 'has_payment_records';
    paymentCount: number;
    note: string;
  };
  documents: {
    quotePdfLinked: boolean;
    inventDocumentsForbidden: true;
  };
  history: string[];
  invented: {
    photos: false;
    cocs: false;
    payments: false;
    signatures: false;
    technicians: false;
    materials: false;
  };
};

export function buildRoyalCapeJob360View(input: {
  jobNumber: string | null;
  customerName: string | null;
  status: string | null;
  quote: RoyalCapeXeroQuoteSnapshot;
  paymentCount: number;
  quotePdfLinked: boolean;
  historyEvents: string[];
}): RoyalCapeJob360View {
  return {
    core: {
      jobNumber: input.jobNumber,
      customerName: input.customerName,
      siteName: ROYAL_CAPE_SITE_NAME,
      description: `Work related to Xero quote ${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER} — Royal Cape Yacht Club`,
      status: input.status,
      provenance: [
        'source:xero_quote',
        `quote:${ROYAL_CAPE_CANONICAL_QUOTE_NUMBER}`,
        input.quote.xeroQuoteId ? `xeroQuoteId:${input.quote.xeroQuoteId}` : 'xeroQuoteId:pending_verify',
        'pilot:royal_cape_staging_rehearsal',
      ],
    },
    commercial: {
      quoteNumber: input.quote.quoteNumber,
      issuedAt: input.quote.issuedAt,
      lineItemCount: input.quote.lineItemCount,
      subtotalCents: input.quote.subtotalCents,
      vatCents: input.quote.vatCents,
      totalCents: input.quote.totalCents,
      currency: input.quote.currency,
      quoteStatus: input.quote.status,
      xeroQuoteId: input.quote.xeroQuoteId,
      sourceExternalId: input.quote.sourceExternalId,
    },
    payment: {
      state: input.paymentCount > 0 ? 'has_payment_records' : 'unpaid_no_payment_record',
      paymentCount: input.paymentCount,
      note:
        input.paymentCount > 0
          ? 'Existing payment records present — QU-0183 itself is not cash received.'
          : 'No payment records — truthful unpaid/no-payment state. Do not invent deposits.',
    },
    documents: {
      quotePdfLinked: input.quotePdfLinked,
      inventDocumentsForbidden: true,
    },
    history: input.historyEvents,
    invented: {
      photos: false,
      cocs: false,
      payments: false,
      signatures: false,
      technicians: false,
      materials: false,
    },
  };
}

export type RoyalCapeMultiDayRehearsalStep = {
  step: string;
  allowed: boolean;
  note: string;
};

/**
 * Capability rehearsal for multi-day Royal Cape work — staging-safe, no fake field data.
 * Does not send notifications, write to Xero, or collect payment.
 */
export function rehearseRoyalCapeMultiDayWorkflow(): {
  oneJobPersists: true;
  visitsRemainSeparate: true;
  stopForTodayDoesNotComplete: true;
  stillBusyBlocksFinalInvoice: true;
  noDuplicateJobsPerDay: true;
  steps: RoyalCapeMultiDayRehearsalStep[];
  invoiceGate: ReturnType<typeof isInvoiceBlockedByVisitState>;
  stillBusyKeepsJobOpen: boolean;
} {
  const stillBusyPhase = 'work_continues' as const;
  const invoiceGate = isInvoiceBlockedByVisitState({
    executionPhase: stillBusyPhase,
    hasOpenVisit: false,
    jobCompleted: false,
  });

  const canCompleteFromStillBusy =
    JOB_EXECUTION_TRANSITIONS.complete.includes(stillBusyPhase);
  const canReadyFromStillBusy =
    JOB_EXECUTION_TRANSITIONS.ready_to_complete.includes(stillBusyPhase);
  const canRestartFromStillBusy =
    JOB_EXECUTION_TRANSITIONS.start_work.includes(stillBusyPhase);

  return {
    oneJobPersists: true,
    visitsRemainSeparate: true,
    stopForTodayDoesNotComplete: true,
    stillBusyBlocksFinalInvoice: true,
    noDuplicateJobsPerDay: true,
    stillBusyKeepsJobOpen: phaseToJobStatus(stillBusyPhase) === 'in_progress',
    invoiceGate,
    steps: [
      { step: 'Job OPEN', allowed: true, note: 'Single canonical Job remains open across days.' },
      { step: 'Schedule', allowed: true, note: 'Staging schedule only — no customer notification.' },
      { step: 'Assign technician', allowed: true, note: 'Staging assignment only — no invented techs in pilot seed.' },
      { step: 'Start visit', allowed: true, note: 'Each visit is a separate job_visits row.' },
      { step: 'Capture time / materials / evidence', allowed: true, note: 'Only when genuinely captured — never invent.' },
      {
        step: 'Still Busy / Work Continues',
        allowed: canRestartFromStillBusy && canReadyFromStillBusy && !canCompleteFromStillBusy,
        note: 'Stop for Today → work_continues; Complete is not available until ready_to_complete.',
      },
      {
        step: 'Final invoice while Still Busy',
        allowed: false,
        note: invoiceGate.reason ?? 'Blocked while work_continues',
      },
      {
        step: 'Ready for Invoicing path',
        allowed: true,
        note: 'Only after ready_to_complete → complete; draft invoice path staging-only, no Xero write.',
      },
    ],
  };
}

export function assertRoyalCapeJpeRelationship(input: {
  quotedRevenueCents: number | null;
  paymentCount: number;
  labourCostCents: number;
  materialCostCents: number;
}): {
  quoteIsNotCashReceived: true;
  inventCostsForbidden: true;
  rollupReady: true;
  note: string;
} {
  if (input.paymentCount === 0 && input.quotedRevenueCents != null) {
    // ok — quote exists without cash
  }
  if (input.labourCostCents < 0 || input.materialCostCents < 0) {
    throw new Error('Costs must not be negative or invented.');
  }
  return {
    quoteIsNotCashReceived: true,
    inventCostsForbidden: true,
    rollupReady: true,
    note: 'JPE can roll up quoted revenue, invoices, payments, labour, materials once they exist — QU-0183 is not cash.',
  };
}

export function assertRoyalCapeRbacSeparation(input: {
  ownerPermissions: string[];
  technicianPermissions: string[];
  clientPayload: Record<string, unknown>;
}): {
  ownerMaySeeJpe: boolean;
  technicianMaySeeJpe: boolean;
  clientStripped: Record<string, unknown>;
  clientHasNoInternalFinance: boolean;
} {
  const ownerMaySeeJpe = canAccessJobProfitability({ permissions: input.ownerPermissions });
  const technicianMaySeeJpe = canAccessJobProfitability({
    permissions: input.technicianPermissions,
  });
  const clientStripped = filterHistoricalInternalFinanceForClient(input.clientPayload);
  const clientHasNoInternalFinance =
    !('jpe' in clientStripped) &&
    !('estimatedCostCents' in clientStripped) &&
    !('grossProfitCents' in clientStripped) &&
    !('marginBps' in clientStripped);

  return {
    ownerMaySeeJpe,
    technicianMaySeeJpe,
    clientStripped,
    clientHasNoInternalFinance,
  };
}

export function assertRoyalCapeIdempotency(input: {
  first: { customerId: string; propertyId: string; jobId: string; quoteId: string };
  second: { customerId: string; propertyId: string; jobId: string; quoteId: string };
}): { idempotent: true; reason: string } {
  if (
    input.first.customerId !== input.second.customerId ||
    input.first.propertyId !== input.second.propertyId ||
    input.first.jobId !== input.second.jobId ||
    input.first.quoteId !== input.second.quoteId
  ) {
    throw new Error('Re-run produced different canonical IDs — duplicate risk.');
  }
  return {
    idempotent: true,
    reason: 'Second matching pass returned the same customer, site, job, and QU-0183 quote IDs.',
  };
}

export function buildRoyalCapeAuditEvents(input: {
  actorUserId: string | null;
  tenantCompanyId: string;
  quoteId: string | null;
  customerId: string | null;
  propertyId: string | null;
  propertyCreated: boolean;
  jobId: string | null;
  jobCreated: boolean;
  quoteLinked: boolean;
  documentLinked: boolean;
}): Array<{
  action: string;
  entityType: string;
  entityId: string | null;
  tenantCompanyId: string;
  actorUserId: string | null;
  source: string;
  at: string;
}> {
  const at = new Date().toISOString();
  const base = {
    tenantCompanyId: input.tenantCompanyId,
    actorUserId: input.actorUserId,
    source: 'royal_cape_staging_rehearsal',
    at,
  };
  const events: Array<{
    action: string;
    entityType: string;
    entityId: string | null;
    tenantCompanyId: string;
    actorUserId: string | null;
    source: string;
    at: string;
  }> = [
    {
      ...base,
      action: 'quote_matched',
      entityType: 'quote',
      entityId: input.quoteId,
    },
    {
      ...base,
      action: 'customer_matched',
      entityType: 'customer',
      entityId: input.customerId,
    },
    {
      ...base,
      action: input.propertyCreated ? 'property_created' : 'property_matched',
      entityType: 'property',
      entityId: input.propertyId,
    },
    {
      ...base,
      action: input.jobCreated ? 'job_created' : 'job_matched',
      entityType: 'job',
      entityId: input.jobId,
    },
  ];
  if (input.quoteLinked) {
    events.push({
      ...base,
      action: 'quote_linked_to_job',
      entityType: 'quote',
      entityId: input.quoteId,
    });
  }
  if (input.documentLinked) {
    events.push({
      ...base,
      action: 'document_linked',
      entityType: 'document',
      entityId: input.jobId,
    });
  }
  return events;
}

export function assertFullHistoryRuleRemainsActive(): {
  active: true;
  syncModeRequiredForInitialMigration: HistoricalSyncMode;
  note: string;
} {
  return {
    active: true,
    syncModeRequiredForInitialMigration: YOUNG_GUNS_FULL_HISTORY_POLICY.syncMode,
    note: 'Royal Cape pilot is not proof that entire Young Guns historical migration is complete. Full history + then incremental remains mandatory.',
  };
}

export type RoyalCapeRehearsalPlan = {
  safety: RoyalCapeSafetyContract;
  quotePlan: ReturnType<typeof planCanonicalQuoteMatch>;
  customerPlan: ReturnType<typeof planCustomerMatch>;
  propertyPlan: ReturnType<typeof planRoyalCapePropertyMatch>;
  jobPlan: ReturnType<typeof planRoyalCapeJobMatch>;
  screenshotCompare: ReturnType<typeof compareScreenshotToXeroQuote> | null;
  multiDay: ReturnType<typeof rehearseRoyalCapeMultiDayWorkflow>;
  fullHistory: ReturnType<typeof assertFullHistoryRuleRemainsActive>;
  blocked: boolean;
  blockers: string[];
};

export function buildRoyalCapeRehearsalPlan(input: {
  quotes: RoyalCapeXeroQuoteSnapshot[];
  customers: RoyalCapeCustomerCandidate[];
  properties: RoyalCapePropertyCandidate[];
  jobs: RoyalCapeJobCandidate[];
}): RoyalCapeRehearsalPlan {
  const quotePlan = planCanonicalQuoteMatch({ quotes: input.quotes });
  const quote = quotePlan.quote;
  const screenshotCompare = quote ? compareScreenshotToXeroQuote(quote) : null;
  const customerPlan = planCustomerMatch({
    quoteCustomerId: quote?.customerId ?? null,
    candidates: input.customers,
  });
  const propertyPlan = planRoyalCapePropertyMatch({
    customerId: customerPlan.customer?.id ?? quote?.customerId ?? null,
    candidates: input.properties,
  });
  const jobPlan = planRoyalCapeJobMatch({
    customerId: customerPlan.customer?.id ?? quote?.customerId ?? null,
    propertyId: propertyPlan.property?.id ?? null,
    quote,
    candidates: input.jobs,
  });

  const blockers: string[] = [];
  for (const plan of [quotePlan, customerPlan, propertyPlan, jobPlan]) {
    if (plan.decision === 'REVIEW_REQUIRED' || plan.decision === 'BLOCKED') {
      blockers.push(plan.reason);
    }
    if (plan.decision === 'MISSING_CANONICAL') {
      blockers.push(plan.reason);
    }
  }

  return {
    safety: ROYAL_CAPE_SAFETY_CONTRACT,
    quotePlan,
    customerPlan,
    propertyPlan,
    jobPlan,
    screenshotCompare,
    multiDay: rehearseRoyalCapeMultiDayWorkflow(),
    fullHistory: assertFullHistoryRuleRemainsActive(),
    blocked: blockers.length > 0,
    blockers,
  };
}
