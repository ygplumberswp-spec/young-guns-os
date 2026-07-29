import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseItOperationsService } from '../services/enterprise-it-operations.service.js';
import { EnterpriseItOperationsError } from '../services/enterprise-it-operations.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({ healthThresholds: z.record(z.unknown()).optional(), monitoringConfig: z.record(z.unknown()).optional(), healingPolicies: z.record(z.unknown()).optional(), deploymentStandards: z.record(z.unknown()).optional(), alertRouting: z.record(z.unknown()).optional(), changeManagementPolicy: z.record(z.unknown()).optional(), auditRetentionDays: z.number().int().min(1).optional() });
const incidentSchema = z.object({ incidentNumber: z.string().trim().max(100).optional(), title: z.string().trim().min(1).max(200), description: z.string().trim().max(5000).optional(), severity: z.string().trim().max(50).optional(), sourceModule: z.string().trim().max(100).optional(), assignedUserId: z.string().uuid().optional(), config: z.record(z.unknown()).optional() });
const selfHealingSchema = z.object({ monitorId: z.string().uuid().optional(), actionType: z.string().trim().min(1).max(100), riskLevel: z.string().trim().max(50).optional(), triggeredBy: z.string().trim().max(200).optional(), config: z.record(z.unknown()).optional() });
const itDraftSchema = z.object({ draftType: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(200), content: z.string().trim().min(1), sourceRecords: z.record(z.unknown()).optional(), aiGenerated: z.boolean().optional() });
const safeRepairSchema = z.object({ repairKey: z.string().trim().min(1).max(100), input: z.record(z.unknown()).optional() });

const healthmonitorsSchema = z.object({
  monitorKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  monitorType: z.string().trim().min(1).max(200),
  targetModule: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const healthsnapshotsSchema = z.object({
  monitorId: z.string().uuid().optional(),
  snapshotKey: z.string().trim().min(1).max(200),
  healthStatus: z.string().trim().max(5000).optional(),
  metrics: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const selfhealingactionsSchema = z.object({
  monitorId: z.string().uuid().optional(),
  actionType: z.string().trim().min(1).max(200),
  riskLevel: z.string().trim().max(5000).optional(),
  triggeredBy: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const bugdetectionsSchema = z.object({
  detectionSource: z.string().trim().min(1).max(200),
  severity: z.string().trim().max(5000).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  sourceModule: z.string().trim().max(5000).optional(),
  sourceEntityId: z.string().uuid().optional(),
  fingerprint: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const rootcauseanalysesSchema = z.object({
  bugDetectionId: z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  rootCause: z.string().trim().max(5000).optional(),
  analysis: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const repairattemptsSchema = z.object({
  bugDetectionId: z.string().uuid().optional(),
  rootCauseAnalysisId: z.string().uuid().optional(),
  repairType: z.string().trim().min(1).max(200),
  riskLevel: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const buildrecordsSchema = z.object({
  buildKey: z.string().trim().min(1).max(200),
  version: z.string().trim().max(5000).optional(),
  branch: z.string().trim().max(5000).optional(),
  commitSha: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const testrunsSchema = z.object({
  runKey: z.string().trim().min(1).max(200),
  testSuite: z.string().trim().min(1).max(200),
  buildRecordId: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
});

const changerequestsSchema = z.object({
  changeNumber: z.string().trim().max(5000).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  riskLevel: z.string().trim().max(5000).optional(),
  scheduledAt: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const deploymentsSchema = z.object({
  deploymentKey: z.string().trim().min(1).max(200),
  environment: z.string().trim().min(1).max(200),
  version: z.string().trim().max(5000).optional(),
  buildRecordId: z.string().uuid().optional(),
  changeRequestId: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
});

const dependencyrecordsSchema = z.object({
  dependencyName: z.string().trim().min(1).max(200),
  dependencyType: z.string().trim().min(1).max(200),
  version: z.string().trim().max(5000).optional(),
  isCritical: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const technicaldebtrecordsSchema = z.object({
  debtKey: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(200),
  severity: z.string().trim().max(5000).optional(),
  estimatedEffortHours: z.number().optional(),
  description: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});

const backupverificationsSchema = z.object({
  backupRef: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(5000).optional(),
  config: z.record(z.unknown()).optional(),
});


type RouterDeps = { enterpriseItOperationsService: EnterpriseItOperationsService; jwtSecret: string; authService: import('../services/auth.service.js').AuthService };
function getAuth(req: import('express').Request) { return (req as AuthenticatedRequest).auth; }
function getRouteParam(value: string | string[]) { return Array.isArray(value) ? value[0]! : value; }
function staffScope(req: import('express').Request) { const auth = getAuth(req); return { companyId: auth.companyId, userId: auth.userId }; }
function handleError(error: unknown, res: import('express').Response) { if (error instanceof EnterpriseItOperationsError) { const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT' ? 400 : 500; res.status(status).json({ error: { code: error.code, message: error.message } }); return; } throw error; }

export function createEnterpriseItOperationsRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission('it_operations:read', 'it_operations:manage', 'ops:read');
  const requireWrite = requireAnyPermission('it_operations:write', 'it_operations:manage', 'ops:write');
  const requireManage = requireAnyPermission('it_operations:manage', 'ops:manage', 'platform:manage');

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const dashboard = await deps.enterpriseItOperationsService.getDashboard(auth.companyId); res.json({ data: { dashboard } }); } catch (error) { handleError(error, res); } });
  router.get('/platform-health-monitoring', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const platformHealthMonitoring = await deps.enterpriseItOperationsService.getPlatformHealthMonitoring(auth.companyId); res.json({ data: { platformHealthMonitoring } }); } catch (error) { handleError(error, res); } });
  router.get('/platform-config', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const platformConfig = await deps.enterpriseItOperationsService.getPlatformConfig(auth.companyId); res.json({ data: { platformConfig } }); } catch (error) { handleError(error, res); } });
  router.put('/platform-config', requireStaffAuth, requireManage, async (req, res) => { const parsed = platformConfigSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } }); return; } try { const platformConfig = await deps.enterpriseItOperationsService.updatePlatformConfig(staffScope(req), parsed.data); res.json({ data: { platformConfig } }); } catch (error) { handleError(error, res); } });
  router.get('/self-healing-actions', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const selfHealingActions = await deps.enterpriseItOperationsService.listSelfHealingActions(auth.companyId); res.json({ data: { selfHealingActions } }); } catch (error) { handleError(error, res); } });
  router.post('/self-healing-actions', requireStaffAuth, requireWrite, async (req, res) => { const parsed = selfHealingSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid self-healing action' } }); return; } try { const selfHealingAction = await deps.enterpriseItOperationsService.recordSelfHealingAction(staffScope(req), parsed.data); res.status(201).json({ data: { selfHealingAction } }); } catch (error) { handleError(error, res); } });
  router.post('/bug-detections/sync', requireStaffAuth, requireWrite, async (req, res) => { try { const bugDetections = await deps.enterpriseItOperationsService.syncBugDetections(staffScope(req)); res.json({ data: { bugDetections } }); } catch (error) { handleError(error, res); } });
  router.get('/incidents', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const incidents = await deps.enterpriseItOperationsService.listIncidents(auth.companyId); res.json({ data: { incidents } }); } catch (error) { handleError(error, res); } });
  router.post('/incidents', requireStaffAuth, requireWrite, async (req, res) => { const parsed = incidentSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid incident' } }); return; } try { const incident = await deps.enterpriseItOperationsService.createIncident(staffScope(req), parsed.data); res.status(201).json({ data: { incident } }); } catch (error) { handleError(error, res); } });
  router.get('/incidents/:incidentId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const incident = await deps.enterpriseItOperationsService.getIncident(auth.companyId, getRouteParam(req.params.incidentId)); if (!incident) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } }); return; } res.json({ data: { incident } }); } catch (error) { handleError(error, res); } });
  router.patch('/incidents/:incidentId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = incidentSchema.partial().extend({ status: z.string().optional(), mitigatedAt: z.string().optional(), resolvedAt: z.string().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid incident update' } }); return; } try { const incident = await deps.enterpriseItOperationsService.updateIncident(staffScope(req), getRouteParam(req.params.incidentId), parsed.data); res.json({ data: { incident } }); } catch (error) { handleError(error, res); } });
  router.get('/it-alerts', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const itAlerts = await deps.enterpriseItOperationsService.listItAlerts(auth.companyId); res.json({ data: { itAlerts } }); } catch (error) { handleError(error, res); } });
  router.post('/it-alerts/sync', requireStaffAuth, requireWrite, async (req, res) => { try { const itAlerts = await deps.enterpriseItOperationsService.syncItAlerts(staffScope(req)); res.json({ data: { itAlerts } }); } catch (error) { handleError(error, res); } });
  router.post('/it-action-drafts', requireStaffAuth, requireWrite, async (req, res) => { const parsed = itDraftSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid IT action draft' } }); return; } try { const itActionDraft = await deps.enterpriseItOperationsService.createItActionDraft(staffScope(req), parsed.data); res.status(201).json({ data: { itActionDraft } }); } catch (error) { handleError(error, res); } });
  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => { try { const analytics = await deps.enterpriseItOperationsService.captureAnalytics(staffScope(req)); res.json({ data: { analytics } }); } catch (error) { handleError(error, res); } });
  router.get('/aura-context', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const auraContext = await deps.enterpriseItOperationsService.buildAuraContext(auth.companyId); res.json({ data: { auraContext } }); } catch (error) { handleError(error, res); } });
  router.post('/safe-repairs/execute', requireStaffAuth, requireManage, async (req, res) => { const parsed = safeRepairSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid safe repair request' } }); return; } try { const result = await deps.enterpriseItOperationsService.executeSafeRepair(staffScope(req), parsed.data); res.json({ data: { result } }); } catch (error) { handleError(error, res); } });
  router.post('/health-signals/capture', requireStaffAuth, requireWrite, async (req, res) => { try { await deps.enterpriseItOperationsService.captureHealthSignals(staffScope(req)); res.json({ data: { captured: true } }); } catch (error) { handleError(error, res); } });

  router.get('/database-health-snapshots', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const databaseHealthSnapshots = await deps.enterpriseItOperationsService.listDatabaseHealthSnapshots(auth.companyId);
      res.json({ data: { databaseHealthSnapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/api-reliability-snapshots', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const apiReliabilitySnapshots = await deps.enterpriseItOperationsService.listApiReliabilitySnapshots(auth.companyId);
      res.json({ data: { apiReliabilitySnapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ai-provider-health', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const aiProviderHealth = await deps.enterpriseItOperationsService.listAiProviderHealthSnapshots(auth.companyId);
      res.json({ data: { aiProviderHealth } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/integration-health', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const integrationHealth = await deps.enterpriseItOperationsService.listIntegrationHealthSnapshots(auth.companyId);
      res.json({ data: { integrationHealth } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/performance-snapshots', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const performanceSnapshots = await deps.enterpriseItOperationsService.listPerformanceSnapshots(auth.companyId);
      res.json({ data: { performanceSnapshots } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/production-readiness-dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const productionReadinessDashboard = await deps.enterpriseItOperationsService.getProductionReadinessDashboard(auth.companyId);
      res.json({ data: { productionReadinessDashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/mission-control-dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const missionControlDashboard = await deps.enterpriseItOperationsService.getMissionControlDashboard(auth.companyId);
      res.json({ data: { missionControlDashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/security-dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const securityDashboard = await deps.enterpriseItOperationsService.getSecurityDashboard(auth.companyId);
      res.json({ data: { securityDashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ai-resilience-status', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const aiResilienceStatus = await deps.enterpriseItOperationsService.getAiResilienceStatus(auth.companyId);
      res.json({ data: { aiResilienceStatus } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/integration-monitoring', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const integrationMonitoring = await deps.enterpriseItOperationsService.getIntegrationMonitoringSummary(auth.companyId);
      res.json({ data: { integrationMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/integration-dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const integrationDashboard = await deps.enterpriseItOperationsService.getIntegrationExecutiveDashboard(auth.companyId);
      res.json({ data: { integrationDashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/ai-operations-allowance', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const aiOperationsAllowance = await deps.enterpriseItOperationsService.getAiOperationsAllowance(auth.companyId);
      res.json({ data: { aiOperationsAllowance } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/it-alerts/:alertId/acknowledge', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const itAlert = await deps.enterpriseItOperationsService.acknowledgeItAlert(staffScope(req), getRouteParam(req.params.alertId));
      res.json({ data: { itAlert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const auditLogs = await deps.enterpriseItOperationsService.listAuditLogs(auth.companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/health-monitors', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listHealthMonitors(auth.companyId); res.json({ data: { healthmonitors: items } }); } catch (error) { handleError(error, res); } });
  router.post('/health-monitors', requireStaffAuth, requireWrite, async (req, res) => { const parsed = healthmonitorsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createHealthMonitor(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/health-monitors/:healthMonitorId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getHealthMonitor(auth.companyId, getRouteParam(req.params.healthMonitorId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/health-monitors/:healthMonitorId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = healthmonitorsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateHealthMonitor(staffScope(req), getRouteParam(req.params.healthMonitorId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/health-snapshots', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listHealthSnapshots(auth.companyId); res.json({ data: { healthsnapshots: items } }); } catch (error) { handleError(error, res); } });
  router.post('/health-snapshots', requireStaffAuth, requireWrite, async (req, res) => { const parsed = healthsnapshotsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createHealthSnapshot(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/health-snapshots/:healthSnapshotId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getHealthSnapshot(auth.companyId, getRouteParam(req.params.healthSnapshotId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/self-healing-actions/:selfHealingActionId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getSelfHealingAction(auth.companyId, getRouteParam(req.params.selfHealingActionId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/self-healing-actions/:selfHealingActionId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = selfhealingactionsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateSelfHealingAction(staffScope(req), getRouteParam(req.params.selfHealingActionId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/bug-detections', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listBugDetections(auth.companyId); res.json({ data: { bugdetections: items } }); } catch (error) { handleError(error, res); } });
  router.post('/bug-detections', requireStaffAuth, requireWrite, async (req, res) => { const parsed = bugdetectionsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createBugDetection(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/bug-detections/:bugDetectionId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getBugDetection(auth.companyId, getRouteParam(req.params.bugDetectionId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/bug-detections/:bugDetectionId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = bugdetectionsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateBugDetection(staffScope(req), getRouteParam(req.params.bugDetectionId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/root-cause-analyses', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listRootCauseAnalyses(auth.companyId); res.json({ data: { rootcauseanalyses: items } }); } catch (error) { handleError(error, res); } });
  router.post('/root-cause-analyses', requireStaffAuth, requireWrite, async (req, res) => { const parsed = rootcauseanalysesSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createRootCauseAnalysis(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/root-cause-analyses/:rootCauseAnalysisId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getRootCauseAnalysis(auth.companyId, getRouteParam(req.params.rootCauseAnalysisId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/root-cause-analyses/:rootCauseAnalysisId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = rootcauseanalysesSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateRootCauseAnalysis(staffScope(req), getRouteParam(req.params.rootCauseAnalysisId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/repair-attempts', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listRepairAttempts(auth.companyId); res.json({ data: { repairattempts: items } }); } catch (error) { handleError(error, res); } });
  router.post('/repair-attempts', requireStaffAuth, requireWrite, async (req, res) => { const parsed = repairattemptsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createRepairAttempt(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/repair-attempts/:repairAttemptId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getRepairAttempt(auth.companyId, getRouteParam(req.params.repairAttemptId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/repair-attempts/:repairAttemptId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = repairattemptsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateRepairAttempt(staffScope(req), getRouteParam(req.params.repairAttemptId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/build-records', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listBuildRecords(auth.companyId); res.json({ data: { buildrecords: items } }); } catch (error) { handleError(error, res); } });
  router.post('/build-records', requireStaffAuth, requireWrite, async (req, res) => { const parsed = buildrecordsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createBuildRecord(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/build-records/:buildRecordId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getBuildRecord(auth.companyId, getRouteParam(req.params.buildRecordId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/build-records/:buildRecordId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = buildrecordsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateBuildRecord(staffScope(req), getRouteParam(req.params.buildRecordId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/test-runs', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listTestRuns(auth.companyId); res.json({ data: { testruns: items } }); } catch (error) { handleError(error, res); } });
  router.post('/test-runs', requireStaffAuth, requireWrite, async (req, res) => { const parsed = testrunsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createTestRun(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/test-runs/:testRunId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getTestRun(auth.companyId, getRouteParam(req.params.testRunId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/test-runs/:testRunId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = testrunsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateTestRun(staffScope(req), getRouteParam(req.params.testRunId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/change-requests', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listChangeRequests(auth.companyId); res.json({ data: { changerequests: items } }); } catch (error) { handleError(error, res); } });
  router.post('/change-requests', requireStaffAuth, requireWrite, async (req, res) => { const parsed = changerequestsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createChangeRequest(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/change-requests/:changeRequestId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getChangeRequest(auth.companyId, getRouteParam(req.params.changeRequestId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/change-requests/:changeRequestId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = changerequestsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateChangeRequest(staffScope(req), getRouteParam(req.params.changeRequestId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/deployments', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listDeployments(auth.companyId); res.json({ data: { deployments: items } }); } catch (error) { handleError(error, res); } });
  router.post('/deployments', requireStaffAuth, requireWrite, async (req, res) => { const parsed = deploymentsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createDeployment(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/deployments/:deploymentId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getDeployment(auth.companyId, getRouteParam(req.params.deploymentId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/deployments/:deploymentId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = deploymentsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateDeployment(staffScope(req), getRouteParam(req.params.deploymentId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/dependency-records', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listDependencyRecords(auth.companyId); res.json({ data: { dependencyrecords: items } }); } catch (error) { handleError(error, res); } });
  router.post('/dependency-records', requireStaffAuth, requireWrite, async (req, res) => { const parsed = dependencyrecordsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createDependencyRecord(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/dependency-records/:dependencyRecordId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getDependencyRecord(auth.companyId, getRouteParam(req.params.dependencyRecordId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/dependency-records/:dependencyRecordId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = dependencyrecordsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateDependencyRecord(staffScope(req), getRouteParam(req.params.dependencyRecordId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/technical-debt-records', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listTechnicalDebtRecords(auth.companyId); res.json({ data: { technicaldebtrecords: items } }); } catch (error) { handleError(error, res); } });
  router.post('/technical-debt-records', requireStaffAuth, requireWrite, async (req, res) => { const parsed = technicaldebtrecordsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createTechnicalDebtRecord(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/technical-debt-records/:technicalDebtRecordId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getTechnicalDebtRecord(auth.companyId, getRouteParam(req.params.technicalDebtRecordId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/technical-debt-records/:technicalDebtRecordId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = technicaldebtrecordsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateTechnicalDebtRecord(staffScope(req), getRouteParam(req.params.technicalDebtRecordId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/backup-verifications', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const items = await deps.enterpriseItOperationsService.listBackupVerifications(auth.companyId); res.json({ data: { backupverifications: items } }); } catch (error) { handleError(error, res); } });
  router.post('/backup-verifications', requireStaffAuth, requireWrite, async (req, res) => { const parsed = backupverificationsSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } }); return; } try { const item = await deps.enterpriseItOperationsService.createBackupVerification(staffScope(req), parsed.data); res.status(201).json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.get('/backup-verifications/:backupVerificationId', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const item = await deps.enterpriseItOperationsService.getBackupVerification(auth.companyId, getRouteParam(req.params.backupVerificationId)); if (!item) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }); return; } res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  router.patch('/backup-verifications/:backupVerificationId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = backupverificationsSchema.partial().extend({ workflowStatus: z.string().optional(), healthStatus: z.string().optional(), deploymentStatus: z.string().optional(), verificationStatus: z.string().optional(), verificationPassed: z.boolean().optional(), success: z.boolean().optional(), outcome: z.string().optional(), executedAt: z.string().optional(), attemptedAt: z.string().optional(), approvedAt: z.string().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), passedCount: z.number().int().optional(), failedCount: z.number().int().optional(), skippedCount: z.number().int().optional(), isActive: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid update' } }); return; } try { const item = await deps.enterpriseItOperationsService.updateBackupVerification(staffScope(req), getRouteParam(req.params.backupVerificationId), parsed.data); res.json({ data: { item } }); } catch (error) { handleError(error, res); } });
  return router;
}