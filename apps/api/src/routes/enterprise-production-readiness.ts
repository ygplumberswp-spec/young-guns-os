import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseProductionReadinessService } from '../services/enterprise-production-readiness.service.js';
import { EnterpriseProductionReadinessError } from '../services/enterprise-production-readiness.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const backupPolicySchema = z.object({
  policyKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  scheduleCron: z.string().trim().max(100).optional(),
  retentionDays: z.number().int().min(1).optional(),
  isEnabled: z.boolean().optional(),
});

const maintenanceWindowSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional(),
  affectedModules: z.array(z.string()).optional(),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  serviceNotice: z.string().trim().max(5000).optional(),
});

const maintenanceActionSchema = z.object({
  actionType: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  maintenanceWindowId: z.string().uuid().optional(),
  checklist: z.array(z.string()).optional(),
  rollbackNotes: z.string().trim().max(5000).optional(),
  payload: z.record(z.unknown()).optional(),
});

const platformConfigSchema = z.object({
  warningThresholds: z.record(z.unknown()).optional(),
  hardInfrastructureLimits: z.record(z.unknown()).optional(),
  backupRetentionDays: z.number().int().min(1).optional(),
  logRetentionDays: z.number().int().min(1).optional(),
  recoveryPointObjectiveMinutes: z.number().int().min(0).nullable().optional(),
  recoveryTimeObjectiveMinutes: z.number().int().min(0).nullable().optional(),
  multiRegionEnabled: z.boolean().optional(),
  readReplicaEnabled: z.boolean().optional(),
});

const scalingConfigSchema = z.object({
  horizontalApiScalingEnabled: z.boolean().optional(),
  horizontalWorkerScalingEnabled: z.boolean().optional(),
  queueConcurrencyLimit: z.number().int().min(1).optional(),
  queuePartitionCount: z.number().int().min(1).optional(),
  dbPoolMaxConnections: z.number().int().min(1).optional(),
  aiRequestQueueConcurrency: z.number().int().min(1).optional(),
  searchIndexShards: z.number().int().min(1).optional(),
  webhookConcurrency: z.number().int().min(1).optional(),
  multiRegionReady: z.boolean().optional(),
});

const logSearchSchema = z.object({
  moduleKey: z.string().optional(),
  severity: z.enum(['debug', 'info', 'warn', 'error', 'critical']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  correlationId: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

type RouterDeps = {
  enterpriseProductionReadinessService: EnterpriseProductionReadinessService;
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
  if (error instanceof EnterpriseProductionReadinessError) {
    res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseProductionReadinessRouter({
  enterpriseProductionReadinessService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('ops:read', 'ops:manage', 'platform:read', 'platform:manage', 'executive:read');
  const requireWrite = requireAnyPermission('ops:manage', 'platform:manage');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await enterpriseProductionReadinessService.getDashboard(getAuth(req).companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/health/capture', requireWrite, async (req, res) => {
    try {
      const snapshots = await enterpriseProductionReadinessService.captureHealthSnapshots(getAuth(req).companyId);
      res.json({ data: { snapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/performance/capture', requireWrite, async (req, res) => {
    try {
      const snapshot = await enterpriseProductionReadinessService.capturePerformanceSnapshot(getAuth(req).companyId);
      res.json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/readiness/run', requireWrite, async (req, res) => {
    try {
      const run = await enterpriseProductionReadinessService.runReadinessChecks(getAuth(req).companyId);
      res.json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/logs/sync', requireWrite, async (req, res) => {
    try {
      const logs = await enterpriseProductionReadinessService.syncOperationalLogs(getAuth(req).companyId);
      res.json({ data: { logs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/logs', requireRead, async (req, res) => {
    try {
      const parsed = logSearchSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid log search parameters' } });
        return;
      }
      const logs = await enterpriseProductionReadinessService.searchLogs(getAuth(req).companyId, parsed.data);
      res.json({ data: { logs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/sync', requireWrite, async (req, res) => {
    try {
      const candidates = await enterpriseProductionReadinessService.syncMissionControlAlerts(getAuth(req).companyId);
      res.json({ data: { candidates } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/backup-policies', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = backupPolicySchema.parse(req.body);
      const policy = await enterpriseProductionReadinessService.createBackupPolicy(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { policy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/backup-policies/:policyId/run', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const run = await enterpriseProductionReadinessService.triggerBackupRun(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.policyId),
      );
      res.status(201).json({ data: { run } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/maintenance/windows', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = maintenanceWindowSchema.parse(req.body);
      const window = await enterpriseProductionReadinessService.createMaintenanceWindow(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { window } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/maintenance/actions', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = maintenanceActionSchema.parse(req.body);
      const action = await enterpriseProductionReadinessService.createMaintenanceAction(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/config/platform', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = platformConfigSchema.parse(req.body);
      const config = await enterpriseProductionReadinessService.updatePlatformConfig(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { config } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/config/scaling', requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const body = scalingConfigSchema.parse(req.body);
      const config = await enterpriseProductionReadinessService.updateScalingConfig(
        { companyId: auth.companyId, userId: auth.userId },
        body,
      );
      res.json({ data: { config } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/aura/context', requireRead, async (req, res) => {
    try {
      const context = await enterpriseProductionReadinessService.buildAuraContext(getAuth(req).companyId);
      res.json({ data: { context } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
