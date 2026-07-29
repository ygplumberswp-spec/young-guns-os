import { Router } from 'express';
import { z } from 'zod';
import type { CrmService } from '../services/crm.service.js';
import { CrmError } from '../services/crm.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const customerStatusSchema = z.enum(['active', 'inactive', 'lead']);

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  status: customerStatusSchema.optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  status: customerStatusSchema.optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

const createActivitySchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

type CrmRouterDeps = {
  crmService: CrmService;
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

export function createCrmRouter({ crmService, teamService, jwtSecret, authService }: CrmRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get('/stats', requireAnyPermission('customers:read', 'customers:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await crmService.getStats(companyId);
    res.json({ data: stats });
  });

  router.get('/customers', requireAnyPermission('customers:read', 'customers:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const customers = await crmService.listCustomers(companyId);
    res.json({ data: { customers } });
  });

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

  router.get('/customers/:customerId', requireAnyPermission('customers:read', 'customers:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const customer = await crmService.getCustomer(companyId, getRouteParam(req.params.customerId));

    if (!customer) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Customer not found' },
      });
      return;
    }

    res.json({ data: { customer } });
  });

  router.patch('/customers/:customerId', requireAnyPermission('customers:write'), async (req, res) => {
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
  });

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

  return router;
}

function handleCrmError(res: import('express').Response, error: unknown) {
  if (error instanceof CrmError) {
    const status =
      error.code === 'NOT_FOUND'
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
