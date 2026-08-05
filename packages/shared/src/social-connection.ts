/**
 * Social Connection Foundation (J-6.7F)
 *
 * Secure account connection layer for Facebook Pages, Instagram Business,
 * Google Business Profile, WhatsApp Business and TikTok readiness.
 *
 * Connection, authentication, account discovery/selection, health and
 * disconnect/reconnect only — no publishing, scheduling, analytics or campaigns.
 *
 * Invariants:
 * - Owner-controlled connection management by default
 * - Admin access only where RBAC explicitly permits
 * - Technician and Client denied
 * - Never claim Connected without validated credentials + account selection
 * - Never expose provider secrets or tokens to the browser
 * - No fake provider IDs or demonstration account data
 */

import { canWriteMarketingAgent } from './marketing-agent.js';

/** Company Owner roles that may approve and execute social account connection changes. */
export function isCompanyOwnerRole(roleName: string): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  );
}

/**
 * Canonical connection source of truth per J-6.7F owner-gate audit.
 * Owner-visible status on /integrations reads from these stores only.
 */
export const SOCIAL_CONNECTION_CANONICAL_SOURCES = {
  facebook: {
    table: 'fb_connections',
    oauthStates: 'fb_oauth_states',
    api: '/api/v1/facebook-business',
    ui: '/facebook-business',
    note: 'Facebook Page OAuth, token storage and Page selection. Not social_media_connections.',
  },
  instagram: {
    table: 'social_media_connections',
    platform: 'instagram',
    oauthStates: 'social_oauth_states',
    api: '/api/v1/social-connections',
    ui: '/integrations',
    note: 'Instagram Business via social-connections OAuth only.',
  },
  google_business: {
    table: 'social_media_connections',
    platform: 'google_business',
    oauthStates: 'social_oauth_states',
    api: '/api/v1/social-connections',
    ui: '/integrations',
    note: 'Google Business Profile location selection via social-connections.',
  },
  whatsapp_business: {
    table: 'whatsapp_connections',
    oauthStates: 'social_oauth_states',
    api: '/api/v1/social-connections',
    operationalApi: '/api/v1/whatsapp',
    ui: '/integrations',
    operationalUi: '/integrations/whatsapp',
    note: 'Social foundation bridges whatsapp_connections; operational messaging uses WhatsApp settings.',
  },
  tiktok: {
    table: 'social_media_connections',
    platform: 'tiktok',
    oauthStates: 'social_oauth_states',
    api: '/api/v1/social-connections',
    ui: '/integrations',
    note: 'Readiness only until TikTok provider review completes.',
  },
} as const;

/** J-6.7F social connection providers (distinct from legacy social_media linkedin). */
export type SocialConnectionProvider =
  | 'facebook'
  | 'instagram'
  | 'google_business'
  | 'whatsapp_business'
  | 'tiktok';

export const SOCIAL_CONNECTION_PROVIDERS: SocialConnectionProvider[] = [
  'facebook',
  'instagram',
  'google_business',
  'whatsapp_business',
  'tiktok',
];

/** Owner-facing foundation status — computed server-side, never faked. */
export type SocialConnectionFoundationStatus =
  | 'NOT_CONFIGURED'
  | 'READY_TO_CONNECT'
  | 'CONNECTING'
  | 'ACCOUNT_SELECTION_REQUIRED'
  | 'CONNECTED'
  | 'RECONNECT_REQUIRED'
  | 'ERROR'
  | 'DISCONNECTED'
  | 'PROVIDER_REVIEW_REQUIRED';

export const SOCIAL_CONNECTION_FOUNDATION_STATUSES: SocialConnectionFoundationStatus[] = [
  'NOT_CONFIGURED',
  'READY_TO_CONNECT',
  'CONNECTING',
  'ACCOUNT_SELECTION_REQUIRED',
  'CONNECTED',
  'RECONNECT_REQUIRED',
  'ERROR',
  'DISCONNECTED',
  'PROVIDER_REVIEW_REQUIRED',
];

export type SocialConnectionAccountKind =
  | 'facebook_page'
  | 'instagram_business_account'
  | 'google_business_account'
  | 'google_business_location'
  | 'whatsapp_business_account'
  | 'whatsapp_phone_number'
  | 'tiktok_account';

export type SocialDiscoveredAccount = {
  id: string;
  kind: SocialConnectionAccountKind;
  displayName: string;
  parentAccountId?: string | null;
  metadata?: Record<string, string>;
};

export type SocialAccountSelection = {
  facebookPageId?: string | null;
  instagramBusinessAccountId?: string | null;
  googleBusinessAccountId?: string | null;
  googleBusinessLocationId?: string | null;
  whatsappBusinessAccountId?: string | null;
  whatsappPhoneNumberId?: string | null;
  tiktokAccountId?: string | null;
};

export type SocialConnectionSafeMetadata = {
  grantedScopes?: string[];
  tokenExpiresAt?: string | null;
  providerUserId?: string | null;
  selectedFacebookPageId?: string | null;
  selectedFacebookPageName?: string | null;
  selectedInstagramBusinessAccountId?: string | null;
  selectedInstagramBusinessAccountName?: string | null;
  selectedGoogleBusinessAccountId?: string | null;
  selectedGoogleBusinessLocationId?: string | null;
  selectedGoogleBusinessLocationName?: string | null;
  selectedWhatsappBusinessAccountId?: string | null;
  selectedWhatsappPhoneNumberId?: string | null;
  selectedWhatsappDisplayPhoneNumber?: string | null;
  selectedTiktokAccountId?: string | null;
  selectedTiktokAccountName?: string | null;
  safeProviderMetadata?: Record<string, string>;
  lastErrorCode?: string | null;
  reconnectRequired?: boolean;
  /** Temporary pending accounts from discovery — cleared after selection. */
  pendingAccountIds?: string[];
  pendingAccounts?: Array<{
    id: string;
    kind: string;
    displayName: string;
    parentAccountId?: string | null;
  }>;
};

export type SocialConnectionProviderCard = {
  provider: SocialConnectionProvider;
  label: string;
  foundationStatus: SocialConnectionFoundationStatus;
  statusLabel: string;
  selectedAccountLabel: string | null;
  oauthAppConfigured: boolean;
  authorizeUrlAvailable: boolean;
  hasCredentials: boolean;
  liveProviderVerified: boolean;
  lastHealthCheckAt: string | null;
  lastError: string | null;
  safeErrorMessage: string | null;
  setupRequirementCategory: string | null;
  canConnect: boolean;
  canCompleteAccountSelection: boolean;
  canReconnect: boolean;
  canDisconnect: boolean;
  canViewSetupRequirements: boolean;
  connectionId: string | null;
  updatedAt: string | null;
  disconnectedAt: string | null;
  /** When set, connect/disconnect actions use the delegated API (e.g. Facebook Business). */
  delegatedTo?: 'facebook_business' | null;
  canonicalSource?: keyof typeof SOCIAL_CONNECTION_CANONICAL_SOURCES;
  managementPath?: string | null;
};

export type SocialConnectionsDashboard = {
  summary: string;
  providers: SocialConnectionProviderCard[];
  runtimeHonesty: {
    encryptionKeyConfigured: boolean;
    liveOAuthAvailable: boolean;
    publishingAvailable: false;
    schedulingAvailable: false;
    analyticsAvailable: false;
    note: string;
  };
};

export type StartSocialConnectionOAuthRequest = {
  provider: SocialConnectionProvider;
  returnPath?: string;
};

export type SelectSocialConnectionAccountRequest = {
  provider: SocialConnectionProvider;
  selection: SocialAccountSelection;
};

export type SocialConnectionHealthResult = {
  provider: SocialConnectionProvider;
  foundationStatus: SocialConnectionFoundationStatus;
  healthy: boolean;
  message: string;
  lastHealthCheckAt: string;
  liveProviderVerified: boolean;
};

export type SocialConnectionSetupRequirements = {
  provider: SocialConnectionProvider;
  label: string;
  foundationStatus: SocialConnectionFoundationStatus;
  envVariables: string[];
  callbackUrlPattern: string;
  configurationCategories: string[];
  accountSelectionExpectations: string[];
  reviewBlockers: string[];
  ownerPortalSteps: string[];
  neverCommit: string[];
};

export const SOCIAL_CONNECTION_PROVIDER_LABELS: Record<SocialConnectionProvider, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  google_business: 'Google Business Profile',
  whatsapp_business: 'WhatsApp Business',
  tiktok: 'TikTok',
};

export const SOCIAL_CONNECTION_PRODUCT_COPY = {
  summary:
    'Connect business social accounts securely. This foundation covers authentication, account selection, health and disconnect only — publishing, scheduling, analytics and campaigns remain a later approved phase.',
  honesty:
    'Connected means encrypted credentials and a server-validated account selection exist. Live provider authorization requires Owner-configured OAuth apps and is not triggered automatically by TITAN.',
} as const;

/** View social connection status and setup requirements — Owner, Admin and Office. */
export function canViewSocialConnections(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (identity.permissions.includes('*')) return true;
  return (
    canWriteMarketingAgent(identity) ||
    identity.permissions.includes('marketing:read') ||
    identity.permissions.includes('marketing_intelligence:read') ||
    identity.permissions.includes('marketing_intelligence:write') ||
    identity.permissions.includes('marketing_intelligence:manage') ||
    identity.permissions.includes('integrations:read') ||
    identity.permissions.includes('integrations:manage')
  );
}

/** @deprecated Use canViewSocialConnections */
export function canAccessSocialConnections(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canViewSocialConnections(identity);
}

/** Connect, select, reconnect and disconnect — Company Owner only (Young Guns policy). */
export function canManageSocialConnections(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canViewSocialConnections(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return isCompanyOwnerRole(identity.roleName);
}

/** Admin read-only — same view gate as Office staff with marketing/integrations read. */
export function canAdminViewSocialConnections(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canViewSocialConnections(identity);
}

export function mapFacebookStateToFoundationStatus(
  state: string,
): SocialConnectionFoundationStatus {
  switch (state) {
    case 'connected':
      return 'CONNECTED';
    case 'partial':
      return 'ACCOUNT_SELECTION_REQUIRED';
    case 'disconnected':
      return 'DISCONNECTED';
    case 'configuration_required':
      return 'NOT_CONFIGURED';
    case 'reauthorisation_required':
    case 'expired':
      return 'RECONNECT_REQUIRED';
    case 'missing_permission':
    case 'provider_unavailable':
      return 'ERROR';
    default:
      return 'ERROR';
  }
}

export function formatSocialConnectionFoundationStatus(
  status: SocialConnectionFoundationStatus,
): string {
  switch (status) {
    case 'NOT_CONFIGURED':
      return 'Not configured';
    case 'READY_TO_CONNECT':
      return 'Ready to connect';
    case 'CONNECTING':
      return 'Connecting';
    case 'ACCOUNT_SELECTION_REQUIRED':
      return 'Account selection required';
    case 'CONNECTED':
      return 'Connected';
    case 'RECONNECT_REQUIRED':
      return 'Reconnect required';
    case 'ERROR':
      return 'Error';
    case 'DISCONNECTED':
      return 'Disconnected';
    case 'PROVIDER_REVIEW_REQUIRED':
      return 'Provider review required';
    default:
      return status;
  }
}

export function socialConnectionMapsToSocialMediaPlatform(
  provider: SocialConnectionProvider,
): 'facebook' | 'instagram' | 'google_business' | 'tiktok' | null {
  if (provider === 'whatsapp_business') return null;
  return provider;
}

export function hasCompleteAccountSelection(
  provider: SocialConnectionProvider,
  metadata: SocialConnectionSafeMetadata,
): boolean {
  switch (provider) {
    case 'facebook':
      return Boolean(metadata.selectedFacebookPageId);
    case 'instagram':
      return Boolean(metadata.selectedInstagramBusinessAccountId);
    case 'google_business':
      return Boolean(
        metadata.selectedGoogleBusinessAccountId && metadata.selectedGoogleBusinessLocationId,
      );
    case 'whatsapp_business':
      return Boolean(
        metadata.selectedWhatsappBusinessAccountId && metadata.selectedWhatsappPhoneNumberId,
      );
    case 'tiktok':
      return Boolean(metadata.selectedTiktokAccountId);
    default:
      return false;
  }
}

export function buildSelectedAccountLabel(
  provider: SocialConnectionProvider,
  metadata: SocialConnectionSafeMetadata,
): string | null {
  switch (provider) {
    case 'facebook':
      return metadata.selectedFacebookPageName ?? metadata.selectedFacebookPageId ?? null;
    case 'instagram':
      return (
        metadata.selectedInstagramBusinessAccountName ??
        metadata.selectedInstagramBusinessAccountId ??
        null
      );
    case 'google_business':
      return (
        metadata.selectedGoogleBusinessLocationName ??
        metadata.selectedGoogleBusinessLocationId ??
        null
      );
    case 'whatsapp_business':
      return (
        metadata.selectedWhatsappDisplayPhoneNumber ??
        metadata.selectedWhatsappPhoneNumberId ??
        null
      );
    case 'tiktok':
      return metadata.selectedTiktokAccountName ?? metadata.selectedTiktokAccountId ?? null;
    default:
      return null;
  }
}

export function resolveSocialConnectionFoundationStatus(input: {
  provider: SocialConnectionProvider;
  oauthAppConfigured: boolean;
  encryptionKeyConfigured: boolean;
  hasCredentials: boolean;
  hasAccountSelection: boolean;
  storedStatus?: string | null;
  lastError?: string | null;
  tokenExpired?: boolean;
  reconnectRequired?: boolean;
  providerReviewRequired?: boolean;
  connecting?: boolean;
}): SocialConnectionFoundationStatus {
  if (input.providerReviewRequired) {
    return 'PROVIDER_REVIEW_REQUIRED';
  }
  if (input.storedStatus === 'disconnected') {
    return 'DISCONNECTED';
  }
  if (input.connecting) {
    return 'CONNECTING';
  }
  if (!input.encryptionKeyConfigured) {
    return 'NOT_CONFIGURED';
  }
  if (!input.oauthAppConfigured) {
    if (input.provider === 'whatsapp_business') {
      return input.hasCredentials ? 'ACCOUNT_SELECTION_REQUIRED' : 'NOT_CONFIGURED';
    }
    if (input.provider === 'tiktok') {
      return 'PROVIDER_REVIEW_REQUIRED';
    }
    return 'NOT_CONFIGURED';
  }
  if (input.reconnectRequired || input.tokenExpired) {
    return 'RECONNECT_REQUIRED';
  }
  if (input.lastError && !input.hasCredentials) {
    return 'ERROR';
  }
  if (input.hasCredentials && !input.hasAccountSelection) {
    return 'ACCOUNT_SELECTION_REQUIRED';
  }
  if (input.hasCredentials && input.hasAccountSelection && !input.lastError) {
    return 'CONNECTED';
  }
  if (input.lastError) {
    return 'ERROR';
  }
  if (input.oauthAppConfigured && input.encryptionKeyConfigured) {
    return 'READY_TO_CONNECT';
  }
  return 'NOT_CONFIGURED';
}

export function buildSocialConnectionSetupRequirements(
  provider: SocialConnectionProvider,
  callbackBaseUrl: string,
): SocialConnectionSetupRequirements {
  const callbackUrlPattern = `${callbackBaseUrl}/api/v1/social-connections/oauth/callback?provider=${provider}`;
  const commonNeverCommit = [
    'OAuth client secrets',
    'Access tokens and refresh tokens',
    'Webhook verify tokens with live values',
    'Provider app private keys',
  ];

  switch (provider) {
    case 'facebook':
      return {
        provider,
        label: SOCIAL_CONNECTION_PROVIDER_LABELS.facebook,
        foundationStatus: 'NOT_CONFIGURED',
        envVariables: ['META_APP_ID', 'META_APP_SECRET', 'INTEGRATIONS_ENCRYPTION_KEY'],
        callbackUrlPattern,
        configurationCategories: ['Meta Developer App', 'Facebook Login product', 'Pages permissions'],
        accountSelectionExpectations: [
          'Owner authenticates with Meta',
          'TITAN lists Facebook Pages available to that account',
          'Owner selects the business Page — stored only after server validation',
        ],
        reviewBlockers: ['Meta app review for pages_manage_metadata if required'],
        ownerPortalSteps: [
          'Create or open a Meta Developer app',
          'Add Facebook Login and configure OAuth redirect URI',
          'Add env vars to TITAN host — never commit secrets',
        ],
        neverCommit: commonNeverCommit,
      };
    case 'instagram':
      return {
        provider,
        label: SOCIAL_CONNECTION_PROVIDER_LABELS.instagram,
        foundationStatus: 'NOT_CONFIGURED',
        envVariables: ['META_APP_ID', 'META_APP_SECRET', 'INTEGRATIONS_ENCRYPTION_KEY'],
        callbackUrlPattern,
        configurationCategories: [
          'Meta Developer App',
          'Instagram Graph API',
          'Linked Facebook Page',
        ],
        accountSelectionExpectations: [
          'Instagram Business accounts linked to an available Facebook Page only',
          'Personal Instagram accounts are not valid business connections',
        ],
        reviewBlockers: ['Meta app review for instagram_basic and related permissions'],
        ownerPortalSteps: [
          'Ensure Instagram account is Business/Creator and linked to a Facebook Page',
          'Configure Meta app with Instagram permissions',
        ],
        neverCommit: commonNeverCommit,
      };
    case 'google_business':
      return {
        provider,
        label: SOCIAL_CONNECTION_PROVIDER_LABELS.google_business,
        foundationStatus: 'NOT_CONFIGURED',
        envVariables: [
          'GOOGLE_BUSINESS_CLIENT_ID',
          'GOOGLE_BUSINESS_CLIENT_SECRET',
          'INTEGRATIONS_ENCRYPTION_KEY',
        ],
        callbackUrlPattern,
        configurationCategories: ['Google Cloud project', 'Business Profile API', 'OAuth consent'],
        accountSelectionExpectations: [
          'List accessible business accounts and locations',
          'Owner selects validated location (e.g. Young Guns Plumbing Cape Town)',
        ],
        reviewBlockers: ['Google OAuth verification for sensitive scopes'],
        ownerPortalSteps: [
          'Enable Business Profile API in Google Cloud Console',
          'Configure OAuth client and redirect URI',
        ],
        neverCommit: commonNeverCommit,
      };
    case 'whatsapp_business':
      return {
        provider,
        label: SOCIAL_CONNECTION_PROVIDER_LABELS.whatsapp_business,
        foundationStatus: 'NOT_CONFIGURED',
        envVariables: [
          'META_APP_ID',
          'META_APP_SECRET',
          'WHATSAPP_BUSINESS_ACCOUNT_ID',
          'INTEGRATIONS_ENCRYPTION_KEY',
        ],
        callbackUrlPattern,
        configurationCategories: ['Meta Cloud API', 'WhatsApp Business Account', 'Phone number'],
        accountSelectionExpectations: [
          'List WhatsApp Business Accounts and phone numbers when supported',
          'Store selected WABA and phone-number identifier after validation',
          'Operational WhatsApp messaging uses existing whatsapp_connections — not overwritten here',
        ],
        reviewBlockers: ['Meta business verification for production messaging'],
        ownerPortalSteps: [
          'Configure Meta Cloud API app and WhatsApp Business Account in Meta Business Suite',
          'Complete OAuth or token setup per TITAN WhatsApp settings where applicable',
        ],
        neverCommit: commonNeverCommit,
      };
    case 'tiktok':
      return {
        provider,
        label: SOCIAL_CONNECTION_PROVIDER_LABELS.tiktok,
        foundationStatus: 'PROVIDER_REVIEW_REQUIRED',
        envVariables: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'INTEGRATIONS_ENCRYPTION_KEY'],
        callbackUrlPattern,
        configurationCategories: ['TikTok for Developers app', 'Login Kit', 'Content Posting API readiness'],
        accountSelectionExpectations: [
          'Business/content account connection when TikTok approves the application',
          'TITAN reports CONFIGURATION_REQUIRED or PROVIDER_REVIEW_REQUIRED until live auth is permitted',
        ],
        reviewBlockers: [
          'TikTok application review',
          'Business account verification',
          'Live authorization cannot proceed until provider approval',
        ],
        ownerPortalSteps: [
          'Register TikTok for Developers application',
          'Submit for review — TITAN will not show fake Connected state',
        ],
        neverCommit: commonNeverCommit,
      };
    default:
      return {
        provider,
        label: provider,
        foundationStatus: 'NOT_CONFIGURED',
        envVariables: [],
        callbackUrlPattern,
        configurationCategories: [],
        accountSelectionExpectations: [],
        reviewBlockers: [],
        ownerPortalSteps: [],
        neverCommit: commonNeverCommit,
      };
  }
}

export function redactSocialConnectionForApi<T extends Record<string, unknown>>(payload: T): T {
  const clone = { ...payload } as Record<string, unknown>;
  for (const key of [
    'accessToken',
    'refreshToken',
    'credentialsEncrypted',
    'pageAccessToken',
    'userAccessToken',
    'token',
    'secret',
  ]) {
    if (key in clone) {
      delete clone[key];
    }
  }
  return clone as T;
}
