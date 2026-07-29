import { Router } from 'express';
import { z } from 'zod';
import type { AuraService } from '../services/aura.service.js';
import { AuraError } from '../services/aura.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  pageContext: z
    .object({
      customerId: z.string().uuid().optional(),
      jobId: z.string().uuid().optional(),
      vehicleId: z.string().uuid().optional(),
      schedulingView: z.boolean().optional(),
    })
    .optional(),
});

type AuraRouterDeps = {
  auraService: AuraService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function handleAuraError(res: import('express').Response, error: unknown) {
  if (error instanceof AuraError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'EMPTY_MESSAGE'
          ? 400
          : error.code === 'PROVIDER_NOT_CONFIGURED' ||
              error.code === 'PROVIDER_UNAVAILABLE' ||
              error.code === 'PROVIDER_REQUEST_FAILED' ||
              error.code === 'PROVIDER_EMPTY_RESPONSE' ||
              error.code === 'PROVIDER_ERROR'
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

export function createAuraRouter({ auraService, jwtSecret, authService }: AuraRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get('/conversations', async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const conversations = await auraService.listConversations({ companyId, userId });
    res.json({ data: { conversations } });
  });

  router.post('/conversations', async (req, res) => {
    const { companyId, userId } = getAuth(req);

    try {
      const conversation = await auraService.createConversation({ companyId, userId });
      res.status(201).json({ data: { conversation } });
    } catch (error) {
      handleAuraError(res, error);
    }
  });

  router.get('/conversations/:conversationId', async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const conversation = await auraService.getConversation(
      { companyId, userId },
      req.params.conversationId,
    );

    if (!conversation) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    res.json({ data: { conversation } });
  });

  router.delete('/conversations/:conversationId', async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const deleted = await auraService.deleteConversation(
      { companyId, userId },
      req.params.conversationId,
    );

    if (!deleted) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    res.json({ data: { success: true } });
  });

  router.post('/conversations/:conversationId/messages', async (req, res) => {
    const parsed = sendMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid message payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const { companyId, userId } = getAuth(req);

    try {
      const result = await auraService.sendMessage(
        { companyId, userId },
        req.params.conversationId,
        parsed.data.content,
        parsed.data.pageContext,
      );

      res.status(201).json({ data: result });
    } catch (error) {
      handleAuraError(res, error);
    }
  });

  return router;
}
