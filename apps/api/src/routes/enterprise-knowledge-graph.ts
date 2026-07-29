import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseKnowledgeGraphService } from '../services/enterprise-knowledge-graph.service.js';
import { EnterpriseKnowledgeGraphError } from '../services/enterprise-knowledge-graph.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const entityTypeSchema = z.enum([
  'customer',
  'job',
  'asset',
  'invoice',
  'inventory',
  'vehicle',
  'technician',
  'supplier',
  'document',
  'communication',
  'workflow',
  'ai_agent',
  'integration',
  'quote',
  'payment',
  'analytics_report',
  'digital_twin_snapshot',
  'organizational_memory',
]);

const memoryTypeSchema = z.enum([
  'business_decision',
  'sop',
  'policy',
  'customer_history',
  'technician_knowledge',
  'ai_insight',
  'lesson_learned',
  'meeting_summary',
  'project_history',
]);

const actionTypeSchema = z.enum([
  'knowledge_summary',
  'documentation_improvement',
  'relationship_insight',
  'governance_recommendation',
  'executive_knowledge_report',
]);

const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  entityTypes: z.array(entityTypeSchema).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
});

const memorySchema = z.object({
  memoryType: memoryTypeSchema,
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(50000),
  summary: z.string().trim().max(2000).optional().nullable(),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
  requiredPermissions: z.array(z.string().trim().min(1).max(100)).optional(),
  relatedEntityIds: z.array(z.string().uuid()).optional(),
});

const savedSearchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  query: z.string().trim().min(1).max(500),
  filters: z.record(z.unknown()).optional(),
});

const actionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  payload: z.record(z.unknown()).optional(),
});

const traverseSchema = z.object({
  entityId: z.string().uuid(),
  depth: z.number().int().min(1).max(3).optional(),
});

type RouterDeps = {
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseKnowledgeGraphError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseKnowledgeGraphRouter({
  enterpriseKnowledgeGraphService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('knowledge:read', 'knowledge:write', 'intelligence:read', 'agents:read');
  const requireWrite = requireAnyPermission('knowledge:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await enterpriseKnowledgeGraphService.getExecutiveDashboard(getAuth(req).companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/sync', requireWrite, async (req, res) => {
    try {
      const result = await enterpriseKnowledgeGraphService.syncGraphFromModules(getAuth(req).companyId);
      res.status(201).json({ data: result });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/entities', requireRead, async (req, res) => {
    try {
      const entities = await enterpriseKnowledgeGraphService.listEntities(getAuth(req).companyId);
      res.json({ data: { entities } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/relationships', requireRead, async (req, res) => {
    try {
      const relationships = await enterpriseKnowledgeGraphService.listRelationships(getAuth(req).companyId);
      res.json({ data: { relationships } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/traverse', requireRead, async (req, res) => {
    try {
      const body = traverseSchema.parse(req.body);
      const traversal = await enterpriseKnowledgeGraphService.traverseGraph(getAuth(req).companyId, body);
      res.json({ data: { traversal } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/search', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = searchSchema.parse(req.body);
      const results = await enterpriseKnowledgeGraphService.semanticSearch(auth, body, auth.permissions);
      res.json({ data: { results } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/memory', requireRead, async (req, res) => {
    try {
      const memory = await enterpriseKnowledgeGraphService.listOrganizationalMemory(getAuth(req).companyId);
      res.json({ data: { memory } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/memory', requireWrite, async (req, res) => {
    try {
      const body = memorySchema.parse(req.body);
      const entry = await enterpriseKnowledgeGraphService.createOrganizationalMemory(getAuth(req), body);
      res.status(201).json({ data: { entry } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/saved-searches', requireRead, async (req, res) => {
    try {
      const savedSearches = await enterpriseKnowledgeGraphService.listSavedSearches(getAuth(req).companyId);
      res.json({ data: { savedSearches } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/saved-searches', requireWrite, async (req, res) => {
    try {
      const body = savedSearchSchema.parse(req.body);
      const savedSearch = await enterpriseKnowledgeGraphService.createSavedSearch(getAuth(req), body);
      res.status(201).json({ data: { savedSearch } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/search-activity', requireRead, async (req, res) => {
    try {
      const activity = await enterpriseKnowledgeGraphService.listSearchActivity(getAuth(req).companyId);
      res.json({ data: { activity } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/governance', requireRead, async (req, res) => {
    try {
      const governance = await enterpriseKnowledgeGraphService.getGovernanceSummary(getAuth(req).companyId);
      res.json({ data: { governance } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    try {
      const recommendations = await enterpriseKnowledgeGraphService.listRecommendations(getAuth(req).companyId);
      res.json({ data: { recommendations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const recommendations = await enterpriseKnowledgeGraphService.generateRecommendations(getAuth(req).companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    try {
      const actions = await enterpriseKnowledgeGraphService.listActions(getAuth(req).companyId);
      res.json({ data: { actions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/actions', requireWrite, async (req, res) => {
    try {
      const body = actionSchema.parse(req.body);
      const action = await enterpriseKnowledgeGraphService.createAction(getAuth(req), body);
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
