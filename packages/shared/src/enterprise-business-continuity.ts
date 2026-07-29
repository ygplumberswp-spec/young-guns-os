export type BcBackupScheduleType = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'manual';

export type BcRecoveryScenario =
  | 'database_failure'
  | 'storage_failure'
  | 'ai_provider_outage'
  | 'communication_provider_outage'
  | 'payment_provider_outage'
  | 'integration_failure'
  | 'infrastructure_outage';

export type BcRestoreScope =
  | 'point_in_time'
  | 'full_tenant'
  | 'module'
  | 'document'
  | 'configuration';

export type BcPlatformConfigSummary = {
  backupPolicy: Record<string, unknown>;
  restorePolicy: Record<string, unknown>;
  verificationPolicy: Record<string, unknown>;
  drPolicy: Record<string, unknown>;
  compliancePolicy: Record<string, unknown>;
  encryptionRequired: boolean;
  auditRetentionDays: number;
};

export type BcBackupPolicySummary = {
  id: string;
  policyKey: string;
  name: string;
  description: string | null;
  scheduleType: BcBackupScheduleType;
  scheduleCron: string | null;
  retentionDays: number;
  backupScope: Record<string, unknown>;
  isEnabled: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type BcBackupJobSummary = {
  id: string;
  policyId: string | null;
  policyName: string | null;
  scheduleType: BcBackupScheduleType;
  backupScope: Record<string, unknown>;
  status: string;
  encrypted: boolean;
  sizeBytes: number | null;
  verificationStatus: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type BcRestoreRequestSummary = {
  id: string;
  restoreScope: BcRestoreScope;
  targetModule: string | null;
  targetEntityId: string | null;
  pointInTime: string | null;
  status: string;
  requiresOwnerApproval: boolean;
  title: string;
  description: string | null;
  requestedByUserId: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BcRecoveryPlanSummary = {
  id: string;
  scenarioKey: BcRecoveryScenario;
  name: string;
  description: string | null;
  recoverySteps: Array<Record<string, unknown>>;
  estimatedRecoveryTimeMinutes: number | null;
  dependencies: Array<Record<string, unknown>>;
  validationChecklist: Array<Record<string, unknown>>;
  workflowStatus: string;
  createdAt: string;
};

export type BcRecoveryTestSummary = {
  id: string;
  recoveryPlanId: string | null;
  backupJobId: string | null;
  title: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  success: boolean | null;
  failures: Array<Record<string, unknown>>;
  recoveryTimeMinutes: number | null;
  lessonsLearned: string | null;
  isProductionSafe: boolean;
  createdAt: string;
};

export type BcVerificationRecordSummary = {
  id: string;
  backupJobId: string | null;
  verificationType: string;
  status: string;
  passed: boolean | null;
  findings: Record<string, unknown>;
  verifiedAt: string | null;
  createdAt: string;
};

export type BcStorageHealthSummary = {
  id: string;
  storageType: string;
  healthStatus: string;
  usageBytes: number | null;
  capacityBytes: number | null;
  redundancyLevel: string | null;
  capturedAt: string;
};

export type BcComplianceRecordSummary = {
  id: string;
  complianceType: string;
  status: string;
  rpoMinutes: number | null;
  rtoMinutes: number | null;
  lastVerifiedAt: string | null;
  createdAt: string;
};

export type BcContinuityAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  createdAt: string;
};

export type BcAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type BcAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type BcActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type BcContinuityHealthSummary = {
  backupSuccessRatePercent: number | null;
  restoreReadinessStatus: string;
  recoveryReadinessStatus: string;
  providerRedundancyStatus: string;
  storageHealthStatus: string;
  oldestBackupAgeHours: number | null;
  recoveryComplianceStatus: string;
  failedBackupCount: number;
  pendingVerificationCount: number;
  verificationFailureCount: number;
};

export type LegacyOpsBackupPolicySummary = {
  id: string;
  policyKey: string;
  name: string;
  scheduleCron: string | null;
  retentionDays: number;
  isEnabled: boolean;
};

export type LegacyOpsBackupRunSummary = {
  id: string;
  status: string;
  backupType: string;
  sizeBytes: number | null;
  verificationPassed: boolean | null;
  startedAt: string;
  completedAt: string | null;
};

export type EnterpriseBusinessContinuityDashboard = {
  summary: string;
  platformConfig: BcPlatformConfigSummary;
  continuityHealth: BcContinuityHealthSummary;
  backupPolicies: BcBackupPolicySummary[];
  backupJobs: BcBackupJobSummary[];
  restoreRequests: BcRestoreRequestSummary[];
  recoveryPlans: BcRecoveryPlanSummary[];
  recoveryTests: BcRecoveryTestSummary[];
  verificationRecords: BcVerificationRecordSummary[];
  storageHealth: BcStorageHealthSummary[];
  complianceRecords: BcComplianceRecordSummary[];
  analytics: BcAnalyticsSummary | null;
  recentAlerts: BcContinuityAlertSummary[];
  openAlertCount: number;
  enabledPolicyCount: number;
  legacyOpsBackupPolicies: LegacyOpsBackupPolicySummary[];
  legacyOpsBackupRuns: LegacyOpsBackupRunSummary[];
  overallBusinessContinuityHealthStatus: string;
};

export type EnterpriseBusinessContinuityAuraContext = {
  summary: string;
  failedBackupCount: number;
  restoreReadinessStatus: string;
  recoveryReadinessStatus: string;
  openAlertCount: number;
  overallBusinessContinuityHealthStatus: string;
};

export type UpdateBcPlatformConfigRequest = {
  backupPolicy?: Record<string, unknown>;
  restorePolicy?: Record<string, unknown>;
  verificationPolicy?: Record<string, unknown>;
  drPolicy?: Record<string, unknown>;
  compliancePolicy?: Record<string, unknown>;
  encryptionRequired?: boolean;
  auditRetentionDays?: number;
};

export type CreateBcBackupPolicyRequest = {
  policyKey: string;
  name: string;
  description?: string;
  scheduleType?: BcBackupScheduleType;
  scheduleCron?: string;
  retentionDays?: number;
  backupScope?: Record<string, unknown>;
  isEnabled?: boolean;
};

export type CreateBcBackupJobRequest = {
  policyId?: string;
  scheduleType?: BcBackupScheduleType;
  backupScope?: Record<string, unknown>;
};

export type CreateBcRestoreRequestRequest = {
  restoreScope: BcRestoreScope;
  targetModule?: string;
  targetEntityId?: string;
  pointInTime?: string;
  title: string;
  description?: string;
  requiresOwnerApproval?: boolean;
  metadata?: Record<string, unknown>;
};

export type UpdateBcRestoreRequestRequest = {
  status?: 'pending_approval' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
};

export type CreateBcRecoveryPlanRequest = {
  scenarioKey: BcRecoveryScenario;
  name: string;
  description?: string;
  recoverySteps?: Array<Record<string, unknown>>;
  estimatedRecoveryTimeMinutes?: number;
  dependencies?: Array<Record<string, unknown>>;
  validationChecklist?: Array<Record<string, unknown>>;
};

export type CreateBcRecoveryTestRequest = {
  recoveryPlanId?: string;
  backupJobId?: string;
  title: string;
  scheduledAt?: string;
  isProductionSafe?: boolean;
};

export type UpdateBcRecoveryTestRequest = {
  status?: 'scheduled' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  success?: boolean;
  durationMinutes?: number;
  recoveryTimeMinutes?: number;
  lessonsLearned?: string;
  failures?: Array<Record<string, unknown>>;
};

export type CreateBcVerificationRecordRequest = {
  backupJobId?: string;
  verificationType: string;
  passed?: boolean;
  findings?: Record<string, unknown>;
};

export type CreateBcStorageHealthSnapshotRequest = {
  storageType: string;
  healthStatus?: string;
  usageBytes?: number;
  capacityBytes?: number;
  redundancyLevel?: string;
  metadata?: Record<string, unknown>;
};

export type CreateBcComplianceRecordRequest = {
  complianceType: string;
  status?: string;
  rpoMinutes?: number;
  rtoMinutes?: number;
};

export type CreateBcActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};
