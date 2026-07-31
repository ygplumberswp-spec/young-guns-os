import { Router } from 'express';
import { z } from 'zod';
import type { AgentOrchestrationService } from '../services/agent-orchestration.service.js';
import { AgentOrchestrationError } from '../services/agent-orchestration.service.js';
import type { AgentOrchestrationEngineService } from '../services/agent-orchestration-engine.service.js';
import { AgentOrchestrationEngineError } from '../services/agent-orchestration-engine.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const agentKeySchema = z.enum([
  'executive',
  'operations',
  'finance',
  'recruiting',
  'sales',
  'marketing',
  'lead_generation',
  'voice_receptionist',
  'customer_support',
]);
const orchestrationStatusSchema = z.enum(['draft', 'active', 'paused']);
const eventTypeSchema = z.enum([
  'customer.created',
  'customer.updated',
  'job.created',
  'job.scheduled',
  'job.status_changed',
  'job.completed',
  'quote.created',
  'invoice.created',
  'payment.received',
  'invoice.overdue',
  'inventory.stock_threshold_reached',
  'vehicle.status_changed',
  'gps.event',
  'communication.received',
  'whatsapp.message.received',
]);

const createOrchestrationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  status: orchestrationStatusSchema.optional(),
  requiresApproval: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const updateOrchestrationSchema = createOrchestrationSchema.partial();

const createStepSchema = z.object({
  agentKey: agentKeySchema,
  stepKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  executionMode: z.enum(['sequential', 'parallel']).optional(),
  parallelGroupKey: z.string().trim().max(100).optional().nullable(),
  sortOrder: z.number().int().optional(),
  requestTemplate: z.string().trim().min(1).max(8000),
  capabilityRequest: z.string().trim().max(200).optional().nullable(),
  requiresApproval: z.boolean().optional(),
  handoffKeys: z.array(z.string().trim().min(1).max(100)).optional(),
  config: z.record(z.unknown()).optional(),
});

const createTriggerSchema = z.object({
  eventType: eventTypeSchema,
  enabled: z.boolean().optional(),
  conditionConfig: z.record(z.unknown()).optional(),
});

const runOrchestrationSchema = z.object({
  payload: z.record(z.unknown()).optional(),
});

type OrchestrationRouterDeps = {
  orchestrationService: AgentOrchestrationService;
  orchestrationEngine: AgentOrchestrationEngineService;
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

export function createAgentOrchestrationRouter({
  orchestrationService,
  orchestrationEngine,
  teamService,
  jwtSecret,
  authService,
}: OrchestrationRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'orchestration:read',
    'orchestration:write',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('orchestration:write', 'agents:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const orchestrations = await orchestrationService.listOrchestrations(companyId);
    res.json({ data: { orchestrations } });
  });

  router.post('/', requireWrite, async (req, res) => {
    const parsed = createOrchestrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid orchestration payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const orchestration = await orchestrationService.createOrchestration(auth, parsed.data);
      res.status(201).json({ data: { orchestration } });
    } catch (error) {
      handleOrchestrationError(res, error);
    }
  });

  router.get('/runs/list', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const runs = await orchestrationService.listRuns(companyId);
    res.json({ data: { runs } });
  });

  router.get('/runs/:runId', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const run = await orchestrationService.getRun(companyId, getRouteParam(req.params.runId));
    if (!run) {
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Orchestration run not found' } });
      return;
    }
    res.json({ data: { run } });
  });

  router.get('/runs/:runId/logs', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const logs = await orchestrationService.listLogs(companyId, getRouteParam(req.params.runId));
    res.json({ data: { logs } });
  });

  router.get('/approvals/list', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const approvals = await orchestrationService.listApprovals(companyId);
    res.json({ data: { approvals } });
  });

  router.post('/approvals/:id/approve', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      await orchestrationEngine.approveStep(auth, getRouteParam(req.params.id));
      res.json({ data: { success: true } });
    } catch (error) {
      handleEngineError(res, error);
    }
  });

  router.post('/approvals/:id/reject', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      await orchestrationEngine.rejectStep(auth, getRouteParam(req.params.id));
      res.json({ data: { success: true } });
    } catch (error) {
      handleEngineError(res, error);
    }
  });

  router.get('/:id', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const orchestration = await orchestrationService.getOrchestration(
      companyId,
      getRouteParam(req.params.id),
    );
    if (!orchestration) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Orchestration not found' } });
      return;
    }
    res.json({ data: { orchestration } });
  });

  router.patch('/:id', requireWrite, async (req, res) => {
    const parsed = updateOrchestrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid orchestration payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const orchestration = await orchestrationService.updateOrchestration(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { orchestration } });
    } catch (error) {
      handleOrchestrationError(res, error);
    }
  });

  router.post('/:id/steps', requireWrite, async (req, res) => {
    const parsed = createStepSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid step payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const orchestration = await orchestrationService.addStep(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { orchestration } });
    } catch (error) {
      handleOrchestrationError(res, error);
    }
  });

  router.post('/:id/triggers', requireWrite, async (req, res) => {
    const parsed = createTriggerSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid trigger payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const orchestration = await orchestrationService.addTrigger(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { orchestration } });
    } catch (error) {
      handleOrchestrationError(res, error);
    }
  });

  router.post('/:id/run', requireWrite, async (req, res) => {
    const parsed = runOrchestrationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid run payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const run = await orchestrationEngine.runManual(
        auth,
        getRouteParam(req.params.id),
        parsed.data.payload ?? {},
      );
      res.status(201).json({ data: { run } });
    } catch (error) {
      handleEngineError(res, error);
    }
  });

  return router;
}

function handleOrchestrationError(res: import('express').Response, error: unknown) {
  if (error instanceof AgentOrchestrationError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}

function handleEngineError(res: import('express').Response, error: unknown) {
  if (error instanceof AgentOrchestrationEngineError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
