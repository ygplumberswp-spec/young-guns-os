import { Router } from 'express';
import { z } from 'zod';
import type { ReportExportService } from '../services/report-export.service.js';
import { ReportExportError } from '../services/report-export.service.js';
import type { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { createDenyTechnicianFromOwnerModules } from '../middleware/authorization-guards.js';
import type { DatabaseClient } from '@titan/db';
import type { TeamService } from '../services/team.service.js';

const audienceSchema = z.enum(['internal', 'client', 'technician']).default('internal');

type RouterDeps = {
  reportExportService: ReportExportService;
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

function toActor(auth: AuthenticatedRequest['auth']) {
  return {
    companyId: auth.companyId,
    userId: auth.userId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof ReportExportError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'CHROMIUM_UNAVAILABLE'
            ? 503
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

function sendPdf(res: import('express').Response, result: { buffer: Buffer; filename: string }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
  res.send(result.buffer);
}

export function createReportExportRouter({
  reportExportService,
  teamService: _teamService,
  db,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);

  router.use(requireAuth);

  router.get(
    '/jobs/:jobId/pdf',
    denyTechnician,
    requireAnyPermission('documents:read', 'jobs:read', 'jobs:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const jobId = routeParam(req.params.jobId);
      const audience = audienceSchema.parse(req.query.audience ?? 'internal');
      try {
        const result = await reportExportService.exportJobReportPdf(toActor(auth), jobId, audience);
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/jobs/:jobId/service/pdf',
    denyTechnician,
    requireAnyPermission('documents:read', 'jobs:read', 'jobs:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const jobId = routeParam(req.params.jobId);
      const audience = audienceSchema.parse(req.query.audience ?? 'internal');
      try {
        const result = await reportExportService.exportServiceReportPdf(toActor(auth), jobId, audience);
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/completion/:reportId/pdf',
    denyTechnician,
    requireAnyPermission('documents:read', 'jobs:read'),
    async (req, res) => {
      const auth = getAuth(req);
      const reportId = routeParam(req.params.reportId);
      const audience = audienceSchema.parse(req.query.audience ?? 'client');
      try {
        const result = await reportExportService.exportCompletionReportPdf(
          toActor(auth),
          reportId,
          audience,
        );
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/maintenance/runs/:runId/pdf',
    denyTechnician,
    requireAnyPermission('documents:read', 'jobs:read', 'asset_equipment:read', 'ops:read'),
    async (req, res) => {
      const auth = getAuth(req);
      const runId = routeParam(req.params.runId);
      try {
        const result = await reportExportService.exportMaintenanceRunPdf(toActor(auth), runId);
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  return router;
}
