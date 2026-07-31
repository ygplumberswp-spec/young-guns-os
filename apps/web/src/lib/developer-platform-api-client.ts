import type {
  DeveloperExtensionSummary,
  DeveloperMarketplaceListingSummary,
  DeveloperSdkPackageDetail,
  DeveloperWebhookDeadLetterSummary,
  DeveloperWebhookSubscriptionSummary,
  EnterpriseDeveloperPlatformDashboard,
  GenerateDeveloperSdkRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as DeveloperPlatformApiClientError };

export async function fetchDeveloperDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseDeveloperPlatformDashboard }>(
    '/developer-platform/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function generateOpenApiSpec(accessToken: string) {
  const data = await request<{ spec: EnterpriseDeveloperPlatformDashboard['openapiSpec'] }>(
    '/developer-platform/openapi/generate',
    { accessToken, method: 'POST' },
  );
  return data.spec;
}

export async function generateSdkPackage(accessToken: string, body: GenerateDeveloperSdkRequest) {
  const data = await request<{ sdk: DeveloperSdkPackageDetail }>(
    '/developer-platform/sdk/generate',
    {
      accessToken,
      method: 'POST',
      body,
    },
  );
  return data.sdk;
}

export async function createDeveloperExtension(
  accessToken: string,
  body: {
    extensionKey: string;
    name: string;
    description: string;
    extensionType: string;
    permissions?: string[];
  },
) {
  const data = await request<{ extension: DeveloperExtensionSummary }>(
    '/developer-platform/extensions',
    {
      accessToken,
      method: 'POST',
      body,
    },
  );
  return data.extension;
}

export async function installDeveloperExtension(accessToken: string, extensionId: string) {
  const data = await request<{ extension: DeveloperExtensionSummary }>(
    `/developer-platform/extensions/${extensionId}/install`,
    { accessToken, method: 'POST' },
  );
  return data.extension;
}

export async function createWebhookSubscription(
  accessToken: string,
  body: { name: string; targetUrl: string; eventTypes: string[]; maxRetries?: number },
) {
  const data = await request<{ subscription: DeveloperWebhookSubscriptionSummary }>(
    '/developer-platform/webhooks/subscriptions',
    { accessToken, method: 'POST', body },
  );
  return data.subscription;
}

export async function replayWebhookDelivery(accessToken: string, deliveryId: string) {
  const data = await request<{ delivery: { id: string; status: string } }>(
    `/developer-platform/webhooks/deliveries/${deliveryId}/replay`,
    { accessToken, method: 'POST' },
  );
  return data.delivery;
}

export async function fetchMarketplaceListings(accessToken: string) {
  const data = await request<{ listings: DeveloperMarketplaceListingSummary[] }>(
    '/developer-platform/marketplace',
    {
      accessToken,
    },
  );
  return data.listings;
}

export async function fetchWebhookDeadLetter(accessToken: string) {
  const data = await request<{ deadLetter: DeveloperWebhookDeadLetterSummary[] }>(
    '/developer-platform/webhooks/dead-letter',
    { accessToken },
  );
  return data.deadLetter;
}

export async function captureDeveloperAnalytics(accessToken: string) {
  const data = await request<{ snapshot: { id: string } }>(
    '/developer-platform/analytics/capture',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data.snapshot;
}
