import { Router } from 'express';
import { z } from 'zod';
import {
  OpsIntelligenceError,
  type OpsIntelligenceService,
} from '../services/ops-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const ackSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed']),
  dedupeKey: z.string().trim().min(1).max(500).optional(),
});

type OpsIntelligenceRouterDeps = {
  opsIntelligenceService: OpsIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createOpsIntelligenceRouter({
  opsIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: OpsIntelligenceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'ops:read',
    'ops:manage',
    'dispatch:read',
    'dispatch:write',
    'dispatch_intelligence:read',
    'dispatch_intelligence:write',
    'intelligence:read',
  );
  const requireAck = requireAnyPermission(
    'ops:manage',
    'dispatch:write',
    'dispatch_intelligence:write',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/snapshot', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const snapshot = await opsIntelligenceService.getSnapshot(companyId);
    res.json({ data: { snapshot } });
  });

  /** Owner-triggered refresh — the live provider work runs here, not in the dashboard read. */
  router.post('/snapshot/refresh', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const snapshot = await opsIntelligenceService.refreshSnapshot(companyId);
    res.json({ data: { snapshot } });
  });

  router.get('/morning-brief', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const morningBrief = await opsIntelligenceService.getMorningBrief(companyId);
    res.json({ data: { morningBrief } });
  });

  router.get('/live-strip', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const liveStrip = await opsIntelligenceService.getLiveStrip(companyId);
    res.json({ data: { liveStrip } });
  });

  router.get('/events', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const events = await opsIntelligenceService.getEvents(companyId);
    res.json({ data: { events } });
  });

  router.post('/reminders/:reminderId/ack', requireAck, async (req, res) => {
    const auth = getAuth(req);
    const parsed = ackSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'status must be acknowledged or dismissed' },
      });
      return;
    }

    try {
      const reminderId = String(
        Array.isArray(req.params.reminderId)
          ? req.params.reminderId[0]
          : req.params.reminderId ?? '',
      );
      if (!reminderId) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'reminderId is required' },
        });
        return;
      }
      const reminder = await opsIntelligenceService.acknowledgeReminder(
        { companyId: auth.companyId, userId: auth.userId },
        reminderId,
        { status: parsed.data.status },
      );
      res.json({ data: { reminder } });
    } catch (error) {
      if (error instanceof OpsIntelligenceError && error.code === 'NOT_FOUND') {
        res.status(404).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.post('/reminders/ack', requireAck, async (req, res) => {
    const auth = getAuth(req);
    const parsed = ackSchema.safeParse(req.body ?? {});
    if (!parsed.success || !parsed.data.dedupeKey) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'dedupeKey and status (acknowledged|dismissed) are required',
        },
      });
      return;
    }

    try {
      const reminder = await opsIntelligenceService.acknowledgeByDedupeKey(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data.dedupeKey,
        { status: parsed.data.status },
      );
      res.json({ data: { reminder } });
    } catch (error) {
      if (error instanceof OpsIntelligenceError) {
        res.status(400).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  return router;
}
