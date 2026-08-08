import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import {
  BoqWorkbookImportService,
  BoqWorkbookImportServiceError,
} from '../services/boq-workbook-import.service.js';
import type { TeamService } from '../services/team.service.js';

const importSchema = z.object({
  originalFilename: z.string().trim().min(1).max(260),
  /** Base64-encoded workbook bytes (xlsx). */
  contentBase64: z.string().min(1),
  revisionLabel: z.string().trim().max(80).nullable().optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  clientActionId: z.string().trim().min(1).max(120).nullable().optional(),
  storageKey: z.string().trim().max(500).nullable().optional(),
  mimeType: z.string().trim().max(120).nullable().optional(),
});

type Deps = {
  boqWorkbookImportService: BoqWorkbookImportService;
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

export function createBoqWorkbookImportRouter({
  boqWorkbookImportService,
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
    '/boq-imports',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await boqWorkbookImportService.list(toActor(getAuth(req)));
        res.json({ data });
      } catch (error) {
        if (error instanceof BoqWorkbookImportServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-workbook-import]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'BOQ import list failed' } });
      }
    },
  );

  router.get(
    '/boq-imports/:importId',
    requireAnyPermission('finance:read', 'finance:write', '*'),
    async (req, res) => {
      try {
        const data = await boqWorkbookImportService.get(
          toActor(getAuth(req)),
          String(req.params.importId),
        );
        res.json({ data });
      } catch (error) {
        if (error instanceof BoqWorkbookImportServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-workbook-import]', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'BOQ import get failed' } });
      }
    },
  );

  router.post(
    '/boq-imports',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      try {
        const body = importSchema.parse(req.body ?? {});
        const bytes = Buffer.from(body.contentBase64, 'base64');
        if (bytes.length === 0) {
          res.status(400).json({ error: { code: 'EMPTY_FILE', message: 'Workbook content empty' } });
          return;
        }
        if (bytes.length > 15 * 1024 * 1024) {
          res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: 'Max 15MB workbook' } });
          return;
        }
        const data = await boqWorkbookImportService.importWorkbook(toActor(getAuth(req)), {
          originalFilename: body.originalFilename,
          bytes,
          revisionLabel: body.revisionLabel,
          sourceDocumentId: body.sourceDocumentId,
          clientActionId: body.clientActionId,
          storageKey: body.storageKey,
          mimeType: body.mimeType,
        });
        res.status(data.idempotentReplay ? 200 : 201).json({ data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
          return;
        }
        if (error instanceof BoqWorkbookImportServiceError) {
          res.status(error.status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        console.error('[boq-workbook-import]', error);
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: 'BOQ workbook import failed' },
        });
      }
    },
  );

  return router;
}
