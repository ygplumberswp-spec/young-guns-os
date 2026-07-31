import { Router } from 'express';
import { z } from 'zod';
import type { FleetIntelligenceService } from '../services/fleet-intelligence.service.js';
import { FleetIntelligenceError } from '../services/fleet-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const costTypeSchema = z.enum([
  'fuel',
  'maintenance',
  'tyre',
  'licensing',
  'insurance',
  'repair',
  'other',
]);
const actionTypeSchema = z.enum(['fleet_action', 'vehicle_replacement']);

const operatingCostSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  costType: costTypeSchema,
  amountCents: z.number().int().positive(),
  currency: z.string().trim().max(10).optional(),
  recordedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const actionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  vehicleId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).optional(),
});

const monthlyReportSchema = z.object({
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
});

type FleetIntelligenceRouterDeps = {
  fleetIntelligenceService: FleetIntelligenceService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createFleetIntelligenceRouter({
  fleetIntelligenceService,
  teamService,
  jwtSecret,
  authService,
}: FleetIntelligenceRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'fleet_intelligence:read',
    'fleet_intelligence:write',
    'fleet:read',
    'integrations:read',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('fleet_intelligence:write', 'fleet:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await fleetIntelligenceService.getExecutiveDashboard(companyId);
    res.json({ data: { dashboard } });
  });

  router.get('/trips', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const vehicleId = typeof req.query.vehicleId === 'string' ? req.query.vehicleId : undefined;
    const trips = await fleetIntelligenceService.getTripHistory(companyId, vehicleId);
    res.json({ data: { trips } });
  });

  router.get('/monthly-reports', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const reports = await fleetIntelligenceService.listMonthlyReports(companyId);
    res.json({ data: { reports } });
  });

  router.post('/monthly-reports/generate', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = monthlyReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid monthly report payload' } });
      return;
    }

    try {
      const report = await fleetIntelligenceService.generateMonthlyReport(companyId, parsed.data);
      res.status(201).json({ data: { report } });
    } catch (error) {
      if (error instanceof FleetIntelligenceError) {
        res.status(400).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.get('/behaviour', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const events = await fleetIntelligenceService.listDriverBehaviourEvents(companyId);
    res.json({ data: { events } });
  });

  router.post('/behaviour/analyze', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const events = await fleetIntelligenceService.analyzeDriverBehaviour(companyId);
    res.status(201).json({ data: { events } });
  });

  router.get('/utilization', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const utilization = await fleetIntelligenceService.getVehicleUtilization(companyId);
    res.json({ data: { utilization } });
  });

  router.get('/costs', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [costs, analytics] = await Promise.all([
      fleetIntelligenceService.listOperatingCosts(companyId),
      fleetIntelligenceService.getCostAnalytics(companyId),
    ]);
    res.json({ data: { costs, analytics } });
  });

  router.post('/costs', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = operatingCostSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid operating cost payload' } });
      return;
    }

    try {
      const cost = await fleetIntelligenceService.createOperatingCost(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { cost } });
    } catch (error) {
      if (error instanceof FleetIntelligenceError) {
        res.status(400).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.get('/performance', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const performance = await fleetIntelligenceService.getPerformanceAnalytics(companyId);
    res.json({ data: { performance } });
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await fleetIntelligenceService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    const { companyId } = getAuth(req);
    const branchKey = typeof req.body?.branchKey === 'string' ? req.body.branchKey : undefined;
    const recommendations = await fleetIntelligenceService.generateRecommendations(companyId, {
      branchKey,
    });
    res.status(201).json({ data: { recommendations } });
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const actions = await fleetIntelligenceService.listActions(companyId, status);
    res.json({ data: { actions } });
  });

  router.post('/actions', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid fleet action payload' } });
      return;
    }

    try {
      const action = await fleetIntelligenceService.createAction(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { action } });
    } catch (error) {
      if (error instanceof FleetIntelligenceError) {
        res.status(400).json({ error: { code: error.code, message: error.message } });
        return;
      }
      throw error;
    }
  });

  return router;
}
