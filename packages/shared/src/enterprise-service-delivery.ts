import type { DispatchOperationsDashboard } from './dispatch-intelligence.js';
import type { JobsStats } from './jobs.js';
import type { QualityExecutiveDashboard } from './quality-assurance.js';

export type SdPlatformConfigSummary = {
  serviceStandards: Record<string, unknown>;
  promiseTemplates: Record<string, unknown>;
  slaTemplates: Record<string, unknown>;
  inspectionTemplates: Record<string, unknown>;
  qualityStandards: Record<string, unknown>;
  warrantyStandards: Record<string, unknown>;
  auditRetentionDays: number;
};

export type SdServicePromiseSummary = {
  id: string;
  jobId: string | null;
  promiseType: string;
  title: string;
  description: string | null;
  workflowStatus: string;
  promisedAt: string | null;
  dueAt: string | null;
  fulfilledAt: string | null;
  ownerUserId: string | null;
};

export type SdSlaFrameworkSummary = {
  id: string;
  name: string;
  frameworkKey: string;
  slaType: string;
  targetMinutes: number | null;
  warningThresholdMinutes: number | null;
  isActive: boolean;
};

export type SdSlaRecordSummary = {
  id: string;
  jobId: string | null;
  frameworkId: string | null;
  slaType: string;
  targetAt: string | null;
  breachedAt: string | null;
  metAt: string | null;
  breachMinutes: number | null;
};

export type SdJobExecutionSnapshotSummary = {
  id: string;
  jobId: string;
  technicianUserId: string | null;
  snapshotKey: string;
  executionPhase: string | null;
  capturedAt: string;
};

export type SdInspectionTemplateSummary = {
  id: string;
  name: string;
  templateKey: string;
  description: string | null;
  isActive: boolean;
};

export type SdInspectionSummary = {
  id: string;
  jobId: string | null;
  templateId: string | null;
  inspectionStatus: string;
  inspectorUserId: string | null;
  completedAt: string | null;
};

export type SdQaInspectionSummary = {
  id: string;
  jobId: string | null;
  inspectionId: string | null;
  qaScore: string | null;
  workflowStatus: string;
  reviewerUserId: string | null;
  reviewedAt: string | null;
};

export type SdDefectSummary = {
  id: string;
  jobId: string | null;
  inspectionId: string | null;
  defectType: string;
  severity: string;
  description: string;
  workflowStatus: string;
  reportedByUserId: string | null;
};

export type SdNonConformanceSummary = {
  id: string;
  jobId: string | null;
  defectId: string | null;
  ncNumber: string | null;
  title: string;
  description: string | null;
  workflowStatus: string;
  ownerUserId: string | null;
};

export type SdCorrectiveActionSummary = {
  id: string;
  jobId: string | null;
  nonConformanceId: string | null;
  title: string;
  actionType: string;
  workflowStatus: string;
  assignedUserId: string | null;
  dueAt: string | null;
  completedAt: string | null;
};

export type SdPreventiveActionSummary = {
  id: string;
  correctiveActionId: string | null;
  title: string;
  workflowStatus: string;
  assignedUserId: string | null;
  dueAt: string | null;
  completedAt: string | null;
};

export type SdFirstTimeFixAnalysisSummary = {
  id: string;
  jobId: string;
  technicianUserId: string | null;
  fixedFirstTime: boolean;
  rootCause: string | null;
  capturedAt: string;
};

export type SdCustomerAcceptanceSummary = {
  id: string;
  jobId: string;
  customerId: string;
  workflowStatus: string;
  signatureRef: string | null;
  notes: string | null;
  acceptedAt: string | null;
};

export type SdWarrantyRecordSummary = {
  id: string;
  jobId: string;
  customerId: string;
  warrantyType: string;
  startDate: string | null;
  endDate: string | null;
};

export type SdWarrantyClaimTrackingSummary = {
  id: string;
  warrantyRecordId: string;
  jobId: string | null;
  claimNumber: string | null;
  workflowStatus: string;
  description: string | null;
  resolvedAt: string | null;
};

export type SdCallbackRecordSummary = {
  id: string;
  jobId: string | null;
  originalJobId: string | null;
  callbackReason: string;
  workflowStatus: string;
  assignedUserId: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
};

export type SdContinuousImprovementInitiativeSummary = {
  id: string;
  title: string;
  initiativeKey: string;
  workflowStatus: string;
  ownerUserId: string | null;
  targetDate: string | null;
};

export type SdHandoverRecordSummary = {
  id: string;
  jobId: string;
  handoverType: string;
  workflowStatus: string;
  handedOverByUserId: string | null;
  receivedByUserId: string | null;
  handoverAt: string | null;
};

export type SdVariationRecordSummary = {
  id: string;
  jobId: string;
  variationType: string;
  description: string;
  workflowStatus: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
};

export type SdCompletionCertificateSummary = {
  id: string;
  jobId: string;
  certificateNumber: string | null;
  workflowStatus: string;
  issuedAt: string | null;
  issuedByUserId: string | null;
};

export type SdServiceAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  jobId: string | null;
  createdAt: string;
};

export type SdServiceMonitoringSummary = {
  slaBreachCount: number;
  overdueInspectionCount: number;
  openCallbackCount: number;
  promiseBreachCount: number;
  openDefectCount: number;
  pendingCorrectiveActionCount: number;
  alerts: string[];
};

export type SdAnalyticsSummary = {
  activeJobCount: number;
  completedJobCount: number;
  openPromiseCount: number;
  slaBreachCount: number;
  openDefectCount: number;
  openCallbackCount: number;
  firstTimeFixRatePercent: string | null;
  openAlertCount: number;
  currency: string;
  capturedAt: string;
};

export type EnterpriseServiceDeliveryDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: SdPlatformConfigSummary;
  jobStats: JobsStats;
  qualityStats: QualityExecutiveDashboard;
  dispatchStats: DispatchOperationsDashboard;
  promiseCount: number;
  openPromiseCount: number;
  slaRecordCount: number;
  slaBreachCount: number;
  inspectionCount: number;
  openDefectCount: number;
  openCallbackCount: number;
  openAlertCount: number;
  currency: string;
  analytics: SdAnalyticsSummary | null;
  serviceMonitoring: SdServiceMonitoringSummary;
  recentPromises: SdServicePromiseSummary[];
  recentSlaRecords: SdSlaRecordSummary[];
  recentInspections: SdInspectionSummary[];
  recentCallbacks: SdCallbackRecordSummary[];
  recentAlerts: SdServiceAlertSummary[];
  recentDefects: SdDefectSummary[];
  recentCorrectiveActions: SdCorrectiveActionSummary[];
};

export type EnterpriseServiceDeliveryAuraContext = {
  activeJobCount: number;
  slaBreachCount: number;
  openCallbackCount: number;
  openDefectCount: number;
  firstTimeFixRatePercent: string | null;
  openAlertCount: number;
  summary: string;
};

export type SdPortalServiceSummary = {
  activeJobCount: number;
  openPromiseCount: number;
  openCallbackCount: number;
  warrantyRecordCount: number;
  pendingAcceptanceCount: number;
  summary: string;
};

export type UpdateSdPlatformConfigRequest = {
  serviceStandards?: Record<string, unknown>;
  promiseTemplates?: Record<string, unknown>;
  slaTemplates?: Record<string, unknown>;
  inspectionTemplates?: Record<string, unknown>;
  qualityStandards?: Record<string, unknown>;
  warrantyStandards?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateSdServicePromiseRequest = {
  jobId?: string;
  promiseType: string;
  title: string;
  description?: string;
  promisedAt?: string;
  dueAt?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdServicePromiseRequest = Partial<CreateSdServicePromiseRequest> & {
  workflowStatus?: string;
  fulfilledAt?: string;
};

export type CreateSdSlaFrameworkRequest = {
  name: string;
  frameworkKey: string;
  slaType: string;
  targetMinutes?: number;
  warningThresholdMinutes?: number;
  config?: Record<string, unknown>;
};

export type UpdateSdSlaFrameworkRequest = Partial<CreateSdSlaFrameworkRequest> & {
  isActive?: boolean;
};

export type CreateSdSlaRecordRequest = {
  jobId?: string;
  frameworkId?: string;
  slaType: string;
  targetAt?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdSlaRecordRequest = Partial<CreateSdSlaRecordRequest> & {
  breachedAt?: string;
  metAt?: string;
  breachMinutes?: number;
};

export type CreateSdInspectionTemplateRequest = {
  name: string;
  templateKey: string;
  description?: string;
  checklist?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type UpdateSdInspectionTemplateRequest = Partial<CreateSdInspectionTemplateRequest> & {
  isActive?: boolean;
};

export type CreateSdInspectionRequest = {
  jobId?: string;
  templateId?: string;
  findings?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type UpdateSdInspectionRequest = Partial<CreateSdInspectionRequest> & {
  inspectionStatus?: string;
};

export type CreateSdQaInspectionRequest = {
  jobId?: string;
  inspectionId?: string;
  qaScore?: number;
  notes?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdQaInspectionRequest = Partial<CreateSdQaInspectionRequest> & {
  workflowStatus?: string;
};

export type CreateSdDefectRequest = {
  jobId?: string;
  inspectionId?: string;
  defectType: string;
  severity?: string;
  description: string;
  config?: Record<string, unknown>;
};

export type UpdateSdDefectRequest = Partial<CreateSdDefectRequest> & {
  workflowStatus?: string;
};

export type CreateSdNonConformanceRequest = {
  jobId?: string;
  defectId?: string;
  ncNumber?: string;
  title: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdNonConformanceRequest = Partial<CreateSdNonConformanceRequest> & {
  workflowStatus?: string;
};

export type CreateSdCorrectiveActionRequest = {
  jobId?: string;
  nonConformanceId?: string;
  title: string;
  actionType: string;
  assignedUserId?: string;
  dueAt?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdCorrectiveActionRequest = Partial<CreateSdCorrectiveActionRequest> & {
  workflowStatus?: string;
  completedAt?: string;
};

export type CreateSdPreventiveActionRequest = {
  correctiveActionId?: string;
  title: string;
  assignedUserId?: string;
  dueAt?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdPreventiveActionRequest = Partial<CreateSdPreventiveActionRequest> & {
  workflowStatus?: string;
  completedAt?: string;
};

export type CreateSdFirstTimeFixAnalysisRequest = {
  jobId: string;
  technicianUserId?: string;
  fixedFirstTime?: boolean;
  rootCause?: string;
  analysis?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateSdCustomerAcceptanceRequest = {
  jobId: string;
  customerId: string;
  signatureRef?: string;
  notes?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdCustomerAcceptanceRequest = Partial<CreateSdCustomerAcceptanceRequest> & {
  workflowStatus?: string;
  acceptedAt?: string;
};

export type CreateSdWarrantyRecordRequest = {
  jobId: string;
  customerId: string;
  warrantyType: string;
  startDate?: string;
  endDate?: string;
  terms?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type UpdateSdWarrantyRecordRequest = Partial<CreateSdWarrantyRecordRequest>;

export type CreateSdWarrantyClaimTrackingRequest = {
  warrantyRecordId: string;
  jobId?: string;
  claimNumber?: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdWarrantyClaimTrackingRequest = Partial<CreateSdWarrantyClaimTrackingRequest> & {
  workflowStatus?: string;
  resolvedAt?: string;
};

export type CreateSdCallbackRecordRequest = {
  jobId?: string;
  originalJobId?: string;
  callbackReason: string;
  assignedUserId?: string;
  scheduledAt?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdCallbackRecordRequest = Partial<CreateSdCallbackRecordRequest> & {
  workflowStatus?: string;
  completedAt?: string;
};

export type CreateSdContinuousImprovementInitiativeRequest = {
  title: string;
  initiativeKey: string;
  targetDate?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdContinuousImprovementInitiativeRequest = Partial<CreateSdContinuousImprovementInitiativeRequest> & {
  workflowStatus?: string;
};

export type CreateSdHandoverRecordRequest = {
  jobId: string;
  handoverType: string;
  handedOverByUserId?: string;
  receivedByUserId?: string;
  handoverAt?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdHandoverRecordRequest = Partial<CreateSdHandoverRecordRequest> & {
  workflowStatus?: string;
};

export type CreateSdVariationRecordRequest = {
  jobId: string;
  variationType: string;
  description: string;
  config?: Record<string, unknown>;
};

export type UpdateSdVariationRecordRequest = Partial<CreateSdVariationRecordRequest> & {
  workflowStatus?: string;
  approvedAt?: string;
};

export type CreateSdCompletionCertificateRequest = {
  jobId: string;
  certificateNumber?: string;
  config?: Record<string, unknown>;
};

export type UpdateSdCompletionCertificateRequest = Partial<CreateSdCompletionCertificateRequest> & {
  workflowStatus?: string;
  issuedAt?: string;
};

export type CreateSdServiceActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};
