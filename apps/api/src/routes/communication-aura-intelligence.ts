import { Router } from 'express';
import { z } from 'zod';
import type { CommunicationAuraIntelligenceService } from '../services/communication-aura-intelligence.service.js';
import {
  CommunicationAuraIntelligenceError,
  type CommAuraActor,
} from '../services/communication-aura-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const draftTypeSchema = z.enum(['smart_reply', 'follow_up']);
const linkTargetSchema = z.enum([
  'customer',
  'lead',
  'job',
  'quote',
  'invoice',
  'property',
  'supplier',
  'staff',
  'timeline',
]);

const scanSchema = z.object({
  generateDrafts: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const analyseSchema = z.object({
  inboxItemId: z.string().uuid(),
  contextText: z.string().trim().max(5000).optional(),
});

const createDraftSchema = z.object({
  inboxItemId: z.string().uuid(),
  draftType: draftTypeSchema,
  subject: z.string().trim().max(500).optional(),
  body: z.string().trim().max(8000).optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const createFollowUpSchema = z.object({
  inboxItemId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  dueHint: z.string().trim().max(120).optional(),
});

const createLinkSchema = z.object({
  inboxItemId: z.string().uuid(),
  linkTargetType: linkTargetSchema,
  linkTargetId: z.string().uuid().optional(),
  subject: z.string().trim().max(500).optional(),
  recommendation: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

type RouterDeps = {
  communicationAuraIntelligenceService: CommunicationAuraIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): CommAuraActor {
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
  if (error instanceof CommunicationAuraIntelligenceError) {
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

export function createCommunicationAuraIntelligenceRouter({
  communicationAuraIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'communications:read',
    'communications:write',
    'communications:manage',
    'communications_intelligence:read',
    'communications_intelligence:write',
    'integrations:read',
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    'communications:write',
    'communications:manage',
    'communications_intelligence:write',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await communicationAuraIntelligenceService.getDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          autoSend: false as const,
          autoLinked: false as const,
          usesPersonalWhatsapp: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load Communication AURA Intelligence' },
        });
      }
    }
  });

  router.get('/prioritised', requireRead, async (req, res) => {
    try {
      const messages = await communicationAuraIntelligenceService.listPrioritised(toActor(req));
      res.json({ data: { messages, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list prioritised messages' },
        });
      }
    }
  });

  router.get('/customer-insights', requireRead, async (req, res) => {
    try {
      const insights = await communicationAuraIntelligenceService.listCustomerInsights(
        toActor(req),
      );
      res.json({ data: { insights, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to list customer communication insights' },
        });
      }
    }
  });

  router.post('/scan', requireWrite, async (req, res) => {
    const parsed = scanSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const result = await communicationAuraIntelligenceService.runScan(toActor(req), parsed.data);
      res.json({
        data: {
          result,
          autoSend: false as const,
          autoLinked: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to run Communication AURA scan' },
        });
      }
    }
  });

  router.post('/analyse', requireWrite, async (req, res) => {
    const parsed = analyseSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const message = await communicationAuraIntelligenceService.analyseInboxItem(
        toActor(req),
        parsed.data,
      );
      res.json({ data: { message, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to analyse inbox item' },
        });
      }
    }
  });

  router.post('/drafts', requireWrite, async (req, res) => {
    const parsed = createDraftSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const draft = await communicationAuraIntelligenceService.createDraft(
        toActor(req),
        parsed.data,
      );
      res.json({ data: { draft, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create smart-reply draft' },
        });
      }
    }
  });

  router.post('/drafts/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const draft = await communicationAuraIntelligenceService.decideDraft(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({
        data: {
          draft,
          autoSend: false as const,
          note: 'Approval does not send — use Email Centre / Gmail draft execute path.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide draft' },
        });
      }
    }
  });

  router.post('/follow-ups', requireWrite, async (req, res) => {
    const parsed = createFollowUpSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const followUp = await communicationAuraIntelligenceService.createFollowUp(
        toActor(req),
        parsed.data,
      );
      res.json({ data: { followUp, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create follow-up suggestion' },
        });
      }
    }
  });

  router.post('/follow-ups/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const followUp = await communicationAuraIntelligenceService.decideFollowUp(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({ data: { followUp, autoExecuted: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide follow-up' },
        });
      }
    }
  });

  router.post('/link-proposals', requireWrite, async (req, res) => {
    const parsed = createLinkSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const proposal = await communicationAuraIntelligenceService.createLinkProposal(
        toActor(req),
        parsed.data,
      );
      res.json({ data: { proposal, autoLinked: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to create link proposal' },
        });
      }
    }
  });

  router.post('/link-proposals/:id/decide', requireWrite, async (req, res) => {
    const parsed = decideSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }
    try {
      const proposal = await communicationAuraIntelligenceService.decideLinkProposal(
        toActor(req),
        paramId(req),
        parsed.data,
      );
      res.json({ data: { proposal, autoLinked: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to decide link proposal' },
        });
      }
    }
  });

  return router;
}
