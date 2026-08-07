import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseDataMigrationService } from '../services/enterprise-data-migration.service.js';
import { EnterpriseDataMigrationError } from '../services/enterprise-data-migration.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const sourceFormatSchema = z.enum(['csv', 'excel', 'json', 'xml']);
const entityTypeSchema = z.enum([
  'customer',
  'lead',
  'supplier',
  'contact',
  'property',
  'asset',
  'vehicle',
  'technician',
  'job',
  'quote',
  'invoice',
  'payment',
  'inventory',
  'price_book',
  'purchase_order',
  'document',
  'knowledge_article',
  'user',
  'role',
  'settings',
]);
const duplicateActionSchema = z.enum(['merge', 'skip', 'replace', 'create_new']);
const historicalDocMatchActionSchema = z.enum([
  'LINK',
  'CHOOSE_DIFFERENT',
  'CREATE_HISTORICAL_RECORD',
  'SKIP',
]);

const platformConfigSchema = z.object({
  importPolicy: z.record(z.unknown()).optional(),
  exportPolicy: z.record(z.unknown()).optional(),
  validationPolicy: z.record(z.unknown()).optional(),
  duplicatePolicy: z.record(z.unknown()).optional(),
  rollbackPolicy: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const importJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sourceFormat: sourceFormatSchema,
  entityType: entityTypeSchema,
});

const uploadFileSchema = z.object({
  fileName: z.string().trim().min(1).max(500),
  fileContent: z.string().min(1),
});

const fieldMappingsSchema = z.object({
  mappings: z.record(z.string()),
  manualOverrides: z.array(z.string()).optional(),
});

const duplicateResolveSchema = z.object({
  duplicateReviewId: z.string().uuid(),
  action: duplicateActionSchema,
});

const proposeHistoricalDocMatchSchema = z.object({
  fileName: z.string().trim().min(1).max(500),
  customerName: z.string().trim().max(300).nullable().optional(),
  amountCents: z.number().int().nullable().optional(),
  issuedAt: z.string().trim().max(100).nullable().optional(),
});

const resolveHistoricalDocMatchSchema = z.object({
  matchId: z.string().uuid(),
  action: historicalDocMatchActionSchema,
  targetEntityType: z.string().trim().max(100).nullable().optional(),
  targetEntityId: z.string().uuid().nullable().optional(),
});

const exportJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  exportScope: z.string().trim().max(100).optional(),
  entityType: entityTypeSchema.optional(),
  sourceFormat: sourceFormatSchema.optional(),
  filters: z.record(z.unknown()).optional(),
  scheduleCron: z.string().trim().max(200).optional(),
  isScheduled: z.boolean().optional(),
});

const rollbackSchema = z.object({
  importJobId: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseDataMigrationService: EnterpriseDataMigrationService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function getRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseDataMigrationError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR' || error.code === 'APPROVAL_REQUIRED'
          ? 400
          : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseDataMigrationRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requireRead = requireAnyPermission(
    'data_migration:read',
    'data_migration:manage',
    'integrations:read',
  );
  const requireWrite = requireAnyPermission(
    'data_migration:write',
    'data_migration:manage',
    'integrations:manage',
  );
  const requireManage = requireAnyPermission('data_migration:manage', 'integrations:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await deps.enterpriseDataMigrationService.getDashboard(
        getAuth(req).companyId,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const platformConfig = await deps.enterpriseDataMigrationService.getPlatformConfig(
        getAuth(req).companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    try {
      const input = platformConfigSchema.parse(req.body);
      const platformConfig = await deps.enterpriseDataMigrationService.updatePlatformConfig(
        staffScope(req),
        input,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/import-jobs', requireRead, async (req, res) => {
    try {
      const importJobs = await deps.enterpriseDataMigrationService.listImportJobs(
        getAuth(req).companyId,
      );
      res.json({ data: { importJobs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/import-jobs', requireWrite, async (req, res) => {
    try {
      const input = importJobSchema.parse(req.body);
      const importJob = await deps.enterpriseDataMigrationService.createImportJob(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { importJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/import-jobs/:id', requireRead, async (req, res) => {
    try {
      const importJob = await deps.enterpriseDataMigrationService.getImportJobDetail(
        getAuth(req).companyId,
        getRouteParam(req.params.id),
      );
      res.json({ data: { importJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/import-jobs/:id/upload', requireWrite, async (req, res) => {
    try {
      const input = uploadFileSchema.parse(req.body);
      const importJob = await deps.enterpriseDataMigrationService.uploadImportFile(
        staffScope(req),
        getRouteParam(req.params.id),
        input,
      );
      res.json({ data: { importJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/import-jobs/:id/auto-map', requireWrite, async (req, res) => {
    try {
      const importJob = await deps.enterpriseDataMigrationService.autoMapFields(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { importJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/import-jobs/:id/mappings', requireWrite, async (req, res) => {
    try {
      const input = fieldMappingsSchema.parse(req.body);
      const importJob = await deps.enterpriseDataMigrationService.updateFieldMappings(
        staffScope(req),
        getRouteParam(req.params.id),
        input,
      );
      res.json({ data: { importJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/import-jobs/:id/validate', requireWrite, async (req, res) => {
    try {
      const importJob = await deps.enterpriseDataMigrationService.validateImportJob(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { importJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/import-jobs/:id/submit', requireWrite, async (req, res) => {
    try {
      const importJob = await deps.enterpriseDataMigrationService.submitImportForApproval(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { importJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/import-jobs/:id/approve', requireManage, async (req, res) => {
    try {
      const importJob = await deps.enterpriseDataMigrationService.approveImportJob(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { importJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/import-jobs/:id/execute', requireManage, async (req, res) => {
    try {
      const importJob = await deps.enterpriseDataMigrationService.executeImportJob(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { importJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/duplicate-reviews/resolve', requireWrite, async (req, res) => {
    try {
      const input = duplicateResolveSchema.parse(req.body);
      const duplicateReview = await deps.enterpriseDataMigrationService.resolveDuplicate(
        staffScope(req),
        input,
      );
      res.json({ data: { duplicateReview } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/historical-document-matches/propose', requireWrite, async (req, res) => {
    try {
      const input = proposeHistoricalDocMatchSchema.parse(req.body);
      const proposal = await deps.enterpriseDataMigrationService.proposeHistoricalDocumentMatch(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { proposal } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/historical-document-matches/resolve', requireWrite, async (req, res) => {
    try {
      const input = resolveHistoricalDocMatchSchema.parse(req.body);
      const resolution = await deps.enterpriseDataMigrationService.resolveHistoricalDocumentMatch(
        staffScope(req),
        input,
      );
      res.json({ data: { resolution } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/export-jobs', requireRead, async (req, res) => {
    try {
      const exportJobs = await deps.enterpriseDataMigrationService.listExportJobs(
        getAuth(req).companyId,
      );
      res.json({ data: { exportJobs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/export-jobs', requireWrite, async (req, res) => {
    try {
      const input = exportJobSchema.parse(req.body);
      const exportJob = await deps.enterpriseDataMigrationService.createExportJob(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { exportJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/export-jobs/:id/execute', requireWrite, async (req, res) => {
    try {
      const exportJob = await deps.enterpriseDataMigrationService.executeExportJob(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { exportJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/migration-history', requireRead, async (req, res) => {
    try {
      const migrationHistory = await deps.enterpriseDataMigrationService.listMigrationHistory(
        getAuth(req).companyId,
      );
      res.json({ data: { migrationHistory } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/rollback-requests', requireRead, async (req, res) => {
    try {
      const rollbackRequests = await deps.enterpriseDataMigrationService.listRollbackRequests(
        getAuth(req).companyId,
      );
      res.json({ data: { rollbackRequests } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/rollback-requests', requireManage, async (req, res) => {
    try {
      const input = rollbackSchema.parse(req.body);
      const rollbackRequest = await deps.enterpriseDataMigrationService.createRollbackRequest(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { rollbackRequest } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/rollback-requests/:id/approve', requireManage, async (req, res) => {
    try {
      const rollbackRequest = await deps.enterpriseDataMigrationService.approveRollbackRequest(
        staffScope(req),
        getRouteParam(req.params.id),
      );
      res.json({ data: { rollbackRequest } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/migration-alerts', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const migrationAlerts = await deps.enterpriseDataMigrationService.listMigrationAlerts(
        getAuth(req).companyId,
        {
          status,
        },
      );
      res.json({ data: { migrationAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/migration-alerts/sync', requireWrite, async (req, res) => {
    try {
      const migrationAlerts = await deps.enterpriseDataMigrationService.syncMigrationAlerts(
        staffScope(req),
      );
      res.json({ data: { migrationAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseDataMigrationService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/action-drafts', requireRead, async (req, res) => {
    try {
      const actionDrafts = await deps.enterpriseDataMigrationService.listActionDrafts(
        getAuth(req).companyId,
      );
      res.json({ data: { actionDrafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    try {
      const input = actionDraftSchema.parse(req.body);
      const actionDraft = await deps.enterpriseDataMigrationService.createActionDraft(
        staffScope(req),
        input,
      );
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auditLogs = await deps.enterpriseDataMigrationService.listAuditLogs(
        getAuth(req).companyId,
      );
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
