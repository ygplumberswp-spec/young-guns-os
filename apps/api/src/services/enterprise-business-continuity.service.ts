import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  BcActionDraftSummary,
  BcAnalyticsSummary,
  BcAuditLogSummary,
  BcBackupJobSummary,
  BcBackupPolicySummary,
  BcComplianceRecordSummary,
  BcContinuityAlertSummary,
  BcContinuityHealthSummary,
  BcPlatformConfigSummary,
  BcRecoveryPlanSummary,
  BcRecoveryScenario,
  BcRecoveryTestSummary,
  BcRestoreRequestSummary,
  BcStorageHealthSummary,
  BcVerificationRecordSummary,
  CreateBcActionDraftRequest,
  CreateBcBackupJobRequest,
  CreateBcBackupPolicyRequest,
  CreateBcComplianceRecordRequest,
  CreateBcRecoveryPlanRequest,
  CreateBcRecoveryTestRequest,
  CreateBcRestoreRequestRequest,
  CreateBcStorageHealthSnapshotRequest,
  CreateBcVerificationRecordRequest,
  EnterpriseBusinessContinuityAuraContext,
  EnterpriseBusinessContinuityDashboard,
  LegacyOpsBackupPolicySummary,
  LegacyOpsBackupRunSummary,
  UpdateBcPlatformConfigRequest,
  UpdateBcRecoveryTestRequest,
  UpdateBcRestoreRequestRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  bcActionDrafts,
  bcAnalyticsSnapshots,
  bcAuditLogs,
  bcBackupJobs,
  bcBackupPolicies,
  bcComplianceRecords,
  bcContinuityAlerts,
  bcPlatformConfig,
  bcRecoveryPlans,
  bcRecoveryTests,
  bcRestoreRequests,
  bcStorageHealthSnapshots,
  bcVerificationRecords,
  opsBackupPolicies,
  opsBackupRuns,
} from '@titan/db';
import type { EnterpriseItOperationsService } from './enterprise-it-operations.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseProductionReadinessService } from './enterprise-production-readiness.service.js';
import type { EnterpriseSecurityService } from './enterprise-security.service.js';

export class EnterpriseBusinessContinuityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseBusinessContinuityError';
  }
}

type StaffScope = { companyId: string; userId: string };

type BusinessContinuityDeps = {
  db: DatabaseClient;
  enterpriseProductionReadinessService: EnterpriseProductionReadinessService;
  enterpriseItOperationsService: EnterpriseItOperationsService;
  enterpriseSecurityService: EnterpriseSecurityService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
};

const DEFAULT_BACKUP_SCOPE = {
  database: true,
  fileStorage: true,
  configuration: true,
  integrationConfiguration: true,
  aiConfiguration: true,
  workflow: true,
  automation: true,
  auditLog: true,
};

const SYSTEM_RECOVERY_PLANS: Array<{
  scenarioKey: BcRecoveryScenario;
  name: string;
  description: string;
  estimatedRecoveryTimeMinutes: number;
  recoverySteps: Array<Record<string, unknown>>;
  dependencies: Array<Record<string, unknown>>;
  validationChecklist: Array<Record<string, unknown>>;
}> = [
  {
    scenarioKey: 'database_failure',
    name: 'Database Failure Recovery',
    description: 'Restore tenant database from encrypted backup with point-in-time recovery validation.',
    estimatedRecoveryTimeMinutes: 120,
    recoverySteps: [
      { step: 1, action: 'Identify failed database scope and last verified backup.' },
      { step: 2, action: 'Provision isolated restore environment — never overwrite production.' },
      { step: 3, action: 'Restore encrypted backup and validate schema consistency.' },
      { step: 4, action: 'Run tenant isolation and RBAC validation checks.' },
      { step: 5, action: 'Obtain owner approval before any production cutover.' },
    ],
    dependencies: [{ module: 'database' }, { module: 'security' }, { module: 'audit' }],
    validationChecklist: [
      { item: 'Backup integrity verified' },
      { item: 'Tenant isolation confirmed' },
      { item: 'Owner approval recorded' },
    ],
  },
  {
    scenarioKey: 'storage_failure',
    name: 'Storage Failure Recovery',
    description: 'Recover file storage and document assets from encrypted backups.',
    estimatedRecoveryTimeMinutes: 180,
    recoverySteps: [
      { step: 1, action: 'Assess storage health and identify affected buckets or paths.' },
      { step: 2, action: 'Restore file storage backup to isolated environment.' },
      { step: 3, action: 'Verify file consistency and encryption.' },
      { step: 4, action: 'Validate document permissions and tenant boundaries.' },
    ],
    dependencies: [{ module: 'storage' }, { module: 'documents' }],
    validationChecklist: [{ item: 'File checksum validation passed' }, { item: 'Encryption verified' }],
  },
  {
    scenarioKey: 'ai_provider_outage',
    name: 'AI Provider Outage Recovery',
    description: 'Fail over to redundant AI provider configuration without data loss.',
    estimatedRecoveryTimeMinutes: 30,
    recoverySteps: [
      { step: 1, action: 'Detect provider outage via health monitoring.' },
      { step: 2, action: 'Activate configured fallback AI provider.' },
      { step: 3, action: 'Restore AI configuration from backup if required.' },
    ],
    dependencies: [{ module: 'ai_orchestration' }],
    validationChecklist: [{ item: 'Fallback provider responding' }],
  },
  {
    scenarioKey: 'communication_provider_outage',
    name: 'Communication Provider Outage Recovery',
    description: 'Restore communications routing and provider configuration.',
    estimatedRecoveryTimeMinutes: 60,
    recoverySteps: [
      { step: 1, action: 'Identify affected communication channels.' },
      { step: 2, action: 'Restore integration configuration from backup.' },
      { step: 3, action: 'Validate message delivery and consent policies.' },
    ],
    dependencies: [{ module: 'communications' }, { module: 'integrations' }],
    validationChecklist: [{ item: 'Provider connectivity restored' }],
  },
  {
    scenarioKey: 'payment_provider_outage',
    name: 'Payment Provider Outage Recovery',
    description: 'Maintain billing continuity and restore payment provider configuration.',
    estimatedRecoveryTimeMinutes: 90,
    recoverySteps: [
      { step: 1, action: 'Detect payment provider failure.' },
      { step: 2, action: 'Pause autonomous payment actions.' },
      { step: 3, action: 'Restore payment provider configuration from backup.' },
    ],
    dependencies: [{ module: 'finance' }, { module: 'saas_management' }],
    validationChecklist: [{ item: 'No unauthorized charges attempted' }],
  },
  {
    scenarioKey: 'integration_failure',
    name: 'Integration Failure Recovery',
    description: 'Restore integration connections and webhook configuration.',
    estimatedRecoveryTimeMinutes: 45,
    recoverySteps: [
      { step: 1, action: 'Identify failed integrations from Mission Control alerts.' },
      { step: 2, action: 'Restore integration configuration backup.' },
      { step: 3, action: 'Re-validate credentials without exposing secrets.' },
    ],
    dependencies: [{ module: 'integrations' }],
    validationChecklist: [{ item: 'Integration health green' }],
  },
  {
    scenarioKey: 'infrastructure_outage',
    name: 'Infrastructure Outage Recovery',
    description: 'Full infrastructure recovery with tenant isolation preserved.',
    estimatedRecoveryTimeMinutes: 240,
    recoverySteps: [
      { step: 1, action: 'Assess infrastructure health across all modules.' },
      { step: 2, action: 'Execute recovery plans in dependency order.' },
      { step: 3, action: 'Validate full tenant restore in isolated environment.' },
      { step: 4, action: 'Require owner approval before production restore.' },
    ],
    dependencies: [{ module: 'mission_control' }, { module: 'security' }],
    validationChecklist: [{ item: 'All module health checks passed' }, { item: 'Owner approval recorded' }],
  },
];

export class EnterpriseBusinessContinuityService {
  constructor(private readonly deps: BusinessContinuityDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseBusinessContinuityDashboard> {
    await this.ensurePlatformConfig(companyId);
    await this.ensureSystemRecoveryPlans(companyId);

    const [
      platformConfig,
      backupPolicies,
      backupJobs,
      restoreRequests,
      recoveryPlans,
      recoveryTests,
      verificationRecords,
      storageHealth,
      complianceRecords,
      analytics,
      alerts,
      legacyOpsBackupPolicies,
      legacyOpsBackupRuns,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.listBackupPolicies(companyId),
      this.listBackupJobs(companyId),
      this.listRestoreRequests(companyId),
      this.listRecoveryPlans(companyId),
      this.listRecoveryTests(companyId),
      this.listVerificationRecords(companyId),
      this.listStorageHealth(companyId),
      this.listComplianceRecords(companyId),
      this.getLatestAnalytics(companyId),
      this.listContinuityAlerts(companyId, { status: 'open' }),
      this.listLegacyOpsBackupPolicies(companyId),
      this.listLegacyOpsBackupRuns(companyId),
    ]);

    void this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId).catch(() => null);

    const continuityHealth = this.buildContinuityHealth(
      backupJobs,
      verificationRecords,
      storageHealth,
      complianceRecords,
      legacyOpsBackupRuns,
    );
    const enabledPolicyCount = backupPolicies.filter((p) => p.isEnabled).length;
    const criticalAlertCount = alerts.filter((a) => a.severity === 'critical').length;
    const overallBusinessContinuityHealthStatus =
      criticalAlertCount > 0 || continuityHealth.failedBackupCount > 3
        ? 'critical'
        : alerts.length > 0 || continuityHealth.verificationFailureCount > 0
          ? 'degraded'
          : 'healthy';

    return {
      summary: `${enabledPolicyCount} enabled backup polic${enabledPolicyCount === 1 ? 'y' : 'ies'}, ${backupJobs.length} backup job(s), ${restoreRequests.length} restore request(s), ${recoveryPlans.length} recovery plan(s), ${alerts.length} open alert(s).`,
      platformConfig,
      continuityHealth,
      backupPolicies,
      backupJobs: backupJobs.slice(0, 50),
      restoreRequests: restoreRequests.slice(0, 50),
      recoveryPlans,
      recoveryTests: recoveryTests.slice(0, 50),
      verificationRecords: verificationRecords.slice(0, 50),
      storageHealth,
      complianceRecords,
      analytics,
      recentAlerts: alerts.slice(0, 10),
      openAlertCount: alerts.length,
      enabledPolicyCount,
      legacyOpsBackupPolicies,
      legacyOpsBackupRuns,
      overallBusinessContinuityHealthStatus,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseBusinessContinuityAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      failedBackupCount: dashboard.continuityHealth.failedBackupCount,
      restoreReadinessStatus: dashboard.continuityHealth.restoreReadinessStatus,
      recoveryReadinessStatus: dashboard.continuityHealth.recoveryReadinessStatus,
      openAlertCount: dashboard.openAlertCount,
      overallBusinessContinuityHealthStatus: dashboard.overallBusinessContinuityHealthStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<BcPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateBcPlatformConfigRequest): Promise<BcPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(bcPlatformConfig)
      .set({
        backupPolicy: input.backupPolicy ?? existing.backupPolicy,
        restorePolicy: input.restorePolicy ?? existing.restorePolicy,
        verificationPolicy: input.verificationPolicy ?? existing.verificationPolicy,
        drPolicy: input.drPolicy ?? existing.drPolicy,
        compliancePolicy: input.compliancePolicy ?? existing.compliancePolicy,
        encryptionRequired: input.encryptionRequired ?? existing.encryptionRequired,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(bcPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.logAudit(scope, 'update_platform_config', 'bc_platform_config', updated?.id);
    return toPlatformConfigSummary(updated ?? existing);
  }

  async listBackupPolicies(companyId: string): Promise<BcBackupPolicySummary[]> {
    const rows = await this.deps.db.query.bcBackupPolicies.findMany({
      where: eq(bcBackupPolicies.companyId, companyId),
      orderBy: [desc(bcBackupPolicies.createdAt)],
    });
    return rows.map(toBackupPolicySummary);
  }

  async createBackupPolicy(scope: StaffScope, input: CreateBcBackupPolicyRequest): Promise<BcBackupPolicySummary> {
    const [created] = await this.deps.db
      .insert(bcBackupPolicies)
      .values({
        companyId: scope.companyId,
        policyKey: input.policyKey.trim(),
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        scheduleType: input.scheduleType ?? 'daily',
        scheduleCron: input.scheduleCron?.trim() ?? null,
        retentionDays: input.retentionDays ?? 30,
        backupScope: input.backupScope ?? DEFAULT_BACKUP_SCOPE,
        isEnabled: input.isEnabled ?? false,
      })
      .returning();
    if (!created) throw new EnterpriseBusinessContinuityError('CREATE_FAILED', 'Unable to create backup policy');
    await this.logAudit(scope, 'create_backup_policy', 'bc_backup_policies', created.id);
    return toBackupPolicySummary(created);
  }

  async listBackupJobs(companyId: string, filters?: { status?: string }): Promise<BcBackupJobSummary[]> {
    const rows = await this.deps.db.query.bcBackupJobs.findMany({
      where: filters?.status
        ? and(eq(bcBackupJobs.companyId, companyId), eq(bcBackupJobs.status, filters.status as never))
        : eq(bcBackupJobs.companyId, companyId),
      orderBy: [desc(bcBackupJobs.startedAt)],
      limit: 100,
    });
    const policyMap = await this.getPolicyNameMap(
      companyId,
      rows.map((r) => r.policyId).filter((id): id is string => Boolean(id)),
    );
    return rows.map((row) => toBackupJobSummary(row, policyMap.get(row.policyId ?? '') ?? null));
  }

  async createBackupJob(scope: StaffScope, input: CreateBcBackupJobRequest): Promise<BcBackupJobSummary> {
    let policyName: string | null = null;
    if (input.policyId) {
      const policy = await this.deps.db.query.bcBackupPolicies.findFirst({
        where: and(eq(bcBackupPolicies.id, input.policyId), eq(bcBackupPolicies.companyId, scope.companyId)),
      });
      if (!policy) throw new EnterpriseBusinessContinuityError('NOT_FOUND', 'Backup policy not found');
      policyName = policy.name;
    }

    const [created] = await this.deps.db
      .insert(bcBackupJobs)
      .values({
        companyId: scope.companyId,
        policyId: input.policyId ?? null,
        scheduleType: input.scheduleType ?? 'manual',
        backupScope: input.backupScope ?? DEFAULT_BACKUP_SCOPE,
        status: 'pending',
        encrypted: true,
        requestedByUserId: scope.userId,
      })
      .returning();
    if (!created) throw new EnterpriseBusinessContinuityError('CREATE_FAILED', 'Unable to create backup job');
    await this.logAudit(scope, 'create_backup_job', 'bc_backup_jobs', created.id);
    return toBackupJobSummary(created, policyName);
  }

  async listRestoreRequests(companyId: string): Promise<BcRestoreRequestSummary[]> {
    const rows = await this.deps.db.query.bcRestoreRequests.findMany({
      where: eq(bcRestoreRequests.companyId, companyId),
      orderBy: [desc(bcRestoreRequests.createdAt)],
      limit: 100,
    });
    return rows.map(toRestoreRequestSummary);
  }

  async createRestoreRequest(scope: StaffScope, input: CreateBcRestoreRequestRequest): Promise<BcRestoreRequestSummary> {
    const [created] = await this.deps.db
      .insert(bcRestoreRequests)
      .values({
        companyId: scope.companyId,
        restoreScope: input.restoreScope,
        targetModule: input.targetModule?.trim() ?? null,
        targetEntityId: input.targetEntityId ?? null,
        pointInTime: input.pointInTime ? new Date(input.pointInTime) : null,
        status: 'pending_approval',
        requiresOwnerApproval: input.requiresOwnerApproval ?? true,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        requestedByUserId: scope.userId,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseBusinessContinuityError('CREATE_FAILED', 'Unable to create restore request');
    await this.logAudit(scope, 'create_restore_request', 'bc_restore_requests', created.id, {
      restoreScope: input.restoreScope,
    });
    return toRestoreRequestSummary(created);
  }

  async updateRestoreRequest(
    scope: StaffScope,
    id: string,
    input: UpdateBcRestoreRequestRequest,
  ): Promise<BcRestoreRequestSummary> {
    const existing = await this.deps.db.query.bcRestoreRequests.findFirst({
      where: and(eq(bcRestoreRequests.id, id), eq(bcRestoreRequests.companyId, scope.companyId)),
    });
    if (!existing) throw new EnterpriseBusinessContinuityError('NOT_FOUND', 'Restore request not found');

    if (input.status === 'in_progress' || input.status === 'completed') {
      if (existing.status !== 'approved') {
        throw new EnterpriseBusinessContinuityError(
          'APPROVAL_REQUIRED',
          'Restore must be approved before execution — production data is never overwritten without authorization',
        );
      }
    }

    const [updated] = await this.deps.db
      .update(bcRestoreRequests)
      .set({
        status: input.status ?? existing.status,
        approvedByUserId: input.status === 'approved' ? scope.userId : existing.approvedByUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(bcRestoreRequests.id, id), eq(bcRestoreRequests.companyId, scope.companyId)))
      .returning();
    await this.logAudit(scope, 'update_restore_request', 'bc_restore_requests', id, { status: input.status });
    return toRestoreRequestSummary(updated ?? existing);
  }

  async listRecoveryPlans(companyId: string): Promise<BcRecoveryPlanSummary[]> {
    const rows = await this.deps.db.query.bcRecoveryPlans.findMany({
      where: eq(bcRecoveryPlans.companyId, companyId),
      orderBy: [desc(bcRecoveryPlans.createdAt)],
    });
    return rows.map(toRecoveryPlanSummary);
  }

  async createRecoveryPlan(scope: StaffScope, input: CreateBcRecoveryPlanRequest): Promise<BcRecoveryPlanSummary> {
    const [created] = await this.deps.db
      .insert(bcRecoveryPlans)
      .values({
        companyId: scope.companyId,
        scenarioKey: input.scenarioKey,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        recoverySteps: input.recoverySteps ?? [],
        estimatedRecoveryTimeMinutes: input.estimatedRecoveryTimeMinutes ?? null,
        dependencies: input.dependencies ?? [],
        validationChecklist: input.validationChecklist ?? [],
      })
      .returning();
    if (!created) throw new EnterpriseBusinessContinuityError('CREATE_FAILED', 'Unable to create recovery plan');
    await this.logAudit(scope, 'create_recovery_plan', 'bc_recovery_plans', created.id);
    return toRecoveryPlanSummary(created);
  }

  async listRecoveryTests(companyId: string): Promise<BcRecoveryTestSummary[]> {
    const rows = await this.deps.db.query.bcRecoveryTests.findMany({
      where: eq(bcRecoveryTests.companyId, companyId),
      orderBy: [desc(bcRecoveryTests.createdAt)],
      limit: 100,
    });
    return rows.map(toRecoveryTestSummary);
  }

  async createRecoveryTest(scope: StaffScope, input: CreateBcRecoveryTestRequest): Promise<BcRecoveryTestSummary> {
    const [created] = await this.deps.db
      .insert(bcRecoveryTests)
      .values({
        companyId: scope.companyId,
        recoveryPlanId: input.recoveryPlanId ?? null,
        backupJobId: input.backupJobId ?? null,
        title: input.title.trim(),
        status: 'scheduled',
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        isProductionSafe: input.isProductionSafe ?? true,
      })
      .returning();
    if (!created) throw new EnterpriseBusinessContinuityError('CREATE_FAILED', 'Unable to create recovery test');
    await this.logAudit(scope, 'create_recovery_test', 'bc_recovery_tests', created.id);
    return toRecoveryTestSummary(created);
  }

  async updateRecoveryTest(
    scope: StaffScope,
    id: string,
    input: UpdateBcRecoveryTestRequest,
  ): Promise<BcRecoveryTestSummary> {
    const existing = await this.deps.db.query.bcRecoveryTests.findFirst({
      where: and(eq(bcRecoveryTests.id, id), eq(bcRecoveryTests.companyId, scope.companyId)),
    });
    if (!existing) throw new EnterpriseBusinessContinuityError('NOT_FOUND', 'Recovery test not found');

    const [updated] = await this.deps.db
      .update(bcRecoveryTests)
      .set({
        status: input.status ?? existing.status,
        success: input.success ?? existing.success,
        durationMinutes: input.durationMinutes ?? existing.durationMinutes,
        recoveryTimeMinutes: input.recoveryTimeMinutes ?? existing.recoveryTimeMinutes,
        lessonsLearned: input.lessonsLearned ?? existing.lessonsLearned,
        failures: input.failures ?? existing.failures,
        startedAt: input.status === 'in_progress' ? new Date() : existing.startedAt,
        completedAt: input.status === 'completed' || input.status === 'failed' ? new Date() : existing.completedAt,
      })
      .where(and(eq(bcRecoveryTests.id, id), eq(bcRecoveryTests.companyId, scope.companyId)))
      .returning();
    await this.logAudit(scope, 'update_recovery_test', 'bc_recovery_tests', id);
    return toRecoveryTestSummary(updated ?? existing);
  }

  async listVerificationRecords(companyId: string): Promise<BcVerificationRecordSummary[]> {
    const rows = await this.deps.db.query.bcVerificationRecords.findMany({
      where: eq(bcVerificationRecords.companyId, companyId),
      orderBy: [desc(bcVerificationRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toVerificationRecordSummary);
  }

  async createVerificationRecord(
    scope: StaffScope,
    input: CreateBcVerificationRecordRequest,
  ): Promise<BcVerificationRecordSummary> {
    const [created] = await this.deps.db
      .insert(bcVerificationRecords)
      .values({
        companyId: scope.companyId,
        backupJobId: input.backupJobId ?? null,
        verificationType: input.verificationType.trim(),
        status: input.passed === undefined ? 'pending' : input.passed ? 'passed' : 'failed',
        passed: input.passed ?? null,
        findings: input.findings ?? {},
        verifiedByUserId: scope.userId,
        verifiedAt: input.passed !== undefined ? new Date() : null,
      })
      .returning();
    if (!created) throw new EnterpriseBusinessContinuityError('CREATE_FAILED', 'Unable to create verification record');
    await this.logAudit(scope, 'create_verification_record', 'bc_verification_records', created.id);
    if (input.passed === false) {
      await this.upsertContinuityAlert(scope.companyId, {
        alertType: 'verification_failure',
        severity: 'critical',
        title: `Backup verification failed: ${input.verificationType}`,
        description: 'A backup verification check failed.',
      });
    }
    return toVerificationRecordSummary(created);
  }

  async listStorageHealth(companyId: string): Promise<BcStorageHealthSummary[]> {
    const rows = await this.deps.db.query.bcStorageHealthSnapshots.findMany({
      where: eq(bcStorageHealthSnapshots.companyId, companyId),
      orderBy: [desc(bcStorageHealthSnapshots.capturedAt)],
      limit: 50,
    });
    return rows.map(toStorageHealthSummary);
  }

  async createStorageHealthSnapshot(
    scope: StaffScope,
    input: CreateBcStorageHealthSnapshotRequest,
  ): Promise<BcStorageHealthSummary> {
    const [created] = await this.deps.db
      .insert(bcStorageHealthSnapshots)
      .values({
        companyId: scope.companyId,
        storageType: input.storageType.trim(),
        healthStatus: input.healthStatus ?? 'unknown',
        usageBytes: input.usageBytes ?? null,
        capacityBytes: input.capacityBytes ?? null,
        redundancyLevel: input.redundancyLevel?.trim() ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!created) throw new EnterpriseBusinessContinuityError('CREATE_FAILED', 'Unable to capture storage health');
    await this.logAudit(scope, 'capture_storage_health', 'bc_storage_health_snapshots', created.id);
    return toStorageHealthSummary(created);
  }

  async listComplianceRecords(companyId: string): Promise<BcComplianceRecordSummary[]> {
    const rows = await this.deps.db.query.bcComplianceRecords.findMany({
      where: eq(bcComplianceRecords.companyId, companyId),
      orderBy: [desc(bcComplianceRecords.createdAt)],
    });
    return rows.map(toComplianceRecordSummary);
  }

  async createComplianceRecord(
    scope: StaffScope,
    input: CreateBcComplianceRecordRequest,
  ): Promise<BcComplianceRecordSummary> {
    const [created] = await this.deps.db
      .insert(bcComplianceRecords)
      .values({
        companyId: scope.companyId,
        complianceType: input.complianceType.trim(),
        status: input.status ?? 'unknown',
        rpoMinutes: input.rpoMinutes ?? null,
        rtoMinutes: input.rtoMinutes ?? null,
        lastVerifiedAt: new Date(),
      })
      .returning();
    if (!created) throw new EnterpriseBusinessContinuityError('CREATE_FAILED', 'Unable to create compliance record');
    await this.logAudit(scope, 'create_compliance_record', 'bc_compliance_records', created.id);
    return toComplianceRecordSummary(created);
  }

  async listContinuityAlerts(companyId: string, filters?: { status?: string }): Promise<BcContinuityAlertSummary[]> {
    const rows = await this.deps.db.query.bcContinuityAlerts.findMany({
      where: filters?.status
        ? and(eq(bcContinuityAlerts.companyId, companyId), eq(bcContinuityAlerts.status, filters.status as never))
        : eq(bcContinuityAlerts.companyId, companyId),
      orderBy: [desc(bcContinuityAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toContinuityAlertSummary);
  }

  async syncContinuityAlerts(scope: StaffScope): Promise<BcContinuityAlertSummary[]> {
    const dashboard = await this.getDashboard(scope.companyId);
    const alerts: BcContinuityAlertSummary[] = [];

    if (dashboard.continuityHealth.failedBackupCount > 0) {
      alerts.push(
        await this.upsertContinuityAlert(scope.companyId, {
          alertType: 'failed_backup',
          severity: dashboard.continuityHealth.failedBackupCount > 3 ? 'critical' : 'warning',
          title: 'Failed backup jobs detected',
          description: `${dashboard.continuityHealth.failedBackupCount} failed backup job(s).`,
        }),
      );
    }

    if (dashboard.continuityHealth.verificationFailureCount > 0) {
      alerts.push(
        await this.upsertContinuityAlert(scope.companyId, {
          alertType: 'verification_failure',
          severity: 'critical',
          title: 'Backup verification failures',
          description: `${dashboard.continuityHealth.verificationFailureCount} verification failure(s).`,
        }),
      );
    }

    if (dashboard.continuityHealth.oldestBackupAgeHours != null && dashboard.continuityHealth.oldestBackupAgeHours > 48) {
      alerts.push(
        await this.upsertContinuityAlert(scope.companyId, {
          alertType: 'stale_backup',
          severity: 'warning',
          title: 'Backup age exceeds policy',
          description: `Oldest backup is ${dashboard.continuityHealth.oldestBackupAgeHours} hours old.`,
        }),
      );
    }

    await this.logAudit(scope, 'sync_continuity_alerts', 'bc_continuity_alerts');
    return alerts;
  }

  async captureAnalytics(scope: StaffScope): Promise<BcAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const metrics = {
      backupSuccessRatePercent: dashboard.continuityHealth.backupSuccessRatePercent,
      failedBackupCount: dashboard.continuityHealth.failedBackupCount,
      restoreReadinessStatus: dashboard.continuityHealth.restoreReadinessStatus,
      recoveryReadinessStatus: dashboard.continuityHealth.recoveryReadinessStatus,
      verificationFailureCount: dashboard.continuityHealth.verificationFailureCount,
      openAlertCount: dashboard.openAlertCount,
      enabledPolicyCount: dashboard.enabledPolicyCount,
    };
    const [created] = await this.deps.db
      .insert(bcAnalyticsSnapshots)
      .values({ companyId: scope.companyId, metrics })
      .returning();
    await this.logAudit(scope, 'capture_analytics', 'bc_analytics_snapshots', created?.id);
    return toAnalyticsSummary(created!);
  }

  async listActionDrafts(companyId: string): Promise<BcActionDraftSummary[]> {
    const rows = await this.deps.db.query.bcActionDrafts.findMany({
      where: eq(bcActionDrafts.companyId, companyId),
      orderBy: [desc(bcActionDrafts.createdAt)],
      limit: 50,
    });
    return rows.map(toActionDraftSummary);
  }

  async createActionDraft(scope: StaffScope, input: CreateBcActionDraftRequest): Promise<BcActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(bcActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
      })
      .returning();
    if (!created) throw new EnterpriseBusinessContinuityError('CREATE_FAILED', 'Unable to create action draft');
    await this.logAudit(scope, 'create_action_draft', 'bc_action_drafts', created.id);
    return toActionDraftSummary(created);
  }

  async listAuditLogs(companyId: string): Promise<BcAuditLogSummary[]> {
    const rows = await this.deps.db.query.bcAuditLogs.findMany({
      where: eq(bcAuditLogs.companyId, companyId),
      orderBy: [desc(bcAuditLogs.createdAt)],
      limit: 200,
    });
    return rows.map(toAuditLogSummary);
  }

  private async listLegacyOpsBackupPolicies(companyId: string): Promise<LegacyOpsBackupPolicySummary[]> {
    const rows = await this.deps.db.query.opsBackupPolicies.findMany({
      where: eq(opsBackupPolicies.companyId, companyId),
      orderBy: [desc(opsBackupPolicies.createdAt)],
      limit: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      policyKey: row.policyKey,
      name: row.name,
      scheduleCron: row.scheduleCron,
      retentionDays: row.retentionDays,
      isEnabled: row.isEnabled,
    }));
  }

  private async listLegacyOpsBackupRuns(companyId: string): Promise<LegacyOpsBackupRunSummary[]> {
    const rows = await this.deps.db.query.opsBackupRuns.findMany({
      where: eq(opsBackupRuns.companyId, companyId),
      orderBy: [desc(opsBackupRuns.startedAt)],
      limit: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      backupType: row.backupType,
      sizeBytes: row.sizeBytes,
      verificationPassed: row.verificationPassed,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }

  private buildContinuityHealth(
    backupJobs: BcBackupJobSummary[],
    verificationRecords: BcVerificationRecordSummary[],
    storageHealth: BcStorageHealthSummary[],
    complianceRecords: BcComplianceRecordSummary[],
    legacyOpsBackupRuns: LegacyOpsBackupRunSummary[],
  ): BcContinuityHealthSummary {
    const allJobs = [...backupJobs];
    const completedCount = allJobs.filter((j) => j.status === 'completed' || j.status === 'verified').length;
    const failedBackupCount = allJobs.filter((j) => j.status === 'failed').length;
    const totalFinished = completedCount + failedBackupCount;
    const backupSuccessRatePercent = totalFinished > 0 ? Math.round((completedCount / totalFinished) * 100) : null;

    const pendingVerificationCount = verificationRecords.filter((v) => v.status === 'pending').length;
    const verificationFailureCount = verificationRecords.filter((v) => v.status === 'failed' || v.passed === false).length;

    const completedJobs = allJobs.filter((j) => j.completedAt);
    const oldestBackupAgeHours =
      completedJobs.length > 0
        ? Math.max(
            ...completedJobs.map((j) =>
              Math.floor((Date.now() - new Date(j.completedAt!).getTime()) / (1000 * 60 * 60)),
            ),
          )
        : legacyOpsBackupRuns.length > 0
          ? Math.max(
              ...legacyOpsBackupRuns
                .filter((r) => r.completedAt)
                .map((r) => Math.floor((Date.now() - new Date(r.completedAt!).getTime()) / (1000 * 60 * 60))),
            )
          : null;

    const storageHealthStatus =
      storageHealth.some((s) => s.healthStatus === 'critical' || s.healthStatus === 'unhealthy')
        ? 'critical'
        : storageHealth.some((s) => s.healthStatus === 'degraded' || s.healthStatus === 'warning')
          ? 'degraded'
          : storageHealth.length > 0
            ? 'healthy'
            : 'unknown';

    const recoveryComplianceStatus =
      complianceRecords.some((c) => c.status === 'non_compliant' || c.status === 'critical')
        ? 'non_compliant'
        : complianceRecords.length > 0
          ? 'compliant'
          : 'unknown';

    return {
      backupSuccessRatePercent,
      restoreReadinessStatus: verificationFailureCount > 0 ? 'not_ready' : completedCount > 0 ? 'ready' : 'unknown',
      recoveryReadinessStatus: failedBackupCount > 0 ? 'degraded' : 'ready',
      providerRedundancyStatus: 'unknown',
      storageHealthStatus,
      oldestBackupAgeHours,
      recoveryComplianceStatus,
      failedBackupCount,
      pendingVerificationCount,
      verificationFailureCount,
    };
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.bcPlatformConfig.findFirst({
      where: eq(bcPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db
      .insert(bcPlatformConfig)
      .values({
        companyId,
        backupPolicy: { requireEncryption: true },
        restorePolicy: { requireOwnerApproval: true },
        verificationPolicy: { autoVerify: false },
      })
      .returning();
    return created!;
  }

  private async ensureSystemRecoveryPlans(companyId: string) {
    const existing = await this.deps.db.query.bcRecoveryPlans.findMany({
      where: eq(bcRecoveryPlans.companyId, companyId),
    });
    const existingKeys = new Set(existing.map((p: { scenarioKey: string }) => p.scenarioKey));
    for (const plan of SYSTEM_RECOVERY_PLANS) {
      if (existingKeys.has(plan.scenarioKey)) continue;
      await this.deps.db.insert(bcRecoveryPlans).values({
        companyId,
        scenarioKey: plan.scenarioKey,
        name: plan.name,
        description: plan.description,
        recoverySteps: plan.recoverySteps,
        estimatedRecoveryTimeMinutes: plan.estimatedRecoveryTimeMinutes,
        dependencies: plan.dependencies,
        validationChecklist: plan.validationChecklist,
        workflowStatus: 'published',
      });
    }
  }

  private async getLatestAnalytics(companyId: string): Promise<BcAnalyticsSummary | null> {
    const row = await this.deps.db.query.bcAnalyticsSnapshots.findFirst({
      where: eq(bcAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(bcAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async getPolicyNameMap(companyId: string, policyIds: string[]) {
    if (policyIds.length === 0) return new Map<string, string>();
    const rows = await this.deps.db.query.bcBackupPolicies.findMany({
      where: and(eq(bcBackupPolicies.companyId, companyId), inArray(bcBackupPolicies.id, policyIds)),
    });
    return new Map(rows.map((r: { id: string; name: string }) => [r.id, r.name]));
  }

  private async upsertContinuityAlert(
    companyId: string,
    input: { alertType: string; severity: 'info' | 'warning' | 'critical'; title: string; description?: string },
  ): Promise<BcContinuityAlertSummary> {
    const existing = await this.deps.db.query.bcContinuityAlerts.findFirst({
      where: and(
        eq(bcContinuityAlerts.companyId, companyId),
        eq(bcContinuityAlerts.alertType, input.alertType),
        eq(bcContinuityAlerts.status, 'open'),
      ),
    });
    if (existing) {
      const [updated] = await this.deps.db
        .update(bcContinuityAlerts)
        .set({
          severity: input.severity,
          title: input.title,
          description: input.description ?? existing.description,
          updatedAt: new Date(),
        })
        .where(eq(bcContinuityAlerts.id, existing.id))
        .returning();
      return toContinuityAlertSummary(updated ?? existing);
    }

    const [created] = await this.deps.db
      .insert(bcContinuityAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description ?? null,
        sourceModule: 'business_continuity',
      })
      .returning();
    return toContinuityAlertSummary(created!);
  }

  private async logAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(bcAuditLogs).values({
      companyId: scope.companyId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      userId: scope.userId,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(row: typeof bcPlatformConfig.$inferSelect): BcPlatformConfigSummary {
  return {
    backupPolicy: row.backupPolicy,
    restorePolicy: row.restorePolicy,
    verificationPolicy: row.verificationPolicy,
    drPolicy: row.drPolicy,
    compliancePolicy: row.compliancePolicy,
    encryptionRequired: row.encryptionRequired,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toBackupPolicySummary(row: typeof bcBackupPolicies.$inferSelect): BcBackupPolicySummary {
  return {
    id: row.id,
    policyKey: row.policyKey,
    name: row.name,
    description: row.description,
    scheduleType: row.scheduleType,
    scheduleCron: row.scheduleCron,
    retentionDays: row.retentionDays,
    backupScope: row.backupScope,
    isEnabled: row.isEnabled,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toBackupJobSummary(
  row: typeof bcBackupJobs.$inferSelect,
  policyName: string | null,
): BcBackupJobSummary {
  return {
    id: row.id,
    policyId: row.policyId,
    policyName,
    scheduleType: row.scheduleType,
    backupScope: row.backupScope,
    status: row.status,
    encrypted: row.encrypted,
    sizeBytes: row.sizeBytes,
    verificationStatus: row.verificationStatus,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toRestoreRequestSummary(row: typeof bcRestoreRequests.$inferSelect): BcRestoreRequestSummary {
  return {
    id: row.id,
    restoreScope: row.restoreScope,
    targetModule: row.targetModule,
    targetEntityId: row.targetEntityId,
    pointInTime: row.pointInTime?.toISOString() ?? null,
    status: row.status,
    requiresOwnerApproval: row.requiresOwnerApproval,
    title: row.title,
    description: row.description,
    requestedByUserId: row.requestedByUserId,
    approvedByUserId: row.approvedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRecoveryPlanSummary(row: typeof bcRecoveryPlans.$inferSelect): BcRecoveryPlanSummary {
  return {
    id: row.id,
    scenarioKey: row.scenarioKey,
    name: row.name,
    description: row.description,
    recoverySteps: row.recoverySteps,
    estimatedRecoveryTimeMinutes: row.estimatedRecoveryTimeMinutes,
    dependencies: row.dependencies,
    validationChecklist: row.validationChecklist,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecoveryTestSummary(row: typeof bcRecoveryTests.$inferSelect): BcRecoveryTestSummary {
  return {
    id: row.id,
    recoveryPlanId: row.recoveryPlanId,
    backupJobId: row.backupJobId,
    title: row.title,
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes,
    success: row.success,
    failures: row.failures,
    recoveryTimeMinutes: row.recoveryTimeMinutes,
    lessonsLearned: row.lessonsLearned,
    isProductionSafe: row.isProductionSafe,
    createdAt: row.createdAt.toISOString(),
  };
}

function toVerificationRecordSummary(row: typeof bcVerificationRecords.$inferSelect): BcVerificationRecordSummary {
  return {
    id: row.id,
    backupJobId: row.backupJobId,
    verificationType: row.verificationType,
    status: row.status,
    passed: row.passed,
    findings: row.findings,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toStorageHealthSummary(row: typeof bcStorageHealthSnapshots.$inferSelect): BcStorageHealthSummary {
  return {
    id: row.id,
    storageType: row.storageType,
    healthStatus: row.healthStatus,
    usageBytes: row.usageBytes,
    capacityBytes: row.capacityBytes,
    redundancyLevel: row.redundancyLevel,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toComplianceRecordSummary(row: typeof bcComplianceRecords.$inferSelect): BcComplianceRecordSummary {
  return {
    id: row.id,
    complianceType: row.complianceType,
    status: row.status,
    rpoMinutes: row.rpoMinutes,
    rtoMinutes: row.rtoMinutes,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toContinuityAlertSummary(row: typeof bcContinuityAlerts.$inferSelect): BcContinuityAlertSummary {
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

function toAnalyticsSummary(row: typeof bcAnalyticsSnapshots.$inferSelect): BcAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof bcActionDrafts.$inferSelect): BcActionDraftSummary {
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

function toAuditLogSummary(row: typeof bcAuditLogs.$inferSelect): BcAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
