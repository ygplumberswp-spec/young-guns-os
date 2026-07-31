import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseIndustryPackService } from '../services/enterprise-industry-packs.service.js';
import { EnterpriseIndustryPackError } from '../services/enterprise-industry-packs.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  marketplacePolicy: z.record(z.unknown()).optional(),
  compliancePolicy: z.record(z.unknown()).optional(),
  certificatePolicy: z.record(z.unknown()).optional(),
  packBuilderPolicy: z.record(z.unknown()).optional(),
  analyticsPolicy: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const installPackSchema = z.object({
  packCatalogId: z.string().uuid(),
  installedVersion: z.string().trim().max(50).optional(),
  config: z.record(z.unknown()).optional(),
});

const customPackSchema = z.object({
  packKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  industryCategory: z.string().trim().min(1).max(100),
  version: z.string().trim().max(50).optional(),
  licensingModel: z.string().trim().max(100).optional(),
  compatibility: z.record(z.unknown()).optional(),
  capabilities: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const templateSchema = z.object({
  packCatalogId: z.string().uuid().optional(),
  templateKey: z.string().trim().min(1).max(200),
  templateType: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  definition: z.record(z.unknown()).optional(),
});

const complianceFrameworkSchema = z.object({
  packCatalogId: z.string().uuid().optional(),
  frameworkKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  countryCode: z.string().trim().max(10).optional(),
  industryCategory: z.string().trim().max(100).optional(),
  regulatoryBody: z.string().trim().max(200).optional(),
  config: z.record(z.unknown()).optional(),
});

const complianceRequirementSchema = z.object({
  frameworkId: z.string().uuid(),
  requirementKey: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  requirementType: z.string().trim().max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

const certificateSchema = z.object({
  packCatalogId: z.string().uuid().optional(),
  certificateKey: z.string().trim().min(1).max(200),
  certificateType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  jobId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  sourceWorkReference: z.string().trim().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const knowledgeArticleSchema = z.object({
  packCatalogId: z.string().uuid().optional(),
  articleKey: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  articleType: z.string().trim().min(1).max(100),
  content: z.string().trim().max(50000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const equipmentSchema = z.object({
  packCatalogId: z.string().uuid().optional(),
  equipmentKey: z.string().trim().min(1).max(200),
  manufacturer: z.string().trim().max(200).optional(),
  model: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  specifications: z.record(z.unknown()).optional(),
  serviceIntervals: z.record(z.unknown()).optional(),
  replacementParts: z.record(z.unknown()).optional(),
  attachments: z.record(z.unknown()).optional(),
});

const materialSchema = z.object({
  packCatalogId: z.string().uuid().optional(),
  materialKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).optional(),
  unit: z.string().trim().max(50).optional(),
  specifications: z.record(z.unknown()).optional(),
  bundles: z.record(z.unknown()).optional(),
});

const assetTypeSchema = z.object({
  packCatalogId: z.string().uuid().optional(),
  assetTypeKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  fieldDefinitions: z.record(z.unknown()).optional(),
});

const packExtensionSchema = z.object({
  packCatalogId: z.string().uuid(),
  extensionType: z.string().trim().min(1).max(100),
  extensionKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  definition: z.record(z.unknown()).optional(),
});

const draftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  packCatalogId: z.string().uuid().optional(),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseIndustryPackService: EnterpriseIndustryPackService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0]! : value;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseIndustryPackError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT'
          ? 400
          : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseIndustryPacksRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requireRead = requireAnyPermission('industry_packs:read', 'industry_packs:manage');
  const requireWrite = requireAnyPermission('industry_packs:write', 'industry_packs:manage');
  const requireManage = requireAnyPermission('industry_packs:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseIndustryPackService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/industry-monitoring', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const industryMonitoring = await deps.enterpriseIndustryPackService.getIndustryMonitoring(
        auth.companyId,
      );
      res.json({ data: { industryMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseIndustryPackService.getPlatformConfig(
        auth.companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterpriseIndustryPackService.updatePlatformConfig(
        staffScope(req),
        parsed.data,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/industry-alerts/sync', requireWrite, async (req, res) => {
    try {
      const alerts = await deps.enterpriseIndustryPackService.syncIndustryAlerts(staffScope(req));
      res.json({ data: { industryAlerts: alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseIndustryPackService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/aura-context', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const auraContext = await deps.enterpriseIndustryPackService.buildAuraContext(auth.companyId);
      res.json({ data: { auraContext } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/marketplace-packs', requireRead, async (_req, res) => {
    try {
      const marketplacePacks = await deps.enterpriseIndustryPackService.listMarketplacePacks();
      res.json({ data: { marketplacePacks } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/installed-packs', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const installedPacks = await deps.enterpriseIndustryPackService.listInstalledPacks(
        auth.companyId,
      );
      res.json({ data: { installedPacks } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/installed-packs', requireWrite, async (req, res) => {
    const parsed = installPackSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid install request' } });
      return;
    }
    try {
      const installation = await deps.enterpriseIndustryPackService.installPack(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { installation } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/installed-packs/:installationId/disable', requireManage, async (req, res) => {
    try {
      const installation = await deps.enterpriseIndustryPackService.disablePack(
        staffScope(req),
        getRouteParam(req.params.installationId),
      );
      res.json({ data: { installation } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/installed-packs/:installationId/uninstall', requireManage, async (req, res) => {
    try {
      const installation = await deps.enterpriseIndustryPackService.uninstallPack(
        staffScope(req),
        getRouteParam(req.params.installationId),
      );
      res.json({ data: { installation } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/custom-packs', requireManage, async (req, res) => {
    const parsed = customPackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid custom pack' } });
      return;
    }
    try {
      const pack = await deps.enterpriseIndustryPackService.createCustomPack(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { pack } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/templates', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const templateType =
        typeof req.query.templateType === 'string' ? req.query.templateType : undefined;
      const templates = await deps.enterpriseIndustryPackService.listTemplates(
        auth.companyId,
        templateType,
      );
      res.json({ data: { templates } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/templates', requireWrite, async (req, res) => {
    const parsed = templateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid template' } });
      return;
    }
    try {
      const template = await deps.enterpriseIndustryPackService.createTemplate(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { template } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/compliance-frameworks', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const complianceFrameworks =
        await deps.enterpriseIndustryPackService.listComplianceFrameworks(auth.companyId);
      res.json({ data: { complianceFrameworks } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/compliance-frameworks', requireWrite, async (req, res) => {
    const parsed = complianceFrameworkSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid compliance framework' } });
      return;
    }
    try {
      const framework = await deps.enterpriseIndustryPackService.createComplianceFramework(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { framework } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/compliance-requirements', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const frameworkId =
        typeof req.query.frameworkId === 'string' ? req.query.frameworkId : undefined;
      const complianceRequirements =
        await deps.enterpriseIndustryPackService.listComplianceRequirements(
          auth.companyId,
          frameworkId,
        );
      res.json({ data: { complianceRequirements } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/compliance-requirements', requireWrite, async (req, res) => {
    const parsed = complianceRequirementSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid compliance requirement' } });
      return;
    }
    try {
      const requirement = await deps.enterpriseIndustryPackService.createComplianceRequirement(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { requirement } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/certificates', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const certificates = await deps.enterpriseIndustryPackService.listCertificates(
        auth.companyId,
      );
      res.json({ data: { certificates } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/certificates', requireWrite, async (req, res) => {
    const parsed = certificateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid certificate' } });
      return;
    }
    try {
      const certificate = await deps.enterpriseIndustryPackService.createCertificate(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { certificate } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/certificates/:certificateId/issue', requireManage, async (req, res) => {
    try {
      const certificate = await deps.enterpriseIndustryPackService.issueCertificate(
        staffScope(req),
        getRouteParam(req.params.certificateId),
      );
      res.json({ data: { certificate } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/knowledge-articles', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const knowledgeArticles = await deps.enterpriseIndustryPackService.listKnowledgeArticles(
        auth.companyId,
      );
      res.json({ data: { knowledgeArticles } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/knowledge-articles', requireWrite, async (req, res) => {
    const parsed = knowledgeArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid knowledge article' } });
      return;
    }
    try {
      const article = await deps.enterpriseIndustryPackService.createKnowledgeArticle(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { article } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/equipment-catalog', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const equipmentCatalog = await deps.enterpriseIndustryPackService.listEquipmentCatalog(
        auth.companyId,
      );
      res.json({ data: { equipmentCatalog } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/equipment-catalog', requireWrite, async (req, res) => {
    const parsed = equipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid equipment catalog entry' } });
      return;
    }
    try {
      const entry = await deps.enterpriseIndustryPackService.createEquipmentCatalogEntry(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { entry } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/material-libraries', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const materialLibraries = await deps.enterpriseIndustryPackService.listMaterialLibraries(
        auth.companyId,
      );
      res.json({ data: { materialLibraries } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/material-libraries', requireWrite, async (req, res) => {
    const parsed = materialSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid material library entry' } });
      return;
    }
    try {
      const entry = await deps.enterpriseIndustryPackService.createMaterialLibraryEntry(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { entry } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/asset-types', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const assetTypes = await deps.enterpriseIndustryPackService.listAssetTypes(auth.companyId);
      res.json({ data: { assetTypes } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/asset-types', requireWrite, async (req, res) => {
    const parsed = assetTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid asset type' } });
      return;
    }
    try {
      const assetType = await deps.enterpriseIndustryPackService.createAssetType(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { assetType } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/pack-extensions', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const packCatalogId =
        typeof req.query.packCatalogId === 'string' ? req.query.packCatalogId : undefined;
      const packExtensions = await deps.enterpriseIndustryPackService.listPackExtensions(
        auth.companyId,
        packCatalogId,
      );
      res.json({ data: { packExtensions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/pack-extensions', requireWrite, async (req, res) => {
    const parsed = packExtensionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid pack extension' } });
      return;
    }
    try {
      const extension = await deps.enterpriseIndustryPackService.createPackExtension(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { extension } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/industry-alerts', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const industryAlerts = await deps.enterpriseIndustryPackService.listIndustryAlerts(
        auth.companyId,
      );
      res.json({ data: { industryAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/industry-alerts/:alertId/acknowledge', requireWrite, async (req, res) => {
    try {
      const industryAlert = await deps.enterpriseIndustryPackService.acknowledgeIndustryAlert(
        staffScope(req),
        getRouteParam(req.params.alertId),
      );
      res.json({ data: { industryAlert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action draft' } });
      return;
    }
    try {
      const actionDraft = await deps.enterpriseIndustryPackService.createActionDraft(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const auditLogs = await deps.enterpriseIndustryPackService.listAuditLogs(auth.companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
