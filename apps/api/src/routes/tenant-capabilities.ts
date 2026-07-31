import type { CreateCapabilityProposalRequest } from '@titan/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { TenantCapabilityBuilderService } from '../services/tenant-capability-builder.service.js';
import { TenantCapabilityBuilderError } from '../services/tenant-capability-builder.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { applyStaffOwnerGuards } from '../middleware/staff-owner-guard.js';

type RouterDeps = {
  tenantCapabilityBuilderService: TenantCapabilityBuilderService;
  db: import('@titan/db').DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

const discoverSchema = z.object({
  description: z.string().trim().min(8).max(4000),
  answers: z.record(z.string()).optional(),
});

const createSchema = discoverSchema.extend({
  duplicateResolution: z.enum(['extend_existing', 'create_separate', 'cancel']).optional(),
  extendAgentKey: z.string().optional(),
  extendCapabilityId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  department: z.string().trim().min(2).max(64).optional(),
  purpose: z.string().trim().min(8).max(4000).optional(),
  dataAccess: z.array(z.string()).optional(),
  allowedLowRiskActions: z.boolean().optional(),
  roleScope: z.array(z.string()).optional(),
});

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createTenantCapabilitiesRouter({
  tenantCapabilityBuilderService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission('agents:read', 'agents:write', 'agents:manage', '*');
  const requireWrite = requireAnyPermission('agents:write', 'agents:manage', '*');

  router.use(requireAuth);
  applyStaffOwnerGuards(router, db);

  router.get('/', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const capabilities = await tenantCapabilityBuilderService.listCapabilities(companyId);
    res.json({ data: { capabilities } });
  });

  router.post('/discover', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = discoverSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid discovery request' } });
      return;
    }
    try {
      const discovery = await tenantCapabilityBuilderService.discover(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.json({ data: { discovery } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/proposals', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid proposal request' } });
      return;
    }
    try {
      const capability = await tenantCapabilityBuilderService.createProposal(
        { companyId: auth.companyId, userId: auth.userId },
        {
          ...parsed.data,
          extendAgentKey: parsed.data
            .extendAgentKey as CreateCapabilityProposalRequest['extendAgentKey'],
        },
      );
      res.status(201).json({ data: { capability } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/:id', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const capability = await tenantCapabilityBuilderService.getCapability(
      companyId,
      getRouteParam(req.params.id),
    );
    if (!capability) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Capability not found' } });
      return;
    }
    res.json({ data: { capability } });
  });

  router.patch('/:id/proposal', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update request' } });
      return;
    }
    try {
      const capability = await tenantCapabilityBuilderService.updateProposal(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { capability } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/:id/test', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    try {
      const result = await tenantCapabilityBuilderService.testCapability(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: result });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/:id/activate', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    try {
      const capability = await tenantCapabilityBuilderService.activateCapability(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: { capability } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/:id/disable', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    try {
      const capability = await tenantCapabilityBuilderService.disableCapability(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: { capability } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/:id/archive', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    try {
      const capability = await tenantCapabilityBuilderService.archiveCapability(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.id),
      );
      res.json({ data: { capability } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/:id/versions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const versions = await tenantCapabilityBuilderService.listVersions(
      companyId,
      getRouteParam(req.params.id),
    );
    res.json({ data: { versions } });
  });

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof TenantCapabilityBuilderError) {
    res.status(400).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}
