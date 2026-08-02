import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseWorkforceIntelligenceService } from '../services/enterprise-workforce-intelligence.service.js';
import { EnterpriseWorkforceIntelligenceError } from '../services/enterprise-workforce-intelligence.service.js';
import type { TeamService } from '../services/team.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  globalPolicies: z.record(z.unknown()).optional(),
  providerAdapterTemplates: z.record(z.unknown()).optional(),
  jurisdictionTemplates: z.record(z.unknown()).optional(),
  leavePolicyDefaults: z.record(z.unknown()).optional(),
  performanceRules: z.record(z.unknown()).optional(),
  privacyPolicies: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  config: z.record(z.unknown()).optional(),
});

const profileSchema = z.object({
  userId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  customCategoryName: z.string().trim().max(200).optional(),
  employeeNumber: z.string().trim().max(100).optional(),
  employmentType: z.string().trim().max(100).optional(),
  jobTitle: z.string().trim().max(200).optional(),
  department: z.string().trim().max(200).optional(),
  branch: z.string().trim().max(200).optional(),
  managerUserId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  contractStatus: z.string().trim().max(100).optional(),
  lifecycleStage: z
    .enum([
      'candidate',
      'applicant',
      'interview',
      'offer',
      'pre_employment',
      'onboarding',
      'active',
      'probation',
      'role_change',
      'promotion',
      'transfer',
      'suspension',
      'leave',
      'offboarding',
      'termination',
      'alumni',
    ])
    .optional(),
  workingHours: z.record(z.unknown()).optional(),
  contactDetails: z.record(z.unknown()).optional(),
  emergencyContact: z.record(z.unknown()).optional(),
  jurisdictionConfig: z.record(z.unknown()).optional(),
});

const providerSchema = z.object({
  providerCategory: z.enum(['payroll', 'hr', 'accounting', 'timekeeping']),
  providerType: z.enum([
    'sage_payroll',
    'sage_business_cloud',
    'xero_payroll',
    'quickbooks_payroll',
    'payspace',
    'simplepay',
    'bamboohr',
    'deel',
    'workday',
    'sap_successfactors',
    'zoho_people',
    'employment_hero',
    'microsoft_dynamics',
    'csv_import_export',
    'sftp',
    'generic_rest',
    'webhook',
    'custom',
  ]),
  providerKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  endpointUrl: z.string().url().optional(),
  credentialsVaultKey: z.string().trim().max(200).optional(),
  isPrimary: z.boolean().optional(),
  syncDirection: z.enum(['inbound', 'outbound', 'bidirectional']).optional(),
  syncFrequencyMinutes: z.number().int().min(1).optional(),
  fieldMappings: z.record(z.unknown()).optional(),
  leaveTypeMappings: z.record(z.unknown()).optional(),
  earningCodeMappings: z.record(z.unknown()).optional(),
  deductionCodeMappings: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const lifecycleSchema = z.object({
  userId: z.string().uuid(),
  stage: z.enum([
    'candidate',
    'applicant',
    'interview',
    'offer',
    'pre_employment',
    'onboarding',
    'active',
    'probation',
    'role_change',
    'promotion',
    'transfer',
    'suspension',
    'leave',
    'offboarding',
    'termination',
    'alumni',
  ]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  effectiveDate: z.string().optional(),
  requiresApproval: z.boolean().optional(),
});

const timesheetSchema = z.object({
  userId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
  standardHours: z.number().min(0).optional(),
  overtimeHours: z.number().min(0).optional(),
  travelHours: z.number().min(0).optional(),
  standbyHours: z.number().min(0).optional(),
  breakHours: z.number().min(0).optional(),
  notes: z.string().trim().max(4000).optional(),
  clockInAt: z.string().datetime().optional(),
  clockOutAt: z.string().datetime().optional(),
  gpsMetadata: z.record(z.unknown()).optional(),
});

const correctionSchema = z.object({
  fieldName: z.enum([
    'standardHours',
    'overtimeHours',
    'travelHours',
    'standbyHours',
    'breakHours',
  ]),
  correctedValue: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(2000),
});

const leaveCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  categoryKey: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  isPaid: z.boolean().optional(),
  accrualRules: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const leaveApplicationSchema = z.object({
  categoryId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  daysRequested: z.number().min(0.5),
  reason: z.string().trim().max(2000).optional(),
});

const payrollPeriodSchema = z.object({
  name: z.string().trim().min(1).max(200),
  periodStart: z.string(),
  periodEnd: z.string(),
});

const hrDraftSchema = z.object({
  userId: z.string().uuid().optional(),
  draftType: z.enum([
    'termination',
    'suspension',
    'role_change',
    'payroll_export',
    'offboarding',
    'disciplinary',
    'onboarding_plan',
    'development_plan',
    'performance_report',
    'hr_communication',
    'payroll_exception_summary',
    'training_recommendation',
    'technician_match',
  ]),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  payload: z.record(z.unknown()).optional(),
  requiresApproval: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseWorkforceIntelligenceService: EnterpriseWorkforceIntelligenceService;
  teamService: TeamService;
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

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseWorkforceIntelligenceError) {
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

export function createEnterpriseWorkforceIntelligenceRouter(deps: RouterDeps): Router {
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
    'workforce:read',
    'workforce_intelligence:read',
    'workforce_intelligence:manage',
  );
  const requireWrite = requireAnyPermission(
    'workforce:write',
    'workforce_intelligence:write',
    'workforce_intelligence:manage',
  );
  const requireManage = requireAnyPermission('workforce_intelligence:manage', 'platform:manage');
  const requireOwnerWorkforce = requireAnyPermission(
    'workforce:write',
    'workforce_intelligence:manage',
    'executive:read',
  );

  router.get('/owner-workforce', requireStaffAuth, requireOwnerWorkforce, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
      const view = await deps.enterpriseWorkforceIntelligenceService.getOwnerWorkforceView(
        auth.companyId,
        dateParam,
      );
      res.json({ data: { view } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseWorkforceIntelligenceService.getDashboard(
        auth.companyId,
      );
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/manager', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const workspace = await deps.enterpriseWorkforceIntelligenceService.getManagerWorkspace(auth);
      res.json({ data: { workspace } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/self-service', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const selfService = await deps.enterpriseWorkforceIntelligenceService.getSelfService(auth);
      res.json({ data: { selfService } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/skills-matrix', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const matrix = await deps.enterpriseWorkforceIntelligenceService.getSkillsMatrix(
        auth.companyId,
      );
      res.json({ data: { matrix } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/capacity', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const capacity = await deps.enterpriseWorkforceIntelligenceService.getCapacitySummary(
        auth.companyId,
      );
      res.json({ data: { capacity } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseWorkforceIntelligenceService.getPlatformConfig(
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
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseWorkforceIntelligenceService.updatePlatformConfig(
        auth,
        parsed.data,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/categories', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const categories = await deps.enterpriseWorkforceIntelligenceService.listCategories(
        auth.companyId,
      );
      res.json({ data: { categories } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/categories', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid category' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const category = await deps.enterpriseWorkforceIntelligenceService.createCategory(
        auth,
        parsed.data,
      );
      res.status(201).json({ data: { category } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/profiles', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const profiles = await deps.enterpriseWorkforceIntelligenceService.listProfiles(
        auth.companyId,
      );
      res.json({ data: { profiles } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/profiles', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid profile' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const profile = await deps.enterpriseWorkforceIntelligenceService.createProfile(
        auth,
        parsed.data,
      );
      res.status(201).json({ data: { profile } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/providers', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const providers = await deps.enterpriseWorkforceIntelligenceService.listProviders(
        auth.companyId,
      );
      res.json({ data: { providers } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/providers', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = providerSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid provider adapter' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const provider = await deps.enterpriseWorkforceIntelligenceService.createProvider(
        auth,
        parsed.data,
      );
      res.status(201).json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/providers/:providerId/test', requireStaffAuth, requireManage, async (req, res) => {
    try {
      const auth = getAuth(req);
      const provider = await deps.enterpriseWorkforceIntelligenceService.testProvider(
        auth,
        getRouteParam(req.params.providerId),
      );
      res.json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/lifecycle', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = lifecycleSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid lifecycle stage' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const stage = await deps.enterpriseWorkforceIntelligenceService.createLifecycleStage(
        auth,
        parsed.data,
      );
      res.status(201).json({ data: { stage } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/lifecycle', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const history = await deps.enterpriseWorkforceIntelligenceService.listLifecycleHistory(
        auth.companyId,
        userId,
      );
      res.json({ data: { history } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/timesheets', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;

      if (!userId) {
        const canViewAll =
          auth.permissions.includes('*') ||
          auth.permissions.includes('workforce:write') ||
          auth.permissions.includes('workforce_intelligence:manage') ||
          auth.permissions.includes('workforce_intelligence:write');
        if (!canViewAll) {
          res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: 'Workforce-wide timesheets require manager or owner permissions',
            },
          });
          return;
        }
      } else if (userId !== auth.userId) {
        const canViewOthers =
          auth.permissions.includes('*') ||
          auth.permissions.includes('workforce:write') ||
          auth.permissions.includes('workforce_intelligence:manage') ||
          auth.permissions.includes('workforce_intelligence:write');
        if (!canViewOthers) {
          res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: 'You may only view your own timesheets',
            },
          });
          return;
        }
      }

      const timesheets = await deps.enterpriseWorkforceIntelligenceService.listTimesheets(
        auth.companyId,
        {
          status,
          userId,
        },
      );
      res.json({ data: { timesheets } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/timesheets', requireStaffAuth, requireRead, async (req, res) => {
    const parsed = timesheetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid timesheet' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const timesheet = await deps.enterpriseWorkforceIntelligenceService.createTimesheet(
        auth,
        parsed.data,
      );
      res.status(201).json({ data: { timesheet } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/timesheets/:timesheetId/approve',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const timesheet = await deps.enterpriseWorkforceIntelligenceService.approveTimesheet(
          auth,
          getRouteParam(req.params.timesheetId),
        );
        res.json({ data: { timesheet } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/timesheets/:timesheetId/correct',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = correctionSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid correction' } });
        return;
      }
      try {
        const auth = getAuth(req);
        const result = await deps.enterpriseWorkforceIntelligenceService.correctTimesheet(
          auth,
          getRouteParam(req.params.timesheetId),
          parsed.data,
        );
        res.json({ data: result });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/leave/categories', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const categories = await deps.enterpriseWorkforceIntelligenceService.listLeaveCategories(
        auth.companyId,
      );
      res.json({ data: { categories } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/leave/categories', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = leaveCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid leave category' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const category = await deps.enterpriseWorkforceIntelligenceService.createLeaveCategory(
        auth,
        parsed.data,
      );
      res.status(201).json({ data: { category } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/leave/applications', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const applications = await deps.enterpriseWorkforceIntelligenceService.listLeaveApplications(
        auth.companyId,
        { status, userId },
      );
      res.json({ data: { applications } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/leave/applications', requireStaffAuth, requireRead, async (req, res) => {
    const parsed = leaveApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid leave application' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const application = await deps.enterpriseWorkforceIntelligenceService.createLeaveApplication(
        auth,
        parsed.data,
      );
      res.status(201).json({ data: { application } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/leave/applications/:applicationId/approve',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const application =
          await deps.enterpriseWorkforceIntelligenceService.approveLeaveApplication(
            auth,
            getRouteParam(req.params.applicationId),
          );
        res.json({ data: { application } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post('/payroll/periods', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = payrollPeriodSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payroll period' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const period = await deps.enterpriseWorkforceIntelligenceService.createPayrollPeriod(
        auth,
        parsed.data,
      );
      res.status(201).json({ data: { period } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/payroll/periods/:periodId/prepare',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const batch = await deps.enterpriseWorkforceIntelligenceService.preparePayroll(
          auth,
          getRouteParam(req.params.periodId),
        );
        res.status(201).json({ data: { batch } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/payroll/batches/:batchId/approve',
    requireStaffAuth,
    requireManage,
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const batch = await deps.enterpriseWorkforceIntelligenceService.approvePayrollBatch(
          auth,
          getRouteParam(req.params.batchId),
        );
        res.json({ data: { batch } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/payroll/preparations', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const preparations =
        await deps.enterpriseWorkforceIntelligenceService.listPayrollPreparations(auth.companyId);
      res.json({ data: { preparations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/training/courses', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const courses = await deps.enterpriseWorkforceIntelligenceService.listTrainingCourses(
        auth.companyId,
      );
      res.json({ data: { courses } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/performance/capture', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const snapshots =
        await deps.enterpriseWorkforceIntelligenceService.captureTechnicianPerformance(auth);
      res.json({ data: { snapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/performance', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const performance =
        await deps.enterpriseWorkforceIntelligenceService.listTechnicianPerformance(auth.companyId);
      res.json({ data: { performance } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/hr-drafts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const drafts = await deps.enterpriseWorkforceIntelligenceService.listHrActionDrafts(
        auth.companyId,
      );
      res.json({ data: { drafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/hr-drafts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = hrDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid HR draft' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const draft = await deps.enterpriseWorkforceIntelligenceService.createHrActionDraft(
        auth,
        parsed.data,
      );
      res.status(201).json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const analytics = await deps.enterpriseWorkforceIntelligenceService.captureAnalytics(auth);
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/portal/technician/:userId', requirePortalAuth, async (req, res) => {
    try {
      const portalAuth = getPortalAuth(req);
      const profile =
        await deps.enterpriseWorkforceIntelligenceService.getCustomerTechnicianProfile(
          portalAuth.companyId,
          getRouteParam(req.params.userId),
        );
      res.json({ data: { profile } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
