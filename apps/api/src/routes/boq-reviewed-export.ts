import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  BoqReviewedExportService,
  BoqReviewedExportServiceError,
} from '../services/boq-reviewed-export.service.js';
import type { TeamService } from '../services/team.service.js';

const editSchema = z.object({
  boqImportRowId: z.string().uuid(),
  fieldKey: z.enum(['itemCode', 'description', 'unit', 'quantity', 'displayValue']),
  reviewedValue: z.string().trim().max(2000).nullable(),
  reasonNote: z.string().trim().max(500).nullable().optional(),
});

const exportSchema = z.object({
  format: z.enum(['XLSX', 'PDF']),
  mode: z.enum(['DRAFT_PREVIEW', 'REVIEWED_FINAL']).default('DRAFT_PREVIEW'),
  clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
});

type Deps = {
  boqReviewedExportService: BoqReviewedExportService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function toActor(auth: ReturnType<typeof getAuth>) {
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

export function createBoqReviewedExportRouter({
  boqReviewedExportService,
  teamService,
  db,
  jwtSecret,
  authService,
}: Deps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get(
    '/boq-imports/:boqImportId/export-readiness',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const mode =
          String(req.query.mode ?? 'DRAFT_PREVIEW') === 'REVIEWED_FINAL'
            ? 'REVIEWED_FINAL'
            : 'DRAFT_PREVIEW';
        const data = await boqReviewedExportService.getReadiness(
          toActor(getAuth(req)),
          String(req.params.boqImportId),
          mode,
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof BoqReviewedExportServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-reviewed-export]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Readiness failed' } });
      }
    },
  );

  router.post(
    '/boq-imports/:boqImportId/reviewed-edits',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = editSchema.parse(req.body ?? {});
        const data = await boqReviewedExportService.upsertReviewedEdit(
          toActor(getAuth(req)),
          String(req.params.boqImportId),
          body,
        );
        res.status(201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof BoqReviewedExportServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-reviewed-export]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Edit failed' } });
      }
    },
  );

  router.post(
    '/boq-imports/:boqImportId/mark-reviewed',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const data = await boqReviewedExportService.markImportReviewed(
          toActor(getAuth(req)),
          String(req.params.boqImportId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof BoqReviewedExportServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-reviewed-export]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Mark reviewed failed' } });
      }
    },
  );

  router.post(
    '/boq-imports/:boqImportId/exports',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = exportSchema.parse(req.body ?? {});
        const data = await boqReviewedExportService.export(
          toActor(getAuth(req)),
          String(req.params.boqImportId),
          body,
        );
        res.status(data.idempotentReplay ? 200 : 201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof BoqReviewedExportServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-reviewed-export]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Export failed' } });
      }
    },
  );

  return router;
}
