import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import {
  WorkflowAutomationError,
  type WorkflowAutomationActor,
  type WorkflowAutomationService,
} from '../services/workflow-automation.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';

const bucketSchema = z.enum(['active', 'completed', 'failed', 'awaiting_approval']);
const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const createDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['draft', 'pending_approval', 'active', 'paused']).optional(),
  triggers: z
    .array(
      z.object({
        triggerType: z.string(),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
  actions: z
    .array(
      z.object({
        actionType: z.string(),
        sortOrder: z.number().int().nonnegative().optional(),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
});

type RouterDeps = {
  workflowAutomationService: WorkflowAutomationService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  db: DatabaseClient;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): WorkflowAutomationActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof WorkflowAutomationError) {
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

export function createWorkflowAutomationRouter({
  workflowAutomationService,
  teamService,
  jwtSecret,
  authService,
  db,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnicianFromOwner = createDenyTechnicianFromOwnerModules(db);

  const requireRead = requireAnyPermission(
    'automation:read',
    'automation:write',
    'ops:read',
    'ops:manage',
  );
  const requireWrite = requireAnyPermission('automation:write', 'ops:manage');

  router.use(requireAuth);
  router.use(denyTechnicianFromOwner);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/monitor', requireRead, async (req, res) => {
    try {
      const overview = await workflowAutomationService.getMonitorOverview(toActor(req));
      res.json({ data: { overview } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/runs', requireRead, async (req, res) => {
    const parsed = bucketSchema.safeParse(req.query.bucket ?? 'active');
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'bucket must be active, completed, failed, or awaiting_approval',
        },
      });
      return;
    }
    try {
      const runs = await workflowAutomationService.listRuns(toActor(req), parsed.data);
      res.json({ data: { runs } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/definitions', requireRead, async (req, res) => {
    try {
      const definitions = await workflowAutomationService.listDefinitions(toActor(req));
      res.json({ data: { definitions } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/definitions', requireWrite, async (req, res) => {
    const parsed = createDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid workflow definition',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    try {
      const definition = await workflowAutomationService.createDefinition(
        toActor(req),
        parsed.data as import('@titan/shared').CreateWorkflowRequest,
      );
      res.status(201).json({ data: { definition } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/approvals', requireRead, async (req, res) => {
    try {
      const approvals = await workflowAutomationService.listPendingApprovals(toActor(req));
      res.json({ data: { approvals } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/approvals/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'decision must be approve or reject',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    const id = String(
      Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? ''),
    );
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Approval id required' } });
      return;
    }
    try {
      const approval = await workflowAutomationService.decideApproval(
        toActor(req),
        id,
        parsed.data.decision,
        parsed.data.notes,
      );
      res.json({ data: { approval, decision: parsed.data.decision } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/tasks', requireRead, async (req, res) => {
    try {
      const tasks = await workflowAutomationService.listTasks(toActor(req));
      res.json({ data: { tasks } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/follow-ups', requireRead, async (req, res) => {
    try {
      const followUps = await workflowAutomationService.listFollowUps(toActor(req));
      res.json({ data: { followUps } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/aura-suggestions', requireRead, async (req, res) => {
    try {
      const suggestions = await workflowAutomationService.listAuraSuggestions(toActor(req));
      res.json({
        data: {
          suggestions,
          autoExecuted: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/aura-suggestions/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'decision must be approve or reject',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    const id = String(
      Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? ''),
    );
    if (!id) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Suggestion id required' },
      });
      return;
    }
    try {
      const suggestion = await workflowAutomationService.decideAuraSuggestion(
        toActor(req),
        id,
        parsed.data.decision,
        parsed.data.notes,
      );
      res.json({ data: { suggestion, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
