import { Router } from 'express';
import { z } from 'zod';
import type { GmailService } from '../services/gmail.service.js';
import { GmailServiceError } from '../services/gmail.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const gmailAuthSchema = z.object({
  code: z.string().trim().min(1),
  redirectUri: z.string().trim().url(),
});

const sendGmailSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(500),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  cc: z.string().trim().email().optional(),
  bcc: z.string().trim().email().optional(),
  customerId: z.string().uuid().optional().nullable(),
  isDraft: z.boolean().optional(),
});

type GmailRouterDeps = {
  gmailService: GmailService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createGmailRouter({
  gmailService,
  teamService,
  jwtSecret,
  authService,
}: GmailRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get('/connection', requireAnyPermission('integrations:read', 'integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      const connection = await gmailService.getConnection(companyId);
      res.json({ data: { connection } });
    } catch (error) {
      handleGmailError(res, error);
    }
  });

  router.post('/auth', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = gmailAuthSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid Gmail auth payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const connection = await gmailService.connectWithOAuth(companyId, parsed.data);
      res.json({ data: { connection } });
    } catch (error) {
      handleGmailError(res, error);
    }
  });

  router.delete('/connection', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      await gmailService.disconnect(companyId);
      res.json({ data: { message: 'Gmail disconnected successfully' } });
    } catch (error) {
      handleGmailError(res, error);
    }
  });

  router.post('/sync', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      const result = await gmailService.syncMessages(companyId);
      res.json({ data: { result } });
    } catch (error) {
      handleGmailError(res, error);
    }
  });

  router.get('/messages', requireAnyPermission('communications:read', 'communications:write', 'integrations:read', 'integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const labelId = typeof req.query.labelId === 'string' ? req.query.labelId : undefined;

    try {
      const messages = await gmailService.listMessages(companyId, { labelId });
      res.json({ data: { messages } });
    } catch (error) {
      handleGmailError(res, error);
    }
  });

  router.get('/messages/:messageId', requireAnyPermission('communications:read', 'communications:write', 'integrations:read', 'integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const messageId = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;

    try {
      const message = await gmailService.getMessage(companyId, messageId);

      if (!message) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Gmail message not found',
          },
        });
        return;
      }

      res.json({ data: { message } });
    } catch (error) {
      handleGmailError(res, error);
    }
  });

  router.post('/messages/send', requireAnyPermission('communications:write', 'integrations:manage'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = sendGmailSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid Gmail message payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const message = await gmailService.sendMessage(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { message } });
    } catch (error) {
      handleGmailError(res, error);
    }
  });

  router.get('/labels', requireAnyPermission('integrations:read', 'integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      const labels = await gmailService.listLabels(companyId);
      res.json({ data: { labels } });
    } catch (error) {
      handleGmailError(res, error);
    }
  });

  router.get('/stats', requireAnyPermission('integrations:read', 'integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      const stats = await gmailService.getStats(companyId);
      res.json({ data: { stats } });
    } catch (error) {
      handleGmailError(res, error);
    }
  });

  return router;
}

function handleGmailError(res: import('express').Response, error: unknown) {
  if (error instanceof GmailServiceError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'NOT_CONNECTED' ||
            error.code === 'VALIDATION_ERROR' ||
            error.code === 'CONNECTION_FAILED' ||
            error.code === 'OAUTH_NOT_CONFIGURED'
          ? 400
          : 500;

    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  console.error('[gmail-router] Unexpected error:', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
