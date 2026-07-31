import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseEvolutionService } from '../services/enterprise-evolution.service.js';
import { EnterpriseEvolutionError } from '../services/enterprise-evolution.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const learningSourceSchema = z.enum([
  'user_approval',
  'user_correction',
  'completed_job',
  'customer_feedback',
  'technician_performance',
  'financial_outcome',
  'workflow_history',
  'ai_interaction',
  'business_decision',
]);

const optimizationStatusSchema = z.enum([
  'suggested',
  'pending_approval',
  'approved',
  'rejected',
  'deployed',
  'rolled_back',
]);

const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const optimizationSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(5000),
  recommendationId: z.string().uuid().optional().nullable(),
  estimatedImpact: z.string().trim().max(2000).optional().nullable(),
  riskAssessment: z.string().trim().max(2000).optional().nullable(),
  costAnalysis: z.string().trim().max(2000).optional().nullable(),
  payload: z.record(z.unknown()).optional(),
});

const updateOptimizationSchema = z.object({
  status: optimizationStatusSchema.optional(),
});

const updateRecommendationSchema = z.object({
  status: recommendationStatusSchema.optional(),
});

const learningActionSchema = z.object({
  learningEventId: z.string().uuid(),
});

const policySchema = z.object({
  sourceType: learningSourceSchema,
  requiresApproval: z.boolean().optional(),
  allowRollback: z.boolean().optional(),
  minConfidenceScore: z.number().min(0).max(1).optional().nullable(),
});

type RouterDeps = {
  enterpriseEvolutionService: EnterpriseEvolutionService;
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

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseEvolutionError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseEvolutionRouter({
  enterpriseEvolutionService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'intelligence:read',
    'executive:read',
    'executive:write',
    'ai_orchestration:read',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('executive:write', 'intelligence:read');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await enterpriseEvolutionService.getEvolutionDashboard(
        getAuth(req).companyId,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/learning/sync', requireWrite, async (req, res) => {
    try {
      const events = await enterpriseEvolutionService.syncLearningFromModules(
        getAuth(req).companyId,
      );
      res.status(201).json({ data: { events } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/learning', requireRead, async (req, res) => {
    try {
      const events = await enterpriseEvolutionService.listLearningEvents(getAuth(req).companyId);
      res.json({ data: { events } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/learning/approve', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = learningActionSchema.parse(req.body);
      const event = await enterpriseEvolutionService.approveLearning(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { event } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/learning/rollback', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = learningActionSchema.parse(req.body);
      const event = await enterpriseEvolutionService.rollbackLearning(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { event } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/learning/audit', requireRead, async (req, res) => {
    try {
      const audit = await enterpriseEvolutionService.listLearningAudit(getAuth(req).companyId);
      res.json({ data: { audit } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/patterns', requireRead, async (req, res) => {
    try {
      const patterns = await enterpriseEvolutionService.listPatterns(getAuth(req).companyId);
      res.json({ data: { patterns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/patterns/detect', requireWrite, async (req, res) => {
    try {
      const patterns = await enterpriseEvolutionService.detectPatterns(getAuth(req).companyId);
      res.status(201).json({ data: { patterns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    try {
      const recommendations = await enterpriseEvolutionService.listRecommendations(
        getAuth(req).companyId,
      );
      res.json({ data: { recommendations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const recommendations = await enterpriseEvolutionService.generateRecommendations(
        getAuth(req).companyId,
      );
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/recommendations/:recommendationId', requireWrite, async (req, res) => {
    try {
      const recommendationId = getRouteParam(req.params.recommendationId);
      const body = updateRecommendationSchema.parse(req.body);
      const recommendation = await enterpriseEvolutionService.updateRecommendation(
        getAuth(req).companyId,
        recommendationId,
        body,
      );
      res.json({ data: { recommendation } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/optimizations', requireRead, async (req, res) => {
    try {
      const optimizations = await enterpriseEvolutionService.listOptimizations(
        getAuth(req).companyId,
      );
      res.json({ data: { optimizations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/optimizations', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = optimizationSchema.parse(req.body);
      const optimization = await enterpriseEvolutionService.createOptimization(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { optimization } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/optimizations/:optimizationId', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const optimizationId = getRouteParam(req.params.optimizationId);
      const body = updateOptimizationSchema.parse(req.body);
      const optimization = await enterpriseEvolutionService.updateOptimization(
        { companyId: auth.companyId, userId: auth.userId },
        optimizationId,
        body,
      );
      res.json({ data: { optimization } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/timeline', requireRead, async (req, res) => {
    try {
      const events = await enterpriseEvolutionService.listTimelineEvents(getAuth(req).companyId);
      res.json({ data: { events } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/timeline/sync', requireWrite, async (req, res) => {
    try {
      const events = await enterpriseEvolutionService.syncTimelineFromModules(
        getAuth(req).companyId,
      );
      res.status(201).json({ data: { events } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/model-versions', requireRead, async (req, res) => {
    try {
      const versions = await enterpriseEvolutionService.listModelVersions(getAuth(req).companyId);
      res.json({ data: { versions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/policies', requireRead, async (req, res) => {
    try {
      const policies = await enterpriseEvolutionService.listSafeLearningPolicies(
        getAuth(req).companyId,
      );
      res.json({ data: { policies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/policies', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = policySchema.parse(req.body);
      const policy = await enterpriseEvolutionService.updateSafeLearningPolicy(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { policy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/snapshots/capture', requireWrite, async (req, res) => {
    try {
      const snapshot = await enterpriseEvolutionService.captureSnapshot(getAuth(req).companyId);
      res.status(201).json({ data: { snapshot: { id: snapshot.id } } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
