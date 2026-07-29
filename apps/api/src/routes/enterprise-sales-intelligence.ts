import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseSalesIntelligenceService } from '../services/enterprise-sales-intelligence.service.js';
import { EnterpriseSalesIntelligenceError } from '../services/enterprise-sales-intelligence.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  salesStandards: z.record(z.unknown()).optional(),
  providerAdapterTemplates: z.record(z.unknown()).optional(),
  pipelineTemplates: z.record(z.unknown()).optional(),
  playbookTemplates: z.record(z.unknown()).optional(),
  targetTemplates: z.record(z.unknown()).optional(),
  forecastMethodology: z.record(z.unknown()).optional(),
  attributionStandards: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  categoryKey: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  config: z.record(z.unknown()).optional(),
});

const territorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  territoryKey: z.string().trim().min(1).max(100),
  territoryType: z.string().trim().max(100).optional(),
  branch: z.string().trim().max(200).optional(),
  config: z.record(z.unknown()).optional(),
});

const salesTeamSchema = z.object({
  name: z.string().trim().min(1).max(200),
  teamKey: z.string().trim().min(1).max(100),
  territoryId: z.string().uuid().optional(),
  leaderUserId: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
});

const pipelineStageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  stageKey: z.string().trim().min(1).max(100),
  sortOrder: z.number().int().optional(),
  probabilityPercent: z.number().optional(),
  slaHours: z.number().int().optional(),
});

const pipelineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  pipelineKey: z.string().trim().min(1).max(100),
  pipelineType: z.string().trim().max(100).optional(),
  config: z.record(z.unknown()).optional(),
  stages: z.array(pipelineStageSchema).optional(),
});

const playbookSchema = z.object({
  name: z.string().trim().min(1).max(200),
  playbookKey: z.string().trim().min(1).max(100),
  playbookType: z.string().trim().max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

const forecastSchema = z.object({
  title: z.string().trim().min(1).max(200),
  forecastType: z.string().trim().max(100).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  currency: z.string().trim().max(10).optional(),
  assumptions: z.record(z.unknown()).optional(),
  isSimulation: z.boolean().optional(),
});

const salesTargetSchema = z.object({
  targetKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  targetType: z.string().trim().min(1).max(100),
  teamId: z.string().uuid().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  targetValue: z.number().optional(),
  unit: z.string().trim().max(50).optional(),
  currency: z.string().trim().max(10).optional(),
});

const accountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  accountType: z.string().trim().max(100).optional(),
  customerId: z.string().uuid().optional(),
  territoryId: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
});

const accountPlanSchema = z.object({
  accountId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  goals: z.record(z.unknown()).optional(),
  stakeholders: z.array(z.unknown()).optional(),
  actionPlan: z.record(z.unknown()).optional(),
});

const renewalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  accountId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  renewalType: z.string().trim().max(100).optional(),
  renewalDate: z.string().optional(),
  noticePeriodDays: z.number().int().optional(),
  currentValueCents: z.number().int().optional(),
  proposedValueCents: z.number().int().optional(),
});

const pricingRuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ruleKey: z.string().trim().min(1).max(100),
  ruleType: z.string().trim().min(1).max(100),
  config: z.record(z.unknown()).optional(),
});

const discountPolicySchema = z.object({
  name: z.string().trim().min(1).max(200),
  policyKey: z.string().trim().min(1).max(100),
  maxDiscountPercent: z.number().optional(),
  marginFloorPercent: z.number().optional(),
  approvalThresholdPercent: z.number().optional(),
  config: z.record(z.unknown()).optional(),
});

const discountRequestSchema = z.object({
  quoteId: z.string().uuid().optional(),
  discountPercent: z.number().optional(),
  discountAmountCents: z.number().int().optional(),
  reason: z.string().trim().max(2000).optional(),
  marginImpactPercent: z.number().optional(),
});

const commissionPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  planKey: z.string().trim().min(1).max(100),
  formula: z.string().trim().max(500).optional(),
  config: z.record(z.unknown()).optional(),
});

const qualificationSchema = z.object({
  leadId: z.string().uuid(),
});

const winLossSchema = z.object({
  opportunityId: z.string().uuid().optional(),
  outcome: z.string().trim().min(1).max(100),
  reason: z.string().trim().max(2000).optional(),
  competitor: z.string().trim().max(200).optional(),
  priceImpact: z.string().trim().max(500).optional(),
  customerFeedback: z.string().trim().max(4000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const partnerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  partnerType: z.string().trim().max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

const tenderSchema = z.object({
  title: z.string().trim().min(1).max(200),
  tenderNumber: z.string().trim().max(100).optional(),
  deadline: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const crmProviderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  providerType: z.enum([
    'salesforce',
    'hubspot',
    'zoho_crm',
    'dynamics',
    'pipedrive',
    'freshsales',
    'monday',
    'odoo',
    'copper',
    'insightly',
    'sap',
    'oracle_cx',
    'csv_import',
    'sftp',
    'generic_rest',
    'webhook',
    'custom',
  ]),
  syncDirection: z.string().trim().max(50).optional(),
  syncFrequency: z.string().trim().max(100).optional(),
  fieldMappings: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const salesDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

const leadMergeSchema = z.object({
  candidateId: z.string().uuid(),
  mergeReason: z.string().trim().min(1).max(2000),
});

const growthSnapshotSchema = z.object({
  customerId: z.string().uuid().optional(),
});

const retentionSnapshotSchema = z.object({
  customerId: z.string().uuid().optional(),
});

type RouterDeps = {
  enterpriseSalesIntelligenceService: EnterpriseSalesIntelligenceService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  portalAuthService: PortalAuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getPortalAuth(req: import('express').Request) {
  return (req as PortalAuthenticatedRequest).portalAuth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseSalesIntelligenceError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseSalesIntelligenceRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requirePortalAuth = createPortalAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    portalAuthService: deps.portalAuthService,
  });
  const requireRead = requireAnyPermission(
    'sales_intelligence:read',
    'sales_intelligence:manage',
    'sales:read',
    'leads:read',
  );
  const requireWrite = requireAnyPermission('sales_intelligence:write', 'sales_intelligence:manage');
  const requireManage = requireAnyPermission('sales_intelligence:manage', 'platform:manage');

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseSalesIntelligenceService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/revenue-monitoring', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const revenueMonitoring = await deps.enterpriseSalesIntelligenceService.getRevenueMonitoring(auth.companyId);
      res.json({ data: { revenueMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/portal', requirePortalAuth, async (req, res) => {
    try {
      const portalAuth = getPortalAuth(req);
      const summary = await deps.enterpriseSalesIntelligenceService.getPortalSalesSummary(
        portalAuth.companyId,
        portalAuth.customerId,
      );
      res.json({ data: { summary } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseSalesIntelligenceService.getPlatformConfig(auth.companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterpriseSalesIntelligenceService.updatePlatformConfig(
        staffScope(req),
        parsed.data,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/categories', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const categories = await deps.enterpriseSalesIntelligenceService.listCategories(auth.companyId);
      res.json({ data: { categories } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/categories', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid category' } });
      return;
    }
    try {
      const category = await deps.enterpriseSalesIntelligenceService.createCategory(staffScope(req), parsed.data);
      res.status(201).json({ data: { category } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/territories', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const territories = await deps.enterpriseSalesIntelligenceService.listTerritories(auth.companyId);
      res.json({ data: { territories } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/territories', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = territorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid territory' } });
      return;
    }
    try {
      const territory = await deps.enterpriseSalesIntelligenceService.createTerritory(staffScope(req), parsed.data);
      res.status(201).json({ data: { territory } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/teams', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const teams = await deps.enterpriseSalesIntelligenceService.listSalesTeams(auth.companyId);
      res.json({ data: { teams } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/teams', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = salesTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sales team' } });
      return;
    }
    try {
      const team = await deps.enterpriseSalesIntelligenceService.createSalesTeam(staffScope(req), parsed.data);
      res.status(201).json({ data: { team } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/pipelines', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const pipelines = await deps.enterpriseSalesIntelligenceService.listPipelines(auth.companyId);
      res.json({ data: { pipelines } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/pipelines', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = pipelineSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid pipeline' } });
      return;
    }
    try {
      const pipeline = await deps.enterpriseSalesIntelligenceService.createPipeline(staffScope(req), parsed.data);
      res.status(201).json({ data: { pipeline } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/pipelines/:pipelineId/stages', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const stages = await deps.enterpriseSalesIntelligenceService.listPipelineStages(
        auth.companyId,
        getRouteParam(req.params.pipelineId),
      );
      res.json({ data: { stages } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/lead-deduplication/candidates', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const candidates = await deps.enterpriseSalesIntelligenceService.listLeadDeduplicationCandidates(
        auth.companyId,
      );
      res.json({ data: { candidates } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/lead-deduplication/approve-merge', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = leadMergeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid lead merge request' } });
      return;
    }
    try {
      const result = await deps.enterpriseSalesIntelligenceService.approveLeadMerge(staffScope(req), parsed.data);
      res.json({ data: { result } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/playbooks', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const playbooks = await deps.enterpriseSalesIntelligenceService.listPlaybooks(auth.companyId);
      res.json({ data: { playbooks } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/playbooks', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = playbookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid playbook' } });
      return;
    }
    try {
      const playbook = await deps.enterpriseSalesIntelligenceService.createPlaybook(staffScope(req), parsed.data);
      res.status(201).json({ data: { playbook } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/forecasts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const forecasts = await deps.enterpriseSalesIntelligenceService.listForecasts(auth.companyId);
      res.json({ data: { forecasts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/forecasts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = forecastSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid forecast' } });
      return;
    }
    try {
      const forecast = await deps.enterpriseSalesIntelligenceService.createForecast(staffScope(req), parsed.data);
      res.status(201).json({ data: { forecast } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/forecasts/:forecastId/snapshots', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const snapshot = await deps.enterpriseSalesIntelligenceService.captureForecastSnapshot(
        staffScope(req),
        getRouteParam(req.params.forecastId),
      );
      res.status(201).json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/targets', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const targets = await deps.enterpriseSalesIntelligenceService.listSalesTargets(auth.companyId);
      res.json({ data: { targets } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/targets', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = salesTargetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sales target' } });
      return;
    }
    try {
      const target = await deps.enterpriseSalesIntelligenceService.createSalesTarget(staffScope(req), parsed.data);
      res.status(201).json({ data: { target } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/accounts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const accounts = await deps.enterpriseSalesIntelligenceService.listAccounts(auth.companyId);
      res.json({ data: { accounts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/accounts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid account' } });
      return;
    }
    try {
      const account = await deps.enterpriseSalesIntelligenceService.createAccount(staffScope(req), parsed.data);
      res.status(201).json({ data: { account } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/account-plans', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = accountPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid account plan' } });
      return;
    }
    try {
      const accountPlan = await deps.enterpriseSalesIntelligenceService.createAccountPlan(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { accountPlan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/renewals', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const renewals = await deps.enterpriseSalesIntelligenceService.listRenewals(auth.companyId);
      res.json({ data: { renewals } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/renewals', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = renewalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid renewal' } });
      return;
    }
    try {
      const renewal = await deps.enterpriseSalesIntelligenceService.createRenewal(staffScope(req), parsed.data);
      res.status(201).json({ data: { renewal } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/growth/snapshots', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const snapshots = await deps.enterpriseSalesIntelligenceService.listCustomerGrowthSnapshots(auth.companyId);
      res.json({ data: { snapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/growth/snapshots', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = growthSnapshotSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid growth snapshot request' } });
      return;
    }
    try {
      const snapshot = await deps.enterpriseSalesIntelligenceService.captureCustomerGrowthSnapshot(
        staffScope(req),
        parsed.data.customerId,
      );
      res.status(201).json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/retention/snapshots', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const snapshots = await deps.enterpriseSalesIntelligenceService.listRetentionRiskSnapshots(auth.companyId);
      res.json({ data: { snapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/retention/snapshots', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = retentionSnapshotSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid retention snapshot request' } });
      return;
    }
    try {
      const snapshot = await deps.enterpriseSalesIntelligenceService.captureRetentionRiskSnapshot(
        staffScope(req),
        parsed.data.customerId,
      );
      res.status(201).json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/pricing/rules', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const rules = await deps.enterpriseSalesIntelligenceService.listPricingRules(auth.companyId);
      res.json({ data: { rules } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/pricing/rules', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = pricingRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid pricing rule' } });
      return;
    }
    try {
      const rule = await deps.enterpriseSalesIntelligenceService.createPricingRule(staffScope(req), parsed.data);
      res.status(201).json({ data: { rule } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/discounts/policies', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const policies = await deps.enterpriseSalesIntelligenceService.listDiscountPolicies(auth.companyId);
      res.json({ data: { policies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/discounts/policies', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = discountPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid discount policy' } });
      return;
    }
    try {
      const policy = await deps.enterpriseSalesIntelligenceService.createDiscountPolicy(staffScope(req), parsed.data);
      res.status(201).json({ data: { policy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/discounts/requests', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const requests = await deps.enterpriseSalesIntelligenceService.listDiscountRequests(auth.companyId);
      res.json({ data: { requests } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/discounts/requests', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = discountRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid discount request' } });
      return;
    }
    try {
      const request = await deps.enterpriseSalesIntelligenceService.createDiscountRequest(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { request } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/discounts/requests/:requestId/submit-for-review', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const request = await deps.enterpriseSalesIntelligenceService.submitDiscountRequestForReview(
        staffScope(req),
        getRouteParam(req.params.requestId),
      );
      res.json({ data: { request } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/discounts/requests/:requestId/submit-for-approval', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const request = await deps.enterpriseSalesIntelligenceService.submitDiscountRequestForApproval(
        staffScope(req),
        getRouteParam(req.params.requestId),
      );
      res.json({ data: { request } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/discounts/requests/:requestId/approve', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const request = await deps.enterpriseSalesIntelligenceService.approveDiscountRequest(
        staffScope(req),
        getRouteParam(req.params.requestId),
      );
      res.json({ data: { request } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/discounts/requests/:requestId/execute', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const request = await deps.enterpriseSalesIntelligenceService.executeDiscountRequest(
        staffScope(req),
        getRouteParam(req.params.requestId),
      );
      res.json({ data: { request } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/commissions/plans', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const plans = await deps.enterpriseSalesIntelligenceService.listCommissionPlans(auth.companyId);
      res.json({ data: { plans } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/commissions/plans', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = commissionPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid commission plan' } });
      return;
    }
    try {
      const plan = await deps.enterpriseSalesIntelligenceService.createCommissionPlan(staffScope(req), parsed.data);
      res.status(201).json({ data: { plan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/commissions/entries', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const entries = await deps.enterpriseSalesIntelligenceService.listCommissionEntries(auth.companyId);
      res.json({ data: { entries } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/qualification', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = qualificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid qualification request' } });
      return;
    }
    try {
      const analysis = await deps.enterpriseSalesIntelligenceService.requestLeadQualification(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { analysis } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/win-loss', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const records = await deps.enterpriseSalesIntelligenceService.listWinLossRecords(auth.companyId);
      res.json({ data: { records } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/win-loss', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = winLossSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid win/loss record' } });
      return;
    }
    try {
      const record = await deps.enterpriseSalesIntelligenceService.createWinLossRecord(staffScope(req), parsed.data);
      res.status(201).json({ data: { record } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/revenue-leakage', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const findings = await deps.enterpriseSalesIntelligenceService.listRevenueLeakageFindings(auth.companyId);
      res.json({ data: { findings } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/revenue-leakage/sync', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const findings = await deps.enterpriseSalesIntelligenceService.syncRevenueLeakageFindings(staffScope(req));
      res.json({ data: { findings } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/partners', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const partners = await deps.enterpriseSalesIntelligenceService.listPartners(auth.companyId);
      res.json({ data: { partners } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/partners', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid partner' } });
      return;
    }
    try {
      const partner = await deps.enterpriseSalesIntelligenceService.createPartner(staffScope(req), parsed.data);
      res.status(201).json({ data: { partner } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/referrals', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const referrals = await deps.enterpriseSalesIntelligenceService.listReferrals(auth.companyId);
      res.json({ data: { referrals } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/tenders', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const tenders = await deps.enterpriseSalesIntelligenceService.listTenders(auth.companyId);
      res.json({ data: { tenders } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenders', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = tenderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid tender' } });
      return;
    }
    try {
      const tender = await deps.enterpriseSalesIntelligenceService.createTender(staffScope(req), parsed.data);
      res.status(201).json({ data: { tender } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/crm/providers', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const providers = await deps.enterpriseSalesIntelligenceService.listCrmProviders(auth.companyId);
      res.json({ data: { providers } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/crm/providers', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = crmProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid CRM provider' } });
      return;
    }
    try {
      const provider = await deps.enterpriseSalesIntelligenceService.createCrmProvider(staffScope(req), parsed.data);
      res.status(201).json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/crm/providers/:providerId/test', requireStaffAuth, requireManage, async (req, res) => {
    try {
      const provider = await deps.enterpriseSalesIntelligenceService.testCrmProvider(
        staffScope(req),
        getRouteParam(req.params.providerId),
      );
      res.json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/alerts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const alerts = await deps.enterpriseSalesIntelligenceService.listSalesAlerts(auth.companyId, { status });
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/sync', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const alerts = await deps.enterpriseSalesIntelligenceService.syncSalesAlerts(staffScope(req));
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseSalesIntelligenceService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/analytics/latest', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const analytics = await deps.enterpriseSalesIntelligenceService.getLatestAnalytics(auth.companyId);
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/sales-drafts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = salesDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sales action draft' } });
      return;
    }
    try {
      const draft = await deps.enterpriseSalesIntelligenceService.createSalesActionDraft(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
