import { Router } from 'express';
import { z } from 'zod';
import { isPlatformOwnerRole } from '@titan/auth';
import type { PersonalWhatsappIntelligenceService } from '../services/personal-whatsapp-intelligence.service.js';
import {
  PersonalWhatsappIntelligenceError,
  type PersonalWaIntelActor,
} from '../services/personal-whatsapp-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const classificationSchema = z.enum([
  'customer',
  'supplier',
  'employee',
  'business_opportunity',
  'private_personal',
]);

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

const classifySchema = z.object({
  personalThreadId: z.string().uuid(),
  contextText: z.string().trim().max(5000).optional(),
  classificationOverride: classificationSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});

const scanSchema = z.object({
  generateAuraSuggestions: z.boolean().optional(),
});

const linkProposalSchema = z.object({
  personalThreadId: z.string().uuid(),
  linkTargetType: linkTargetSchema,
  linkTargetId: z.string().uuid().optional(),
  subject: z.string().trim().max(500).optional(),
  recommendation: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(2000).optional(),
});

const auraSchema = z.object({
  personalThreadId: z.string().uuid().optional(),
  suggestionType: z.enum(['next_action', 'draft_reply', 'approval_request']),
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(8000),
});

type RouterDeps = {
  personalWhatsappIntelligenceService: PersonalWhatsappIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): PersonalWaIntelActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function denyPersonal(res: import('express').Response) {
  res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message:
        'Personal WhatsApp Intelligence is Platform Owner only (same gate as Personal WhatsApp Assistant).',
    },
  });
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof PersonalWhatsappIntelligenceError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'PRIVACY_BLOCKED'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createPersonalWhatsappIntelligenceRouter({
  personalWhatsappIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'personal_communications:read',
    'personal_communications:write',
    'communications_intelligence:read',
    'communications:read',
    'communications:manage',
    'integrations:read',
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    'personal_communications:write',
    'communications_intelligence:write',
    'communications:write',
    'communications:manage',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const dashboard = await personalWhatsappIntelligenceService.getDashboard(actor);
      res.json({ data: { dashboard } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/threads', requireRead, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const threads = await personalWhatsappIntelligenceService.listThreads(actor);
      res.json({ data: { threads } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/scan', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const parsed = scanSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid scan payload' } });
      return;
    }
    try {
      const result = await personalWhatsappIntelligenceService.runScan(actor, parsed.data);
      res.status(201).json({ data: { result, autoSend: false as const, autoLinked: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/classify', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const parsed = classifySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid classify payload' } });
      return;
    }
    try {
      const thread = await personalWhatsappIntelligenceService.classifyThread(actor, parsed.data);
      res.json({ data: { thread } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/link-proposals', requireRead, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const proposals = await personalWhatsappIntelligenceService.listLinkProposals(
        actor,
        status as 'pending_approval' | undefined,
      );
      res.json({ data: { proposals, autoLinked: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/link-proposals', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const parsed = linkProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid link proposal payload' } });
      return;
    }
    try {
      const proposal = await personalWhatsappIntelligenceService.createLinkProposal(
        actor,
        parsed.data,
      );
      res.status(201).json({ data: { proposal, autoLinked: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/link-proposals/:proposalId/decide', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const proposalId = Array.isArray(req.params.proposalId)
      ? req.params.proposalId[0]!
      : req.params.proposalId!;
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid decision payload' } });
      return;
    }
    try {
      const proposal = await personalWhatsappIntelligenceService.decideLinkProposal(
        actor,
        proposalId,
        parsed.data,
      );
      res.json({ data: { proposal, autoLinked: false as const, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/aura-suggestions', requireRead, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const suggestions = await personalWhatsappIntelligenceService.listAuraSuggestions(
        actor,
        'pending_approval',
      );
      res.json({ data: { suggestions, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/aura-suggestions', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const parsed = auraSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid AURA suggestion payload' } });
      return;
    }
    try {
      const suggestion = await personalWhatsappIntelligenceService.createAuraSuggestion(
        actor,
        parsed.data,
      );
      res.status(201).json({ data: { suggestion, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/aura-suggestions/:suggestionId/decide', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const suggestionId = Array.isArray(req.params.suggestionId)
      ? req.params.suggestionId[0]!
      : req.params.suggestionId!;
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid decision payload' } });
      return;
    }
    try {
      const suggestion = await personalWhatsappIntelligenceService.decideAuraSuggestion(
        actor,
        suggestionId,
        parsed.data,
      );
      res.json({
        data: {
          suggestion,
          autoSend: false as const,
          note: 'Approval does not send any WhatsApp message.',
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
