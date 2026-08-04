import { Router } from 'express';
import { z } from 'zod';
import type { JobDocumentPackService } from '../services/job-document-pack.service.js';
import { JobDocumentPackError } from '../services/job-document-pack.service.js';
import type { TeamService } from '../services/team.service.js';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';

const itemSchema = z.object({
  documentId: z.string().uuid(),
  itemType: z
    .enum([
      'job_document',
      'quotation',
      'invoice',
      'certificate',
      'compliance_report',
      'photo_evidence',
    ])
    .optional(),
  label: z.string().trim().max(500).optional().nullable(),
});

const createPackSchema = z.object({
  jobId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(5000).optional().nullable(),
  deliveryChannel: z.enum(['portal', 'email', 'whatsapp']).optional(),
  items: z.array(itemSchema).optional(),
  clientActionId: z.string().trim().max(200).optional().nullable(),
});

const updatePackSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  deliveryChannel: z.enum(['portal', 'email', 'whatsapp']).optional(),
  items: z.array(itemSchema).min(1).optional(),
});

const sendPackSchema = z.object({
  clientActionId: z.string().trim().min(1).max(200),
});

type JobDocumentPackRouterDeps = {
  jobDocumentPackService: JobDocumentPackService;
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

function handlePackError(res: import('express').Response, error: unknown) {
  if (error instanceof JobDocumentPackError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'SEND_PATH_NOT_IMPLEMENTED'
          ? 501
          : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createJobDocumentPackRouter({
  jobDocumentPackService,
  teamService,
  db,
  jwtSecret,
  authService,
}: JobDocumentPackRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/', requireAnyPermission('documents:read', 'documents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const packs = await jobDocumentPackService.listPacks(companyId, {
      jobId: stringQuery(req.query.jobId),
    });
    res.json({ data: { packs } });
  });

  router.get('/:id', requireAnyPermission('documents:read', 'documents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const pack = await jobDocumentPackService.getPack(companyId, routeParam(req.params.id));
    if (!pack) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job document pack not found' } });
      return;
    }
    res.json({ data: { pack } });
  });

  router.post('/', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createPackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid pack payload' } });
      return;
    }
    try {
      const pack = await jobDocumentPackService.createPack(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { pack } });
    } catch (error) {
      handlePackError(res, error);
    }
  });

  router.patch('/:id', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = updatePackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid pack payload' } });
      return;
    }
    try {
      const pack = await jobDocumentPackService.updatePack(
        { companyId: auth.companyId, userId: auth.userId },
        routeParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { pack } });
    } catch (error) {
      handlePackError(res, error);
    }
  });

  router.post('/:id/approve', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const pack = await jobDocumentPackService.advanceApproval(
        { companyId: auth.companyId, userId: auth.userId },
        routeParam(req.params.id),
      );
      res.json({ data: { pack } });
    } catch (error) {
      handlePackError(res, error);
    }
  });

  router.post('/:id/send', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = sendPackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid send payload' } });
      return;
    }
    try {
      const pack = await jobDocumentPackService.sendPack(
        { companyId: auth.companyId, userId: auth.userId },
        routeParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { pack } });
    } catch (error) {
      handlePackError(res, error);
    }
  });

  return router;
}
