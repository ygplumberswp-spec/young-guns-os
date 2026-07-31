import type { IntegrationProvider } from './integrations.js';

export type IntegrationAuthType =
  'oauth' | 'api_key' | 'bearer_token' | 'webhook_secret' | 'basic_auth';

export type IntegrationHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export type IntegrationLogDirection = 'inbound' | 'outbound';

export type IntegrationWebhookDeliveryStatus =
  'pending' | 'delivered' | 'failed' | 'dead_letter' | 'retry';

export type IntegrationWebhookDirection = 'inbound' | 'outbound';

export type IntegrationRegistryEntry = {
  provider: IntegrationProvider | string;
  name: string;
  description: string;
  category: string;
  availability: 'available' | 'planned';
  authType: IntegrationAuthType | null;
  version: string | null;
  enabled: boolean;
  healthStatus: IntegrationHealthStatus;
  connectionId: string | null;
  connectionStatus: string;
  isConfigured: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastHealthCheckAt: string | null;
  lastError: string | null;
  supportsSync: boolean;
  supportsWebhooks: boolean;
  settingsPath: string | null;
};

export type IntegrationCredentialMetadataSummary = {
  id: string;
  provider: IntegrationProvider | string;
  connectionId: string | null;
  authType: IntegrationAuthType;
  credentialHint: string | null;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  lastRotatedAt: string | null;
  usageCount: number;
  rotationRequired: boolean;
};

export type IntegrationApiUsageSummary = {
  id: string;
  provider: IntegrationProvider | string | null;
  endpointKey: string;
  requestCount: number;
  failureCount: number;
  avgResponseMs: number | null;
  periodStart: string;
  periodEnd: string;
};

export type IntegrationHealthSummary = {
  provider: IntegrationProvider | string;
  healthStatus: IntegrationHealthStatus;
  authHealthy: boolean;
  apiAvailable: boolean;
  webhookHealthy: boolean;
  avgLatencyMs: number | null;
  summary: string;
  checkedAt: string;
};

export type IntegrationRequestLogSummary = {
  id: string;
  provider: IntegrationProvider | string | null;
  direction: IntegrationLogDirection;
  method: string | null;
  endpoint: string;
  statusCode: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  requestSummary: string | null;
  responseSummary: string | null;
  createdAt: string;
};

export type IntegrationWebhookDeliverySummary = {
  id: string;
  webhookEndpointId: string | null;
  direction: IntegrationWebhookDirection;
  status: IntegrationWebhookDeliveryStatus;
  eventType: string;
  attempts: number;
  maxAttempts: number;
  payloadSummary: string | null;
  errorMessage: string | null;
  scheduledFor: string;
  deliveredAt: string | null;
  createdAt: string;
};

export type IntegrationRecommendationSummary = {
  id: string;
  provider: IntegrationProvider | string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
};

export type DeveloperApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type DeveloperApiKeyDetail = DeveloperApiKeySummary & {
  apiKey?: string;
};

export type IntegrationSyncManagerStatus = {
  syncJobs: Array<{
    id: string;
    provider: IntegrationProvider | string;
    status: string;
    jobType: string;
    startedAt: string;
    completedAt: string | null;
    errorMessage: string | null;
  }>;
  scheduledSyncs: Array<{
    provider: IntegrationProvider | string;
    nextSyncAt: string | null;
    enabled: boolean;
  }>;
};

export type IntegrationValidationResult = {
  provider: IntegrationProvider | string;
  valid: boolean;
  checks: Array<{
    key: string;
    passed: boolean;
    message: string;
  }>;
};

export type UpdateIntegrationRegistrySettingsRequest = {
  enabled?: boolean;
  version?: string | null;
  nextSyncAt?: string | null;
};

export type CreateDeveloperApiKeyRequest = {
  name: string;
  scopes?: string[];
  expiresAt?: string | null;
};

export type CreateOutboundWebhookDeliveryRequest = {
  webhookEndpointId?: string | null;
  eventType: string;
  payloadSummary?: string | null;
};

export type IntegrationApiManagementAuraContext = {
  registryCount: number;
  enabledCount: number;
  connectedCount: number;
  unhealthyCount: number;
  pendingWebhookDeliveries: number;
  developerApiKeyCount: number;
  providers: Array<{
    name: string;
    provider: string;
    enabled: boolean;
    healthStatus: string;
    connectionStatus: string;
    lastSyncAt: string | null;
  }>;
  recentHealth: Array<{
    provider: string;
    healthStatus: string;
    summary: string;
    checkedAt: string;
  }>;
};
