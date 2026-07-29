import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseAppBuilderService } from '../services/enterprise-app-builder.service.js';
import { EnterpriseAppBuilderError } from '../services/enterprise-app-builder.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  autoApproveRules: z.record(z.unknown()).optional(),
  deploymentStandards: z.record(z.unknown()).optional(),
  testingRequirements: z.record(z.unknown()).optional(),
  documentationPolicy: z.record(z.unknown()).optional(),
  rollbackPolicy: z.record(z.unknown()).optional(),
  ownerApprovalRequiredAreas: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});
const featureRequestSchema = z.object({
  requestKey: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  naturalLanguageRequest: z.string().trim().min(1),
  requestType: z.string().trim().min(1).max(100),
  riskLevel: z.string().trim().max(50).optional(),
  config: z.record(z.unknown()).optional(),
});
const codeGenerationSchema = z.object({
  featureRequestId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  generationKey: z.string().trim().min(1).max(200),
  artifactType: z.string().trim().min(1).max(100),
  artifactPath: z.string().trim().min(1).max(500),
  language: z.string().trim().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});
const databaseChangePlanSchema = z.object({
  featureRequestId: z.string().uuid(),
  migrationKey: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  impactAnalysis: z.record(z.unknown()).optional(),
  conflictDetection: z.record(z.unknown()).optional(),
  breakingChanges: z.record(z.unknown()).optional(),
  estimatedDurationMinutes: z.number().int().optional(),
});
const registryEntrySchema = z.object({
  registryKey: z.string().trim().min(1).max(200),
  featureType: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  version: z.string().trim().max(50).optional(),
  moduleKey: z.string().trim().max(100).optional(),
  routePath: z.string().trim().max(200).optional(),
  apiPath: z.string().trim().max(200).optional(),
  dependencies: z.record(z.unknown()).optional(),
});
const draftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  featureRequestId: z.string().uuid().optional(),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});
const safeBuildActionSchema = z.object({ actionKey: z.string().trim().min(1).max(100), input: z.record(z.unknown()).optional() });
const rejectSchema = z.object({ reason: z.string().trim().min(1).max(5000) });
const rollbackSchema = z.object({ reason: z.string().trim().min(1).max(5000) });

type RouterDeps = { enterpriseAppBuilderService: EnterpriseAppBuilderService; jwtSecret: string; authService: import('../services/auth.service.js').AuthService };
function getAuth(req: import('express').Request) { return (req as AuthenticatedRequest).auth; }
function getRouteParam(value: string | string[]) { return Array.isArray(value) ? value[0]! : value; }
function staffScope(req: import('express').Request) { const auth = getAuth(req); return { companyId: auth.companyId, userId: auth.userId }; }
function handleError(error: unknown, res: import('express').Response) { if (error instanceof EnterpriseAppBuilderError) { const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT' ? 400 : 500; res.status(status).json({ error: { code: error.code, message: error.message } }); return; } throw error; }

export function createEnterpriseAppBuilderRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission('app_builder:read', 'app_builder:manage', 'platform:read', 'platform:manage');
  const requireWrite = requireAnyPermission('app_builder:write', 'app_builder:manage', 'platform:manage');
  const requireManage = requireAnyPermission('app_builder:manage', 'platform:manage');

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const dashboard = await deps.enterpriseAppBuilderService.getDashboard(auth.companyId); res.json({ data: { dashboard } }); } catch (error) { handleError(error, res); } });
  router.get('/build-monitoring', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const buildMonitoring = await deps.enterpriseAppBuilderService.getBuildMonitoring(auth.companyId); res.json({ data: { buildMonitoring } }); } catch (error) { handleError(error, res); } });
  router.get('/platform-config', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const platformConfig = await deps.enterpriseAppBuilderService.getPlatformConfig(auth.companyId); res.json({ data: { platformConfig } }); } catch (error) { handleError(error, res); } });
  router.put('/platform-config', requireStaffAuth, requireManage, async (req, res) => { const parsed = platformConfigSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } }); return; } try { const platformConfig = await deps.enterpriseAppBuilderService.updatePlatformConfig(staffScope(req), parsed.data); res.json({ data: { platformConfig } }); } catch (error) { handleError(error, res); } });
  router.post('/app-builder-alerts/sync', requireStaffAuth, requireWrite, async (req, res) => { try { const alerts = await deps.enterpriseAppBuilderService.syncAppBuilderAlerts(staffScope(req)); res.json({ data: { alerts } }); } catch (error) { handleError(error, res); } });
  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => { try { const analytics = await deps.enterpriseAppBuilderService.captureAnalytics(staffScope(req)); res.json({ data: { analytics } }); } catch (error) { handleError(error, res); } });
  router.post('/safe-build-actions/execute', requireStaffAuth, requireManage, async (req, res) => { const parsed = safeBuildActionSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid safe build action' } }); return; } try { const result = await deps.enterpriseAppBuilderService.executeSafeBuildAction(staffScope(req), parsed.data); res.json({ data: { result } }); } catch (error) { handleError(error, res); } });
  router.get('/aura-context', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const auraContext = await deps.enterpriseAppBuilderService.buildAuraContext(auth.companyId); res.json({ data: { auraContext } }); } catch (error) { handleError(error, res); } });

  router.get('/feature-requests', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const featureRequests = await deps.enterpriseAppBuilderService.listFeatureRequests(auth.companyId); res.json({ data: { featureRequests } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests', requireStaffAuth, requireWrite, async (req, res) => { const parsed = featureRequestSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid feature request' } }); return; } try { const featureRequest = await deps.enterpriseAppBuilderService.createFeatureRequest(staffScope(req), parsed.data); res.status(201).json({ data: { featureRequest } }); } catch (error) { handleError(error, res); } });
  router.patch('/feature-requests/:featureRequestId', requireStaffAuth, requireWrite, async (req, res) => { const parsed = featureRequestSchema.partial().extend({ workflowStatus: z.string().optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid feature request update' } }); return; } try { const featureRequest = await deps.enterpriseAppBuilderService.updateFeatureRequest(staffScope(req), getRouteParam(req.params.featureRequestId), parsed.data); res.json({ data: { featureRequest } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests/:featureRequestId/analyze-requirements', requireStaffAuth, requireWrite, async (req, res) => { try { const analysis = await deps.enterpriseAppBuilderService.analyzeRequirements(staffScope(req), getRouteParam(req.params.featureRequestId)); res.json({ data: { analysis } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests/:featureRequestId/analyze-architecture-impact', requireStaffAuth, requireWrite, async (req, res) => { try { const analysis = await deps.enterpriseAppBuilderService.analyzeArchitectureImpact(staffScope(req), getRouteParam(req.params.featureRequestId)); res.json({ data: { analysis } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests/:featureRequestId/development-workspace', requireStaffAuth, requireWrite, async (req, res) => { try { const workspace = await deps.enterpriseAppBuilderService.createDevelopmentWorkspace(staffScope(req), getRouteParam(req.params.featureRequestId)); res.json({ data: { workspace } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests/:featureRequestId/run-tests', requireStaffAuth, requireWrite, async (req, res) => { try { const testRun = await deps.enterpriseAppBuilderService.runTestValidation(staffScope(req), getRouteParam(req.params.featureRequestId)); res.json({ data: { testRun } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests/:featureRequestId/preview', requireStaffAuth, requireWrite, async (req, res) => { try { const preview = await deps.enterpriseAppBuilderService.createPreview(staffScope(req), getRouteParam(req.params.featureRequestId)); res.json({ data: { preview } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests/:featureRequestId/submit-for-approval', requireStaffAuth, requireWrite, async (req, res) => { try { const approval = await deps.enterpriseAppBuilderService.submitForApproval(staffScope(req), getRouteParam(req.params.featureRequestId)); res.json({ data: { approval } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests/:featureRequestId/approve', requireStaffAuth, requireManage, async (req, res) => { try { const approval = await deps.enterpriseAppBuilderService.approveFeature(staffScope(req), getRouteParam(req.params.featureRequestId)); res.json({ data: { approval } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests/:featureRequestId/reject', requireStaffAuth, requireManage, async (req, res) => { const parsed = rejectSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid rejection' } }); return; } try { const approval = await deps.enterpriseAppBuilderService.rejectFeature(staffScope(req), getRouteParam(req.params.featureRequestId), parsed.data.reason); res.json({ data: { approval } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-requests/:featureRequestId/deploy', requireStaffAuth, requireManage, async (req, res) => { try { const deployment = await deps.enterpriseAppBuilderService.deployApprovedFeature(staffScope(req), getRouteParam(req.params.featureRequestId)); res.json({ data: { deployment } }); } catch (error) { handleError(error, res); } });

  router.get('/requirements-analyses', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const requirementsAnalyses = await deps.enterpriseAppBuilderService.listRequirementsAnalyses(auth.companyId); res.json({ data: { requirementsAnalyses } }); } catch (error) { handleError(error, res); } });
  router.get('/architecture-impact-analyses', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const architectureImpactAnalyses = await deps.enterpriseAppBuilderService.listArchitectureImpactAnalyses(auth.companyId); res.json({ data: { architectureImpactAnalyses } }); } catch (error) { handleError(error, res); } });
  router.get('/development-workspaces', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const developmentWorkspaces = await deps.enterpriseAppBuilderService.listDevelopmentWorkspaces(auth.companyId); res.json({ data: { developmentWorkspaces } }); } catch (error) { handleError(error, res); } });
  router.get('/code-generation-records', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const codeGenerationRecords = await deps.enterpriseAppBuilderService.listCodeGenerationRecords(auth.companyId); res.json({ data: { codeGenerationRecords } }); } catch (error) { handleError(error, res); } });
  router.post('/code-generation-records', requireStaffAuth, requireWrite, async (req, res) => { const parsed = codeGenerationSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid code generation record' } }); return; } try { const record = await deps.enterpriseAppBuilderService.createCodeGenerationRecord(staffScope(req), parsed.data); res.status(201).json({ data: { record } }); } catch (error) { handleError(error, res); } });
  router.get('/database-change-plans', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const databaseChangePlans = await deps.enterpriseAppBuilderService.listDatabaseChangePlans(auth.companyId); res.json({ data: { databaseChangePlans } }); } catch (error) { handleError(error, res); } });
  router.post('/database-change-plans', requireStaffAuth, requireWrite, async (req, res) => { const parsed = databaseChangePlanSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid database change plan' } }); return; } try { const plan = await deps.enterpriseAppBuilderService.createDatabaseChangePlan(staffScope(req), parsed.data); res.status(201).json({ data: { plan } }); } catch (error) { handleError(error, res); } });
  router.get('/test-runs', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const testRuns = await deps.enterpriseAppBuilderService.listTestRuns(auth.companyId); res.json({ data: { testRuns } }); } catch (error) { handleError(error, res); } });
  router.get('/preview-records', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const previewRecords = await deps.enterpriseAppBuilderService.listPreviewRecords(auth.companyId); res.json({ data: { previewRecords } }); } catch (error) { handleError(error, res); } });
  router.get('/approval-records', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const approvalRecords = await deps.enterpriseAppBuilderService.listApprovalRecords(auth.companyId); res.json({ data: { approvalRecords } }); } catch (error) { handleError(error, res); } });
  router.get('/deployments', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const deployments = await deps.enterpriseAppBuilderService.listDeployments(auth.companyId); res.json({ data: { deployments } }); } catch (error) { handleError(error, res); } });
  router.get('/rollbacks', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const rollbacks = await deps.enterpriseAppBuilderService.listRollbacks(auth.companyId); res.json({ data: { rollbacks } }); } catch (error) { handleError(error, res); } });
  router.post('/deployments/:deploymentId/rollback', requireStaffAuth, requireManage, async (req, res) => { const parsed = rollbackSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid rollback request' } }); return; } try { const rollback = await deps.enterpriseAppBuilderService.rollbackDeployment(staffScope(req), getRouteParam(req.params.deploymentId), parsed.data.reason); res.json({ data: { rollback } }); } catch (error) { handleError(error, res); } });
  router.get('/documentation-updates', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const documentationUpdates = await deps.enterpriseAppBuilderService.listDocumentationUpdates(auth.companyId); res.json({ data: { documentationUpdates } }); } catch (error) { handleError(error, res); } });
  router.get('/feature-registry-entries', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const featureRegistryEntries = await deps.enterpriseAppBuilderService.listFeatureRegistryEntries(auth.companyId); res.json({ data: { featureRegistryEntries } }); } catch (error) { handleError(error, res); } });
  router.post('/feature-registry-entries', requireStaffAuth, requireWrite, async (req, res) => { const parsed = registryEntrySchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid registry entry' } }); return; } try { const entry = await deps.enterpriseAppBuilderService.createFeatureRegistryEntry(staffScope(req), parsed.data); res.status(201).json({ data: { entry } }); } catch (error) { handleError(error, res); } });
  router.get('/app-builder-alerts', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const appBuilderAlerts = await deps.enterpriseAppBuilderService.listAppBuilderAlerts(auth.companyId); res.json({ data: { appBuilderAlerts } }); } catch (error) { handleError(error, res); } });
  router.post('/app-builder-alerts/:alertId/acknowledge', requireStaffAuth, requireWrite, async (req, res) => { try { const appBuilderAlert = await deps.enterpriseAppBuilderService.acknowledgeAppBuilderAlert(staffScope(req), getRouteParam(req.params.alertId)); res.json({ data: { appBuilderAlert } }); } catch (error) { handleError(error, res); } });
  router.post('/action-drafts', requireStaffAuth, requireWrite, async (req, res) => { const parsed = draftSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action draft' } }); return; } try { const actionDraft = await deps.enterpriseAppBuilderService.createActionDraft(staffScope(req), parsed.data); res.status(201).json({ data: { actionDraft } }); } catch (error) { handleError(error, res); } });
  router.get('/audit-logs', requireStaffAuth, requireRead, async (req, res) => { try { const auth = getAuth(req); const auditLogs = await deps.enterpriseAppBuilderService.listAuditLogs(auth.companyId); res.json({ data: { auditLogs } }); } catch (error) { handleError(error, res); } });
  return router;
}
