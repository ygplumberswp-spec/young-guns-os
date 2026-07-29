import type {
  CandidatePipelineStage,
  CertificationSummary,
  EmployeeSkillSummary,
  TechnicianPerformanceInsight,
  TrainingRecordSummary,
  WorkforceStats,
} from './workforce.js';

export type WiProviderCategory = 'payroll' | 'hr' | 'accounting' | 'timekeeping';

export type WiProviderType =
  | 'sage_payroll'
  | 'sage_business_cloud'
  | 'xero_payroll'
  | 'quickbooks_payroll'
  | 'payspace'
  | 'simplepay'
  | 'bamboohr'
  | 'deel'
  | 'workday'
  | 'sap_successfactors'
  | 'zoho_people'
  | 'employment_hero'
  | 'microsoft_dynamics'
  | 'csv_import_export'
  | 'sftp'
  | 'generic_rest'
  | 'webhook'
  | 'custom';

export const WI_PROVIDER_TYPES: WiProviderType[] = [
  'sage_payroll',
  'sage_business_cloud',
  'xero_payroll',
  'quickbooks_payroll',
  'payspace',
  'simplepay',
  'bamboohr',
  'deel',
  'workday',
  'sap_successfactors',
  'zoho_people',
  'employment_hero',
  'microsoft_dynamics',
  'csv_import_export',
  'sftp',
  'generic_rest',
  'webhook',
  'custom',
];

export type WiLifecycleStage =
  | 'candidate'
  | 'applicant'
  | 'interview'
  | 'offer'
  | 'pre_employment'
  | 'onboarding'
  | 'active'
  | 'probation'
  | 'role_change'
  | 'promotion'
  | 'transfer'
  | 'suspension'
  | 'leave'
  | 'offboarding'
  | 'termination'
  | 'alumni';

export type WiLifecycleStatus = 'draft' | 'pending_approval' | 'approved' | 'executed' | 'cancelled';
export type WiTimesheetStatus = 'draft' | 'submitted' | 'approved' | 'corrected';
export type WiLeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type WiPayrollPrepStatus = 'draft' | 'pending_approval' | 'approved' | 'exported' | 'failed';
export type WiSyncDirection = 'inbound' | 'outbound' | 'bidirectional';
export type WiAdapterStatus = 'active' | 'inactive' | 'testing' | 'error';

export type WiHrDraftType =
  | 'termination'
  | 'suspension'
  | 'role_change'
  | 'payroll_export'
  | 'offboarding'
  | 'disciplinary'
  | 'onboarding_plan'
  | 'development_plan'
  | 'performance_report'
  | 'hr_communication'
  | 'payroll_exception_summary'
  | 'training_recommendation'
  | 'technician_match';

export type WiPlatformConfigSummary = {
  globalPolicies: Record<string, unknown>;
  providerAdapterTemplates: Record<string, unknown>;
  jurisdictionTemplates: Record<string, unknown>;
  leavePolicyDefaults: Record<string, unknown>;
  performanceRules: Record<string, unknown>;
  privacyPolicies: Record<string, unknown>;
  auditRetentionDays: number;
};

export type WiWorkforceCategorySummary = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
};

export type WiWorkforceProfileSummary = {
  id: string;
  userId: string;
  userName: string;
  categoryId: string | null;
  categoryName: string | null;
  customCategoryName: string | null;
  employeeNumber: string | null;
  employmentType: string | null;
  jobTitle: string | null;
  department: string | null;
  branch: string | null;
  managerUserId: string | null;
  managerName: string | null;
  startDate: string | null;
  contractStatus: string | null;
  lifecycleStage: WiLifecycleStage;
  payrollProviderRef: string | null;
  accountingProviderRef: string | null;
};

export type WiProviderAdapterSummary = {
  id: string;
  providerCategory: WiProviderCategory;
  providerType: WiProviderType;
  providerKey: string;
  name: string;
  status: WiAdapterStatus;
  isPrimary: boolean;
  syncDirection: WiSyncDirection;
  syncFrequencyMinutes: number | null;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastSyncAt: string | null;
};

export type WiLifecycleStageHistorySummary = {
  id: string;
  userId: string;
  stage: WiLifecycleStage;
  status: WiLifecycleStatus;
  title: string;
  description: string | null;
  effectiveDate: string | null;
  occurredAt: string;
};

export type WiTimesheetSummary = {
  id: string;
  userId: string;
  userName: string;
  jobId: string | null;
  periodStart: string;
  periodEnd: string;
  status: WiTimesheetStatus;
  standardHours: number;
  overtimeHours: number;
  travelHours: number;
  standbyHours: number;
  approvedAt: string | null;
  correctionCount: number;
};

export type WiTimesheetCorrectionSummary = {
  id: string;
  timesheetId: string;
  fieldName: string;
  originalValue: string;
  correctedValue: string;
  reason: string;
  approverName: string;
  correctedAt: string;
};

export type WiLeaveCategorySummary = {
  id: string;
  name: string;
  categoryKey: string;
  description: string | null;
  isPaid: boolean;
  isActive: boolean;
};

export type WiLeaveBalanceSummary = {
  id: string;
  userId: string;
  userName: string;
  categoryName: string;
  balanceDays: number;
  accruedDays: number;
  usedDays: number;
  asOfDate: string;
};

export type WiLeaveApplicationSummary = {
  id: string;
  userId: string;
  userName: string;
  categoryName: string;
  status: WiLeaveStatus;
  startDate: string;
  endDate: string;
  daysRequested: number;
  reason: string | null;
  approvedAt: string | null;
};

export type WiPayrollPeriodSummary = {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: WiPayrollPrepStatus;
};

export type WiPayrollPreparationSummary = {
  id: string;
  payrollPeriodId: string;
  periodName: string;
  status: WiPayrollPrepStatus;
  exceptionCount: number;
  earningsTotalCents: number;
  deductionsTotalCents: number;
  currency: string;
  approvedAt: string | null;
  exportedAt: string | null;
};

export type WiTrainingCourseSummary = {
  id: string;
  courseKey: string;
  title: string;
  description: string | null;
  providerName: string | null;
  isRequired: boolean;
  isActive: boolean;
};

export type WiTechnicianPerformanceSnapshotSummary = {
  id: string;
  userId: string;
  userName: string;
  jobsCompleted: number;
  jobsAssigned: number;
  firstTimeFixRate: number | null;
  averageJobDurationHours: number | null;
  onTimeArrivalRate: number | null;
  reworkCount: number;
  callbackCount: number;
  customerSatisfactionAvg: number | null;
  explanation: string | null;
  capturedAt: string;
};

export type WiSkillsMatrixEntry = {
  userId: string;
  userName: string;
  skills: EmployeeSkillSummary[];
  certifications: CertificationSummary[];
  jobsCompleted: number;
  firstTimeFixRate: number | null;
  customerSatisfactionAvg: number | null;
  trainingGaps: string[];
  availabilityStatus: string;
};

export type WiHrActionDraftSummary = {
  id: string;
  userId: string | null;
  draftType: WiHrDraftType;
  status: WiLifecycleStatus;
  subject: string;
  description: string | null;
  createdAt: string;
};

export type WiAnalyticsSummary = {
  headcount: number;
  contractorCount: number;
  turnoverRate: number | null;
  absenceRate: number | null;
  overtimeHours: number | null;
  capacityUtilization: number | null;
  labourCostCents: number;
  certificationRiskCount: number;
  payrollExceptionCount: number;
  capturedAt: string;
};

export type WiWorkforceCapacitySummary = {
  activeTechnicianCount: number;
  scheduledJobCount: number;
  pendingLeaveCount: number;
  overtimeWarningCount: number;
  certificationGapCount: number;
  standbyCoverageGaps: string[];
};

export type WiCustomerTechnicianProfileSummary = {
  technicianName: string;
  jobTitle: string | null;
  qualifications: string[];
  profileSummary: string | null;
};

export type EnterpriseWorkforceIntelligenceDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: WiPlatformConfigSummary;
  workforceStats: WorkforceStats;
  profileCount: number;
  categoryCount: number;
  providerCount: number;
  activeProviderCount: number;
  pendingLeaveCount: number;
  pendingTimesheetCount: number;
  payrollBatchCount: number;
  analytics: WiAnalyticsSummary | null;
  recentProfiles: WiWorkforceProfileSummary[];
  recentTimesheets: WiTimesheetSummary[];
  pendingLeaveApplications: WiLeaveApplicationSummary[];
  payrollPreparations: WiPayrollPreparationSummary[];
  technicianPerformance: WiTechnicianPerformanceSnapshotSummary[];
  hrActionDrafts: WiHrActionDraftSummary[];
  candidatePipeline: CandidatePipelineStage[];
  capacity: WiWorkforceCapacitySummary;
};

export type EnterpriseWorkforceIntelligenceAuraContext = {
  profileCount: number;
  pendingLeaveCount: number;
  pendingTimesheetCount: number;
  payrollExceptionCount: number;
  certificationRiskCount: number;
  candidatePipelineCount: number;
  summary: string;
};

export type UpdateWiPlatformConfigRequest = {
  globalPolicies?: Record<string, unknown>;
  providerAdapterTemplates?: Record<string, unknown>;
  jurisdictionTemplates?: Record<string, unknown>;
  leavePolicyDefaults?: Record<string, unknown>;
  performanceRules?: Record<string, unknown>;
  privacyPolicies?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateWiWorkforceCategoryRequest = {
  name: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type CreateWiWorkforceProfileRequest = {
  userId: string;
  categoryId?: string;
  customCategoryName?: string;
  employeeNumber?: string;
  employmentType?: string;
  jobTitle?: string;
  department?: string;
  branch?: string;
  managerUserId?: string;
  startDate?: string;
  contractStatus?: string;
  lifecycleStage?: WiLifecycleStage;
  workingHours?: Record<string, unknown>;
  contactDetails?: Record<string, unknown>;
  emergencyContact?: Record<string, unknown>;
  jurisdictionConfig?: Record<string, unknown>;
};

export type CreateWiProviderAdapterRequest = {
  providerCategory: WiProviderCategory;
  providerType: WiProviderType;
  providerKey: string;
  name: string;
  endpointUrl?: string;
  credentialsVaultKey?: string;
  isPrimary?: boolean;
  syncDirection?: WiSyncDirection;
  syncFrequencyMinutes?: number;
  fieldMappings?: Record<string, unknown>;
  leaveTypeMappings?: Record<string, unknown>;
  earningCodeMappings?: Record<string, unknown>;
  deductionCodeMappings?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateWiLifecycleStageRequest = {
  userId: string;
  stage: WiLifecycleStage;
  title: string;
  description?: string;
  effectiveDate?: string;
  requiresApproval?: boolean;
};

export type CreateWiTimesheetRequest = {
  userId?: string;
  jobId?: string;
  periodStart: string;
  periodEnd: string;
  standardHours?: number;
  overtimeHours?: number;
  travelHours?: number;
  standbyHours?: number;
  breakHours?: number;
  notes?: string;
  clockInAt?: string;
  clockOutAt?: string;
  gpsMetadata?: Record<string, unknown>;
};

export type CorrectWiTimesheetRequest = {
  fieldName: string;
  correctedValue: string;
  reason: string;
};

export type CreateWiLeaveCategoryRequest = {
  name: string;
  categoryKey: string;
  description?: string;
  isPaid?: boolean;
  accrualRules?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateWiLeaveApplicationRequest = {
  categoryId: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  reason?: string;
};

export type CreateWiPayrollPeriodRequest = {
  name: string;
  periodStart: string;
  periodEnd: string;
};

export type CreateWiHrActionDraftRequest = {
  userId?: string;
  draftType: WiHrDraftType;
  subject: string;
  description?: string;
  payload?: Record<string, unknown>;
  requiresApproval?: boolean;
};

export type WiManagerWorkspaceSummary = {
  teamMemberCount: number;
  pendingTimesheetApprovals: WiTimesheetSummary[];
  pendingLeaveApprovals: WiLeaveApplicationSummary[];
  teamPerformance: TechnicianPerformanceInsight[];
  complianceRisks: CertificationSummary[];
  payrollExceptions: WiPayrollPreparationSummary[];
};

export type WiSelfServiceSummary = {
  profile: WiWorkforceProfileSummary | null;
  skills: EmployeeSkillSummary[];
  certifications: CertificationSummary[];
  training: TrainingRecordSummary[];
  timesheets: WiTimesheetSummary[];
  leaveBalances: WiLeaveBalanceSummary[];
  leaveApplications: WiLeaveApplicationSummary[];
};
