import { Router } from 'express';
import { z } from 'zod';
import type { SalesFollowupIntelligenceService } from '../services/sales-followup-intelligence.service.js';
import {
  SalesFollowupIntelligenceError,
  type SalesFollowupActor,
} from '../services/sales-followup-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const draftKindSchema = z.enum([
  'quote_reminder',
  'quote_follow_up',
  'objection_response',
  'price_objection',
  'value_explanation',
  'reactivation',
  'maintenance_opportunity',
  'service_opportunity',
]);

const channelSchema = z.enum(['email', 'sms', 'portal', 'whatsapp_business', 'other']);

const createDraftSchema = z.object({
  kind: draftKindSchema,
  customerId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  maintenancePlanId: z.string().uuid().optional(),
  channel: channelSchema.optional(),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().max(8000).optional(),
  scheduledFollowUpAt: z.string().datetime().optional(),
  objectionCategory: z
    .enum(['price', 'timing', 'scope', 'trust', 'competitor', 'other', 'unavailable'])
    .optional(),
  submitForApproval: z.boolean().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject', 'cancel']),
  notes: z.string().trim().max(2000).optional(),
});

const scheduleSchema = z.object({
  quoteId: z.string().uuid(),
  scheduledFollowUpAt: z.string().datetime(),
  notes: z.string().trim().max(2000).optional(),
});

const responseSchema = z.object({
  quoteId: z.string().uuid(),
  responseStatus: z.enum(['awaiting', 'responded', 'no_response']),
  respondedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const generateSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});

const settingsSchema = z.object({
  quoteRemindersEnabled: z.boolean().optional(),
  objectionDraftsEnabled: z.boolean().optional(),
  reactivationDraftsEnabled: z.boolean().optional(),
  defaultChannel: channelSchema.optional(),
  staleQuoteDays: z.number().int().min(1).max(365).optional(),
  reactivationIdleDays: z.number().int().min(1).max(3650).optional(),
});

type RouterDeps = {
  salesFollowupIntelligenceService: SalesFollowupIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): SalesFollowupActor {
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
  if (error instanceof SalesFollowupIntelligenceError) {
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

function denyTechnicianClient(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  const role = getAuth(req).roleName;
  if (role === 'Technician' || role === 'Client') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message:
          'Sales Follow-up Intelligence is Owner / sales-access only. Technician and Client are denied.',
      },
    });
    return;
  }
  next();
}

export function createSalesFollowupIntelligenceRouter({
  salesFollowupIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'sales:read',
    'sales:write',
    'sales_intelligence:read',
    'sales_intelligence:write',
    'sales_intelligence:manage',
    'leads:read',
    'leads:write',
    'quotes:read',
    'quotes:write',
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    'sales:write',
    'sales_intelligence:write',
    'sales_intelligence:manage',
    'leads:write',
    'quotes:write',
    'agents:write',
  );

  router.use(requireAuth, denyTechnicianClient, async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await salesFollowupIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoSend: false as const,
          fakeCampaigns: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Unable to load dashboard' } });
      }
    }
  });

  router.get('/drafts', requireRead, async (req, res) => {
    try {
      const drafts = await salesFollowupIntelligenceService.listDrafts(toActor(req));
      res.json({ data: { drafts, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Unable to list drafts' } });
      }
    }
  });

  router.post('/drafts', requireWrite, async (req, res) => {
    const parsed = createDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid follow-up draft payload' },
      });
      return;
    }
    try {
      const draft = await salesFollowupIntelligenceService.createDraft(toActor(req), parsed.data);
      res.status(201).json({ data: { draft, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Unable to create draft' } });
      }
    }
  });

  router.post('/drafts/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid decision payload' },
      });
      return;
    }
    try {
      const draft = await salesFollowupIntelligenceService.decideDraft(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({
        data: {
          draft,
          autoSend: false as const,
          note: 'Approval does not send — use Email Centre / approved outbound execute path.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Unable to decide draft' } });
      }
    }
  });

  router.post('/quote-follow-ups/schedule', requireWrite, async (req, res) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid schedule payload' },
      });
      return;
    }
    try {
      const result = await salesFollowupIntelligenceService.scheduleQuoteFollowUp(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({ data: { ...result, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Unable to schedule follow-up' } });
      }
    }
  });

  router.post('/quote-responses', requireWrite, async (req, res) => {
    const parsed = responseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid response tracking payload' },
      });
      return;
    }
    try {
      const result = await salesFollowupIntelligenceService.recordQuoteResponse(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({ data: { ...result, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Unable to record response' } });
      }
    }
  });

  router.post('/quote-reminders/generate', requireWrite, async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid generate payload' },
      });
      return;
    }
    try {
      const result = await salesFollowupIntelligenceService.generateQuoteReminderDrafts(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({ data: { ...result, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to generate quote reminder drafts' },
        });
      }
    }
  });

  router.post('/objection-drafts/generate', requireWrite, async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid generate payload' },
      });
      return;
    }
    try {
      const result = await salesFollowupIntelligenceService.generateObjectionDrafts(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({ data: { ...result, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to generate objection drafts' },
        });
      }
    }
  });

  router.post('/reactivation-drafts/generate', requireWrite, async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid generate payload' },
      });
      return;
    }
    try {
      const result = await salesFollowupIntelligenceService.generateReactivationDrafts(
        toActor(req),
        parsed.data,
      );
      res.status(201).json({ data: { ...result, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to generate reactivation drafts' },
        });
      }
    }
  });

  router.patch('/settings', requireWrite, async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid settings payload' },
      });
      return;
    }
    try {
      const settings = await salesFollowupIntelligenceService.updateSettings(
        toActor(req),
        parsed.data,
      );
      res.json({ data: { settings, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Unable to update settings' } });
      }
    }
  });

  return router;
}
