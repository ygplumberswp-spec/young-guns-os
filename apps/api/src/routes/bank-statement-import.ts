import { Router } from 'express';
import { z } from 'zod';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { TeamService } from '../services/team.service.js';
import type { DatabaseClient } from '@titan/db';
import {
  BankStatementImportError,
  BankStatementImportService,
} from '../services/bank-statement-import.service.js';
import type { BankStatementStorageService } from '../services/bank-statement-storage.service.js';

const columnMappingSchema = z.object({
  date: z.string().trim().min(1),
  amount: z.string().trim().min(1),
  description: z.string().trim().optional(),
  reference: z.string().trim().optional(),
});

const previewSchema = z.object({
  bankAccountCode: z.string().trim().min(1).max(40),
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(120),
  contentBase64: z.string().trim().min(1),
  columnMapping: columnMappingSchema.optional(),
});

const detectHeadersSchema = z.object({
  contentBase64: z.string().trim().min(1),
});

type RouterDeps = {
  bankStatementImportService: BankStatementImportService;
  teamService: TeamService;
  db: DatabaseClient;
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

function handleError(res: import('express').Response, error: unknown): boolean {
  if (error instanceof BankStatementImportError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  return false;
}

function paramId(req: import('express').Request): string {
  const raw = req.params.id;
  return String(Array.isArray(raw) ? raw[0] : raw ?? '');
}

export function createBankStatementImportRouter({
  bankStatementImportService,
  teamService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireRead = requireAnyPermission('finance:read', 'finance:write', '*');
  const requireWrite = requireAnyPermission('finance:write', '*');

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/bank-accounts', requireRead, async (req, res) => {
    try {
      const { companyId } = getAuth(req);
      const accounts = await bankStatementImportService.listBankAccounts(companyId);
      res.json({ data: { accounts } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/detect-headers', requireWrite, async (req, res) => {
    try {
      const parsed = detectHeadersSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid detect-headers payload.' },
        });
        return;
      }
      const content = Buffer.from(parsed.data.contentBase64, 'base64').toString('utf8');
      const result = bankStatementImportService.detectHeaders(content);
      res.json({ data: result });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/preview', requireWrite, async (req, res) => {
    try {
      const parsed = previewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid preview payload.' },
        });
        return;
      }

      const content = Buffer.from(parsed.data.contentBase64, 'base64');
      const preview = await bankStatementImportService.createPreview(toActor(req), {
        bankAccountCode: parsed.data.bankAccountCode,
        filename: parsed.data.filename,
        mimeType: parsed.data.mimeType,
        content,
        columnMapping: parsed.data.columnMapping,
      });
      res.status(201).json({ data: { preview } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.get('/batches/:id', requireRead, async (req, res) => {
    try {
      const preview = await bankStatementImportService.getBatch(toActor(req), paramId(req));
      res.json({ data: { preview } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/batches/:id/approve', requireWrite, async (req, res) => {
    try {
      const preview = await bankStatementImportService.approveBatch(toActor(req), paramId(req));
      res.json({ data: { preview } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  router.post('/batches/:id/revert', requireWrite, async (req, res) => {
    try {
      const preview = await bankStatementImportService.revertBatch(toActor(req), paramId(req));
      res.json({ data: { preview } });
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });

  return router;
}

export type { BankStatementStorageService };
