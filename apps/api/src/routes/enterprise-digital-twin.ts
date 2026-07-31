import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseDigitalTwinService } from '../services/enterprise-digital-twin.service.js';
import { EnterpriseDigitalTwinError } from '../services/enterprise-digital-twin.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const simulationTypeSchema = z.enum([
  'job_scheduling',
  'technician_allocation',
  'dispatch_optimization',
  'fleet_utilization',
  'inventory_demand',
  'purchasing',
  'cash_flow',
  'staffing',
  'customer_demand',
  'growth',
]);

const actionTypeSchema = z.enum([
  'operational_improvement',
  'scenario_recommendation',
  'bottleneck_fix',
  'optimization_plan',
  'executive_recommendation',
]);

const scenarioSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  simulationType: simulationTypeSchema,
  assumptions: z.record(z.unknown()).optional(),
  variables: z.record(z.unknown()).optional(),
  baselineSnapshotId: z.string().uuid().optional().nullable(),
});

const cloneScenarioSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
});

const runSimulationSchema = z.object({
  scenarioId: z.string().uuid(),
});

const compareScenariosSchema = z.object({
  name: z.string().trim().min(1).max(200),
  scenarioIds: z.array(z.string().uuid()).min(2),
});

const actionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  scenarioId: z.string().uuid().optional().nullable(),
  payload: z.record(z.unknown()).optional(),
});

const snapshotSchema = z.object({
  label: z.string().trim().max(200).optional().nullable(),
});

type RouterDeps = {
  enterpriseDigitalTwinService: EnterpriseDigitalTwinService;
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
  if (error instanceof EnterpriseDigitalTwinError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseDigitalTwinRouter({
  enterpriseDigitalTwinService,
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
      const dashboard = await enterpriseDigitalTwinService.getExecutiveDashboard(
        getAuth(req).companyId,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/operational-state', requireRead, async (req, res) => {
    try {
      const operationalState = await enterpriseDigitalTwinService.buildOperationalState(
        getAuth(req).companyId,
      );
      res.json({ data: { operationalState } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/snapshots', requireRead, async (req, res) => {
    try {
      const snapshots = await enterpriseDigitalTwinService.listStateSnapshots(
        getAuth(req).companyId,
      );
      res.json({ data: { snapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/snapshots', requireWrite, async (req, res) => {
    try {
      const body = snapshotSchema.parse(req.body);
      const snapshot = await enterpriseDigitalTwinService.captureStateSnapshot(
        getAuth(req),
        body.label,
      );
      res.status(201).json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/scenarios', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const scenarios = await enterpriseDigitalTwinService.listScenarios(
        getAuth(req).companyId,
        status as 'draft' | 'active' | 'archived' | undefined,
      );
      res.json({ data: { scenarios } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/scenarios', requireWrite, async (req, res) => {
    try {
      const body = scenarioSchema.parse(req.body);
      const scenario = await enterpriseDigitalTwinService.createScenario(getAuth(req), body);
      res.status(201).json({ data: { scenario } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/scenarios/:id/clone', requireWrite, async (req, res) => {
    try {
      const body = cloneScenarioSchema.parse(req.body);
      const scenario = await enterpriseDigitalTwinService.cloneScenario(
        getAuth(req),
        getRouteParam(req.params.id),
        body,
      );
      res.status(201).json({ data: { scenario } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/simulations', requireRead, async (req, res) => {
    try {
      const simulations = await enterpriseDigitalTwinService.listSimulations(
        getAuth(req).companyId,
      );
      res.json({ data: { simulations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/simulations/run', requireWrite, async (req, res) => {
    try {
      const body = runSimulationSchema.parse(req.body);
      const simulation = await enterpriseDigitalTwinService.runSimulation(getAuth(req), body);
      res.status(201).json({ data: { simulation } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/comparisons', requireRead, async (req, res) => {
    try {
      const comparisons = await enterpriseDigitalTwinService.listComparisons(
        getAuth(req).companyId,
      );
      res.json({ data: { comparisons } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/comparisons', requireWrite, async (req, res) => {
    try {
      const body = compareScenariosSchema.parse(req.body);
      const comparison = await enterpriseDigitalTwinService.compareScenarios(getAuth(req), body);
      res.status(201).json({ data: { comparison } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/heat-maps', requireRead, async (req, res) => {
    try {
      const heatMaps = await enterpriseDigitalTwinService.listHeatMaps(getAuth(req).companyId);
      res.json({ data: { heatMaps } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/heat-maps/capture', requireWrite, async (req, res) => {
    try {
      const heatMaps = await enterpriseDigitalTwinService.captureHeatMaps(getAuth(req).companyId);
      res.status(201).json({ data: { heatMaps } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/replay-events', requireRead, async (req, res) => {
    try {
      const events = await enterpriseDigitalTwinService.listReplayEvents(getAuth(req).companyId);
      res.json({ data: { events } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/replay-events/sync', requireWrite, async (req, res) => {
    try {
      const events = await enterpriseDigitalTwinService.syncReplayEvents(getAuth(req).companyId);
      res.status(201).json({ data: { events } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    try {
      const recommendations = await enterpriseDigitalTwinService.listRecommendations(
        getAuth(req).companyId,
      );
      res.json({ data: { recommendations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const recommendations = await enterpriseDigitalTwinService.generateRecommendations(
        getAuth(req).companyId,
      );
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    try {
      const actions = await enterpriseDigitalTwinService.listActions(getAuth(req).companyId);
      res.json({ data: { actions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/actions', requireWrite, async (req, res) => {
    try {
      const body = actionSchema.parse(req.body);
      const action = await enterpriseDigitalTwinService.createAction(getAuth(req), body);
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
