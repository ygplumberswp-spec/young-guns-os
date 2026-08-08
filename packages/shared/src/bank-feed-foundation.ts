/**
 * Row 108 — Bank Connection / Intake Foundation
 *
 * Provider-neutral, read/import-only foundation for Young Guns.
 * Prefer supported consent/token feed IF genuinely available.
 * Otherwise CONTROLLED_STATEMENT_IMPORT (existing CSV path).
 *
 * NEVER store online-banking username/password/PIN/OTP/CVV.
 * No payment initiation / transfers / beneficiary creation.
 * No Row109–116 matching/reconcile/JPE/Xero writes.
 * Row117 OCR not started. Row118 remains OPEN.
 * Staging: real Xero/customer/production writes = 0; money movement = 0.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import {
  BANK_STATEMENT_SUPPORTED_FORMATS,
  isSupportedBankStatementMime,
  sanitizeBankStatementFilename,
} from './bank-statement-import.js';

export const BANK_FEED_FOUNDATION_KEY = 'bank-feed-foundation' as const;

export const BANK_FEED_FOUNDATION_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

/** Hard-forbidden credential field names — never accepted/stored. */
export const BANK_FEED_FORBIDDEN_CREDENTIAL_FIELDS = [
  'username',
  'password',
  'onlineBankingUsername',
  'onlineBankingPassword',
  'bankingPin',
  'pin',
  'otp',
  'oneTimePassword',
  'cardPin',
  'cvv',
  'cvc',
  'cardNumber',
  'fullCardNumber',
  'cardCredentials',
] as const;

export type BankFeedFoundationMode =
  | 'PROVIDER_FEED'
  | 'CONTROLLED_STATEMENT_IMPORT'
  | 'NOT_CONFIGURED'
  | 'PROVIDER_UNAVAILABLE';

export type BankFeedConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'AWAITING_CONSENT'
  | 'CONNECTED_READ_ONLY'
  | 'STATEMENT_IMPORT_ONLY'
  | 'TOKEN_EXPIRED'
  | 'PROVIDER_ERROR'
  | 'DISCONNECTED';

export type BankFeedSourceType =
  | 'provider_consent_token'
  | 'controlled_statement_import'
  | 'none';

export type BankFeedCapabilityAudit = {
  /** True only when a real supported consent/token client exists in code. */
  liveProviderFeedAvailable: boolean;
  /** Known providers scanned (none configured for FNB open-banking today). */
  scannedProviders: string[];
  supportedStatementFormats: ReadonlyArray<{ mimeType: string; extension: string; label: string }>;
  csvImportAvailable: boolean;
  xlsxImportAvailable: boolean;
  pdfOcrAvailable: false;
  paymentInitiationAllowed: false;
  transferAllowed: false;
  beneficiaryCreationAllowed: false;
  mode: BankFeedFoundationMode;
  reason: string;
};

/**
 * Capability truth — never invent FNB/API availability.
 * Current repo: no FNB/Plaid/Stitch client → PROVIDER_UNAVAILABLE + statement import.
 */
export function resolveBankFeedCapability(input?: {
  /** Explicit future flag when a real consent client is wired. */
  legitimateProviderFeedConfigured?: boolean;
  providerIdsPresent?: string[];
}): BankFeedCapabilityAudit {
  const scanned = input?.providerIdsPresent ?? [];
  const live =
    input?.legitimateProviderFeedConfigured === true &&
    scanned.some((p) => ['stitch', 'plaid', 'open_banking', 'fnb_feed'].includes(p));

  if (live) {
    return {
      liveProviderFeedAvailable: true,
      scannedProviders: scanned,
      supportedStatementFormats: BANK_STATEMENT_SUPPORTED_FORMATS,
      csvImportAvailable: true,
      xlsxImportAvailable: false,
      pdfOcrAvailable: false,
      paymentInitiationAllowed: false,
      transferAllowed: false,
      beneficiaryCreationAllowed: false,
      mode: 'PROVIDER_FEED',
      reason: 'Legitimate supported provider consent/token path is configured.',
    };
  }

  return {
    liveProviderFeedAvailable: false,
    scannedProviders: scanned,
    supportedStatementFormats: BANK_STATEMENT_SUPPORTED_FORMATS,
    csvImportAvailable: true,
    xlsxImportAvailable: false,
    pdfOcrAvailable: false,
    paymentInitiationAllowed: false,
    transferAllowed: false,
    beneficiaryCreationAllowed: false,
    mode: 'PROVIDER_UNAVAILABLE',
    reason:
      'No legitimate FNB/open-banking/provider feed client is available in TITAN; use controlled statement import.',
  };
}

export function resolveFoundationOperatingMode(
  capability: BankFeedCapabilityAudit,
): BankFeedFoundationMode {
  if (capability.mode === 'PROVIDER_FEED') return 'PROVIDER_FEED';
  if (capability.csvImportAvailable) return 'CONTROLLED_STATEMENT_IMPORT';
  return 'NOT_CONFIGURED';
}

export type BankFeedConnectionDraft = {
  companyId: string;
  bankName: string;
  provider: string;
  mode: BankFeedFoundationMode;
  status: BankFeedConnectionStatus;
  consentProviderReference: string | null;
  /** Masked only — never full account secrets. */
  maskedAccountIdentity: string | null;
  currency: string | null;
  sourceType: BankFeedSourceType;
  lastAttemptedIntakeAt: string | null;
  lastSuccessfulIntakeAt: string | null;
  statusReason: string | null;
  /** Encrypted token blob id/reference only — never plaintext token. */
  serverTokenReference: string | null;
};

export function maskBankAccountIdentity(input: {
  accountNumber?: string | null;
  accountCode?: string | null;
  name?: string | null;
}): string {
  const raw = (input.accountNumber ?? input.accountCode ?? '').replace(/\s+/g, '');
  if (raw.length >= 4) {
    return `••••${raw.slice(-4)}`;
  }
  if (input.name && input.name.trim()) {
    return `${input.name.trim().slice(0, 24)} (masked)`;
  }
  return '••••';
}

export function buildBankFeedConnection(input: {
  companyId: string;
  bankName: string;
  capability: BankFeedCapabilityAudit;
  accountNumber?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  currency?: string | null;
  consentProviderReference?: string | null;
  serverTokenReference?: string | null;
  lastAttemptedIntakeAt?: string | null;
  lastSuccessfulIntakeAt?: string | null;
}): BankFeedConnectionDraft {
  const operating = resolveFoundationOperatingMode(input.capability);
  let status: BankFeedConnectionStatus = 'NOT_CONFIGURED';
  let sourceType: BankFeedSourceType = 'none';
  let statusReason: string | null = input.capability.reason;

  if (operating === 'PROVIDER_FEED' && input.serverTokenReference) {
    status = 'CONNECTED_READ_ONLY';
    sourceType = 'provider_consent_token';
    statusReason = 'Read-only provider feed connected via consent token.';
  } else if (operating === 'PROVIDER_FEED' && !input.serverTokenReference) {
    status = 'AWAITING_CONSENT';
    sourceType = 'provider_consent_token';
    statusReason = 'Provider feed available; consent not completed.';
  } else if (operating === 'CONTROLLED_STATEMENT_IMPORT') {
    status = 'STATEMENT_IMPORT_ONLY';
    sourceType = 'controlled_statement_import';
    statusReason = input.capability.reason;
  } else {
    status = 'NOT_CONFIGURED';
    sourceType = 'none';
  }

  // Never claim CONNECTED from config presence alone without token/consent.
  if (status === 'CONNECTED_READ_ONLY' && !input.serverTokenReference) {
    status = 'AWAITING_CONSENT';
  }

  return {
    companyId: input.companyId,
    bankName: input.bankName,
    provider: operating === 'PROVIDER_FEED' ? 'supported_provider' : 'manual_statement',
    mode: operating,
    status,
    consentProviderReference: input.consentProviderReference ?? null,
    maskedAccountIdentity: maskBankAccountIdentity({
      accountNumber: input.accountNumber,
      accountCode: input.accountCode,
      name: input.accountName,
    }),
    currency: input.currency ?? 'ZAR',
    sourceType,
    lastAttemptedIntakeAt: input.lastAttemptedIntakeAt ?? null,
    lastSuccessfulIntakeAt: input.lastSuccessfulIntakeAt ?? null,
    statusReason,
    serverTokenReference: input.serverTokenReference ?? null,
  };
}

export function assertNoForbiddenBankCredentials(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoForbiddenBankCredentials(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    for (const forbidden of BANK_FEED_FORBIDDEN_CREDENTIAL_FIELDS) {
      if (lower === forbidden.toLowerCase() || lower.includes(forbidden.toLowerCase())) {
        if (obj[key] != null && String(obj[key]).length > 0) {
          throw new Error(`Forbidden bank credential field rejected at ${path}.${key}`);
        }
      }
    }
    if (obj[key] && typeof obj[key] === 'object') {
      assertNoForbiddenBankCredentials(obj[key], `${path}.${key}`);
    }
  }
}

/** API responses must never include plaintext tokens. */
export function redactBankFeedSecretsForApi<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row };
  delete copy.serverTokenReference;
  delete copy.credentialsEncrypted;
  delete copy.accessToken;
  delete copy.refreshToken;
  delete copy.token;
  delete copy.password;
  delete copy.pin;
  delete copy.otp;
  delete copy.cvv;
  return copy;
}

export type StatementIntakePreviewResult = {
  ok: boolean;
  stage: 'upload' | 'validate' | 'preview' | 'confirm_pending' | 'rejected';
  filename: string;
  fileHashSha256: string | null;
  mimeType: string;
  formatSupported: boolean;
  rowCount: number | null;
  originalFilePreserved: true;
  autoMatchingPerformed: false;
  reconciliationMutated: false;
  jpePosted: false;
  xeroWrites: 0;
  paymentInitiated: false;
  balanceFabricated: false;
  warnings: string[];
  error: string | null;
};

export function validateStatementIntakeUpload(input: {
  filename: string;
  mimeType: string;
  contentBytes: number;
  fileHashSha256: string | null;
  malformed?: boolean;
  maxBytes?: number;
}): StatementIntakePreviewResult {
  const filename = sanitizeBankStatementFilename(input.filename);
  const supported = isSupportedBankStatementMime(input.mimeType, filename);
  const max = input.maxBytes ?? 5 * 1024 * 1024;
  const warnings: string[] = [];

  if (!supported) {
    return {
      ok: false,
      stage: 'rejected',
      filename,
      fileHashSha256: input.fileHashSha256,
      mimeType: input.mimeType,
      formatSupported: false,
      rowCount: null,
      originalFilePreserved: true,
      autoMatchingPerformed: false,
      reconciliationMutated: false,
      jpePosted: false,
      xeroWrites: 0,
      paymentInitiated: false,
      balanceFabricated: false,
      warnings: ['UNSUPPORTED_FORMAT'],
      error: 'Unsupported statement format. CSV is the controlled import foundation.',
    };
  }
  if (input.contentBytes <= 0 || input.contentBytes > max) {
    return {
      ok: false,
      stage: 'rejected',
      filename,
      fileHashSha256: input.fileHashSha256,
      mimeType: input.mimeType,
      formatSupported: true,
      rowCount: null,
      originalFilePreserved: true,
      autoMatchingPerformed: false,
      reconciliationMutated: false,
      jpePosted: false,
      xeroWrites: 0,
      paymentInitiated: false,
      balanceFabricated: false,
      warnings: ['FILE_SIZE_INVALID'],
      error: 'Statement file size is invalid.',
    };
  }
  if (input.malformed) {
    return {
      ok: false,
      stage: 'rejected',
      filename,
      fileHashSha256: input.fileHashSha256,
      mimeType: input.mimeType,
      formatSupported: true,
      rowCount: null,
      originalFilePreserved: true,
      autoMatchingPerformed: false,
      reconciliationMutated: false,
      jpePosted: false,
      xeroWrites: 0,
      paymentInitiated: false,
      balanceFabricated: false,
      warnings: ['MALFORMED_FILE'],
      error: 'Malformed statement rejected — preview/confirm not allowed.',
    };
  }
  if (!input.fileHashSha256) {
    warnings.push('HASH_PENDING');
  }

  return {
    ok: true,
    stage: 'preview',
    filename,
    fileHashSha256: input.fileHashSha256,
    mimeType: input.mimeType,
    formatSupported: true,
    rowCount: null,
    originalFilePreserved: true,
    autoMatchingPerformed: false,
    reconciliationMutated: false,
    jpePosted: false,
    xeroWrites: 0,
    paymentInitiated: false,
    balanceFabricated: false,
    warnings,
    error: null,
  };
}

export function assertXlsxStatementIntakeUnavailable(): {
  xlsxImportAvailable: false;
  mode: 'CONTROLLED_STATEMENT_IMPORT';
  fallback: 'CSV_ONLY';
} {
  return {
    xlsxImportAvailable: false,
    mode: 'CONTROLLED_STATEMENT_IMPORT',
    fallback: 'CSV_ONLY',
  };
}

export type BankFeedIntakeSafetyGates = {
  autoMatching: false;
  reconciliationStatusMutation: false;
  jpePosting: false;
  xeroWrites: 0;
  paymentInitiation: false;
  fabricatedBalance: false;
  rows109to116Started: false;
  row117OcrStarted: false;
};

export function assertBankFeedIntakeSafety(input?: {
  autoMatching?: boolean;
  reconciliationMutated?: boolean;
  jpePosted?: boolean;
  xeroWrites?: number;
  paymentInitiated?: boolean;
  balanceFabricated?: boolean;
  rows109to116Started?: boolean;
  row117OcrStarted?: boolean;
}): BankFeedIntakeSafetyGates {
  if (input?.autoMatching) throw new Error('Row 108 must not auto-match transactions');
  if (input?.reconciliationMutated) throw new Error('Row 108 must not mutate reconciliation');
  if (input?.jpePosted) throw new Error('Row 108 must not post JPE');
  if ((input?.xeroWrites ?? 0) !== 0) throw new Error('Row 108 requires Xero writes = 0');
  if (input?.paymentInitiated) throw new Error('Row 108 forbids payment initiation');
  if (input?.balanceFabricated) throw new Error('Row 108 forbids fabricated balances');
  if (input?.rows109to116Started) throw new Error('Rows 109–116 must not start during Row 108');
  if (input?.row117OcrStarted) throw new Error('Row 117 OCR must not start during Row 108');
  return {
    autoMatching: false,
    reconciliationStatusMutation: false,
    jpePosting: false,
    xeroWrites: 0,
    paymentInitiation: false,
    fabricatedBalance: false,
    rows109to116Started: false,
    row117OcrStarted: false,
  };
}

export function canManageBankFeedFoundation(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write') || perms.includes('integrations:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function canViewBankFeedFoundation(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (
    perms.includes('*') ||
    perms.includes('finance:read') ||
    perms.includes('finance:write') ||
    perms.includes('integrations:read')
  ) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertNoBankFeedClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoBankFeedClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'bankFeedInternal',
    'serverTokenReference',
    'credentialsEncrypted',
    'accessToken',
    'refreshToken',
    'password',
    'pin',
    'otp',
    'cvv',
    'fullAccountNumber',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Bank feed internal/secret field leaked at ${path}.${key}`);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') assertNoBankFeedClientLeak(v, `${path}.${k}`);
  }
}

export function assertRow109PlusNotStartedDuringRow108(started: boolean): void {
  if (started) throw new Error('Rows 109–116 must not start during Row 108');
}

export function assertRow108SafetyGates(input: {
  row92AutomationEnabled: boolean;
  rows109to116Started?: boolean;
  row117OcrStarted?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
  moneyMovement?: number;
}): {
  row92Off: true;
  rows109to116NotStarted: true;
  row117OcrNotStarted: true;
  row118NotClosed: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
  moneyMovement: 0;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow109PlusNotStartedDuringRow108(input.rows109to116Started === true);
  if (input.row117OcrStarted === true) throw new Error('Row 117 OCR must not start during Row 108');
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 108 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 108 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 108 requires production writes = 0');
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 108 requires money movement = 0');
  return {
    row92Off: true,
    rows109to116NotStarted: true,
    row117OcrNotStarted: true,
    row118NotClosed: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
    moneyMovement: 0,
  };
}

export function assertRoyalCapeUnchangedForRow108(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== BANK_FEED_FOUNDATION_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== BANK_FEED_FOUNDATION_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function bankFeedIdempotencyKey(parts: string[]): string {
  return parts.join(':');
}

/** Connection card projection for UI — never "Connected" from config alone. */
export function projectBankConnectionCard(connection: BankFeedConnectionDraft): {
  title: string;
  mode: BankFeedFoundationMode;
  status: BankFeedConnectionStatus;
  maskedAccount: string | null;
  lastSuccessfulIntakeAt: string | null;
  lastAttemptedIntakeAt: string | null;
  primaryAction: 'CONNECT_PROVIDER' | 'IMPORT_STATEMENT' | 'DISCONNECT' | 'NONE';
  connectedClaim: boolean;
} {
  const connectedClaim = connection.status === 'CONNECTED_READ_ONLY';
  let primaryAction: 'CONNECT_PROVIDER' | 'IMPORT_STATEMENT' | 'DISCONNECT' | 'NONE' = 'NONE';
  if (connection.mode === 'PROVIDER_FEED' && connection.status === 'AWAITING_CONSENT') {
    primaryAction = 'CONNECT_PROVIDER';
  } else if (
    connection.mode === 'CONTROLLED_STATEMENT_IMPORT' ||
    connection.status === 'STATEMENT_IMPORT_ONLY' ||
    connection.mode === 'PROVIDER_UNAVAILABLE'
  ) {
    primaryAction = 'IMPORT_STATEMENT';
  } else if (connection.status === 'CONNECTED_READ_ONLY') {
    primaryAction = 'DISCONNECT';
  }

  return {
    title: 'Bank Connection',
    mode: connection.mode,
    status: connection.status,
    maskedAccount: connection.maskedAccountIdentity,
    lastSuccessfulIntakeAt: connection.lastSuccessfulIntakeAt,
    lastAttemptedIntakeAt: connection.lastAttemptedIntakeAt,
    primaryAction,
    connectedClaim,
  };
}
