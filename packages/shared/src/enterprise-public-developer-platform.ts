import type {
  DeveloperApiExplorerEndpoint,
  DeveloperOpenApiSpecDetail,
  DeveloperSdkPackageSummary,
  DeveloperWebhookDeadLetterSummary,
  DeveloperWebhookSubscriptionSummary,
  EnterpriseDeveloperPlatformDashboard,
} from './enterprise-developer-platform.js';

export type PdpPlatformConfigSummary = {
  apiPolicy: Record<string, unknown>;
  webhookPolicy: Record<string, unknown>;
  authPolicy: Record<string, unknown>;
  rateLimitPolicy: Record<string, unknown>;
  sandboxPolicy: Record<string, unknown>;
  auditRetentionDays: number;
};

export type PdpApiVersionSummary = {
  id: string;
  versionKey: string;
  title: string;
  description: string | null;
  basePath: string;
  status: string;
  deprecatedAt: string | null;
  sunsetAt: string | null;
  createdAt: string;
};

export type PdpApiScopeSummary = {
  id: string;
  scopeKey: string;
  name: string;
  description: string | null;
  resourceType: string;
  permissions: string[];
  isSystemScope: boolean;
};

export type PdpWebhookEventTypeSummary = {
  id: string;
  eventKey: string;
  name: string;
  description: string | null;
  category: string;
  isSystemEvent: boolean;
};

export type PdpRateLimitPolicySummary = {
  id: string;
  policyKey: string;
  name: string;
  tenantLimitPerMinute: number | null;
  applicationLimitPerMinute: number | null;
  burstLimit: number | null;
  workflowStatus: string;
  createdAt: string;
};

export type PdpSandboxConfigSummary = {
  enabled: boolean;
  sandboxBaseUrl: string | null;
  testKeyPolicy: Record<string, unknown>;
  webhookTestPolicy: Record<string, unknown>;
  config: Record<string, unknown>;
};

export type PdpSdkGenerationRecordSummary = {
  id: string;
  language: string;
  version: string;
  packageName: string;
  openapiVersion: string | null;
  generatedAt: string;
};

export type PdpApiStatusSummary = {
  id: string;
  overallStatus: string;
  apiAvailability: string | null;
  webhookHealth: string | null;
  sdkStatus: string | null;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type PdpDeveloperAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  createdAt: string;
};

export type PdpActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type PdpAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type PdpAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type PdpDeveloperMonitoringSummary = {
  apiKeyCount: number;
  webhookSubscriptionCount: number;
  webhookFailureCount: number;
  openAlertCount: number;
  sdkPackageCount: number;
  sandboxEnabled: boolean;
  alerts: string[];
};

export type EnterprisePublicDeveloperDashboard = {
  summary: string;
  platformConfig: PdpPlatformConfigSummary;
  legacyDeveloperPlatform: EnterpriseDeveloperPlatformDashboard | null;
  apiVersionCount: number;
  apiScopeCount: number;
  webhookEventTypeCount: number;
  openAlertCount: number;
  overallApiHealthStatus: string;
  developerMonitoring: PdpDeveloperMonitoringSummary;
  analytics: PdpAnalyticsSummary | null;
  apiStatus: PdpApiStatusSummary | null;
  openapiSpec: DeveloperOpenApiSpecDetail | null;
  apiExplorerEndpoints: DeveloperApiExplorerEndpoint[];
  sdkPackages: DeveloperSdkPackageSummary[];
  webhookSubscriptions: DeveloperWebhookSubscriptionSummary[];
  webhookDeadLetter: DeveloperWebhookDeadLetterSummary[];
  recentAlerts: PdpDeveloperAlertSummary[];
  recentSdkGenerations: PdpSdkGenerationRecordSummary[];
};

export type EnterprisePublicDeveloperAuraContext = {
  summary: string;
  apiKeyCount: number;
  webhookSubscriptionCount: number;
  webhookFailureCount: number;
  openAlertCount: number;
  sdkPackageCount: number;
  overallApiHealthStatus: string;
};

export type UpdatePdpPlatformConfigRequest = {
  apiPolicy?: Record<string, unknown>;
  webhookPolicy?: Record<string, unknown>;
  authPolicy?: Record<string, unknown>;
  rateLimitPolicy?: Record<string, unknown>;
  sandboxPolicy?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type UpdatePdpSandboxConfigRequest = {
  enabled?: boolean;
  sandboxBaseUrl?: string;
  testKeyPolicy?: Record<string, unknown>;
  webhookTestPolicy?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreatePdpRateLimitPolicyRequest = {
  policyKey: string;
  name: string;
  tenantLimitPerMinute?: number;
  applicationLimitPerMinute?: number;
  burstLimit?: number;
  config?: Record<string, unknown>;
};

export type CreatePdpActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type GeneratePdpSdkRequest = {
  language: 'typescript' | 'javascript' | 'python';
};

export const PUBLIC_API_SCOPES = [
  'customers:read',
  'customers:write',
  'jobs:read',
  'jobs:write',
  'quotes:read',
  'quotes:write',
  'invoices:read',
  'invoices:write',
  'payments:read',
  'payments:write',
  'inventory:read',
  'inventory:write',
  'fleet:read',
  'fleet:write',
  'assets:read',
  'assets:write',
  'technicians:read',
  'technicians:write',
  'scheduling:read',
  'scheduling:write',
  'communications:read',
  'communications:write',
  'documents:read',
  'documents:write',
  'reports:read',
  'ai_agents:read',
  'automations:read',
  'automations:write',
  'webhooks:read',
  'webhooks:write',
] as const;

export const PUBLIC_WEBHOOK_EVENT_KEYS = [
  'customer.created',
  'lead.created',
  'quote.accepted',
  'job.booked',
  'job.started',
  'job.completed',
  'invoice.created',
  'invoice.paid',
  'payment.failed',
  'inventory.updated',
  'asset.serviced',
  'technician.assigned',
  'vehicle.event',
  'automation.completed',
  'ai_task.completed',
] as const;
