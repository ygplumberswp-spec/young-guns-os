import { Router } from 'express';
import { z } from 'zod';
import type { BoqService } from '../services/boq.service.js';
import { BoqError } from '../services/boq.service.js';
import type { TeamService } from '../services/team.service.js';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';

const lineSchema = z.object({
  section: z.string().trim().max(200).optional().nullable(),
  itemNumber: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().min(1).max(2000),
  unit: z.string().trim().max(50).optional().nullable(),
  quantity: z.number().positive(),
  unitCostCents: z.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const createBoqSchema = z.object({
  title: z.string().trim().min(1).max(200),
  customerId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  sourceFilename: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  lineItems: z.array(lineSchema).min(1),
  clientActionId: z.string().trim().max(200).optional().nullable(),
});

const updateBoqSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['draft', 'in_review', 'approved', 'converted', 'cancelled']).optional(),
  customerId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  lineItems: z.array(lineSchema).min(1).optional(),
});

const convertSchema = z.object({
  clientActionId: z.string().trim().min(1).max(200),
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
  markupBps: z.number().int().min(0).max(100000).optional(),
});

type BoqRouterDeps = {
  boqService: BoqService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function stringQuery(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function handleBoqError(res: import('express').Response, error: unknown) {
  if (error instanceof BoqError) {
    const status = error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createBoqRouter({
  boqService,
  teamService,
  db,
  jwtSecret,
  authService,
}: BoqRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const documents = await boqService.listDocuments(companyId, {
      q: stringQuery(req.query.q),
      status: stringQuery(req.query.status),
    });
    res.json({ data: { documents } });
  });

  router.post('/', requireAnyPermission('finance:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createBoqSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid BOQ payload' } });
      return;
    }
    try {
      const document = await boqService.createDocument(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { document } });
    } catch (error) {
      handleBoqError(res, error);
    }
  });

  router.get('/:id', requireAnyPermission('finance:read', 'finance:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const document = await boqService.getDocument(companyId, routeParam(req.params.id));
    if (!document) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'BOQ document not found' } });
      return;
    }
    res.json({ data: { document } });
  });

  router.patch('/:id', requireAnyPermission('finance:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = updateBoqSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid BOQ update' } });
      return;
    }
    try {
      const document = await boqService.updateDocument(
        { companyId: auth.companyId, userId: auth.userId },
        routeParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { document } });
    } catch (error) {
      handleBoqError(res, error);
    }
  });

  router.post('/:id/convert-to-quote', requireAnyPermission('finance:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = convertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid convert payload' } });
      return;
    }
    try {
      const quote = await boqService.convertToQuote(
        { companyId: auth.companyId, userId: auth.userId },
        routeParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { quote } });
    } catch (error) {
      handleBoqError(res, error);
    }
  });

  return router;
}
