import { Router } from 'express';
import { z } from 'zod';
import type { TeamService } from '../services/team.service.js';
import { TeamError } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const createInviteSchema = z.object({
  email: z.string().trim().email(),
  roleId: z.string().uuid(),
});

type TeamRouterDeps = {
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createTeamRouter({ teamService, jwtSecret, authService }: TeamRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get('/members', requireAnyPermission('users:read', 'users:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const members = await teamService.listMembers(companyId);
    res.json({ data: { members } });
  });

  router.get('/roles', requireAnyPermission('users:read', 'users:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const roles = await teamService.listRoles(companyId);
    res.json({
      data: {
        roles,
        assignableRoles: teamService.getAssignableRoles(roles),
      },
    });
  });

  router.get('/invites', requireAnyPermission('users:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const invites = await teamService.listInvites(companyId);
    res.json({ data: { invites } });
  });

  router.post('/invites', requireAnyPermission('users:manage'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createInviteSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid invite payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const result = await teamService.createInvite(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data.email,
        parsed.data.roleId,
      );

      res.status(201).json({ data: result });
    } catch (error) {
      handleTeamError(res, error);
    }
  });

  return router;
}

function handleTeamError(res: import('express').Response, error: unknown) {
  if (error instanceof TeamError) {
    const status =
      error.code === 'ROLE_NOT_FOUND' || error.code === 'ROLE_NOT_ASSIGNABLE'
        ? 400
        : error.code === 'EMAIL_IN_USE'
          ? 409
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
