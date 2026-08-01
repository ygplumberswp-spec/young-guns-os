import { Router } from 'express';
import { z } from 'zod';
import type { IntelligenceService } from '../services/intelligence.service.js';
import type { MemoryService } from '../services/memory.service.js';
import { MemoryError } from '../services/memory.service.js';
import type { RecommendationsService } from '../services/recommendations.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission, requireCompanyMemoryWrite } from '../middleware/rbac.js';

const memoryCategorySchema = z.enum(['business_rule', 'preference', 'process', 'note']);

const createMemorySchema = z.object({
  category: memoryCategorySchema.optional(),
  information: z.string().trim().min(1).max(4000),
  importance: z.number().int().min(1).max(5).optional(),
});

const updateMemorySchema = z.object({
  category: memoryCategorySchema.optional(),
  information: z.string().trim().min(1).max(4000).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  enabled: z.boolean().optional(),
});

type IntelligenceRouterDeps = {
  intelligenceService: IntelligenceService;
  recommendationsService: RecommendationsService;
  memoryService: MemoryService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createIntelligenceRouter({
  intelligenceService,
  recommendationsService,
  memoryService,
  teamService,
  jwtSecret,
  authService,
}: IntelligenceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/dashboard',
    requireAnyPermission('intelligence:read', 'intelligence:write', 'agents:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const dashboard = await intelligenceService.getDashboard(companyId);
      res.json({ data: { dashboard } });
    },
  );

  router.get(
    '/recommendations',
    requireAnyPermission('intelligence:read', 'intelligence:write', 'agents:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const result = await recommendationsService.getRecommendations(companyId);
      res.json({ data: result });
    },
  );

  router.get(
    '/memory',
    requireAnyPermission('intelligence:read', 'intelligence:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const memories = await memoryService.listMemories(companyId);
      res.json({ data: { memories } });
    },
  );

  router.post(
    '/memory',
    requireAnyPermission('intelligence:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
    const auth = getAuth(req);
    const parsed = createMemorySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid memory payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const memory = await memoryService.createMemory(auth, parsed.data);
      res.status(201).json({ data: { memory } });
    } catch (error) {
      handleMemoryError(res, error);
    }
    },
  );

  router.patch(
    '/memory/:id',
    requireAnyPermission('intelligence:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
    const auth = getAuth(req);
    const parsed = updateMemorySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid memory payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const memoryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const memory = await memoryService.updateMemory(auth, memoryId, parsed.data);
      res.json({ data: { memory } });
    } catch (error) {
      handleMemoryError(res, error);
    }
    },
  );

  router.delete(
    '/memory/:id',
    requireAnyPermission('intelligence:write'),
    requireCompanyMemoryWrite(),
    async (req, res) => {
    const auth = getAuth(req);

    try {
      const memoryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const deleted = await memoryService.deleteMemory(auth, memoryId);

      if (!deleted) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Memory not found' } });
        return;
      }

      res.json({ data: { success: true } });
    } catch (error) {
      handleMemoryError(res, error);
    }
    },
  );

  return router;
}

function handleMemoryError(res: import('express').Response, error: unknown) {
  if (error instanceof MemoryError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'DUPLICATE' ? 409 : 400;
    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}
