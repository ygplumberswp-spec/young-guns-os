import { and, desc, eq, isNull } from 'drizzle-orm';
import type {
  CreatePdpActionDraftRequest,
  CreatePdpRateLimitPolicyRequest,
  EnterprisePublicDeveloperAuraContext,
  EnterprisePublicDeveloperDashboard,
  GeneratePdpSdkRequest,
  PdpActionDraftSummary,
  PdpAnalyticsSummary,
  PdpApiScopeSummary,
  PdpApiStatusSummary,
  PdpApiVersionSummary,
  PdpAuditLogSummary,
  PdpDeveloperAlertSummary,
  PdpDeveloperMonitoringSummary,
  PdpPlatformConfigSummary,
  PdpRateLimitPolicySummary,
  PdpSandboxConfigSummary,
  PdpSdkGenerationRecordSummary,
  PdpWebhookEventTypeSummary,
  UpdatePdpPlatformConfigRequest,
  UpdatePdpSandboxConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  integrationWebhookDeliveries,
  pdpActionDrafts,
  pdpAnalyticsSnapshots,
  pdpApiScopes,
  pdpApiStatusSnapshots,
  pdpApiVersions,
  pdpAuditLogs,
  pdpDeveloperAlerts,
  pdpPlatformConfig,
  pdpRateLimitPolicies,
  pdpSandboxConfig,
  pdpSdkGenerationRecords,
  pdpWebhookEventTypes,
} from '@titan/db';
import type { EnterpriseDeveloperPlatformService } from './enterprise-developer-platform.service.js';
import type { EnterpriseItOperationsService } from './enterprise-it-operations.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { IntegrationApiManagementService } from './integration-api-management.service.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';

export class EnterprisePublicDeveloperPlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterprisePublicDeveloperPlatformError';
  }
}

type StaffScope = { companyId: string; userId: string };

const SYSTEM_API_VERSIONS = [
  { versionKey: 'v1', title: 'TITAN Public API v1', basePath: '/api/v1', description: 'Current stable public API version.' },
];

const SYSTEM_API_SCOPES: Array<{ scopeKey: string; name: string; resourceType: string; description: string }> = [
  { scopeKey: 'customers:read', name: 'Read customers', resourceType: 'customers', description: 'Read customer records.' },
  { scopeKey: 'customers:write', name: 'Write customers', resourceType: 'customers', description: 'Create and update customers.' },
  { scopeKey: 'jobs:read', name: 'Read jobs', resourceType: 'jobs', description: 'Read job records.' },
  { scopeKey: 'jobs:write', name: 'Write jobs', resourceType: 'jobs', description: 'Create and update jobs.' },
  { scopeKey: 'quotes:read', name: 'Read quotes', resourceType: 'quotes', description: 'Read quote records.' },
  { scopeKey: 'quotes:write', name: 'Write quotes', resourceType: 'quotes', description: 'Create and update quotes.' },
  { scopeKey: 'invoices:read', name: 'Read invoices', resourceType: 'invoices', description: 'Read invoice records.' },
  { scopeKey: 'invoices:write', name: 'Write invoices', resourceType: 'invoices', description: 'Create and update invoices.' },
  { scopeKey: 'payments:read', name: 'Read payments', resourceType: 'payments', description: 'Read payment records.' },
  { scopeKey: 'payments:write', name: 'Write payments', resourceType: 'payments', description: 'Create and update payments.' },
  { scopeKey: 'inventory:read', name: 'Read inventory', resourceType: 'inventory', description: 'Read inventory records.' },
  { scopeKey: 'inventory:write', name: 'Write inventory', resourceType: 'inventory', description: 'Update inventory records.' },
  { scopeKey: 'fleet:read', name: 'Read fleet', resourceType: 'fleet', description: 'Read fleet records.' },
  { scopeKey: 'fleet:write', name: 'Write fleet', resourceType: 'fleet', description: 'Update fleet records.' },
  { scopeKey: 'assets:read', name: 'Read assets', resourceType: 'assets', description: 'Read asset records.' },
  { scopeKey: 'assets:write', name: 'Write assets', resourceType: 'assets', description: 'Update asset records.' },
  { scopeKey: 'technicians:read', name: 'Read technicians', resourceType: 'technicians', description: 'Read technician records.' },
  { scopeKey: 'technicians:write', name: 'Write technicians', resourceType: 'technicians', description: 'Update technician records.' },
  { scopeKey: 'scheduling:read', name: 'Read scheduling', resourceType: 'scheduling', description: 'Read scheduling records.' },
  { scopeKey: 'scheduling:write', name: 'Write scheduling', resourceType: 'scheduling', description: 'Update scheduling records.' },
  { scopeKey: 'communications:read', name: 'Read communications', resourceType: 'communications', description: 'Read communication records.' },
  { scopeKey: 'communications:write', name: 'Write communications', resourceType: 'communications', description: 'Send communications.' },
  { scopeKey: 'documents:read', name: 'Read documents', resourceType: 'documents', description: 'Read document records.' },
  { scopeKey: 'documents:write', name: 'Write documents', resourceType: 'documents', description: 'Upload documents.' },
  { scopeKey: 'reports:read', name: 'Read reports', resourceType: 'reports', description: 'Read report data.' },
  { scopeKey: 'ai_agents:read', name: 'Read AI agents', resourceType: 'ai_agents', description: 'Read AI agent runs and tasks.' },
  { scopeKey: 'automations:read', name: 'Read automations', resourceType: 'automations', description: 'Read automation workflows.' },
  { scopeKey: 'automations:write', name: 'Write automations', resourceType: 'automations', description: 'Manage automation workflows.' },
  { scopeKey: 'webhooks:read', name: 'Read webhooks', resourceType: 'webhooks', description: 'Read webhook subscriptions.' },
  { scopeKey: 'webhooks:write', name: 'Write webhooks', resourceType: 'webhooks', description: 'Manage webhook subscriptions.' },
];

const SYSTEM_WEBHOOK_EVENTS: Array<{ eventKey: string; name: string; category: string; description: string }> = [
  { eventKey: 'customer.created', name: 'Customer created', category: 'crm', description: 'A customer record was created.' },
  { eventKey: 'lead.created', name: 'Lead created', category: 'sales', description: 'A lead record was created.' },
  { eventKey: 'quote.accepted', name: 'Quote accepted', category: 'finance', description: 'A quote was accepted.' },
  { eventKey: 'job.booked', name: 'Job booked', category: 'operations', description: 'A job was booked.' },
  { eventKey: 'job.started', name: 'Job started', category: 'operations', description: 'A job was started.' },
  { eventKey: 'job.completed', name: 'Job completed', category: 'operations', description: 'A job was completed.' },
  { eventKey: 'invoice.created', name: 'Invoice created', category: 'finance', description: 'An invoice was created.' },
  { eventKey: 'invoice.paid', name: 'Invoice paid', category: 'finance', description: 'An invoice was paid.' },
  { eventKey: 'payment.failed', name: 'Payment failed', category: 'finance', description: 'A payment failed.' },
  { eventKey: 'inventory.updated', name: 'Inventory updated', category: 'inventory', description: 'Inventory was updated.' },
  { eventKey: 'asset.serviced', name: 'Asset serviced', category: 'assets', description: 'An asset was serviced.' },
  { eventKey: 'technician.assigned', name: 'Technician assigned', category: 'operations', description: 'A technician was assigned.' },
  { eventKey: 'vehicle.event', name: 'Vehicle event', category: 'fleet', description: 'A vehicle event occurred.' },
  { eventKey: 'automation.completed', name: 'Automation completed', category: 'automation', description: 'An automation workflow completed.' },
  { eventKey: 'ai_task.completed', name: 'AI task completed', category: 'ai', description: 'An AI agent task completed.' },
];

type PublicDeveloperDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseItOperationsService: EnterpriseItOperationsService;
  enterpriseDeveloperPlatformService: EnterpriseDeveloperPlatformService;
  integrationApiManagementService: IntegrationApiManagementService;
  integrationPlatformService: IntegrationPlatformService;
  integrationHubService: IntegrationHubService;
};

export class EnterprisePublicDeveloperPlatformService {
  constructor(private readonly deps: PublicDeveloperDeps) {}

  async getDeveloperDashboard(companyId: string) {
    return this.deps.enterpriseDeveloperPlatformService.getDeveloperDashboard(companyId);
  }

  async generateOpenApiSpec(companyId: string) {
    return this.deps.enterpriseDeveloperPlatformService.generateOpenApiSpec(companyId);
  }

  async listWebhookSubscriptions(companyId: string) {
    return this.deps.enterpriseDeveloperPlatformService.listWebhookSubscriptions(companyId);
  }

  async listWebhookDeadLetter(companyId: string) {
    return this.deps.enterpriseDeveloperPlatformService.listWebhookDeadLetter(companyId);
  }

  async listDeveloperApiKeys(companyId: string) {
    return this.deps.integrationApiManagementService.listDeveloperApiKeys(companyId);
  }

  async listOauthApplications(companyId: string) {
    return this.deps.enterpriseDeveloperPlatformService.listOauthApplications(companyId);
  }

  async getDashboard(companyId: string): Promise<EnterprisePublicDeveloperDashboard> {
    await this.ensureSystemCatalog();
    await this.ensurePlatformConfig(companyId);

    const [
      platformConfig,
      legacyDeveloperPlatform,
      apiVersions,
      apiScopes,
      webhookEventTypes,
      alerts,
      analytics,
      apiStatus,
      developerMonitoring,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.getDeveloperDashboard(companyId).catch(() => null),
      this.listApiVersions(),
      this.listApiScopes(),
      this.listWebhookEventTypes(),
      this.listDeveloperAlerts(companyId, { status: 'open' }),
      this.getLatestAnalytics(companyId),
      this.getLatestApiStatus(companyId),
      this.getDeveloperMonitoring(companyId),
    ]);

    void this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId).catch(() => null);

    const overallApiHealthStatus = resolveApiHealthStatus({
      openAlertCount: alerts.length,
      webhookFailureCount: developerMonitoring.webhookFailureCount,
      apiHealth: legacyDeveloperPlatform?.apiHealth.status ?? 'unknown',
    });

    return {
      summary: `${apiVersions.length} API version(s), ${apiScopes.length} scope(s), ${developerMonitoring.webhookSubscriptionCount} webhook subscription(s), ${developerMonitoring.apiKeyCount} API key(s), ${alerts.length} open alert(s).`,
      platformConfig,
      legacyDeveloperPlatform,
      apiVersionCount: apiVersions.length,
      apiScopeCount: apiScopes.length,
      webhookEventTypeCount: webhookEventTypes.length,
      openAlertCount: alerts.length,
      overallApiHealthStatus,
      developerMonitoring,
      analytics,
      apiStatus,
      openapiSpec: legacyDeveloperPlatform?.openapiSpec ?? null,
      apiExplorerEndpoints: legacyDeveloperPlatform?.apiExplorerEndpoints ?? [],
      sdkPackages: legacyDeveloperPlatform?.sdkPackages ?? [],
      webhookSubscriptions: legacyDeveloperPlatform
        ? await this.listWebhookSubscriptions(companyId)
        : [],
      webhookDeadLetter: legacyDeveloperPlatform ? await this.listWebhookDeadLetter(companyId) : [],
      recentAlerts: alerts.slice(0, 10),
      recentSdkGenerations: await this.listSdkGenerationRecords(companyId).then((r) => r.slice(0, 10)),
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterprisePublicDeveloperAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      apiKeyCount: dashboard.developerMonitoring.apiKeyCount,
      webhookSubscriptionCount: dashboard.developerMonitoring.webhookSubscriptionCount,
      webhookFailureCount: dashboard.developerMonitoring.webhookFailureCount,
      openAlertCount: dashboard.openAlertCount,
      sdkPackageCount: dashboard.developerMonitoring.sdkPackageCount,
      overallApiHealthStatus: dashboard.overallApiHealthStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<PdpPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdatePdpPlatformConfigRequest): Promise<PdpPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(pdpPlatformConfig)
      .set({
        apiPolicy: input.apiPolicy ?? existing.apiPolicy,
        webhookPolicy: input.webhookPolicy ?? existing.webhookPolicy,
        authPolicy: input.authPolicy ?? existing.authPolicy,
        rateLimitPolicy: input.rateLimitPolicy ?? existing.rateLimitPolicy,
        sandboxPolicy: input.sandboxPolicy ?? existing.sandboxPolicy,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(pdpPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async getSandboxConfig(companyId: string): Promise<PdpSandboxConfigSummary> {
    return toSandboxConfigSummary(await this.ensureSandboxConfig(companyId));
  }

  async updateSandboxConfig(scope: StaffScope, input: UpdatePdpSandboxConfigRequest): Promise<PdpSandboxConfigSummary> {
    const existing = await this.ensureSandboxConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(pdpSandboxConfig)
      .set({
        enabled: input.enabled ?? existing.enabled,
        sandboxBaseUrl: input.sandboxBaseUrl ?? existing.sandboxBaseUrl,
        testKeyPolicy: input.testKeyPolicy ?? existing.testKeyPolicy,
        webhookTestPolicy: input.webhookTestPolicy ?? existing.webhookTestPolicy,
        config: input.config ?? existing.config,
        updatedAt: new Date(),
      })
      .where(eq(pdpSandboxConfig.companyId, scope.companyId))
      .returning();
    await this.recordAudit(scope, 'sandbox_config_updated');
    return toSandboxConfigSummary(updated!);
  }

  async listApiVersions(): Promise<PdpApiVersionSummary[]> {
    await this.ensureSystemCatalog();
    const rows = await this.deps.db.query.pdpApiVersions.findMany({
      where: isNull(pdpApiVersions.companyId),
      orderBy: [desc(pdpApiVersions.createdAt)],
    });
    return rows.map(toApiVersionSummary);
  }

  async listApiScopes(): Promise<PdpApiScopeSummary[]> {
    await this.ensureSystemCatalog();
    const rows = await this.deps.db.query.pdpApiScopes.findMany({
      where: isNull(pdpApiScopes.companyId),
      orderBy: [desc(pdpApiScopes.createdAt)],
    });
    return rows.map(toApiScopeSummary);
  }

  async listWebhookEventTypes(): Promise<PdpWebhookEventTypeSummary[]> {
    await this.ensureSystemCatalog();
    const rows = await this.deps.db.query.pdpWebhookEventTypes.findMany({
      where: isNull(pdpWebhookEventTypes.companyId),
      orderBy: [desc(pdpWebhookEventTypes.createdAt)],
    });
    return rows.map(toWebhookEventTypeSummary);
  }

  async listRateLimitPolicies(companyId: string): Promise<PdpRateLimitPolicySummary[]> {
    const rows = await this.deps.db.query.pdpRateLimitPolicies.findMany({
      where: eq(pdpRateLimitPolicies.companyId, companyId),
      orderBy: [desc(pdpRateLimitPolicies.createdAt)],
    });
    return rows.map(toRateLimitPolicySummary);
  }

  async createRateLimitPolicy(scope: StaffScope, input: CreatePdpRateLimitPolicyRequest): Promise<PdpRateLimitPolicySummary> {
    const [created] = await this.deps.db
      .insert(pdpRateLimitPolicies)
      .values({
        companyId: scope.companyId,
        policyKey: input.policyKey,
        name: input.name,
        tenantLimitPerMinute: input.tenantLimitPerMinute ?? null,
        applicationLimitPerMinute: input.applicationLimitPerMinute ?? null,
        burstLimit: input.burstLimit ?? null,
        config: input.config ?? {},
        workflowStatus: 'published',
      })
      .returning();
    await this.recordAudit(scope, 'rate_limit_policy_created', 'rate_limit_policy', created!.id);
    return toRateLimitPolicySummary(created!);
  }

  async generateSdk(scope: StaffScope, input: GeneratePdpSdkRequest): Promise<PdpSdkGenerationRecordSummary> {
    const sdk = await this.deps.enterpriseDeveloperPlatformService.generateSdkPackage(scope.companyId, {
      language: input.language,
    });
    const [record] = await this.deps.db
      .insert(pdpSdkGenerationRecords)
      .values({
        companyId: scope.companyId,
        language: sdk.language,
        version: sdk.version,
        packageName: sdk.packageName,
        openapiVersion: '1.0.0',
        sdkPackageId: sdk.id,
        manifest: sdk.manifest,
      })
      .returning();
    await this.recordAudit(scope, 'sdk_generated', 'sdk_generation_record', record!.id, { language: input.language });
    return toSdkGenerationRecordSummary(record!);
  }

  async listSdkGenerationRecords(companyId: string): Promise<PdpSdkGenerationRecordSummary[]> {
    const rows = await this.deps.db.query.pdpSdkGenerationRecords.findMany({
      where: eq(pdpSdkGenerationRecords.companyId, companyId),
      orderBy: [desc(pdpSdkGenerationRecords.generatedAt)],
    });
    return rows.map(toSdkGenerationRecordSummary);
  }

  async captureApiStatus(scope: StaffScope): Promise<PdpApiStatusSummary> {
    const legacy = await this.getDeveloperDashboard(scope.companyId);
    const [snapshot] = await this.deps.db
      .insert(pdpApiStatusSnapshots)
      .values({
        companyId: scope.companyId,
        overallStatus: legacy.apiHealth.status,
        apiAvailability: legacy.apiHealth.status === 'healthy' ? 'available' : 'degraded',
        webhookHealth: legacy.webhookDeadLetterCount > 0 ? 'degraded' : 'healthy',
        sdkStatus: legacy.sdkPackages.length > 0 ? 'available' : 'pending',
        metrics: {
          apiRequestCount: legacy.analytics.apiRequestCount,
          apiErrorCount: legacy.analytics.apiErrorCount,
          webhookDeliveryCount: legacy.analytics.webhookDeliveryCount,
          webhookFailureCount: legacy.analytics.webhookFailureCount,
        },
      })
      .returning();
    await this.recordAudit(scope, 'api_status_captured');
    return toApiStatusSummary(snapshot!);
  }

  async syncDeveloperAlerts(scope: StaffScope): Promise<PdpDeveloperAlertSummary[]> {
    const companyId = scope.companyId;
    const [legacy, deadLetter, rateLimits] = await Promise.all([
      this.getDeveloperDashboard(companyId),
      this.listWebhookDeadLetter(companyId),
      this.listRateLimitPolicies(companyId),
    ]);

    if (deadLetter.length > 0) {
      await this.upsertDeveloperAlert(companyId, {
        alertType: 'webhook_delivery_failure',
        severity: deadLetter.length > 5 ? 'critical' : 'warning',
        title: 'Webhook delivery failures detected',
        description: `${deadLetter.length} webhook delivery failure(s) in dead letter queue.`,
      });
    }

    if (legacy.analytics.apiErrorCount > 0) {
      await this.upsertDeveloperAlert(companyId, {
        alertType: 'api_error_rate',
        severity: legacy.analytics.apiErrorCount > 10 ? 'critical' : 'warning',
        title: 'API errors detected',
        description: `${legacy.analytics.apiErrorCount} API error(s) recorded in analytics.`,
      });
    }

    if (legacy.apiHealth.status !== 'healthy') {
      await this.upsertDeveloperAlert(companyId, {
        alertType: 'api_health_degraded',
        severity: 'warning',
        title: 'API health degraded',
        description: `API health status: ${legacy.apiHealth.status}.`,
      });
    }

    if (rateLimits.length === 0) {
      await this.upsertDeveloperAlert(companyId, {
        alertType: 'rate_limit_policy_missing',
        severity: 'info',
        title: 'No rate limit policies configured',
        description: 'Configure tenant and application rate limits for abuse protection.',
      });
    }

    return this.listDeveloperAlerts(companyId, { status: 'open' });
  }

  async captureAnalytics(scope: StaffScope): Promise<PdpAnalyticsSummary> {
    const legacy = await this.getDeveloperDashboard(scope.companyId);
    const apiKeys = await this.listDeveloperApiKeys(scope.companyId);
    const metrics: Record<string, unknown> = {
      apiRequestCount: legacy.analytics.apiRequestCount,
      apiErrorCount: legacy.analytics.apiErrorCount,
      webhookDeliveryCount: legacy.analytics.webhookDeliveryCount,
      webhookFailureCount: legacy.analytics.webhookFailureCount,
      apiKeyCount: apiKeys.length,
      webhookSubscriptionCount: legacy.webhookSubscriptionCount,
      sdkPackageCount: legacy.sdkPackages.length,
      capturedAt: new Date().toISOString(),
    };
    const [snapshot] = await this.deps.db
      .insert(pdpAnalyticsSnapshots)
      .values({ companyId: scope.companyId, metrics })
      .returning();
    await this.recordAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(snapshot!);
  }

  async getDeveloperMonitoring(companyId: string): Promise<PdpDeveloperMonitoringSummary> {
    const [legacy, apiKeys, deadLetter, alerts, sandbox, sdkRecords] = await Promise.all([
      this.getDeveloperDashboard(companyId),
      this.listDeveloperApiKeys(companyId),
      this.listWebhookDeadLetter(companyId),
      this.listDeveloperAlerts(companyId, { status: 'open' }),
      this.getSandboxConfig(companyId),
      this.listSdkGenerationRecords(companyId),
    ]);

    const alertMessages: string[] = [];
    if (deadLetter.length > 0) alertMessages.push(`${deadLetter.length} webhook failure(s)`);
    if (legacy.analytics.apiErrorCount > 0) alertMessages.push(`${legacy.analytics.apiErrorCount} API error(s)`);
    if (legacy.apiHealth.status !== 'healthy') alertMessages.push(`API health: ${legacy.apiHealth.status}`);

    return {
      apiKeyCount: apiKeys.length,
      webhookSubscriptionCount: legacy.webhookSubscriptionCount,
      webhookFailureCount: deadLetter.length,
      openAlertCount: alerts.length,
      sdkPackageCount: Math.max(legacy.sdkPackages.length, sdkRecords.length),
      sandboxEnabled: sandbox.enabled,
      alerts: alertMessages,
    };
  }

  async listDeveloperAlerts(companyId: string, filters?: { status?: string }): Promise<PdpDeveloperAlertSummary[]> {
    const rows = await this.deps.db.query.pdpDeveloperAlerts.findMany({
      where: filters?.status
        ? and(eq(pdpDeveloperAlerts.companyId, companyId), eq(pdpDeveloperAlerts.status, filters.status as never))
        : eq(pdpDeveloperAlerts.companyId, companyId),
      orderBy: [desc(pdpDeveloperAlerts.createdAt)],
    });
    return rows.map(toDeveloperAlertSummary);
  }

  async acknowledgeDeveloperAlert(scope: StaffScope, alertId: string): Promise<PdpDeveloperAlertSummary> {
    await this.ensureDeveloperAlert(scope.companyId, alertId);
    const [updated] = await this.deps.db
      .update(pdpDeveloperAlerts)
      .set({ status: 'acknowledged', updatedAt: new Date() })
      .where(eq(pdpDeveloperAlerts.id, alertId))
      .returning();
    await this.recordAudit(scope, 'alert_acknowledged', 'developer_alert', alertId);
    return toDeveloperAlertSummary(updated!);
  }

  async createActionDraft(scope: StaffScope, input: CreatePdpActionDraftRequest): Promise<PdpActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(pdpActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType,
        title: input.title,
        content: input.content,
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'action_draft_created', 'action_draft', created!.id);
    return toActionDraftSummary(created!);
  }

  async listActionDrafts(companyId: string): Promise<PdpActionDraftSummary[]> {
    const rows = await this.deps.db.query.pdpActionDrafts.findMany({
      where: eq(pdpActionDrafts.companyId, companyId),
      orderBy: [desc(pdpActionDrafts.createdAt)],
    });
    return rows.map(toActionDraftSummary);
  }

  async listAuditLogs(companyId: string, limit = 100): Promise<PdpAuditLogSummary[]> {
    const rows = await this.deps.db.query.pdpAuditLogs.findMany({
      where: eq(pdpAuditLogs.companyId, companyId),
      orderBy: [desc(pdpAuditLogs.createdAt)],
      limit,
    });
    return rows.map(toAuditLogSummary);
  }

  async listWebhookDeliveryHistory(companyId: string, limit = 50) {
    const rows = await this.deps.db.query.integrationWebhookDeliveries.findMany({
      where: eq(integrationWebhookDeliveries.companyId, companyId),
      orderBy: [desc(integrationWebhookDeliveries.createdAt)],
      limit,
    });
    return rows.map((row) => ({
      id: row.id,
      webhookEndpointId: row.webhookEndpointId,
      eventType: row.eventType,
      status: row.status,
      attempts: row.attempts,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async ensureSystemCatalog() {
    for (const version of SYSTEM_API_VERSIONS) {
      const existing = await this.deps.db.query.pdpApiVersions.findFirst({
        where: and(isNull(pdpApiVersions.companyId), eq(pdpApiVersions.versionKey, version.versionKey)),
      });
      if (existing) continue;
      await this.deps.db.insert(pdpApiVersions).values({
        companyId: null,
        versionKey: version.versionKey,
        title: version.title,
        description: version.description,
        basePath: version.basePath,
        status: 'published',
      });
    }

    for (const scope of SYSTEM_API_SCOPES) {
      const existing = await this.deps.db.query.pdpApiScopes.findFirst({
        where: and(isNull(pdpApiScopes.companyId), eq(pdpApiScopes.scopeKey, scope.scopeKey)),
      });
      if (existing) continue;
      await this.deps.db.insert(pdpApiScopes).values({
        companyId: null,
        scopeKey: scope.scopeKey,
        name: scope.name,
        description: scope.description,
        resourceType: scope.resourceType,
        permissions: [scope.scopeKey],
        isSystemScope: true,
      });
    }

    for (const event of SYSTEM_WEBHOOK_EVENTS) {
      const existing = await this.deps.db.query.pdpWebhookEventTypes.findFirst({
        where: and(isNull(pdpWebhookEventTypes.companyId), eq(pdpWebhookEventTypes.eventKey, event.eventKey)),
      });
      if (existing) continue;
      await this.deps.db.insert(pdpWebhookEventTypes).values({
        companyId: null,
        eventKey: event.eventKey,
        name: event.name,
        description: event.description,
        category: event.category,
        isSystemEvent: true,
      });
    }
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.pdpPlatformConfig.findFirst({
      where: eq(pdpPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(pdpPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureSandboxConfig(companyId: string) {
    const existing = await this.deps.db.query.pdpSandboxConfig.findFirst({
      where: eq(pdpSandboxConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(pdpSandboxConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureDeveloperAlert(companyId: string, alertId: string) {
    const row = await this.deps.db.query.pdpDeveloperAlerts.findFirst({
      where: and(eq(pdpDeveloperAlerts.id, alertId), eq(pdpDeveloperAlerts.companyId, companyId)),
    });
    if (!row) throw new EnterprisePublicDeveloperPlatformError('NOT_FOUND', 'Developer alert not found');
    return row;
  }

  private async getLatestAnalytics(companyId: string): Promise<PdpAnalyticsSummary | null> {
    const row = await this.deps.db.query.pdpAnalyticsSnapshots.findFirst({
      where: eq(pdpAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(pdpAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async getLatestApiStatus(companyId: string): Promise<PdpApiStatusSummary | null> {
    const row = await this.deps.db.query.pdpApiStatusSnapshots.findFirst({
      where: eq(pdpApiStatusSnapshots.companyId, companyId),
      orderBy: [desc(pdpApiStatusSnapshots.capturedAt)],
    });
    return row ? toApiStatusSummary(row) : null;
  }

  private async upsertDeveloperAlert(
    companyId: string,
    input: { alertType: string; severity: 'info' | 'warning' | 'critical'; title: string; description: string },
  ): Promise<PdpDeveloperAlertSummary> {
    const existing = await this.deps.db.query.pdpDeveloperAlerts.findFirst({
      where: and(
        eq(pdpDeveloperAlerts.companyId, companyId),
        eq(pdpDeveloperAlerts.alertType, input.alertType),
        eq(pdpDeveloperAlerts.status, 'open'),
      ),
    });
    if (existing) {
      const [updated] = await this.deps.db
        .update(pdpDeveloperAlerts)
        .set({ title: input.title, description: input.description, severity: input.severity, updatedAt: new Date() })
        .where(eq(pdpDeveloperAlerts.id, existing.id))
        .returning();
      return toDeveloperAlertSummary(updated!);
    }
    const [created] = await this.deps.db
      .insert(pdpDeveloperAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description,
        sourceModule: 'public_developer_platform',
        status: 'open',
      })
      .returning();
    return toDeveloperAlertSummary(created!);
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(pdpAuditLogs).values({
      companyId: scope.companyId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      userId: scope.userId,
      metadata: metadata ?? {},
    });
  }
}

function resolveApiHealthStatus(input: {
  openAlertCount: number;
  webhookFailureCount: number;
  apiHealth: string;
}): string {
  if (input.openAlertCount > 3 || input.webhookFailureCount > 5) return 'critical';
  if (input.openAlertCount > 0 || input.webhookFailureCount > 0 || input.apiHealth !== 'healthy') return 'degraded';
  return 'healthy';
}

function toPlatformConfigSummary(row: typeof pdpPlatformConfig.$inferSelect): PdpPlatformConfigSummary {
  return {
    apiPolicy: row.apiPolicy ?? {},
    webhookPolicy: row.webhookPolicy ?? {},
    authPolicy: row.authPolicy ?? {},
    rateLimitPolicy: row.rateLimitPolicy ?? {},
    sandboxPolicy: row.sandboxPolicy ?? {},
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toSandboxConfigSummary(row: typeof pdpSandboxConfig.$inferSelect): PdpSandboxConfigSummary {
  return {
    enabled: row.enabled,
    sandboxBaseUrl: row.sandboxBaseUrl,
    testKeyPolicy: row.testKeyPolicy ?? {},
    webhookTestPolicy: row.webhookTestPolicy ?? {},
    config: row.config ?? {},
  };
}

function toApiVersionSummary(row: typeof pdpApiVersions.$inferSelect): PdpApiVersionSummary {
  return {
    id: row.id,
    versionKey: row.versionKey,
    title: row.title,
    description: row.description,
    basePath: row.basePath,
    status: row.status,
    deprecatedAt: row.deprecatedAt?.toISOString() ?? null,
    sunsetAt: row.sunsetAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toApiScopeSummary(row: typeof pdpApiScopes.$inferSelect): PdpApiScopeSummary {
  return {
    id: row.id,
    scopeKey: row.scopeKey,
    name: row.name,
    description: row.description,
    resourceType: row.resourceType,
    permissions: row.permissions ?? [],
    isSystemScope: row.isSystemScope,
  };
}

function toWebhookEventTypeSummary(row: typeof pdpWebhookEventTypes.$inferSelect): PdpWebhookEventTypeSummary {
  return {
    id: row.id,
    eventKey: row.eventKey,
    name: row.name,
    description: row.description,
    category: row.category,
    isSystemEvent: row.isSystemEvent,
  };
}

function toRateLimitPolicySummary(row: typeof pdpRateLimitPolicies.$inferSelect): PdpRateLimitPolicySummary {
  return {
    id: row.id,
    policyKey: row.policyKey,
    name: row.name,
    tenantLimitPerMinute: row.tenantLimitPerMinute,
    applicationLimitPerMinute: row.applicationLimitPerMinute,
    burstLimit: row.burstLimit,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSdkGenerationRecordSummary(row: typeof pdpSdkGenerationRecords.$inferSelect): PdpSdkGenerationRecordSummary {
  return {
    id: row.id,
    language: row.language,
    version: row.version,
    packageName: row.packageName,
    openapiVersion: row.openapiVersion,
    generatedAt: row.generatedAt.toISOString(),
  };
}

function toApiStatusSummary(row: typeof pdpApiStatusSnapshots.$inferSelect): PdpApiStatusSummary {
  return {
    id: row.id,
    overallStatus: row.overallStatus,
    apiAvailability: row.apiAvailability,
    webhookHealth: row.webhookHealth,
    sdkStatus: row.sdkStatus,
    metrics: row.metrics ?? {},
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toDeveloperAlertSummary(row: typeof pdpDeveloperAlerts.$inferSelect): PdpDeveloperAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof pdpActionDrafts.$inferSelect): PdpActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof pdpAuditLogs.$inferSelect): PdpAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof pdpAnalyticsSnapshots.$inferSelect): PdpAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics ?? {},
    capturedAt: row.capturedAt.toISOString(),
  };
}
