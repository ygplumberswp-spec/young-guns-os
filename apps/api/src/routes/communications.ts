import { Router } from 'express';
import { z } from 'zod';
import type { CommunicationsService } from '../services/communications.service.js';
import { CommunicationsError } from '../services/communications.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const channelSchema = z.enum(['email', 'phone', 'sms', 'note']);
const directionSchema = z.enum(['inbound', 'outbound']);
const visibilitySchema = z.enum(['internal_note', 'customer_visible', 'outbound_request']);

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  channel: channelSchema.optional(),
  subject: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(1).max(10000),
});

const createMessageSchema = z.object({
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  channel: channelSchema.optional(),
  direction: directionSchema.optional(),
  visibility: visibilitySchema.optional(),
  subject: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(1).max(10000),
  occurredAt: z.string().datetime().optional(),
  clientActionId: z.string().trim().min(1).max(200).optional().nullable(),
});

type CommunicationsRouterDeps = {
  communicationsService: CommunicationsService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createCommunicationsRouter({
  communicationsService,
  teamService,
  jwtSecret,
  authService,
}: CommunicationsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/stats',
    requireAnyPermission('communications:read', 'communications:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const stats = await communicationsService.getStats(companyId);
      res.json({ data: stats });
    },
  );

  router.get(
    '/messages',
    requireAnyPermission('communications:read', 'communications:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const messages = await communicationsService.listMessages({
        companyId: auth.companyId,
        userId: auth.userId,
        roleName: auth.roleName,
        permissions: auth.permissions,
      });
      res.json({ data: { messages } });
    },
  );

  router.post('/messages', requireAnyPermission('communications:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid communication payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const message = await communicationsService.createMessage(
        {
          companyId: auth.companyId,
          userId: auth.userId,
          roleName: auth.roleName,
          permissions: auth.permissions,
        },
        parsed.data,
      );
      res.status(201).json({ data: { message } });
    } catch (error) {
      handleCommunicationsError(res, error);
    }
  });

  router.get(
    '/templates',
    requireAnyPermission('communications:read', 'communications:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const templates = await communicationsService.listTemplates(companyId);
      res.json({ data: { templates } });
    },
  );

  router.post('/templates', requireAnyPermission('communications:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = createTemplateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid template payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const template = await communicationsService.createTemplate(companyId, parsed.data);
      res.status(201).json({ data: { template } });
    } catch (error) {
      handleCommunicationsError(res, error);
    }
  });

  return router;
}

function handleCommunicationsError(res: import('express').Response, error: unknown) {
  if (error instanceof CommunicationsError) {
    const status =
      error.code === 'CUSTOMER_NOT_FOUND' ||
      error.code === 'TEMPLATE_NOT_FOUND' ||
      error.code === 'JOB_NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'VALIDATION_ERROR'
            ? 400
            : 400;

    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}
