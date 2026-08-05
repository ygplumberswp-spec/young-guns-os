import { Router } from 'express';
import { z } from 'zod';
import type { ReportExportService } from '../services/report-export.service.js';
import { ReportExportError } from '../services/report-export.service.js';
import type { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import type { DatabaseClient } from '@titan/db';
import type { TeamService } from '../services/team.service.js';
import {
  createPortalAuthMiddleware,
  requirePortalPermission,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';

const optionalAudienceQuery = z
  .union([z.string(), z.array(z.string())])
  .optional();

type StaffRouterDeps = {
  reportExportService: ReportExportService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: AuthService;
};

type PortalRouterDeps = {
  reportExportService: ReportExportService;
  jwtSecret: string;
  portalAuthService: PortalAuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function staffPrincipal(auth: AuthenticatedRequest['auth']) {
  return {
    kind: 'staff' as const,
    actor: {
      companyId: auth.companyId,
      userId: auth.userId,
      roleName: auth.roleName,
      permissions: auth.permissions,
      sessionId: auth.sessionId,
    },
  };
}

function portalPrincipal(auth: PortalAuthenticatedRequest['portalAuth']) {
  return {
    kind: 'portal' as const,
    actor: {
      portalUserId: auth.portalUserId,
      companyId: auth.companyId,
      customerId: auth.customerId,
      permissions: auth.permissions,
      sessionId: auth.sessionId,
    },
  };
}

function parseAudienceQuery(req: import('express').Request): unknown {
  const parsed = optionalAudienceQuery.safeParse(req.query.audience);
  return parsed.success ? parsed.data : req.query.audience;
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
            : error.code === 'INVALID_AUDIENCE'
              ? 400
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

/** Staff-authenticated operational report exports. Technicians permitted with server-forced audience. */
export function createReportExportRouter({
  reportExportService,
  jwtSecret,
  authService,
}: StaffRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get(
    '/jobs/:jobId/pdf',
    requireAnyPermission('documents:read', 'jobs:read', 'jobs:write', 'mobile:read'),
    async (req, res) => {
      const auth = getAuth(req);
      const jobId = routeParam(req.params.jobId);
      try {
        const result = await reportExportService.exportJobReportPdf(
          staffPrincipal(auth),
          jobId,
          parseAudienceQuery(req),
        );
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/jobs/:jobId/service/pdf',
    requireAnyPermission('documents:read', 'jobs:read', 'jobs:write', 'mobile:read'),
    async (req, res) => {
      const auth = getAuth(req);
      const jobId = routeParam(req.params.jobId);
      try {
        const result = await reportExportService.exportServiceReportPdf(
          staffPrincipal(auth),
          jobId,
          parseAudienceQuery(req),
        );
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/completion/:reportId/pdf',
    requireAnyPermission('documents:read', 'jobs:read', 'mobile:read'),
    async (req, res) => {
      const auth = getAuth(req);
      const reportId = routeParam(req.params.reportId);
      try {
        const result = await reportExportService.exportCompletionReportPdf(
          staffPrincipal(auth),
          reportId,
          parseAudienceQuery(req),
        );
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/maintenance/runs/:runId/pdf',
    requireAnyPermission('documents:read', 'jobs:read', 'asset_equipment:read', 'ops:read', 'mobile:read'),
    async (req, res) => {
      const auth = getAuth(req);
      const runId = routeParam(req.params.runId);
      try {
        const result = await reportExportService.exportMaintenanceRunPdf(
          staffPrincipal(auth),
          runId,
          parseAudienceQuery(req),
        );
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  return router;
}

/** Client Portal report exports — always client-safe; audience query ignored. */
export function createPortalReportExportRouter({
  reportExportService,
  jwtSecret,
  portalAuthService,
}: PortalRouterDeps): Router {
  const router = Router();
  const requirePortalAuth = createPortalAuthMiddleware({ jwtSecret, portalAuthService });

  router.use(requirePortalAuth);

  router.get(
    '/jobs/:jobId/pdf',
    requirePortalPermission('portal.jobs:read'),
    async (req, res) => {
      const portalAuth = (req as PortalAuthenticatedRequest).portalAuth;
      const jobId = routeParam(req.params.jobId);
      try {
        const result = await reportExportService.exportJobReportPdf(
          portalPrincipal(portalAuth),
          jobId,
          parseAudienceQuery(req),
        );
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/jobs/:jobId/service/pdf',
    requirePortalPermission('portal.jobs:read'),
    async (req, res) => {
      const portalAuth = (req as PortalAuthenticatedRequest).portalAuth;
      const jobId = routeParam(req.params.jobId);
      try {
        const result = await reportExportService.exportServiceReportPdf(
          portalPrincipal(portalAuth),
          jobId,
          parseAudienceQuery(req),
        );
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/completion/:reportId/pdf',
    requirePortalPermission('portal.documents:read', 'portal.jobs:read'),
    async (req, res) => {
      const portalAuth = (req as PortalAuthenticatedRequest).portalAuth;
      const reportId = routeParam(req.params.reportId);
      try {
        const result = await reportExportService.exportCompletionReportPdf(
          portalPrincipal(portalAuth),
          reportId,
          parseAudienceQuery(req),
        );
        sendPdf(res, result);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  return router;
}
