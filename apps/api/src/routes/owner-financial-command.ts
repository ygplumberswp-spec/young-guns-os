import { Router } from 'express';
import { z } from 'zod';
import { canViewOwnerFinancialCommand } from '@titan/shared';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';
import {
  OwnerFinancialCommandError,
  OwnerFinancialCommandService,
} from '../services/owner-financial-command.service.js';

type RouterDeps = {
  ownerFinancialCommandService: OwnerFinancialCommandService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request) {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof OwnerFinancialCommandError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  if (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code;
    if (code === 'FORBIDDEN' || code === 'NOT_FOUND') {
      res.status(code === 'NOT_FOUND' ? 404 : 403).json({
        error: { code, message: error.message },
      });
      return true;
    }
  }
  return false;
}

/**
 * FIN-001 routes — mounted under /api/v1/finance
 * GET /owner-command?period=today|week|month
 */
export function createOwnerFinancialCommandRouter({
  ownerFinancialCommandService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission('finance:read', 'finance:write', '*');

  router.use(requireAuth, denyTechnician);

  router.get('/owner-command', requireRead, async (req, res) => {
    const auth = getAuth(req);
    if (!canViewOwnerFinancialCommand(auth)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Owner Financial Command Centre requires finance access.',
        },
      });
      return;
    }

    const parsed = z
      .object({
        period: z.enum(['today', 'week', 'month']).optional(),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
      return;
    }

    try {
      const data = await ownerFinancialCommandService.getDashboard(
        toActor(req),
        parsed.data.period ?? 'month',
      );
      res.json({ data });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
