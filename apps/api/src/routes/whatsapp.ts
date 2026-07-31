import { Router } from 'express';
import { z } from 'zod';
import type { WhatsappService } from '../services/whatsapp.service.js';
import { WhatsappServiceError } from '../services/whatsapp.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const sendMessageSchema = z.object({
  customerId: z.string().uuid(),
  messageContent: z.string().trim().min(1).max(4096),
  templateId: z.string().uuid().optional().nullable(),
  templateVariables: z.record(z.string()).optional(),
  asDraft: z.boolean().optional(),
});

type WhatsappRouterDeps = {
  whatsappService: WhatsappService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createWhatsappRouter({
  whatsappService,
  teamService,
  jwtSecret,
  authService,
}: WhatsappRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/messages',
    requireAnyPermission(
      'communications:read',
      'communications:write',
      'integrations:read',
      'integrations:manage',
    ),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const customerId =
        typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
      const messages = await whatsappService.listMessages(companyId, { customerId });
      res.json({ data: { messages } });
    },
  );

  router.post(
    '/messages/send',
    requireAnyPermission('communications:write', 'integrations:manage'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = sendMessageSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid WhatsApp message payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const message = await whatsappService.sendMessage(
          { companyId: auth.companyId, userId: auth.userId },
          parsed.data,
        );
        res.status(201).json({ data: { message } });
      } catch (error) {
        handleWhatsappError(res, error);
      }
    },
  );

  router.post(
    '/messages/:messageId/approve',
    requireAnyPermission('communications:write', 'integrations:manage'),
    async (req, res) => {
      const auth = getAuth(req);
      const messageId = Array.isArray(req.params.messageId)
        ? req.params.messageId[0]
        : req.params.messageId;

      try {
        const message = await whatsappService.approveDraft(
          { companyId: auth.companyId, userId: auth.userId },
          messageId,
        );
        res.json({ data: { message } });
      } catch (error) {
        handleWhatsappError(res, error);
      }
    },
  );

  return router;
}

function handleWhatsappError(res: import('express').Response, error: unknown) {
  if (error instanceof WhatsappServiceError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'NOT_CONNECTED' ||
            error.code === 'VALIDATION_ERROR' ||
            error.code === 'CONNECTION_FAILED'
          ? 400
          : error.code === 'ENCRYPTION_NOT_CONFIGURED'
            ? 503
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
