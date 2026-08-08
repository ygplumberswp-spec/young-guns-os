import { Router } from 'express';
import { z } from 'zod';
import {
  PropertySite360Error,
  PropertySite360Service,
  type PropertySite360Actor,
} from '../services/property-site-360.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const propertyCreateSchema = z.object({
  customerId: z.string().uuid(),
  propertyName: z.string().trim().min(1).max(300),
  addressLine1: z.string().trim().max(300).nullable().optional(),
  addressLine2: z.string().trim().max(300).nullable().optional(),
  suburb: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  province: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(40).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  unitNumber: z.string().trim().max(80).nullable().optional(),
  accessInstructions: z.string().trim().max(5000).nullable().optional(),
  siteNotes: z.string().trim().max(5000).nullable().optional(),
  isPrimary: z.boolean().optional(),
  forceCreate: z.boolean().optional(),
});

const propertyUpdateSchema = z.object({
  propertyName: z.string().trim().min(1).max(300).optional(),
  addressLine1: z.string().trim().max(300).nullable().optional(),
  addressLine2: z.string().trim().max(300).nullable().optional(),
  suburb: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  province: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(40).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  unitNumber: z.string().trim().max(80).nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  accessInstructions: z.string().trim().max(5000).nullable().optional(),
  siteNotes: z.string().trim().max(5000).nullable().optional(),
  isPrimary: z.boolean().optional(),
});

const duplicateCheckSchema = z.object({
  customerId: z.string().uuid(),
  propertyName: z.string().trim().min(1).max(300),
  addressLine1: z.string().trim().max(300).nullable().optional(),
  suburb: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(40).nullable().optional(),
});

const siteContactSchema = z.object({
  personId: z.string().uuid(),
  role: z.enum(['primary', 'project', 'access', 'other']).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const equipmentLinkSchema = z.object({
  assetId: z.string().uuid(),
});

type RouterDeps = {
  propertySite360Service: PropertySite360Service;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request): PropertySite360Actor {
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
  if (error instanceof PropertySite360Error) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'DUPLICATE_REVIEW'
            ? 409
            : error.code === 'INVALID_STATE' || error.code === 'SNAPSHOT_MUTATION'
              ? 409
              : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

function nextError(res: import('express').Response, error: unknown) {
  console.error('[property-site-360]', error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}

export function createPropertySite360Router({
  propertySite360Service,
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
    'jobs:read',
    'jobs:write',
  );
  const requireWrite = requireAnyPermission(
    '*',
    'customers:write',
    'customer_experience:write',
    'jobs:write',
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

  // Deny Technician/Client even if a permission string was granted.
  router.use((req, res, next) => {
    const role = getAuth(req).roleName;
    if (role === 'Technician' || role === 'Client') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message:
            role === 'Technician'
              ? 'Technicians cannot open unrestricted Property 360 — use assigned job field site details.'
              : 'Clients cannot open internal Property 360.',
        },
      });
      return;
    }
    next();
  });

  router.get('/properties/search', requireRead, async (req, res) => {
    try {
      const result = await propertySite360Service.search(toActor(req), {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
        status:
          req.query.status === 'active' ||
          req.query.status === 'inactive' ||
          req.query.status === 'archived'
            ? req.query.status
            : undefined,
        limit: Number(req.query.limit ?? 25),
        offset: Number(req.query.offset ?? 0),
      });
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/properties/duplicate-check', requireRead, async (req, res) => {
    try {
      const parsed = duplicateCheckSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const warning = await propertySite360Service.checkDuplicateWarning(toActor(req), parsed.data);
      res.json({
        data: {
          warning,
          autoMerge: false as const,
          row85: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/properties', requireWrite, async (req, res) => {
    try {
      const parsed = propertyCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const property = await propertySite360Service.createProperty(toActor(req), parsed.data);
      res.status(201).json({ data: { property } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.get('/properties/:propertyId/workspace', requireRead, async (req, res) => {
    try {
      const order = req.query.order === 'oldest' ? 'oldest' : 'newest';
      const workspace = await propertySite360Service.getWorkspace(
        toActor(req),
        paramId(req, 'propertyId'),
        {
          activityLimit: Number(req.query.limit ?? 40),
          activityOffset: Number(req.query.offset ?? 0),
          activityOrder: order,
        },
      );
      res.json({
        data: {
          workspace,
          rebuildsProperties: false as const,
          inventsData: false as const,
          parallelAssetRegistry: false as const,
          jobSnapshotsImmutable: true as const,
          xeroWrites: false as const,
          technicianClientDenied: true as const,
          row85: false as const,
          row86: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.get('/properties/:propertyId/snapshots', requireRead, async (req, res) => {
    try {
      const snapshots = await propertySite360Service.getJobSnapshots(
        toActor(req),
        paramId(req, 'propertyId'),
      );
      res.json({ data: { snapshots, immutable: true as const } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.patch('/properties/:propertyId', requireWrite, async (req, res) => {
    try {
      const parsed = propertyUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const property = await propertySite360Service.updateProperty(
        toActor(req),
        paramId(req, 'propertyId'),
        parsed.data,
      );
      res.json({ data: { property, jobSnapshotsImmutable: true as const } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/properties/:propertyId/archive', requireWrite, async (req, res) => {
    try {
      const result = await propertySite360Service.archiveProperty(
        toActor(req),
        paramId(req, 'propertyId'),
      );
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/properties/:propertyId/site-contacts', requireWrite, async (req, res) => {
    try {
      const parsed = siteContactSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const contact = await propertySite360Service.upsertSiteContact(
        toActor(req),
        paramId(req, 'propertyId'),
        parsed.data,
      );
      res.status(201).json({ data: { contact, reusedCustomerPeople: true as const } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.delete(
    '/properties/:propertyId/site-contacts/:contactId',
    requireWrite,
    async (req, res) => {
      try {
        const result = await propertySite360Service.unlinkSiteContact(
          toActor(req),
          paramId(req, 'propertyId'),
          paramId(req, 'contactId'),
        );
        res.json({ data: result });
      } catch (error) {
        if (!handleError(res, error)) nextError(res, error);
      }
    },
  );

  router.post('/properties/:propertyId/equipment-links', requireWrite, async (req, res) => {
    try {
      const parsed = equipmentLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'INVALID', message: parsed.error.message } });
        return;
      }
      const result = await propertySite360Service.linkEquipment(
        toActor(req),
        paramId(req, 'propertyId'),
        parsed.data.assetId,
      );
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.delete(
    '/properties/:propertyId/equipment-links/:assetId',
    requireWrite,
    async (req, res) => {
      try {
        const result = await propertySite360Service.unlinkEquipment(
          toActor(req),
          paramId(req, 'propertyId'),
          paramId(req, 'assetId'),
        );
        res.json({ data: result });
      } catch (error) {
        if (!handleError(res, error)) nextError(res, error);
      }
    },
  );

  return router;
}
