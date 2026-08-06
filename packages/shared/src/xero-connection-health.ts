/**
 * Xero connection health and OAuth scope truth (XERO-002 P0).
 *
 * Uses official granular Accounting API scopes. Attachment metadata reads require
 * `accounting.attachments.read` (or full `accounting.attachments`) — not the Files API.
 */

/** Scopes TITAN requests on OAuth connect (space-separated in authorize URL). */
export const XERO_REQUESTED_SCOPES: readonly string[] = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'accounting.settings',
  'accounting.contacts',
  'accounting.invoices',
  'accounting.payments',
  'accounting.banktransactions',
  'accounting.attachments.read',
] as const;

/** Required for core finance import — missing any blocks full sync. */
export const XERO_REQUIRED_SCOPES: readonly string[] = [
  'accounting.settings',
  'accounting.contacts',
  'accounting.invoices',
  'accounting.payments',
  'accounting.banktransactions',
] as const;

/** Optional stages — failure degrades capability but not core ledger import. */
export const XERO_OPTIONAL_SCOPES: readonly string[] = ['accounting.attachments.read'] as const;

export type XeroConnectionHealthState =
  | 'not_connected'
  | 'connected'
  | 'connected_limited'
  | 'token_refresh_required'
  | 'reconnect_required'
  | 'provider_temporarily_unavailable'
  | 'attention_required';

export type XeroScopeCapabilityImpact = {
  scope: string;
  label: string;
  impact: string;
};

export const XERO_SCOPE_CAPABILITY_IMPACTS: Record<string, XeroScopeCapabilityImpact> = {
  'accounting.settings': {
    scope: 'accounting.settings',
    label: 'Chart of accounts',
    impact: 'Cannot import accounts or tracking categories',
  },
  'accounting.contacts': {
    scope: 'accounting.contacts',
    label: 'Contacts',
    impact: 'Cannot import or push customer contacts',
  },
  'accounting.invoices': {
    scope: 'accounting.invoices',
    label: 'Invoices & quotes',
    impact: 'Cannot import or push invoices and quotes',
  },
  'accounting.payments': {
    scope: 'accounting.payments',
    label: 'Payments',
    impact: 'Cannot import or record payments',
  },
  'accounting.banktransactions': {
    scope: 'accounting.banktransactions',
    label: 'Bank transactions',
    impact: 'Cannot import bank feed transactions',
  },
  'accounting.attachments.read': {
    scope: 'accounting.attachments.read',
    label: 'Attachment metadata (read)',
    impact: 'Cannot list invoice/quote attachment metadata — Owner reconnect may be required',
  },
};

export type XeroScopeAnalysis = {
  grantedScopes: string[];
  requestedScopes: string[];
  requiredScopes: string[];
  optionalScopes: string[];
  missingScopes: string[];
  missingRequiredScopes: string[];
  missingOptionalScopes: string[];
  declinedScopes: string[];
  capabilityImpacts: XeroScopeCapabilityImpact[];
  attachmentsReadGranted: boolean;
};

export type XeroConnectionHealthSummary = {
  healthState: XeroConnectionHealthState;
  healthLabel: string;
  organisationName: string | null;
  tenantId: string | null;
  connectedAt: string | null;
  lastSuccessfulTokenRefreshAt: string | null;
  tokenExpiresAt: string | null;
  lastConnectionCheckAt: string | null;
  scopeAnalysis: XeroScopeAnalysis;
  reconnectRequired: boolean;
  reconnectReason: string | null;
  mostRecentSanitizedProviderError: string | null;
};

export type XeroAttachmentRootCause =
  | 'missing_oauth_scope'
  | 'stale_token_missing_scope'
  | 'wrong_tenant_identifier'
  | 'wrong_endpoint'
  | 'unsupported_entity'
  | 'api_client_bug'
  | 'pagination_omission'
  | 'provider_has_no_attachments'
  | 'storage_failure'
  | 'permissions_provider_block'
  | 'unresolved';

export function parseScopeString(scope: string | null | undefined): string[] {
  if (!scope?.trim()) return [];
  return [...new Set(scope.trim().split(/\s+/).filter(Boolean))].sort();
}

export function analyzeXeroScopes(input: {
  grantedScopes?: string[] | null;
  requestedScopes?: readonly string[];
}): XeroScopeAnalysis {
  const requestedScopes = [...(input.requestedScopes ?? XERO_REQUESTED_SCOPES)];
  const grantedScopes = [...new Set(input.grantedScopes ?? [])].sort();
  const grantedSet = new Set(grantedScopes);

  const missingScopes = requestedScopes.filter((s) => !grantedSet.has(s));
  const missingRequiredScopes = XERO_REQUIRED_SCOPES.filter((s) => !grantedSet.has(s));
  const missingOptionalScopes = XERO_OPTIONAL_SCOPES.filter((s) => !grantedSet.has(s));
  const declinedScopes = missingScopes;

  const capabilityImpacts = missingRequiredScopes
    .concat(missingOptionalScopes)
    .map((scope) => XERO_SCOPE_CAPABILITY_IMPACTS[scope])
    .filter((item): item is XeroScopeCapabilityImpact => Boolean(item));

  return {
    grantedScopes,
    requestedScopes,
    requiredScopes: [...XERO_REQUIRED_SCOPES],
    optionalScopes: [...XERO_OPTIONAL_SCOPES],
    missingScopes,
    missingRequiredScopes,
    missingOptionalScopes,
    declinedScopes,
    capabilityImpacts,
    attachmentsReadGranted:
      grantedSet.has('accounting.attachments.read') || grantedSet.has('accounting.attachments'),
  };
}

export function deriveXeroConnectionHealthState(input: {
  hasCredentials: boolean;
  connectionStatus: string;
  reconnectRequired: boolean;
  tokenExpiresAt: string | null;
  scopeAnalysis: XeroScopeAnalysis;
  lastError: string | null;
  nowMs?: number;
}): XeroConnectionHealthState {
  if (!input.hasCredentials || input.connectionStatus === 'disconnected') {
    return 'not_connected';
  }

  if (input.reconnectRequired || input.connectionStatus === 'error') {
    return 'reconnect_required';
  }

  if (input.lastError && /temporarily unavailable|503|502|504/i.test(input.lastError)) {
    return 'provider_temporarily_unavailable';
  }

  const now = input.nowMs ?? Date.now();
  const expiresMs = input.tokenExpiresAt ? Date.parse(input.tokenExpiresAt) : NaN;
  if (Number.isFinite(expiresMs) && expiresMs <= now) {
    return 'token_refresh_required';
  }

  if (input.scopeAnalysis.missingRequiredScopes.length > 0) {
    return 'reconnect_required';
  }

  if (input.scopeAnalysis.missingOptionalScopes.length > 0) {
    return 'connected_limited';
  }

  if (input.lastError) {
    return 'attention_required';
  }

  if (input.connectionStatus === 'connected') {
    return 'connected';
  }

  return 'attention_required';
}

export const XERO_CONNECTION_HEALTH_LABELS: Record<XeroConnectionHealthState, string> = {
  not_connected: 'Not connected',
  connected: 'Connected',
  connected_limited: 'Connected with limited permissions',
  token_refresh_required: 'Token refresh required',
  reconnect_required: 'Reconnect required',
  provider_temporarily_unavailable: 'Provider temporarily unavailable',
  attention_required: 'Attention required',
};

export function buildXeroConnectionHealthSummary(input: {
  organisationName: string | null;
  tenantId: string | null;
  connectedAt: string | null;
  lastSuccessfulTokenRefreshAt: string | null;
  tokenExpiresAt: string | null;
  lastConnectionCheckAt: string | null;
  hasCredentials: boolean;
  connectionStatus: string;
  reconnectRequired: boolean;
  grantedScopes: string[] | null;
  lastError: string | null;
}): XeroConnectionHealthSummary {
  const scopeAnalysis = analyzeXeroScopes({ grantedScopes: input.grantedScopes });
  const healthState = deriveXeroConnectionHealthState({
    hasCredentials: input.hasCredentials,
    connectionStatus: input.connectionStatus,
    reconnectRequired: input.reconnectRequired,
    tokenExpiresAt: input.tokenExpiresAt,
    scopeAnalysis,
    lastError: input.lastError,
  });

  let reconnectReason: string | null = null;
  if (healthState === 'reconnect_required') {
    if (input.reconnectRequired) {
      reconnectReason = input.lastError ?? 'Reconnect with Xero to restore access.';
    } else if (scopeAnalysis.missingRequiredScopes.length > 0) {
      reconnectReason = `Missing required scopes: ${scopeAnalysis.missingRequiredScopes.join(', ')}`;
    } else if (!scopeAnalysis.attachmentsReadGranted) {
      reconnectReason =
        'Attachment read scope not granted on current token. Owner must reconnect to grant accounting.attachments.read.';
    }
  } else if (healthState === 'connected_limited' && !scopeAnalysis.attachmentsReadGranted) {
    reconnectReason =
      'Attachment import requires accounting.attachments.read. Reconnect with Xero to grant this scope.';
  }

  return {
    healthState,
    healthLabel: XERO_CONNECTION_HEALTH_LABELS[healthState],
    organisationName: input.organisationName,
    tenantId: input.tenantId,
    connectedAt: input.connectedAt,
    lastSuccessfulTokenRefreshAt: input.lastSuccessfulTokenRefreshAt,
    tokenExpiresAt: input.tokenExpiresAt,
    lastConnectionCheckAt: input.lastConnectionCheckAt,
    scopeAnalysis,
    reconnectRequired:
      healthState === 'reconnect_required' || healthState === 'connected_limited',
    reconnectReason,
    mostRecentSanitizedProviderError: input.lastError,
  };
}

/** Classify attachment zero-count root cause from sync evidence — never guess "no attachments". */
export function classifyXeroAttachmentRootCause(input: {
  attachmentCount: number;
  scopeAnalysis: XeroScopeAnalysis;
  stageErrorCode: string | null;
  stageError: string | null;
  tenantIdPresent: boolean;
}): XeroAttachmentRootCause {
  if (input.attachmentCount > 0) {
    return 'unresolved';
  }

  if (!input.tenantIdPresent) {
    return 'wrong_tenant_identifier';
  }

  const errorText = `${input.stageError ?? ''} ${input.stageErrorCode ?? ''}`.toLowerCase();

  if (
    !input.scopeAnalysis.attachmentsReadGranted ||
    input.stageErrorCode === 'AUTH_FAILED' ||
    /insufficient_scope|granted scopes|scope/i.test(errorText)
  ) {
    return input.scopeAnalysis.grantedScopes.length === 0
      ? 'missing_oauth_scope'
      : 'stale_token_missing_scope';
  }

  if (/rejected|403|401|permission|provider/i.test(errorText)) {
    return 'permissions_provider_block';
  }

  if (/endpoint|404|not found/i.test(errorText)) {
    return 'wrong_endpoint';
  }

  if (/storage|persist|save/i.test(errorText)) {
    return 'storage_failure';
  }

  if (/pagination|page/i.test(errorText)) {
    return 'pagination_omission';
  }

  return 'unresolved';
}

export function redactXeroSecrets(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/refresh_token[=:]\S+/gi, 'refresh_token=[REDACTED]')
    .replace(/access_token[=:]\S+/gi, 'access_token=[REDACTED]');
}
