import { Router } from 'express';
import { z } from 'zod';
import type { CallIntelligenceService } from '../services/call-intelligence.service.js';
import {
  CallIntelligenceError,
  type CiActor,
} from '../services/call-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const leadKindSchema = z.enum([
  'new_enquiry',
  'service_request',
  'potential_job',
  'urgent_opportunity',
  'other',
]);

const analyzeSchema = z.object({
  callSessionId: z.string().uuid().optional(),
  voiceSessionId: z.string().uuid().optional(),
});

const historySchema = z.object({
  customerId: z.string().uuid().optional(),
  callSessionId: z.string().uuid().optional(),
  voiceSessionId: z.string().uuid().optional(),
});

const extractLeadSchema = z.object({
  callSessionId: z.string().uuid().optional(),
  voiceSessionId: z.string().uuid().optional(),
  kind: leadKindSchema.optional(),
  contactName: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().max(320).optional(),
  serviceType: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  submitForApproval: z.boolean().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject', 'cancel']),
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  callIntelligenceService: CallIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): CiActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function paramId(req: import('express').Request): string {
  const raw = req.params.id;
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof CallIntelligenceError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'INVALID_STATE'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createCallIntelligenceRouter({
  callIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'voice:read',
    'voice:write',
    'voice_reception:read',
    'voice_reception:write',
    'voice_reception:manage',
    'communications:read',
    'communications:write',
    'communications:manage',
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    'voice:write',
    'voice_reception:write',
    'voice_reception:manage',
    'communications:write',
    'communications:manage',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await callIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoSend: false as const,
          autoExecuted: false as const,
          financeMarginsExposed: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/analyze', requireWrite, async (req, res) => {
    const parsed = analyzeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const result = await callIntelligenceService.analyzeCall(toActor(req), parsed.data);
      res.status(201).json({
        data: {
          ...result,
          autoSend: false as const,
          invented: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/customer-history', requireRead, async (req, res) => {
    const parsed = historySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const history = await callIntelligenceService.lookupCustomerHistory(toActor(req), parsed.data);
      res.json({
        data: {
          history,
          financeMarginsExposed: false as const,
          internalNotesExposed: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/insights', requireRead, async (req, res) => {
    try {
      const insights = await callIntelligenceService.getInsights(toActor(req));
      res.json({ data: { insights, invented: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/lead-drafts', requireRead, async (req, res) => {
    try {
      const drafts = await callIntelligenceService.listLeadDrafts(toActor(req));
      res.json({ data: { drafts, autoSend: false as const, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/lead-drafts', requireWrite, async (req, res) => {
    const parsed = extractLeadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const draft = await callIntelligenceService.extractLeadDraft(toActor(req), parsed.data);
      res.status(201).json({
        data: {
          draft,
          autoSend: false as const,
          autoExecuted: false as const,
          note: 'Lead draft queued — Owner approval required. No automatic customer communication.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/lead-drafts/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const draft = await callIntelligenceService.decideLeadDraft(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({
        data: {
          draft,
          autoSend: false as const,
          autoExecuted: false as const,
          note: 'Approval does not create CRM leads or send customer communication — Owner intent only.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
