/**
 * Injectable social connection provider adapters.
 * Tests use deterministic mock responses — production uses env-gated URLs only.
 */

import type {
  SocialConnectionProvider,
  SocialDiscoveredAccount,
} from '@titan/shared';
import type { SocialMediaStoredCredentials } from '../lib/crypto.js';

export type SocialOAuthExchangeResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  providerUserId?: string;
};

export type SocialHealthProbeResult = {
  ok: boolean;
  message: string;
  liveProviderVerified: boolean;
};

export interface SocialConnectionProviderAdapter {
  readonly provider: SocialConnectionProvider;
  isConfigured(): boolean;
  requiresProviderReview(): boolean;
  buildAuthorizeUrl(state: string, redirectUri: string): string | null;
  exchangeCode(input: { code: string; redirectUri: string }): Promise<SocialOAuthExchangeResult>;
  discoverAccounts(
    credentials: SocialMediaStoredCredentials,
  ): Promise<SocialDiscoveredAccount[]>;
  probeHealth(
    credentials: SocialMediaStoredCredentials,
    metadata: Record<string, unknown>,
  ): Promise<SocialHealthProbeResult>;
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function mockAuthorizeUrl(provider: SocialConnectionProvider, state: string, redirectUri: string): string {
  const params = new URLSearchParams({ provider, state, redirect_uri: redirectUri, mock: '1' });
  return `https://oauth.mock.titan.local/${provider}?${params.toString()}`;
}

class MetaFamilyAdapter implements SocialConnectionProviderAdapter {
  constructor(public readonly provider: 'facebook' | 'instagram') {}

  isConfigured(): boolean {
    return Boolean(env('META_APP_ID') || env('FACEBOOK_APP_ID') || env('META_OAUTH_CLIENT_ID'));
  }

  requiresProviderReview(): boolean {
    return false;
  }

  buildAuthorizeUrl(state: string, redirectUri: string): string | null {
    if (!this.isConfigured()) return null;
    const appId = env('META_APP_ID') ?? env('FACEBOOK_APP_ID') ?? env('META_OAUTH_CLIENT_ID');
    const scope =
      this.provider === 'instagram'
        ? 'instagram_basic,pages_show_list,pages_read_engagement'
        : 'pages_show_list,pages_read_engagement,pages_manage_metadata';
    const params = new URLSearchParams({
      client_id: appId!,
      redirect_uri: redirectUri,
      state,
      scope,
      response_type: 'code',
    });
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return mockAuthorizeUrl(this.provider, state, redirectUri);
    }
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<SocialOAuthExchangeResult> {
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return {
        accessToken: `mock-${this.provider}-token-${input.code.slice(0, 8)}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        scope: 'mock_scope',
        providerUserId: `mock-user-${this.provider}`,
      };
    }
    throw new Error(
      `${this.provider} live token exchange is not triggered in this foundation phase.`,
    );
  }

  async discoverAccounts(
    credentials: SocialMediaStoredCredentials,
  ): Promise<SocialDiscoveredAccount[]> {
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      if (this.provider === 'facebook') {
        return [
          {
            id: 'mock-page-yg-cpt',
            kind: 'facebook_page',
            displayName: 'Young Guns Plumbing — Cape Town',
          },
        ];
      }
      return [
        {
          id: 'mock-ig-business-yg',
          kind: 'instagram_business_account',
          displayName: 'Young Guns Plumbing IG Business',
          parentAccountId: 'mock-page-yg-cpt',
        },
      ];
    }
    if (!credentials.accessToken) {
      return [];
    }
    return [];
  }

  async probeHealth(
    credentials: SocialMediaStoredCredentials,
    metadata: Record<string, unknown>,
  ): Promise<SocialHealthProbeResult> {
    if (!credentials.accessToken) {
      return { ok: false, message: 'No access token stored.', liveProviderVerified: false };
    }
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      const hasSelection =
        this.provider === 'facebook'
          ? Boolean(metadata.selectedFacebookPageId)
          : Boolean(metadata.selectedInstagramBusinessAccountId);
      return {
        ok: hasSelection,
        message: hasSelection
          ? 'Mock provider health check succeeded.'
          : 'Account selection required before health can pass.',
        liveProviderVerified: true,
      };
    }
    return {
      ok: true,
      message: 'Stored credentials present. Live provider probe not executed in this foundation.',
      liveProviderVerified: false,
    };
  }
}

class GoogleBusinessAdapter implements SocialConnectionProviderAdapter {
  readonly provider = 'google_business' as const;

  isConfigured(): boolean {
    return Boolean(
      env('GOOGLE_BUSINESS_CLIENT_ID') ||
        env('GBP_CLIENT_ID') ||
        env('GOOGLE_OAUTH_CLIENT_ID'),
    );
  }

  requiresProviderReview(): boolean {
    return false;
  }

  buildAuthorizeUrl(state: string, redirectUri: string): string | null {
    if (!this.isConfigured()) return null;
    const clientId =
      env('GOOGLE_BUSINESS_CLIENT_ID') ?? env('GBP_CLIENT_ID') ?? env('GOOGLE_OAUTH_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/business.manage',
      access_type: 'offline',
      prompt: 'consent',
    });
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return mockAuthorizeUrl(this.provider, state, redirectUri);
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<SocialOAuthExchangeResult> {
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return {
        accessToken: `mock-gbp-token-${input.code.slice(0, 8)}`,
        refreshToken: 'mock-gbp-refresh',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        providerUserId: 'mock-google-user',
      };
    }
    throw new Error('Google Business live token exchange is not triggered in this foundation phase.');
  }

  async discoverAccounts(): Promise<SocialDiscoveredAccount[]> {
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return [
        {
          id: 'mock-gbp-account-yg',
          kind: 'google_business_account',
          displayName: 'Young Guns Plumbing',
        },
        {
          id: 'mock-gbp-loc-cpt',
          kind: 'google_business_location',
          displayName: 'Young Guns Plumbing — Cape Town',
          parentAccountId: 'mock-gbp-account-yg',
        },
      ];
    }
    return [];
  }

  async probeHealth(
    credentials: SocialMediaStoredCredentials,
    metadata: Record<string, unknown>,
  ): Promise<SocialHealthProbeResult> {
    const hasSelection = Boolean(
      metadata.selectedGoogleBusinessAccountId && metadata.selectedGoogleBusinessLocationId,
    );
    if (!credentials.accessToken) {
      return { ok: false, message: 'No access token stored.', liveProviderVerified: false };
    }
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return {
        ok: hasSelection,
        message: hasSelection ? 'Mock GBP health check succeeded.' : 'Location selection required.',
        liveProviderVerified: true,
      };
    }
    return {
      ok: hasSelection,
      message: 'Stored credentials present. Live GBP probe not executed in this foundation.',
      liveProviderVerified: false,
    };
  }
}

class WhatsappBusinessAdapter implements SocialConnectionProviderAdapter {
  readonly provider = 'whatsapp_business' as const;

  isConfigured(): boolean {
    return Boolean(
      env('META_APP_ID') ||
        env('WHATSAPP_BUSINESS_ACCOUNT_ID') ||
        env('META_OAUTH_CLIENT_ID'),
    );
  }

  requiresProviderReview(): boolean {
    return false;
  }

  buildAuthorizeUrl(state: string, redirectUri: string): string | null {
    if (!this.isConfigured()) return null;
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return mockAuthorizeUrl(this.provider, state, redirectUri);
    }
    const appId = env('META_APP_ID') ?? env('META_OAUTH_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: appId!,
      redirect_uri: redirectUri,
      state,
      scope: 'whatsapp_business_management,business_management',
      response_type: 'code',
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<SocialOAuthExchangeResult> {
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return {
        accessToken: `mock-waba-token-${input.code.slice(0, 8)}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        providerUserId: 'mock-waba-user',
      };
    }
    throw new Error('WhatsApp Business live token exchange is not triggered in this foundation phase.');
  }

  async discoverAccounts(): Promise<SocialDiscoveredAccount[]> {
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return [
        {
          id: 'mock-waba-yg',
          kind: 'whatsapp_business_account',
          displayName: 'Young Guns Plumbing WABA',
        },
        {
          id: 'mock-wa-phone-yg',
          kind: 'whatsapp_phone_number',
          displayName: '+27 21 000 0000',
          parentAccountId: 'mock-waba-yg',
        },
      ];
    }
    return [];
  }

  async probeHealth(
    credentials: SocialMediaStoredCredentials,
    metadata: Record<string, unknown>,
  ): Promise<SocialHealthProbeResult> {
    const hasSelection = Boolean(
      metadata.selectedWhatsappBusinessAccountId && metadata.selectedWhatsappPhoneNumberId,
    );
    if (!credentials.accessToken) {
      return { ok: false, message: 'No access token stored.', liveProviderVerified: false };
    }
    return {
      ok: hasSelection,
      message: hasSelection
        ? process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1'
          ? 'Mock WhatsApp Business health check succeeded.'
          : 'Stored WABA selection present.'
        : 'WhatsApp Business account and phone number selection required.',
      liveProviderVerified: process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1' && hasSelection,
    };
  }
}

class TikTokAdapter implements SocialConnectionProviderAdapter {
  readonly provider = 'tiktok' as const;

  isConfigured(): boolean {
    return Boolean(env('TIKTOK_CLIENT_KEY') || env('TIKTOK_APP_ID'));
  }

  requiresProviderReview(): boolean {
    return true;
  }

  buildAuthorizeUrl(state: string, redirectUri: string): string | null {
    if (!this.isConfigured()) return null;
    if (process.env.TIKTOK_LIVE_OAUTH_ENABLED !== '1') {
      return null;
    }
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1') {
      return mockAuthorizeUrl(this.provider, state, redirectUri);
    }
    const clientKey = env('TIKTOK_CLIENT_KEY') ?? env('TIKTOK_APP_ID');
    const params = new URLSearchParams({
      client_key: clientKey!,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: 'user.info.basic,video.list',
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<SocialOAuthExchangeResult> {
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1' && process.env.TIKTOK_LIVE_OAUTH_ENABLED === '1') {
      return {
        accessToken: `mock-tiktok-token-${input.code.slice(0, 8)}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        providerUserId: 'mock-tiktok-user',
      };
    }
    throw new Error('TikTok live authorization requires provider review — not available in this foundation.');
  }

  async discoverAccounts(): Promise<SocialDiscoveredAccount[]> {
    if (process.env.SOCIAL_CONNECTION_MOCK_OAUTH === '1' && process.env.TIKTOK_LIVE_OAUTH_ENABLED === '1') {
      return [
        {
          id: 'mock-tiktok-yg',
          kind: 'tiktok_account',
          displayName: 'Young Guns Plumbing TikTok',
        },
      ];
    }
    return [];
  }

  async probeHealth(): Promise<SocialHealthProbeResult> {
    return {
      ok: false,
      message: 'TikTok connection readiness recorded — live authorization pending provider review.',
      liveProviderVerified: false,
    };
  }
}

export function createDefaultSocialConnectionAdapters(): Record<
  SocialConnectionProvider,
  SocialConnectionProviderAdapter
> {
  return {
    facebook: new MetaFamilyAdapter('facebook'),
    instagram: new MetaFamilyAdapter('instagram'),
    google_business: new GoogleBusinessAdapter(),
    whatsapp_business: new WhatsappBusinessAdapter(),
    tiktok: new TikTokAdapter(),
  };
}

export function detectSocialConnectionOauthConfigured(): Record<SocialConnectionProvider, boolean> {
  const adapters = createDefaultSocialConnectionAdapters();
  return {
    facebook: adapters.facebook.isConfigured(),
    instagram: adapters.instagram.isConfigured(),
    google_business: adapters.google_business.isConfigured(),
    whatsapp_business: adapters.whatsapp_business.isConfigured(),
    tiktok: adapters.tiktok.isConfigured(),
  };
}
