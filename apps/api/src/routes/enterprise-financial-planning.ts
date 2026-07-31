import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseFinancialPlanningService } from '../services/enterprise-financial-planning.service.js';
import { EnterpriseFinancialPlanningError } from '../services/enterprise-financial-planning.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  financeStandards: z.record(z.unknown()).optional(),
  providerAdapterTemplates: z.record(z.unknown()).optional(),
  currencyStandards: z.record(z.unknown()).optional(),
  planningTemplates: z.record(z.unknown()).optional(),
  kpiTemplates: z.record(z.unknown()).optional(),
  riskThresholds: z.record(z.unknown()).optional(),
  allocationMethods: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  categoryKey: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  config: z.record(z.unknown()).optional(),
});

const entitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  entityKey: z.string().trim().min(1).max(100),
  entityType: z.string().trim().max(100).optional(),
  currency: z.string().trim().max(10).optional(),
  taxJurisdiction: z.string().trim().max(200).optional(),
  parentEntityId: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
});

const budgetLineSchema = z.object({
  lineKey: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  department: z.string().trim().max(200).optional(),
  branch: z.string().trim().max(200).optional(),
  project: z.string().trim().max(200).optional(),
  costCentre: z.string().trim().max(200).optional(),
  plannedAmountCents: z.number().int().min(0),
});

const budgetSchema = z.object({
  title: z.string().trim().min(1).max(200),
  entityId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  budgetPeriod: z.enum(['annual', 'monthly', 'quarterly', 'rolling']).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  currency: z.string().trim().max(10).optional(),
  assumptions: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(4000).optional(),
  totalAmountCents: z.number().int().min(0).optional(),
  lines: z.array(budgetLineSchema).optional(),
});

const forecastSchema = z.object({
  title: z.string().trim().min(1).max(200),
  entityId: z.string().uuid().optional(),
  forecastType: z.enum(['base', 'optimistic', 'conservative', 'custom']).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  currency: z.string().trim().max(10).optional(),
  assumptions: z.record(z.unknown()).optional(),
  isSimulation: z.boolean().optional(),
});

const scenarioLineSchema = z.object({
  lineKey: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  impactType: z.string().trim().max(100).optional(),
  amountCents: z.number().int(),
});

const scenarioSchema = z.object({
  title: z.string().trim().min(1).max(200),
  entityId: z.string().uuid().optional(),
  scenarioType: z.string().trim().min(1).max(100),
  assumptions: z.record(z.unknown()).optional(),
  lines: z.array(scenarioLineSchema).optional(),
});

const financialTargetSchema = z.object({
  targetKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  targetType: z.string().trim().min(1).max(100),
  entityId: z.string().uuid().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  targetValue: z.number().optional(),
  unit: z.string().trim().max(50).optional(),
  currency: z.string().trim().max(10).optional(),
});

const accountingProviderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  providerType: z.enum([
    'xero',
    'quickbooks',
    'sage',
    'zoho_books',
    'dynamics',
    'sap',
    'netsuite',
    'freshbooks',
    'wave',
    'odoo',
    'csv_import',
    'sftp',
    'generic_rest',
    'webhook',
    'custom',
  ]),
  entityId: z.string().uuid().optional(),
  syncDirection: z.string().trim().max(50).optional(),
  syncFrequency: z.string().trim().max(100).optional(),
  accountMappings: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const bankingProviderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  providerType: z.enum([
    'open_banking',
    'bank_api',
    'payment_gateway',
    'statement_feed',
    'csv_import',
    'ofx_import',
    'sftp',
    'manual_upload',
    'generic_rest',
    'webhook',
    'custom',
  ]),
  entityId: z.string().uuid().optional(),
  refreshSchedule: z.string().trim().max(100).optional(),
  accountMappings: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const treasuryAccountSchema = z.object({
  accountName: z.string().trim().min(1).max(200),
  entityId: z.string().uuid().optional(),
  bankingProviderId: z.string().uuid().optional(),
  accountNumberMasked: z.string().trim().max(50).optional(),
  bankName: z.string().trim().max(200).optional(),
  currency: z.string().trim().max(10).optional(),
  currentBalanceCents: z.number().int().optional(),
});

const profitabilitySnapshotSchema = z.object({
  dimensionType: z.string().trim().min(1).max(100),
  dimensionId: z.string().uuid().optional(),
  dimensionName: z.string().trim().max(200).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

const planningDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

const cashFlowProjectionSchema = z.object({
  entityId: z.string().uuid().optional(),
});

type RouterDeps = {
  enterpriseFinancialPlanningService: EnterpriseFinancialPlanningService;
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
  if (error instanceof EnterpriseFinancialPlanningError) {
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

export function createEnterpriseFinancialPlanningRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requirePortalAuth = createPortalAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    portalAuthService: deps.portalAuthService,
  });
  const requireRead = requireAnyPermission(
    'financial_planning:read',
    'financial_planning:manage',
    'finance:read',
  );
  const requireWrite = requireAnyPermission(
    'financial_planning:write',
    'financial_planning:manage',
  );
  const requireManage = requireAnyPermission('financial_planning:manage', 'platform:manage');

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseFinancialPlanningService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/financial-monitoring', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const financialMonitoring =
        await deps.enterpriseFinancialPlanningService.getFinancialMonitoring(auth.companyId);
      res.json({ data: { financialMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/portal', requirePortalAuth, async (req, res) => {
    try {
      const portalAuth = getPortalAuth(req);
      const summary = await deps.enterpriseFinancialPlanningService.getPortalFinanceSummary(
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
      const platformConfig = await deps.enterpriseFinancialPlanningService.getPlatformConfig(
        auth.companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterpriseFinancialPlanningService.updatePlatformConfig(
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
      const categories = await deps.enterpriseFinancialPlanningService.listCategories(
        auth.companyId,
      );
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
      const category = await deps.enterpriseFinancialPlanningService.createCategory(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { category } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/entities', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const entities = await deps.enterpriseFinancialPlanningService.listEntities(auth.companyId);
      res.json({ data: { entities } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/entities', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = entitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid entity' } });
      return;
    }
    try {
      const entity = await deps.enterpriseFinancialPlanningService.createEntity(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { entity } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/budgets', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const budgets = await deps.enterpriseFinancialPlanningService.listBudgets(auth.companyId);
      res.json({ data: { budgets } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/budgets', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = budgetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid budget' } });
      return;
    }
    try {
      const budget = await deps.enterpriseFinancialPlanningService.createBudget(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { budget } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/budgets/:budgetId/submit-for-review',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const budget = await deps.enterpriseFinancialPlanningService.submitBudgetForReview(
          staffScope(req),
          getRouteParam(req.params.budgetId),
        );
        res.json({ data: { budget } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/budgets/:budgetId/submit-for-approval',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const budget = await deps.enterpriseFinancialPlanningService.submitBudgetForApproval(
          staffScope(req),
          getRouteParam(req.params.budgetId),
        );
        res.json({ data: { budget } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post('/budgets/:budgetId/approve', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const budget = await deps.enterpriseFinancialPlanningService.approveBudget(
        staffScope(req),
        getRouteParam(req.params.budgetId),
      );
      res.json({ data: { budget } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/budgets/:budgetId/activate', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const budget = await deps.enterpriseFinancialPlanningService.activateBudget(
        staffScope(req),
        getRouteParam(req.params.budgetId),
      );
      res.json({ data: { budget } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/budgets/:budgetId/new-version',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const budget = await deps.enterpriseFinancialPlanningService.createBudgetVersion(
          staffScope(req),
          getRouteParam(req.params.budgetId),
        );
        res.status(201).json({ data: { budget } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/forecasts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const forecasts = await deps.enterpriseFinancialPlanningService.listForecasts(auth.companyId);
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
      const forecast = await deps.enterpriseFinancialPlanningService.createForecast(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { forecast } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/forecasts/:forecastId/snapshots',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const snapshot = await deps.enterpriseFinancialPlanningService.captureForecastSnapshot(
          staffScope(req),
          getRouteParam(req.params.forecastId),
        );
        res.status(201).json({ data: { snapshot } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/cash-flow/projections', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const projections = await deps.enterpriseFinancialPlanningService.listCashFlowProjections(
        auth.companyId,
      );
      res.json({ data: { projections } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/cash-flow/projections', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = cashFlowProjectionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid cash flow projection request' },
      });
      return;
    }
    try {
      const projection = await deps.enterpriseFinancialPlanningService.generateCashFlowProjection(
        staffScope(req),
        parsed.data.entityId,
      );
      res.status(201).json({ data: { projection } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/treasury/accounts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const accounts = await deps.enterpriseFinancialPlanningService.listTreasuryAccounts(
        auth.companyId,
      );
      res.json({ data: { accounts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/treasury/accounts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = treasuryAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid treasury account' } });
      return;
    }
    try {
      const account = await deps.enterpriseFinancialPlanningService.createTreasuryAccount(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { account } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/scenarios', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const scenarios = await deps.enterpriseFinancialPlanningService.listScenarios(auth.companyId);
      res.json({ data: { scenarios } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/scenarios', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = scenarioSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid scenario' } });
      return;
    }
    try {
      const scenario = await deps.enterpriseFinancialPlanningService.createScenario(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { scenario } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/targets', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const targets = await deps.enterpriseFinancialPlanningService.listFinancialTargets(
        auth.companyId,
      );
      res.json({ data: { targets } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/targets', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = financialTargetSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid financial target' } });
      return;
    }
    try {
      const target = await deps.enterpriseFinancialPlanningService.createFinancialTarget(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { target } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/alerts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const alerts = await deps.enterpriseFinancialPlanningService.listFinancialAlerts(
        auth.companyId,
        { status },
      );
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/sync', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const alerts = await deps.enterpriseFinancialPlanningService.syncFinancialAlerts(
        staffScope(req),
      );
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/accounting/providers', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const providers = await deps.enterpriseFinancialPlanningService.listAccountingProviders(
        auth.companyId,
      );
      res.json({ data: { providers } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/accounting/providers', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = accountingProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid accounting provider' } });
      return;
    }
    try {
      const provider = await deps.enterpriseFinancialPlanningService.createAccountingProvider(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/accounting/providers/:providerId/test',
    requireStaffAuth,
    requireManage,
    async (req, res) => {
      try {
        const provider = await deps.enterpriseFinancialPlanningService.testAccountingProvider(
          staffScope(req),
          getRouteParam(req.params.providerId),
        );
        res.json({ data: { provider } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/banking/providers', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const providers = await deps.enterpriseFinancialPlanningService.listBankingProviders(
        auth.companyId,
      );
      res.json({ data: { providers } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/banking/providers', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = bankingProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid banking provider' } });
      return;
    }
    try {
      const provider = await deps.enterpriseFinancialPlanningService.createBankingProvider(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/banking/providers/:providerId/test',
    requireStaffAuth,
    requireManage,
    async (req, res) => {
      try {
        const provider = await deps.enterpriseFinancialPlanningService.testBankingProvider(
          staffScope(req),
          getRouteParam(req.params.providerId),
        );
        res.json({ data: { provider } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/profitability/snapshots', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const snapshots = await deps.enterpriseFinancialPlanningService.listProfitabilitySnapshots(
        auth.companyId,
      );
      res.json({ data: { snapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/profitability/snapshots', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = profitabilitySnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid profitability snapshot request' },
      });
      return;
    }
    try {
      const snapshot = await deps.enterpriseFinancialPlanningService.captureProfitabilitySnapshot(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseFinancialPlanningService.captureAnalytics(
        staffScope(req),
      );
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/analytics/latest', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const analytics = await deps.enterpriseFinancialPlanningService.getLatestAnalytics(
        auth.companyId,
      );
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/planning-drafts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = planningDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid planning action draft' } });
      return;
    }
    try {
      const draft = await deps.enterpriseFinancialPlanningService.createPlanningActionDraft(
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
