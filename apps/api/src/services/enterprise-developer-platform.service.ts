import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import type {
  CreateDeveloperExtensionRequest,
  CreateDeveloperOauthApplicationRequest,
  CreateDeveloperPersonalTokenRequest,
  CreateDeveloperPlatformActionRequest,
  CreateDeveloperServiceAccountRequest,
  CreateDeveloperWebhookSubscriptionRequest,
  DeveloperAnalyticsSummary,
  DeveloperApiChangelogEntry,
  DeveloperExtensionSummary,
  DeveloperMarketplaceListingSummary,
  DeveloperOauthApplicationDetail,
  DeveloperOauthApplicationSummary,
  DeveloperOpenApiSpecDetail,
  DeveloperPersonalAccessTokenDetail,
  DeveloperPersonalAccessTokenSummary,
  DeveloperPlatformActionSummary,
  DeveloperSdkPackageDetail,
  DeveloperSdkPackageSummary,
  DeveloperServiceAccountDetail,
  DeveloperServiceAccountSummary,
  DeveloperWebhookDeadLetterSummary,
  DeveloperWebhookSubscriptionDetail,
  DeveloperWebhookSubscriptionSummary,
  EnterpriseDeveloperPlatformAuraContext,
  EnterpriseDeveloperPlatformDashboard,
  GenerateDeveloperSdkRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  developerPlatformActions,
  developerPlatformAnalyticsSnapshots,
  developerPlatformApiChangelog,
  developerPlatformAuthAuditLog,
  developerPlatformExtensions,
  developerPlatformMarketplaceListings,
  developerPlatformOauthApplications,
  developerPlatformOpenapiSpecs,
  developerPlatformPersonalAccessTokens,
  developerPlatformSdkPackages,
  developerPlatformServiceAccounts,
  developerPlatformWebhookDeadLetter,
  developerPlatformWebhookSubscriptions,
  integrationWebhookDeliveries,
} from '@titan/db';
import { generateDeveloperApiKey, hashApiKey } from '../lib/crypto.js';
import {
  buildDefaultChangelog,
  buildOpenApiSpec,
  TITAN_API_EXPLORER_ENDPOINTS,
} from '../lib/developer-openapi.js';
import {
  buildSdkManifest,
  generateSdkExampleCode,
  getSdkPackageName,
} from '../lib/developer-sdk-templates.js';
import type { ConnectorEngineService } from './connector-engine.service.js';
import type { IntegrationApiManagementService } from './integration-api-management.service.js';
import type { IntegrationHubService } from './integration-hub.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';

export class EnterpriseDeveloperPlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseDeveloperPlatformError';
  }
}

type StaffScope = { companyId: string; userId: string };

type EnterpriseDeveloperPlatformDeps = {
  db: DatabaseClient;
  integrationApiManagementService: IntegrationApiManagementService;
  integrationPlatformService: IntegrationPlatformService;
  integrationHubService: IntegrationHubService;
  connectorEngineService: ConnectorEngineService;
  apiPublicUrl: string;
};

export class EnterpriseDeveloperPlatformService {
  constructor(private readonly deps: EnterpriseDeveloperPlatformDeps) {}

  async getDeveloperDashboard(companyId: string): Promise<EnterpriseDeveloperPlatformDashboard> {
    await this.seedChangelogIfEmpty(companyId);
    const [
      analytics,
      installedExtensions,
      marketplaceListings,
      apiKeys,
      personalTokens,
      serviceAccounts,
      oauthApps,
      webhookSubscriptions,
      deadLetter,
      sdkPackages,
      changelog,
      openapiSpec,
      pendingActions,
      apiHealth,
    ] = await Promise.all([
      this.getAnalytics(companyId),
      this.listInstalledExtensions(companyId),
      this.listMarketplaceListings(companyId, 'published'),
      this.deps.integrationApiManagementService.listDeveloperApiKeys(companyId),
      this.listPersonalAccessTokens(companyId),
      this.listServiceAccounts(companyId),
      this.listOauthApplications(companyId),
      this.listWebhookSubscriptions(companyId),
      this.listWebhookDeadLetter(companyId),
      this.listSdkPackages(companyId),
      this.listChangelog(companyId),
      this.getLatestOpenApiSpec(companyId),
      this.listPlatformActions(companyId, 'pending_approval'),
      this.getApiHealth(companyId),
    ]);

    return {
      summary: `Developer platform live — ${installedExtensions.length} installed extension(s), ${apiKeys.length} API key(s), ${webhookSubscriptions.length} webhook subscription(s), ${sdkPackages.length} SDK package(s).`,
      apiHealth,
      analytics,
      installedExtensions,
      marketplaceListings,
      apiKeysCount: apiKeys.length,
      personalTokenCount: personalTokens.length,
      serviceAccountCount: serviceAccounts.length,
      oauthAppCount: oauthApps.length,
      webhookSubscriptionCount: webhookSubscriptions.length,
      webhookDeadLetterCount: deadLetter.length,
      sdkPackages,
      changelog,
      openapiSpec,
      apiExplorerEndpoints: TITAN_API_EXPLORER_ENDPOINTS,
      pendingActionCount: pendingActions.length,
    };
  }

  async buildDeveloperAuraContext(
    companyId: string,
  ): Promise<EnterpriseDeveloperPlatformAuraContext> {
    const dashboard = await this.getDeveloperDashboard(companyId);
    return {
      summary: dashboard.summary,
      apiRequestCount: dashboard.analytics.apiRequestCount,
      installedExtensionCount: dashboard.installedExtensions.length,
      webhookSubscriptionCount: dashboard.webhookSubscriptionCount,
      pendingActionCount: dashboard.pendingActionCount,
      sdkPackageCount: dashboard.sdkPackages.length,
    };
  }

  async generateOpenApiSpec(companyId: string): Promise<DeveloperOpenApiSpecDetail> {
    const spec = buildOpenApiSpec(this.deps.apiPublicUrl);
    const [row] = await this.deps.db
      .insert(developerPlatformOpenapiSpecs)
      .values({ companyId, version: '1.0.0', title: 'TITAN Business OS API', spec })
      .returning();
    return {
      id: row!.id,
      version: row!.version,
      title: row!.title,
      generatedAt: row!.generatedAt.toISOString(),
      spec: row!.spec as Record<string, unknown>,
    };
  }

  async generateSdkPackage(
    companyId: string,
    input: GenerateDeveloperSdkRequest,
  ): Promise<DeveloperSdkPackageDetail> {
    const version = '1.0.0';
    const manifest = buildSdkManifest(input.language, version);
    const exampleCode = generateSdkExampleCode(input.language, this.deps.apiPublicUrl);
    const [row] = await this.deps.db
      .insert(developerPlatformSdkPackages)
      .values({
        companyId,
        language: input.language,
        version,
        packageName: getSdkPackageName(input.language),
        manifest: { ...manifest, exampleCode },
      })
      .returning();
    await this.captureAnalyticsSnapshot(companyId);
    return {
      id: row!.id,
      language: row!.language,
      version: row!.version,
      packageName: row!.packageName,
      generatedAt: row!.generatedAt.toISOString(),
      manifest: row!.manifest as Record<string, unknown>,
      exampleCode,
    };
  }

  async seedChangelogIfEmpty(companyId: string): Promise<DeveloperApiChangelogEntry[]> {
    const existing = await this.listChangelog(companyId);
    if (existing.length > 0) return existing;
    for (const entry of buildDefaultChangelog()) {
      await this.deps.db.insert(developerPlatformApiChangelog).values({
        companyId,
        version: entry.version,
        title: entry.title,
        description: entry.description,
        changeType: entry.changeType,
        releasedAt: entry.releasedAt,
      });
    }
    return this.listChangelog(companyId);
  }

  async createExtension(
    scope: StaffScope,
    input: CreateDeveloperExtensionRequest,
  ): Promise<DeveloperExtensionSummary> {
    const [row] = await this.deps.db
      .insert(developerPlatformExtensions)
      .values({
        companyId: scope.companyId,
        extensionKey: input.extensionKey,
        name: input.name,
        description: input.description,
        extensionType: input.extensionType,
        permissions: input.permissions ?? [],
        manifest: input.manifest ?? {},
        createdByUserId: scope.userId,
      })
      .returning();
    return toExtensionSummary(row!);
  }

  async listInstalledExtensions(companyId: string): Promise<DeveloperExtensionSummary[]> {
    const rows = await this.deps.db.query.developerPlatformExtensions.findMany({
      where: and(
        eq(developerPlatformExtensions.companyId, companyId),
        inArray(developerPlatformExtensions.status, ['installed', 'approved']),
      ),
      orderBy: [desc(developerPlatformExtensions.updatedAt)],
    });
    return rows.map(toExtensionSummary);
  }

  async listExtensions(companyId: string): Promise<DeveloperExtensionSummary[]> {
    const rows = await this.deps.db.query.developerPlatformExtensions.findMany({
      where: eq(developerPlatformExtensions.companyId, companyId),
      orderBy: [desc(developerPlatformExtensions.updatedAt)],
    });
    return rows.map(toExtensionSummary);
  }

  async installExtension(
    scope: StaffScope,
    extensionId: string,
  ): Promise<DeveloperExtensionSummary> {
    const extension = await this.ensureExtension(scope.companyId, extensionId);
    const [updated] = await this.deps.db
      .update(developerPlatformExtensions)
      .set({ status: 'installed', installedAt: new Date(), updatedAt: new Date() })
      .where(eq(developerPlatformExtensions.id, extension.id))
      .returning();
    await this.recordAuthAudit(scope, {
      tokenType: 'api_key',
      actionType: 'extension_installed',
      subject: extension.name,
    });
    return toExtensionSummary(updated!);
  }

  async listMarketplaceListings(
    companyId: string,
    status?: DeveloperMarketplaceListingSummary['status'],
  ): Promise<DeveloperMarketplaceListingSummary[]> {
    const rows = await this.deps.db.query.developerPlatformMarketplaceListings.findMany({
      where: status
        ? and(
            eq(developerPlatformMarketplaceListings.companyId, companyId),
            eq(developerPlatformMarketplaceListings.status, status),
          )
        : eq(developerPlatformMarketplaceListings.companyId, companyId),
      orderBy: [desc(developerPlatformMarketplaceListings.updatedAt)],
    });
    return rows.map(toMarketplaceSummary);
  }

  async createWebhookSubscription(
    scope: StaffScope,
    input: CreateDeveloperWebhookSubscriptionRequest,
  ): Promise<DeveloperWebhookSubscriptionDetail> {
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const [row] = await this.deps.db
      .insert(developerPlatformWebhookSubscriptions)
      .values({
        companyId: scope.companyId,
        name: input.name,
        targetUrl: input.targetUrl,
        eventTypes: input.eventTypes,
        secretHash: hashApiKey(secret),
        secretPrefix: secret.slice(0, 12),
        maxRetries: input.maxRetries ?? 3,
        createdByUserId: scope.userId,
      })
      .returning();
    await this.recordAuthAudit(scope, {
      tokenType: 'api_key',
      actionType: 'webhook_subscription_created',
      subject: input.name,
    });
    return { ...toWebhookSubscriptionSummary(row!), secret };
  }

  async listWebhookSubscriptions(
    companyId: string,
  ): Promise<DeveloperWebhookSubscriptionSummary[]> {
    const rows = await this.deps.db.query.developerPlatformWebhookSubscriptions.findMany({
      where: eq(developerPlatformWebhookSubscriptions.companyId, companyId),
      orderBy: [desc(developerPlatformWebhookSubscriptions.createdAt)],
    });
    return rows.map(toWebhookSubscriptionSummary);
  }

  async listWebhookDeadLetter(companyId: string): Promise<DeveloperWebhookDeadLetterSummary[]> {
    const [platformRows, hubRows] = await Promise.all([
      this.deps.db.query.developerPlatformWebhookDeadLetter.findMany({
        where: eq(developerPlatformWebhookDeadLetter.companyId, companyId),
        orderBy: [desc(developerPlatformWebhookDeadLetter.failedAt)],
        limit: 50,
      }),
      this.deps.db.query.integrationWebhookDeliveries.findMany({
        where: and(
          eq(integrationWebhookDeliveries.companyId, companyId),
          eq(integrationWebhookDeliveries.status, 'dead_letter'),
        ),
        orderBy: [desc(integrationWebhookDeliveries.updatedAt)],
        limit: 50,
      }),
    ]);
    return [
      ...platformRows.map((row) => ({
        id: row.id,
        subscriptionId: row.subscriptionId,
        eventType: row.eventType,
        payloadSummary: row.payloadSummary,
        errorMessage: row.errorMessage,
        attempts: row.attempts,
        failedAt: row.failedAt.toISOString(),
      })),
      ...hubRows.map((row) => ({
        id: row.id,
        subscriptionId: row.webhookEndpointId,
        eventType: row.eventType,
        payloadSummary: row.payloadSummary,
        errorMessage: row.errorMessage,
        attempts: row.attempts,
        failedAt: row.updatedAt.toISOString(),
      })),
    ].slice(0, 50);
  }

  async replayWebhookDelivery(companyId: string, deliveryId: string) {
    return this.deps.integrationApiManagementService.replayWebhookDelivery(companyId, deliveryId);
  }

  async createOauthApplication(
    scope: StaffScope,
    input: CreateDeveloperOauthApplicationRequest,
  ): Promise<DeveloperOauthApplicationDetail> {
    const clientId = `titan_app_${randomUUID().replace(/-/g, '')}`;
    const clientSecret = `titan_secret_${randomBytes(32).toString('hex')}`;
    const [row] = await this.deps.db
      .insert(developerPlatformOauthApplications)
      .values({
        companyId: scope.companyId,
        name: input.name,
        clientId,
        clientSecretHash: hashApiKey(clientSecret),
        redirectUris: input.redirectUris,
        scopes: input.scopes ?? [],
        createdByUserId: scope.userId,
      })
      .returning();
    await this.recordAuthAudit(scope, {
      tokenType: 'api_key',
      actionType: 'oauth_app_created',
      subject: input.name,
    });
    return { ...toOauthApplicationSummary(row!), clientSecret };
  }

  async listOauthApplications(companyId: string): Promise<DeveloperOauthApplicationSummary[]> {
    const rows = await this.deps.db.query.developerPlatformOauthApplications.findMany({
      where: and(
        eq(developerPlatformOauthApplications.companyId, companyId),
        isNull(developerPlatformOauthApplications.revokedAt),
      ),
      orderBy: [desc(developerPlatformOauthApplications.createdAt)],
    });
    return rows.map(toOauthApplicationSummary);
  }

  async createPersonalAccessToken(
    scope: StaffScope,
    input: CreateDeveloperPersonalTokenRequest,
  ): Promise<DeveloperPersonalAccessTokenDetail> {
    const token = generateDeveloperApiKey().replace('titan_sk_', 'titan_pat_');
    const [row] = await this.deps.db
      .insert(developerPlatformPersonalAccessTokens)
      .values({
        companyId: scope.companyId,
        name: input.name,
        tokenPrefix: token.slice(0, 16),
        tokenHash: hashApiKey(token),
        scopes: input.scopes ?? [],
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdByUserId: scope.userId,
      })
      .returning();
    await this.recordAuthAudit(scope, {
      tokenType: 'personal_token',
      actionType: 'token_created',
      subject: input.name,
    });
    return { ...toPersonalTokenSummary(row!), token };
  }

  async listPersonalAccessTokens(
    companyId: string,
  ): Promise<DeveloperPersonalAccessTokenSummary[]> {
    const rows = await this.deps.db.query.developerPlatformPersonalAccessTokens.findMany({
      where: and(
        eq(developerPlatformPersonalAccessTokens.companyId, companyId),
        isNull(developerPlatformPersonalAccessTokens.revokedAt),
      ),
      orderBy: [desc(developerPlatformPersonalAccessTokens.createdAt)],
    });
    return rows.map(toPersonalTokenSummary);
  }

  async revokePersonalAccessToken(
    scope: StaffScope,
    tokenId: string,
  ): Promise<DeveloperPersonalAccessTokenSummary> {
    const row = await this.ensurePersonalToken(scope.companyId, tokenId);
    const [updated] = await this.deps.db
      .update(developerPlatformPersonalAccessTokens)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(developerPlatformPersonalAccessTokens.id, row.id))
      .returning();
    await this.recordAuthAudit(scope, {
      tokenType: 'personal_token',
      actionType: 'token_revoked',
      subject: row.name,
    });
    return toPersonalTokenSummary(updated!);
  }

  async createServiceAccount(
    scope: StaffScope,
    input: CreateDeveloperServiceAccountRequest,
  ): Promise<DeveloperServiceAccountDetail> {
    const token = generateDeveloperApiKey().replace('titan_sk_', 'titan_sa_');
    const [row] = await this.deps.db
      .insert(developerPlatformServiceAccounts)
      .values({
        companyId: scope.companyId,
        name: input.name,
        description: input.description ?? null,
        tokenPrefix: token.slice(0, 16),
        tokenHash: hashApiKey(token),
        scopes: input.scopes ?? [],
        createdByUserId: scope.userId,
      })
      .returning();
    await this.recordAuthAudit(scope, {
      tokenType: 'service_account',
      actionType: 'service_account_created',
      subject: input.name,
    });
    return { ...toServiceAccountSummary(row!), token };
  }

  async listServiceAccounts(companyId: string): Promise<DeveloperServiceAccountSummary[]> {
    const rows = await this.deps.db.query.developerPlatformServiceAccounts.findMany({
      where: and(
        eq(developerPlatformServiceAccounts.companyId, companyId),
        isNull(developerPlatformServiceAccounts.revokedAt),
      ),
      orderBy: [desc(developerPlatformServiceAccounts.createdAt)],
    });
    return rows.map(toServiceAccountSummary);
  }

  async listSdkPackages(companyId: string): Promise<DeveloperSdkPackageSummary[]> {
    const rows = await this.deps.db.query.developerPlatformSdkPackages.findMany({
      where: eq(developerPlatformSdkPackages.companyId, companyId),
      orderBy: [desc(developerPlatformSdkPackages.generatedAt)],
    });
    return rows.map(toSdkPackageSummary);
  }

  async listChangelog(companyId: string): Promise<DeveloperApiChangelogEntry[]> {
    const rows = await this.deps.db.query.developerPlatformApiChangelog.findMany({
      where: eq(developerPlatformApiChangelog.companyId, companyId),
      orderBy: [desc(developerPlatformApiChangelog.releasedAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      title: row.title,
      description: row.description,
      changeType: row.changeType,
      releasedAt: row.releasedAt.toISOString(),
    }));
  }

  async listPlatformActions(
    companyId: string,
    status?: DeveloperPlatformActionSummary['status'],
  ): Promise<DeveloperPlatformActionSummary[]> {
    const rows = await this.deps.db.query.developerPlatformActions.findMany({
      where: status
        ? and(
            eq(developerPlatformActions.companyId, companyId),
            eq(developerPlatformActions.status, status),
          )
        : eq(developerPlatformActions.companyId, companyId),
      orderBy: [desc(developerPlatformActions.createdAt)],
    });
    return rows.map(toActionSummary);
  }

  async createPlatformAction(
    scope: StaffScope,
    input: CreateDeveloperPlatformActionRequest,
  ): Promise<DeveloperPlatformActionSummary> {
    const [row] = await this.deps.db
      .insert(developerPlatformActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        subject: input.subject,
        recommendation: input.recommendation,
        extensionId: input.extensionId ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();
    return toActionSummary(row!);
  }

  async getAnalytics(companyId: string): Promise<DeveloperAnalyticsSummary> {
    const snapshot = await this.getLatestAnalyticsSnapshot(companyId);
    return {
      apiRequestCount: snapshot.apiRequestCount,
      apiErrorCount: snapshot.apiErrorCount,
      avgLatencyMs: snapshot.avgLatencyMs,
      webhookDeliveryCount: snapshot.webhookDeliveryCount,
      webhookFailureCount: snapshot.webhookFailureCount,
      extensionUsageCount: snapshot.extensionUsageCount,
      sdkDownloadCount: snapshot.sdkDownloadCount,
      errorRatePercent:
        snapshot.apiRequestCount > 0
          ? Math.round((snapshot.apiErrorCount / snapshot.apiRequestCount) * 100)
          : null,
    };
  }

  async captureAnalyticsSnapshot(companyId: string) {
    const [usage, healthRows, gatewayTraces, webhookDeliveries, extensions, sdkPackages] =
      await Promise.all([
        this.deps.integrationApiManagementService.listApiUsage(companyId),
        this.deps.integrationApiManagementService.getApiHealth(companyId),
        this.deps.integrationPlatformService.listGatewayTraces(companyId, 100),
        this.deps.integrationApiManagementService.listWebhookDeliveries(companyId, 100),
        this.listInstalledExtensions(companyId),
        this.listSdkPackages(companyId),
      ]);
    const apiRequestCount = usage.reduce((sum, row) => sum + row.requestCount, 0);
    const apiErrorCount = usage.reduce((sum, row) => sum + row.failureCount, 0);
    const healthLatency =
      healthRows.length > 0
        ? Math.round(
            healthRows.reduce((sum, row) => sum + (row.avgLatencyMs ?? 0), 0) / healthRows.length,
          )
        : null;
    const avgLatencyMs =
      gatewayTraces.length > 0
        ? Math.round(
            gatewayTraces.reduce((sum, t) => sum + (t.durationMs ?? 0), 0) / gatewayTraces.length,
          )
        : healthLatency;
    const overallStatus = healthRows.some((row) => row.healthStatus === 'unhealthy')
      ? 'unhealthy'
      : healthRows.some((row) => row.healthStatus === 'degraded')
        ? 'degraded'
        : healthRows.length > 0
          ? 'healthy'
          : 'unknown';
    const [row] = await this.deps.db
      .insert(developerPlatformAnalyticsSnapshots)
      .values({
        companyId,
        apiRequestCount,
        apiErrorCount,
        avgLatencyMs,
        webhookDeliveryCount: webhookDeliveries.length,
        webhookFailureCount: webhookDeliveries.filter(
          (d) => d.status === 'failed' || d.status === 'dead_letter',
        ).length,
        extensionUsageCount: extensions.length,
        sdkDownloadCount: sdkPackages.length,
        metrics: { healthStatus: overallStatus },
      })
      .returning();
    return row!;
  }

  private async getLatestAnalyticsSnapshot(companyId: string) {
    const row = await this.deps.db.query.developerPlatformAnalyticsSnapshots.findFirst({
      where: eq(developerPlatformAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(developerPlatformAnalyticsSnapshots.capturedAt)],
    });
    return row ?? this.captureAnalyticsSnapshot(companyId);
  }

  private async getApiHealth(companyId: string) {
    const [healthRows, traces] = await Promise.all([
      this.deps.integrationApiManagementService.getApiHealth(companyId),
      this.deps.integrationPlatformService.listGatewayTraces(companyId, 50),
    ]);
    const errorCount = traces.filter((t) => (t.statusCode ?? 200) >= 400).length;
    const healthLatency =
      healthRows.length > 0
        ? Math.round(
            healthRows.reduce((sum, row) => sum + (row.avgLatencyMs ?? 0), 0) / healthRows.length,
          )
        : null;
    const status = healthRows.some((row) => row.healthStatus === 'unhealthy')
      ? 'unhealthy'
      : healthRows.some((row) => row.healthStatus === 'degraded')
        ? 'degraded'
        : healthRows.length > 0
          ? 'healthy'
          : 'unknown';
    return {
      status,
      apiVersion: 'v1',
      gatewayTraceCount: traces.length,
      avgLatencyMs:
        traces.length > 0
          ? Math.round(traces.reduce((sum, t) => sum + (t.durationMs ?? 0), 0) / traces.length)
          : healthLatency,
      errorRatePercent: traces.length > 0 ? Math.round((errorCount / traces.length) * 100) : null,
    };
  }

  private async getLatestOpenApiSpec(
    companyId: string,
  ): Promise<DeveloperOpenApiSpecDetail | null> {
    const row = await this.deps.db.query.developerPlatformOpenapiSpecs.findFirst({
      where: eq(developerPlatformOpenapiSpecs.companyId, companyId),
      orderBy: [desc(developerPlatformOpenapiSpecs.generatedAt)],
    });
    if (!row) return null;
    return {
      id: row.id,
      version: row.version,
      title: row.title,
      generatedAt: row.generatedAt.toISOString(),
      spec: row.spec as Record<string, unknown>,
    };
  }

  private async recordAuthAudit(
    scope: StaffScope,
    input: {
      tokenType: 'api_key' | 'personal_token' | 'service_account';
      actionType: string;
      subject: string;
    },
  ) {
    await this.deps.db.insert(developerPlatformAuthAuditLog).values({
      companyId: scope.companyId,
      tokenType: input.tokenType,
      actionType: input.actionType,
      subject: input.subject,
      performedByUserId: scope.userId,
    });
  }

  private async ensureExtension(companyId: string, extensionId: string) {
    const row = await this.deps.db.query.developerPlatformExtensions.findFirst({
      where: and(
        eq(developerPlatformExtensions.companyId, companyId),
        eq(developerPlatformExtensions.id, extensionId),
      ),
    });
    if (!row) throw new EnterpriseDeveloperPlatformError('NOT_FOUND', 'Extension not found');
    return row;
  }

  private async ensurePersonalToken(companyId: string, tokenId: string) {
    const row = await this.deps.db.query.developerPlatformPersonalAccessTokens.findFirst({
      where: and(
        eq(developerPlatformPersonalAccessTokens.companyId, companyId),
        eq(developerPlatformPersonalAccessTokens.id, tokenId),
      ),
    });
    if (!row)
      throw new EnterpriseDeveloperPlatformError('NOT_FOUND', 'Personal access token not found');
    return row;
  }
}

function toExtensionSummary(
  row: typeof developerPlatformExtensions.$inferSelect,
): DeveloperExtensionSummary {
  return {
    id: row.id,
    extensionKey: row.extensionKey,
    name: row.name,
    description: row.description,
    extensionType: row.extensionType,
    status: row.status,
    version: row.version,
    permissions: row.permissions,
    installedAt: row.installedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMarketplaceSummary(
  row: typeof developerPlatformMarketplaceListings.$inferSelect,
): DeveloperMarketplaceListingSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    status: row.status,
    version: row.version,
    permissions: row.permissions,
    averageRating: row.averageRating,
    reviewCount: row.reviewCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toWebhookSubscriptionSummary(
  row: typeof developerPlatformWebhookSubscriptions.$inferSelect,
): DeveloperWebhookSubscriptionSummary {
  return {
    id: row.id,
    name: row.name,
    targetUrl: row.targetUrl,
    eventTypes: row.eventTypes,
    secretPrefix: row.secretPrefix,
    status: row.status,
    maxRetries: row.maxRetries,
    createdAt: row.createdAt.toISOString(),
  };
}

function toOauthApplicationSummary(
  row: typeof developerPlatformOauthApplications.$inferSelect,
): DeveloperOauthApplicationSummary {
  return {
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    redirectUris: row.redirectUris,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPersonalTokenSummary(
  row: typeof developerPlatformPersonalAccessTokens.$inferSelect,
): DeveloperPersonalAccessTokenSummary {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toServiceAccountSummary(
  row: typeof developerPlatformServiceAccounts.$inferSelect,
): DeveloperServiceAccountSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSdkPackageSummary(
  row: typeof developerPlatformSdkPackages.$inferSelect,
): DeveloperSdkPackageSummary {
  return {
    id: row.id,
    language: row.language,
    version: row.version,
    packageName: row.packageName,
    generatedAt: row.generatedAt.toISOString(),
  };
}

function toActionSummary(
  row: typeof developerPlatformActions.$inferSelect,
): DeveloperPlatformActionSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    status: row.status,
    subject: row.subject,
    recommendation: row.recommendation,
    extensionId: row.extensionId,
    createdAt: row.createdAt.toISOString(),
  };
}
