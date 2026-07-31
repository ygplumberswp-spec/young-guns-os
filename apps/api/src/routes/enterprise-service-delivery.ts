import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseServiceDeliveryService } from '../services/enterprise-service-delivery.service.js';
import { EnterpriseServiceDeliveryError } from '../services/enterprise-service-delivery.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  serviceStandards: z.record(z.unknown()).optional(),
  promiseTemplates: z.record(z.unknown()).optional(),
  slaTemplates: z.record(z.unknown()).optional(),
  inspectionTemplates: z.record(z.unknown()).optional(),
  qualityStandards: z.record(z.unknown()).optional(),
  warrantyStandards: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const servicePromiseSchema = z.object({
  jobId: z.string().uuid().optional(),
  promiseType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  promisedAt: z.string().optional(),
  dueAt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const slaFrameworkSchema = z.object({
  name: z.string().trim().min(1).max(200),
  frameworkKey: z.string().trim().min(1).max(100),
  slaType: z.string().trim().min(1).max(100),
  targetMinutes: z.number().int().optional(),
  warningThresholdMinutes: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
});

const slaRecordSchema = z.object({
  jobId: z.string().uuid().optional(),
  frameworkId: z.string().uuid().optional(),
  slaType: z.string().trim().min(1).max(100),
  targetAt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const inspectionTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  templateKey: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  checklist: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const inspectionSchema = z.object({
  jobId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  findings: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const qaInspectionSchema = z.object({
  jobId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
  qaScore: z.number().optional(),
  notes: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const defectSchema = z.object({
  jobId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
  defectType: z.string().trim().min(1).max(100),
  severity: z.string().trim().max(50).optional(),
  description: z.string().trim().min(1).max(5000),
  config: z.record(z.unknown()).optional(),
});

const nonConformanceSchema = z.object({
  jobId: z.string().uuid().optional(),
  defectId: z.string().uuid().optional(),
  ncNumber: z.string().trim().max(100).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const correctiveActionSchema = z.object({
  jobId: z.string().uuid().optional(),
  nonConformanceId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  actionType: z.string().trim().min(1).max(100),
  assignedUserId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const preventiveActionSchema = z.object({
  correctiveActionId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  assignedUserId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const firstTimeFixSchema = z.object({
  jobId: z.string().uuid(),
  technicianUserId: z.string().uuid().optional(),
  fixedFirstTime: z.boolean().optional(),
  rootCause: z.string().trim().max(2000).optional(),
  analysis: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const customerAcceptanceSchema = z.object({
  jobId: z.string().uuid(),
  customerId: z.string().uuid(),
  signatureRef: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const warrantyRecordSchema = z.object({
  jobId: z.string().uuid(),
  customerId: z.string().uuid(),
  warrantyType: z.string().trim().min(1).max(100),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  terms: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const warrantyClaimSchema = z.object({
  warrantyRecordId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  claimNumber: z.string().trim().max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const callbackRecordSchema = z.object({
  jobId: z.string().uuid().optional(),
  originalJobId: z.string().uuid().optional(),
  callbackReason: z.string().trim().min(1).max(500),
  assignedUserId: z.string().uuid().optional(),
  scheduledAt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const continuousImprovementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  initiativeKey: z.string().trim().min(1).max(100),
  targetDate: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const handoverRecordSchema = z.object({
  jobId: z.string().uuid(),
  handoverType: z.string().trim().min(1).max(100),
  handedOverByUserId: z.string().uuid().optional(),
  receivedByUserId: z.string().uuid().optional(),
  handoverAt: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const variationRecordSchema = z.object({
  jobId: z.string().uuid(),
  variationType: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(5000),
  config: z.record(z.unknown()).optional(),
});

const completionCertificateSchema = z.object({
  jobId: z.string().uuid(),
  certificateNumber: z.string().trim().max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

const serviceDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseServiceDeliveryService: EnterpriseServiceDeliveryService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  portalAuthService: PortalAuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getPortalAuth(req: import('express').Request) {
  return (req as PortalAuthenticatedRequest).portalAuth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseServiceDeliveryError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT'
          ? 400
          : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseServiceDeliveryRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requirePortalAuth = createPortalAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    portalAuthService: deps.portalAuthService,
  });
  const requireRead = requireAnyPermission(
    'service_delivery:read',
    'service_delivery:manage',
    'jobs:read',
    'quality:read',
  );
  const requireWrite = requireAnyPermission('service_delivery:write', 'service_delivery:manage');
  const requireManage = requireAnyPermission('service_delivery:manage', 'platform:manage');

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseServiceDeliveryService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/service-monitoring', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const serviceMonitoring = await deps.enterpriseServiceDeliveryService.getServiceMonitoring(
        auth.companyId,
      );
      res.json({ data: { serviceMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/portal', requirePortalAuth, async (req, res) => {
    try {
      const portalAuth = getPortalAuth(req);
      const summary = await deps.enterpriseServiceDeliveryService.getPortalServiceSummary(
        portalAuth.companyId,
        portalAuth.customerId,
      );
      res.json({ data: { summary } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseServiceDeliveryService.getPlatformConfig(
        auth.companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterpriseServiceDeliveryService.updatePlatformConfig(
        staffScope(req),
        parsed.data,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/jobs', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const jobs = await deps.enterpriseServiceDeliveryService.listJobs(auth.companyId);
      res.json({ data: { jobs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/quality-comebacks', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const comebacks = await deps.enterpriseServiceDeliveryService.listQualityComebacks(
        auth.companyId,
      );
      res.json({ data: { comebacks } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/quality-warranty-claims', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const warrantyClaims = await deps.enterpriseServiceDeliveryService.listQualityWarrantyClaims(
        auth.companyId,
      );
      res.json({ data: { warrantyClaims } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/dispatch-dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dispatchDashboard = await deps.enterpriseServiceDeliveryService.getDispatchDashboard(
        auth.companyId,
      );
      res.json({ data: { dispatchDashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/service-promises', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const servicePromises = await deps.enterpriseServiceDeliveryService.listServicePromises(
        auth.companyId,
      );
      res.json({ data: { servicePromises } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/service-promises', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = servicePromiseSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid service promises' } });
      return;
    }
    try {
      const servicePromise = await deps.enterpriseServiceDeliveryService.createServicePromise(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { servicePromise } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/service-promises/:servicePromiseId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const servicePromise = await deps.enterpriseServiceDeliveryService.getServicePromise(
          auth.companyId,
          getRouteParam(req.params.servicePromiseId),
        );
        if (!servicePromise) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'ServicePromise not found' } });
          return;
        }
        res.json({ data: { servicePromise } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/service-promises/:servicePromiseId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = servicePromiseSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid service promises update' },
        });
        return;
      }
      try {
        const servicePromise = await deps.enterpriseServiceDeliveryService.updateServicePromise(
          staffScope(req),
          getRouteParam(req.params.servicePromiseId),
          parsed.data,
        );
        res.json({ data: { servicePromise } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/sla-frameworks', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const slaFrameworks = await deps.enterpriseServiceDeliveryService.listSlaFrameworks(
        auth.companyId,
      );
      res.json({ data: { slaFrameworks } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/sla-frameworks', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = slaFrameworkSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sla frameworks' } });
      return;
    }
    try {
      const slaFramework = await deps.enterpriseServiceDeliveryService.createSlaFramework(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { slaFramework } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/sla-frameworks/:slaFrameworkId', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const slaFramework = await deps.enterpriseServiceDeliveryService.getSlaFramework(
        auth.companyId,
        getRouteParam(req.params.slaFrameworkId),
      );
      if (!slaFramework) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SlaFramework not found' } });
        return;
      }
      res.json({ data: { slaFramework } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put(
    '/sla-frameworks/:slaFrameworkId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = slaFrameworkSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sla frameworks update' } });
        return;
      }
      try {
        const slaFramework = await deps.enterpriseServiceDeliveryService.updateSlaFramework(
          staffScope(req),
          getRouteParam(req.params.slaFrameworkId),
          parsed.data,
        );
        res.json({ data: { slaFramework } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/sla-records', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const slaRecords = await deps.enterpriseServiceDeliveryService.listSlaRecords(auth.companyId);
      res.json({ data: { slaRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/sla-records', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = slaRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sla records' } });
      return;
    }
    try {
      const slaRecord = await deps.enterpriseServiceDeliveryService.createSlaRecord(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { slaRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/sla-records/:slaRecordId', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const slaRecord = await deps.enterpriseServiceDeliveryService.getSlaRecord(
        auth.companyId,
        getRouteParam(req.params.slaRecordId),
      );
      if (!slaRecord) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SlaRecord not found' } });
        return;
      }
      res.json({ data: { slaRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/sla-records/:slaRecordId', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = slaRecordSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sla records update' } });
      return;
    }
    try {
      const slaRecord = await deps.enterpriseServiceDeliveryService.updateSlaRecord(
        staffScope(req),
        getRouteParam(req.params.slaRecordId),
        parsed.data,
      );
      res.json({ data: { slaRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/inspection-templates', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const inspectionTemplates =
        await deps.enterpriseServiceDeliveryService.listInspectionTemplates(auth.companyId);
      res.json({ data: { inspectionTemplates } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/inspection-templates', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = inspectionTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid inspection templates' } });
      return;
    }
    try {
      const inspectionTemplate =
        await deps.enterpriseServiceDeliveryService.createInspectionTemplate(
          staffScope(req),
          parsed.data,
        );
      res.status(201).json({ data: { inspectionTemplate } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/inspection-templates/:inspectionTemplateId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const inspectionTemplate =
          await deps.enterpriseServiceDeliveryService.getInspectionTemplate(
            auth.companyId,
            getRouteParam(req.params.inspectionTemplateId),
          );
        if (!inspectionTemplate) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'InspectionTemplate not found' } });
          return;
        }
        res.json({ data: { inspectionTemplate } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/inspection-templates/:inspectionTemplateId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = inspectionTemplateSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid inspection templates update' },
        });
        return;
      }
      try {
        const inspectionTemplate =
          await deps.enterpriseServiceDeliveryService.updateInspectionTemplate(
            staffScope(req),
            getRouteParam(req.params.inspectionTemplateId),
            parsed.data,
          );
        res.json({ data: { inspectionTemplate } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/inspections', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const inspections = await deps.enterpriseServiceDeliveryService.listInspections(
        auth.companyId,
      );
      res.json({ data: { inspections } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/inspections', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = inspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid inspections' } });
      return;
    }
    try {
      const inspection = await deps.enterpriseServiceDeliveryService.createInspection(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { inspection } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/inspections/:inspectionId', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const inspection = await deps.enterpriseServiceDeliveryService.getInspection(
        auth.companyId,
        getRouteParam(req.params.inspectionId),
      );
      if (!inspection) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Inspection not found' } });
        return;
      }
      res.json({ data: { inspection } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/inspections/:inspectionId', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = inspectionSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid inspections update' } });
      return;
    }
    try {
      const inspection = await deps.enterpriseServiceDeliveryService.updateInspection(
        staffScope(req),
        getRouteParam(req.params.inspectionId),
        parsed.data,
      );
      res.json({ data: { inspection } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/qa-inspections', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const qaInspections = await deps.enterpriseServiceDeliveryService.listQaInspections(
        auth.companyId,
      );
      res.json({ data: { qaInspections } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/qa-inspections', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = qaInspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid qa inspections' } });
      return;
    }
    try {
      const qaInspection = await deps.enterpriseServiceDeliveryService.createQaInspection(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { qaInspection } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/qa-inspections/:qaInspectionId', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const qaInspection = await deps.enterpriseServiceDeliveryService.getQaInspection(
        auth.companyId,
        getRouteParam(req.params.qaInspectionId),
      );
      if (!qaInspection) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'QaInspection not found' } });
        return;
      }
      res.json({ data: { qaInspection } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put(
    '/qa-inspections/:qaInspectionId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = qaInspectionSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid qa inspections update' } });
        return;
      }
      try {
        const qaInspection = await deps.enterpriseServiceDeliveryService.updateQaInspection(
          staffScope(req),
          getRouteParam(req.params.qaInspectionId),
          parsed.data,
        );
        res.json({ data: { qaInspection } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/defects', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const defects = await deps.enterpriseServiceDeliveryService.listDefects(auth.companyId);
      res.json({ data: { defects } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/defects', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = defectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid defects' } });
      return;
    }
    try {
      const defect = await deps.enterpriseServiceDeliveryService.createDefect(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { defect } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/defects/:defectId', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const defect = await deps.enterpriseServiceDeliveryService.getDefect(
        auth.companyId,
        getRouteParam(req.params.defectId),
      );
      if (!defect) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Defect not found' } });
        return;
      }
      res.json({ data: { defect } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/defects/:defectId', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = defectSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid defects update' } });
      return;
    }
    try {
      const defect = await deps.enterpriseServiceDeliveryService.updateDefect(
        staffScope(req),
        getRouteParam(req.params.defectId),
        parsed.data,
      );
      res.json({ data: { defect } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/non-conformances', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const nonConformances = await deps.enterpriseServiceDeliveryService.listNonConformances(
        auth.companyId,
      );
      res.json({ data: { nonConformances } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/non-conformances', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = nonConformanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid non conformances' } });
      return;
    }
    try {
      const nonConformance = await deps.enterpriseServiceDeliveryService.createNonConformance(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { nonConformance } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/non-conformances/:nonConformanceId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const nonConformance = await deps.enterpriseServiceDeliveryService.getNonConformance(
          auth.companyId,
          getRouteParam(req.params.nonConformanceId),
        );
        if (!nonConformance) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'NonConformance not found' } });
          return;
        }
        res.json({ data: { nonConformance } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/non-conformances/:nonConformanceId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = nonConformanceSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid non conformances update' },
        });
        return;
      }
      try {
        const nonConformance = await deps.enterpriseServiceDeliveryService.updateNonConformance(
          staffScope(req),
          getRouteParam(req.params.nonConformanceId),
          parsed.data,
        );
        res.json({ data: { nonConformance } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/corrective-actions', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const correctiveActions = await deps.enterpriseServiceDeliveryService.listCorrectiveActions(
        auth.companyId,
      );
      res.json({ data: { correctiveActions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/corrective-actions', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = correctiveActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid corrective actions' } });
      return;
    }
    try {
      const correctiveAction = await deps.enterpriseServiceDeliveryService.createCorrectiveAction(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { correctiveAction } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/corrective-actions/:correctiveActionId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const correctiveAction = await deps.enterpriseServiceDeliveryService.getCorrectiveAction(
          auth.companyId,
          getRouteParam(req.params.correctiveActionId),
        );
        if (!correctiveAction) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'CorrectiveAction not found' } });
          return;
        }
        res.json({ data: { correctiveAction } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/corrective-actions/:correctiveActionId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = correctiveActionSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid corrective actions update' },
        });
        return;
      }
      try {
        const correctiveAction = await deps.enterpriseServiceDeliveryService.updateCorrectiveAction(
          staffScope(req),
          getRouteParam(req.params.correctiveActionId),
          parsed.data,
        );
        res.json({ data: { correctiveAction } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/preventive-actions', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const preventiveActions = await deps.enterpriseServiceDeliveryService.listPreventiveActions(
        auth.companyId,
      );
      res.json({ data: { preventiveActions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/preventive-actions', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = preventiveActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid preventive actions' } });
      return;
    }
    try {
      const preventiveAction = await deps.enterpriseServiceDeliveryService.createPreventiveAction(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { preventiveAction } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/preventive-actions/:preventiveActionId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const preventiveAction = await deps.enterpriseServiceDeliveryService.getPreventiveAction(
          auth.companyId,
          getRouteParam(req.params.preventiveActionId),
        );
        if (!preventiveAction) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'PreventiveAction not found' } });
          return;
        }
        res.json({ data: { preventiveAction } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/preventive-actions/:preventiveActionId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = preventiveActionSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid preventive actions update' },
        });
        return;
      }
      try {
        const preventiveAction = await deps.enterpriseServiceDeliveryService.updatePreventiveAction(
          staffScope(req),
          getRouteParam(req.params.preventiveActionId),
          parsed.data,
        );
        res.json({ data: { preventiveAction } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/first-time-fix-analyses', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const firstTimeFixAnalyses =
        await deps.enterpriseServiceDeliveryService.listFirstTimeFixAnalyses(auth.companyId);
      res.json({ data: { firstTimeFixAnalyses } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/first-time-fix-analyses', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = firstTimeFixSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid first time fix analyses' } });
      return;
    }
    try {
      const firstTimeFixAnalysis =
        await deps.enterpriseServiceDeliveryService.createFirstTimeFixAnalysis(
          staffScope(req),
          parsed.data,
        );
      res.status(201).json({ data: { firstTimeFixAnalysis } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/first-time-fix-analyses/:firstTimeFixAnalysisId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const firstTimeFixAnalysis =
          await deps.enterpriseServiceDeliveryService.getFirstTimeFixAnalysis(
            auth.companyId,
            getRouteParam(req.params.firstTimeFixAnalysisId),
          );
        if (!firstTimeFixAnalysis) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'FirstTimeFixAnalysis not found' } });
          return;
        }
        res.json({ data: { firstTimeFixAnalysis } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/customer-acceptances', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const customerAcceptances =
        await deps.enterpriseServiceDeliveryService.listCustomerAcceptances(auth.companyId);
      res.json({ data: { customerAcceptances } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/customer-acceptances', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = customerAcceptanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid customer acceptances' } });
      return;
    }
    try {
      const customerAcceptance =
        await deps.enterpriseServiceDeliveryService.createCustomerAcceptance(
          staffScope(req),
          parsed.data,
        );
      res.status(201).json({ data: { customerAcceptance } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/customer-acceptances/:customerAcceptanceId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const customerAcceptance =
          await deps.enterpriseServiceDeliveryService.getCustomerAcceptance(
            auth.companyId,
            getRouteParam(req.params.customerAcceptanceId),
          );
        if (!customerAcceptance) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'CustomerAcceptance not found' } });
          return;
        }
        res.json({ data: { customerAcceptance } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/customer-acceptances/:customerAcceptanceId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = customerAcceptanceSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid customer acceptances update' },
        });
        return;
      }
      try {
        const customerAcceptance =
          await deps.enterpriseServiceDeliveryService.updateCustomerAcceptance(
            staffScope(req),
            getRouteParam(req.params.customerAcceptanceId),
            parsed.data,
          );
        res.json({ data: { customerAcceptance } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/warranty-records', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const warrantyRecords = await deps.enterpriseServiceDeliveryService.listWarrantyRecords(
        auth.companyId,
      );
      res.json({ data: { warrantyRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/warranty-records', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = warrantyRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid warranty records' } });
      return;
    }
    try {
      const warrantyRecord = await deps.enterpriseServiceDeliveryService.createWarrantyRecord(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { warrantyRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/warranty-records/:warrantyRecordId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const warrantyRecord = await deps.enterpriseServiceDeliveryService.getWarrantyRecord(
          auth.companyId,
          getRouteParam(req.params.warrantyRecordId),
        );
        if (!warrantyRecord) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'WarrantyRecord not found' } });
          return;
        }
        res.json({ data: { warrantyRecord } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/warranty-records/:warrantyRecordId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = warrantyRecordSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid warranty records update' },
        });
        return;
      }
      try {
        const warrantyRecord = await deps.enterpriseServiceDeliveryService.updateWarrantyRecord(
          staffScope(req),
          getRouteParam(req.params.warrantyRecordId),
          parsed.data,
        );
        res.json({ data: { warrantyRecord } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/warranty-claim-trackings', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const warrantyClaimTrackings =
        await deps.enterpriseServiceDeliveryService.listWarrantyClaimTrackings(auth.companyId);
      res.json({ data: { warrantyClaimTrackings } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/warranty-claim-trackings', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = warrantyClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid warranty claim trackings' } });
      return;
    }
    try {
      const warrantyClaimTracking =
        await deps.enterpriseServiceDeliveryService.createWarrantyClaimTracking(
          staffScope(req),
          parsed.data,
        );
      res.status(201).json({ data: { warrantyClaimTracking } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/warranty-claim-trackings/:warrantyClaimTrackingId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const warrantyClaimTracking =
          await deps.enterpriseServiceDeliveryService.getWarrantyClaimTracking(
            auth.companyId,
            getRouteParam(req.params.warrantyClaimTrackingId),
          );
        if (!warrantyClaimTracking) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'WarrantyClaimTracking not found' } });
          return;
        }
        res.json({ data: { warrantyClaimTracking } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/warranty-claim-trackings/:warrantyClaimTrackingId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = warrantyClaimSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid warranty claim trackings update' },
        });
        return;
      }
      try {
        const warrantyClaimTracking =
          await deps.enterpriseServiceDeliveryService.updateWarrantyClaimTracking(
            staffScope(req),
            getRouteParam(req.params.warrantyClaimTrackingId),
            parsed.data,
          );
        res.json({ data: { warrantyClaimTracking } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/callback-records', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const callbackRecords = await deps.enterpriseServiceDeliveryService.listCallbackRecords(
        auth.companyId,
      );
      res.json({ data: { callbackRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/callback-records', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = callbackRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid callback records' } });
      return;
    }
    try {
      const callbackRecord = await deps.enterpriseServiceDeliveryService.createCallbackRecord(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { callbackRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/callback-records/:callbackRecordId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const callbackRecord = await deps.enterpriseServiceDeliveryService.getCallbackRecord(
          auth.companyId,
          getRouteParam(req.params.callbackRecordId),
        );
        if (!callbackRecord) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'CallbackRecord not found' } });
          return;
        }
        res.json({ data: { callbackRecord } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/callback-records/:callbackRecordId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = callbackRecordSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid callback records update' },
        });
        return;
      }
      try {
        const callbackRecord = await deps.enterpriseServiceDeliveryService.updateCallbackRecord(
          staffScope(req),
          getRouteParam(req.params.callbackRecordId),
          parsed.data,
        );
        res.json({ data: { callbackRecord } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/continuous-improvement-initiatives',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const continuousImprovementInitiatives =
          await deps.enterpriseServiceDeliveryService.listContinuousImprovementInitiatives(
            auth.companyId,
          );
        res.json({ data: { continuousImprovementInitiatives } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/continuous-improvement-initiatives',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = continuousImprovementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid continuous improvement initiatives',
          },
        });
        return;
      }
      try {
        const continuousImprovementInitiative =
          await deps.enterpriseServiceDeliveryService.createContinuousImprovementInitiative(
            staffScope(req),
            parsed.data,
          );
        res.status(201).json({ data: { continuousImprovementInitiative } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/continuous-improvement-initiatives/:continuousImprovementInitiativeId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const continuousImprovementInitiative =
          await deps.enterpriseServiceDeliveryService.getContinuousImprovementInitiative(
            auth.companyId,
            getRouteParam(req.params.continuousImprovementInitiativeId),
          );
        if (!continuousImprovementInitiative) {
          res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'ContinuousImprovementInitiative not found' },
          });
          return;
        }
        res.json({ data: { continuousImprovementInitiative } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/continuous-improvement-initiatives/:continuousImprovementInitiativeId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = continuousImprovementSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid continuous improvement initiatives update',
          },
        });
        return;
      }
      try {
        const continuousImprovementInitiative =
          await deps.enterpriseServiceDeliveryService.updateContinuousImprovementInitiative(
            staffScope(req),
            getRouteParam(req.params.continuousImprovementInitiativeId),
            parsed.data,
          );
        res.json({ data: { continuousImprovementInitiative } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/handover-records', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const handoverRecords = await deps.enterpriseServiceDeliveryService.listHandoverRecords(
        auth.companyId,
      );
      res.json({ data: { handoverRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/handover-records', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = handoverRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid handover records' } });
      return;
    }
    try {
      const handoverRecord = await deps.enterpriseServiceDeliveryService.createHandoverRecord(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { handoverRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/handover-records/:handoverRecordId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const handoverRecord = await deps.enterpriseServiceDeliveryService.getHandoverRecord(
          auth.companyId,
          getRouteParam(req.params.handoverRecordId),
        );
        if (!handoverRecord) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'HandoverRecord not found' } });
          return;
        }
        res.json({ data: { handoverRecord } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/handover-records/:handoverRecordId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = handoverRecordSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid handover records update' },
        });
        return;
      }
      try {
        const handoverRecord = await deps.enterpriseServiceDeliveryService.updateHandoverRecord(
          staffScope(req),
          getRouteParam(req.params.handoverRecordId),
          parsed.data,
        );
        res.json({ data: { handoverRecord } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/variation-records', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const variationRecords = await deps.enterpriseServiceDeliveryService.listVariationRecords(
        auth.companyId,
      );
      res.json({ data: { variationRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/variation-records', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = variationRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid variation records' } });
      return;
    }
    try {
      const variationRecord = await deps.enterpriseServiceDeliveryService.createVariationRecord(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { variationRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/variation-records/:variationRecordId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const variationRecord = await deps.enterpriseServiceDeliveryService.getVariationRecord(
          auth.companyId,
          getRouteParam(req.params.variationRecordId),
        );
        if (!variationRecord) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'VariationRecord not found' } });
          return;
        }
        res.json({ data: { variationRecord } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/variation-records/:variationRecordId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = variationRecordSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid variation records update' },
        });
        return;
      }
      try {
        const variationRecord = await deps.enterpriseServiceDeliveryService.updateVariationRecord(
          staffScope(req),
          getRouteParam(req.params.variationRecordId),
          parsed.data,
        );
        res.json({ data: { variationRecord } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/completion-certificates', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const completionCertificates =
        await deps.enterpriseServiceDeliveryService.listCompletionCertificates(auth.companyId);
      res.json({ data: { completionCertificates } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/completion-certificates', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = completionCertificateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid completion certificates' } });
      return;
    }
    try {
      const completionCertificate =
        await deps.enterpriseServiceDeliveryService.createCompletionCertificate(
          staffScope(req),
          parsed.data,
        );
      res.status(201).json({ data: { completionCertificate } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get(
    '/completion-certificates/:completionCertificateId',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const completionCertificate =
          await deps.enterpriseServiceDeliveryService.getCompletionCertificate(
            auth.companyId,
            getRouteParam(req.params.completionCertificateId),
          );
        if (!completionCertificate) {
          res
            .status(404)
            .json({ error: { code: 'NOT_FOUND', message: 'CompletionCertificate not found' } });
          return;
        }
        res.json({ data: { completionCertificate } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.put(
    '/completion-certificates/:completionCertificateId',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = completionCertificateSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid completion certificates update' },
        });
        return;
      }
      try {
        const completionCertificate =
          await deps.enterpriseServiceDeliveryService.updateCompletionCertificate(
            staffScope(req),
            getRouteParam(req.params.completionCertificateId),
            parsed.data,
          );
        res.json({ data: { completionCertificate } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/inspections/:inspectionId/submit',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const inspection = await deps.enterpriseServiceDeliveryService.submitInspection(
          staffScope(req),
          getRouteParam(req.params.inspectionId),
        );
        res.json({ data: { inspection } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/inspections/:inspectionId/approve',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const inspection = await deps.enterpriseServiceDeliveryService.approveInspection(
          staffScope(req),
          getRouteParam(req.params.inspectionId),
        );
        res.json({ data: { inspection } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/inspections/:inspectionId/complete',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const inspection = await deps.enterpriseServiceDeliveryService.completeInspection(
          staffScope(req),
          getRouteParam(req.params.inspectionId),
        );
        res.json({ data: { inspection } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/corrective-actions/:actionId/approve',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const correctiveAction =
          await deps.enterpriseServiceDeliveryService.approveCorrectiveAction(
            staffScope(req),
            getRouteParam(req.params.actionId),
          );
        res.json({ data: { correctiveAction } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/alerts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const alerts = await deps.enterpriseServiceDeliveryService.listServiceAlerts(auth.companyId, {
        status,
      });
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/alerts/sync', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const alerts = await deps.enterpriseServiceDeliveryService.syncServiceAlerts(staffScope(req));
      res.json({ data: { alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseServiceDeliveryService.captureAnalytics(
        staffScope(req),
      );
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/analytics/latest', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const analytics = await deps.enterpriseServiceDeliveryService.getLatestAnalytics(
        auth.companyId,
      );
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/service-drafts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = serviceDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid service action draft' } });
      return;
    }
    try {
      const draft = await deps.enterpriseServiceDeliveryService.createServiceActionDraft(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
