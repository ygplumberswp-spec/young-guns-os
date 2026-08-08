import { Router } from 'express';
import { z } from 'zod';
import {
  EquipmentAssetsImportError,
  EquipmentAssetsImportService,
} from '../services/equipment-assets-import.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const sourceRowSchema = z.object({
  sourceProvider: z.string().trim().min(1).max(80),
  sourceExternalId: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  equipmentType: z.string().trim().max(100).nullable().optional(),
  manufacturer: z.string().trim().max(200).nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  serialNumber: z.string().trim().max(200).nullable().optional(),
  status: z.string().trim().max(80).nullable().optional(),
  installationDate: z.string().trim().max(40).nullable().optional(),
  commissioningDate: z.string().trim().max(40).nullable().optional(),
  warrantyExpiresAt: z.string().trim().max(40).nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().max(200).nullable().optional(),
  customerEmail: z.string().trim().max(200).nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  propertyName: z.string().trim().max(200).nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  jobNumber: z.string().trim().max(80).nullable().optional(),
  documentIds: z.array(z.string().uuid()).optional(),
  sourceOccurredAt: z.string().trim().max(40).nullable().optional(),
  mappingAssetId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const previewSchema = z.object({
  sources: z.array(sourceRowSchema).max(5000).optional(),
});

type RouterDeps = {
  equipmentAssetsImportService: EquipmentAssetsImportService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(req: import('express').Request) {
  const auth = getAuth(req);
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function toSourceRecords(body: z.infer<typeof previewSchema>) {
  return (body.sources ?? []).map((row) => ({
    sourceProvider: row.sourceProvider,
    sourceExternalId: row.sourceExternalId ?? null,
    name: row.name ?? null,
    equipmentType: row.equipmentType ?? null,
    manufacturer: row.manufacturer ?? null,
    model: row.model ?? null,
    serialNumber: row.serialNumber ?? null,
    status: row.status ?? null,
    installationDate: row.installationDate ?? null,
    commissioningDate: row.commissioningDate ?? null,
    warrantyExpiresAt: row.warrantyExpiresAt ?? null,
    customerId: row.customerId ?? null,
    customerName: row.customerName ?? null,
    customerEmail: row.customerEmail ?? null,
    propertyId: row.propertyId ?? null,
    propertyName: row.propertyName ?? null,
    jobId: row.jobId ?? null,
    jobNumber: row.jobNumber ?? null,
    documentIds: row.documentIds ?? [],
    sourceOccurredAt: row.sourceOccurredAt ?? null,
    mappingAssetId: row.mappingAssetId ?? null,
    notes: row.notes ?? null,
  }));
}

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof EquipmentAssetsImportError) {
    const status =
      error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

function nextError(res: import('express').Response, error: unknown) {
  console.error('[equipment-assets-import]', error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}

export function createEquipmentAssetsImportRouter({
  equipmentAssetsImportService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireRead = requireAnyPermission(
    '*',
    'asset_equipment:read',
    'asset_equipment:write',
    'fleet:read',
  );
  const requireWrite = requireAnyPermission('*', 'asset_equipment:write', 'fleet:write');

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    try {
      await teamService.ensureDefaultRoles(getAuth(req).companyId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.use((req, res, next) => {
    const role = getAuth(req).roleName;
    if (role === 'Technician' || role === 'Client') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message:
            role === 'Technician'
              ? 'Technicians cannot open the unrestricted equipment import queue.'
              : 'Clients cannot access internal equipment import reconciliation.',
        },
      });
      return;
    }
    next();
  });

  router.get('/inventory', requireRead, async (req, res) => {
    try {
      const discovered = await equipmentAssetsImportService.discoverSourceRecords(
        getAuth(req).companyId,
      );
      res.json({
        data: {
          ...discovered,
          xeroWrites: 0 as const,
          productionWrites: 0 as const,
          inventsData: false as const,
          row87Started: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/preview', requireRead, async (req, res) => {
    try {
      const parsed = previewSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid equipment preview payload' },
        });
        return;
      }
      const result = await equipmentAssetsImportService.preview(
        toActor(req),
        toSourceRecords(parsed.data),
      );
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/apply', requireWrite, async (req, res) => {
    try {
      const parsed = previewSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid equipment apply payload' },
        });
        return;
      }
      const result = await equipmentAssetsImportService.applySafeMatches(
        toActor(req),
        toSourceRecords(parsed.data),
      );
      res.json({
        data: {
          ...result,
          autoMerge: false as const,
          inventsData: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.post('/apply-idempotent-retry', requireWrite, async (req, res) => {
    try {
      const parsed = previewSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid equipment apply payload' },
        });
        return;
      }
      const counts = await equipmentAssetsImportService.applyIdempotentRetry(
        toActor(req),
        toSourceRecords(parsed.data),
      );
      res.json({
        data: {
          secondPass: counts,
          duplicateEquipment: 0 as const,
          xeroWrites: 0 as const,
          productionWrites: 0 as const,
          row87Started: false as const,
        },
      });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.get('/reviews', requireRead, async (req, res) => {
    try {
      const reviews = await equipmentAssetsImportService.listOpenReviews(toActor(req));
      res.json({ data: { reviews } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  router.get('/search', requireRead, async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const results = await equipmentAssetsImportService.searchEquipment(toActor(req), q);
      res.json({ data: { results, q } });
    } catch (error) {
      if (!handleError(res, error)) nextError(res, error);
    }
  });

  return router;
}
