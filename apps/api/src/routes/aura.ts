import { Router } from 'express';
import { z } from 'zod';
import type { AuraService } from '../services/aura.service.js';
import { AuraError } from '../services/aura.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { applyStaffOwnerGuards } from '../middleware/staff-owner-guard.js';

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
  db: import('@titan/db').DatabaseClient;
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
              error.code === 'PROVIDER_TIMEOUT' ||
              error.code === 'PROVIDER_REQUEST_FAILED' ||
              error.code === 'PROVIDER_EMPTY_RESPONSE' ||
              error.code === 'PROVIDER_ERROR'
            ? error.code === 'PROVIDER_TIMEOUT'
              ? 504
              : 503
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

export function createAuraRouter({ auraService, db, jwtSecret, authService }: AuraRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireAuraRead = requireAnyPermission('agents:read', 'intelligence:read', '*');
  const requireAuraWrite = requireAnyPermission('agents:write', 'intelligence:write', '*');

  router.use(requireAuth);
  applyStaffOwnerGuards(router, db);

  router.get('/conversations', requireAuraRead, async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const conversations = await auraService.listConversations({ companyId, userId });
    res.json({ data: { conversations } });
  });

  router.post('/conversations', requireAuraWrite, async (req, res) => {
    const { companyId, userId } = getAuth(req);

    try {
      const conversation = await auraService.createConversation({ companyId, userId });
      res.status(201).json({ data: { conversation } });
    } catch (error) {
      handleAuraError(res, error);
    }
  });

  router.get('/conversations/:conversationId', requireAuraRead, async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const conversation = await auraService.getConversation(
      { companyId, userId },
      req.params.conversationId as string,
    );

    if (!conversation) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    res.json({ data: { conversation } });
  });

  router.delete('/conversations/:conversationId', requireAuraWrite, async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const deleted = await auraService.deleteConversation(
      { companyId, userId },
      req.params.conversationId as string,
    );

    if (!deleted) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });
      return;
    }

    res.json({ data: { success: true } });
  });

  router.post('/conversations/:conversationId/messages', requireAuraWrite, async (req, res) => {
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
        req.params.conversationId as string,
        parsed.data.content,
        parsed.data.pageContext,
      );

      if (result.diagnostics) {
        const diagnostics = result.diagnostics;
        res.setHeader(
          'Server-Timing',
          [
            `total;dur=${diagnostics.totalApiMs}`,
            `history;dur=${diagnostics.conversationHistoryMs}`,
            `context;dur=${diagnostics.contextBuildMs}`,
            `provider;dur=${diagnostics.providerMs}`,
            `db;dur=${diagnostics.databaseMs}`,
            `routing;dur=${diagnostics.agentRoutingMs}`,
          ].join(', '),
        );
      }

      res.status(201).json({ data: result });
    } catch (error) {
      handleAuraError(res, error);
    }
  });

  return router;
}
