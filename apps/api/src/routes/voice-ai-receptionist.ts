import { Router } from 'express';
import { z } from 'zod';
import type { VoiceAiReceptionistService } from '../services/voice-ai-receptionist.service.js';
import {
  VoiceAiReceptionistError,
  type VairActor,
} from '../services/voice-ai-receptionist.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const localeSchema = z.enum(['en-ZA', 'af-ZA', 'zu-ZA', 'xh-ZA', 'other']);
const destinationSchema = z.enum([
  'ai_receptionist',
  'human_queue',
  'extension',
  'voicemail',
  'callback',
]);
const takeoverReasonSchema = z.enum([
  'caller_request',
  'low_confidence',
  'emergency',
  'operator_initiated',
  'policy',
]);

const recordIncomingSchema = z.object({
  callerPhone: z.string().trim().max(40).optional(),
  callerName: z.string().trim().max(200).optional(),
  voiceSessionId: z.string().uuid().optional(),
  summary: z.string().trim().max(4000).optional(),
  identifyCaller: z.boolean().optional(),
});

const lookupSchema = z.object({
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(320).optional(),
  name: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

const leadDraftSchema = z.object({
  callSessionId: z.string().uuid().optional(),
  contactName: z.string().trim().min(1).max(200),
  contactPhone: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().max(320).optional(),
  serviceType: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  submitForApproval: z.boolean().optional(),
});

const bookingDraftSchema = z.object({
  callSessionId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  preferredAt: z.string().trim().max(80).optional(),
  serviceType: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  submitForApproval: z.boolean().optional(),
});

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject', 'cancel']),
  notes: z.string().trim().max(2000).optional(),
  execute: z.boolean().optional(),
});

const takeoverSchema = z.object({
  callSessionId: z.string().uuid(),
  reason: takeoverReasonSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});

const releaseTakeoverSchema = z.object({
  callSessionId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional(),
});

const routingSchema = z.object({
  ruleKey: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  priority: z.number().int().min(0).max(10000).optional(),
  destination: destinationSchema,
  matchCriteria: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const settingsSchema = z.object({
  receptionistEnabled: z.boolean().optional(),
  leadCreateRequiresApproval: z.boolean().optional(),
  bookingExecuteRequiresApproval: z.boolean().optional(),
  defaultLocale: localeSchema.optional(),
  preferredVoiceLabel: z.string().trim().max(200).nullable().optional(),
  welcomeMessage: z.string().trim().max(4000).nullable().optional(),
  afterHoursMessage: z.string().trim().max(4000).nullable().optional(),
  telephonyProviderKey: z.string().trim().max(80).nullable().optional(),
  ttsProviderKey: z.string().trim().max(80).nullable().optional(),
  sttProviderKey: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const completeSchema = z.object({
  status: z.enum(['completed', 'missed', 'failed', 'abandoned']).optional(),
  summary: z.string().trim().max(4000).optional(),
});

type RouterDeps = {
  voiceAiReceptionistService: VoiceAiReceptionistService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): VairActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function paramId(req: import('express').Request): string {
  const raw = req.params.id;
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof VoiceAiReceptionistError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'INVALID_STATE'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createVoiceAiReceptionistRouter({
  voiceAiReceptionistService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    '*',
    'voice:read',
    'voice:write',
    'voice_reception:read',
    'voice_reception:write',
    'voice_reception:manage',
    'communications:read',
    'communications:write',
    'communications:manage',
    'agents:read',
  );
  const requireWrite = requireAnyPermission(
    '*',
    'voice:write',
    'voice_reception:write',
    'voice_reception:manage',
    'communications:write',
    'communications:manage',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await voiceAiReceptionistService.getOwnerDashboard(toActor(req));
      res.json({
        data: {
          dashboard,
          fakeCalls: false as const,
          fakeCustomers: false as const,
          fakeLeads: false as const,
          humanTakeoverAlwaysAvailable: true as const,
          hiddenActions: false as const,
          ownerControlled: true as const,
          customer360: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/customers/lookup', requireRead, async (req, res) => {
    try {
      const body = lookupSchema.parse(req.body ?? {});
      const result = await voiceAiReceptionistService.lookupCustomer(toActor(req), body);
      res.json({
        data: {
          result,
          fakeCustomers: false as const,
          customer360: false as const,
          invented: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/customers/:id/jobs', requireRead, async (req, res) => {
    try {
      const jobs = await voiceAiReceptionistService.listCustomerJobs(toActor(req), paramId(req));
      res.json({
        data: {
          jobs,
          fakeJobs: false as const,
          invented: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/calls/incoming', requireWrite, async (req, res) => {
    try {
      const body = recordIncomingSchema.parse(req.body ?? {});
      const session = await voiceAiReceptionistService.recordIncomingCall(toActor(req), body);
      res.status(201).json({
        data: {
          session,
          fakeCalls: false as const,
          invented: false as const,
          humanTakeoverAlwaysAvailable: true as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/calls/:id/complete', requireWrite, async (req, res) => {
    try {
      const body = completeSchema.parse(req.body ?? {});
      const session = await voiceAiReceptionistService.completeCallSession(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          session,
          fakeCalls: false as const,
          invented: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/approvals/lead-draft', requireWrite, async (req, res) => {
    try {
      const body = leadDraftSchema.parse(req.body ?? {});
      const draft = await voiceAiReceptionistService.createLeadDraft(toActor(req), body);
      res.status(201).json({
        data: {
          draft,
          autoExecuted: false as const,
          fakeLeads: false as const,
          requiresApproval: true as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/approvals/booking-draft', requireWrite, async (req, res) => {
    try {
      const body = bookingDraftSchema.parse(req.body ?? {});
      const draft = await voiceAiReceptionistService.createBookingDraft(toActor(req), body);
      res.status(201).json({
        data: {
          draft,
          autoExecuted: false as const,
          bookingAutoScheduled: false as const,
          requiresApproval: true as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/approvals/:id/decide', requireWrite, async (req, res) => {
    try {
      const body = decideSchema.parse(req.body ?? {});
      const draft = await voiceAiReceptionistService.decideApproval(
        toActor(req),
        paramId(req),
        body,
      );
      res.json({
        data: {
          draft,
          autoExecuted: false as const,
          bookingAutoScheduled: false as const,
          humanTakeoverAlwaysAvailable: true as const,
          ownerControlled: true as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/takeover', requireWrite, async (req, res) => {
    try {
      const body = takeoverSchema.parse(req.body ?? {});
      const result = await voiceAiReceptionistService.requestTakeover(toActor(req), body);
      res.status(201).json({
        data: {
          ...result,
          humanTakeoverAlwaysAvailable: true as const,
          hiddenActions: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/takeover/release', requireWrite, async (req, res) => {
    try {
      const body = releaseTakeoverSchema.parse(req.body ?? {});
      const session = await voiceAiReceptionistService.releaseTakeover(toActor(req), body);
      res.json({
        data: {
          session,
          humanTakeoverAlwaysAvailable: true as const,
          hiddenActions: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/routing', requireWrite, async (req, res) => {
    try {
      const body = routingSchema.parse(req.body ?? {});
      const rule = await voiceAiReceptionistService.upsertRoutingRule(toActor(req), body);
      res.status(201).json({
        data: {
          rule,
          ownerControlled: true as const,
          hiddenActions: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  router.patch('/settings', requireWrite, async (req, res) => {
    try {
      const body = settingsSchema.parse(req.body ?? {});
      const settings = await voiceAiReceptionistService.updateSettings(toActor(req), body);
      res.json({
        data: {
          settings,
          humanTakeoverAlwaysAvailable: true as const,
          ownerControlled: true as const,
          fakeCalls: false as const,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}
