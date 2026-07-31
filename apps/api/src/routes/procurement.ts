import { Router } from 'express';
import { z } from 'zod';
import type { ProcurementService } from '../services/procurement.service.js';
import { ProcurementError } from '../services/procurement.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const supplierStatusSchema = z.enum(['active', 'inactive']);
const purchaseOrderStatusSchema = z.enum([
  'draft',
  'pending_approval',
  'approved',
  'ordered',
  'received',
  'completed',
  'cancelled',
]);
const activityTypeSchema = z.enum(['note', 'communication', 'performance', 'order', 'other']);
const recommendationStatusSchema = z.enum(['pending', 'accepted', 'dismissed', 'completed']);

const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  status: supplierStatusSchema.optional(),
});

const updateSupplierSchema = createSupplierSchema.partial();

const createSupplierProductSchema = z.object({
  supplierId: z.string().uuid(),
  inventoryItemId: z.string().uuid().optional().nullable(),
  productName: z.string().trim().min(1).max(200),
  supplierSku: z.string().trim().max(100).optional().nullable(),
  unitCostCents: z.number().int().min(0).optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const updateSupplierProductSchema = createSupplierProductSchema
  .omit({ supplierId: true })
  .partial();

const purchaseOrderItemSchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().min(1).max(100000),
  unitCostCents: z.number().int().min(0),
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  items: z.array(purchaseOrderItemSchema).min(1),
  jobId: z.string().uuid().optional().nullable(),
  jobReference: z.string().trim().max(100).optional().nullable(),
  destinationLocationId: z.string().uuid().optional().nullable(),
  clientActionId: z.string().trim().min(1).max(200).optional().nullable(),
});

const updatePurchaseOrderSchema = z.object({
  notes: z.string().trim().max(5000).optional().nullable(),
  items: z.array(purchaseOrderItemSchema).min(1).optional(),
});

const updatePurchaseOrderStatusSchema = z.object({
  status: purchaseOrderStatusSchema,
  cancelReason: z.string().trim().max(2000).optional().nullable(),
});

const receivePurchaseOrderSchema = z.object({
  clientActionId: z.string().trim().min(1).max(200),
  destinationLocationId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid(),
        quantityReceived: z.number().int().min(1),
      }),
    )
    .min(1),
});

const createActivitySchema = z.object({
  activityType: activityTypeSchema.optional(),
  subject: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(1).max(8000),
  occurredAt: z.string().datetime().optional(),
});

const updateRecommendationSchema = z.object({
  status: recommendationStatusSchema,
});

type ProcurementRouterDeps = {
  procurementService: ProcurementService;
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

export function createProcurementRouter({
  procurementService,
  teamService,
  jwtSecret,
  authService,
}: ProcurementRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    'procurement:read',
    'procurement:write',
    'inventory:read',
  );
  const requireWrite = requireAnyPermission('procurement:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/stats', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await procurementService.getStats(companyId);
    res.json({ data: { stats } });
  });

  router.get('/insights', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const [stockIntelligence, supplierInsights] = await Promise.all([
      procurementService.getStockIntelligence(companyId),
      procurementService.getSupplierInsights(companyId),
    ]);
    res.json({ data: { stockIntelligence, supplierInsights } });
  });

  router.get('/suppliers', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const suppliers = await procurementService.listSuppliers(companyId);
    res.json({ data: { suppliers } });
  });

  router.post('/suppliers', requireWrite, async (req, res) => {
    const parsed = createSupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supplier payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const supplier = await procurementService.createSupplier(companyId, parsed.data);
      res.status(201).json({ data: { supplier } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.patch('/suppliers/:id', requireWrite, async (req, res) => {
    const parsed = updateSupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supplier payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const supplier = await procurementService.updateSupplier(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { supplier } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.get('/suppliers/:id/activities', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const activities = await procurementService.listSupplierActivities(
        companyId,
        getRouteParam(req.params.id),
      );
      res.json({ data: { activities } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.post('/suppliers/:id/activities', requireWrite, async (req, res) => {
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid activity payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const activity = await procurementService.addSupplierActivity(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { activity } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.get('/supplier-products', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const products = await procurementService.listSupplierProducts(companyId);
    res.json({ data: { products } });
  });

  router.post('/supplier-products', requireWrite, async (req, res) => {
    const parsed = createSupplierProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supplier product payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const product = await procurementService.createSupplierProduct(companyId, parsed.data);
      res.status(201).json({ data: { product } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.patch('/supplier-products/:id', requireWrite, async (req, res) => {
    const parsed = updateSupplierProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supplier product payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const product = await procurementService.updateSupplierProduct(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { product } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.get('/purchase-orders', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const purchaseOrders = await procurementService.listPurchaseOrders(companyId);
    res.json({ data: { purchaseOrders } });
  });

  router.get('/purchase-orders/:id', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const purchaseOrder = await procurementService.getPurchaseOrder(
        companyId,
        getRouteParam(req.params.id),
      );

      if (!purchaseOrder) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found' } });
        return;
      }

      res.json({ data: { purchaseOrder } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.post('/purchase-orders', requireWrite, async (req, res) => {
    const parsed = createPurchaseOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid purchase order payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const purchaseOrder = await procurementService.createPurchaseOrder(auth, parsed.data);
      res.status(201).json({ data: { purchaseOrder } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.patch('/purchase-orders/:id', requireWrite, async (req, res) => {
    const parsed = updatePurchaseOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid purchase order payload' } });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const purchaseOrder = await procurementService.updatePurchaseOrder(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { purchaseOrder } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.post('/purchase-orders/:id/receive', requireWrite, async (req, res) => {
    const parsed = receivePurchaseOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid receipt payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const purchaseOrder = await procurementService.receivePurchaseOrder(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { purchaseOrder } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.patch('/purchase-orders/:id/status', requireWrite, async (req, res) => {
    const parsed = updatePurchaseOrderStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid status payload' } });
      return;
    }

    try {
      const auth = getAuth(req);
      const purchaseOrder = await procurementService.updatePurchaseOrderStatus(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { purchaseOrder } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.get('/recommendations', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const recommendations = await procurementService.listRecommendations(companyId);
    res.json({ data: { recommendations } });
  });

  router.post('/recommendations/generate', requireWrite, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const recommendations = await procurementService.generateRecommendations(companyId);
      res.status(201).json({ data: { recommendations } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  router.patch('/recommendations/:id', requireWrite, async (req, res) => {
    const parsed = updateRecommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid recommendation payload' },
      });
      return;
    }

    try {
      const { companyId } = getAuth(req);
      const recommendation = await procurementService.updateRecommendation(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { recommendation } });
    } catch (error) {
      handleProcurementError(res, error);
    }
  });

  return router;
}

function handleProcurementError(res: import('express').Response, error: unknown) {
  if (error instanceof ProcurementError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'INVALID_STATUS'
          ? 409
          : error.code === 'INSUFFICIENT_STOCK'
            ? 409
            : 400;
    res.status(status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  throw error;
}
