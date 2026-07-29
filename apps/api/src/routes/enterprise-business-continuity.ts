import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseBusinessContinuityService } from '../services/enterprise-business-continuity.service.js';
import { EnterpriseBusinessContinuityError } from '../services/enterprise-business-continuity.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const scheduleTypeSchema = z.enum(['hourly', 'daily', 'weekly', 'monthly', 'manual']);
const recoveryScenarioSchema = z.enum([
  'database_failure', 'storage_failure', 'ai_provider_outage',
  'communication_provider_outage', 'payment_provider_outage',
  'integration_failure', 'infrastructure_outage',
]);
const restoreScopeSchema = z.enum(['point_in_time', 'full_tenant', 'module', 'document', 'configuration']);

const platformConfigSchema = z.object({
  backupPolicy: z.record(z.unknown()).optional(),
  restorePolicy: z.record(z.unknown()).optional(),
  verificationPolicy: z.record(z.unknown()).optional(),
  drPolicy: z.record(z.unknown()).optional(),
  compliancePolicy: z.record(z.unknown()).optional(),
  encryptionRequired: z.boolean().optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const backupPolicySchema = z.object({
  policyKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  scheduleType: scheduleTypeSchema.optional(),
  scheduleCron: z.string().trim().max(200).optional(),
  retentionDays: z.number().int().min(1).optional(),
  backupScope: z.record(z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
});

const backupJobSchema = z.object({
  policyId: z.string().uuid().optional(),
  scheduleType: scheduleTypeSchema.optional(),
  backupScope: z.record(z.unknown()).optional(),
});

const restoreRequestSchema = z.object({
  restoreScope: restoreScopeSchema,
  targetModule: z.string().trim().max(200).optional(),
  targetEntityId: z.string().uuid().optional(),
  pointInTime: z.string().datetime().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  requiresOwnerApproval: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const restoreUpdateSchema = z.object({
  status: z.enum(['pending_approval', 'approved', 'rejected', 'in_progress', 'completed', 'failed', 'cancelled']),
});

const recoveryPlanSchema = z.object({
  scenarioKey: recoveryScenarioSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  recoverySteps: z.array(z.record(z.unknown())).optional(),
  estimatedRecoveryTimeMinutes: z.number().int().optional(),
  dependencies: z.array(z.record(z.unknown())).optional(),
  validationChecklist: z.array(z.record(z.unknown())).optional(),
});

const recoveryTestSchema = z.object({
  recoveryPlanId: z.string().uuid().optional(),
  backupJobId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  scheduledAt: z.string().datetime().optional(),
  isProductionSafe: z.boolean().optional(),
});

const recoveryTestUpdateSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
  success: z.boolean().optional(),
  durationMinutes: z.number().int().optional(),
  recoveryTimeMinutes: z.number().int().optional(),
  lessonsLearned: z.string().trim().max(5000).optional(),
  failures: z.array(z.record(z.unknown())).optional(),
});

const verificationSchema = z.object({
  backupJobId: z.string().uuid().optional(),
  verificationType: z.string().trim().min(1).max(200),
  passed: z.boolean().optional(),
  findings: z.record(z.unknown()).optional(),
});

const storageHealthSchema = z.object({
  storageType: z.string().trim().min(1).max(200),
  healthStatus: z.string().trim().max(100).optional(),
  usageBytes: z.number().int().optional(),
  capacityBytes: z.number().int().optional(),
  redundancyLevel: z.string().trim().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const complianceSchema = z.object({
  complianceType: z.string().trim().min(1).max(200),
  status: z.string().trim().max(100).optional(),
  rpoMinutes: z.number().int().optional(),
  rtoMinutes: z.number().int().optional(),
});

const actionDraftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseBusinessContinuityService: EnterpriseBusinessContinuityService;
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
  if (error instanceof EnterpriseBusinessContinuityError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 :
      error.code === 'VALIDATION_ERROR' || error.code === 'APPROVAL_REQUIRED' ? 400 :
      500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseBusinessContinuityRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission(
    'business_continuity:read',
    'business_continuity:manage',
    'ops:read',
    'it_operations:read',
  );
  const requireWrite = requireAnyPermission('business_continuity:write', 'business_continuity:manage', 'ops:manage');
  const requireManage = requireAnyPermission('business_continuity:manage', 'ops:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const dashboard = await deps.enterpriseBusinessContinuityService.getDashboard(getAuth(req).companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const platformConfig = await deps.enterpriseBusinessContinuityService.getPlatformConfig(getAuth(req).companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    try {
      const input = platformConfigSchema.parse(req.body);
      const platformConfig = await deps.enterpriseBusinessContinuityService.updatePlatformConfig(staffScope(req), input);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/backup-policies', requireRead, async (req, res) => {
    try {
      const backupPolicies = await deps.enterpriseBusinessContinuityService.listBackupPolicies(getAuth(req).companyId);
      res.json({ data: { backupPolicies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/backup-policies', requireWrite, async (req, res) => {
    try {
      const input = backupPolicySchema.parse(req.body);
      const backupPolicy = await deps.enterpriseBusinessContinuityService.createBackupPolicy(staffScope(req), input);
      res.status(201).json({ data: { backupPolicy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/backup-jobs', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const backupJobs = await deps.enterpriseBusinessContinuityService.listBackupJobs(getAuth(req).companyId, { status });
      res.json({ data: { backupJobs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/backup-jobs', requireWrite, async (req, res) => {
    try {
      const input = backupJobSchema.parse(req.body);
      const backupJob = await deps.enterpriseBusinessContinuityService.createBackupJob(staffScope(req), input);
      res.status(201).json({ data: { backupJob } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/restore-requests', requireRead, async (req, res) => {
    try {
      const restoreRequests = await deps.enterpriseBusinessContinuityService.listRestoreRequests(getAuth(req).companyId);
      res.json({ data: { restoreRequests } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/restore-requests', requireWrite, async (req, res) => {
    try {
      const input = restoreRequestSchema.parse(req.body);
      const restoreRequest = await deps.enterpriseBusinessContinuityService.createRestoreRequest(staffScope(req), input);
      res.status(201).json({ data: { restoreRequest } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/restore-requests/:id', requireManage, async (req, res) => {
    try {
      const input = restoreUpdateSchema.parse(req.body);
      const restoreRequest = await deps.enterpriseBusinessContinuityService.updateRestoreRequest(
        staffScope(req),
        getRouteParam(req.params.id),
        input,
      );
      res.json({ data: { restoreRequest } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/recovery-plans', requireRead, async (req, res) => {
    try {
      const recoveryPlans = await deps.enterpriseBusinessContinuityService.listRecoveryPlans(getAuth(req).companyId);
      res.json({ data: { recoveryPlans } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/recovery-plans', requireWrite, async (req, res) => {
    try {
      const input = recoveryPlanSchema.parse(req.body);
      const recoveryPlan = await deps.enterpriseBusinessContinuityService.createRecoveryPlan(staffScope(req), input);
      res.status(201).json({ data: { recoveryPlan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/recovery-tests', requireRead, async (req, res) => {
    try {
      const recoveryTests = await deps.enterpriseBusinessContinuityService.listRecoveryTests(getAuth(req).companyId);
      res.json({ data: { recoveryTests } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/recovery-tests', requireWrite, async (req, res) => {
    try {
      const input = recoveryTestSchema.parse(req.body);
      const recoveryTest = await deps.enterpriseBusinessContinuityService.createRecoveryTest(staffScope(req), input);
      res.status(201).json({ data: { recoveryTest } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch('/recovery-tests/:id', requireWrite, async (req, res) => {
    try {
      const input = recoveryTestUpdateSchema.parse(req.body);
      const recoveryTest = await deps.enterpriseBusinessContinuityService.updateRecoveryTest(
        staffScope(req),
        getRouteParam(req.params.id),
        input,
      );
      res.json({ data: { recoveryTest } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/verification-records', requireRead, async (req, res) => {
    try {
      const verificationRecords = await deps.enterpriseBusinessContinuityService.listVerificationRecords(getAuth(req).companyId);
      res.json({ data: { verificationRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/verification-records', requireWrite, async (req, res) => {
    try {
      const input = verificationSchema.parse(req.body);
      const verificationRecord = await deps.enterpriseBusinessContinuityService.createVerificationRecord(staffScope(req), input);
      res.status(201).json({ data: { verificationRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/storage-health', requireRead, async (req, res) => {
    try {
      const storageHealth = await deps.enterpriseBusinessContinuityService.listStorageHealth(getAuth(req).companyId);
      res.json({ data: { storageHealth } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/storage-health', requireWrite, async (req, res) => {
    try {
      const input = storageHealthSchema.parse(req.body);
      const snapshot = await deps.enterpriseBusinessContinuityService.createStorageHealthSnapshot(staffScope(req), input);
      res.status(201).json({ data: { snapshot } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/compliance-records', requireRead, async (req, res) => {
    try {
      const complianceRecords = await deps.enterpriseBusinessContinuityService.listComplianceRecords(getAuth(req).companyId);
      res.json({ data: { complianceRecords } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/compliance-records', requireWrite, async (req, res) => {
    try {
      const input = complianceSchema.parse(req.body);
      const complianceRecord = await deps.enterpriseBusinessContinuityService.createComplianceRecord(staffScope(req), input);
      res.status(201).json({ data: { complianceRecord } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/continuity-alerts', requireRead, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const continuityAlerts = await deps.enterpriseBusinessContinuityService.listContinuityAlerts(getAuth(req).companyId, { status });
      res.json({ data: { continuityAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/continuity-alerts/sync', requireWrite, async (req, res) => {
    try {
      const continuityAlerts = await deps.enterpriseBusinessContinuityService.syncContinuityAlerts(staffScope(req));
      res.json({ data: { continuityAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseBusinessContinuityService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/action-drafts', requireRead, async (req, res) => {
    try {
      const actionDrafts = await deps.enterpriseBusinessContinuityService.listActionDrafts(getAuth(req).companyId);
      res.json({ data: { actionDrafts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    try {
      const input = actionDraftSchema.parse(req.body);
      const actionDraft = await deps.enterpriseBusinessContinuityService.createActionDraft(staffScope(req), input);
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auditLogs = await deps.enterpriseBusinessContinuityService.listAuditLogs(getAuth(req).companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
