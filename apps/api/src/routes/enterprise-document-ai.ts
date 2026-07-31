import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseDocumentAiService } from '../services/enterprise-document-ai.service.js';
import { EnterpriseDocumentAiError } from '../services/enterprise-document-ai.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const classificationKeySchema = z.enum([
  'customer_document',
  'job_document',
  'quote',
  'invoice',
  'purchase_order',
  'supplier_invoice',
  'delivery_note',
  'compliance_certificate',
  'inspection_report',
  'asset_record',
  'warranty',
  'technical_manual',
  'employment_document',
  'contract',
  'other',
]);

const platformConfigSchema = z.object({
  ocrPolicy: z.record(z.unknown()).optional(),
  classificationPolicy: z.record(z.unknown()).optional(),
  extractionPolicy: z.record(z.unknown()).optional(),
  reviewPolicy: z.record(z.unknown()).optional(),
  searchPolicy: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const ocrProviderSchema = z.object({
  providerKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const sourceConfigSchema = z.object({
  sourceKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const ocrJobSchema = z.object({
  documentId: z.string().uuid(),
  providerKey: z.string().trim().max(200).optional(),
  sourceKey: z.string().trim().max(200).optional(),
});

const ocrResultSchema = z.object({
  ocrJobId: z.string().uuid(),
  documentId: z.string().uuid(),
  extractedText: z.string().optional(),
  confidenceScore: z.number().optional(),
  pageCount: z.number().int().optional(),
  languageCode: z.string().trim().max(20).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const classificationSchema = z.object({
  documentId: z.string().uuid(),
  classificationKey: classificationKeySchema,
  confidenceScore: z.number().optional(),
  manuallyCorrected: z.boolean().optional(),
});

const extractionTemplateSchema = z.object({
  templateKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  classificationKey: classificationKeySchema.optional(),
  fieldSchema: z.record(z.unknown()).optional(),
});

const extractionRecordSchema = z.object({
  documentId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  extractedFields: z.record(z.unknown()).optional(),
  confidenceScore: z.number().optional(),
});

const matchingRecordSchema = z.object({
  documentId: z.string().uuid(),
  entityType: z.string().trim().min(1).max(100),
  entityId: z.string().uuid().optional(),
  confidenceScore: z.number().optional(),
  requiresReview: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const reviewQueueSchema = z.object({
  documentId: z.string().uuid(),
  reviewType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  assignedUserId: z.string().uuid().optional(),
  context: z.record(z.unknown()).optional(),
});

const reviewUpdateSchema = z.object({
  status: z.enum(['approved', 'corrected', 'rejected', 'reprocess', 'in_review']),
  notes: z.string().trim().max(5000).optional(),
  assignedUserId: z.string().uuid().optional(),
});

const intelligenceSchema = z.object({
  documentId: z.string().uuid(),
  intelligenceType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const workflowDraftSchema = z.object({
  documentId: z.string().uuid().optional(),
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  approvalRequired: z.boolean().optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  classificationKey: classificationKeySchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

type RouterDeps = {
  enterpriseDocumentAiService: EnterpriseDocumentAiService;
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
  if (error instanceof EnterpriseDocumentAiError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR' || error.code === 'FORBIDDEN'
          ? 400
          : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseDocumentAiRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requireRead = requireAnyPermission(
    'document_ai:read',
    'document_ai:manage',
    'documents:read',
    'knowledge:read',
  );
  const requireWrite = requireAnyPermission(
    'document_ai:write',
    'document_ai:manage',
    'documents:write',
  );
  const requireManage = requireAnyPermission('document_ai:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseDocumentAiService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseDocumentAiService.getPlatformConfig(
        auth.companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterpriseDocumentAiService.updatePlatformConfig(
        staffScope(req),
        parsed.data,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ocr-providers', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const ocrProviders = await deps.enterpriseDocumentAiService.listOcrProviders(auth.companyId);
      res.json({ data: { ocrProviders } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/ocr-providers', requireWrite, async (req, res) => {
    const parsed = ocrProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid OCR provider' } });
      return;
    }
    try {
      const ocrProvider = await deps.enterpriseDocumentAiService.createOcrProvider(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { ocrProvider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/sources', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const sourceConfigs = await deps.enterpriseDocumentAiService.listSourceConfigs(
        auth.companyId,
      );
      res.json({ data: { sourceConfigs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/sources', requireWrite, async (req, res) => {
    const parsed = sourceConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid source config' } });
      return;
    }
    try {
      const sourceConfig = await deps.enterpriseDocumentAiService.createSourceConfig(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { sourceConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ocr-jobs', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const ocrJobs = await deps.enterpriseDocumentAiService.listOcrJobs(
        auth.companyId,
        status ? { status } : undefined,
      );
      res.json({ data: { ocrJobs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/ocr-jobs', requireWrite, async (req, res) => {
    const parsed = ocrJobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid OCR job' } });
      return;
    }
    try {
      const ocrJob = await deps.enterpriseDocumentAiService.createOcrJob(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { ocrJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/ocr-results', requireWrite, async (req, res) => {
    const parsed = ocrResultSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid OCR result' } });
      return;
    }
    try {
      const ocrResult = await deps.enterpriseDocumentAiService.recordOcrResult(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { ocrResult } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/classifications', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const [classifications, classificationCatalog] = await Promise.all([
        deps.enterpriseDocumentAiService.listClassifications(auth.companyId),
        deps.enterpriseDocumentAiService.listClassificationCatalog(auth.companyId),
      ]);
      res.json({ data: { classifications, classificationCatalog } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/classifications', requireWrite, async (req, res) => {
    const parsed = classificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid classification' } });
      return;
    }
    try {
      const classification = await deps.enterpriseDocumentAiService.createClassification(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { classification } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/extraction-templates', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const extractionTemplates = await deps.enterpriseDocumentAiService.listExtractionTemplates(
        auth.companyId,
      );
      res.json({ data: { extractionTemplates } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/extraction-templates', requireWrite, async (req, res) => {
    const parsed = extractionTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid extraction template' } });
      return;
    }
    try {
      const extractionTemplate = await deps.enterpriseDocumentAiService.createExtractionTemplate(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { extractionTemplate } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/extractions', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const extractionRecords = await deps.enterpriseDocumentAiService.listExtractionRecords(
        auth.companyId,
      );
      res.json({ data: { extractionRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/extractions', requireWrite, async (req, res) => {
    const parsed = extractionRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid extraction record' } });
      return;
    }
    try {
      const extractionRecord = await deps.enterpriseDocumentAiService.createExtractionRecord(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { extractionRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/matching-records', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const matchingRecords = await deps.enterpriseDocumentAiService.listMatchingRecords(
        auth.companyId,
      );
      res.json({ data: { matchingRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/matching-records', requireWrite, async (req, res) => {
    const parsed = matchingRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid matching record' } });
      return;
    }
    try {
      const matchingRecord = await deps.enterpriseDocumentAiService.createMatchingRecord(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { matchingRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/review-queue', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const reviewQueue = await deps.enterpriseDocumentAiService.listReviewQueue(
        auth.companyId,
        status ? { status } : undefined,
      );
      res.json({ data: { reviewQueue } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/review-queue', requireWrite, async (req, res) => {
    const parsed = reviewQueueSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid review queue item' } });
      return;
    }
    try {
      const reviewItem = await deps.enterpriseDocumentAiService.createReviewQueueItem(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { reviewItem } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/review-queue/:reviewItemId', requireWrite, async (req, res) => {
    const parsed = reviewUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid review update' } });
      return;
    }
    try {
      const reviewItem = await deps.enterpriseDocumentAiService.updateReviewQueueItem(
        staffScope(req),
        getRouteParam(req.params.reviewItemId),
        parsed.data,
      );
      res.json({ data: { reviewItem } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/intelligence', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const intelligenceRecords = await deps.enterpriseDocumentAiService.listIntelligenceRecords(
        auth.companyId,
      );
      res.json({ data: { intelligenceRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/intelligence', requireWrite, async (req, res) => {
    const parsed = intelligenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid intelligence record' } });
      return;
    }
    try {
      const intelligenceRecord = await deps.enterpriseDocumentAiService.createIntelligenceRecord(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { intelligenceRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/workflow-drafts', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const workflowDrafts = await deps.enterpriseDocumentAiService.listWorkflowDrafts(
        auth.companyId,
      );
      res.json({ data: { workflowDrafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/workflow-drafts', requireWrite, async (req, res) => {
    const parsed = workflowDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid workflow draft' } });
      return;
    }
    try {
      const workflowDraft = await deps.enterpriseDocumentAiService.createWorkflowDraft(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { workflowDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/search', requireRead, async (req, res) => {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid search request' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const results = await deps.enterpriseDocumentAiService.searchDocuments(
        auth.companyId,
        parsed.data,
      );
      res.json({ data: { results } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/document-alerts', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const documentAlerts = await deps.enterpriseDocumentAiService.listDocumentAlerts(
        auth.companyId,
      );
      res.json({ data: { documentAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/document-alerts/sync', requireWrite, async (req, res) => {
    try {
      const documentAlerts = await deps.enterpriseDocumentAiService.syncDocumentAlerts(
        staffScope(req),
      );
      res.json({ data: { documentAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseDocumentAiService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/action-drafts', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const actionDrafts = await deps.enterpriseDocumentAiService.listActionDrafts(auth.companyId);
      res.json({ data: { actionDrafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    const parsed = actionDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action draft' } });
      return;
    }
    try {
      const actionDraft = await deps.enterpriseDocumentAiService.createActionDraft(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const auditLogs = await deps.enterpriseDocumentAiService.listAuditLogs(auth.companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
