import { Router } from 'express';
import { z } from 'zod';
import type { FleetService } from '../services/fleet.service.js';
import { FleetError } from '../services/fleet.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const vehicleStatusSchema = z.enum(['available', 'in_use', 'maintenance', 'out_of_service']);

const createVehicleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  make: z.string().trim().max(100).optional().nullable(),
  model: z.string().trim().max(100).optional().nullable(),
  year: z.number().int().optional().nullable(),
  licensePlate: z.string().trim().min(1).max(50),
  vin: z.string().trim().max(50).optional().nullable(),
  status: vehicleStatusSchema.optional(),
  assignedUserId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const updateVehicleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  make: z.string().trim().max(100).optional().nullable(),
  model: z.string().trim().max(100).optional().nullable(),
  year: z.number().int().optional().nullable(),
  licensePlate: z.string().trim().min(1).max(50).optional(),
  vin: z.string().trim().max(50).optional().nullable(),
  status: vehicleStatusSchema.optional(),
  assignedUserId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

type FleetRouterDeps = {
  fleetService: FleetService;
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

export function createFleetRouter({
  fleetService,
  teamService,
  jwtSecret,
  authService,
}: FleetRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get('/stats', requireAnyPermission('fleet:read', 'fleet:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await fleetService.getStats(companyId);
    res.json({ data: stats });
  });

  router.get('/assignees', requireAnyPermission('fleet:read', 'fleet:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const assignees = await fleetService.listAssignees(companyId);
    res.json({ data: { assignees } });
  });

  router.get('/vehicles', requireAnyPermission('fleet:read', 'fleet:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const vehicles = await fleetService.listVehicles(companyId);
    res.json({ data: { vehicles } });
  });

  router.post('/vehicles', requireAnyPermission('fleet:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = createVehicleSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid vehicle payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const vehicle = await fleetService.createVehicle(companyId, parsed.data);
      res.status(201).json({ data: { vehicle } });
    } catch (error) {
      handleFleetError(res, error);
    }
  });

  router.get('/vehicles/:vehicleId', requireAnyPermission('fleet:read', 'fleet:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const vehicle = await fleetService.getVehicle(companyId, getRouteParam(req.params.vehicleId));

    if (!vehicle) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Vehicle not found' },
      });
      return;
    }

    res.json({ data: { vehicle } });
  });

  router.patch('/vehicles/:vehicleId', requireAnyPermission('fleet:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = updateVehicleSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid vehicle payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const vehicle = await fleetService.updateVehicle(
        companyId,
        getRouteParam(req.params.vehicleId),
        parsed.data,
      );
      res.json({ data: { vehicle } });
    } catch (error) {
      handleFleetError(res, error);
    }
  });

  return router;
}

function handleFleetError(res: import('express').Response, error: unknown) {
  if (error instanceof FleetError) {
    const status =
      error.code === 'NOT_FOUND' || error.code === 'ASSIGNEE_NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR'
          ? 400
          : 400;

    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  throw error;
}
