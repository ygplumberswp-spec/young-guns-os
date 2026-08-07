import type {
  SocialConnectionHealthResult,
  SocialConnectionProviderCard,
  SocialConnectionsDashboard,
  SocialConnectionSetupRequirements,
  SocialDiscoveredAccount,
  SocialPublishingProvider,
  StartSocialConnectionOAuthRequest,
  SelectSocialConnectionAccountRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as SocialConnectionApiClientError };

export async function fetchSocialConnectionsDashboard(
  accessToken: string,
  options?: { signal?: AbortSignal },
): Promise<SocialConnectionsDashboard> {
  const data = await request<{ dashboard: SocialConnectionsDashboard }>(
    '/social-connections/dashboard',
    { accessToken, signal: options?.signal },
  );
  return data.dashboard;
}

export async function fetchSocialConnectionSetup(
  accessToken: string,
  provider: SocialPublishingProvider,
  options?: { signal?: AbortSignal },
): Promise<SocialConnectionSetupRequirements> {
  const data = await request<{ requirements: SocialConnectionSetupRequirements }>(
    `/social-connections/setup/${provider}`,
    { accessToken, signal: options?.signal },
  );
  return data.requirements;
}

export async function startSocialConnectionOAuth(
  accessToken: string,
  body: StartSocialConnectionOAuthRequest,
): Promise<{ authorizationUrl: string }> {
  return request<{ authorizationUrl: string }>('/social-connections/oauth/start', {
    accessToken,
    method: 'POST',
    body,
  });
}

export async function fetchSocialConnectionAccounts(
  accessToken: string,
  provider: SocialPublishingProvider,
): Promise<SocialDiscoveredAccount[]> {
  const data = await request<{ accounts: SocialDiscoveredAccount[] }>(
    `/social-connections/accounts/${provider}`,
    { accessToken },
  );
  return data.accounts;
}

export async function selectSocialConnectionAccount(
  accessToken: string,
  body: SelectSocialConnectionAccountRequest,
): Promise<SocialConnectionProviderCard> {
  const data = await request<{ provider: SocialConnectionProviderCard }>(
    '/social-connections/accounts/select',
    {
      accessToken,
      method: 'POST',
      body,
    },
  );
  return data.provider;
}

export async function checkSocialConnectionHealth(
  accessToken: string,
  provider: SocialPublishingProvider,
): Promise<SocialConnectionHealthResult> {
  return request<SocialConnectionHealthResult>('/social-connections/health', {
    accessToken,
    method: 'POST',
    body: { provider },
  });
}

export async function reconnectSocialConnection(
  accessToken: string,
  provider: SocialPublishingProvider,
): Promise<{ authorizationUrl: string }> {
  return request<{ authorizationUrl: string }>('/social-connections/reconnect', {
    accessToken,
    method: 'POST',
    body: { provider },
  });
}

export async function disconnectSocialConnection(
  accessToken: string,
  provider: SocialPublishingProvider,
): Promise<SocialConnectionProviderCard> {
  const data = await request<{ provider: SocialConnectionProviderCard }>(
    '/social-connections/disconnect',
    {
      accessToken,
      method: 'POST',
      body: { provider },
    },
  );
  return data.provider;
}
