import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { AURA_COMMAND_AGENT_KEYS, AURA_COMMAND_MEMORY_KINDS } from '@titan/shared';
import {
  AuraCommandCentreError,
  type AuraCommandCentreActor,
  type AuraCommandCentreService,
} from '../services/aura-command-centre.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';

const memoryKindSchema = z.enum(
  AURA_COMMAND_MEMORY_KINDS as unknown as [string, ...string[]],
);
const agentKeySchema = z.enum(AURA_COMMAND_AGENT_KEYS as unknown as [string, ...string[]]);

const createMemorySchema = z.object({
  kind: memoryKindSchema,
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(10000),
  sourceModule: z.string().trim().max(120).optional().nullable(),
  importance: z.number().int().min(1).max(5).optional(),
});

const updateMemorySchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(10000).optional(),
  status: z.enum(['active', 'archived', 'superseded']).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  enabled: z.boolean().optional(),
});

const createHandoffSchema = z.object({
  fromAgentKey: z.union([agentKeySchema, z.literal('executive')]).optional(),
  toAgentKey: agentKeySchema,
  contextSummary: z.string().trim().min(1).max(2000),
  contextPayload: z.record(z.unknown()).optional(),
});

const createActionSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(10000),
  departmentKey: z.union([agentKeySchema, z.literal('executive')]).optional(),
  suggestedAction: z.record(z.unknown()).optional(),
});

const createFollowUpSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(4000).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  auraCommandCentreService: AuraCommandCentreService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  db: DatabaseClient;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): AuraCommandCentreActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof AuraCommandCentreError) {
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

export function createAuraCommandCentreRouter({
  auraCommandCentreService,
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

  router.get('/dashboard', async (req, res) => {
    try {
      const dashboard = await auraCommandCentreService.getDashboard(toActor(req));
      res.json({ data: { dashboard } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/memory', async (req, res) => {
    try {
      const entries = await auraCommandCentreService.listMemory(toActor(req));
      res.json({ data: { entries } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/memory', requireWrite, async (req, res) => {
    try {
      const parsed = createMemorySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const entry = await auraCommandCentreService.createMemory(toActor(req), {
        kind: parsed.data.kind as import('@titan/shared').AuraCommandMemoryKind,
        title: parsed.data.title,
        content: parsed.data.content,
        sourceModule: parsed.data.sourceModule,
        importance: parsed.data.importance,
      });
      res.status(201).json({ data: { entry } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/memory/:memoryId', requireWrite, async (req, res) => {
    try {
      const parsed = updateMemorySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const entry = await auraCommandCentreService.updateMemory(
        toActor(req),
        paramId(req, 'memoryId'),
        parsed.data,
      );
      res.json({ data: { entry } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/handoffs', async (req, res) => {
    try {
      const handoffs = await auraCommandCentreService.listHandoffs(toActor(req));
      res.json({ data: { handoffs } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/handoffs', requireWrite, async (req, res) => {
    try {
      const parsed = createHandoffSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const handoff = await auraCommandCentreService.createHandoff(toActor(req), {
        fromAgentKey: parsed.data.fromAgentKey as
          | import('@titan/shared').AuraCommandAgentKey
          | 'executive'
          | undefined,
        toAgentKey: parsed.data.toAgentKey as import('@titan/shared').AuraCommandAgentKey,
        contextSummary: parsed.data.contextSummary,
        contextPayload: parsed.data.contextPayload,
      });
      res.status(201).json({ data: { handoff } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/handoffs/:handoffId/decide', async (req, res) => {
    try {
      const parsed = decideSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const handoff = await auraCommandCentreService.decideHandoff(
        toActor(req),
        paramId(req, 'handoffId'),
        parsed.data,
      );
      res.json({ data: { handoff } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/actions', async (req, res) => {
    try {
      const drafts = await auraCommandCentreService.listActionDrafts(toActor(req));
      res.json({ data: { drafts } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions', requireWrite, async (req, res) => {
    try {
      const parsed = createActionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const draft = await auraCommandCentreService.createActionDraft(toActor(req), {
        title: parsed.data.title,
        description: parsed.data.description,
        departmentKey: parsed.data.departmentKey as
          | import('@titan/shared').AuraCommandAgentKey
          | 'executive'
          | undefined,
        suggestedAction: parsed.data.suggestedAction,
      });
      res.status(201).json({ data: { draft } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/actions/:draftId/decide', async (req, res) => {
    try {
      const parsed = decideSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const draft = await auraCommandCentreService.decideActionDraft(
        toActor(req),
        paramId(req, 'draftId'),
        parsed.data,
      );
      res.json({ data: { draft } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/follow-ups', async (req, res) => {
    try {
      const followUps = await auraCommandCentreService.listFollowUps(toActor(req));
      res.json({ data: { followUps } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/follow-ups', requireWrite, async (req, res) => {
    try {
      const parsed = createFollowUpSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        });
        return;
      }
      const followUp = await auraCommandCentreService.createFollowUp(toActor(req), parsed.data);
      res.status(201).json({ data: { followUp } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/follow-ups/:followUpId/complete', requireWrite, async (req, res) => {
    try {
      const followUp = await auraCommandCentreService.completeFollowUp(
        toActor(req),
        paramId(req, 'followUpId'),
      );
      res.json({ data: { followUp } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/agents', async (req, res) => {
    try {
      const agents = await auraCommandCentreService.listAgentRegistry(toActor(req));
      res.json({ data: { agents } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/agents/ensure-registry', requireWrite, async (req, res) => {
    try {
      const agents = await auraCommandCentreService.ensureAgentRegistry(toActor(req));
      res.json({ data: { agents } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
