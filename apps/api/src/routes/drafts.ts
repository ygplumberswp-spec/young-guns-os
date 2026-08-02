import { Router } from 'express';
import { z } from 'zod';
import { hasAnyPermission } from '@titan/auth';
import type { DraftRecordType } from '@titan/shared';
import { DRAFT_RECORD_TYPES, permissionsForDraftType } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import type { TeamService } from '../services/team.service.js';
import {
  DraftAutosaveError,
  DraftAutosaveService,
} from '../services/draft-autosave.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';

const upsertSchema = z.object({
  recordType: z.enum(DRAFT_RECORD_TYPES),
  recordId: z.string().uuid().optional().nullable(),
  draftKey: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().max(300).optional().nullable(),
  customerLabel: z.string().trim().max(300).optional().nullable(),
  completionPct: z.number().int().min(0).max(100).optional().nullable(),
  payload: z.record(z.unknown()),
});

const duplicateSchema = z.object({
  title: z.string().trim().max(300).optional().nullable(),
});

type DraftRouterDeps = {
  draftAutosaveService: DraftAutosaveService;
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

function canAccessDraftType(permissions: string[], recordType: DraftRecordType): boolean {
  const required = permissionsForDraftType(recordType);
  return hasAnyPermission(permissions, [...required, '*']);
}

function canAccessOtherUsersDrafts(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['*']);
}

function assertDraftOwnership(
  auth: { userId: string; permissions: string[] },
  draft: { userId: string },
): boolean {
  return draft.userId === auth.userId || canAccessOtherUsersDrafts(auth.permissions);
}

function handleDraftError(res: import('express').Response, error: unknown) {
  if (error instanceof DraftAutosaveError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createDraftsRouter({
  draftAutosaveService,
  teamService,
  db,
  jwtSecret,
  authService,
}: DraftRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/', async (req, res) => {
    const auth = getAuth(req);
    const recordType = stringQuery(req.query.recordType) as DraftRecordType | undefined;
    if (recordType && !canAccessDraftType(auth.permissions, recordType)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }

    const drafts = await draftAutosaveService.listDrafts(auth.companyId, {
      status: (stringQuery(req.query.status) as 'active' | 'archived' | undefined) ?? 'active',
      recordType,
      // Default to the caller’s drafts — company-wide listing requires platform/owner *.
      userId: canAccessOtherUsersDrafts(auth.permissions) ? undefined : auth.userId,
    });

    const filtered = drafts.filter(
      (draft) =>
        canAccessDraftType(auth.permissions, draft.recordType) &&
        assertDraftOwnership(auth, draft),
    );
    res.json({ data: { drafts: filtered } });
  });

  router.get('/by-key/:draftKey', async (req, res) => {
    const auth = getAuth(req);
    const draftKey = decodeURIComponent(routeParam(req.params.draftKey));
    const draft = await draftAutosaveService.getDraftByKey(auth.companyId, draftKey);
    if (!draft) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Draft not found' } });
      return;
    }
    if (!canAccessDraftType(auth.permissions, draft.recordType) || !assertDraftOwnership(auth, draft)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }
    res.json({ data: { draft } });
  });

  router.get('/:id', async (req, res) => {
    const auth = getAuth(req);
    const draft = await draftAutosaveService.getDraft(auth.companyId, routeParam(req.params.id));
    if (!draft) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Draft not found' } });
      return;
    }
    if (!canAccessDraftType(auth.permissions, draft.recordType) || !assertDraftOwnership(auth, draft)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }
    res.json({ data: { draft } });
  });

  router.put('/upsert', async (req, res) => {
    const auth = getAuth(req);
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid draft payload' } });
      return;
    }
    if (!canAccessDraftType(auth.permissions, parsed.data.recordType)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }

    try {
      const draft = await draftAutosaveService.upsertDraft(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      await draftAutosaveService.touchAudit(
        { companyId: auth.companyId, userId: auth.userId },
        'upsert',
        draft.id,
      );
      res.json({ data: { draft } });
    } catch (error) {
      handleDraftError(res, error);
    }
  });

  router.post('/:id/duplicate', async (req, res) => {
    const auth = getAuth(req);
    const parsed = duplicateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid duplicate payload' } });
      return;
    }

    const source = await draftAutosaveService.getDraft(auth.companyId, routeParam(req.params.id));
    if (!source) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Draft not found' } });
      return;
    }
    if (
      !canAccessDraftType(auth.permissions, source.recordType) ||
      !assertDraftOwnership(auth, source)
    ) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }

    try {
      const draft = await draftAutosaveService.duplicateDraft(
        { companyId: auth.companyId, userId: auth.userId },
        routeParam(req.params.id),
        parsed.data,
      );
      await draftAutosaveService.touchAudit(
        { companyId: auth.companyId, userId: auth.userId },
        'duplicate',
        draft.id,
      );
      res.status(201).json({ data: { draft } });
    } catch (error) {
      handleDraftError(res, error);
    }
  });

  router.post('/:id/archive', async (req, res) => {
    const auth = getAuth(req);
    const existing = await draftAutosaveService.getDraft(auth.companyId, routeParam(req.params.id));
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Draft not found' } });
      return;
    }
    if (
      !canAccessDraftType(auth.permissions, existing.recordType) ||
      !assertDraftOwnership(auth, existing)
    ) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }

    try {
      const draft = await draftAutosaveService.archiveDraft(
        { companyId: auth.companyId, userId: auth.userId },
        routeParam(req.params.id),
      );
      await draftAutosaveService.touchAudit(
        { companyId: auth.companyId, userId: auth.userId },
        'archive',
        draft.id,
      );
      res.json({ data: { draft } });
    } catch (error) {
      handleDraftError(res, error);
    }
  });

  router.delete('/:id', async (req, res) => {
    const auth = getAuth(req);
    const existing = await draftAutosaveService.getDraft(auth.companyId, routeParam(req.params.id));
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Draft not found' } });
      return;
    }
    if (
      !canAccessDraftType(auth.permissions, existing.recordType) ||
      !assertDraftOwnership(auth, existing)
    ) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }

    try {
      await draftAutosaveService.deleteDraft(
        { companyId: auth.companyId, userId: auth.userId },
        routeParam(req.params.id),
      );
      await draftAutosaveService.touchAudit(
        { companyId: auth.companyId, userId: auth.userId },
        'delete',
        routeParam(req.params.id),
      );
      res.status(204).send();
    } catch (error) {
      handleDraftError(res, error);
    }
  });

  return router;
}
