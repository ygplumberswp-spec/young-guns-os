/**
 * Row 116 — Production bank-connect hard gate
 *
 * Production bank connection remains BLOCKED unless ALL legitimate evidence
 * is complete. UI/config flags alone cannot bypass.
 *
 * Current Row108 truth: no FNB/open-banking client → PROVIDER_UNAVAILABLE / BLOCKED.
 * Do NOT connect FNB. Do NOT request credentials. Do NOT move money.
 */

import {
  assertNoForbiddenBankCredentials,
  resolveBankFeedCapability,
  type BankFeedCapabilityAudit,
  type BankFeedFoundationMode,
} from './bank-feed-foundation.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const BANK_PRODUCTION_CONNECT_GATE_KEY = 'bank-production-connect-gate' as const;

export type ProductionBankConnectGateStatus =
  | 'BLOCKED'
  | 'PROVIDER_UNAVAILABLE'
  | 'EVIDENCE_INCOMPLETE'
  | 'ALLOWED';

export type ProductionBankConnectEvidence = {
  supportedProviderCapability: boolean;
  requiredConsentAuthMethod: boolean;
  securityReviewComplete: boolean;
  secretHandlingComplete: boolean;
  tenantIsolationProven: boolean;
  rbacProven: boolean;
  stagingProofComplete: boolean;
  noProhibitedCredentialStorage: boolean;
  ownerExplicitProductionApproval: boolean;
  /** UI/config alone must never unlock production connect. */
  uiConfigFlagAlone?: boolean;
  environment: 'staging' | 'production' | 'development' | string;
};

export type ProductionBankConnectGateResult = {
  status: ProductionBankConnectGateStatus;
  allowed: false | true;
  mode: BankFeedFoundationMode;
  missingEvidence: string[];
  capability: BankFeedCapabilityAudit;
  bypassAttempted: boolean;
  moneyMovement: 0;
  connectsFnb: false;
  requestsCredentials: false;
};

const EVIDENCE_KEYS: Array<keyof Omit<ProductionBankConnectEvidence, 'uiConfigFlagAlone' | 'environment'>> = [
  'supportedProviderCapability',
  'requiredConsentAuthMethod',
  'securityReviewComplete',
  'secretHandlingComplete',
  'tenantIsolationProven',
  'rbacProven',
  'stagingProofComplete',
  'noProhibitedCredentialStorage',
  'ownerExplicitProductionApproval',
];

export function evaluateProductionBankConnectGate(input: {
  evidence: ProductionBankConnectEvidence;
  /** Future: only true when a real consent client exists in code. */
  legitimateProviderFeedConfigured?: boolean;
  providerIdsPresent?: string[];
  credentialPayload?: unknown;
}): ProductionBankConnectGateResult {
  if (input.credentialPayload != null) {
    assertNoForbiddenBankCredentials(input.credentialPayload);
  }

  const capability = resolveBankFeedCapability({
    legitimateProviderFeedConfigured: input.legitimateProviderFeedConfigured === true,
    providerIdsPresent: input.providerIdsPresent,
  });

  const missing: string[] = [];
  for (const key of EVIDENCE_KEYS) {
    if (input.evidence[key] !== true) missing.push(key);
  }

  // Capability truth: without live provider feed, remain unavailable
  if (!capability.liveProviderFeedAvailable) {
    missing.push('liveProviderFeedAvailable');
  }

  const bypassAttempted = input.evidence.uiConfigFlagAlone === true;

  // Hard rule: UI/config flag alone can never allow
  if (bypassAttempted && missing.length > 0) {
    return {
      status: capability.liveProviderFeedAvailable ? 'EVIDENCE_INCOMPLETE' : 'PROVIDER_UNAVAILABLE',
      allowed: false,
      mode: capability.mode,
      missingEvidence: [...new Set(missing)],
      capability,
      bypassAttempted: true,
      moneyMovement: 0,
      connectsFnb: false,
      requestsCredentials: false,
    };
  }

  if (!capability.liveProviderFeedAvailable) {
    return {
      status: 'PROVIDER_UNAVAILABLE',
      allowed: false,
      mode: 'PROVIDER_UNAVAILABLE',
      missingEvidence: [...new Set(missing)],
      capability,
      bypassAttempted,
      moneyMovement: 0,
      connectsFnb: false,
      requestsCredentials: false,
    };
  }

  if (missing.length > 0) {
    return {
      status: input.evidence.environment === 'production' ? 'BLOCKED' : 'EVIDENCE_INCOMPLETE',
      allowed: false,
      mode: capability.mode,
      missingEvidence: missing,
      capability,
      bypassAttempted,
      moneyMovement: 0,
      connectsFnb: false,
      requestsCredentials: false,
    };
  }

  // All evidence + live capability — still only ALLOWED in production when owner approved
  // (already required above). Staging may report ALLOWED for dry-run readiness checks.
  if (input.evidence.environment === 'production' || input.evidence.environment === 'staging') {
    return {
      status: 'ALLOWED',
      allowed: true,
      mode: 'PROVIDER_FEED',
      missingEvidence: [],
      capability,
      bypassAttempted,
      moneyMovement: 0,
      connectsFnb: false,
      requestsCredentials: false,
    };
  }

  return {
    status: 'BLOCKED',
    allowed: false,
    mode: capability.mode,
    missingEvidence: ['environment'],
    capability,
    bypassAttempted,
    moneyMovement: 0,
    connectsFnb: false,
    requestsCredentials: false,
  };
}

/** Current Young Guns / TITAN default — no FNB client. */
export function currentProductionBankGateDefault(environment: string = 'staging'): ProductionBankConnectGateResult {
  return evaluateProductionBankConnectGate({
    evidence: {
      supportedProviderCapability: false,
      requiredConsentAuthMethod: false,
      securityReviewComplete: false,
      secretHandlingComplete: false,
      tenantIsolationProven: false,
      rbacProven: false,
      stagingProofComplete: false,
      noProhibitedCredentialStorage: true,
      ownerExplicitProductionApproval: false,
      uiConfigFlagAlone: false,
      environment,
    },
    legitimateProviderFeedConfigured: false,
    providerIdsPresent: ['xero', 'yoco'],
  });
}

export function assertProductionBankConnectBlocked(result: ProductionBankConnectGateResult): void {
  if (result.allowed === true && result.status === 'ALLOWED') return;
  throw new Error(`Production bank connect blocked: ${result.status}`);
}

export function canManageProductionBankConnectGate(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role.includes('tech') || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write') || perms.includes('integrations:write')) {
    return role === 'owner' || role === 'company owner' || role === 'admin' || perms.includes('*');
  }
  return role === 'owner' || role === 'company owner' || role === 'admin';
}

export function assertRow116SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row117OcrStarted?: boolean;
  row118Closed?: boolean;
  xeroWrites?: number;
  moneyMovement?: number;
  fnbConnected?: boolean;
}): { row92Off: true; row117NotStarted: true; row118NotClosed: true; xeroWrites: 0; moneyMovement: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.row117OcrStarted === true) throw new Error('Row 117 OCR must not start during Row 116');
  if (input.row118Closed === true) throw new Error('Row 118 must remain OPEN');
  if (input.fnbConnected === true) throw new Error('Must not connect FNB during Row 116');
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 116 requires Xero writes = 0');
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 116 requires money movement = 0');
  return {
    row92Off: true,
    row117NotStarted: true,
    row118NotClosed: true,
    xeroWrites: 0,
    moneyMovement: 0,
  };
}
