import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import {
  RecurringMaintenanceError,
  type RecurringMaintenanceActor,
  type RecurringMaintenanceService,
} from '../services/recurring-maintenance.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';

const plumbingKindSchema = z.enum([
  'geyser',
  'prv',
  'tank',
  'installed_equipment',
  'other',
]);

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  assetId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  propertyId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  plumbingKind: plumbingKindSchema.optional(),
  intervalDays: z.number().int().positive().max(3650),
  nextDueAt: z.string().datetime().optional().nullable(),
  reminderDaysBefore: z.number().int().nonnegative().max(365).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
  syncSchedule: z.boolean().optional(),
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  propertyId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  plumbingKind: plumbingKindSchema.optional(),
  intervalDays: z.number().int().positive().max(3650).optional(),
  nextDueAt: z.string().datetime().optional().nullable(),
  reminderDaysBefore: z.number().int().nonnegative().max(365).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
});

const completeSchema = z.object({
  notes: z.string().trim().max(4000).optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
  dueId: z.string().uuid().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
});

const createCommSchema = z.object({
  planId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10000),
  to: z.array(z.string().email()).max(20).optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  recurringMaintenanceService: RecurringMaintenanceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  db: DatabaseClient;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): RecurringMaintenanceActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof RecurringMaintenanceError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT'
            ? 409
            : error.code === 'NOT_CONFIGURED'
              ? 503
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

export function createRecurringMaintenanceRouter({
  recurringMaintenanceService,
  teamService,
  jwtSecret,
  authService,
  db,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnicianFromOwner = createDenyTechnicianFromOwnerModules(db);

  const requireRead = requireAnyPermission(
    'asset_equipment:read',
    'asset_equipment:write',
    'asset_lifecycle:read',
    'asset_lifecycle:write',
    'asset_lifecycle:manage',
    'ops:read',
    'ops:manage',
  );
  const requireWrite = requireAnyPermission(
    'asset_equipment:write',
    'asset_lifecycle:write',
    'asset_lifecycle:manage',
    'ops:manage',
  );

  router.use(requireAuth);
  router.use(denyTechnicianFromOwner);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/overview', requireRead, async (req, res) => {
    try {
      const overview = await recurringMaintenanceService.getOverview(toActor(req));
      res.json({ data: { overview } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/plans', requireRead, async (req, res) => {
    try {
      const plans = await recurringMaintenanceService.listPlans(toActor(req));
      res.json({ data: { plans } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/plans', requireWrite, async (req, res) => {
    const parsed = createPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid maintenance plan',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    try {
      const plan = await recurringMaintenanceService.createPlan(toActor(req), parsed.data);
      res.status(201).json({ data: { plan } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/plans/:id', requireWrite, async (req, res) => {
    const id = paramId(req, 'id');
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Plan id required' } });
      return;
    }
    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid plan update',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    try {
      const plan = await recurringMaintenanceService.updatePlan(toActor(req), id, parsed.data);
      res.json({ data: { plan } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/due', requireRead, async (req, res) => {
    try {
      const dueItems = await recurringMaintenanceService.listDueItems(toActor(req));
      res.json({ data: { dueItems } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/generate-due', requireWrite, async (req, res) => {
    try {
      const result = await recurringMaintenanceService.generateDueAndReminders(toActor(req));
      res.json({ data: { result } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/plans/:id/complete', requireWrite, async (req, res) => {
    const id = paramId(req, 'id');
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Plan id required' } });
      return;
    }
    const parsed = completeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid completion payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    try {
      const completed = await recurringMaintenanceService.completeCycle(toActor(req), id, parsed.data);
      res.json({ data: { plan: completed.plan, run: completed.run } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/history', requireRead, async (req, res) => {
    const planId =
      typeof req.query.planId === 'string' && req.query.planId.length > 0
        ? req.query.planId
        : undefined;
    try {
      const history = await recurringMaintenanceService.listHistory(toActor(req), planId);
      res.json({ data: { history } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/reminders', requireRead, async (req, res) => {
    try {
      const reminders = await recurringMaintenanceService.listReminders(toActor(req));
      res.json({ data: { reminders } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/reminders/:id/acknowledge', requireWrite, async (req, res) => {
    const id = paramId(req, 'id');
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Reminder id required' } });
      return;
    }
    try {
      const reminder = await recurringMaintenanceService.acknowledgeReminder(toActor(req), id);
      res.json({ data: { reminder } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/aura-suggestions', requireRead, async (req, res) => {
    try {
      const suggestions = await recurringMaintenanceService.listAuraSuggestions(toActor(req));
      res.json({ data: { suggestions } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/aura-suggestions/generate', requireWrite, async (req, res) => {
    try {
      const suggestions = await recurringMaintenanceService.generateAuraSuggestions(toActor(req));
      res.json({ data: { suggestions, autoExecuted: false as const } });
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
    const id = paramId(req, 'id');
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Suggestion id required' } });
      return;
    }
    try {
      const suggestion = await recurringMaintenanceService.decideAuraSuggestion(
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

  router.get('/comm-requests', requireRead, async (req, res) => {
    try {
      const requests = await recurringMaintenanceService.listCommRequests(toActor(req));
      res.json({ data: { requests } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/comm-requests', requireWrite, async (req, res) => {
    const parsed = createCommSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid communication request',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    try {
      const request = await recurringMaintenanceService.createCommRequest(toActor(req), parsed.data);
      res.status(201).json({ data: { request, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/comm-requests/:id/decide', requireWrite, async (req, res) => {
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
    const id = paramId(req, 'id');
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request id required' } });
      return;
    }
    try {
      const request = await recurringMaintenanceService.decideCommRequest(
        toActor(req),
        id,
        parsed.data.decision,
        parsed.data.notes,
      );
      res.json({ data: { request, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/comm-requests/:id/execute', requireWrite, async (req, res) => {
    const id = paramId(req, 'id');
    if (!id) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request id required' } });
      return;
    }
    try {
      const request = await recurringMaintenanceService.executeCommRequest(toActor(req), id);
      res.json({ data: { request, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
