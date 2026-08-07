import { Router } from 'express';
import { z } from 'zod';
import { isPlatformOwnerRole } from '@titan/auth';
import type { PersonalWhatsappConnectionService } from '../services/personal-whatsapp-connection.service.js';
import {
  PersonalWhatsappConnectionError,
  type PersonalWaConnectionActor,
} from '../services/personal-whatsapp-connection.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const phoneSchema = z.string().trim().min(7).max(32);

const linkSchema = z.object({
  phoneNumber: phoneSchema,
  label: z.string().trim().max(120).optional(),
  accessToken: z.string().trim().min(1).max(4000).optional(),
  phoneNumberId: z.string().trim().max(128).optional(),
  businessAccountId: z.string().trim().max(128).optional(),
  syncEnabled: z.boolean().optional(),
});

const connectSchema = z.object({
  phoneNumber: phoneSchema.optional(),
  label: z.string().trim().max(120).optional(),
  accessToken: z.string().trim().min(1).max(4000).optional(),
  phoneNumberId: z.string().trim().max(128).optional(),
  businessAccountId: z.string().trim().max(128).optional(),
  syncEnabled: z.boolean().optional(),
});

const privacySchema = z.object({
  syncEnabled: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
});

const settingsSchema = z.object({
  label: z.string().trim().max(120).optional(),
  phoneNumber: phoneSchema.optional(),
  syncEnabled: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
});

type RouterDeps = {
  personalWhatsappConnectionService: PersonalWhatsappConnectionService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): PersonalWaConnectionActor {
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
        'Personal WhatsApp Connection Layer is Platform Owner only (same gate as Personal WhatsApp Assistant).',
    },
  });
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof PersonalWhatsappConnectionError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'NOT_CONFIGURED'
            ? 503
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createPersonalWhatsappConnectionRouter({
  personalWhatsappConnectionService,
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
      const dashboard = await personalWhatsappConnectionService.getDashboard(actor);
      res.json({
        data: {
          dashboard,
          autoSend: false as const,
          autoImport: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load Personal WhatsApp Connection Layer' },
        });
      }
    }
  });

  router.get('/status', requireRead, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const connection = await personalWhatsappConnectionService.getStatus(actor);
      res.json({ data: { connection, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load connection status' },
        });
      }
    }
  });

  router.get('/testing-support', requireRead, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const dashboard = await personalWhatsappConnectionService.getDashboard(actor);
      res.json({
        data: {
          testingSupport: dashboard.testingSupport,
          runtimeHonesty: dashboard.runtimeHonesty,
          autoSend: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load testing support matrix' },
        });
      }
    }
  });

  router.get('/events', requireRead, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const events = await personalWhatsappConnectionService.listRecentEvents(actor);
      res.json({ data: { events, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to load connection events' },
        });
      }
    }
  });

  router.put('/link', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const parsed = linkSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION', message: 'Invalid link payload', details: parsed.error.flatten() },
      });
      return;
    }
    try {
      const connection = await personalWhatsappConnectionService.linkNumber(actor, parsed.data);
      res.json({ data: { connection, autoSend: false as const, autoImport: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to link Personal WhatsApp number' },
        });
      }
    }
  });

  router.post('/connect', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const parsed = connectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION',
          message: 'Invalid connect payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    try {
      const connection = await personalWhatsappConnectionService.connect(actor, parsed.data);
      res.json({
        data: {
          connection,
          autoSend: false as const,
          liveProviderVerified: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to connect Personal WhatsApp' },
        });
      }
    }
  });

  router.post('/disconnect', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const connection = await personalWhatsappConnectionService.disconnect(actor);
      res.json({ data: { connection, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to disconnect Personal WhatsApp' },
        });
      }
    }
  });

  router.post('/reconnect', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const connection = await personalWhatsappConnectionService.reconnect(actor);
      res.json({ data: { connection, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to request Personal WhatsApp reconnect' },
        });
      }
    }
  });

  router.post('/health-check', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    try {
      const result = await personalWhatsappConnectionService.checkHealth(actor);
      res.json({ data: { result, autoSend: false as const, liveProviderVerified: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to check Personal WhatsApp session health' },
        });
      }
    }
  });

  router.put('/privacy', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const parsed = privacySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION',
          message: 'Invalid privacy payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    try {
      const connection = await personalWhatsappConnectionService.updatePrivacy(actor, parsed.data);
      res.json({
        data: {
          connection,
          autoSend: false as const,
          autoImport: false as const,
          privateByDefault: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to update privacy settings' },
        });
      }
    }
  });

  router.put('/settings', requireWrite, async (req, res) => {
    const actor = toActor(req);
    if (!isPlatformOwnerRole(actor)) {
      denyPersonal(res);
      return;
    }
    const parsed = settingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION',
          message: 'Invalid settings payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    try {
      const connection = await personalWhatsappConnectionService.updateSettings(actor, parsed.data);
      res.json({ data: { connection, autoSend: false as const } });
    } catch (error) {
      if (!handleError(res, error)) {
        res.status(500).json({
          error: { code: 'INTERNAL', message: 'Unable to update connection settings' },
        });
      }
    }
  });

  return router;
}
