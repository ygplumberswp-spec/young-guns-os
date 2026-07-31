import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseNotificationsService } from '../services/enterprise-notifications.service.js';
import { EnterpriseNotificationsError } from '../services/enterprise-notifications.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const alertLevelSchema = z.enum(['info', 'success', 'warning', 'critical', 'emergency']);
const deliveryChannelSchema = z.enum([
  'in_app',
  'email',
  'sms',
  'whatsapp',
  'push',
  'slack',
  'microsoft_teams',
  'webhook',
]);
const moduleSourceSchema = z.enum([
  'crm',
  'leads',
  'customers',
  'jobs',
  'quotes',
  'scheduling',
  'dispatch',
  'fleet',
  'inventory',
  'procurement',
  'finance',
  'documents',
  'document_ai',
  'communications',
  'voice_reception',
  'ai_agents',
  'mission_control',
  'security',
  'saas_management',
  'industry_packs',
  'business_continuity',
  'data_migration',
]);
const ruleScopeSchema = z.enum(['user', 'role', 'department', 'company']);
const deliveryModeSchema = z.enum(['immediate', 'digest', 'quiet_hours']);

const platformConfigSchema = z.object({
  deliveryPolicy: z.record(z.unknown()).optional(),
  escalationPolicy: z.record(z.unknown()).optional(),
  quietHoursPolicy: z.record(z.unknown()).optional(),
  alertLevelConfig: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const ruleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  scope: ruleScopeSchema.optional(),
  scopeRefId: z.string().uuid().optional(),
  moduleSource: moduleSourceSchema.optional(),
  eventType: z.string().trim().max(200).optional(),
  severity: alertLevelSchema.optional(),
  deliveryMode: deliveryModeSchema.optional(),
  channels: z.array(deliveryChannelSchema).optional(),
  quietHoursEnabled: z.boolean().optional(),
  digestEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  conditions: z.record(z.unknown()).optional(),
});

const templateSchema = z.object({
  templateKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  moduleSource: moduleSourceSchema.optional(),
  eventType: z.string().trim().max(200).optional(),
  subjectTemplate: z.string().trim().min(1),
  bodyTemplate: z.string().trim().min(1),
  variables: z.array(z.string()).optional(),
  locale: z.string().trim().max(10).optional(),
  branding: z.record(z.unknown()).optional(),
});

const alertSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional(),
  alertLevel: alertLevelSchema.optional(),
  moduleSource: moduleSourceSchema.optional(),
  eventType: z.string().trim().max(200).optional(),
  sourceEntityType: z.string().trim().max(200).optional(),
  sourceEntityId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
});

const dispatchSchema = z.object({
  moduleSource: moduleSourceSchema,
  eventType: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1),
  alertLevel: alertLevelSchema.optional(),
  recipientUserId: z.string().uuid(),
  channels: z.array(deliveryChannelSchema).optional(),
  sourceEntityType: z.string().trim().max(200).optional(),
  sourceEntityId: z.string().uuid().optional(),
  templateKey: z.string().trim().max(100).optional(),
  templateVariables: z.record(z.string()).optional(),
});

const inboxStateSchema = z.object({
  notificationId: z.string().uuid(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
});

const userPreferenceSchema = z.object({
  channel: deliveryChannelSchema,
  moduleSource: moduleSourceSchema.optional(),
  eventType: z.string().trim().max(200).optional(),
  enabled: z.boolean().optional(),
  deliveryMode: deliveryModeSchema.optional(),
  quietHoursEnabled: z.boolean().optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

const previewSchema = z.object({
  templateId: z.string().uuid(),
  variables: z.record(z.string()).optional(),
});

type RouterDeps = {
  enterpriseNotificationsService: EnterpriseNotificationsService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function getRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseNotificationsError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseNotificationsRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requireRead = requireAnyPermission(
    'notifications:read',
    'notifications:manage',
    'integrations:read',
  );
  const requireWrite = requireAnyPermission(
    'notifications:write',
    'notifications:manage',
    'integrations:manage',
  );
  const requireManage = requireAnyPermission('notifications:manage', 'integrations:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await deps.enterpriseNotificationsService.getDashboard(staffScope(req));
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const platformConfig = await deps.enterpriseNotificationsService.getPlatformConfig(
        getAuth(req).companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    try {
      const input = platformConfigSchema.parse(req.body);
      const platformConfig = await deps.enterpriseNotificationsService.updatePlatformConfig(
        staffScope(req),
        input,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/inbox', requireRead, async (req, res) => {
    try {
      const inboxItems = await deps.enterpriseNotificationsService.listInboxItems(staffScope(req));
      res.json({ data: { inboxItems } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/inbox/state', requireWrite, async (req, res) => {
    try {
      const input = inboxStateSchema.parse(req.body);
      const inboxItems = await deps.enterpriseNotificationsService.updateInboxState(
        staffScope(req),
        input,
      );
      res.json({ data: { inboxItems } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/inbox/mark-all-read', requireWrite, async (req, res) => {
    try {
      const inboxItems = await deps.enterpriseNotificationsService.markAllRead(staffScope(req));
      res.json({ data: { inboxItems } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/alerts', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const alerts = await deps.enterpriseNotificationsService.listAlerts(getAuth(req).companyId, {
        status,
      });
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts', requireWrite, async (req, res) => {
    try {
      const input = alertSchema.parse(req.body);
      const alert = await deps.enterpriseNotificationsService.createAlert(staffScope(req), input);
      res.status(201).json({ data: { alert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/:id/acknowledge', requireWrite, async (req, res) => {
    try {
      const alert = await deps.enterpriseNotificationsService.acknowledgeAlert(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { alert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/:id/resolve', requireWrite, async (req, res) => {
    try {
      const alert = await deps.enterpriseNotificationsService.resolveAlert(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { alert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/escalations', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const escalations = await deps.enterpriseNotificationsService.listEscalations(
        getAuth(req).companyId,
        { status },
      );
      res.json({ data: { escalations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/escalations/:id/acknowledge', requireWrite, async (req, res) => {
    try {
      const escalation = await deps.enterpriseNotificationsService.acknowledgeEscalation(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { escalation } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/escalations/:id/resolve', requireWrite, async (req, res) => {
    try {
      const escalation = await deps.enterpriseNotificationsService.resolveEscalation(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { escalation } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/templates', requireRead, async (req, res) => {
    try {
      const templates = await deps.enterpriseNotificationsService.listTemplates(
        getAuth(req).companyId,
      );
      res.json({ data: { templates } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/templates', requireWrite, async (req, res) => {
    try {
      const input = templateSchema.parse(req.body);
      const template = await deps.enterpriseNotificationsService.createTemplate(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { template } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/templates/preview', requireRead, async (req, res) => {
    try {
      const input = previewSchema.parse(req.body);
      const preview = await deps.enterpriseNotificationsService.previewTemplate(
        getAuth(req).companyId,
        input.templateId,
        input.variables,
      );
      res.json({ data: { preview } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/delivery-jobs', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const deliveryJobs = await deps.enterpriseNotificationsService.listDeliveryJobs(
        getAuth(req).companyId,
        { status },
      );
      res.json({ data: { deliveryJobs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/delivery-jobs/:id/events', requireRead, async (req, res) => {
    try {
      const deliveryEvents = await deps.enterpriseNotificationsService.listDeliveryEvents(
        getAuth(req).companyId,
        getRouteParam(req.params.id),
      );
      res.json({ data: { deliveryEvents } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/dispatch', requireManage, async (req, res) => {
    try {
      const input = dispatchSchema.parse(req.body);
      const deliveryJobs = await deps.enterpriseNotificationsService.dispatchNotification(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { deliveryJobs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/rules', requireRead, async (req, res) => {
    try {
      const rules = await deps.enterpriseNotificationsService.listRules(getAuth(req).companyId);
      res.json({ data: { rules } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/rules', requireManage, async (req, res) => {
    try {
      const input = ruleSchema.parse(req.body);
      const rule = await deps.enterpriseNotificationsService.createRule(staffScope(req), input);
      res.status(201).json({ data: { rule } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/preferences', requireRead, async (req, res) => {
    try {
      const userPreferences = await deps.enterpriseNotificationsService.listUserPreferences(
        staffScope(req),
      );
      res.json({ data: { userPreferences } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/preferences', requireWrite, async (req, res) => {
    try {
      const input = userPreferenceSchema.parse(req.body);
      const userPreferences = await deps.enterpriseNotificationsService.updateUserPreference(
        staffScope(req),
        input,
      );
      res.json({ data: { userPreferences } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-alerts', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const platformAlerts = await deps.enterpriseNotificationsService.listPlatformAlerts(
        getAuth(req).companyId,
        {
          status,
        },
      );
      res.json({ data: { platformAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/platform-alerts/sync', requireWrite, async (req, res) => {
    try {
      const platformAlerts = await deps.enterpriseNotificationsService.syncPlatformAlerts(
        staffScope(req),
      );
      res.json({ data: { platformAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseNotificationsService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/action-drafts', requireRead, async (req, res) => {
    try {
      const actionDrafts = await deps.enterpriseNotificationsService.listActionDrafts(
        getAuth(req).companyId,
      );
      res.json({ data: { actionDrafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    try {
      const input = actionDraftSchema.parse(req.body);
      const actionDraft = await deps.enterpriseNotificationsService.createActionDraft(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auditLogs = await deps.enterpriseNotificationsService.listAuditLogs(
        getAuth(req).companyId,
      );
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
