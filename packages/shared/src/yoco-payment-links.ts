/**
 * AURA Yoco payment links.
 *
 * One link per issued invoice with an outstanding balance — never a generic
 * per-customer link. All money stays in integer minor units; there is no
 * floating-point arithmetic anywhere in this module.
 *
 * @see https://developer.yoco.com — POST /v1/payment_links/
 */

/** Official Yoco payment-link endpoint. */
export const YOCO_PAYMENT_LINKS_ENDPOINT = 'https://api.yoco.com/v1/payment_links/';

/** Scopes the Yoco credential must carry to create and read payment links. */
export const YOCO_PAYMENT_LINK_SCOPES: readonly string[] = [
  'business/orders:read',
  'business/orders:write',
];

/** Host that serves real Yoco hosted payment pages. */
export const YOCO_PAY_HOST = 'pay.yoco.com';

/** Yoco's minimum charge is R2.00. */
export const YOCO_MINIMUM_AMOUNT_CENTS = 200;

export class YocoPaymentLinkError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'YocoPaymentLinkError';
  }
}

/**
 * Lifecycle of a link record.
 *
 * `prepared` is an Owner-approved intent that has not been sent to Yoco yet, so
 * a balance change can invalidate it before any external call happens.
 */
export type PaymentLinkStatus =
  | 'prepared'
  | 'active'
  | 'superseded'
  | 'paid'
  | 'cancelled'
  | 'failed';

export const PAYMENT_LINK_STATUSES: readonly PaymentLinkStatus[] = [
  'prepared',
  'active',
  'superseded',
  'paid',
  'cancelled',
  'failed',
];

/** Statuses where the link can still take a customer payment. */
export const LIVE_PAYMENT_LINK_STATUSES: readonly PaymentLinkStatus[] = ['prepared', 'active'];

export function isLivePaymentLinkStatus(status: PaymentLinkStatus): boolean {
  return LIVE_PAYMENT_LINK_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Money conversion
// ---------------------------------------------------------------------------

/**
 * Converts TITAN cents to the integer minor units Yoco expects.
 *
 * TITAN already stores money as integer cents, so this is an identity check
 * rather than a conversion — but it is an explicit, tested boundary because a
 * silent float here would send a customer the wrong amount.
 */
export function toYocoMinorUnits(amountCents: number): number {
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents)) {
    throw new YocoPaymentLinkError('INVALID_AMOUNT', 'Payment amount must be a finite number');
  }
  if (!Number.isInteger(amountCents)) {
    throw new YocoPaymentLinkError(
      'INVALID_AMOUNT',
      `Payment amount must be whole cents, received ${amountCents}`,
    );
  }
  if (amountCents <= 0) {
    throw new YocoPaymentLinkError('INVALID_AMOUNT', 'Payment amount must be greater than zero');
  }
  if (!Number.isSafeInteger(amountCents)) {
    throw new YocoPaymentLinkError('INVALID_AMOUNT', 'Payment amount exceeds the safe integer range');
  }
  return amountCents;
}

/** Reads an amount returned by Yoco back into TITAN cents. */
export function fromYocoMinorUnits(amount: unknown): number {
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new YocoPaymentLinkError(
      'INVALID_AMOUNT',
      'Yoco returned a non-integer amount; refusing to record it',
    );
  }
  return amount;
}

/**
 * Formats cents for a human-readable description without floating point.
 * `1293750` becomes `12937.50`.
 */
export function formatMinorUnitsAsDecimal(amountCents: number): string {
  const cents = toYocoMinorUnits(amountCents);
  const whole = Math.trunc(cents / 100);
  const fraction = cents % 100;
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type PaymentLinkEligibilityInput = {
  documentType: 'invoice' | 'quote' | 'report';
  /** Invoice status from the existing invoice_status enum. */
  invoiceStatus?: string | null;
  isIssued: boolean;
  outstandingCents: number;
  currency: string;
};

export type PaymentLinkEligibility =
  | { eligible: true }
  | { eligible: false; code: string; reason: string };

/**
 * Decides whether an invoice may carry a Yoco link. Quotes and reports never
 * do, and neither do paid or zero-balance invoices.
 */
export function evaluatePaymentLinkEligibility(
  input: PaymentLinkEligibilityInput,
): PaymentLinkEligibility {
  if (input.documentType !== 'invoice') {
    return {
      eligible: false,
      code: 'NOT_AN_INVOICE',
      reason: `Payment links are only created for invoices, not ${input.documentType}s`,
    };
  }
  if (!input.isIssued) {
    return {
      eligible: false,
      code: 'NOT_ISSUED',
      reason: 'A payment link is only created when the invoice is issued',
    };
  }
  if (input.invoiceStatus === 'cancelled') {
    return { eligible: false, code: 'INVOICE_CANCELLED', reason: 'This invoice is cancelled' };
  }
  if (input.invoiceStatus === 'paid') {
    return { eligible: false, code: 'INVOICE_PAID', reason: 'This invoice is already paid' };
  }
  if (!Number.isInteger(input.outstandingCents)) {
    return {
      eligible: false,
      code: 'INVALID_OUTSTANDING',
      reason: 'Outstanding balance must be whole cents',
    };
  }
  if (input.outstandingCents <= 0) {
    return {
      eligible: false,
      code: 'NO_OUTSTANDING_BALANCE',
      reason: 'This invoice has no outstanding balance',
    };
  }
  if (input.outstandingCents < YOCO_MINIMUM_AMOUNT_CENTS) {
    return {
      eligible: false,
      code: 'BELOW_YOCO_MINIMUM',
      reason: `Yoco cannot take payments below R${formatMinorUnitsAsDecimal(YOCO_MINIMUM_AMOUNT_CENTS)}`,
    };
  }
  if (input.currency !== 'ZAR') {
    return {
      eligible: false,
      code: 'UNSUPPORTED_CURRENCY',
      reason: `Yoco payment links are ZAR only, invoice is ${input.currency}`,
    };
  }
  return { eligible: true };
}

// ---------------------------------------------------------------------------
// Request payload
// ---------------------------------------------------------------------------

export type BuildPaymentLinkRequestInput = {
  invoiceNumber: string;
  customerName: string;
  /** Stable customer reference (customer number or id) for reconciliation. */
  customerReference: string;
  outstandingCents: number;
  currency: string;
  companyTradingName: string;
  /** Correlation id written to the audit trail and echoed in metadata. */
  correlationId: string;
  invoiceId: string;
  customerId: string;
  companyId: string;
};

export type YocoPaymentLinkRequest = {
  amount: number;
  currency: string;
  description: string;
  reference: string;
  metadata: Record<string, string>;
};

/**
 * Builds the create-payment-link payload. Metadata carries our own identifiers
 * so a webhook can be matched without trusting anything the client sends.
 */
export function buildPaymentLinkRequest(
  input: BuildPaymentLinkRequestInput,
): YocoPaymentLinkRequest {
  const invoiceNumber = requireText(input.invoiceNumber, 'invoiceNumber');
  const customerName = requireText(input.customerName, 'customerName');
  const customerReference = requireText(input.customerReference, 'customerReference');

  if (input.currency !== 'ZAR') {
    throw new YocoPaymentLinkError(
      'UNSUPPORTED_CURRENCY',
      `Yoco payment links are ZAR only, received ${input.currency}`,
    );
  }

  return {
    amount: toYocoMinorUnits(input.outstandingCents),
    currency: 'ZAR',
    description: `${requireText(input.companyTradingName, 'companyTradingName')} invoice ${invoiceNumber} — outstanding balance R${formatMinorUnitsAsDecimal(input.outstandingCents)}`,
    reference: buildPaymentLinkReference(invoiceNumber, customerReference),
    metadata: {
      titan_invoice_id: input.invoiceId,
      titan_invoice_number: invoiceNumber,
      titan_customer_id: input.customerId,
      titan_customer_reference: customerReference,
      titan_customer_name: customerName,
      titan_company_id: input.companyId,
      titan_correlation_id: requireText(input.correlationId, 'correlationId'),
    },
  };
}

/** Customer-visible reference combining invoice number and customer reference. */
export function buildPaymentLinkReference(
  invoiceNumber: string,
  customerReference: string,
): string {
  return `${invoiceNumber}/${customerReference}`;
}

function requireText(value: string | null | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new YocoPaymentLinkError('VALIDATION_ERROR', `${field} is required`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * Identity of a link request: the same invoice version at the same balance must
 * reuse one link, and a changed balance must produce a different one.
 */
export function buildPaymentLinkIdempotencyKey(input: {
  invoiceId: string;
  documentVersion: number;
  outstandingCents: number;
}): string {
  if (!Number.isInteger(input.documentVersion) || input.documentVersion < 1) {
    throw new YocoPaymentLinkError('VALIDATION_ERROR', 'documentVersion must be a positive integer');
  }
  return `titan-invoice-${input.invoiceId}-v${input.documentVersion}-${toYocoMinorUnits(input.outstandingCents)}`;
}

/**
 * A prepared request is invalidated when the balance moves, so an obsolete
 * amount can never be sent to a customer.
 */
export function shouldInvalidatePreparedLink(
  prepared: { amountCents: number; documentVersion: number },
  current: { outstandingCents: number; documentVersion: number },
): boolean {
  return (
    prepared.amountCents !== current.outstandingCents ||
    prepared.documentVersion !== current.documentVersion
  );
}

/** Whether an existing live link still matches the invoice, or must be replaced. */
export function resolveExistingLinkAction(
  existing: { status: PaymentLinkStatus; amountCents: number; documentVersion: number } | null,
  current: { outstandingCents: number; documentVersion: number },
): { action: 'create' | 'reuse' | 'regenerate'; reason: string } {
  if (!existing) {
    return { action: 'create', reason: 'No payment link exists for this invoice yet' };
  }
  if (!isLivePaymentLinkStatus(existing.status)) {
    return {
      action: 'create',
      reason: `Previous link is ${existing.status}; a new link is required`,
    };
  }
  if (
    existing.amountCents === current.outstandingCents &&
    existing.documentVersion === current.documentVersion
  ) {
    return { action: 'reuse', reason: 'An active link already matches this balance' };
  }
  return {
    action: 'regenerate',
    reason: 'The outstanding balance changed, so the existing link is out of date',
  };
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/**
 * Accepts only a real Yoco hosted payment URL. A QR is generated from the same
 * string that the Pay button uses, so this gate protects both.
 */
export function isYocoPaymentUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return parsed.hostname === YOCO_PAY_HOST || parsed.hostname.endsWith(`.${YOCO_PAY_HOST}`);
}

export function requireYocoPaymentUrl(value: unknown): string {
  if (!isYocoPaymentUrl(value)) {
    throw new YocoPaymentLinkError(
      'INVALID_PAYMENT_URL',
      `Yoco did not return a ${YOCO_PAY_HOST} payment URL; refusing to publish it`,
    );
  }
  return value.trim();
}

// ---------------------------------------------------------------------------
// Approve & Issue confirmation
// ---------------------------------------------------------------------------

export type ApproveAndIssueSummary = {
  customerName: string;
  invoiceNumber: string;
  outstandingCents: number;
  currency: string;
  /** True when Approve & Issue will ask Yoco for a link. */
  willCreatePaymentLink: boolean;
  /** Reason shown when no link will be created. */
  paymentLinkSkippedReason: string | null;
  /** Plain-language statements rendered in the confirmation dialog. */
  statements: string[];
};

/**
 * Content for the Owner's single Approve & Issue confirmation. Approving that
 * one dialog authorises the one link creation — nothing re-prompts afterwards.
 */
export function describeApproveAndIssue(input: {
  customerName: string;
  invoiceNumber: string;
  outstandingCents: number;
  currency: string;
  yocoConnected: boolean;
  eligibility: PaymentLinkEligibility;
}): ApproveAndIssueSummary {
  const statements: string[] = [
    `Invoice ${input.invoiceNumber} will be issued to ${input.customerName}.`,
    `Outstanding balance: ${input.currency} ${formatMinorUnitsAsDecimal(Math.max(input.outstandingCents, 1))}.`,
  ];

  if (!input.eligibility.eligible) {
    return {
      customerName: input.customerName,
      invoiceNumber: input.invoiceNumber,
      outstandingCents: input.outstandingCents,
      currency: input.currency,
      willCreatePaymentLink: false,
      paymentLinkSkippedReason: input.eligibility.reason,
      statements: [...statements, `No payment link will be created: ${input.eligibility.reason}.`],
    };
  }

  if (!input.yocoConnected) {
    const reason = 'Yoco is not connected for this company';
    return {
      customerName: input.customerName,
      invoiceNumber: input.invoiceNumber,
      outstandingCents: input.outstandingCents,
      currency: input.currency,
      willCreatePaymentLink: false,
      paymentLinkSkippedReason: reason,
      statements: [
        ...statements,
        `No payment link will be created: ${reason}. Connect Yoco in Integrations first.`,
      ],
    };
  }

  return {
    customerName: input.customerName,
    invoiceNumber: input.invoiceNumber,
    outstandingCents: input.outstandingCents,
    currency: input.currency,
    willCreatePaymentLink: true,
    paymentLinkSkippedReason: null,
    statements: [
      ...statements,
      'AURA will create one Yoco payment link for this invoice and this balance.',
      'The payment URL and a scannable QR code will be embedded in the invoice.',
      'Approving here authorises that single link creation.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

/** The only Yoco event this milestone consumes. */
export const YOCO_PAYMENT_CREATED_EVENT = 'payment.created';

export type YocoWebhookPaymentEvent = {
  eventId: string;
  type: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  /** Yoco payment-link / order identifiers used to match our stored record. */
  paymentLinkId: string | null;
  orderId: string | null;
  metadata: Record<string, string>;
};

/**
 * Parses a verified webhook body. Matching happens on Yoco's own identifiers,
 * so a client-supplied invoice id can never redirect a payment.
 */
export function parseYocoPaymentWebhook(body: unknown): YocoWebhookPaymentEvent {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new YocoPaymentLinkError('INVALID_PAYLOAD', 'Webhook body must be an object');
  }
  const record = body as Record<string, unknown>;

  const type = readString(record, ['type', 'eventType']);
  if (!type) {
    throw new YocoPaymentLinkError('INVALID_PAYLOAD', 'Webhook is missing an event type');
  }

  const eventId = readString(record, ['id', 'eventId']);
  if (!eventId) {
    throw new YocoPaymentLinkError('INVALID_PAYLOAD', 'Webhook is missing an event id');
  }

  const payload =
    record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : record;

  const paymentId = readString(payload, ['id', 'paymentId']);
  if (!paymentId) {
    throw new YocoPaymentLinkError('INVALID_PAYLOAD', 'Webhook is missing a payment id');
  }

  const rawAmount = payload.amount ?? payload.amountInCents;
  const currency = readString(payload, ['currency']) ?? 'ZAR';

  return {
    eventId,
    type,
    paymentId,
    amountCents: fromYocoMinorUnits(rawAmount),
    currency,
    paymentLinkId: readString(payload, ['paymentLinkId', 'payment_link_id', 'linkId']),
    orderId: readString(payload, ['orderId', 'order_id']),
    metadata: readMetadata(payload.metadata),
  };
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

/**
 * A verified `payment.created` records a provider event only. Xero remains the
 * financial source of truth, so nothing here claims reconciliation.
 */
export type WebhookReconciliationOutcome = {
  recordPayment: boolean;
  markLinkPaid: boolean;
  financiallyReconciled: false;
  note: string;
};

export function resolveWebhookOutcome(event: YocoWebhookPaymentEvent): WebhookReconciliationOutcome {
  if (event.type !== YOCO_PAYMENT_CREATED_EVENT) {
    return {
      recordPayment: false,
      markLinkPaid: false,
      financiallyReconciled: false,
      note: `Ignored unsupported Yoco event "${event.type}"`,
    };
  }
  return {
    recordPayment: true,
    markLinkPaid: true,
    financiallyReconciled: false,
    note: 'Recorded a Yoco payment event; Xero remains the source of truth for reconciliation',
  };
}
