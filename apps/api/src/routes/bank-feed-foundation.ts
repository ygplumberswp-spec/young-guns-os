import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  BankFeedFoundationService,
  BankFeedFoundationServiceError,
} from '../services/bank-feed-foundation.service.js';
import type { TeamService } from '../services/team.service.js';

type Deps = {
  bankFeedFoundationService: BankFeedFoundationService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(auth: ReturnType<typeof getAuth>) {
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

export function createBankFeedFoundationRouter({
  bankFeedFoundationService,
  teamService,
  db,
  jwtSecret,
  authService,
}: Deps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get(
    '/bank-feed/capability',
    requireAnyPermission('finance:read', 'finance:write', 'integrations:read', '*'),
    async (req, res) => {
      try {
        const data = await bankFeedFoundationService.getCapability(toActor(getAuth(req)));
        res.json({ data });
      } catch (error) {
        if (error instanceof BankFeedFoundationServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[bank-feed-foundation]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Capability failed' } });
      }
    },
  );

  router.get(
    '/bank-feed/connection',
    requireAnyPermission('finance:read', 'finance:write', 'integrations:read', '*'),
    async (req, res) => {
      try {
        const data = await bankFeedFoundationService.getOrEnsureConnection(toActor(getAuth(req)));
        res.json({ data });
      } catch (error) {
        if (error instanceof BankFeedFoundationServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[bank-feed-foundation]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Connection failed' } });
      }
    },
  );

  router.get(
    '/bank-feed/staging-audit',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await bankFeedFoundationService.stagingAudit(toActor(getAuth(req)));
        res.json({ data });
      } catch (error) {
        if (error instanceof BankFeedFoundationServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[bank-feed-foundation]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Audit failed' } });
      }
    },
  );

  router.post(
    '/bank-feed/intake/preview',
    requireAnyPermission('finance:write', 'integrations:write', '*'),
    async (req, res) => {
      try {
        const body = z
          .object({
            filename: z.string().trim().min(1).max(255),
            mimeType: z.string().trim().min(1).max(120),
            contentBase64: z.string().min(1),
            clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
            // Explicitly reject credential fields at the boundary
            username: z.never().optional(),
            password: z.never().optional(),
            pin: z.never().optional(),
            otp: z.never().optional(),
            cvv: z.never().optional(),
          })
          .parse(req.body ?? {});
        const data = await bankFeedFoundationService.previewStatementIntake(
          toActor(getAuth(req)),
          body,
        );
        res.status(200).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof BankFeedFoundationServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        if (error instanceof Error && error.message.includes('Forbidden bank credential')) {
          res.status(400).json({ error: { code: 'FORBIDDEN_CREDENTIAL', message: error.message } });
          return;
        }
        console.error('[bank-feed-foundation]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Preview failed' } });
      }
    },
  );

  return router;
}
