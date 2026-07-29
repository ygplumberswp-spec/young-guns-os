import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseAutomationStudioService } from '../services/enterprise-automation-studio.service.js';
import { EnterpriseAutomationStudioError } from '../services/enterprise-automation-studio.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const nodeTypeSchema = z.enum([
  'trigger',
  'action',
  'condition',
  'delay',
  'approval',
  'parallel',
  'loop',
  'webhook',
  'ai_agent',
  'custom',
]);

const approvalTypeSchema = z.enum(['single', 'multi_level', 'department', 'executive', 'delegated']);
const actionTypeSchema = z.enum([
  'workflow_improvement',
  'automation_recommendation',
  'bottleneck_fix',
  'performance_optimization',
]);

const designerSchema = z.object({
  nodes: z
    .array(
      z.object({
        nodeKey: z.string().trim().min(1).max(100),
        nodeType: nodeTypeSchema,
        title: z.string().trim().min(1).max(200),
        positionX: z.number().int().optional(),
        positionY: z.number().int().optional(),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
  connections: z
    .array(
      z.object({
        sourceNodeKey: z.string().trim().min(1).max(100),
        targetNodeKey: z.string().trim().min(1).max(100),
        conditionExpression: z.string().trim().max(2000).optional().nullable(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
  variables: z
    .array(
      z.object({
        variableKey: z.string().trim().min(1).max(100),
        label: z.string().trim().min(1).max(200),
        variableType: z.string().trim().max(50).optional(),
        defaultValue: z.string().trim().max(2000).optional().nullable(),
        required: z.boolean().optional(),
        validation: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
  canvasConfig: z.record(z.unknown()).optional(),
});

const actionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  workflowId: z.string().uuid().optional().nullable(),
  payload: z.record(z.unknown()).optional(),
});

const approvalChainSchema = z.object({
  approvalType: approvalTypeSchema,
  levels: z.array(z.record(z.unknown())).optional(),
  enabled: z.boolean().optional(),
});

const testRunSchema = z.object({
  inputPayload: z.record(z.unknown()).optional(),
});

const versionSchema = z.object({
  changeSummary: z.string().trim().max(2000).optional().nullable(),
});

type RouterDeps = {
  enterpriseAutomationStudioService: EnterpriseAutomationStudioService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createEnterpriseAutomationStudioRouter({
  enterpriseAutomationStudioService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('automation:read', 'automation:write', 'agents:read');
  const requireWrite = requireAnyPermission('automation:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await enterpriseAutomationStudioService.getExecutiveDashboard(companyId);
    res.json({ data: { dashboard } });
  });

  router.get('/monitoring', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const monitoring = await enterpriseAutomationStudioService.getMonitoringSummary(companyId);
    res.json({ data: { monitoring } });
  });

  router.post('/monitoring/snapshot', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    await enterpriseAutomationStudioService.recordMetricsSnapshot(companyId);
    const monitoring = await enterpriseAutomationStudioService.getMonitoringSummary(companyId);
    res.status(201).json({ data: { monitoring } });
  });

  router.get('/workflows/:id/designer', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const designer = await enterpriseAutomationStudioService.getDesigner(companyId, getRouteParam(req.params.id));
    res.json({ data: { designer } });
  });

  router.put('/workflows/:id/designer', requireWrite, async (req, res) => {
    const parsed = designerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid designer payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const designer = await enterpriseAutomationStudioService.saveDesigner(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { designer } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/workflows/:id/versions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const versions = await enterpriseAutomationStudioService.listVersions(companyId, getRouteParam(req.params.id));
    res.json({ data: { versions } });
  });

  router.post('/workflows/:id/versions', requireWrite, async (req, res) => {
    const parsed = versionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid version payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const version = await enterpriseAutomationStudioService.createVersion(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { version } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/workflows/:id/test', requireWrite, async (req, res) => {
    const parsed = testRunSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid test payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const testRun = await enterpriseAutomationStudioService.runTestMode(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { testRun } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/test-runs', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const testRuns = await enterpriseAutomationStudioService.listTestRuns(companyId);
    res.json({ data: { testRuns } });
  });

  router.get('/approval-chains', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const chains = await enterpriseAutomationStudioService.listApprovalChains(companyId);
    res.json({ data: { chains } });
  });

  router.post('/workflows/:id/approval-chain', requireWrite, async (req, res) => {
    const parsed = approvalChainSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid approval chain payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const chain = await enterpriseAutomationStudioService.createApprovalChain(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { chain } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/approval-records', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const records = await enterpriseAutomationStudioService.listApprovalRecords(companyId);
    res.json({ data: { records } });
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await enterpriseAutomationStudioService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const recommendations = await enterpriseAutomationStudioService.generateRecommendations(companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const actions = await enterpriseAutomationStudioService.listActions(companyId);
    res.json({ data: { actions } });
  });

  router.post('/actions', requireWrite, async (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const action = await enterpriseAutomationStudioService.createAction(auth, parsed.data);
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof EnterpriseAutomationStudioError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
