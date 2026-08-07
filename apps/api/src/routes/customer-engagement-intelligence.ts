import { Router } from 'express';
import { z } from 'zod';
import type { CustomerEngagementIntelligenceService } from '../services/customer-engagement-intelligence.service.js';
import {
  CustomerEngagementIntelligenceError,
  type CeiActor,
} from '../services/customer-engagement-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const draftKindSchema = z.enum([
  'notification',
  'eta_update',
  'review_request',
  'satisfaction_follow_up',
  'follow_up',
  'maintenance_reminder',
]);
const channelSchema = z.enum(['email', 'sms', 'portal', 'whatsapp_business', 'other']);
const createDraftSchema = z.object({
  kind: draftKindSchema,
  channel: channelSchema.optional(),
  customerId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  maintenancePlanId: z.string().uuid().optional(),
  subject: z.string().trim().max(500).optional(),
  body: z.string().trim().max(8000).optional(),
  submitForApproval: z.boolean().optional(),
});
const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});
const generateSchema = z.object({
  limit: z.number().int().min(1).max(25).optional(),
  submitForApproval: z.boolean().optional(),
});
const generateReviewSchema = z.object({
  limit: z.number().int().min(1).max(25).optional(),
  channel: channelSchema.optional(),
  submitForApproval: z.boolean().optional(),
});

type RouterDeps = {
  customerEngagementIntelligenceService: CustomerEngagementIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}
function toActor(req: import('express').Request): CeiActor {
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
  if (error instanceof CustomerEngagementIntelligenceError) {
    const status =
      error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_STATE' ? 409 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createCustomerEngagementIntelligenceRouter({
  customerEngagementIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'customer_experience:read', 'customer_experience:write', 'customers:read', 'customers:write',
    'communications:read', 'communications:write', 'communications:manage', 'portal:read', 'portal:manage',
  );
  const requireWrite = requireAnyPermission(
    'customer_experience:write', 'customers:write', 'communications:write', 'communications:manage', 'portal:manage',
  );
  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await customerEngagementIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoSend: false as const,
          customer360: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
  router.get('/drafts', requireRead, async (req, res) => {
    try {
      const drafts = await customerEngagementIntelligenceService.listDrafts(toActor(req));
      res.json({ data: { drafts, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
  router.post('/drafts', requireWrite, async (req, res) => {
    const parsed = createDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const draft = await customerEngagementIntelligenceService.createDraft(toActor(req), parsed.data);
      res.status(201).json({ data: { draft, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
  router.post('/drafts/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const draft = await customerEngagementIntelligenceService.decideDraft(toActor(req), paramId(req), parsed.data);
      res.json({
        data: {
          draft,
          autoSend: false as const,
          note: 'Approval does not send — use Email Centre / approved outbound execute path.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
  router.post('/eta-drafts/generate', requireWrite, async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const result = await customerEngagementIntelligenceService.generateEtaDrafts(toActor(req), parsed.data);
      res.status(201).json({ data: { ...result, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
  router.post('/review-requests/generate', requireWrite, async (req, res) => {
    const parsed = generateReviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const result = await customerEngagementIntelligenceService.generateReviewRequestDrafts(toActor(req), parsed.data);
      res.status(201).json({ data: { ...result, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
  router.post('/follow-ups/generate', requireWrite, async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const result = await customerEngagementIntelligenceService.generateFollowUpDrafts(toActor(req), parsed.data);
      res.status(201).json({ data: { ...result, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
  router.post('/maintenance-reminders/generate', requireWrite, async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    try {
      const result = await customerEngagementIntelligenceService.generateMaintenanceReminderDrafts(toActor(req), parsed.data);
      res.status(201).json({ data: { ...result, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
  router.post('/communication-scores/sync', requireWrite, async (req, res) => {
    try {
      const result = await customerEngagementIntelligenceService.syncCommunicationScores(toActor(req));
      res.json({
        data: { ...result, autoSend: false as const, source: 'communication_aura_intelligence' as const },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
  return router;
}
