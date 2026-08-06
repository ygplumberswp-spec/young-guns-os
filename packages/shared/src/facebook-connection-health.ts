import type { FacebookPermission, FacebookVerificationOutcome } from './facebook-business.js';
import { FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE } from './facebook-page-discovery-session.js';

/** Permissions required for full Page read / feature health after Page selection. */
export const FACEBOOK_PAGE_READ_FEATURE_PERMISSION: FacebookPermission = 'pages_read_engagement';

/** Permissions that must be present for basic Page discovery and selection. */
export const FACEBOOK_BASIC_DISCOVERY_PERMISSIONS: FacebookPermission[] = [
  'pages_show_list',
  'business_management',
];

/**
 * Tier 4 — Page read access (J-6.7F6). Requested only via explicit
 * "Grant Page read access" re-authorisation after Page selection.
 */
export const FACEBOOK_OAUTH_PAGE_READ_SCOPES: FacebookPermission[] = [
  'pages_show_list',
  'business_management',
  'pages_read_engagement',
];

export const FACEBOOK_PAGE_READ_OAUTH_EXPLANATION =
  'TITAN needs Page read access to verify your Page and read Page content needed for connection health. This does not allow TITAN to publish posts, reply to messages, manage advertising or make payments.';

export const FACEBOOK_RECONNECT_WIZARD_OAUTH_EXPLANATION =
  'TITAN will open Meta so you can choose the Business and Facebook Page you want to connect. Your current connection remains unchanged until the new Page is verified successfully.';

/** Reconnect wizard OAuth scopes (Meta Login also grants public_profile implicitly). */
export const FACEBOOK_OAUTH_RECONNECT_WIZARD_SCOPES = [
  'pages_show_list',
  'business_management',
  'public_profile',
] as const;

export const FACEBOOK_OAUTH_TIER_PAGE_READ_PREFIX = '__titan_oauth_tier=page_read__';
export const FACEBOOK_OAUTH_TIER_RECONNECT_WIZARD_PREFIX = '__titan_oauth_tier=reconnect_wizard__';
export const FACEBOOK_OAUTH_TIER_CONTENT_FEATURES_PREFIX = '__titan_oauth_tier=content_features__';

/**
 * Tier 5 — Facebook content features (J-6.7F13). Requested only via explicit
 * "Enable Facebook content features" after Page selection and read verification.
 */
export const FACEBOOK_OAUTH_CONTENT_FEATURE_SCOPES: FacebookPermission[] = [
  'pages_show_list',
  'business_management',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_posts',
  'pages_manage_engagement',
  'pages_manage_metadata',
  'read_insights',
];

/** Content scopes beyond basic discovery/read — used to decide when upgrade OAuth is offered. */
export const FACEBOOK_CONTENT_UPGRADE_PERMISSIONS: FacebookPermission[] = [
  'pages_read_user_content',
  'pages_manage_posts',
  'pages_manage_engagement',
  'pages_manage_metadata',
  'read_insights',
];

export const FACEBOOK_CONTENT_FEATURES_OAUTH_EXPLANATION =
  'TITAN will open Meta so you can grant publishing, comment moderation, webhook and insights permissions for your connected Page. Your stored Page remains connected if you decline any permission. Messenger and Lead Ads are not requested in this step.';

export const FACEBOOK_PARTIAL_STATE_LABEL_ACCOUNT_SELECTION = 'Account selection required';
export const FACEBOOK_PARTIAL_STATE_LABEL_VERIFICATION = 'Verification required';

/** @deprecated Use buildFacebookConnectedLimitedDetail for tenant-specific Page names. */
export const FACEBOOK_CONNECTED_LIMITED_DETAIL =
  'Young Guns Plumbing – Cape Town is connected. Additional Meta permission is required before TITAN can read Page details, comments, leads or performance data.';

export function buildFacebookConnectedLimitedDetail(pageName: string | null | undefined): string {
  const label = pageName?.trim() || 'Your Page';
  return `${label} is connected. Additional Meta permission is required before TITAN can read Page details, comments, leads or performance data.`;
}

export const FACEBOOK_SYNC_INACTIVE_UNTIL_READ_PERMISSION =
  'Sync inactive until required Meta permissions are granted.';

export type FacebookTokenExpiryStatus =
  | 'valid'
  | 'expired'
  | 'expires_at_unavailable'
  | 'expiry_not_supplied';

export type FacebookTokenExpiryDiagnosis = {
  status: FacebookTokenExpiryStatus;
  /** True only when Meta debug_token confirms validity. */
  tokenValid: boolean | null;
  /** True only when Meta supplied an expiry and it is in the past. */
  tokenExpired: boolean | null;
  expiresAtUnix: number | null;
};

/**
 * Meta returns expires_at = 0 for non-expiring tokens. Treating 0 as expired
 * produced contradictory tokenValid=true + tokenExpired=true diagnoses.
 */
export function resolveFacebookTokenExpiryDiagnosis(input: {
  tokenValid: boolean | null;
  expiresAtUnix: number | null;
  nowUnix?: number;
}): FacebookTokenExpiryDiagnosis {
  const now = input.nowUnix ?? Math.floor(Date.now() / 1000);

  if (input.expiresAtUnix === null || input.expiresAtUnix === undefined) {
    return {
      status: 'expiry_not_supplied',
      tokenValid: input.tokenValid,
      tokenExpired: null,
      expiresAtUnix: null,
    };
  }

  if (input.expiresAtUnix <= 0) {
    return {
      status: 'expires_at_unavailable',
      tokenValid: input.tokenValid,
      tokenExpired: null,
      expiresAtUnix: input.expiresAtUnix,
    };
  }

  const expired = input.expiresAtUnix <= now;
  return {
    status: expired ? 'expired' : 'valid',
    tokenValid: input.tokenValid,
    tokenExpired: expired,
    expiresAtUnix: input.expiresAtUnix,
  };
}

export function hasFacebookPageReadEngagement(
  grantedPermissions: readonly string[],
): boolean {
  return grantedPermissions.includes(FACEBOOK_PAGE_READ_FEATURE_PERMISSION);
}

export function hasFacebookBasicDiscoveryPermissions(
  grantedPermissions: readonly string[],
): boolean {
  return FACEBOOK_BASIC_DISCOVERY_PERMISSIONS.every((scope) =>
    grantedPermissions.includes(scope),
  );
}

export type FacebookFeatureMetricAvailability = {
  available: boolean;
  displayValue: string;
  reason: string | null;
};

export function resolveFacebookFeatureMetricAvailability(input: {
  grantedPermissions: readonly string[];
  requiredPermission: FacebookPermission;
  numericValue: number | null;
  label: string;
}): FacebookFeatureMetricAvailability {
  if (!input.grantedPermissions.includes(input.requiredPermission)) {
    return {
      available: false,
      displayValue: 'Unavailable — permission required',
      reason: `${input.label} requires ${input.requiredPermission}.`,
    };
  }

  if (input.numericValue === null) {
    return {
      available: false,
      displayValue: 'Unavailable — not synced yet',
      reason: `${input.label} has not been read from Meta yet.`,
    };
  }

  return {
    available: true,
    displayValue: String(input.numericValue),
    reason: null,
  };
}

export function encodeFacebookPageReadOAuthReturnPath(returnPath: string): string {
  const normalised = returnPath.startsWith('/') ? returnPath : '/facebook-business';
  return `${FACEBOOK_OAUTH_TIER_PAGE_READ_PREFIX}${normalised}`;
}

export function encodeFacebookReconnectWizardOAuthReturnPath(returnPath: string): string {
  const normalised = returnPath.startsWith('/') ? returnPath : '/facebook-business';
  return `${FACEBOOK_OAUTH_TIER_RECONNECT_WIZARD_PREFIX}${normalised}`;
}

export function encodeFacebookContentFeaturesOAuthReturnPath(returnPath: string): string {
  const normalised = returnPath.startsWith('/') ? returnPath : '/facebook-business';
  return `${FACEBOOK_OAUTH_TIER_CONTENT_FEATURES_PREFIX}${normalised}`;
}

export type FacebookOAuthTier =
  | 'basic'
  | 'business_portfolio'
  | 'page_read'
  | 'reconnect_wizard'
  | 'content_features';

export function facebookMissingContentUpgradePermissions(
  grantedPermissions: readonly string[],
): FacebookPermission[] {
  const granted = new Set(grantedPermissions);
  return FACEBOOK_CONTENT_UPGRADE_PERMISSIONS.filter((permission) => !granted.has(permission));
}

export function isFacebookStalePendingVerificationFailure(input: {
  message: string | null | undefined;
  pageSelected: boolean;
  grantedPermissions: readonly string[];
}): boolean {
  if (!input.pageSelected || !hasFacebookPageReadEngagement(input.grantedPermissions)) {
    return false;
  }
  const message = input.message?.trim() ?? '';
  return (
    message === FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE ||
    message.includes('Grant Page read access to verify Page details')
  );
}

export function resolveFacebookEffectiveVerification(input: {
  timestamps: FacebookVerificationTimestamps;
  lastVerificationOk: boolean | null;
  lastVerifiedAt: Date | null;
  lastVerificationMessage: string | null;
  lastVerificationAuthError: boolean;
  lastVerificationPermissionError: boolean;
  lastVerificationProviderUnavailable: boolean;
  pageSelected: boolean;
  grantedPermissions: readonly string[];
  failedVerificationMessage?: string | null;
}): FacebookVerificationOutcome | null {
  const successAt = input.timestamps.lastSuccessfulVerificationAt;
  const failedAt = input.timestamps.lastFailedVerificationAt;
  const failedMessage =
    input.failedVerificationMessage ??
    (input.lastVerificationOk === false ? input.lastVerificationMessage : null);

  if (successAt && failedAt) {
    if (new Date(successAt).getTime() >= new Date(failedAt).getTime()) {
      return {
        ok: true,
        authError: false,
        permissionError: false,
        providerUnavailable: false,
        checkedAt: new Date(successAt),
        message: input.lastVerificationMessage ?? 'Facebook responded successfully.',
      };
    }
  } else if (successAt || (input.lastVerificationOk === true && input.lastVerifiedAt)) {
    const checkedAt = new Date(successAt ?? input.lastVerifiedAt!.toISOString());
    return {
      ok: true,
      authError: false,
      permissionError: false,
      providerUnavailable: false,
      checkedAt,
      message: input.lastVerificationMessage ?? 'Facebook responded successfully.',
    };
  }

  if (
    failedAt &&
    isFacebookStalePendingVerificationFailure({
      message: failedMessage,
      pageSelected: input.pageSelected,
      grantedPermissions: input.grantedPermissions,
    })
  ) {
    return null;
  }

  if (failedAt) {
    return {
      ok: false,
      authError: input.lastVerificationAuthError,
      permissionError: input.lastVerificationPermissionError,
      providerUnavailable: input.lastVerificationProviderUnavailable,
      checkedAt: new Date(failedAt),
      message: failedMessage ?? input.lastVerificationMessage ?? 'Facebook verification failed.',
    };
  }

  return null;
}

export function resolveFacebookPartialStateLabel(pageSelected: boolean): string {
  return pageSelected
    ? FACEBOOK_PARTIAL_STATE_LABEL_VERIFICATION
    : FACEBOOK_PARTIAL_STATE_LABEL_ACCOUNT_SELECTION;
}

export function decodeFacebookOAuthTierFromReturnPath(storedReturnPath: string | null | undefined): {
  oauthTier: FacebookOAuthTier;
  returnPath: string;
} {
  const fallback = '/facebook-business';
  if (!storedReturnPath?.trim()) {
    return { oauthTier: 'basic', returnPath: fallback };
  }

  if (storedReturnPath.startsWith('__titan_oauth_tier=business_portfolio__')) {
    const path = storedReturnPath.slice('__titan_oauth_tier=business_portfolio__'.length);
    return {
      oauthTier: 'business_portfolio',
      returnPath: path.startsWith('/') ? path : fallback,
    };
  }

  if (storedReturnPath.startsWith(FACEBOOK_OAUTH_TIER_RECONNECT_WIZARD_PREFIX)) {
    const path = storedReturnPath.slice(FACEBOOK_OAUTH_TIER_RECONNECT_WIZARD_PREFIX.length);
    return {
      oauthTier: 'reconnect_wizard',
      returnPath: path.startsWith('/') ? path : fallback,
    };
  }

  if (storedReturnPath.startsWith(FACEBOOK_OAUTH_TIER_PAGE_READ_PREFIX)) {
    const path = storedReturnPath.slice(FACEBOOK_OAUTH_TIER_PAGE_READ_PREFIX.length);
    return {
      oauthTier: 'page_read',
      returnPath: path.startsWith('/') ? path : fallback,
    };
  }

  if (storedReturnPath.startsWith(FACEBOOK_OAUTH_TIER_CONTENT_FEATURES_PREFIX)) {
    const path = storedReturnPath.slice(FACEBOOK_OAUTH_TIER_CONTENT_FEATURES_PREFIX.length);
    return {
      oauthTier: 'content_features',
      returnPath: path.startsWith('/') ? path : fallback,
    };
  }

  return { oauthTier: 'basic', returnPath: storedReturnPath };
}

export type FacebookVerificationTimestamps = {
  lastConnectionAttemptAt: string | null;
  lastSuccessfulVerificationAt: string | null;
  lastFailedVerificationAt: string | null;
  lastSuccessfulSyncAt: string | null;
};

export type FacebookVerificationMetadata = {
  lastConnectionAttemptAt?: string;
  lastSuccessfulVerificationAt?: string;
  lastFailedVerificationAt?: string;
  lastFailedVerificationMessage?: string;
};

export function buildFacebookVerificationTimestamps(input: {
  metadata: Record<string, unknown> | null | undefined;
  lastVerifiedAt: Date | null;
  lastVerificationOk: boolean | null;
  lastSyncedAt: Date | null;
}): FacebookVerificationTimestamps {
  const meta = (input.metadata?.verification ?? input.metadata) as
    | FacebookVerificationMetadata
    | undefined;

  const lastSuccessfulVerificationAt =
    meta?.lastSuccessfulVerificationAt ??
    (input.lastVerificationOk === true && input.lastVerifiedAt
      ? input.lastVerifiedAt.toISOString()
      : null);

  return {
    lastConnectionAttemptAt: meta?.lastConnectionAttemptAt ?? null,
    lastSuccessfulVerificationAt,
    lastFailedVerificationAt: meta?.lastFailedVerificationAt ?? null,
    lastSuccessfulSyncAt: input.lastSyncedAt?.toISOString() ?? null,
  };
}

export function mergeFacebookVerificationMetadata(input: {
  existing: Record<string, unknown> | null | undefined;
  attemptAt: Date;
  outcome: {
    ok: boolean;
    message: string;
  };
}): Record<string, unknown> {
  const base = { ...(input.existing ?? {}) };
  const prior = (base.verification ?? {}) as FacebookVerificationMetadata;
  const attemptIso = input.attemptAt.toISOString();

  const verification: FacebookVerificationMetadata = {
    ...prior,
    lastConnectionAttemptAt: attemptIso,
  };

  if (input.outcome.ok) {
    verification.lastSuccessfulVerificationAt = attemptIso;
    verification.lastFailedVerificationAt = prior.lastFailedVerificationAt;
    verification.lastFailedVerificationMessage = undefined;
  } else {
    verification.lastFailedVerificationAt = attemptIso;
    verification.lastFailedVerificationMessage = input.outcome.message;
  }

  return { ...base, verification };
}

/** Maps API-only states to values allowed by the existing DB enum (no migration). */
export function persistFacebookConnectionState(
  state:
    | 'configuration_required'
    | 'disconnected'
    | 'connected'
    | 'connected_limited'
    | 'partial'
    | 'missing_permission'
    | 'reauthorisation_required'
    | 'expired'
    | 'provider_unavailable',
):
  | 'configuration_required'
  | 'disconnected'
  | 'connected'
  | 'partial'
  | 'missing_permission'
  | 'reauthorisation_required'
  | 'expired'
  | 'provider_unavailable' {
  if (state === 'connected_limited') return 'connected';
  return state;
}
