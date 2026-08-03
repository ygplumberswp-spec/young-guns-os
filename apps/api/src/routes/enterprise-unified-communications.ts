import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseUnifiedCommunicationsService } from '../services/enterprise-unified-communications.service.js';
import { EnterpriseUnifiedCommunicationsError } from '../services/enterprise-unified-communications.service.js';
import {
  DispatchCommunicationError,
  type DispatchCommunicationService,
} from '../services/dispatch-communication.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const providerAdapterSchema = z.object({
  channel: z.enum([
    'voice',
    'whatsapp',
    'sms',
    'email',
    'live_chat',
    'website_chat',
    'facebook_messenger',
    'instagram',
    'microsoft_teams',
    'slack',
    'custom',
  ]),
  providerKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  endpointUrl: z.string().url().optional(),
  credentialsVaultKey: z.string().trim().max(200).optional(),
  isPrimary: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const outboundCampaignSchema = z.object({
  campaignType: z.enum([
    'appointment_confirmation',
    'reminder',
    'missed_appointment',
    'satisfaction',
    'payment_reminder',
    'maintenance_reminder',
    'quote_followup',
    'lead_qualification',
  ]),
  subject: z.string().trim().min(1).max(500),
  scriptTemplate: z.string().trim().max(10000).optional(),
  targetFilter: z.record(z.unknown()).optional(),
  consentRequired: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional(),
});

const dispatchNotificationSchema = z.object({
  jobId: z.string().uuid(),
  customerId: z.string().uuid(),
  notificationType: z.enum([
    'appointment_confirmation',
    'technician_en_route',
    'eta',
    'tracking_link',
    'arrival',
    'completion',
    'invoice',
  ]),
  channel: z
    .enum([
      'voice',
      'whatsapp',
      'sms',
      'email',
      'live_chat',
      'website_chat',
      'facebook_messenger',
      'instagram',
      'microsoft_teams',
      'slack',
      'custom',
    ])
    .optional(),
  recipientAddress: z.string().trim().max(500).optional(),
  messageBody: z.string().trim().max(5000).optional(),
  etaMinutes: z.number().int().min(0).optional(),
});

const platformConfigSchema = z.object({
  globalPolicies: z.record(z.unknown()).optional(),
  aiVoiceSettings: z.record(z.unknown()).optional(),
  recordingPolicy: z.record(z.unknown()).optional(),
  retentionDays: z.number().int().min(1).optional(),
  consentRequired: z.boolean().optional(),
  routingRules: z.record(z.unknown()).optional(),
  notificationTemplates: z.record(z.unknown()).optional(),
});

type RouterDeps = {
  enterpriseUnifiedCommunicationsService: EnterpriseUnifiedCommunicationsService;
  dispatchCommunicationService: DispatchCommunicationService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

const dispatchCommHookSchema = z.object({
  hookType: z.enum(['appointment_confirmation', 'technician_en_route', 'job_completed']),
  channel: z
    .enum([
      'voice',
      'whatsapp',
      'sms',
      'email',
      'live_chat',
      'website_chat',
      'facebook_messenger',
      'instagram',
      'microsoft_teams',
      'slack',
      'custom',
    ])
    .optional(),
  recipientAddress: z.string().trim().max(500).optional(),
  messageBody: z.string().trim().max(5000).optional(),
  etaMinutes: z.number().int().min(0).optional(),
});

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseUnifiedCommunicationsError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof DispatchCommunicationError) {
    const status =
      error.code === 'JOB_NOT_FOUND'
        ? 404
        : error.code === 'ALREADY_QUEUED' || error.code === 'NOT_APPLICABLE'
          ? 409
          : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseUnifiedCommunicationsRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requireRead = requireAnyPermission(
    'communications:read',
    'communications:manage',
    'communications_intelligence:read',
    'voice:read',
    'platform:read',
  );
  const requireWrite = requireAnyPermission('communications:write', 'communications:manage');
  const requireManage = requireAnyPermission('communications:manage', 'platform:manage');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await deps.teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const dashboard = await deps.enterpriseUnifiedCommunicationsService.getDashboard(
      getAuth(req).companyId,
    );
    res.json({ data: { dashboard } });
  });

  router.get('/aura-context', requireRead, async (req, res) => {
    const context = await deps.enterpriseUnifiedCommunicationsService.buildAuraContext(
      getAuth(req).companyId,
    );
    res.json({ data: { context } });
  });

  router.get('/customers/:customerId/center', requireRead, async (req, res) => {
    try {
      const center =
        await deps.enterpriseUnifiedCommunicationsService.getCustomerCommunicationCenter(
          getAuth(req).companyId,
          getRouteParam(req.params.customerId),
        );
      res.json({ data: { center } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/timeline/sync', requireWrite, async (req, res) => {
    const timeline = await deps.enterpriseUnifiedCommunicationsService.syncTimelineFromModules(
      getAuth(req).companyId,
    );
    res.json({ data: { timeline } });
  });

  router.post('/providers', requireManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = providerAdapterSchema.parse(req.body);
      const provider = await deps.enterpriseUnifiedCommunicationsService.createProviderAdapter(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { provider } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      handleError(error, res);
    }
  });

  router.post('/providers/:providerId/test', requireManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const provider = await deps.enterpriseUnifiedCommunicationsService.testProviderAdapter(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.providerId),
      );
      res.json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/providers/:providerId/disable', requireManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const provider = await deps.enterpriseUnifiedCommunicationsService.disableProviderAdapter(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.providerId),
      );
      res.json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/outbound-campaigns', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = outboundCampaignSchema.parse(req.body);
      const campaign = await deps.enterpriseUnifiedCommunicationsService.createOutboundCampaign(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { campaign } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      handleError(error, res);
    }
  });

  router.post('/dispatch-notifications', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = dispatchNotificationSchema.parse(req.body);
      const notification =
        await deps.enterpriseUnifiedCommunicationsService.queueDispatchNotification(
          { companyId: auth.companyId, userId: auth.userId },
          body,
        );
      res.status(201).json({ data: { notification } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      handleError(error, res);
    }
  });

  /** Readiness only — never sends. Draft→approve→queue via POST .../queue. */
  router.get(
    '/dispatch-notifications/jobs/:jobId/readiness',
    requireAnyPermission(
      'communications:read',
      'communications:write',
      'communications:manage',
      'dispatch:read',
      'dispatch:write',
    ),
    async (req, res) => {
      const readiness = await deps.dispatchCommunicationService.assessJobCommunicationReadiness(
        getAuth(req).companyId,
        getRouteParam(req.params.jobId),
      );
      res.json({
        data: {
          readiness,
          autoSend: false,
          approvalRequired: true,
        },
      });
    },
  );

  router.post(
    '/dispatch-notifications/jobs/:jobId/prepare',
    requireWrite,
    async (req, res) => {
      try {
        const body = dispatchCommHookSchema.pick({ hookType: true }).parse(req.body);
        const draft = await deps.dispatchCommunicationService.prepareDraft(
          getAuth(req).companyId,
          getRouteParam(req.params.jobId),
          body.hookType,
        );
        res.json({
          data: {
            draft,
            autoSend: false,
            approvalRequired: true,
            note: 'Draft prepared in memory only. Approve via /queue to enter UC pending queue.',
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        handleError(error, res);
      }
    },
  );

  router.post(
    '/dispatch-notifications/jobs/:jobId/queue',
    requireWrite,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const body = dispatchCommHookSchema.parse(req.body);
        const notification = await deps.dispatchCommunicationService.queueApprovedDraft(
          { companyId: auth.companyId, userId: auth.userId },
          {
            jobId: getRouteParam(req.params.jobId),
            hookType: body.hookType,
            channel: body.channel,
            recipientAddress: body.recipientAddress,
            messageBody: body.messageBody,
            etaMinutes: body.etaMinutes,
          },
        );
        res.status(201).json({
          data: {
            notification,
            autoSend: false,
            note: 'Queued pending adapter execution — not sent automatically.',
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        handleError(error, res);
      }
    },
  );

  router.post('/analytics/capture', requireManage, async (req, res) => {
    const snapshot = await deps.enterpriseUnifiedCommunicationsService.captureAnalytics(
      getAuth(req).companyId,
    );
    res.json({ data: { snapshot } });
  });

  router.patch('/config', requireManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = platformConfigSchema.parse(req.body);
      const config = await deps.enterpriseUnifiedCommunicationsService.updatePlatformConfig(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { config } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        return;
      }
      handleError(error, res);
    }
  });

  return router;
}
