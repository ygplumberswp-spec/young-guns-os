import { Router } from 'express';
import { z } from 'zod';
import { COMPLETION_REPORT_SECTION_IDS } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import type { CompletionReportService } from '../services/completion-report.service.js';
import { CompletionReportError } from '../services/completion-report.service.js';
import type { TeamService } from '../services/team.service.js';
import type { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';

const sectionEnum = z.enum(
  COMPLETION_REPORT_SECTION_IDS as unknown as [string, ...string[]],
);

const createSchema = z.object({
  jobId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  includedSections: z.array(sectionEnum).optional(),
  clientActionId: z.string().trim().max(200).optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  includedSections: z.array(sectionEnum).min(1).optional(),
});

const prepareEmailSchema = z.object({
  to: z.array(z.string().email()).optional(),
  subject: z.string().trim().max(500).optional(),
  bodyText: z.string().trim().max(10000).optional(),
  clientActionId: z.string().trim().max(200).optional().nullable(),
});

type RouterDeps = {
  completionReportService: CompletionReportService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: AuthService;
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

function toActor(auth: AuthenticatedRequest['auth']) {
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof CompletionReportError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'NOT_CONFIGURED'
          ? 503
          : error.code === 'FORBIDDEN'
            ? 403
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createCompletionReportRouter({
  completionReportService,
  teamService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
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
    '/preview',
    requireAnyPermission('documents:read', 'documents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const jobId = stringQuery(req.query.jobId);
      if (!jobId) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'jobId query parameter is required' },
        });
        return;
      }
      try {
        const preview = await completionReportService.previewForJob(companyId, jobId);
        res.json({ data: { preview } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get('/', requireAnyPermission('documents:read', 'documents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const reports = await completionReportService.listReports(companyId, {
      jobId: stringQuery(req.query.jobId),
    });
    res.json({ data: { reports } });
  });

  router.get('/:id', requireAnyPermission('documents:read', 'documents:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const report = await completionReportService.getReport(companyId, routeParam(req.params.id));
    if (!report) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Completion report not found' } });
      return;
    }
    res.json({ data: { report } });
  });

  router.get(
    '/:id/html',
    requireAnyPermission('documents:read', 'documents:write'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const report = await completionReportService.getReport(companyId, routeParam(req.params.id));
      if (!report) {
        res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: 'Completion report not found' } });
        return;
      }
      if (!report.htmlBody) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Report HTML not generated yet' },
        });
        return;
      }
      res.type('text/html').send(report.htmlBody);
    },
  );

  router.post('/', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid report payload' } });
      return;
    }
    try {
      const report = await completionReportService.createReport(toActor(auth), {
        ...parsed.data,
        includedSections: parsed.data.includedSections as
          | import('@titan/shared').CompletionReportSectionId[]
          | undefined,
      });
      res.status(201).json({ data: { report } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.patch('/:id', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid report payload' } });
      return;
    }
    try {
      const report = await completionReportService.updateReport(
        toActor(auth),
        routeParam(req.params.id),
        {
          ...parsed.data,
          includedSections: parsed.data.includedSections as
            | import('@titan/shared').CompletionReportSectionId[]
            | undefined,
        },
      );
      res.json({ data: { report } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/:id/generate', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const report = await completionReportService.generateReport(
        toActor(auth),
        routeParam(req.params.id),
      );
      res.json({ data: { report } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/:id/ready', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const report = await completionReportService.markReadyToSend(
        toActor(auth),
        routeParam(req.params.id),
      );
      res.json({ data: { report } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/:id/prepare-email', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = prepareEmailSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid email payload' } });
      return;
    }
    try {
      const result = await completionReportService.prepareEmailDraft(
        toActor(auth),
        routeParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: { emailDraft: result } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/:id/timeline-note', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const report = await completionReportService.addTimelineNote(
        toActor(auth),
        routeParam(req.params.id),
      );
      res.status(201).json({ data: { report } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/:id/cancel', requireAnyPermission('documents:write'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const report = await completionReportService.cancelReport(
        toActor(auth),
        routeParam(req.params.id),
      );
      res.json({ data: { report } });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}
