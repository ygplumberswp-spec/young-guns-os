import { Router } from 'express';
import { z } from 'zod';
import type { DocumentsService } from '../services/documents.service.js';
import { DocumentsError } from '../services/documents.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
});

const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).optional().nullable(),
  fileName: z.string().trim().min(1).max(500),
  fileType: z.string().trim().max(200).optional().nullable(),
  fileSizeBytes: z.number().int().nonnegative().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
});

const updateDocumentSchema = createDocumentSchema.partial();

type DocumentsRouterDeps = {
  documentsService: DocumentsService;
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

export function createDocumentsRouter({
  documentsService,
  teamService,
  jwtSecret,
  authService,
}: DocumentsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/stats',
    requireAnyPermission('documents:read', 'documents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const stats = await documentsService.getStats(companyId);
      res.json({ data: stats });
    },
  );

  router.get(
    '/categories',
    requireAnyPermission('documents:read', 'documents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const categories = await documentsService.listCategories(companyId);
      res.json({ data: { categories } });
    },
  );

  router.post('/categories', requireAnyPermission('documents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = createCategorySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid category payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const category = await documentsService.createCategory(companyId, parsed.data);
      res.status(201).json({ data: { category } });
    } catch (error) {
      handleDocumentsError(res, error);
    }
  });

  router.get(
    '/documents',
    requireAnyPermission('documents:read', 'documents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const documents = await documentsService.listDocuments(companyId);
      res.json({ data: { documents } });
    },
  );

  router.post('/documents', requireAnyPermission('documents:write'), async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const parsed = createDocumentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid document payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const document = await documentsService.createDocument({ companyId, userId }, parsed.data);
      res.status(201).json({ data: { document } });
    } catch (error) {
      handleDocumentsError(res, error);
    }
  });

  router.get(
    '/documents/:id',
    requireAnyPermission('documents:read', 'documents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const document = await documentsService.getDocument(companyId, getRouteParam(req.params.id));

      if (!document) {
        res.status(404).json({
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found',
          },
        });
        return;
      }

      res.json({ data: { document } });
    },
  );

  router.patch('/documents/:id', requireAnyPermission('documents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = updateDocumentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid document payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const document = await documentsService.updateDocument(
        companyId,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.json({ data: { document } });
    } catch (error) {
      handleDocumentsError(res, error);
    }
  });

  return router;
}

function handleDocumentsError(res: import('express').Response, error: unknown) {
  if (error instanceof DocumentsError) {
    const status =
      error.code === 'DOCUMENT_NOT_FOUND' ||
      error.code === 'CUSTOMER_NOT_FOUND' ||
      error.code === 'JOB_NOT_FOUND' ||
      error.code === 'CATEGORY_NOT_FOUND'
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
