import { Router } from 'express';
import { z } from 'zod';
import {
  canAccessJobProfitability,
  canManageJobProfitabilityAdjustments,
  canViewJobProfitabilityMargin,
} from '@titan/shared';
import type { JobsService } from '../services/jobs.service.js';
import { JobsError } from '../services/jobs.service.js';
import type { TeamService } from '../services/team.service.js';
import type { JobExecutionService } from '../services/job-execution.service.js';
import { JobExecutionError } from '../services/job-execution.service.js';
import type { JobCostingService } from '../services/job-costing.service.js';
import type { JobCostControlService } from '../services/job-cost-control.service.js';
import type { JobProfitabilityService } from '../services/job-profitability.service.js';
import { JobProfitabilityError } from '../services/job-profitability.service.js';
import type { MobileWorkforceService } from '../services/mobile-workforce.service.js';
import { MobileWorkforceError } from '../services/mobile-workforce.service.js';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import {
  createDenyTechnicianFromOwnerModules,
  createRequireAssignedJob,
} from '../middleware/authorization-guards.js';
import { createJobFinancialReviewRouter } from './job-cost-control.js';
import { appendServerTiming } from '../lib/server-timing.js';

const jobStatusSchema = z.enum(['new', 'scheduled', 'in_progress', 'completed', 'cancelled']);
const jobPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

const addressSchema = z.object({
  street: z.string().trim().min(1).max(300),
  suburb: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  province: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(20),
  unit: z.string().trim().max(50).optional().nullable(),
});

const geoFieldsSchema = z.object({
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  placeId: z.string().trim().max(300).optional().nullable(),
  formattedAddress: z.string().trim().max(500).optional().nullable(),
  geocodeStatus: z.enum(['unverified', 'verified', 'failed']).optional().nullable(),
});

const siteContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mobile: z.string().trim().min(1).max(30),
  email: z.string().trim().email().max(254).optional().nullable(),
});

const createJobSchema = z
  .object({
    customerId: z.string().uuid(),
    propertyId: z.string().uuid().optional().nullable(),
    newProperty: addressSchema
      .merge(geoFieldsSchema)
      .extend({
        propertyName: z.string().trim().max(200).optional().nullable(),
        isPrimary: z.boolean().optional(),
      })
      .optional()
      .nullable(),
    address: addressSchema.merge(geoFieldsSchema).optional().nullable(),
    siteContact: siteContactSchema,
    siteContactDiffersFromCustomer: z.boolean().optional(),
    jobType: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(5000),
    priority: jobPrioritySchema.optional(),
    preferredAppointmentAt: z.string().datetime().optional().nullable(),
    scheduledEndAt: z.string().datetime().optional().nullable(),
    assignedUserId: z.string().uuid().optional().nullable(),
    accessInstructions: z.string().trim().max(5000).optional().nullable(),
    notes: z.string().trim().max(5000).optional().nullable(),
    customerVisibleNotes: z.string().trim().max(5000).optional().nullable(),
    updateVerifiedCustomerDetails: z.boolean().optional(),
    updateVerifiedPropertyDetails: z.boolean().optional(),
    documents: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(200),
          fileName: z.string().trim().min(1).max(260),
          fileType: z.string().trim().max(120).optional().nullable(),
          fileSizeBytes: z.number().int().nonnegative().optional().nullable(),
        }),
      )
      .max(20)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.propertyId && !value.newProperty && !value.address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Existing property or new site address is required',
        path: ['propertyId'],
      });
    }
  });

const updateJobSchema = z.object({
  customerId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  jobType: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  status: jobStatusSchema.optional(),
  priority: jobPrioritySchema.optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  scheduledEndAt: z.string().datetime().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  customerVisibleNotes: z.string().trim().max(5000).optional().nullable(),
  accessInstructions: z.string().trim().max(5000).optional().nullable(),
});

const assignCrewSchema = z.object({
  members: z
    .array(
      z.object({
        userId: z.string().uuid(),
        crewRole: z.enum(['crew_leader', 'driver', 'qualified', 'semi_skilled', 'assistant']),
        isPrimary: z.boolean().optional(),
      }),
    )
    .min(2)
    .max(4),
  vehicleId: z.string().uuid().optional().nullable(),
  primaryUserId: z.string().uuid().optional().nullable(),
});

const reopenJobSchema = z.object({
  reason: z.string().trim().min(1),
});

const officeEvidenceUploadSchema = z.object({
  documentationType: z.enum(['photo', 'document']),
  title: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  dataBase64: z.string().min(1),
  fileName: z.string().trim().max(200).optional(),
  clientActionId: z.string().trim().max(200).optional(),
});

const authorizeVariationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  notes: z.string().optional(),
});

const authorizeMaterialLineSchema = z.object({
  decision: z.enum(['approve', 'reject', 'partial']),
  fulfilledQuantity: z.number().positive().optional(),
  reason: z.string().trim().max(2000).optional().nullable(),
  clientActionId: z.string().trim().min(1).max(200),
  inventoryItemId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  unitCostCents: z.number().int().nonnegative().optional().nullable(),
  supplierReference: z.string().trim().max(500).optional().nullable(),
  receiptDocumentationId: z.string().uuid().optional().nullable(),
});

const returnMaterialLineSchema = z.object({
  quantity: z.number().positive(),
  reason: z.string().trim().min(1).max(2000),
  clientActionId: z.string().trim().min(1).max(200),
});

const receiveUnusedDirectPurchaseSchema = z.object({
  quantity: z.number().positive(),
  inventoryItemId: z.string().uuid(),
  locationId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
  clientActionId: z.string().trim().min(1).max(200),
  unitCostCents: z.number().int().nonnegative().optional().nullable(),
});

const resolveMaterialStockVarianceSchema = z.object({
  resolutionNotes: z.string().trim().min(1).max(4000),
  clientActionId: z.string().trim().min(1).max(200),
  correctedFulfilledQuantity: z.number().nonnegative().optional().nullable(),
});

const costAdjustmentSchema = z.object({
  kind: z.enum([
    'revenue',
    'material_cost',
    'labour_cost',
    'other_direct_cost',
    'total_cost',
  ]),
  amountCents: z.number().int(),
  reason: z.string().trim().min(1).max(2000),
});

function hasCostVisibility(auth: { permissions: string[]; roleName?: string | null }): boolean {
  return (
    auth.permissions.includes('*') ||
    auth.permissions.includes('inventory:write') ||
    auth.permissions.includes('finance:write') ||
    auth.permissions.includes('finance:read') ||
    auth.permissions.includes('procurement:read')
  );
}

function canViewJobProfit(auth: { permissions: string[]; roleName?: string | null }): boolean {
  if (auth.permissions.includes('*') || auth.permissions.includes('finance:write')) return true;
  return ['Company Owner', 'Accountant', 'Manager'].includes(auth.roleName ?? '');
}

const approveRescheduleSchema = z.object({
  scheduledAt: z.string().trim().min(1),
  scheduledEndAt: z.string().trim().min(1).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  clientActionId: z.string().optional().nullable(),
});

type JobsRouterDeps = {
  jobsService: JobsService;
  jobExecutionService: JobExecutionService;
  jobCostingService: JobCostingService;
  jobProfitabilityService: JobProfitabilityService;
  jobCostControlService: JobCostControlService;
  mobileWorkforceService: MobileWorkforceService;
  jobVisitsService: import('../services/job-visits.service.js').JobVisitsService;
  quickJobIntakeService: import('../services/quick-job-intake.service.js').QuickJobIntakeService;
  teamService: TeamService;
  db: DatabaseClient;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createJobsRouter({
  jobsService,
  jobExecutionService,
  jobCostingService,
  jobProfitabilityService,
  jobCostControlService,
  mobileWorkforceService,
  jobVisitsService,
  quickJobIntakeService,
  teamService,
  db,
  jwtSecret,
  authService,
}: JobsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const denyTechnician = createDenyTechnicianFromOwnerModules(db);
  const requireAssignedJob = createRequireAssignedJob(db, (req) => getRouteParam(req.params.jobId));

  router.use(requireAuth);
  router.use(denyTechnician);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.get(
    '/intake/pending',
    requireAnyPermission('jobs:read', 'jobs:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const pending = await quickJobIntakeService.listPendingConfirmations(auth.companyId);
      res.json({ data: { pending } });
    },
  );

  router.post(
    '/intake/quick-call',
    requireAnyPermission('jobs:write', 'scheduling:write'),
    async (req, res) => {
      const parsed = z
        .object({
          phone: z.string().trim().min(1),
          issue: z.string().trim().min(1),
          location: z.string().trim().optional().nullable(),
          need: z.string().trim().optional().nullable(),
          customerName: z.string().trim().optional().nullable(),
          urgencyHint: z
            .enum(['emergency', 'same_day', 'next_available', 'scheduled'])
            .optional()
            .nullable(),
          preferredTiming: z.string().trim().optional().nullable(),
          notes: z.string().trim().optional().nullable(),
          source: z
            .enum(['owner', 'office', 'business_call', 'personal_call_manual'])
            .optional(),
          matchedCustomerId: z.string().uuid().optional().nullable(),
          matchedPropertyId: z.string().uuid().optional().nullable(),
          overrideDuplicateWarning: z.boolean().optional(),
          prepareOnly: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid NEW CALL / quick job payload' },
        });
        return;
      }
      try {
        const auth = getAuth(req);
        if (parsed.data.prepareOnly) {
          const result = await quickJobIntakeService.prepareOwnerQuickCall(auth, parsed.data);
          res.json({ data: result });
          return;
        }
        const result = await quickJobIntakeService.ownerQuickCallCreate(auth, {
          ...parsed.data,
          createJobNow: true,
        });
        res.status(201).json({ data: result });
      } catch (error) {
        const { QuickJobIntakeError } = await import('../services/quick-job-intake.service.js');
        if (error instanceof QuickJobIntakeError) {
          const status =
            error.code === 'DUPLICATE_OPEN_JOB' || error.code === 'SCHEDULE_CONFLICT'
              ? 409
              : error.code === 'FORBIDDEN'
                ? 403
                : 400;
          res.status(status).json({ error: { code: error.code, message: error.message } });
          return;
        }
        throw error;
      }
    },
  );

  router.post(
    '/:jobId/intake/confirm',
    requireAnyPermission('jobs:write', 'scheduling:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const job = await quickJobIntakeService.confirmTechnicianIntake(
          auth,
          getRouteParam(req.params.jobId),
          {
            assignedUserId: typeof req.body?.assignedUserId === 'string' ? req.body.assignedUserId : null,
            scheduledAt: typeof req.body?.scheduledAt === 'string' ? req.body.scheduledAt : null,
            scheduledEndAt:
              typeof req.body?.scheduledEndAt === 'string' ? req.body.scheduledEndAt : null,
            notes: typeof req.body?.notes === 'string' ? req.body.notes : null,
          },
        );
        res.json({ data: { job } });
      } catch (error) {
        const { QuickJobIntakeError } = await import('../services/quick-job-intake.service.js');
        if (error instanceof QuickJobIntakeError) {
          res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
            error: { code: error.code, message: error.message },
          });
          return;
        }
        throw error;
      }
    },
  );

  router.get('/stats', requireAnyPermission('jobs:read', 'jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await jobsService.getStats(companyId);
    res.json({ data: stats });
  });

  router.get('/today', requireAnyPermission('jobs:read', 'jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const includeCompleted =
      req.query.includeCompleted === '1' || req.query.includeCompleted === 'true';
    const jobsList = await jobsService.listTodaysScheduledJobs(companyId, 100, {
      includeCompleted,
    });
    res.json({ data: { jobs: jobsList } });
  });

  router.get(
    '/materials/pending',
    requireAnyPermission('jobs:write', 'inventory:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const materialLines = await jobExecutionService.listPendingMaterialRequests(
        auth.companyId,
        hasCostVisibility(auth),
      );
      res.json({ data: { materialLines } });
    },
  );

  router.get(
    '/materials/stock-variances',
    requireAnyPermission('jobs:write', 'inventory:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const materialLines = await jobExecutionService.listStockVarianceMaterialLines(
        auth.companyId,
        hasCostVisibility(auth),
      );
      res.json({ data: { materialLines } });
    },
  );

  router.get('/', requireAnyPermission('jobs:read', 'jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const search = typeof req.query.q === 'string' ? req.query.q : null;
    const started = performance.now();
    const jobsList = await jobsService.listJobs(companyId, search);
    appendServerTiming(res, 'jobs-list', performance.now() - started);
    res.json({ data: { jobs: jobsList } });
  });

  router.post('/', requireAnyPermission('jobs:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createJobSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid job payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const job = await jobsService.createJob(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { job } });
    } catch (error) {
      handleJobsError(res, error);
    }
  });

  router.get(
    '/:jobId',
    requireAnyPermission('jobs:read', 'jobs:write'),
    requireAssignedJob,
    async (req, res) => {
      const { companyId } = getAuth(req);
      const job = await jobsService.getJob(companyId, getRouteParam(req.params.jobId));

      if (!job) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Job not found' },
        });
        return;
      }

      res.json({ data: { job } });
    },
  );

  router.patch('/:jobId', requireAnyPermission('jobs:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = updateJobSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid job payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const job = await jobsService.updateJob(
        auth.companyId,
        getRouteParam(req.params.jobId),
        parsed.data,
        { userId: auth.userId },
      );
      res.json({ data: { job } });
    } catch (error) {
      handleJobsError(res, error);
    }
  });

  router.delete('/:jobId', requireAnyPermission('jobs:write'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const isOwner =
        auth.roleName === 'Company Owner' || auth.permissions.includes('*');
      await jobsService.deleteJob(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.jobId),
        { isOwner },
      );
      res.json({ data: { deleted: true } });
    } catch (error) {
      handleJobsError(res, error);
    }
  });

  router.get(
    '/:jobId/execution',
    requireAnyPermission('jobs:read', 'jobs:write'),
    requireAssignedJob,
    async (req, res) => {
      const auth = getAuth(req);
      try {
        const summary = await jobExecutionService.getExecutionSummary(
          auth,
          getRouteParam(req.params.jobId),
        );
        res.json({ data: { summary } });
      } catch (error) {
        handleJobExecutionError(res, error);
      }
    },
  );

  router.get(
    '/:jobId/timeline',
    requireAnyPermission('jobs:read', 'jobs:write'),
    requireAssignedJob,
    async (req, res) => {
      const auth = getAuth(req);
      try {
        const events = await jobExecutionService.listTimeline(
          auth,
          getRouteParam(req.params.jobId),
        );
        res.json({ data: { events } });
      } catch (error) {
        handleJobExecutionError(res, error);
      }
    },
  );

  router.get(
    '/:jobId/visits',
    requireAnyPermission('jobs:read', 'jobs:write'),
    requireAssignedJob,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const jobId = getRouteParam(req.params.jobId);
        const [visits, rollup] = await Promise.all([
          jobVisitsService.listVisits(auth.companyId, jobId),
          jobVisitsService.getRollup(auth.companyId, jobId),
        ]);
        res.json({ data: { visits, rollup } });
      } catch (error) {
        handleJobExecutionError(res, error);
      }
    },
  );

  router.post(
    '/reschedule-requests/:requestId/approve',
    requireAnyPermission('jobs:write', 'scheduling:write'),
    async (req, res) => {
      const parsed = approveRescheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid approve-reschedule payload' },
        });
        return;
      }
      try {
        const auth = getAuth(req);
        const result = await jobVisitsService.approveReschedule(
          auth,
          getRouteParam(req.params.requestId),
          parsed.data,
        );
        res.json({ data: result });
      } catch (error) {
        handleJobExecutionError(res, error);
      }
    },
  );

  router.get(
    '/:jobId/crew',
    requireAnyPermission('jobs:read', 'jobs:write'),
    requireAssignedJob,
    async (req, res) => {
      const { companyId } = getAuth(req);
      const jobId = getRouteParam(req.params.jobId);
      const [crew, vehicle] = await Promise.all([
        jobExecutionService.getCrew(companyId, jobId),
        jobExecutionService.getActiveVehicle(companyId, jobId),
      ]);
      res.json({ data: { crew, vehicle } });
    },
  );

  router.post(
    '/:jobId/evidence/upload',
    requireAnyPermission('finance:write', 'jobs:write'),
    async (req, res) => {
      const parsed = officeEvidenceUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid evidence upload payload' },
        });
        return;
      }
      try {
        const auth = getAuth(req);
        const documentation = await mobileWorkforceService.uploadJobEvidenceForOffice(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.jobId),
          parsed.data,
        );
        res.status(201).json({ data: { documentation } });
      } catch (error) {
        handleWorkforceError(res, error);
      }
    },
  );

  router.get(
    '/:jobId/evidence/:docId/content',
    requireAnyPermission('jobs:read', 'jobs:write'),
    requireAssignedJob,
    async (req, res) => {
      const { companyId } = getAuth(req);
      try {
        const file = await mobileWorkforceService.getJobEvidenceBinaryForOffice(
          companyId,
          getRouteParam(req.params.jobId),
          getRouteParam(req.params.docId),
        );
        res.setHeader('Content-Type', file.mimeType);
        if (file.fileName) {
          res.setHeader(
            'Content-Disposition',
            `inline; filename="${encodeURIComponent(file.fileName)}"`,
          );
        }
        res.send(file.buffer);
      } catch (error) {
        handleWorkforceError(res, error);
      }
    },
  );

  router.put('/:jobId/crew', requireAnyPermission('jobs:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = assignCrewSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid crew payload', details: parsed.error.flatten() },
      });
      return;
    }

    try {
      const result = await jobExecutionService.assignCrew(
        auth,
        getRouteParam(req.params.jobId),
        parsed.data,
      );
      res.json({ data: result });
    } catch (error) {
      handleJobExecutionError(res, error);
    }
  });

  router.post('/:jobId/reopen', requireAnyPermission('jobs:write'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = reopenJobSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'A reason is required to reopen a job' },
      });
      return;
    }

    try {
      const job = await jobExecutionService.reopenJob(
        auth,
        getRouteParam(req.params.jobId),
        parsed.data.reason,
      );
      res.json({ data: { job } });
    } catch (error) {
      handleJobExecutionError(res, error);
    }
  });

  router.get(
    '/:jobId/variations',
    requireAnyPermission('jobs:read', 'jobs:write'),
    requireAssignedJob,
    async (req, res) => {
      const { companyId } = getAuth(req);
      const variations = await jobExecutionService.listVariations(
        companyId,
        getRouteParam(req.params.jobId),
      );
      res.json({ data: { variations } });
    },
  );

  router.post(
    '/:jobId/variations/:variationId/authorize',
    requireAnyPermission('jobs:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = authorizeVariationSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid variation authorization payload' },
        });
        return;
      }

      try {
        const variation = await jobExecutionService.authorizeVariation(
          auth,
          getRouteParam(req.params.jobId),
          getRouteParam(req.params.variationId),
          parsed.data,
        );
        res.json({ data: { variation } });
      } catch (error) {
        handleJobExecutionError(res, error);
      }
    },
  );

  router.get(
    '/:jobId/materials',
    requireAnyPermission('jobs:read', 'jobs:write'),
    requireAssignedJob,
    async (req, res) => {
      const auth = getAuth(req);
      const materialLines = await jobExecutionService.listMaterialLines(
        auth.companyId,
        getRouteParam(req.params.jobId),
        hasCostVisibility(auth),
      );
      res.json({ data: { materialLines } });
    },
  );

  router.post(
    '/:jobId/materials/:materialLineId/authorize',
    requireAnyPermission('jobs:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = authorizeMaterialLineSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid material authorization payload' },
        });
        return;
      }

      try {
        const materialLine = await jobExecutionService.authorizeMaterialLine(
          auth,
          getRouteParam(req.params.jobId),
          getRouteParam(req.params.materialLineId),
          parsed.data,
        );
        res.json({ data: { materialLine } });
      } catch (error) {
        handleJobExecutionError(res, error);
      }
    },
  );

  router.post(
    '/:jobId/materials/:materialLineId/return',
    requireAnyPermission('jobs:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = returnMaterialLineSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid material return payload' },
        });
        return;
      }

      try {
        const materialLine = await jobExecutionService.returnMaterialLine(
          auth,
          getRouteParam(req.params.jobId),
          getRouteParam(req.params.materialLineId),
          parsed.data,
        );
        res.json({ data: { materialLine } });
      } catch (error) {
        handleJobExecutionError(res, error);
      }
    },
  );

  router.post(
    '/:jobId/materials/:materialLineId/receive-unused',
    requireAnyPermission('jobs:write', 'inventory:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = receiveUnusedDirectPurchaseSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid receive-unused direct purchase payload',
          },
        });
        return;
      }

      try {
        const materialLine = await jobExecutionService.receiveUnusedDirectPurchaseIntoStock(
          auth,
          getRouteParam(req.params.jobId),
          getRouteParam(req.params.materialLineId),
          parsed.data,
        );
        res.json({ data: { materialLine } });
      } catch (error) {
        handleJobExecutionError(res, error);
      }
    },
  );

  router.post(
    '/:jobId/materials/:materialLineId/resolve-variance',
    requireAnyPermission('jobs:write', 'inventory:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = resolveMaterialStockVarianceSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid stock variance resolution payload' },
        });
        return;
      }

      try {
        const materialLine = await jobExecutionService.resolveMaterialStockVariance(
          auth,
          getRouteParam(req.params.jobId),
          getRouteParam(req.params.materialLineId),
          parsed.data,
        );
        res.json({ data: { materialLine } });
      } catch (error) {
        handleJobExecutionError(res, error);
      }
    },
  );

  router.get(
    '/:jobId/costing',
    requireAnyPermission('jobs:read', 'jobs:write', 'finance:read', 'finance:write'),
    requireAssignedJob,
    async (req, res) => {
      const auth = getAuth(req);
      if (!hasCostVisibility(auth)) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Job costing is restricted to authorized finance roles' },
        });
        return;
      }

      try {
        const summary = await jobCostingService.getJobCostingSummary(
          auth.companyId,
          getRouteParam(req.params.jobId),
          { includeProfit: canViewJobProfit(auth) },
        );
        res.json({ data: { summary } });
      } catch (error) {
        handleJobsError(res, error);
      }
    },
  );

  router.get(
    '/:jobId/profitability',
    requireAnyPermission('jobs:read', 'jobs:write', 'finance:read', 'finance:write'),
    requireAssignedJob,
    async (req, res) => {
      const auth = getAuth(req);
      if (!canAccessJobProfitability(auth)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Job profitability is restricted to authorized finance roles',
          },
        });
        return;
      }

      try {
        const profitability = await jobProfitabilityService.getJobProfitability(
          auth.companyId,
          getRouteParam(req.params.jobId),
          { includeSensitiveCosts: canViewJobProfitabilityMargin(auth.permissions, auth.roleName) },
        );
        res.json({ data: { profitability } });
      } catch (error) {
        handleJobsError(res, error);
      }
    },
  );

  router.post(
    '/:jobId/cost-adjustments',
    requireAnyPermission('finance:write', '*'),
    requireAssignedJob,
    async (req, res) => {
      const auth = getAuth(req);
      if (!canManageJobProfitabilityAdjustments(auth)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Cost adjustments require finance write access',
          },
        });
        return;
      }

      const parsed = costAdjustmentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid cost adjustment payload' },
        });
        return;
      }

      try {
        const adjustment = await jobProfitabilityService.createCostAdjustment(
          {
            companyId: auth.companyId,
            userId: auth.userId,
            roleName: auth.roleName,
            permissions: auth.permissions,
          },
          getRouteParam(req.params.jobId),
          parsed.data,
        );
        res.status(201).json({ data: { adjustment } });
      } catch (error) {
        handleJobProfitabilityError(res, error);
      }
    },
  );

  router.post(
    '/:jobId/profitability/recalculate',
    requireAnyPermission('finance:write', '*'),
    requireAssignedJob,
    async (req, res) => {
      const auth = getAuth(req);
      if (!canManageJobProfitabilityAdjustments(auth)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Manual profitability recalculation requires finance write access',
          },
        });
        return;
      }

      try {
        const profitability = await jobProfitabilityService.recalculateJobProfitability(
          auth.companyId,
          getRouteParam(req.params.jobId),
          { includeSensitiveCosts: true },
        );
        res.json({ data: { profitability } });
      } catch (error) {
        handleJobsError(res, error);
      }
    },
  );

  router.post(
    '/:jobId/time-entries/:timeEntryId/correct-labour-rate',
    requireAnyPermission('finance:write', '*'),
    async (req, res) => {
      const auth = getAuth(req);
      if (!canManageJobProfitabilityAdjustments(auth)) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Labour rate correction requires finance write access' },
        });
        return;
      }
      const parsed = z
        .object({
          hourlyCostCents: z.number().int().positive(),
          reason: z.string().trim().min(1).max(2000),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      try {
        await jobProfitabilityService.correctTimeEntryLabourRate(
          {
            companyId: auth.companyId,
            userId: auth.userId,
            roleName: auth.roleName,
            permissions: auth.permissions,
          },
          getRouteParam(req.params.jobId),
          getRouteParam(req.params.timeEntryId),
          parsed.data,
        );
        res.json({ data: { ok: true } });
      } catch (error) {
        handleJobProfitabilityError(res, error);
      }
    },
  );

  router.use(
    '/:jobId',
    createJobFinancialReviewRouter({
      jobCostControlService,
      jwtSecret,
      authService,
    }),
  );

  return router;
}

function handleJobProfitabilityError(res: import('express').Response, error: unknown) {
  if (error instanceof JobProfitabilityError) {
    res.status(error.code === 'FORBIDDEN' ? 403 : 400).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  handleJobsError(res, error);
}

function handleJobsError(res: import('express').Response, error: unknown) {
  if (error instanceof JobsError) {
    const status =
      error.code === 'NOT_FOUND' ||
      error.code === 'CUSTOMER_NOT_FOUND' ||
      error.code === 'ASSIGNEE_NOT_FOUND' ||
      error.code === 'PROPERTY_NOT_FOUND'
        ? 404
        : error.code === 'JOB_COMPLETED_IMMUTABLE'
          ? 409
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

function handleJobExecutionError(res: import('express').Response, error: unknown) {
  if (error instanceof JobExecutionError) {
    const status =
      error.code === 'NOT_FOUND' || error.code === 'ITEM_NOT_FOUND' || error.code === 'LOCATION_NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'INVALID_STATUS' || error.code === 'INSUFFICIENT_STOCK'
            ? 409
            : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}

function handleWorkforceError(res: import('express').Response, error: unknown) {
  if (error instanceof MobileWorkforceError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}
