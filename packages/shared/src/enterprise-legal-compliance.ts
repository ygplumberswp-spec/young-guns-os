import type { DocumentsStats } from './documents.js';

export type LcWorkflowStatus =
  'draft' | 'review' | 'pending_approval' | 'approved' | 'executed' | 'cancelled';

export type LcContractStatus =
  | 'request'
  | 'draft'
  | 'internal_review'
  | 'external_review'
  | 'negotiation'
  | 'pending_approval'
  | 'approved'
  | 'signature'
  | 'active'
  | 'amendment'
  | 'renewal'
  | 'suspended'
  | 'expired'
  | 'terminated'
  | 'archived';

export type LcSignatureProviderType =
  | 'docusign'
  | 'adobe_sign'
  | 'dropbox_sign'
  | 'pandadoc'
  | 'signnow'
  | 'zoho_sign'
  | 'onespan'
  | 'microsoft'
  | 'manual_upload'
  | 'generic_rest'
  | 'webhook'
  | 'custom';

export const LC_SIGNATURE_PROVIDER_TYPES: LcSignatureProviderType[] = [
  'docusign',
  'adobe_sign',
  'dropbox_sign',
  'pandadoc',
  'signnow',
  'zoho_sign',
  'onespan',
  'microsoft',
  'manual_upload',
  'generic_rest',
  'webhook',
  'custom',
];

export type LcAdapterStatus = 'active' | 'inactive' | 'testing' | 'error';
export type LcObligationStatus =
  'pending' | 'in_progress' | 'completed' | 'overdue' | 'waived' | 'cancelled';
export type LcRiskCategory =
  | 'strategic'
  | 'operational'
  | 'financial'
  | 'legal'
  | 'compliance'
  | 'cybersecurity'
  | 'data_privacy'
  | 'supplier'
  | 'customer'
  | 'workforce'
  | 'health_safety'
  | 'fleet'
  | 'asset'
  | 'environmental'
  | 'reputation'
  | 'project'
  | 'custom';
export type LcRiskStatus =
  'identified' | 'assessed' | 'treatment_planned' | 'mitigated' | 'accepted' | 'closed';
export type LcControlStatus = 'active' | 'inactive' | 'failed' | 'remediation';
export type LcPolicyStatus =
  'draft' | 'review' | 'pending_approval' | 'published' | 'expired' | 'archived';
export type LcLegalMatterStatus =
  'open' | 'in_progress' | 'pending' | 'resolved' | 'closed' | 'archived';
export type LcPrivacyRequestType =
  'access' | 'correction' | 'deletion' | 'portability' | 'objection';
export type LcPrivacyRequestStatus =
  'pending' | 'in_review' | 'approved' | 'rejected' | 'completed';
export type LcSignatureRequestStatus =
  'draft' | 'sent' | 'partially_signed' | 'completed' | 'declined' | 'expired' | 'cancelled';

export type LcLegalDraftType =
  | 'contract_summary'
  | 'policy_document'
  | 'compliance_report'
  | 'risk_report'
  | 'legal_matter_summary'
  | 'customer_notice'
  | 'supplier_notice'
  | 'internal_communication'
  | 'control_improvement'
  | 'clause_recommendation';

export type LcPlatformConfigSummary = {
  globalPolicies: Record<string, unknown>;
  providerAdapterTemplates: Record<string, unknown>;
  jurisdictionTemplates: Record<string, unknown>;
  riskMethodology: Record<string, unknown>;
  retentionTemplates: Record<string, unknown>;
  privacyDefaults: Record<string, unknown>;
  clauseLibraryTemplates: Record<string, unknown>;
  auditRetentionDays: number;
};

export type LcLegalCategorySummary = {
  id: string;
  name: string;
  categoryKey: string;
  description: string | null;
  isActive: boolean;
};

export type LcJurisdictionSummary = {
  id: string;
  name: string;
  country: string | null;
  provinceOrState: string | null;
  municipalityOrRegion: string | null;
  industry: string | null;
  isActive: boolean;
};

export type LcContractSummary = {
  id: string;
  title: string;
  contractNumber: string | null;
  contractType: string | null;
  counterpartyName: string | null;
  status: LcContractStatus;
  workflowStatus: LcWorkflowStatus;
  effectiveDate: string | null;
  expiryDate: string | null;
  contractValueCents: number | null;
  currency: string | null;
  ownerName: string | null;
  daysUntilExpiry: number | null;
};

export type LcContractTemplateSummary = {
  id: string;
  name: string;
  templateKey: string;
  version: string;
  isApproved: boolean;
  isActive: boolean;
};

export type LcClauseSummary = {
  id: string;
  clauseKey: string;
  title: string;
  isMandatory: boolean;
  isApproved: boolean;
  version: string;
};

export type LcSignatureProviderSummary = {
  id: string;
  providerType: LcSignatureProviderType;
  providerKey: string;
  name: string;
  status: LcAdapterStatus;
  isPrimary: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
};

export type LcContractAnalysisSummary = {
  id: string;
  contractId: string;
  analysisType: string;
  summary: string | null;
  confidenceScore: number | null;
  requiresHumanReview: boolean;
  disclaimer: string;
  createdAt: string;
};

export type LcObligationSummary = {
  id: string;
  title: string;
  status: LcObligationStatus;
  dueDate: string | null;
  frequency: string | null;
  ownerName: string | null;
  contractTitle: string | null;
  isOverdue: boolean;
};

export type LcComplianceFrameworkSummary = {
  id: string;
  name: string;
  frameworkKey: string;
  description: string | null;
  isActive: boolean;
};

export type LcComplianceRecordSummary = {
  id: string;
  title: string;
  recordKey: string;
  status: string;
  dueDate: string | null;
  expiryDate: string | null;
  frameworkName: string | null;
};

export type LcRiskSummary = {
  id: string;
  title: string;
  category: LcRiskCategory;
  customCategoryName: string | null;
  status: LcRiskStatus;
  likelihood: number | null;
  impact: number | null;
  inherentRiskScore: number | null;
  residualRiskScore: number | null;
  ownerName: string | null;
  reviewDate: string | null;
};

export type LcControlSummary = {
  id: string;
  controlKey: string;
  title: string;
  processArea: string | null;
  status: LcControlStatus;
  lastPerformedAt: string | null;
  nextDueAt: string | null;
  ownerName: string | null;
};

export type LcPolicySummary = {
  id: string;
  title: string;
  policyKey: string;
  status: LcPolicyStatus;
  workflowStatus: LcWorkflowStatus;
  version: string;
  effectiveDate: string | null;
  expiryDate: string | null;
  publishedAt: string | null;
};

export type LcLegalMatterSummary = {
  id: string;
  matterNumber: string | null;
  matterType: string;
  title: string;
  status: LcLegalMatterStatus;
  priority: string;
  responsibleName: string | null;
  deadlineDate: string | null;
  costCents: number | null;
};

export type LcInsurancePolicySummary = {
  id: string;
  policyNumber: string;
  coverageType: string;
  insurerName: string | null;
  expiryDate: string | null;
  premiumCents: number | null;
};

export type LcInsuranceClaimSummary = {
  id: string;
  policyId: string;
  claimNumber: string | null;
  title: string;
  status: string;
  claimAmountCents: number | null;
};

export type LcPrivacyRequestSummary = {
  id: string;
  requestType: LcPrivacyRequestType;
  status: LcPrivacyRequestStatus;
  subjectName: string | null;
  legalHoldBlocked: boolean;
  createdAt: string;
};

export type LcLegalHoldSummary = {
  id: string;
  title: string;
  reason: string;
  workflowStatus: LcWorkflowStatus;
  startDate: string | null;
  endDate: string | null;
};

export type LcEvidenceSummary = {
  id: string;
  evidenceType: string;
  title: string;
  integrityHash: string | null;
  linkedEntityType: string | null;
  createdAt: string;
};

export type LcComplianceMonitoringSummary = {
  expiringContracts: number;
  overdueObligations: number;
  expiredLicences: number;
  missingSignatures: number;
  unresolvedRisks: number;
  failedControls: number;
  pendingPrivacyRequests: number;
  policyAcknowledgementGaps: number;
  alerts: string[];
};

export type LcAnalyticsSummary = {
  activeContractCount: number;
  expiringContractCount: number;
  contractValueCents: number;
  overdueObligationCount: number;
  complianceGapCount: number;
  openRiskCount: number;
  failedControlCount: number;
  openLegalMatterCount: number;
  openClaimCount: number;
  pendingPrivacyRequestCount: number;
  capturedAt: string;
};

export type LcPortalLegalSummary = {
  approvedContracts: Array<{ id: string; title: string; effectiveDate: string | null }>;
  publishedPolicies: Array<{ id: string; title: string; version: string }>;
  complaintMatters: Array<{ id: string; title: string; status: string }>;
  privacyRequests: LcPrivacyRequestSummary[];
};

export type LcEmployeeLegalSummary = {
  employmentAgreements: LcContractSummary[];
  policiesRequiringAcknowledgement: LcPolicySummary[];
  acknowledgedPolicyCount: number;
};

export type EnterpriseLegalComplianceDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: LcPlatformConfigSummary;
  documentStats: DocumentsStats | null;
  contractCount: number;
  activeContractCount: number;
  expiringContractCount: number;
  obligationCount: number;
  overdueObligationCount: number;
  riskCount: number;
  openRiskCount: number;
  controlCount: number;
  failedControlCount: number;
  policyCount: number;
  publishedPolicyCount: number;
  legalMatterCount: number;
  openLegalMatterCount: number;
  insurancePolicyCount: number;
  openClaimCount: number;
  pendingPrivacyRequestCount: number;
  activeLegalHoldCount: number;
  signatureProviderCount: number;
  analytics: LcAnalyticsSummary | null;
  complianceMonitoring: LcComplianceMonitoringSummary;
  recentContracts: LcContractSummary[];
  recentObligations: LcObligationSummary[];
  recentRisks: LcRiskSummary[];
  recentLegalMatters: LcLegalMatterSummary[];
  pendingPrivacyRequests: LcPrivacyRequestSummary[];
};

export type EnterpriseLegalComplianceAuraContext = {
  contractCount: number;
  expiringContractCount: number;
  overdueObligationCount: number;
  openRiskCount: number;
  openLegalMatterCount: number;
  pendingPrivacyRequestCount: number;
  summary: string;
};

export type UpdateLcPlatformConfigRequest = {
  globalPolicies?: Record<string, unknown>;
  providerAdapterTemplates?: Record<string, unknown>;
  jurisdictionTemplates?: Record<string, unknown>;
  riskMethodology?: Record<string, unknown>;
  retentionTemplates?: Record<string, unknown>;
  privacyDefaults?: Record<string, unknown>;
  clauseLibraryTemplates?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateLcLegalCategoryRequest = {
  name: string;
  categoryKey: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type CreateLcJurisdictionRequest = {
  name: string;
  country?: string;
  provinceOrState?: string;
  municipalityOrRegion?: string;
  industry?: string;
  config?: Record<string, unknown>;
};

export type CreateLcContractRequest = {
  title: string;
  categoryId?: string;
  jurisdictionId?: string;
  contractNumber?: string;
  contractType?: string;
  counterpartyName?: string;
  counterpartyId?: string;
  counterpartyType?: string;
  businessUnit?: string;
  effectiveDate?: string;
  expiryDate?: string;
  renewalTerms?: string;
  noticePeriodDays?: number;
  contractValueCents?: number;
  currency?: string;
  paymentTerms?: string;
  governingJurisdiction?: string;
  linkedMetadata?: Record<string, unknown>;
};

export type CreateLcContractLifecycleRequest = {
  contractId: string;
  status: LcContractStatus;
  title: string;
  description?: string;
  requiresApproval?: boolean;
};

export type CreateLcClauseRequest = {
  clauseKey: string;
  title: string;
  content: string;
  jurisdictionId?: string;
  isMandatory?: boolean;
  isApproved?: boolean;
};

export type CreateLcSignatureProviderRequest = {
  providerType: LcSignatureProviderType;
  providerKey: string;
  name: string;
  endpointUrl?: string;
  credentialsVaultKey?: string;
  isPrimary?: boolean;
  signerRoleMappings?: Record<string, unknown>;
  fieldMappings?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateLcObligationRequest = {
  title: string;
  contractId?: string;
  description?: string;
  dueDate?: string;
  frequency?: string;
  sourceType?: string;
};

export type CreateLcRiskRequest = {
  title: string;
  category?: LcRiskCategory;
  customCategoryName?: string;
  description?: string;
  likelihood?: number;
  impact?: number;
  businessArea?: string;
  treatmentPlan?: string;
  reviewDate?: string;
};

export type CreateLcControlRequest = {
  controlKey: string;
  title: string;
  objective?: string;
  processArea?: string;
  frequency?: string;
};

export type CreateLcPolicyRequest = {
  title: string;
  policyKey: string;
  description?: string;
  content?: string;
  audience?: string;
  effectiveDate?: string;
  reviewCycleDays?: number;
};

export type CreateLcLegalMatterRequest = {
  matterType: string;
  title: string;
  description?: string;
  priority?: string;
  counterpartyName?: string;
  deadlineDate?: string;
};

export type CreateLcPrivacyRequestRequest = {
  requestType: LcPrivacyRequestType;
  customerId?: string;
  subjectName?: string;
  description?: string;
};

export type CreateLcLegalActionDraftRequest = {
  draftType: LcLegalDraftType;
  subject: string;
  description?: string;
  payload?: Record<string, unknown>;
  aiGenerated?: boolean;
  requiresApproval?: boolean;
};

export type RequestLcContractAnalysisRequest = {
  analysisType: string;
  content?: string;
};
