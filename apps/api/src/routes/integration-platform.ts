import { Router } from 'express';
import { z } from 'zod';
import type { IntegrationPlatformService } from '../services/integration-platform.service.js';
import { IntegrationPlatformError } from '../services/integration-platform.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { createApiGatewayMiddleware } from '../middleware/api-gateway.js';
import type { ConnectorEngineService } from '../services/connector-engine.service.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const actionTypeSchema = z.enum([
  'integration_repair',
  'reconnect_recommendation',
  'sync_retry',
  'credential_rotation',
]);
const actionStatusSchema = z.enum([
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);
const syncScopeSchema = z.enum(['incremental', 'full', 'event_driven']);

const actionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  payload: z.record(z.unknown()).optional(),
});

const scheduleSchema = z.object({
  syncScope: syncScopeSchema.optional(),
  frequencyMinutes: z.number().int().min(5).max(10080).optional(),
  enabled: z.boolean().optional(),
});

const diagnosticSchema = z.object({
  diagnosticType: z.string().trim().min(1).max(200),
  connectorId: z.string().uuid().optional(),
});

type RouterDeps = {
  integrationPlatformService: IntegrationPlatformService;
  connectorEngineService: ConnectorEngineService;
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

export function createIntegrationPlatformRouter({
  integrationPlatformService,
  connectorEngineService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireGateway = createApiGatewayMiddleware({
    integrationPlatformService,
    connectorEngine: connectorEngineService,
  });
  const requireRead = requireAnyPermission(
    'integrations:read',
    'integrations:manage',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('integrations:manage');

  const ensureRoles = async (req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  };

  router.use(requireAuth);
  router.use(requireGateway);

  router.get('/dashboard', requireRead, async (req, res) => {
    const startedAt = Date.now();
    const { companyId } = getAuth(req);
    const includeVault = req.query.includeVault === 'true';
    const refreshConnectors = req.query.refreshConnectors === 'true';
    const dashboard = await integrationPlatformService.getExecutiveDashboard(companyId, {
      includeVault,
      refreshConnectors,
    });
    const durationMs = Date.now() - startedAt;
    res.setHeader('Server-Timing', `dashboard;dur=${durationMs}`);
    res.json({ data: { dashboard, meta: { durationMs } } });
  });

  router.get('/connectors', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const connectors = await connectorEngineService.listConnectors(companyId);
    res.json({ data: { connectors } });
  });

  router.post('/connectors/sync', requireWrite, ensureRoles, async (req, res) => {
    const { companyId } = getAuth(req);
    await connectorEngineService.ensureConnectors(companyId);
    await connectorEngineService.syncConnectorStatuses(companyId);
    const connectors = await connectorEngineService.listConnectors(companyId);
    res.json({ data: { connectors } });
  });

  router.get('/monitoring', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const monitoring = await integrationPlatformService.getMonitoringSummary(companyId);
    res.json({ data: { monitoring } });
  });

  router.get('/traces', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const traces = await integrationPlatformService.listGatewayTraces(companyId);
    res.json({ data: { traces } });
  });

  router.get('/vault', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const vaultEntries = await integrationPlatformService.listCredentialsVault(companyId);
    res.json({ data: { vaultEntries } });
  });

  router.get('/schedules', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const schedules = await integrationPlatformService.listSyncSchedules(companyId);
    res.json({ data: { schedules } });
  });

  router.put('/connectors/:connectorId/schedule', requireWrite, ensureRoles, async (req, res) => {
    const auth = getAuth(req);
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sync schedule payload' } });
      return;
    }

    try {
      const schedule = await integrationPlatformService.upsertSyncSchedule(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.connectorId),
        parsed.data,
      );
      res.json({ data: { schedule } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/conflicts', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const conflicts = await integrationPlatformService.listSyncConflicts(companyId);
    res.json({ data: { conflicts } });
  });

  router.post('/conflicts/:conflictId/resolve', requireWrite, ensureRoles, async (req, res) => {
    const auth = getAuth(req);
    try {
      const conflict = await integrationPlatformService.resolveSyncConflict(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.conflictId),
      );
      res.json({ data: { conflict } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const actions = await integrationPlatformService.listActions(companyId);
    res.json({ data: { actions } });
  });

  router.post('/actions', requireWrite, ensureRoles, async (req, res) => {
    const auth = getAuth(req);
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid integration action payload' },
        });
      return;
    }

    try {
      const action = await integrationPlatformService.createAction(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.patch('/actions/:actionId/status', requireWrite, ensureRoles, async (req, res) => {
    const auth = getAuth(req);
    const parsed = z.object({ status: actionStatusSchema }).safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action status payload' } });
      return;
    }

    try {
      const action = await integrationPlatformService.updateActionStatus(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.actionId),
        parsed.data.status,
      );
      res.json({ data: { action } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/connectors/:connectorId/retry-sync', requireWrite, ensureRoles, async (req, res) => {
    const auth = getAuth(req);
    try {
      const result = await integrationPlatformService.retryConnectorSync(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.connectorId),
      );
      res.json({ data: result });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/diagnostics', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const diagnostics = await integrationPlatformService.listDiagnostics(companyId);
    res.json({ data: { diagnostics } });
  });

  router.post('/diagnostics/run', requireWrite, ensureRoles, async (req, res) => {
    const auth = getAuth(req);
    const parsed = diagnosticSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid diagnostic payload' } });
      return;
    }

    try {
      const diagnostic = await integrationPlatformService.runDiagnostic(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { diagnostic } });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof IntegrationPlatformError) {
    res.status(400).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}
