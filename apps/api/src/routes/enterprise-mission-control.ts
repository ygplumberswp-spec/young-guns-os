import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseMissionControlService } from '../services/enterprise-mission-control.service.js';
import { EnterpriseMissionControlError } from '../services/enterprise-mission-control.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const incidentSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
const incidentStatusSchema = z.enum(['open', 'investigating', 'resolved', 'closed']);
const commandActionTypeSchema = z.enum([
  'executive_task',
  'workflow_launch',
  'approval_request',
  'investigation',
  'incident_escalation',
  'department_coordination',
  'executive_briefing',
]);

const createIncidentSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(5000),
  severity: incidentSeveritySchema.optional(),
  ownerUserId: z.string().uuid().optional().nullable(),
  linkedEntities: z.array(z.record(z.unknown())).optional(),
  branchKey: z.string().trim().max(100).optional().nullable(),
});

const updateIncidentSchema = z.object({
  status: incidentStatusSchema.optional(),
  ownerUserId: z.string().uuid().optional().nullable(),
  rootCause: z.string().trim().max(5000).optional().nullable(),
  resolutionSummary: z.string().trim().max(5000).optional().nullable(),
});

const acknowledgeAlertSchema = z.object({
  alertId: z.string().uuid(),
});

const timelineEntrySchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional().nullable(),
});

const commandActionSchema = z.object({
  actionType: commandActionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  incidentId: z.string().uuid().optional().nullable(),
  payload: z.record(z.unknown()).optional(),
});

type RouterDeps = {
  enterpriseMissionControlService: EnterpriseMissionControlService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseMissionControlError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseMissionControlRouter({
  enterpriseMissionControlService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'executive:read',
    'executive:write',
    'intelligence:read',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('executive:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const startedAt = Date.now();
      const companyId = getAuth(req).companyId;
      const dashboard = await enterpriseMissionControlService.getMissionControlDashboard(companyId);
      const durationMs = Date.now() - startedAt;
      const existingTiming = res.getHeader('Server-Timing');
      const mcTiming = `mission-control;dur=${durationMs}`;
      res.setHeader(
        'Server-Timing',
        existingTiming ? `${existingTiming}, ${mcTiming}` : mcTiming,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/dashboard/summary', requireRead, async (req, res) => {
    try {
      const startedAt = Date.now();
      const summary = await enterpriseMissionControlService.getMissionControlSummary(
        getAuth(req).companyId,
      );
      const durationMs = Date.now() - startedAt;
      const existingTiming = res.getHeader('Server-Timing');
      const mcTiming = `mission-control-summary;dur=${durationMs}`;
      res.setHeader(
        'Server-Timing',
        existingTiming ? `${existingTiming}, ${mcTiming}` : mcTiming,
      );
      res.json({ data: { summary } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/dashboard/modules', requireRead, async (req, res) => {
    try {
      const startedAt = Date.now();
      const moduleSnapshots = await enterpriseMissionControlService.getMissionControlModuleSnapshots(
        getAuth(req).companyId,
      );
      const durationMs = Date.now() - startedAt;
      const existingTiming = res.getHeader('Server-Timing');
      const mcTiming = `mission-control-modules;dur=${durationMs}`;
      res.setHeader(
        'Server-Timing',
        existingTiming ? `${existingTiming}, ${mcTiming}` : mcTiming,
      );
      res.json({ data: { moduleSnapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/sync', requireWrite, async (req, res) => {
    try {
      const alerts = await enterpriseMissionControlService.syncAlertsFromModules(getAuth(req).companyId);
      res.status(201).json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/alerts', requireRead, async (req, res) => {
    try {
      const alerts = await enterpriseMissionControlService.listAlerts(getAuth(req).companyId);
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/acknowledge', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = acknowledgeAlertSchema.parse(req.body);
      const alert = await enterpriseMissionControlService.acknowledgeAlert(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { alert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/incidents', requireRead, async (req, res) => {
    try {
      const incidents = await enterpriseMissionControlService.listIncidents(getAuth(req).companyId);
      res.json({ data: { incidents } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/incidents', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = createIncidentSchema.parse(req.body);
      const incident = await enterpriseMissionControlService.createIncident(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { incident } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/incidents/:incidentId', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const incidentId = getRouteParam(req.params.incidentId);
      const body = updateIncidentSchema.parse(req.body);
      const incident = await enterpriseMissionControlService.updateIncident(
        { companyId: auth.companyId, userId: auth.userId },
        incidentId,
        body,
      );
      res.json({ data: { incident } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/incidents/:incidentId/timeline', requireRead, async (req, res) => {
    try {
      const companyId = getAuth(req).companyId;
      const incidentId = getRouteParam(req.params.incidentId);
      const timeline = await enterpriseMissionControlService.getIncidentTimeline(companyId, incidentId);
      res.json({ data: { timeline } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/incidents/:incidentId/timeline', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const incidentId = getRouteParam(req.params.incidentId);
      const body = timelineEntrySchema.parse(req.body);
      const entry = await enterpriseMissionControlService.addIncidentTimelineEntry(
        { companyId: auth.companyId, userId: auth.userId },
        incidentId,
        body,
      );
      res.status(201).json({ data: { entry } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/timeline', requireRead, async (req, res) => {
    try {
      const events = await enterpriseMissionControlService.listTimelineEvents(getAuth(req).companyId);
      res.json({ data: { events } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/timeline/sync', requireWrite, async (req, res) => {
    try {
      const events = await enterpriseMissionControlService.syncTimelineFromModules(getAuth(req).companyId);
      res.status(201).json({ data: { events } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/operations-map', requireRead, async (req, res) => {
    try {
      const points = await enterpriseMissionControlService.listOperationsMap(getAuth(req).companyId);
      res.json({ data: { points } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/operations-map/capture', requireWrite, async (req, res) => {
    try {
      const points = await enterpriseMissionControlService.captureOperationsMap(getAuth(req).companyId);
      res.status(201).json({ data: { points } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/department-health/refresh', requireWrite, async (req, res) => {
    try {
      const departmentHealth = await enterpriseMissionControlService.refreshDepartmentHealth(
        getAuth(req).companyId,
      );
      res.json({ data: { departmentHealth } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    try {
      const recommendations = await enterpriseMissionControlService.listRecommendations(getAuth(req).companyId);
      res.json({ data: { recommendations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const recommendations = await enterpriseMissionControlService.generateRecommendations(getAuth(req).companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    try {
      const actions = await enterpriseMissionControlService.listCommandActions(getAuth(req).companyId);
      res.json({ data: { actions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/actions', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = commandActionSchema.parse(req.body);
      const action = await enterpriseMissionControlService.createCommandAction(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
