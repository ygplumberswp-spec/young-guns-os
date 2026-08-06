import { Router } from 'express';
import { z } from 'zod';
import {
  SECMON_CATEGORIES,
  SECMON_INCIDENT_STATUSES,
  SECMON_MAX_FAILED_LOGIN_THRESHOLD,
  SECMON_MAX_LOOKBACK_DAYS,
  SECMON_MIN_FAILED_LOGIN_THRESHOLD,
  SECMON_MIN_LOOKBACK_DAYS,
  SECMON_SEVERITIES,
  SECMON_TRIAGE_STATES,
  canReadSecmonMonitoring,
  type SecmonCategory,
  type SecmonIncidentStatus,
  type SecmonSeverity,
  type SecmonTriageState,
} from '@titan/shared';
import type { SecurityMonitoringService } from '../services/security-monitoring.service.js';
import {
  SecurityMonitoringError,
  type SecmonActor,
} from '../services/security-monitoring.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const categorySchema = z.enum(
  SECMON_CATEGORIES as unknown as [SecmonCategory, ...SecmonCategory[]],
);
const severitySchema = z.enum(
  SECMON_SEVERITIES as unknown as [SecmonSeverity, ...SecmonSeverity[]],
);
const triageSchema = z.enum(
  SECMON_TRIAGE_STATES as unknown as [SecmonTriageState, ...SecmonTriageState[]],
);
const incidentStatusSchema = z.enum(
  SECMON_INCIDENT_STATUSES as unknown as [SecmonIncidentStatus, ...SecmonIncidentStatus[]],
);

const updateSettingsSchema = z.object({
  lookbackDays: z
    .number()
    .int()
    .min(SECMON_MIN_LOOKBACK_DAYS)
    .max(SECMON_MAX_LOOKBACK_DAYS)
    .optional(),
  failedLoginThreshold: z
    .number()
    .int()
    .min(SECMON_MIN_FAILED_LOGIN_THRESHOLD)
    .max(SECMON_MAX_FAILED_LOGIN_THRESHOLD)
    .optional(),
  severityFloor: severitySchema.optional(),
  groupDuplicates: z.boolean().optional(),
});

const triageSignalSchema = z.object({
  triage: triageSchema,
  note: z.string().trim().max(2000).nullable().optional(),
});

const openIncidentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: categorySchema,
  severity: severitySchema,
  summary: z.string().trim().min(1).max(5000),
  linkedSignalKeys: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
});

const updateIncidentSchema = z.object({
  status: incidentStatusSchema,
  summary: z.string().trim().min(1).max(5000).optional(),
});

const decideRecommendationSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(2000).nullable().optional(),
});

type RouterDeps = {
  securityMonitoringService: SecurityMonitoringService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): SecmonActor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function paramValue(req: import('express').Request, key: string): string {
  const raw = req.params[key];
  return String(Array.isArray(raw) ? raw[0] : (raw ?? ''));
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof SecurityMonitoringError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

/**
 * Every response carries the department's standing guarantees so a caller can
 * assert them rather than trust prose: nothing was remediated, no credential
 * was returned, no threat was invented and any action needs Owner approval.
 */
const HONESTY_FLAGS = {
  autoRemediated: false as const,
  autoExecuted: false as const,
  credentialsExposed: false as const,
  inventedThreatData: false as const,
  fakeBusinessData: false as const,
  approvalRequired: true as const,
} as const;

export function createSecurityMonitoringRouter({
  securityMonitoringService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  /**
   * Technicians and clients are refused by role before permissions are read, so
   * a wildcard grant cannot admit them. The service re-checks the same rules
   * before anything leaves it, so this guard cannot be bypassed.
   */
  router.use((req, res, next) => {
    const auth = getAuth(req);
    if (!canReadSecmonMonitoring({ roleName: auth.roleName, permissions: auth.permissions })) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message:
            'Security monitoring is not available to this role. Security logs, session metadata and permission history are restricted.',
        },
      });
      return;
    }
    next();
  });

  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', async (req, res) => {
    try {
      const dashboard = await securityMonitoringService.getDashboard(toActor(req));
      res.json({ data: { dashboard, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.get('/settings', async (req, res) => {
    try {
      const actor = toActor(req);
      const settings = await securityMonitoringService.getSettings(actor.companyId);
      res.json({ data: { settings, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.patch('/settings', async (req, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid settings payload.' } });
      return;
    }
    try {
      const settings = await securityMonitoringService.updateSettings(toActor(req), parsed.data);
      res.json({ data: { settings, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.post('/signals/:signalKey/triage', async (req, res) => {
    const parsed = triageSignalSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid triage payload.' } });
      return;
    }
    try {
      const result = await securityMonitoringService.triageSignal(
        toActor(req),
        decodeURIComponent(paramValue(req, 'signalKey')),
        parsed.data,
      );
      res.json({ data: { ...result, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.post('/incidents', async (req, res) => {
    const parsed = openIncidentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid incident payload.' } });
      return;
    }
    try {
      const incident = await securityMonitoringService.openIncident(toActor(req), parsed.data);
      res.status(201).json({ data: { incident, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.patch('/incidents/:incidentId', async (req, res) => {
    const parsed = updateIncidentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid incident payload.' } });
      return;
    }
    try {
      const incident = await securityMonitoringService.updateIncident(
        toActor(req),
        paramValue(req, 'incidentId'),
        parsed.data,
      );
      res.json({ data: { incident, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.post('/recommendations/:recommendationKey/decide', async (req, res) => {
    const parsed = decideRecommendationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID', message: 'Invalid decision payload.' } });
      return;
    }
    try {
      const result = await securityMonitoringService.decideRecommendation(
        toActor(req),
        decodeURIComponent(paramValue(req, 'recommendationKey')),
        parsed.data,
      );
      res.json({ data: { ...result, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  router.get('/audit', async (req, res) => {
    try {
      const limit = Number.parseInt(String(req.query.limit ?? '100'), 10);
      const entries = await securityMonitoringService.listAudit(
        toActor(req),
        Number.isFinite(limit) ? limit : 100,
      );
      res.json({ data: { entries, ...HONESTY_FLAGS } });
    } catch (error) {
      if (handleError(res, error)) return;
      throw error;
    }
  });

  return router;
}
