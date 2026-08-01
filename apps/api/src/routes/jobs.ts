import { Router } from 'express';
import { z } from 'zod';
import type { JobsService } from '../services/jobs.service.js';
import { JobsError } from '../services/jobs.service.js';
import type { TeamService } from '../services/team.service.js';
import type { JobExecutionService } from '../services/job-execution.service.js';
import { JobExecutionError } from '../services/job-execution.service.js';
import type { JobCostingService } from '../services/job-costing.service.js';
import type { MobileWorkforceService } from '../services/mobile-workforce.service.js';
import { MobileWorkforceError } from '../services/mobile-workforce.service.js';
import type { DatabaseClient } from '@titan/db';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import {
  createDenyTechnicianFromOwnerModules,
  createRequireAssignedJob,
} from '../middleware/authorization-guards.js';

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
      .extend({
        propertyName: z.string().trim().max(200).optional().nullable(),
        isPrimary: z.boolean().optional(),
      })
      .optional()
      .nullable(),
    address: addressSchema.optional().nullable(),
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

const authorizeVariationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  notes: z.string().optional(),
});

const authorizeMaterialLineSchema = z.object({
  decision: z.enum(['approve', 'reject', 'partial']),
  fulfilledQuantity: z.number().positive().optional(),
  reason: z.string().trim().max(2000).optional().nullable(),
  clientActionId: z.string().trim().min(1).max(200),
  locationId: z.string().uuid().optional().nullable(),
});

const returnMaterialLineSchema = z.object({
  quantity: z.number().positive(),
  reason: z.string().trim().min(1).max(2000),
  clientActionId: z.string().trim().min(1).max(200),
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

type JobsRouterDeps = {
  jobsService: JobsService;
  jobExecutionService: JobExecutionService;
  jobCostingService: JobCostingService;
  mobileWorkforceService: MobileWorkforceService;
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
  mobileWorkforceService,
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

  router.get('/stats', requireAnyPermission('jobs:read', 'jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const stats = await jobsService.getStats(companyId);
    res.json({ data: stats });
  });

  router.get('/today', requireAnyPermission('jobs:read', 'jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const jobsList = await jobsService.listTodaysScheduledJobs(companyId);
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

  router.get('/', requireAnyPermission('jobs:read', 'jobs:write'), async (req, res) => {
    const { companyId } = getAuth(req);
    const search = typeof req.query.q === 'string' ? req.query.q : null;
    const jobsList = await jobsService.listJobs(companyId, search);
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
    const { companyId } = getAuth(req);
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
        companyId,
        getRouteParam(req.params.jobId),
        parsed.data,
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
      res.status(204).send();
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

  return router;
}

function handleJobsError(res: import('express').Response, error: unknown) {
  if (error instanceof JobsError) {
    const status =
      error.code === 'NOT_FOUND' ||
      error.code === 'CUSTOMER_NOT_FOUND' ||
      error.code === 'ASSIGNEE_NOT_FOUND' ||
      error.code === 'PROPERTY_NOT_FOUND'
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
