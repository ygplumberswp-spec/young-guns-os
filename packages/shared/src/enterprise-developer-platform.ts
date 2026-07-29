export type DeveloperExtensionType =
  | 'frontend'
  | 'backend'
  | 'ai_agent'
  | 'workflow'
  | 'dashboard_widget'
  | 'report'
  | 'integration'
  | 'automation';

export type DeveloperExtensionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'installed'
  | 'disabled'
  | 'rejected';

export type DeveloperMarketplaceStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'rejected'
  | 'archived';

export type DeveloperTokenType = 'api_key' | 'personal_token' | 'service_account';

export type DeveloperWebhookSubscriptionStatus = 'active' | 'paused' | 'disabled';

export type DeveloperPlatformActionType =
  | 'extension_install'
  | 'extension_publish'
  | 'webhook_subscription'
  | 'oauth_app_create'
  | 'sdk_generate'
  | 'integration_guide';

export type DeveloperPlatformActionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type DeveloperExtensionSummary = {
  id: string;
  extensionKey: string;
  name: string;
  description: string;
  extensionType: DeveloperExtensionType;
  status: DeveloperExtensionStatus;
  version: string;
  permissions: string[];
  installedAt: string | null;
  createdAt: string;
};

export type DeveloperMarketplaceListingSummary = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: DeveloperMarketplaceStatus;
  version: string;
  permissions: string[];
  averageRating: number | null;
  reviewCount: number;
  publishedAt: string | null;
};

export type DeveloperOauthApplicationSummary = {
  id: string;
  name: string;
  clientId: string;
  redirectUris: string[];
  scopes: string[];
  createdAt: string;
};

export type DeveloperOauthApplicationDetail = DeveloperOauthApplicationSummary & {
  clientSecret: string;
};

export type DeveloperPersonalAccessTokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type DeveloperPersonalAccessTokenDetail = DeveloperPersonalAccessTokenSummary & {
  token: string;
};

export type DeveloperServiceAccountSummary = {
  id: string;
  name: string;
  description: string | null;
  tokenPrefix: string;
  scopes: string[];
  createdAt: string;
};

export type DeveloperServiceAccountDetail = DeveloperServiceAccountSummary & {
  token: string;
};

export type DeveloperWebhookSubscriptionSummary = {
  id: string;
  name: string;
  targetUrl: string;
  eventTypes: string[];
  secretPrefix: string;
  status: DeveloperWebhookSubscriptionStatus;
  maxRetries: number;
  createdAt: string;
};

export type DeveloperWebhookSubscriptionDetail = DeveloperWebhookSubscriptionSummary & {
  secret: string;
};

export type DeveloperWebhookDeadLetterSummary = {
  id: string;
  subscriptionId: string | null;
  eventType: string;
  payloadSummary: string | null;
  errorMessage: string | null;
  attempts: number;
  failedAt: string;
};

export type DeveloperApiChangelogEntry = {
  id: string;
  version: string;
  title: string;
  description: string;
  changeType: string;
  releasedAt: string;
};

export type DeveloperSdkPackageSummary = {
  id: string;
  language: string;
  version: string;
  packageName: string;
  generatedAt: string;
};

export type DeveloperSdkPackageDetail = DeveloperSdkPackageSummary & {
  manifest: Record<string, unknown>;
  exampleCode: string;
};

export type DeveloperOpenApiSpecSummary = {
  id: string;
  version: string;
  title: string;
  generatedAt: string;
};

export type DeveloperOpenApiSpecDetail = DeveloperOpenApiSpecSummary & {
  spec: Record<string, unknown>;
};

export type DeveloperAuthAuditSummary = {
  id: string;
  tokenType: DeveloperTokenType;
  actionType: string;
  subject: string;
  performedAt: string;
};

export type DeveloperAnalyticsSummary = {
  apiRequestCount: number;
  apiErrorCount: number;
  avgLatencyMs: number | null;
  webhookDeliveryCount: number;
  webhookFailureCount: number;
  extensionUsageCount: number;
  sdkDownloadCount: number;
  errorRatePercent: number | null;
};

export type DeveloperPlatformActionSummary = {
  id: string;
  actionType: DeveloperPlatformActionType;
  status: DeveloperPlatformActionStatus;
  subject: string;
  recommendation: string;
  extensionId: string | null;
  createdAt: string;
};

export type DeveloperApiExplorerEndpoint = {
  method: string;
  path: string;
  summary: string;
  tag: string;
  requiredPermissions: string[];
};

export type DeveloperApiHealthSummary = {
  status: string;
  apiVersion: string;
  gatewayTraceCount: number;
  avgLatencyMs: number | null;
  errorRatePercent: number | null;
};

export type EnterpriseDeveloperPlatformDashboard = {
  summary: string;
  apiHealth: DeveloperApiHealthSummary;
  analytics: DeveloperAnalyticsSummary;
  installedExtensions: DeveloperExtensionSummary[];
  marketplaceListings: DeveloperMarketplaceListingSummary[];
  apiKeysCount: number;
  personalTokenCount: number;
  serviceAccountCount: number;
  oauthAppCount: number;
  webhookSubscriptionCount: number;
  webhookDeadLetterCount: number;
  sdkPackages: DeveloperSdkPackageSummary[];
  changelog: DeveloperApiChangelogEntry[];
  openapiSpec: DeveloperOpenApiSpecDetail | null;
  apiExplorerEndpoints: DeveloperApiExplorerEndpoint[];
  pendingActionCount: number;
};

export type EnterpriseDeveloperPlatformAuraContext = {
  summary: string;
  apiRequestCount: number;
  installedExtensionCount: number;
  webhookSubscriptionCount: number;
  pendingActionCount: number;
  sdkPackageCount: number;
};

export type CreateDeveloperExtensionRequest = {
  extensionKey: string;
  name: string;
  description: string;
  extensionType: DeveloperExtensionType;
  permissions?: string[];
  manifest?: Record<string, unknown>;
};

export type CreateDeveloperWebhookSubscriptionRequest = {
  name: string;
  targetUrl: string;
  eventTypes: string[];
  maxRetries?: number;
};

export type CreateDeveloperOauthApplicationRequest = {
  name: string;
  redirectUris: string[];
  scopes?: string[];
};

export type CreateDeveloperPersonalTokenRequest = {
  name: string;
  scopes?: string[];
  expiresAt?: string | null;
};

export type CreateDeveloperServiceAccountRequest = {
  name: string;
  description?: string | null;
  scopes?: string[];
};

export type CreateDeveloperPlatformActionRequest = {
  actionType: DeveloperPlatformActionType;
  subject: string;
  recommendation: string;
  extensionId?: string | null;
  payload?: Record<string, unknown>;
};

export type GenerateDeveloperSdkRequest = {
  language: 'typescript' | 'javascript' | 'nodejs' | 'python' | 'csharp' | 'java' | 'go';
};

export const DEVELOPER_SDK_LANGUAGES = [
  'typescript',
  'javascript',
  'nodejs',
  'python',
  'csharp',
  'java',
  'go',
] as const;

export type DeveloperSdkLanguage = (typeof DEVELOPER_SDK_LANGUAGES)[number];
