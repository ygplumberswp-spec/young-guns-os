import { and, desc, eq, isNull } from 'drizzle-orm';
import type {
  CreateIpAssetTypeRequest,
  CreateIpCertificateRequest,
  CreateIpComplianceFrameworkRequest,
  CreateIpComplianceRequirementRequest,
  CreateIpEquipmentCatalogRequest,
  CreateIpIndustryActionDraftRequest,
  CreateIpKnowledgeArticleRequest,
  CreateIpMaterialLibraryRequest,
  CreateIpPackCatalogRequest,
  CreateIpPackExtensionRequest,
  CreateIpTemplateRequest,
  EnterpriseIndustryPackAuraContext,
  EnterpriseIndustryPackDashboard,
  InstallIpPackRequest,
  IpActionDraftSummary,
  IpAnalyticsSummary,
  IpAssetTypeSummary,
  IpCertificateSummary,
  IpComplianceFrameworkSummary,
  IpComplianceRequirementSummary,
  IpEquipmentCatalogSummary,
  IpIndustryAlertSummary,
  IpIndustryMonitoringSummary,
  IpKnowledgeArticleSummary,
  IpMaterialLibrarySummary,
  IpPackCatalogSummary,
  IpPackExtensionSummary,
  IpPackInstallationSummary,
  IpPlatformConfigSummary,
  IpTemplateSummary,
  UpdateIpPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  ipActionDrafts,
  ipAnalyticsSnapshots,
  ipAssetTypes,
  ipAuditLogs,
  ipCertificates,
  ipComplianceFrameworks,
  ipComplianceRequirements,
  ipEquipmentCatalog,
  ipIndustryAlerts,
  ipKnowledgeArticles,
  ipMaterialLibraries,
  ipPackCatalog,
  ipPackExtensions,
  ipPackInstallations,
  ipPlatformConfig,
  ipTemplates,
} from '@titan/db';
import type { EnterpriseAppBuilderService } from './enterprise-app-builder.service.js';
import type { EnterpriseAssetLifecycleService } from './enterprise-asset-lifecycle.service.js';
import type { EnterpriseLegalComplianceService } from './enterprise-legal-compliance.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { EnterpriseServiceDeliveryService } from './enterprise-service-delivery.service.js';
import type { FinanceService } from './finance.service.js';
import type { JobsService } from './jobs.service.js';

export class EnterpriseIndustryPackError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseIndustryPackError';
  }
}

type StaffScope = { companyId: string; userId: string };

const BUILT_IN_INDUSTRY_PACKS: Array<{
  packKey: string;
  name: string;
  description: string;
  industryCategory: string;
}> = [
  { packKey: 'plumbing', name: 'Plumbing', description: 'Plumbing workflows, inspections, compliance, and trade templates.', industryCategory: 'plumbing' },
  { packKey: 'electrical', name: 'Electrical', description: 'Electrical compliance, certificates, and installation templates.', industryCategory: 'electrical' },
  { packKey: 'hvac', name: 'HVAC', description: 'HVAC maintenance, service, and equipment intelligence templates.', industryCategory: 'hvac' },
  { packKey: 'fire_protection', name: 'Fire Protection', description: 'Fire compliance frameworks, inspections, and certificates.', industryCategory: 'fire_protection' },
  { packKey: 'solar', name: 'Solar', description: 'Solar installation, maintenance, and compliance templates.', industryCategory: 'solar' },
  { packKey: 'security_systems', name: 'Security Systems', description: 'Security installation, monitoring, and service templates.', industryCategory: 'security_systems' },
  { packKey: 'facilities_management', name: 'Facilities Management', description: 'Facilities maintenance, inspections, and asset templates.', industryCategory: 'facilities_management' },
  { packKey: 'refrigeration', name: 'Refrigeration', description: 'Refrigeration service, equipment catalogs, and compliance.', industryCategory: 'refrigeration' },
  { packKey: 'mechanical_services', name: 'Mechanical Services', description: 'Mechanical maintenance, repairs, and project templates.', industryCategory: 'mechanical_services' },
  { packKey: 'cleaning_services', name: 'Cleaning Services', description: 'Cleaning checklists, labour templates, and scheduling workflows.', industryCategory: 'cleaning_services' },
  { packKey: 'landscaping', name: 'Landscaping', description: 'Landscaping projects, seasonal maintenance, and quote templates.', industryCategory: 'landscaping' },
  { packKey: 'pest_control', name: 'Pest Control', description: 'Pest control inspections, treatments, and compliance documentation.', industryCategory: 'pest_control' },
  { packKey: 'general_contractors', name: 'General Contractors', description: 'Multi-trade project templates, quotes, and completion certificates.', industryCategory: 'general_contractors' },
  { packKey: 'property_maintenance', name: 'Property Maintenance', description: 'Property maintenance workflows, SLAs, and reporting templates.', industryCategory: 'property_maintenance' },
  { packKey: 'custom_pack_builder', name: 'Custom Industry Pack Builder', description: 'Build custom industry packs via App Builder without modifying core code.', industryCategory: 'custom' },
];

type IndustryPackDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseLegalComplianceService: EnterpriseLegalComplianceService;
  enterpriseAppBuilderService: EnterpriseAppBuilderService;
  enterpriseServiceDeliveryService: EnterpriseServiceDeliveryService;
  enterpriseAssetLifecycleService: EnterpriseAssetLifecycleService;
  jobsService: JobsService;
  financeService: FinanceService;
};

export class EnterpriseIndustryPackService {
  constructor(private readonly deps: IndustryPackDeps) {}

  async isPlatformOwnerTenant(companyId: string): Promise<boolean> {
    return this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
  }

  async getMissionControlDashboard(companyId: string) {
    return this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId);
  }

  async getLegalComplianceDashboard(companyId: string) {
    return this.deps.enterpriseLegalComplianceService.getDashboard(companyId);
  }

  async getAppBuilderDashboard(companyId: string) {
    return this.deps.enterpriseAppBuilderService.getDashboard(companyId);
  }

  async getServiceDeliveryDashboard(companyId: string) {
    return this.deps.enterpriseServiceDeliveryService.getDashboard(companyId);
  }

  async getDashboard(companyId: string): Promise<EnterpriseIndustryPackDashboard> {
    await this.ensureBuiltInCatalog();
    await this.ensurePlatformConfig(companyId);

    const [
      isPlatformOwner,
      platformConfig,
      installations,
      marketplacePacks,
      templates,
      frameworks,
      certificates,
      equipment,
      alerts,
      analytics,
      industryMonitoring,
    ] = await Promise.all([
      this.isPlatformOwnerTenant(companyId),
      this.getPlatformConfig(companyId),
      this.listInstalledPacks(companyId),
      this.listMarketplacePacks(),
      this.listTemplates(companyId),
      this.listComplianceFrameworks(companyId),
      this.listCertificates(companyId),
      this.listEquipmentCatalog(companyId),
      this.listIndustryAlerts(companyId, { status: 'open' }),
      this.getLatestAnalytics(companyId),
      this.getIndustryMonitoring(companyId),
    ]);

    void this.getMissionControlDashboard(companyId).catch(() => null);
    void this.getLegalComplianceDashboard(companyId).catch(() => null);
    void this.getAppBuilderDashboard(companyId).catch(() => null);

    const overallIndustryHealthStatus = resolveIndustryHealthStatus({
      openAlertCount: alerts.length,
      pendingCertificateCount: certificates.filter((c) => c.status === 'pending_approval').length,
      installedPackCount: installations.filter((i) => i.status === 'installed').length,
    });

    return {
      summary: `${installations.filter((i) => i.status === 'installed').length} installed pack(s), ${templates.length} template(s), ${frameworks.length} compliance framework(s), ${alerts.length} open alert(s).`,
      isPlatformOwner,
      platformConfig,
      installedPackCount: installations.filter((i) => i.status === 'installed').length,
      marketplacePackCount: marketplacePacks.length,
      templateCount: templates.length,
      complianceFrameworkCount: frameworks.length,
      certificateCount: certificates.length,
      equipmentCatalogCount: equipment.length,
      openAlertCount: alerts.length,
      overallIndustryHealthStatus,
      industryMonitoring,
      analytics,
      recentInstallations: installations.slice(0, 10),
      recentTemplates: templates.slice(0, 10),
      recentComplianceFrameworks: frameworks.slice(0, 10),
      recentCertificates: certificates.slice(0, 10),
      recentEquipment: equipment.slice(0, 10),
      recentAlerts: alerts.slice(0, 10),
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseIndustryPackAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      installedPackCount: dashboard.installedPackCount,
      templateCount: dashboard.templateCount,
      complianceFrameworkCount: dashboard.complianceFrameworkCount,
      certificateCount: dashboard.certificateCount,
      openAlertCount: dashboard.openAlertCount,
      overallIndustryHealthStatus: dashboard.overallIndustryHealthStatus,
    };
  }

  async getPlatformConfig(companyId: string): Promise<IpPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(scope: StaffScope, input: UpdateIpPlatformConfigRequest): Promise<IpPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(ipPlatformConfig)
      .set({
        marketplacePolicy: input.marketplacePolicy ?? existing.marketplacePolicy,
        compliancePolicy: input.compliancePolicy ?? existing.compliancePolicy,
        certificatePolicy: input.certificatePolicy ?? existing.certificatePolicy,
        packBuilderPolicy: input.packBuilderPolicy ?? existing.packBuilderPolicy,
        analyticsPolicy: input.analyticsPolicy ?? existing.analyticsPolicy,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(ipPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async listMarketplacePacks(): Promise<IpPackCatalogSummary[]> {
    await this.ensureBuiltInCatalog();
    const rows = await this.deps.db.query.ipPackCatalog.findMany({
      where: and(isNull(ipPackCatalog.companyId), eq(ipPackCatalog.isSystemPack, true)),
      orderBy: [desc(ipPackCatalog.createdAt)],
    });
    return rows.map(toPackCatalogSummary);
  }

  async listInstalledPacks(companyId: string): Promise<IpPackInstallationSummary[]> {
    const rows = await this.deps.db.query.ipPackInstallations.findMany({
      where: eq(ipPackInstallations.companyId, companyId),
      orderBy: [desc(ipPackInstallations.createdAt)],
    });
    const results: IpPackInstallationSummary[] = [];
    for (const row of rows) {
      const pack = await this.deps.db.query.ipPackCatalog.findFirst({
        where: eq(ipPackCatalog.id, row.packCatalogId),
      });
      if (!pack) continue;
      results.push(toPackInstallationSummary(row, pack));
    }
    return results;
  }

  async installPack(scope: StaffScope, input: InstallIpPackRequest): Promise<IpPackInstallationSummary> {
    const pack = await this.deps.db.query.ipPackCatalog.findFirst({
      where: eq(ipPackCatalog.id, input.packCatalogId),
    });
    if (!pack) throw new EnterpriseIndustryPackError('NOT_FOUND', 'Industry pack not found');

    const existing = await this.deps.db.query.ipPackInstallations.findFirst({
      where: and(
        eq(ipPackInstallations.companyId, scope.companyId),
        eq(ipPackInstallations.packCatalogId, input.packCatalogId),
      ),
    });

    if (existing?.status === 'installed') {
      throw new EnterpriseIndustryPackError('CONFLICT', 'Industry pack is already installed');
    }

    const now = new Date();
    if (existing) {
      const [updated] = await this.deps.db
        .update(ipPackInstallations)
        .set({
          status: 'installed',
          installedVersion: input.installedVersion ?? pack.version,
          installedByUserId: scope.userId,
          installedAt: now,
          disabledAt: null,
          config: input.config ?? existing.config,
          updatedAt: now,
        })
        .where(eq(ipPackInstallations.id, existing.id))
        .returning();
      await this.recordAudit(scope, 'pack_installed', 'pack_installation', updated!.id, { packKey: pack.packKey });
      return toPackInstallationSummary(updated!, pack);
    }

    const [created] = await this.deps.db
      .insert(ipPackInstallations)
      .values({
        companyId: scope.companyId,
        packCatalogId: input.packCatalogId,
        installedVersion: input.installedVersion ?? pack.version,
        status: 'installed',
        installedByUserId: scope.userId,
        installedAt: now,
        config: input.config ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'pack_installed', 'pack_installation', created!.id, { packKey: pack.packKey });
    return toPackInstallationSummary(created!, pack);
  }

  async disablePack(scope: StaffScope, installationId: string): Promise<IpPackInstallationSummary> {
    const installation = await this.ensureInstallation(scope.companyId, installationId);
    const pack = await this.deps.db.query.ipPackCatalog.findFirst({
      where: eq(ipPackCatalog.id, installation.packCatalogId),
    });
    const [updated] = await this.deps.db
      .update(ipPackInstallations)
      .set({ status: 'disabled', disabledAt: new Date(), updatedAt: new Date() })
      .where(eq(ipPackInstallations.id, installationId))
      .returning();
    await this.recordAudit(scope, 'pack_disabled', 'pack_installation', installationId);
    return toPackInstallationSummary(updated!, pack!);
  }

  async uninstallPack(scope: StaffScope, installationId: string): Promise<IpPackInstallationSummary> {
    const installation = await this.ensureInstallation(scope.companyId, installationId);
    const pack = await this.deps.db.query.ipPackCatalog.findFirst({
      where: eq(ipPackCatalog.id, installation.packCatalogId),
    });
    const [updated] = await this.deps.db
      .update(ipPackInstallations)
      .set({ status: 'uninstalled', disabledAt: new Date(), updatedAt: new Date() })
      .where(eq(ipPackInstallations.id, installationId))
      .returning();
    await this.recordAudit(scope, 'pack_uninstalled', 'pack_installation', installationId);
    return toPackInstallationSummary(updated!, pack!);
  }

  async createCustomPack(scope: StaffScope, input: CreateIpPackCatalogRequest): Promise<IpPackCatalogSummary> {
    const [created] = await this.deps.db
      .insert(ipPackCatalog)
      .values({
        companyId: scope.companyId,
        packKey: input.packKey,
        name: input.name,
        description: input.description ?? null,
        industryCategory: input.industryCategory,
        version: input.version ?? '1.0.0',
        isSystemPack: false,
        isCustomPack: input.isCustomPack ?? true,
        licensingModel: input.licensingModel ?? null,
        compatibility: input.compatibility ?? {},
        capabilities: input.capabilities ?? {},
        config: input.config ?? {},
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'custom_pack_created', 'pack_catalog', created!.id, { packKey: input.packKey });
    return toPackCatalogSummary(created!);
  }

  async listTemplates(companyId: string, templateType?: string): Promise<IpTemplateSummary[]> {
    const rows = await this.deps.db.query.ipTemplates.findMany({
      where: templateType
        ? and(eq(ipTemplates.companyId, companyId), eq(ipTemplates.templateType, templateType as never))
        : eq(ipTemplates.companyId, companyId),
      orderBy: [desc(ipTemplates.createdAt)],
    });
    return rows.map(toTemplateSummary);
  }

  async createTemplate(scope: StaffScope, input: CreateIpTemplateRequest): Promise<IpTemplateSummary> {
    const [created] = await this.deps.db
      .insert(ipTemplates)
      .values({
        companyId: scope.companyId,
        packCatalogId: input.packCatalogId ?? null,
        templateKey: input.templateKey,
        templateType: input.templateType as never,
        name: input.name,
        description: input.description ?? null,
        definition: input.definition ?? {},
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'template_created', 'template', created!.id, { templateType: input.templateType });
    return toTemplateSummary(created!);
  }

  async listComplianceFrameworks(companyId: string): Promise<IpComplianceFrameworkSummary[]> {
    const rows = await this.deps.db.query.ipComplianceFrameworks.findMany({
      where: eq(ipComplianceFrameworks.companyId, companyId),
      orderBy: [desc(ipComplianceFrameworks.createdAt)],
    });
    return rows.map(toComplianceFrameworkSummary);
  }

  async createComplianceFramework(
    scope: StaffScope,
    input: CreateIpComplianceFrameworkRequest,
  ): Promise<IpComplianceFrameworkSummary> {
    const [created] = await this.deps.db
      .insert(ipComplianceFrameworks)
      .values({
        companyId: scope.companyId,
        packCatalogId: input.packCatalogId ?? null,
        frameworkKey: input.frameworkKey,
        name: input.name,
        description: input.description ?? null,
        countryCode: input.countryCode ?? null,
        industryCategory: input.industryCategory ?? null,
        regulatoryBody: input.regulatoryBody ?? null,
        config: input.config ?? {},
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'compliance_framework_created', 'compliance_framework', created!.id);
    return toComplianceFrameworkSummary(created!);
  }

  async listComplianceRequirements(companyId: string, frameworkId?: string): Promise<IpComplianceRequirementSummary[]> {
    const rows = await this.deps.db.query.ipComplianceRequirements.findMany({
      where: frameworkId
        ? and(eq(ipComplianceRequirements.companyId, companyId), eq(ipComplianceRequirements.frameworkId, frameworkId))
        : eq(ipComplianceRequirements.companyId, companyId),
      orderBy: [desc(ipComplianceRequirements.createdAt)],
    });
    return rows.map(toComplianceRequirementSummary);
  }

  async createComplianceRequirement(
    scope: StaffScope,
    input: CreateIpComplianceRequirementRequest,
  ): Promise<IpComplianceRequirementSummary> {
    await this.ensureComplianceFramework(scope.companyId, input.frameworkId);
    const [created] = await this.deps.db
      .insert(ipComplianceRequirements)
      .values({
        companyId: scope.companyId,
        frameworkId: input.frameworkId,
        requirementKey: input.requirementKey,
        title: input.title,
        description: input.description ?? null,
        requirementType: input.requirementType ?? null,
        config: input.config ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'compliance_requirement_created', 'compliance_requirement', created!.id);
    return toComplianceRequirementSummary(created!);
  }

  async listCertificates(companyId: string): Promise<IpCertificateSummary[]> {
    const rows = await this.deps.db.query.ipCertificates.findMany({
      where: eq(ipCertificates.companyId, companyId),
      orderBy: [desc(ipCertificates.createdAt)],
    });
    return rows.map(toCertificateSummary);
  }

  async createCertificate(scope: StaffScope, input: CreateIpCertificateRequest): Promise<IpCertificateSummary> {
    if (!input.sourceWorkReference?.trim()) {
      throw new EnterpriseIndustryPackError(
        'VALIDATION_ERROR',
        'Certificates require a source work reference from completed work',
      );
    }

    const [created] = await this.deps.db
      .insert(ipCertificates)
      .values({
        companyId: scope.companyId,
        packCatalogId: input.packCatalogId ?? null,
        certificateKey: input.certificateKey,
        certificateType: input.certificateType as never,
        title: input.title,
        status: 'draft',
        jobId: input.jobId ?? null,
        customerId: input.customerId ?? null,
        sourceWorkReference: input.sourceWorkReference.trim(),
        metadata: input.metadata ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'certificate_created', 'certificate', created!.id);
    return toCertificateSummary(created!);
  }

  async issueCertificate(scope: StaffScope, certificateId: string): Promise<IpCertificateSummary> {
    const certificate = await this.ensureCertificate(scope.companyId, certificateId);
    if (!certificate.sourceWorkReference?.trim()) {
      throw new EnterpriseIndustryPackError(
        'VALIDATION_ERROR',
        'Cannot issue certificate without source work reference',
      );
    }

    const [updated] = await this.deps.db
      .update(ipCertificates)
      .set({
        status: 'issued',
        issuedByUserId: scope.userId,
        issuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ipCertificates.id, certificateId))
      .returning();
    await this.recordAudit(scope, 'certificate_issued', 'certificate', certificateId);
    return toCertificateSummary(updated!);
  }

  async listKnowledgeArticles(companyId: string): Promise<IpKnowledgeArticleSummary[]> {
    const rows = await this.deps.db.query.ipKnowledgeArticles.findMany({
      where: eq(ipKnowledgeArticles.companyId, companyId),
      orderBy: [desc(ipKnowledgeArticles.createdAt)],
    });
    return rows.map(toKnowledgeArticleSummary);
  }

  async createKnowledgeArticle(
    scope: StaffScope,
    input: CreateIpKnowledgeArticleRequest,
  ): Promise<IpKnowledgeArticleSummary> {
    const [created] = await this.deps.db
      .insert(ipKnowledgeArticles)
      .values({
        companyId: scope.companyId,
        packCatalogId: input.packCatalogId ?? null,
        articleKey: input.articleKey,
        title: input.title,
        articleType: input.articleType,
        content: input.content ?? null,
        status: 'draft',
        metadata: input.metadata ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'knowledge_article_created', 'knowledge_article', created!.id);
    return toKnowledgeArticleSummary(created!);
  }

  async listEquipmentCatalog(companyId: string): Promise<IpEquipmentCatalogSummary[]> {
    const rows = await this.deps.db.query.ipEquipmentCatalog.findMany({
      where: eq(ipEquipmentCatalog.companyId, companyId),
      orderBy: [desc(ipEquipmentCatalog.createdAt)],
    });
    return rows.map(toEquipmentCatalogSummary);
  }

  async createEquipmentCatalogEntry(
    scope: StaffScope,
    input: CreateIpEquipmentCatalogRequest,
  ): Promise<IpEquipmentCatalogSummary> {
    const [created] = await this.deps.db
      .insert(ipEquipmentCatalog)
      .values({
        companyId: scope.companyId,
        packCatalogId: input.packCatalogId ?? null,
        equipmentKey: input.equipmentKey,
        manufacturer: input.manufacturer ?? null,
        model: input.model ?? null,
        category: input.category ?? null,
        specifications: input.specifications ?? {},
        serviceIntervals: input.serviceIntervals ?? {},
        replacementParts: input.replacementParts ?? {},
        attachments: input.attachments ?? {},
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'equipment_catalog_created', 'equipment_catalog', created!.id);
    return toEquipmentCatalogSummary(created!);
  }

  async listMaterialLibraries(companyId: string): Promise<IpMaterialLibrarySummary[]> {
    const rows = await this.deps.db.query.ipMaterialLibraries.findMany({
      where: eq(ipMaterialLibraries.companyId, companyId),
      orderBy: [desc(ipMaterialLibraries.createdAt)],
    });
    return rows.map(toMaterialLibrarySummary);
  }

  async createMaterialLibraryEntry(
    scope: StaffScope,
    input: CreateIpMaterialLibraryRequest,
  ): Promise<IpMaterialLibrarySummary> {
    const [created] = await this.deps.db
      .insert(ipMaterialLibraries)
      .values({
        companyId: scope.companyId,
        packCatalogId: input.packCatalogId ?? null,
        materialKey: input.materialKey,
        name: input.name,
        category: input.category ?? null,
        unit: input.unit ?? null,
        specifications: input.specifications ?? {},
        bundles: input.bundles ?? {},
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'material_library_created', 'material_library', created!.id);
    return toMaterialLibrarySummary(created!);
  }

  async listAssetTypes(companyId: string): Promise<IpAssetTypeSummary[]> {
    const rows = await this.deps.db.query.ipAssetTypes.findMany({
      where: eq(ipAssetTypes.companyId, companyId),
      orderBy: [desc(ipAssetTypes.createdAt)],
    });
    return rows.map(toAssetTypeSummary);
  }

  async createAssetType(scope: StaffScope, input: CreateIpAssetTypeRequest): Promise<IpAssetTypeSummary> {
    const [created] = await this.deps.db
      .insert(ipAssetTypes)
      .values({
        companyId: scope.companyId,
        packCatalogId: input.packCatalogId ?? null,
        assetTypeKey: input.assetTypeKey,
        name: input.name,
        description: input.description ?? null,
        fieldDefinitions: input.fieldDefinitions ?? {},
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'asset_type_created', 'asset_type', created!.id);
    return toAssetTypeSummary(created!);
  }

  async listPackExtensions(companyId: string, packCatalogId?: string): Promise<IpPackExtensionSummary[]> {
    const rows = await this.deps.db.query.ipPackExtensions.findMany({
      where: packCatalogId
        ? and(eq(ipPackExtensions.companyId, companyId), eq(ipPackExtensions.packCatalogId, packCatalogId))
        : eq(ipPackExtensions.companyId, companyId),
      orderBy: [desc(ipPackExtensions.createdAt)],
    });
    return rows.map(toPackExtensionSummary);
  }

  async createPackExtension(scope: StaffScope, input: CreateIpPackExtensionRequest): Promise<IpPackExtensionSummary> {
    const [created] = await this.deps.db
      .insert(ipPackExtensions)
      .values({
        companyId: scope.companyId,
        packCatalogId: input.packCatalogId,
        extensionType: input.extensionType,
        extensionKey: input.extensionKey,
        name: input.name,
        definition: input.definition ?? {},
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'pack_extension_created', 'pack_extension', created!.id);
    return toPackExtensionSummary(created!);
  }

  async syncIndustryAlerts(scope: StaffScope): Promise<IpIndustryAlertSummary[]> {
    const companyId = scope.companyId;
    const [frameworks, certificates, installations] = await Promise.all([
      this.listComplianceFrameworks(companyId),
      this.listCertificates(companyId),
      this.listInstalledPacks(companyId),
    ]);

    const alerts: IpIndustryAlertSummary[] = [];

    const draftFrameworks = frameworks.filter((f) => f.workflowStatus === 'draft');
    if (draftFrameworks.length > 0) {
      alerts.push(
        await this.upsertIndustryAlert(companyId, {
          alertType: 'compliance_framework_draft',
          severity: 'warning',
          title: 'Draft compliance frameworks require review',
          description: `${draftFrameworks.length} compliance framework(s) in draft status.`,
        }),
      );
    }

    const pendingCertificates = certificates.filter((c) => c.status === 'pending_approval');
    if (pendingCertificates.length > 0) {
      alerts.push(
        await this.upsertIndustryAlert(companyId, {
          alertType: 'certificate_pending_approval',
          severity: 'warning',
          title: 'Certificates pending approval',
          description: `${pendingCertificates.length} certificate(s) awaiting approval before issuance.`,
        }),
      );
    }

    const disabledPacks = installations.filter((i) => i.status === 'disabled');
    if (disabledPacks.length > 0) {
      alerts.push(
        await this.upsertIndustryAlert(companyId, {
          alertType: 'pack_disabled',
          severity: 'info',
          title: 'Disabled industry packs',
          description: `${disabledPacks.length} industry pack(s) currently disabled.`,
        }),
      );
    }

    return this.listIndustryAlerts(companyId, { status: 'open' });
  }

  async captureAnalytics(scope: StaffScope): Promise<IpAnalyticsSummary> {
    const companyId = scope.companyId;
    const [jobsStats, financeStats, installations, templates, certificates, frameworks] = await Promise.all([
      this.deps.jobsService.getStats(companyId),
      this.deps.financeService.getStats(companyId),
      this.listInstalledPacks(companyId),
      this.listTemplates(companyId),
      this.listCertificates(companyId),
      this.listComplianceFrameworks(companyId),
    ]);

    const metrics: Record<string, unknown> = {
      installedPackCount: installations.filter((i) => i.status === 'installed').length,
      templateCount: templates.length,
      certificateCount: certificates.length,
      issuedCertificateCount: certificates.filter((c) => c.status === 'issued').length,
      complianceFrameworkCount: frameworks.length,
      activeJobCount: jobsStats.activeCount,
      totalJobCount: jobsStats.totalCount,
      openQuoteCount: financeStats.openQuoteCount,
      invoiceCount: financeStats.invoiceCount,
      capturedAt: new Date().toISOString(),
    };

    const [snapshot] = await this.deps.db
      .insert(ipAnalyticsSnapshots)
      .values({ companyId, metrics })
      .returning();

    await this.recordAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(snapshot!);
  }

  async getIndustryMonitoring(companyId: string): Promise<IpIndustryMonitoringSummary> {
    const [installations, templates, certificates, alerts, frameworks] = await Promise.all([
      this.listInstalledPacks(companyId),
      this.listTemplates(companyId),
      this.listCertificates(companyId),
      this.listIndustryAlerts(companyId, { status: 'open' }),
      this.listComplianceFrameworks(companyId),
    ]);

    const activePackCount = installations.filter((i) => i.status === 'installed').length;
    const pendingCertificateCount = certificates.filter((c) => c.status === 'pending_approval').length;
    const openComplianceAlertCount = alerts.filter((a) => a.alertType.includes('compliance')).length;
    const openCertificateAlertCount = alerts.filter((a) => a.alertType.includes('certificate')).length;

    const alertMessages: string[] = [];
    if (openComplianceAlertCount > 0) alertMessages.push(`${openComplianceAlertCount} compliance alert(s)`);
    if (openCertificateAlertCount > 0) alertMessages.push(`${openCertificateAlertCount} certificate alert(s)`);
    if (pendingCertificateCount > 0) alertMessages.push(`${pendingCertificateCount} certificate(s) pending approval`);
    if (frameworks.filter((f) => f.workflowStatus === 'draft').length > 0) {
      alertMessages.push(`${frameworks.filter((f) => f.workflowStatus === 'draft').length} draft compliance framework(s)`);
    }

    return {
      installedPackCount: installations.length,
      activePackCount,
      openComplianceAlertCount,
      openCertificateAlertCount,
      pendingCertificateCount,
      templateCount: templates.length,
      openAlertCount: alerts.length,
      alerts: alertMessages,
    };
  }

  async listIndustryAlerts(
    companyId: string,
    filters?: { status?: string },
  ): Promise<IpIndustryAlertSummary[]> {
    const rows = await this.deps.db.query.ipIndustryAlerts.findMany({
      where: filters?.status
        ? and(eq(ipIndustryAlerts.companyId, companyId), eq(ipIndustryAlerts.status, filters.status as never))
        : eq(ipIndustryAlerts.companyId, companyId),
      orderBy: [desc(ipIndustryAlerts.createdAt)],
    });
    return rows.map(toIndustryAlertSummary);
  }

  async acknowledgeIndustryAlert(scope: StaffScope, alertId: string): Promise<IpIndustryAlertSummary> {
    await this.ensureIndustryAlert(scope.companyId, alertId);
    const [updated] = await this.deps.db
      .update(ipIndustryAlerts)
      .set({ status: 'acknowledged', updatedAt: new Date() })
      .where(eq(ipIndustryAlerts.id, alertId))
      .returning();
    await this.recordAudit(scope, 'alert_acknowledged', 'industry_alert', alertId);
    return toIndustryAlertSummary(updated!);
  }

  async createActionDraft(scope: StaffScope, input: CreateIpIndustryActionDraftRequest): Promise<IpActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(ipActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType,
        title: input.title,
        content: input.content,
        packCatalogId: input.packCatalogId ?? null,
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'action_draft_created', 'action_draft', created!.id);
    return toActionDraftSummary(created!);
  }

  async listActionDrafts(companyId: string): Promise<IpActionDraftSummary[]> {
    const rows = await this.deps.db.query.ipActionDrafts.findMany({
      where: eq(ipActionDrafts.companyId, companyId),
      orderBy: [desc(ipActionDrafts.createdAt)],
    });
    return rows.map(toActionDraftSummary);
  }

  async listAuditLogs(companyId: string, limit = 100): Promise<import('@titan/shared').IpAuditLogSummary[]> {
    const rows = await this.deps.db.query.ipAuditLogs.findMany({
      where: eq(ipAuditLogs.companyId, companyId),
      orderBy: [desc(ipAuditLogs.createdAt)],
      limit,
    });
    return rows.map(toAuditLogSummary);
  }

  private async ensureBuiltInCatalog(): Promise<void> {
    for (const pack of BUILT_IN_INDUSTRY_PACKS) {
      const existing = await this.deps.db.query.ipPackCatalog.findFirst({
        where: and(isNull(ipPackCatalog.companyId), eq(ipPackCatalog.packKey, pack.packKey)),
      });
      if (existing) continue;

      await this.deps.db.insert(ipPackCatalog).values({
        companyId: null,
        packKey: pack.packKey,
        name: pack.name,
        description: pack.description,
        industryCategory: pack.industryCategory,
        version: '1.0.0',
        isSystemPack: true,
        isCustomPack: pack.packKey === 'custom_pack_builder',
        licensingModel: 'included',
        compatibility: { titanVersion: '>=1.0.0' },
        capabilities: {
          workflows: true,
          templates: true,
          compliance: true,
          certificates: true,
          equipment: true,
          analytics: true,
        },
        config: {},
        workflowStatus: 'published',
      });
    }
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.ipPlatformConfig.findFirst({
      where: eq(ipPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;

    const [created] = await this.deps.db
      .insert(ipPlatformConfig)
      .values({ companyId })
      .returning();
    return created!;
  }

  private async ensureInstallation(companyId: string, installationId: string) {
    const row = await this.deps.db.query.ipPackInstallations.findFirst({
      where: and(eq(ipPackInstallations.id, installationId), eq(ipPackInstallations.companyId, companyId)),
    });
    if (!row) throw new EnterpriseIndustryPackError('NOT_FOUND', 'Pack installation not found');
    return row;
  }

  private async ensureComplianceFramework(companyId: string, frameworkId: string) {
    const row = await this.deps.db.query.ipComplianceFrameworks.findFirst({
      where: and(eq(ipComplianceFrameworks.id, frameworkId), eq(ipComplianceFrameworks.companyId, companyId)),
    });
    if (!row) throw new EnterpriseIndustryPackError('NOT_FOUND', 'Compliance framework not found');
    return row;
  }

  private async ensureCertificate(companyId: string, certificateId: string) {
    const row = await this.deps.db.query.ipCertificates.findFirst({
      where: and(eq(ipCertificates.id, certificateId), eq(ipCertificates.companyId, companyId)),
    });
    if (!row) throw new EnterpriseIndustryPackError('NOT_FOUND', 'Certificate not found');
    return row;
  }

  private async ensureIndustryAlert(companyId: string, alertId: string) {
    const row = await this.deps.db.query.ipIndustryAlerts.findFirst({
      where: and(eq(ipIndustryAlerts.id, alertId), eq(ipIndustryAlerts.companyId, companyId)),
    });
    if (!row) throw new EnterpriseIndustryPackError('NOT_FOUND', 'Industry alert not found');
    return row;
  }

  private async getLatestAnalytics(companyId: string): Promise<IpAnalyticsSummary | null> {
    const row = await this.deps.db.query.ipAnalyticsSnapshots.findFirst({
      where: eq(ipAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(ipAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  private async upsertIndustryAlert(
    companyId: string,
    input: {
      alertType: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description: string;
      packCatalogId?: string;
    },
  ): Promise<IpIndustryAlertSummary> {
    const existing = await this.deps.db.query.ipIndustryAlerts.findFirst({
      where: and(
        eq(ipIndustryAlerts.companyId, companyId),
        eq(ipIndustryAlerts.alertType, input.alertType),
        eq(ipIndustryAlerts.status, 'open'),
      ),
    });

    if (existing) {
      const [updated] = await this.deps.db
        .update(ipIndustryAlerts)
        .set({
          title: input.title,
          description: input.description,
          severity: input.severity,
          updatedAt: new Date(),
        })
        .where(eq(ipIndustryAlerts.id, existing.id))
        .returning();
      return toIndustryAlertSummary(updated!);
    }

    const [created] = await this.deps.db
      .insert(ipIndustryAlerts)
      .values({
        companyId,
        alertType: input.alertType,
        severity: input.severity,
        title: input.title,
        description: input.description,
        packCatalogId: input.packCatalogId ?? null,
        sourceModule: 'industry_packs',
        status: 'open',
      })
      .returning();
    return toIndustryAlertSummary(created!);
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(ipAuditLogs).values({
      companyId: scope.companyId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      userId: scope.userId,
      metadata: metadata ?? {},
    });
  }
}

function resolveIndustryHealthStatus(input: {
  openAlertCount: number;
  pendingCertificateCount: number;
  installedPackCount: number;
}): string {
  if (input.openAlertCount > 3) return 'critical';
  if (input.openAlertCount > 0 || input.pendingCertificateCount > 0) return 'degraded';
  if (input.installedPackCount > 0) return 'healthy';
  return 'healthy';
}

function toPlatformConfigSummary(row: typeof ipPlatformConfig.$inferSelect): IpPlatformConfigSummary {
  return {
    marketplacePolicy: row.marketplacePolicy ?? {},
    compliancePolicy: row.compliancePolicy ?? {},
    certificatePolicy: row.certificatePolicy ?? {},
    packBuilderPolicy: row.packBuilderPolicy ?? {},
    analyticsPolicy: row.analyticsPolicy ?? {},
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toPackCatalogSummary(row: typeof ipPackCatalog.$inferSelect): IpPackCatalogSummary {
  return {
    id: row.id,
    packKey: row.packKey,
    name: row.name,
    description: row.description,
    industryCategory: row.industryCategory,
    version: row.version,
    isSystemPack: row.isSystemPack,
    isCustomPack: row.isCustomPack,
    licensingModel: row.licensingModel,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPackInstallationSummary(
  row: typeof ipPackInstallations.$inferSelect,
  pack: typeof ipPackCatalog.$inferSelect,
): IpPackInstallationSummary {
  return {
    id: row.id,
    packCatalogId: row.packCatalogId,
    packKey: pack.packKey,
    packName: pack.name,
    installedVersion: row.installedVersion,
    status: row.status,
    installedByUserId: row.installedByUserId,
    installedAt: row.installedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toTemplateSummary(row: typeof ipTemplates.$inferSelect): IpTemplateSummary {
  return {
    id: row.id,
    packCatalogId: row.packCatalogId,
    templateKey: row.templateKey,
    templateType: row.templateType,
    name: row.name,
    description: row.description,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toComplianceFrameworkSummary(row: typeof ipComplianceFrameworks.$inferSelect): IpComplianceFrameworkSummary {
  return {
    id: row.id,
    packCatalogId: row.packCatalogId,
    frameworkKey: row.frameworkKey,
    name: row.name,
    description: row.description,
    countryCode: row.countryCode,
    industryCategory: row.industryCategory,
    regulatoryBody: row.regulatoryBody,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toComplianceRequirementSummary(
  row: typeof ipComplianceRequirements.$inferSelect,
): IpComplianceRequirementSummary {
  return {
    id: row.id,
    frameworkId: row.frameworkId,
    requirementKey: row.requirementKey,
    title: row.title,
    description: row.description,
    requirementType: row.requirementType,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCertificateSummary(row: typeof ipCertificates.$inferSelect): IpCertificateSummary {
  return {
    id: row.id,
    packCatalogId: row.packCatalogId,
    certificateKey: row.certificateKey,
    certificateType: row.certificateType,
    title: row.title,
    status: row.status,
    jobId: row.jobId,
    customerId: row.customerId,
    issuedByUserId: row.issuedByUserId,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    sourceWorkReference: row.sourceWorkReference,
    createdAt: row.createdAt.toISOString(),
  };
}

function toKnowledgeArticleSummary(row: typeof ipKnowledgeArticles.$inferSelect): IpKnowledgeArticleSummary {
  return {
    id: row.id,
    packCatalogId: row.packCatalogId,
    articleKey: row.articleKey,
    title: row.title,
    articleType: row.articleType,
    status: row.status,
    version: row.version,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toEquipmentCatalogSummary(row: typeof ipEquipmentCatalog.$inferSelect): IpEquipmentCatalogSummary {
  return {
    id: row.id,
    packCatalogId: row.packCatalogId,
    equipmentKey: row.equipmentKey,
    manufacturer: row.manufacturer,
    model: row.model,
    category: row.category,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMaterialLibrarySummary(row: typeof ipMaterialLibraries.$inferSelect): IpMaterialLibrarySummary {
  return {
    id: row.id,
    packCatalogId: row.packCatalogId,
    materialKey: row.materialKey,
    name: row.name,
    category: row.category,
    unit: row.unit,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAssetTypeSummary(row: typeof ipAssetTypes.$inferSelect): IpAssetTypeSummary {
  return {
    id: row.id,
    packCatalogId: row.packCatalogId,
    assetTypeKey: row.assetTypeKey,
    name: row.name,
    description: row.description,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPackExtensionSummary(row: typeof ipPackExtensions.$inferSelect): IpPackExtensionSummary {
  return {
    id: row.id,
    packCatalogId: row.packCatalogId,
    extensionType: row.extensionType,
    extensionKey: row.extensionKey,
    name: row.name,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toIndustryAlertSummary(row: typeof ipIndustryAlerts.$inferSelect): IpIndustryAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    packCatalogId: row.packCatalogId,
    sourceModule: row.sourceModule,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof ipActionDrafts.$inferSelect): IpActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    packCatalogId: row.packCatalogId,
    aiGenerated: row.aiGenerated,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof ipAuditLogs.$inferSelect) {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof ipAnalyticsSnapshots.$inferSelect): IpAnalyticsSummary {
  return {
    id: row.id,
    metrics: row.metrics ?? {},
    capturedAt: row.capturedAt.toISOString(),
  };
}
