export type RlmValidationStatus = 'pending' | 'running' | 'passed' | 'failed' | 'warning' | 'skipped';

export type RlmReleaseStatus = 'not_ready' | 'blocked' | 'warning' | 'ready' | 'released' | 'unknown';

export type RlmStorePlatform = 'apple_app_store' | 'google_play_store';

export type RlmDocCategory =
  | 'system_overview'
  | 'administrator_guide'
  | 'user_guide'
  | 'deployment_guide'
  | 'disaster_recovery'
  | 'api_guide'
  | 'integration_guide'
  | 'changelog'
  | 'version_history';

export type RlmChecklistStatus = 'pending' | 'passed' | 'failed' | 'skipped' | 'manual';

export type RlmPlatformConfigSummary = {
  releasePolicy: Record<string, unknown>;
  documentationPolicy: Record<string, unknown>;
  mobilePolicy: Record<string, unknown>;
  alertLevelConfig: Record<string, unknown>;
  auditRetentionDays: number;
};

export type UpdateRlmPlatformConfigRequest = Partial<RlmPlatformConfigSummary>;

export type RlmMobilePackagingReviewSummary = {
  id: string;
  reviewKey: string;
  status: RlmValidationStatus;
  iosReady: boolean;
  androidReady: boolean;
  findingCount: number;
  warningCount: number;
  findings: Array<Record<string, unknown>>;
  reviewedAt: string;
};

export type RlmAppStoreReadinessSummary = {
  id: string;
  reviewKey: string;
  storePlatform: RlmStorePlatform;
  status: RlmValidationStatus;
  checklistCompleteCount: number;
  checklistTotalCount: number;
  storeListing: Record<string, unknown>;
  reviewedAt: string;
};

export type RlmBrandingReviewSummary = {
  id: string;
  reviewKey: string;
  status: RlmValidationStatus;
  findingCount: number;
  warningCount: number;
  findings: Array<Record<string, unknown>>;
  reviewedAt: string;
};

export type RlmUxReviewSummary = {
  id: string;
  reviewKey: string;
  status: RlmValidationStatus;
  recommendationCount: number;
  findings: Array<Record<string, unknown>>;
  reviewedAt: string;
};

export type RlmDocumentationArtifactSummary = {
  id: string;
  docKey: string;
  docCategory: RlmDocCategory;
  title: string;
  status: RlmValidationStatus;
  completenessPercent: number;
  contentOutline: Record<string, unknown>;
  lastUpdatedAt: string;
};

export type RlmVersionRecordSummary = {
  id: string;
  versionKey: string;
  versionNumber: string;
  versionName: string;
  status: RlmReleaseStatus;
  releaseNotes: Record<string, unknown>;
  featureSummary: Array<Record<string, unknown>>;
  breakingChanges: Array<Record<string, unknown>>;
  migrationNotes: Array<Record<string, unknown>>;
  knownLimitations: Array<Record<string, unknown>>;
  publishedAt: string | null;
  createdAt: string;
};

export type RlmLaunchChecklistItemSummary = {
  id: string;
  itemKey: string;
  itemName: string;
  category: string;
  status: RlmChecklistStatus;
  isRequired: boolean;
  notes: string | null;
  completedAt: string | null;
};

export type RlmPlatformAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  createdAt: string;
};

export type RlmAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type RlmAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type RlmActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  createdAt: string;
};

export type CreateRlmActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type RlmReleaseReadinessSummary = {
  releaseStatus: RlmReleaseStatus;
  mobileReady: boolean;
  appStoreReady: boolean;
  brandingReady: boolean;
  documentationComplete: boolean;
  launchChecklistComplete: boolean;
  versionFinalized: boolean;
  pendingChecklistCount: number;
  documentationCompleteness: number;
  warningCount: number;
};

export type EnterpriseReleaseManagementDashboard = {
  summary: string;
  platformConfig: RlmPlatformConfigSummary;
  releaseReadiness: RlmReleaseReadinessSummary;
  latestMobileReview: RlmMobilePackagingReviewSummary | null;
  appStoreReadiness: RlmAppStoreReadinessSummary[];
  latestBrandingReview: RlmBrandingReviewSummary | null;
  latestUxReview: RlmUxReviewSummary | null;
  documentationArtifacts: RlmDocumentationArtifactSummary[];
  versionRecord: RlmVersionRecordSummary | null;
  launchChecklist: RlmLaunchChecklistItemSummary[];
  productionLaunchSummary: Record<string, unknown> | null;
  analytics: RlmAnalyticsSummary | null;
  recentAlerts: RlmPlatformAlertSummary[];
  openAlertCount: number;
  overallReleaseStatus: string;
};

export type EnterpriseReleaseManagementAuraContext = {
  summary: string;
  releaseStatus: RlmReleaseStatus;
  documentationCompleteness: number;
  pendingChecklistCount: number;
  mobileReady: boolean;
  openAlertCount: number;
  overallReleaseStatus: string;
};
