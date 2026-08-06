import { Router } from 'express';
import { z } from 'zod';
import type { InventoryService } from '../services/inventory.service.js';
import { InventoryError } from '../services/inventory.service.js';
import type { StockMovementsService } from '../services/stock-movements.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const itemStatusSchema = z.enum(['active', 'inactive']);
const locationTypeSchema = z.enum(['warehouse', 'van', 'other']);

const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(50).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  locationType: locationTypeSchema.optional(),
  vehicleId: z.string().uuid().optional().nullable(),
  isDefault: z.boolean().optional(),
});

const createItemSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  unit: z.string().trim().min(1).max(50).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  unitCostCents: z.number().int().min(0).optional(),
  sellPriceCents: z.number().int().min(0).optional(),
  status: itemStatusSchema.optional(),
});

const setStockSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantityOnHand: z.number().int().min(0),
});

type InventoryRouterDeps = {
  inventoryService: InventoryService;
  stockMovementsService: StockMovementsService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createInventoryRouter({
  inventoryService,
  stockMovementsService,
  teamService,
  jwtSecret,
  authService,
}: InventoryRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/stats',
    requireAnyPermission('inventory:read', 'inventory:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const stats = await inventoryService.getStats(companyId);
      res.json({ data: stats });
    },
  );

  router.get(
    '/movements',
    requireAnyPermission('inventory:read', 'inventory:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const itemId = typeof req.query.itemId === 'string' ? req.query.itemId : undefined;
      const locationId =
        typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
      const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
      const movements = await stockMovementsService.listMovements(companyId, {
        itemId,
        locationId,
        jobId,
      });
      res.json({ data: { movements } });
    },
  );

  router.get(
    '/locations',
    requireAnyPermission('inventory:read', 'inventory:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const locations = await inventoryService.listLocations(companyId);
      res.json({ data: { locations } });
    },
  );

  router.post('/locations', requireAnyPermission('inventory:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = createLocationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid location payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const location = await inventoryService.createLocation(companyId, parsed.data);
      res.status(201).json({ data: { location } });
    } catch (error) {
      handleInventoryError(res, error);
    }
  });

  router.get(
    '/items',
    requireAnyPermission('inventory:read', 'inventory:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const includeCost =
        auth.permissions.includes('*') ||
        auth.permissions.includes('inventory:write') ||
        auth.permissions.includes('finance:write');
      const items = await inventoryService.listItems(auth.companyId, { includeCost });
      res.json({ data: { items } });
    },
  );

  router.post('/items', requireAnyPermission('inventory:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = createItemSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid product payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const item = await inventoryService.createItem(companyId, parsed.data);
      res.status(201).json({ data: { item } });
    } catch (error) {
      handleInventoryError(res, error);
    }
  });

  router.get(
    '/stock',
    requireAnyPermission('inventory:read', 'inventory:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const stockLevels = await inventoryService.listStockLevels(companyId);
      res.json({ data: { stockLevels } });
    },
  );

  router.post('/stock', requireAnyPermission('inventory:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = setStockSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid stock payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const stockLevel = await inventoryService.setStockLevel(companyId, parsed.data);
      res.status(201).json({ data: { stockLevel } });
    } catch (error) {
      handleInventoryError(res, error);
    }
  });

  return router;
}

function handleInventoryError(res: import('express').Response, error: unknown) {
  if (error instanceof InventoryError) {
    const status =
      error.code === 'ITEM_NOT_FOUND' || error.code === 'LOCATION_NOT_FOUND'
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
