export type IpPlatformConfigSummary = {
  marketplacePolicy: Record<string, unknown>;
  compliancePolicy: Record<string, unknown>;
  certificatePolicy: Record<string, unknown>;
  packBuilderPolicy: Record<string, unknown>;
  analyticsPolicy: Record<string, unknown>;
  auditRetentionDays: number;
};

export type IpPackCatalogSummary = {
  id: string;
  packKey: string;
  name: string;
  description: string | null;
  industryCategory: string;
  version: string;
  isSystemPack: boolean;
  isCustomPack: boolean;
  licensingModel: string | null;
  workflowStatus: string;
  createdAt: string;
};

export type IpPackInstallationSummary = {
  id: string;
  packCatalogId: string;
  packKey: string;
  packName: string;
  installedVersion: string;
  status: string;
  installedByUserId: string | null;
  installedAt: string | null;
  createdAt: string;
};

export type IpTemplateSummary = {
  id: string;
  packCatalogId: string | null;
  templateKey: string;
  templateType: string;
  name: string;
  description: string | null;
  workflowStatus: string;
  createdAt: string;
};

export type IpComplianceFrameworkSummary = {
  id: string;
  packCatalogId: string | null;
  frameworkKey: string;
  name: string;
  description: string | null;
  countryCode: string | null;
  industryCategory: string | null;
  regulatoryBody: string | null;
  workflowStatus: string;
  createdAt: string;
};

export type IpComplianceRequirementSummary = {
  id: string;
  frameworkId: string;
  requirementKey: string;
  title: string;
  description: string | null;
  requirementType: string | null;
  createdAt: string;
};

export type IpCertificateSummary = {
  id: string;
  packCatalogId: string | null;
  certificateKey: string;
  certificateType: string;
  title: string;
  status: string;
  jobId: string | null;
  customerId: string | null;
  issuedByUserId: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  sourceWorkReference: string | null;
  createdAt: string;
};

export type IpKnowledgeArticleSummary = {
  id: string;
  packCatalogId: string | null;
  articleKey: string;
  title: string;
  articleType: string;
  status: string;
  version: string;
  approvedAt: string | null;
  createdAt: string;
};

export type IpEquipmentCatalogSummary = {
  id: string;
  packCatalogId: string | null;
  equipmentKey: string;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
  workflowStatus: string;
  createdAt: string;
};

export type IpMaterialLibrarySummary = {
  id: string;
  packCatalogId: string | null;
  materialKey: string;
  name: string;
  category: string | null;
  unit: string | null;
  workflowStatus: string;
  createdAt: string;
};

export type IpAssetTypeSummary = {
  id: string;
  packCatalogId: string | null;
  assetTypeKey: string;
  name: string;
  description: string | null;
  workflowStatus: string;
  createdAt: string;
};

export type IpPackExtensionSummary = {
  id: string;
  packCatalogId: string;
  extensionType: string;
  extensionKey: string;
  name: string;
  workflowStatus: string;
  createdAt: string;
};

export type IpIndustryAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  packCatalogId: string | null;
  sourceModule: string | null;
  createdAt: string;
};

export type IpActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  packCatalogId: string | null;
  aiGenerated: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type IpAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type IpAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type IpIndustryMonitoringSummary = {
  installedPackCount: number;
  activePackCount: number;
  openComplianceAlertCount: number;
  openCertificateAlertCount: number;
  pendingCertificateCount: number;
  templateCount: number;
  openAlertCount: number;
  alerts: string[];
};

export type EnterpriseIndustryPackDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: IpPlatformConfigSummary;
  installedPackCount: number;
  marketplacePackCount: number;
  templateCount: number;
  complianceFrameworkCount: number;
  certificateCount: number;
  equipmentCatalogCount: number;
  openAlertCount: number;
  overallIndustryHealthStatus: string;
  industryMonitoring: IpIndustryMonitoringSummary;
  analytics: IpAnalyticsSummary | null;
  recentInstallations: IpPackInstallationSummary[];
  recentTemplates: IpTemplateSummary[];
  recentComplianceFrameworks: IpComplianceFrameworkSummary[];
  recentCertificates: IpCertificateSummary[];
  recentEquipment: IpEquipmentCatalogSummary[];
  recentAlerts: IpIndustryAlertSummary[];
};

export type EnterpriseIndustryPackAuraContext = {
  summary: string;
  installedPackCount: number;
  templateCount: number;
  complianceFrameworkCount: number;
  certificateCount: number;
  openAlertCount: number;
  overallIndustryHealthStatus: string;
};

export type UpdateIpPlatformConfigRequest = {
  marketplacePolicy?: Record<string, unknown>;
  compliancePolicy?: Record<string, unknown>;
  certificatePolicy?: Record<string, unknown>;
  packBuilderPolicy?: Record<string, unknown>;
  analyticsPolicy?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateIpPackCatalogRequest = {
  packKey: string;
  name: string;
  description?: string;
  industryCategory: string;
  version?: string;
  isCustomPack?: boolean;
  licensingModel?: string;
  compatibility?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type InstallIpPackRequest = {
  packCatalogId: string;
  installedVersion?: string;
  config?: Record<string, unknown>;
};

export type CreateIpTemplateRequest = {
  packCatalogId?: string;
  templateKey: string;
  templateType: string;
  name: string;
  description?: string;
  definition?: Record<string, unknown>;
};

export type CreateIpComplianceFrameworkRequest = {
  packCatalogId?: string;
  frameworkKey: string;
  name: string;
  description?: string;
  countryCode?: string;
  industryCategory?: string;
  regulatoryBody?: string;
  config?: Record<string, unknown>;
};

export type CreateIpComplianceRequirementRequest = {
  frameworkId: string;
  requirementKey: string;
  title: string;
  description?: string;
  requirementType?: string;
  config?: Record<string, unknown>;
};

export type CreateIpCertificateRequest = {
  packCatalogId?: string;
  certificateKey: string;
  certificateType: string;
  title: string;
  jobId?: string;
  customerId?: string;
  sourceWorkReference: string;
  metadata?: Record<string, unknown>;
};

export type CreateIpKnowledgeArticleRequest = {
  packCatalogId?: string;
  articleKey: string;
  title: string;
  articleType: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

export type CreateIpEquipmentCatalogRequest = {
  packCatalogId?: string;
  equipmentKey: string;
  manufacturer?: string;
  model?: string;
  category?: string;
  specifications?: Record<string, unknown>;
  serviceIntervals?: Record<string, unknown>;
  replacementParts?: Record<string, unknown>;
  attachments?: Record<string, unknown>;
};

export type CreateIpMaterialLibraryRequest = {
  packCatalogId?: string;
  materialKey: string;
  name: string;
  category?: string;
  unit?: string;
  specifications?: Record<string, unknown>;
  bundles?: Record<string, unknown>;
};

export type CreateIpAssetTypeRequest = {
  packCatalogId?: string;
  assetTypeKey: string;
  name: string;
  description?: string;
  fieldDefinitions?: Record<string, unknown>;
};

export type CreateIpPackExtensionRequest = {
  packCatalogId: string;
  extensionType: string;
  extensionKey: string;
  name: string;
  definition?: Record<string, unknown>;
};

export type CreateIpIndustryActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  packCatalogId?: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type IssueIpCertificateRequest = {
  certificateId: string;
};

export const BUILT_IN_INDUSTRY_PACK_KEYS = [
  'plumbing',
  'electrical',
  'hvac',
  'fire_protection',
  'solar',
  'security_systems',
  'facilities_management',
  'refrigeration',
  'mechanical_services',
  'cleaning_services',
  'landscaping',
  'pest_control',
  'general_contractors',
  'property_maintenance',
  'custom_pack_builder',
] as const;
