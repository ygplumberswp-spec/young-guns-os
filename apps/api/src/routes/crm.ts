import { Router } from 'express';
import { z } from 'zod';
import type { CrmService } from '../services/crm.service.js';
import { CrmError } from '../services/crm.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { applyStaffOwnerGuards } from '../middleware/staff-owner-guard.js';

const customerStatusSchema = z.enum(['active', 'inactive', 'lead']);

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  status: customerStatusSchema.optional(),
  isSupplierOnly: z.boolean().optional(),
  doNotContact: z.boolean().optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  contactPerson: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  status: customerStatusSchema.optional(),
  isSupplierOnly: z.boolean().optional(),
  doNotContact: z.boolean().optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const createActivitySchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

const propertyBodySchema = z.object({
  propertyName: z.string().trim().min(1).max(200),
  street: z.string().trim().max(300).optional().nullable(),
  suburb: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  province: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  unit: z.string().trim().max(50).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

const updatePropertySchema = propertyBodySchema.partial().extend({
  propertyName: z.string().trim().min(1).max(200).optional(),
});

type CrmRouterDeps = {
  crmService: CrmService;
  teamService: TeamService;
  db: import('@titan/db').DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createCrmRouter({
  crmService,
  teamService,
  db,
  jwtSecret,
  authService,
}: CrmRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  applyStaffOwnerGuards(router, db);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/stats',
    requireAnyPermission('customers:read', 'customers:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const stats = await crmService.getStats(companyId);
      res.json({ data: stats });
    },
  );

  router.get(
    '/customers',
    requireAnyPermission('customers:read', 'customers:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const search = typeof req.query.q === 'string' ? req.query.q : null;
      const customers = await crmService.listCustomers(companyId, search);
      res.json({ data: { customers } });
    },
  );

  router.post('/customers', requireAnyPermission('customers:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = createCustomerSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid customer payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const customer = await crmService.createCustomer(companyId, parsed.data);
      res.status(201).json({ data: { customer } });
    } catch (error) {
      handleCrmError(res, error);
    }
  });

  router.get(
    '/customers/:customerId',
    requireAnyPermission('customers:read', 'customers:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const customer = await crmService.getCustomer(
        companyId,
        getRouteParam(req.params.customerId),
      );

      if (!customer) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Customer not found' },
        });
        return;
      }

      res.json({ data: { customer } });
    },
  );

  router.patch(
    '/customers/:customerId',
    requireAnyPermission('customers:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = updateCustomerSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid customer payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const customer = await crmService.updateCustomer(
          companyId,
          getRouteParam(req.params.customerId),
          parsed.data,
        );
        res.json({ data: { customer } });
      } catch (error) {
        handleCrmError(res, error);
      }
    },
  );

  router.post(
    '/customers/:customerId/activities',
    requireAnyPermission('customers:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = createActivitySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid activity payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const customer = await crmService.addActivity(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.customerId),
          parsed.data,
        );
        res.status(201).json({ data: { customer } });
      } catch (error) {
        handleCrmError(res, error);
      }
    },
  );

  router.get(
    '/customers/:customerId/properties',
    requireAnyPermission('customers:read', 'customers:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      try {
        const properties = await crmService.listCustomerProperties(
          companyId,
          getRouteParam(req.params.customerId),
        );
        res.json({ data: { properties } });
      } catch (error) {
        handleCrmError(res, error);
      }
    },
  );

  router.post(
    '/customers/:customerId/properties',
    requireAnyPermission('customers:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = propertyBodySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid property payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const property = await crmService.createCustomerProperty(
          companyId,
          getRouteParam(req.params.customerId),
          parsed.data,
        );
        res.status(201).json({ data: { property } });
      } catch (error) {
        handleCrmError(res, error);
      }
    },
  );

  router.patch(
    '/customers/:customerId/properties/:propertyId',
    requireAnyPermission('customers:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = updatePropertySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid property payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const property = await crmService.updateCustomerProperty(
          companyId,
          getRouteParam(req.params.customerId),
          getRouteParam(req.params.propertyId),
          parsed.data,
        );
        res.json({ data: { property } });
      } catch (error) {
        handleCrmError(res, error);
      }
    },
  );

  return router;
}

function handleCrmError(res: import('express').Response, error: unknown) {
  if (error instanceof CrmError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 400;

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
