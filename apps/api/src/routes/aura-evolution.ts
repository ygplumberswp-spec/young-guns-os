import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { AURA_EVOLUTION_KNOWLEDGE_KINDS } from '@titan/shared';
import {
  AuraEvolutionError,
  type AuraEvolutionActor,
  type AuraEvolutionService,
} from '../services/aura-evolution.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';

const knowledgeKindSchema = z.enum(
  AURA_EVOLUTION_KNOWLEDGE_KINDS as unknown as [string, ...string[]],
);

const updateSettingsSchema = z.object({
  learningEnabled: z.boolean(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const createKnowledgeSchema = z.object({
  kind: knowledgeKindSchema,
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(10000),
  commandMemoryId: z.string().uuid().optional().nullable(),
  auraMemoryId: z.string().uuid().optional().nullable(),
});

type RouterDeps = {
  auraEvolutionService: AuraEvolutionService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  db: DatabaseClient;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): AuraEvolutionActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof AuraEvolutionError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

function paramId(req: import('express').Request, name: string): string {
  const raw = req.params[name];
  return String(Array.isArray(raw) ? raw[0] : (raw ?? ''));
}

export function createAuraEvolutionRouter({
  auraEvolutionService,
  jwtSecret,
  authService,
  db,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnicianFromOwner = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission(
    'agents:read',
    'intelligence:read',
    'agents:write',
    'intelligence:write',
    '*',
  );
  const requireWrite = requireAnyPermission('agents:write', 'intelligence:write', '*');

  router.use(requireAuth);
  router.use(denyTechnicianFromOwner);
  router.use(requireRead);

  router.get('/overview', async (req, res) => {
    try {
      const overview = await auraEvolutionService.getDashboard(toActor(req));
      res.json({ data: { overview } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/settings', async (req, res) => {
    try {
      const settings = await auraEvolutionService.getSettings(toActor(req));
      res.json({ data: { settings } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/settings', async (req, res) => {
    try {
      const parsed = updateSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const settings = await auraEvolutionService.updateSettings(toActor(req), parsed.data);
      res.json({ data: { settings } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/sync', requireWrite, async (req, res) => {
    try {
      const result = await auraEvolutionService.syncLearningSignals(toActor(req));
      res.json({ data: { result, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/insights/:id/decide', async (req, res) => {
    try {
      const parsed = decideSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const insight = await auraEvolutionService.decideInsight(
        toActor(req),
        paramId(req, 'id'),
        parsed.data,
      );
      res.json({ data: { insight, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.delete('/learning-items/:id', async (req, res) => {
    try {
      const item = await auraEvolutionService.removeLearningItem(toActor(req), paramId(req, 'id'));
      res.json({ data: { item } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/knowledge', requireWrite, async (req, res) => {
    try {
      const parsed = createKnowledgeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const entry = await auraEvolutionService.createKnowledge(toActor(req), {
        kind: parsed.data.kind as import('@titan/shared').AuraEvolutionKnowledgeKind,
        title: parsed.data.title,
        content: parsed.data.content,
        commandMemoryId: parsed.data.commandMemoryId,
        auraMemoryId: parsed.data.auraMemoryId,
      });
      res.status(201).json({ data: { entry } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/decisions', async (req, res) => {
    try {
      const overview = await auraEvolutionService.getDashboard(toActor(req));
      res.json({ data: { decisions: overview.recentDecisions } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/patterns', async (req, res) => {
    try {
      const overview = await auraEvolutionService.getDashboard(toActor(req));
      res.json({ data: { patterns: overview.patterns } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/insights', async (req, res) => {
    try {
      const overview = await auraEvolutionService.getDashboard(toActor(req));
      res.json({ data: { insights: overview.insights } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/recommendation-scores', async (req, res) => {
    try {
      const overview = await auraEvolutionService.getDashboard(toActor(req));
      res.json({ data: { recommendationScores: overview.recommendationScores } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/learning-items', async (req, res) => {
    try {
      const overview = await auraEvolutionService.getDashboard(toActor(req));
      res.json({ data: { learningItems: overview.learningHistory } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/knowledge', async (req, res) => {
    try {
      const overview = await auraEvolutionService.getDashboard(toActor(req));
      res.json({ data: { knowledge: overview.knowledgeMemory } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
