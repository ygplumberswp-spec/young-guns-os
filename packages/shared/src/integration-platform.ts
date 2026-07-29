import type { IntegrationAuthType } from './integration-api-management.js';
import type { IntegrationProvider } from './integrations.js';

export type IntegrationConnectorCategory =
  | 'accounting'
  | 'payments'
  | 'fleet'
  | 'crm'
  | 'marketing'
  | 'email'
  | 'calendar'
  | 'messaging'
  | 'storage'
  | 'ai'
  | 'erp'
  | 'hr_payroll'
  | 'ecommerce'
  | 'custom';

export type IntegrationConnectorAuthType =
  | 'oauth2'
  | 'api_key'
  | 'basic_auth'
  | 'bearer_token'
  | 'webhook'
  | 'custom';

export type IntegrationConnectorSyncMode = 'scheduled' | 'manual' | 'event_driven';

export type IntegrationConnectorStatus = 'disconnected' | 'pending' | 'connected' | 'error';

export type IntegrationSyncScopeType = 'incremental' | 'full' | 'event_driven';

export type IntegrationSyncConflictStatus = 'detected' | 'resolved' | 'ignored';

export type IntegrationPlatformActionType =
  | 'integration_repair'
  | 'reconnect_recommendation'
  | 'sync_retry'
  | 'credential_rotation';

export type IntegrationPlatformActionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type IntegrationDiagnosticStatus = 'pending' | 'running' | 'completed' | 'failed';

export type IntegrationConnectorSummary = {
  id: string;
  connectorKey: string;
  provider: IntegrationProvider | string;
  name: string;
  category: IntegrationConnectorCategory;
  authType: IntegrationConnectorAuthType;
  syncMode: IntegrationConnectorSyncMode;
  status: IntegrationConnectorStatus;
  connectionId: string | null;
  supportsWebhooks: boolean;
  supportsScheduledSync: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  syncFrequencyMinutes: number | null;
};

export type IntegrationGatewayTraceSummary = {
  id: string;
  traceId: string;
  routeKey: string;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
  apiVersion: string | null;
  occurredAt: string;
};

export type IntegrationSyncScheduleSummary = {
  id: string;
  connectorId: string;
  syncScope: IntegrationSyncScopeType;
  frequencyMinutes: number;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

export type IntegrationSyncConflictSummary = {
  id: string;
  connectorId: string;
  entityType: string;
  entityId: string | null;
  conflictType: string;
  status: IntegrationSyncConflictStatus;
  detectedAt: string;
};

export type IntegrationPlatformActionSummary = {
  id: string;
  actionType: IntegrationPlatformActionType;
  status: IntegrationPlatformActionStatus;
  subject: string;
  recommendation: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type IntegrationMonitoringSummary = {
  connectedServiceCount: number;
  errorServiceCount: number;
  activeSyncJobCount: number;
  failedRequestCount24h: number;
  avgLatencyMs: number | null;
  successRatePercent: number | null;
  rateLimitStatus: string;
};

export type IntegrationCredentialsVaultSummary = {
  id: string;
  provider: string;
  authType: IntegrationAuthType;
  credentialHint: string | null;
  encrypted: boolean;
  expiresAt: string | null;
  lastRotatedAt: string | null;
  rotationRequired: boolean;
};

export type IntegrationDeveloperDiagnosticSummary = {
  id: string;
  diagnosticType: string;
  status: IntegrationDiagnosticStatus;
  summary: string;
  createdAt: string;
};

export type IntegrationPlatformExecutiveDashboard = {
  summary: string;
  monitoring: IntegrationMonitoringSummary;
  connectors: IntegrationConnectorSummary[];
  recentTraces: IntegrationGatewayTraceSummary[];
  recentConflicts: IntegrationSyncConflictSummary[];
  pendingActionCount: number;
  vaultEntries: IntegrationCredentialsVaultSummary[];
};

export type IntegrationPlatformAuraContext = {
  summary: string;
  connectedServiceCount: number;
  errorServiceCount: number;
  activeSyncJobCount: number;
  failedRequestCount24h: number;
  pendingActionCount: number;
};

export type CreateIntegrationPlatformActionRequest = {
  actionType: IntegrationPlatformActionType;
  subject: string;
  recommendation: string;
  payload?: Record<string, unknown>;
};

export type UpdateIntegrationSyncScheduleRequest = {
  syncScope?: IntegrationSyncScopeType;
  frequencyMinutes?: number;
  enabled?: boolean;
};

export type RunIntegrationDiagnosticRequest = {
  diagnosticType: string;
  connectorId?: string;
};
