import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
  ConfigureN8nConnectionRequest,
  DispatchN8nExecutionRequest,
  IntegrationProviderStatus,
  N8nCallbackRequest,
  N8nCapabilityState,
  N8nConnectionSummary,
  N8nExecutionSummary,
  N8nWorkflowRegistrationSummary,
  RegisterN8nWorkflowRequest,
} from '@titan/shared';
import {
  N8N_AUTOMATIONS_PATH,
  N8N_CAPABILITY_TO_INTEGRATION,
  N8N_DEFAULT_TIMEOUT_MS,
  baseUrlHostOnly,
  buildMinimumN8nPayload,
  deriveN8nCapabilityState,
  formatCapabilityStateLabel,
  formatN8nCapabilityLabel,
  isAllowedN8nBaseUrl,
  nextN8nRetryAt,
  sanitizeN8nErrorMessage,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  n8nAuditEvents,
  n8nCallbackReceipts,
  n8nConnections,
  n8nExecutions,
  n8nWorkflowRegistrations,
  workflows,
} from '@titan/db';
import {
  decryptN8nCredentials,
  encryptN8nCredentials,
  hashWebhookSecret,
  type N8nStoredCredentials,
} from '../lib/crypto.js';
import { signN8nPayload, verifyN8nSignature } from '../lib/n8n-signing.js';

export class N8nOrchestrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'N8nOrchestrationError';
  }
}

type TenantScope = { companyId: string; userId: string };

export class N8nOrchestrationService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly encryptionKey?: string,
  ) {}

  async getConnectionSummary(companyId: string): Promise<N8nConnectionSummary> {
    const row = await this.getOrCreateConnection(companyId);
    const status = deriveN8nCapabilityState({
      status: row.status,
      hasCredentials: Boolean(row.credentialsEncrypted),
      lastError: row.lastError,
    });
    return {
      status,
      capabilityLabel: formatN8nCapabilityLabel(status),
      baseUrlHost: baseUrlHostOnly(row.baseUrl),
      hasCredentials: Boolean(row.credentialsEncrypted),
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      lastError: sanitizeN8nErrorMessage(row.lastError),
      connectedAt: row.connectedAt?.toISOString() ?? null,
      disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
      dispatchEnabled: status === 'connected_usable',
      automationsPath: N8N_AUTOMATIONS_PATH,
    };
  }

  async getIntegrationProviderStatus(companyId: string): Promise<IntegrationProviderStatus> {
    const summary = await this.getConnectionSummary(companyId);
    const capabilityState = N8N_CAPABILITY_TO_INTEGRATION[summary.status];
    return {
      provider: 'n8n',
      name: 'n8n',
      description:
        'External orchestration is Automation-owned. Configure and monitor under Automations — never Connected without verified loopback config.',
      category: 'automation',
      availability: 'available',
      settingsPath: N8N_AUTOMATIONS_PATH,
      supportsSync: false,
      supportsWebhooks: true,
      connectionId: null,
      connectionStatus:
        summary.status === 'connected_usable'
          ? 'connected'
          : summary.status === 'failed_degraded'
            ? 'error'
            : summary.status === 'configured_unverified'
              ? 'pending'
              : 'disconnected',
      isConfigured: summary.hasCredentials,
      lastSyncAt: summary.lastVerifiedAt,
      lastError: summary.lastError,
      connectedAt: summary.connectedAt,
      capabilityState,
      capabilityLabel: formatCapabilityStateLabel(capabilityState),
      canConnect: false,
      canSend: false,
      honestyOnly: false,
    };
  }

  async configureConnection(
    scope: TenantScope,
    input: ConfigureN8nConnectionRequest,
  ): Promise<N8nConnectionSummary> {
    this.ensureEncryptionKey();
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
    if (!isAllowedN8nBaseUrl(baseUrl)) {
      throw new N8nOrchestrationError(
        'VALIDATION_ERROR',
        'n8n base URL must be a local loopback endpoint (127.0.0.1 / localhost). External n8n hosts are not permitted.',
      );
    }
    if (!input.apiKey?.trim() || !input.webhookSecret?.trim()) {
      throw new N8nOrchestrationError(
        'VALIDATION_ERROR',
        'API key and webhook secret are required',
      );
    }

    const credentials: N8nStoredCredentials = {
      apiKey: input.apiKey.trim(),
      webhookSecret: input.webhookSecret.trim(),
    };
    const row = await this.getOrCreateConnection(scope.companyId);
    await this.db
      .update(n8nConnections)
      .set({
        baseUrl,
        credentialsEncrypted: encryptN8nCredentials(credentials, this.encryptionKey!),
        webhookSecretHash: hashWebhookSecret(credentials.webhookSecret),
        status: 'configured_unverified',
        lastError: null,
        connectedAt: null,
        disconnectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(n8nConnections.id, row.id));

    await this.audit(scope.companyId, scope.userId, 'n8n.connection.configured', 'connection', row.id, {
      baseUrlHost: baseUrlHostOnly(baseUrl),
    });

    return this.getConnectionSummary(scope.companyId);
  }

  async verifyConnection(scope: TenantScope): Promise<N8nConnectionSummary> {
    const row = await this.getOrCreateConnection(scope.companyId);
    if (!row.credentialsEncrypted || !row.baseUrl) {
      throw new N8nOrchestrationError(
        'NOT_CONFIGURED',
        'Configure n8n before verifying connectivity',
      );
    }
    if (!isAllowedN8nBaseUrl(row.baseUrl)) {
      await this.markStatus(row.id, 'failed_degraded', 'Base URL is not an allowed loopback host');
      throw new N8nOrchestrationError('VALIDATION_ERROR', 'Base URL is not an allowed loopback host');
    }

    const credentials = this.decrypt(row.credentialsEncrypted);
    const correlationId = `verify-${randomUUID()}`;
    const timestamp = new Date().toISOString();
    const body = JSON.stringify({
      probe: 'titan-n8n-health',
      companyId: scope.companyId,
      correlationId,
    });
    const signature = signN8nPayload(
      credentials.webhookSecret,
      timestamp,
      correlationId,
      body,
    );

    try {
      const response = await this.dispatchHttp(`${row.baseUrl}/healthz`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-titan-company-id': scope.companyId,
          'x-titan-correlation-id': correlationId,
          'x-titan-timestamp': timestamp,
          'x-titan-signature': signature,
          'x-titan-api-key-hint': 'present',
        },
        body,
        timeoutMs: row.config.timeoutMs ?? N8N_DEFAULT_TIMEOUT_MS,
      });

      if (!response.ok) {
        await this.markStatus(
          row.id,
          'failed_degraded',
          `Verification probe failed with HTTP ${response.status}`,
        );
        throw new N8nOrchestrationError(
          'VERIFICATION_FAILED',
          `Verification probe failed with HTTP ${response.status}`,
        );
      }

      await this.db
        .update(n8nConnections)
        .set({
          status: 'connected_usable',
          lastVerifiedAt: new Date(),
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(n8nConnections.id, row.id));

      await this.audit(scope.companyId, scope.userId, 'n8n.connection.verified', 'connection', row.id, {
        correlationId,
      });
    } catch (error) {
      if (error instanceof N8nOrchestrationError) throw error;
      const message = sanitizeN8nErrorMessage(
        error instanceof Error ? error.message : 'Verification failed',
      );
      await this.markStatus(row.id, 'temporarily_unavailable', message);
      throw new N8nOrchestrationError('TEMPORARILY_UNAVAILABLE', message ?? 'Verification failed');
    }

    return this.getConnectionSummary(scope.companyId);
  }

  async disconnect(scope: TenantScope): Promise<N8nConnectionSummary> {
    const row = await this.getOrCreateConnection(scope.companyId);
    await this.db
      .update(n8nConnections)
      .set({
        status: 'disconnected',
        credentialsEncrypted: null,
        webhookSecretHash: null,
        baseUrl: null,
        lastError: null,
        disconnectedAt: new Date(),
        connectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(n8nConnections.id, row.id));

    // Pause active n8n workflow registrations — native workflows untouched.
    await this.db
      .update(n8nWorkflowRegistrations)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(
        and(
          eq(n8nWorkflowRegistrations.companyId, scope.companyId),
          inArray(n8nWorkflowRegistrations.status, ['active', 'paused']),
        ),
      );

    await this.audit(scope.companyId, scope.userId, 'n8n.connection.disconnected', 'connection', row.id, {});
    return this.getConnectionSummary(scope.companyId);
  }

  async listWorkflowRegistrations(companyId: string): Promise<N8nWorkflowRegistrationSummary[]> {
    const rows = await this.db.query.n8nWorkflowRegistrations.findMany({
      where: eq(n8nWorkflowRegistrations.companyId, companyId),
      orderBy: [desc(n8nWorkflowRegistrations.updatedAt)],
    });
    return rows.map(toWorkflowSummary);
  }

  async registerWorkflow(
    scope: TenantScope,
    input: RegisterN8nWorkflowRequest,
  ): Promise<N8nWorkflowRegistrationSummary> {
    const name = input.name.trim();
    const externalWorkflowKey = input.externalWorkflowKey.trim();
    const triggerEvent = input.triggerEvent.trim();
    if (!name || !externalWorkflowKey || !triggerEvent) {
      throw new N8nOrchestrationError(
        'VALIDATION_ERROR',
        'name, externalWorkflowKey and triggerEvent are required',
      );
    }

    const [row] = await this.db
      .insert(n8nWorkflowRegistrations)
      .values({
        companyId: scope.companyId,
        name,
        purpose: input.purpose?.trim() || null,
        externalWorkflowKey,
        triggerEvent,
        requiresApproval: input.requiresApproval ?? true,
        nativeWorkflowId: input.nativeWorkflowId ?? null,
        status: input.status ?? 'draft',
        ownerUserId: scope.userId,
        createdByUserId: scope.userId,
        version: 1,
      })
      .returning();

    await this.audit(scope.companyId, scope.userId, 'n8n.workflow.registered', 'workflow', row.id, {
      externalWorkflowKey,
      requiresApproval: row.requiresApproval,
    });

    return toWorkflowSummary(row);
  }

  async listExecutions(companyId: string, limit = 50): Promise<N8nExecutionSummary[]> {
    const rows = await this.db.query.n8nExecutions.findMany({
      where: eq(n8nExecutions.companyId, companyId),
      with: { workflowRegistration: true },
      orderBy: [desc(n8nExecutions.createdAt)],
      limit,
    });
    return rows.map((row) => toExecutionSummary(row, row.workflowRegistration?.name ?? null));
  }

  async dispatchExecution(
    scope: TenantScope,
    input: DispatchN8nExecutionRequest,
  ): Promise<N8nExecutionSummary> {
    const connection = await this.getOrCreateConnection(scope.companyId);
    const capability = deriveN8nCapabilityState({
      status: connection.status,
      hasCredentials: Boolean(connection.credentialsEncrypted),
    });
    if (capability !== 'connected_usable') {
      throw new N8nOrchestrationError(
        'DISPATCH_BLOCKED',
        'n8n is not connected_usable — new external executions are blocked',
      );
    }

    const workflow = await this.db.query.n8nWorkflowRegistrations.findFirst({
      where: and(
        eq(n8nWorkflowRegistrations.companyId, scope.companyId),
        eq(n8nWorkflowRegistrations.externalWorkflowKey, input.externalWorkflowKey.trim()),
      ),
    });
    if (!workflow || workflow.status !== 'active') {
      throw new N8nOrchestrationError('UNKNOWN_WORKFLOW', 'Unknown or inactive n8n workflow');
    }
    if (workflow.triggerEvent !== input.triggerEvent.trim()) {
      throw new N8nOrchestrationError(
        'TRIGGER_MISMATCH',
        'Trigger event does not match registered workflow',
      );
    }

    const existing = await this.db.query.n8nExecutions.findFirst({
      where: and(
        eq(n8nExecutions.companyId, scope.companyId),
        eq(n8nExecutions.idempotencyKey, input.idempotencyKey.trim()),
      ),
      with: { workflowRegistration: true },
    });
    if (existing) {
      return toExecutionSummary(existing, existing.workflowRegistration?.name ?? null);
    }

    const correlationId = randomUUID();
    const status = workflow.requiresApproval ? 'awaiting_approval' : 'queued';
    const [created] = await this.db
      .insert(n8nExecutions)
      .values({
        companyId: scope.companyId,
        workflowRegistrationId: workflow.id,
        correlationId,
        idempotencyKey: input.idempotencyKey.trim(),
        triggerEvent: input.triggerEvent.trim(),
        status,
        workflowVersion: workflow.version,
        payloadSummary: buildMinimumN8nPayload({
          companyId: scope.companyId,
          correlationId,
          externalWorkflowKey: workflow.externalWorkflowKey,
          triggerEvent: workflow.triggerEvent,
          workflowVersion: workflow.version,
          payload: input.payload,
        }),
        createdByUserId: scope.userId,
      })
      .returning();

    await this.audit(scope.companyId, scope.userId, 'n8n.execution.created', 'execution', created.id, {
      status,
      correlationId,
    });

    if (status === 'awaiting_approval') {
      return toExecutionSummary(created, workflow.name);
    }

    return this.attemptDispatch(scope.companyId, created.id);
  }

  async approveExecution(scope: TenantScope, executionId: string): Promise<N8nExecutionSummary> {
    const execution = await this.requireExecution(scope.companyId, executionId);
    if (execution.status !== 'awaiting_approval') {
      throw new N8nOrchestrationError(
        'INVALID_STATE',
        'Only awaiting_approval executions can be approved',
      );
    }
    await this.db
      .update(n8nExecutions)
      .set({
        status: 'queued',
        approvedAt: new Date(),
        approvedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(eq(n8nExecutions.id, execution.id));

    await this.audit(scope.companyId, scope.userId, 'n8n.execution.approved', 'execution', execution.id, {});
    return this.attemptDispatch(scope.companyId, execution.id);
  }

  async cancelExecution(scope: TenantScope, executionId: string): Promise<N8nExecutionSummary> {
    const execution = await this.requireExecution(scope.companyId, executionId);
    if (['succeeded', 'cancelled'].includes(execution.status)) {
      throw new N8nOrchestrationError('INVALID_STATE', 'Execution cannot be cancelled');
    }
    await this.db
      .update(n8nExecutions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        finishedAt: new Date(),
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where(eq(n8nExecutions.id, execution.id));

    await this.audit(scope.companyId, scope.userId, 'n8n.execution.cancelled', 'execution', execution.id, {});
    return this.requireExecutionSummary(scope.companyId, executionId);
  }

  async retryExecution(scope: TenantScope, executionId: string): Promise<N8nExecutionSummary> {
    const execution = await this.requireExecution(scope.companyId, executionId);
    if (!['failed', 'timed_out'].includes(execution.status)) {
      throw new N8nOrchestrationError('INVALID_STATE', 'Only failed/timed_out executions can retry');
    }
    if (execution.attemptCount >= execution.maxAttempts) {
      throw new N8nOrchestrationError('MAX_ATTEMPTS', 'Maximum retry attempts reached');
    }

    const connection = await this.getOrCreateConnection(scope.companyId);
    const capability = deriveN8nCapabilityState({
      status: connection.status,
      hasCredentials: Boolean(connection.credentialsEncrypted),
    });
    if (capability !== 'connected_usable') {
      throw new N8nOrchestrationError('DISPATCH_BLOCKED', 'n8n disconnected — retry blocked');
    }

    await this.db
      .update(n8nExecutions)
      .set({
        status: 'queued',
        sanitizedError: null,
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where(eq(n8nExecutions.id, execution.id));

    await this.audit(scope.companyId, scope.userId, 'n8n.execution.retry', 'execution', execution.id, {
      attemptCount: execution.attemptCount,
    });
    return this.attemptDispatch(scope.companyId, execution.id);
  }

  /**
   * Inbound callback — signature, timestamp, replay, tenant/workflow ownership.
   * Never writes TITAN business tables; only n8n execution/receipt rows.
   */
  async handleCallback(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<{ ok: true; duplicate?: boolean; executionId: string }> {
    let parsed: N8nCallbackRequest;
    try {
      parsed = JSON.parse(rawBody) as N8nCallbackRequest;
    } catch {
      throw new N8nOrchestrationError('VALIDATION_ERROR', 'Invalid callback JSON');
    }

    if (!parsed.companyId || !parsed.callbackId || !parsed.correlationId) {
      throw new N8nOrchestrationError('VALIDATION_ERROR', 'Missing callback identity fields');
    }

    const connection = await this.db.query.n8nConnections.findFirst({
      where: eq(n8nConnections.companyId, parsed.companyId),
    });
    if (!connection?.credentialsEncrypted) {
      throw new N8nOrchestrationError('FORBIDDEN', 'Unknown tenant or n8n not configured');
    }

    const credentials = this.decrypt(connection.credentialsEncrypted);
    const verification = verifyN8nSignature({
      secret: credentials.webhookSecret,
      timestamp: headers['x-titan-timestamp'] ?? parsed.timestamp,
      correlationId: parsed.correlationId,
      body: rawBody,
      signature: headers['x-titan-signature'] ?? '',
    });
    if (!verification.ok) {
      throw new N8nOrchestrationError(
        verification.reason === 'stale_timestamp' ? 'STALE_TIMESTAMP' : 'INVALID_SIGNATURE',
        `Callback rejected: ${verification.reason}`,
      );
    }

    const headerCompany = headers['x-titan-company-id'];
    if (headerCompany && headerCompany !== parsed.companyId) {
      throw new N8nOrchestrationError('FORBIDDEN', 'Company header mismatch');
    }

    const existingReceipt = await this.db.query.n8nCallbackReceipts.findFirst({
      where: and(
        eq(n8nCallbackReceipts.companyId, parsed.companyId),
        eq(n8nCallbackReceipts.callbackId, parsed.callbackId),
      ),
    });
    if (existingReceipt) {
      return {
        ok: true,
        duplicate: true,
        executionId: existingReceipt.executionId ?? 'unknown',
      };
    }

    const execution = await this.db.query.n8nExecutions.findFirst({
      where: and(
        eq(n8nExecutions.companyId, parsed.companyId),
        eq(n8nExecutions.correlationId, parsed.correlationId),
      ),
      with: { workflowRegistration: true },
    });
    if (!execution) {
      throw new N8nOrchestrationError('UNKNOWN_EXECUTION', 'Unknown correlation ID for tenant');
    }
    if (
      execution.workflowRegistration?.externalWorkflowKey !== parsed.externalWorkflowKey
    ) {
      throw new N8nOrchestrationError('FORBIDDEN', 'Workflow ownership mismatch');
    }

    await this.db.insert(n8nCallbackReceipts).values({
      companyId: parsed.companyId,
      executionId: execution.id,
      callbackId: parsed.callbackId,
      correlationId: parsed.correlationId,
    });

    const terminal = ['succeeded', 'failed', 'timed_out', 'cancelled'].includes(parsed.status);
    await this.db
      .update(n8nExecutions)
      .set({
        status: parsed.status,
        providerAccepted: parsed.providerAccepted ?? execution.providerAccepted,
        businessOutcome: parsed.businessOutcome ?? execution.businessOutcome,
        sanitizedError: sanitizeN8nErrorMessage(parsed.errorMessage),
        startedAt: execution.startedAt ?? new Date(),
        finishedAt: terminal ? new Date() : execution.finishedAt,
        updatedAt: new Date(),
      })
      .where(eq(n8nExecutions.id, execution.id));

    await this.audit(parsed.companyId, null, 'n8n.callback.accepted', 'execution', execution.id, {
      callbackId: parsed.callbackId,
      status: parsed.status,
      // Explicit: callback never mutates business tables
      businessTablesTouched: false,
    });

    return { ok: true, executionId: execution.id };
  }

  /** Native workflow continuity probe — counts native workflows without requiring n8n. */
  async nativeWorkflowsContinueWithoutN8n(companyId: string): Promise<{
    nativeWorkflowCount: number;
    n8nDispatchEnabled: boolean;
  }> {
    const nativeRows = await this.db.query.workflows.findMany({
      where: eq(workflows.companyId, companyId),
      columns: { id: true },
    });
    const summary = await this.getConnectionSummary(companyId);
    return {
      nativeWorkflowCount: nativeRows.length,
      n8nDispatchEnabled: summary.dispatchEnabled,
    };
  }

  private async attemptDispatch(companyId: string, executionId: string): Promise<N8nExecutionSummary> {
    const execution = await this.requireExecution(companyId, executionId);
    const connection = await this.getOrCreateConnection(companyId);
    const capability = deriveN8nCapabilityState({
      status: connection.status,
      hasCredentials: Boolean(connection.credentialsEncrypted),
    });
    if (capability !== 'connected_usable' || !connection.baseUrl || !connection.credentialsEncrypted) {
      await this.db
        .update(n8nExecutions)
        .set({
          status: 'failed',
          sanitizedError: 'Dispatch blocked — n8n not connected_usable',
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(n8nExecutions.id, executionId));
      throw new N8nOrchestrationError('DISPATCH_BLOCKED', 'n8n not connected_usable');
    }

    const workflow = await this.db.query.n8nWorkflowRegistrations.findFirst({
      where: eq(n8nWorkflowRegistrations.id, execution.workflowRegistrationId),
    });
    if (!workflow) {
      throw new N8nOrchestrationError('UNKNOWN_WORKFLOW', 'Workflow registration missing');
    }

    const credentials = this.decrypt(connection.credentialsEncrypted);
    const timestamp = new Date().toISOString();
    const body = JSON.stringify(execution.payloadSummary ?? {});
    const signature = signN8nPayload(
      credentials.webhookSecret,
      timestamp,
      execution.correlationId,
      body,
    );
    const attemptCount = execution.attemptCount + 1;

    await this.db
      .update(n8nExecutions)
      .set({
        status: 'dispatched',
        attemptCount,
        dispatchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(n8nExecutions.id, executionId));

    try {
      const response = await this.dispatchHttp(`${connection.baseUrl}/webhook/titan`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-titan-company-id': companyId,
          'x-titan-correlation-id': execution.correlationId,
          'x-titan-timestamp': timestamp,
          'x-titan-signature': signature,
        },
        body,
        timeoutMs: connection.config.timeoutMs ?? N8N_DEFAULT_TIMEOUT_MS,
      });

      if (!response.ok) {
        throw new Error(`Provider HTTP ${response.status}`);
      }

      // Provider acceptance ≠ completed business outcome.
      await this.db
        .update(n8nExecutions)
        .set({
          status: 'running',
          providerAccepted: true,
          businessOutcome: 'pending_callback',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(n8nExecutions.id, executionId));
    } catch (error) {
      const message = sanitizeN8nErrorMessage(
        error instanceof Error ? error.message : 'Dispatch failed',
      );
      const retryable = attemptCount < execution.maxAttempts;
      const isTimeout =
        message?.toLowerCase().includes('timeout') || message?.toLowerCase().includes('aborted');
      await this.db
        .update(n8nExecutions)
        .set({
          status: isTimeout ? 'timed_out' : 'failed',
          sanitizedError: message,
          providerAccepted: false,
          nextRetryAt: retryable ? nextN8nRetryAt(attemptCount - 1) : null,
          finishedAt: retryable ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(n8nExecutions.id, executionId));
    }

    return this.requireExecutionSummary(companyId, executionId);
  }

  private async dispatchHttp(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body: string;
      timeoutMs: number;
    },
  ): Promise<{ ok: boolean; status: number }> {
    if (!isAllowedN8nBaseUrl(url)) {
      throw new N8nOrchestrationError(
        'VALIDATION_ERROR',
        'Refusing non-loopback n8n endpoint',
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs);
    try {
      const res = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      });
      return { ok: res.ok, status: res.status };
    } finally {
      clearTimeout(timer);
    }
  }

  private async getOrCreateConnection(companyId: string) {
    const existing = await this.db.query.n8nConnections.findFirst({
      where: eq(n8nConnections.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.db
      .insert(n8nConnections)
      .values({ companyId, status: 'not_configured' })
      .returning();
    return created;
  }

  private async markStatus(id: string, status: N8nCapabilityState, lastError: string | null) {
    await this.db
      .update(n8nConnections)
      .set({
        status,
        lastError: sanitizeN8nErrorMessage(lastError),
        updatedAt: new Date(),
      })
      .where(eq(n8nConnections.id, id));
  }

  private async requireExecution(companyId: string, executionId: string) {
    const row = await this.db.query.n8nExecutions.findFirst({
      where: and(eq(n8nExecutions.id, executionId), eq(n8nExecutions.companyId, companyId)),
    });
    if (!row) {
      throw new N8nOrchestrationError('NOT_FOUND', 'Execution not found');
    }
    return row;
  }

  private async requireExecutionSummary(companyId: string, executionId: string) {
    const row = await this.db.query.n8nExecutions.findFirst({
      where: and(eq(n8nExecutions.id, executionId), eq(n8nExecutions.companyId, companyId)),
      with: { workflowRegistration: true },
    });
    if (!row) {
      throw new N8nOrchestrationError('NOT_FOUND', 'Execution not found');
    }
    return toExecutionSummary(row, row.workflowRegistration?.name ?? null);
  }

  private decrypt(payload: string): N8nStoredCredentials {
    this.ensureEncryptionKey();
    return decryptN8nCredentials(payload, this.encryptionKey!);
  }

  private ensureEncryptionKey() {
    if (!this.encryptionKey) {
      throw new N8nOrchestrationError(
        'ENCRYPTION_NOT_CONFIGURED',
        'INTEGRATIONS_ENCRYPTION_KEY must be configured before storing n8n credentials',
      );
    }
  }

  private async audit(
    companyId: string,
    actorUserId: string | null,
    eventType: string,
    entityType: string,
    entityId: string | null,
    detail: Record<string, unknown>,
  ) {
    await this.db.insert(n8nAuditEvents).values({
      companyId,
      actorUserId,
      eventType,
      entityType,
      entityId,
      detail,
    });
  }
}

function toWorkflowSummary(
  row: typeof n8nWorkflowRegistrations.$inferSelect,
): N8nWorkflowRegistrationSummary {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    externalWorkflowKey: row.externalWorkflowKey,
    triggerEvent: row.triggerEvent,
    status: row.status,
    version: row.version,
    requiresApproval: row.requiresApproval,
    ownerUserId: row.ownerUserId,
    nativeWorkflowId: row.nativeWorkflowId,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toExecutionSummary(
  row: typeof n8nExecutions.$inferSelect,
  workflowName: string | null,
): N8nExecutionSummary {
  return {
    id: row.id,
    workflowRegistrationId: row.workflowRegistrationId,
    workflowName,
    correlationId: row.correlationId,
    triggerEvent: row.triggerEvent,
    status: row.status,
    workflowVersion: row.workflowVersion,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    providerAccepted: row.providerAccepted,
    businessOutcome: row.businessOutcome,
    sanitizedError: row.sanitizedError,
    nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
    dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
