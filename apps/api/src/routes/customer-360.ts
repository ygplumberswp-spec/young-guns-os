import { Router } from 'express';
import { z } from 'zod';
import {
  Customer360Error,
  Customer360Service,
  type Customer360Actor,
} from '../services/customer-360.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const personCreateSchema = z.object({
  firstName: z.string().trim().max(120).nullable().optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
  displayName: z.string().trim().min(1).max(200),
  roleTitle: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal('')),
  phone: z.string().trim().max(40).nullable().optional(),
  mobile: z.string().trim().max(40).nullable().optional(),
  isPrimary: z.boolean().optional(),
  isBillingContact: z.boolean().optional(),
  isSiteContact: z.boolean().optional(),
  emailAllowed: z.boolean().optional(),
  smsAllowed: z.boolean().optional(),
  whatsappAllowed: z.boolean().optional(),
  phoneAllowed: z.boolean().optional(),
  preferredContactMethod: z.string().trim().max(40).nullable().optional(),
  consentStatus: z.string().trim().max(40).optional(),
  consentSource: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  sourceProvider: z.string().trim().max(80).nullable().optional(),
  sourceExternalId: z.string().trim().max(200).nullable().optional(),
  linkedSourceCustomerId: z.string().uuid().nullable().optional(),
});

const personUpdateSchema = personCreateSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
  displayName: z.string().trim().min(1).max(200).optional(),
});

const associateSchema = z.object({
  sourceCustomerId: z.string().uuid(),
  personId: z.string().uuid().nullable().optional(),
  associationRole: z.string().trim().max(80).optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  sourceProvider: z.string().trim().max(80).nullable().optional(),
  sourceExternalId: z.string().trim().max(200).nullable().optional(),
});

type RouterDeps = {
  customer360Service: Customer360Service;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): Customer360Actor {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function paramId(req: import('express').Request, key: string): string {
  const raw = req.params[key];
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof Customer360Error) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'INVALID_STATE'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

export function createCustomer360Router({
  customer360Service,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    '*',
    'customers:read',
    'customers:write',
    'customer_experience:read',
    'customer_experience:write',
    'communications:read',
    'communications:write',
    'communications:manage',
  );
  const requireWrite = requireAnyPermission(
    '*',
    'customers:write',
    'customer_experience:write',
    'communications:write',
    'communications:manage',
  );

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  // Extra role gate: deny Technician/Client even if a permission string was granted.
  router.use((req, res, next) => {
    const role = getAuth(req).roleName;
    if (role === 'Technician' || role === 'Client') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message:
            role === 'Technician'
              ? 'Technicians cannot open full Customer 360.'
              : 'Clients cannot open internal Customer 360.',
        },
      });
      return;
    }
    next();
  });

  router.get('/customers/:customerId/workspace', requireRead, async (req, res) => {
    try {
      const order = req.query.order === 'oldest' ? 'oldest' : 'newest';
      const limit = Number(req.query.limit ?? 40);
      const offset = Number(req.query.offset ?? 0);
      const workspace = await customer360Service.getWorkspace(
        toActor(req),
        paramId(req, 'customerId'),
        {
          timelineLimit: Number.isFinite(limit) ? limit : 40,
          timelineOffset: Number.isFinite(offset) ? offset : 0,
          timelineOrder: order,
        },
      );
      res.json({
        data: {
          workspace,
          rebuildsCrm: false as const,
          inventsData: false as const,
          destructiveMerge: false as const,
          xeroWrites: false as const,
          technicianClientDenied: true as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.get('/customers/:customerId/people', requireRead, async (req, res) => {
    try {
      const people = await customer360Service.listPeople(toActor(req), paramId(req, 'customerId'));
      res.json({ data: { people } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/customers/:customerId/people', requireWrite, async (req, res) => {
    try {
      const parsed = personCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const person = await customer360Service.createPerson(
        toActor(req),
        paramId(req, 'customerId'),
        {
          ...parsed.data,
          email: parsed.data.email === '' ? null : parsed.data.email,
        },
      );
      res.status(201).json({ data: { person } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.patch('/customers/:customerId/people/:personId', requireWrite, async (req, res) => {
    try {
      const parsed = personUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const person = await customer360Service.updatePerson(
        toActor(req),
        paramId(req, 'customerId'),
        paramId(req, 'personId'),
        {
          ...parsed.data,
          email: parsed.data.email === '' ? null : parsed.data.email,
        },
      );
      res.json({ data: { person } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.get('/customers/:customerId/associations', requireRead, async (req, res) => {
    try {
      const associations = await customer360Service.listAssociations(
        toActor(req),
        paramId(req, 'customerId'),
      );
      res.json({ data: { associations } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/customers/:customerId/associations', requireWrite, async (req, res) => {
    try {
      const parsed = associateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const association = await customer360Service.associateSource(
        toActor(req),
        paramId(req, 'customerId'),
        parsed.data,
      );
      res.status(201).json({ data: { association } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.delete(
    '/customers/:customerId/associations/:associationId',
    requireWrite,
    async (req, res) => {
      try {
        const result = await customer360Service.removeAssociation(
          toActor(req),
          paramId(req, 'customerId'),
          paramId(req, 'associationId'),
        );
        res.json({ data: result });
      } catch (error) {
        if (!handleError(res, error)) nextError(res, error);
      }
    },
  );

  return router;
}

function nextError(res: import('express').Response, error: unknown) {
  console.error('[customer-360]', error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Customer 360 request failed.' } });
}
