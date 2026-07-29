import { Router } from 'express';
import { z } from 'zod';
import type { MobileService } from '../services/mobile.service.js';
import type { NotificationService } from '../services/notification.service.js';
import type { MobileSyncService } from '../services/mobile-sync.service.js';
import type { TechnicianWorkflowService } from '../services/technician-workflow.service.js';
import { TechnicianWorkflowError } from '../services/technician-workflow.service.js';
import type { MobileWorkforceService } from '../services/mobile-workforce.service.js';
import { MobileWorkforceError } from '../services/mobile-workforce.service.js';
import type { RecommendationsService } from '../services/recommendations.service.js';
import type { TeamService } from '../services/team.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  requirePortalPermission,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const addJobNoteSchema = z.object({ note: z.string().trim().min(1) });
const submitCompletionSchema = z.object({
  summary: z.string().trim().min(1),
  checklist: z.record(z.boolean()).optional(),
  photoMetadata: z
    .array(
      z.object({
        filename: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});
const notificationPreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      notificationType: z.enum([
        'job_assigned',
        'schedule_changed',
        'approval_request',
        'invoice_reminder',
        'system_alert',
        'urgent_dispatch',
        'inventory_request',
        'company_announcement',
      ]),
      enabled: z.boolean(),
    }),
  ),
});
const queueSyncSchema = z.object({
  scope: z.enum(['owner', 'technician', 'customer']),
  deviceId: z.string().optional(),
  resourceType: z.string().min(1),
  resourceId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).optional(),
  clientVersion: z.string().optional(),
});
const createTimeEntrySchema = z.object({
  entryType: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end', 'travel', 'job_time']),
  jobId: z.string().uuid().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  notes: z.string().optional(),
});
const submitInventoryUsageSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  scanCode: z.string().optional(),
  notes: z.string().optional(),
});
const submitDocumentationSchema = z.object({
  documentationType: z.enum([
    'photo',
    'video',
    'document',
    'inspection_form',
    'safety_checklist',
    'customer_signature',
  ]),
  title: z.string().trim().min(1),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
const createWorkforceRequestSchema = z.object({
  requestType: z.enum([
    'inventory_allocation',
    'inventory_request',
    'inventory_shortage',
    'overtime_request',
    'schedule_change',
    'general_request',
  ]),
  subject: z.string().trim().min(1),
  message: z.string().trim().min(1),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).optional(),
});
const reportConflictSchema = z.object({
  queueItemId: z.string().uuid().optional(),
  resourceType: z.string().min(1),
  resourceId: z.string().uuid().optional(),
  clientVersion: z.string().optional(),
  serverVersion: z.string().optional(),
  clientPayload: z.record(z.unknown()).optional(),
  serverPayload: z.record(z.unknown()).optional(),
});
const resolveConflictSchema = z.object({
  resolution: z.enum(['keep_client', 'keep_server', 'merge']),
  notes: z.string().optional(),
});

type MobileRouterDeps = {
  mobileService: MobileService;
  notificationService: NotificationService;
  mobileSyncService: MobileSyncService;
  technicianWorkflowService: TechnicianWorkflowService;
  mobileWorkforceService: MobileWorkforceService;
  recommendationsService: RecommendationsService;
  teamService: TeamService;
  portalAuthService: PortalAuthService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getPortalAuth(req: import('express').Request) {
  return (req as PortalAuthenticatedRequest).portalAuth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createMobileRouter({
  mobileService,
  notificationService,
  mobileSyncService,
  technicianWorkflowService,
  mobileWorkforceService,
  recommendationsService,
  teamService,
  portalAuthService,
  jwtSecret,
  authService,
}: MobileRouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret, authService });
  const requirePortalAuth = createPortalAuthMiddleware({ jwtSecret, portalAuthService });
  const requireMobileRead = requireAnyPermission('mobile:read', 'mobile:write');
  const requireMobileWrite = requireAnyPermission('mobile:write', 'jobs:write');
  const requireOwnerAccess = requireAnyPermission(
    'mobile:read',
    'intelligence:read',
    'finance:read',
    'agents:read',
  );
  const requireTechnicianAccess = requireAnyPermission('mobile:read', 'jobs:read', 'dispatch:read');

  const ownerRouter = Router();
  ownerRouter.use(requireStaffAuth);
  ownerRouter.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  ownerRouter.get('/dashboard', requireOwnerAccess, async (req, res) => {
    const auth = getAuth(req);
    const dashboard = await mobileService.getOwnerDashboard(auth);
    res.json({ data: { dashboard } });
  });

  ownerRouter.get('/jobs', requireOwnerAccess, async (req, res) => {
    const { companyId } = getAuth(req);
    const jobs = await mobileService.getOwnerJobsOverview(companyId);
    res.json({ data: { jobs } });
  });

  ownerRouter.get('/revenue', requireAnyPermission('finance:read', 'mobile:read'), async (req, res) => {
    const { companyId } = getAuth(req);
    const revenue = await mobileService.getOwnerRevenueSummary(companyId);
    res.json({ data: { revenue } });
  });

  ownerRouter.get('/invoices', requireAnyPermission('finance:read', 'mobile:read'), async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await mobileService.getOwnerDashboard({ companyId, userId: getAuth(req).userId });
    res.json({ data: { outstandingInvoices: dashboard.summary.outstandingInvoices } });
  });

  ownerRouter.get('/approvals', requireOwnerAccess, async (req, res) => {
    const { companyId } = getAuth(req);
    const approvals = await mobileService.getOwnerApprovals(companyId);
    res.json({ data: { approvals } });
  });

  ownerRouter.get('/alerts', requireOwnerAccess, async (req, res) => {
    const { companyId } = getAuth(req);
    const alerts = await mobileService.getOwnerAlerts(companyId);
    res.json({ data: { alerts } });
  });

  ownerRouter.get('/recommendations', requireOwnerAccess, async (req, res) => {
    const { companyId } = getAuth(req);
    const result = await recommendationsService.getRecommendations(companyId);
    res.json({ data: result });
  });

  ownerRouter.get('/notifications', requireMobileRead, async (req, res) => {
    const auth = getAuth(req);
    const notifications = await notificationService.listForStaff(auth);
    res.json({ data: { notifications } });
  });

  ownerRouter.patch('/notifications/:id/read', requireMobileRead, async (req, res) => {
    const auth = getAuth(req);
    const updated = await notificationService.markReadStaff(auth, getRouteParam(req.params.id));
    if (!updated) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
      return;
    }
    res.json({ data: { success: true } });
  });

  ownerRouter.get('/notifications/preferences', requireMobileRead, async (req, res) => {
    const auth = getAuth(req);
    const preferences = await notificationService.getStaffPreferences(auth);
    res.json({ data: { preferences } });
  });

  ownerRouter.patch('/notifications/preferences', requireMobileRead, async (req, res) => {
    const parsed = notificationPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid preferences' } });
      return;
    }
    const auth = getAuth(req);
    const preferences = await notificationService.updateStaffPreferences(auth, parsed.data);
    res.json({ data: { preferences } });
  });

  ownerRouter.get('/sync', requireMobileRead, async (req, res) => {
    const auth = getAuth(req);
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
    const [syncState, pendingActions, queue] = await Promise.all([
      mobileSyncService.getStaffSyncState({ ...auth, scope: 'owner' }, deviceId),
      mobileSyncService.listStaffPendingActions(auth.companyId, auth.userId),
      mobileSyncService.listStaffSyncQueue(auth.companyId, auth.userId),
    ]);
    res.json({ data: { syncState, pendingActions, queue } });
  });

  ownerRouter.post('/sync', requireMobileRead, async (req, res) => {
    const parsed = queueSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sync payload' } });
      return;
    }
    const auth = getAuth(req);
    const [item, syncState] = await Promise.all([
      mobileSyncService.queueStaffSyncItem({ ...auth, scope: 'owner' }, parsed.data),
      mobileSyncService.touchStaffSync({ ...auth, scope: 'owner' }, parsed.data.deviceId),
    ]);
    res.status(201).json({ data: { item, syncState } });
  });

  ownerRouter.get('/aura/context', requireOwnerAccess, async (req, res) => {
    const auth = getAuth(req);
    const context = await mobileService.buildOwnerAuraContext(auth);
    res.json({ data: { context } });
  });

  const technicianRouter = Router();
  technicianRouter.use(requireStaffAuth);
  technicianRouter.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  technicianRouter.get('/dashboard', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const dashboard = await mobileWorkforceService.getWorkforceDashboard(auth);
    res.json({ data: { dashboard } });
  });

  technicianRouter.get('/workforce/dashboard', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const dashboard = await mobileWorkforceService.getWorkforceDashboard(auth);
    res.json({ data: { dashboard } });
  });

  technicianRouter.get('/workforce/jobs', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const jobs = await mobileWorkforceService.listWorkforceJobs(auth);
    res.json({ data: jobs });
  });

  technicianRouter.get('/jobs', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const jobs = await mobileService.listAssignedJobs(auth);
    res.json({ data: { jobs } });
  });

  technicianRouter.get('/workforce/jobs/:jobId', requireTechnicianAccess, async (req, res) => {
    try {
      const auth = getAuth(req);
      const workspace = await mobileWorkforceService.getJobWorkspace(auth, getRouteParam(req.params.jobId));
      res.json({ data: { workspace } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  technicianRouter.get('/workforce/route', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const route = await mobileWorkforceService.getRouteIntelligence(auth);
    res.json({ data: { route } });
  });

  technicianRouter.get('/workforce/inventory', requireAnyPermission('inventory:read', 'mobile:read'), async (req, res) => {
    const auth = getAuth(req);
    const inventory = await mobileWorkforceService.getInventoryCentre(auth);
    res.json({ data: { inventory } });
  });

  technicianRouter.get('/workforce/time', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const entries = await mobileWorkforceService.listTimeEntries(auth);
    res.json({ data: { entries } });
  });

  technicianRouter.post('/workforce/time', requireMobileWrite, async (req, res) => {
    const parsed = createTimeEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid time entry payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const entry = await mobileWorkforceService.createTimeEntry(auth, parsed.data);
      res.status(201).json({ data: { entry } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  technicianRouter.post('/workforce/jobs/:jobId/inventory', requireMobileWrite, async (req, res) => {
    const parsed = submitInventoryUsageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid inventory usage payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const usage = await mobileWorkforceService.submitInventoryUsage(
        auth,
        getRouteParam(req.params.jobId),
        parsed.data,
      );
      res.status(201).json({ data: { usage } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  technicianRouter.post('/workforce/jobs/:jobId/documentation', requireMobileWrite, async (req, res) => {
    const parsed = submitDocumentationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid documentation payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const documentation = await mobileWorkforceService.submitJobDocumentation(
        auth,
        getRouteParam(req.params.jobId),
        parsed.data,
      );
      res.status(201).json({ data: { documentation } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  technicianRouter.get('/workforce/requests', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const requests = await mobileWorkforceService.listRequests(auth);
    res.json({ data: { requests } });
  });

  technicianRouter.post('/workforce/requests', requireMobileWrite, async (req, res) => {
    const parsed = createWorkforceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid workforce request payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const request = await mobileWorkforceService.createRequest(auth, parsed.data);
      res.status(201).json({ data: { request } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  technicianRouter.get('/workforce/offline', requireMobileRead, async (req, res) => {
    const auth = getAuth(req);
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
    const bundle = await mobileWorkforceService.getOfflineBundle(auth, deviceId);
    res.json({ data: { bundle } });
  });

  technicianRouter.post('/workforce/sync/process', requireMobileRead, async (req, res) => {
    const auth = getAuth(req);
    const result = await mobileSyncService.processStaffSyncQueue(auth.companyId, auth.userId);
    res.json({ data: { result } });
  });

  technicianRouter.post('/workforce/sync/conflicts', requireMobileWrite, async (req, res) => {
    const parsed = reportConflictSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid conflict payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const conflict = await mobileWorkforceService.reportSyncConflict(auth, parsed.data);
      res.status(201).json({ data: { conflict } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  technicianRouter.patch('/workforce/sync/conflicts/:conflictId', requireMobileWrite, async (req, res) => {
    const parsed = resolveConflictSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid conflict resolution payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const conflict = await mobileWorkforceService.resolveSyncConflict(
        auth,
        getRouteParam(req.params.conflictId),
        parsed.data,
      );
      res.json({ data: { conflict } });
    } catch (error) {
      handleWorkforceError(res, error);
    }
  });

  technicianRouter.get('/workforce/notifications', requireMobileRead, async (req, res) => {
    const auth = getAuth(req);
    const centre = await mobileWorkforceService.getNotificationCentre(auth);
    res.json({ data: centre });
  });

  technicianRouter.get('/workforce/aura/context', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const context = await mobileWorkforceService.buildWorkforceAuraContext(auth);
    res.json({ data: { context } });
  });

  technicianRouter.get('/schedule', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const schedule = await mobileService.getTechnicianSchedule(auth, date);
    res.json({ data: { schedule } });
  });

  technicianRouter.get('/jobs/:id/customer', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const details = await mobileService.getTechnicianCustomerDetails(auth, getRouteParam(req.params.id));
    if (!details) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assigned job not found' } });
      return;
    }
    res.json({ data: { details } });
  });

  technicianRouter.get('/fleet', requireAnyPermission('fleet:read', 'mobile:read'), async (req, res) => {
    const auth = getAuth(req);
    const fleet = await mobileService.getTechnicianFleetInfo(auth);
    res.json({ data: { fleet } });
  });

  technicianRouter.get('/notifications', requireMobileRead, async (req, res) => {
    const auth = getAuth(req);
    const notifications = await notificationService.listForStaff(auth);
    res.json({ data: { notifications } });
  });

  technicianRouter.get('/sync', requireMobileRead, async (req, res) => {
    const auth = getAuth(req);
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
    const [syncState, pendingActions, queue] = await Promise.all([
      mobileSyncService.getStaffSyncState({ ...auth, scope: 'technician' }, deviceId),
      mobileSyncService.listStaffPendingActions(auth.companyId, auth.userId),
      mobileSyncService.listStaffSyncQueue(auth.companyId, auth.userId),
    ]);
    res.json({ data: { syncState, pendingActions, queue } });
  });

  technicianRouter.post('/sync', requireMobileRead, async (req, res) => {
    const parsed = queueSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sync payload' } });
      return;
    }
    const auth = getAuth(req);
    const [item, syncState] = await Promise.all([
      mobileSyncService.queueStaffSyncItem({ ...auth, scope: 'technician' }, parsed.data),
      mobileSyncService.touchStaffSync({ ...auth, scope: 'technician' }, parsed.data.deviceId),
    ]);
    res.status(201).json({ data: { item, syncState } });
  });

  technicianRouter.get('/aura/context', requireTechnicianAccess, async (req, res) => {
    const auth = getAuth(req);
    const [context, workforceContext] = await Promise.all([
      mobileService.buildTechnicianAuraContext(auth),
      mobileWorkforceService.buildWorkforceAuraContext(auth),
    ]);
    res.json({ data: { context, workforceContext } });
  });

  technicianRouter.post('/jobs/:id/accept', requireMobileWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const job = await technicianWorkflowService.acceptJob(auth, getRouteParam(req.params.id));
      res.json({ data: { job } });
    } catch (error) {
      handleTechnicianError(res, error);
    }
  });

  technicianRouter.post('/jobs/:id/start', requireMobileWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const job = await technicianWorkflowService.startJob(auth, getRouteParam(req.params.id));
      res.json({ data: { job } });
    } catch (error) {
      handleTechnicianError(res, error);
    }
  });

  technicianRouter.post('/jobs/:id/pause', requireMobileWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const job = await technicianWorkflowService.pauseJob(auth, getRouteParam(req.params.id));
      res.json({ data: { job } });
    } catch (error) {
      handleTechnicianError(res, error);
    }
  });

  technicianRouter.post('/jobs/:id/complete', requireMobileWrite, async (req, res) => {
    try {
      const auth = getAuth(req);
      const job = await technicianWorkflowService.completeJob(auth, getRouteParam(req.params.id));
      res.json({ data: { job } });
    } catch (error) {
      handleTechnicianError(res, error);
    }
  });

  technicianRouter.post('/jobs/:id/notes', requireMobileWrite, async (req, res) => {
    const parsed = addJobNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid note payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const job = await technicianWorkflowService.addJobNote(auth, getRouteParam(req.params.id), parsed.data);
      res.json({ data: { job } });
    } catch (error) {
      handleTechnicianError(res, error);
    }
  });

  technicianRouter.post('/jobs/:id/completion', requireMobileWrite, async (req, res) => {
    const parsed = submitCompletionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid completion payload' } });
      return;
    }
    try {
      const auth = getAuth(req);
      const result = await technicianWorkflowService.submitCompletionFoundation(
        auth,
        getRouteParam(req.params.id),
        parsed.data,
      );
      res.status(201).json({ data: result });
    } catch (error) {
      handleTechnicianError(res, error);
    }
  });

  const customerRouter = Router();
  customerRouter.use(requirePortalAuth);

  customerRouter.get('/dashboard', requirePortalPermission('portal.dashboard:read'), async (req, res) => {
    const auth = getPortalAuth(req);
    const dashboard = await mobileService.getCustomerDashboard({
      companyId: auth.companyId,
      customerId: auth.customerId,
      portalUserId: auth.portalUserId,
      permissions: auth.permissions,
    });
    res.json({ data: { dashboard } });
  });

  customerRouter.get('/jobs', requirePortalPermission('portal.jobs:read'), async (req, res) => {
    const auth = getPortalAuth(req);
    const jobs = await mobileService.getCustomerJobs({
      companyId: auth.companyId,
      customerId: auth.customerId,
      portalUserId: auth.portalUserId,
      permissions: auth.permissions,
    });
    res.json({ data: jobs });
  });

  customerRouter.get('/invoices', requirePortalPermission('portal.invoices:read'), async (req, res) => {
    const auth = getPortalAuth(req);
    const invoices = await mobileService.getCustomerInvoices({
      companyId: auth.companyId,
      customerId: auth.customerId,
      portalUserId: auth.portalUserId,
      permissions: auth.permissions,
    });
    res.json({ data: invoices });
  });

  customerRouter.get('/documents', requirePortalPermission('portal.documents:read'), async (req, res) => {
    const auth = getPortalAuth(req);
    const documents = await mobileService.getCustomerDocuments({
      companyId: auth.companyId,
      customerId: auth.customerId,
      portalUserId: auth.portalUserId,
      permissions: auth.permissions,
    });
    res.json({ data: documents });
  });

  customerRouter.get('/communications', requirePortalPermission('portal.communications:read'), async (req, res) => {
    const auth = getPortalAuth(req);
    const communications = await mobileService.getCustomerCommunications({
      companyId: auth.companyId,
      customerId: auth.customerId,
      portalUserId: auth.portalUserId,
      permissions: auth.permissions,
    });
    res.json({ data: communications });
  });

  customerRouter.get('/notifications', async (req, res) => {
    const auth = getPortalAuth(req);
    const notifications = await notificationService.listForPortal({
      companyId: auth.companyId,
      portalUserId: auth.portalUserId,
    });
    res.json({ data: { notifications } });
  });

  customerRouter.patch('/notifications/:id/read', async (req, res) => {
    const auth = getPortalAuth(req);
    const updated = await notificationService.markReadPortal(
      { companyId: auth.companyId, portalUserId: auth.portalUserId },
      getRouteParam(req.params.id),
    );
    if (!updated) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
      return;
    }
    res.json({ data: { success: true } });
  });

  customerRouter.get('/sync', async (req, res) => {
    const auth = getPortalAuth(req);
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
    const syncState = await mobileSyncService.getPortalSyncState(
      { companyId: auth.companyId, portalUserId: auth.portalUserId, scope: 'customer' },
      deviceId,
    );
    res.json({ data: { syncState, pendingActions: [], queue: [] } });
  });

  customerRouter.post('/sync', async (req, res) => {
    const parsed = queueSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid sync payload' } });
      return;
    }
    const auth = getPortalAuth(req);
    const [item, syncState] = await Promise.all([
      mobileSyncService.queuePortalSyncItem(
        { companyId: auth.companyId, portalUserId: auth.portalUserId, scope: 'customer' },
        parsed.data,
      ),
      mobileSyncService.touchPortalSync(
        { companyId: auth.companyId, portalUserId: auth.portalUserId, scope: 'customer' },
        parsed.data.deviceId,
      ),
    ]);
    res.status(201).json({ data: { item, syncState } });
  });

  customerRouter.get('/aura/context', requirePortalPermission('portal.dashboard:read'), async (req, res) => {
    const auth = getPortalAuth(req);
    const context = await mobileService.buildCustomerAuraContext({
      companyId: auth.companyId,
      customerId: auth.customerId,
      portalUserId: auth.portalUserId,
      permissions: auth.permissions,
    });
    res.json({ data: { context } });
  });

  router.use('/owner', ownerRouter);
  router.use('/technician', technicianRouter);
  router.use('/customer', customerRouter);

  return router;
}

function handleWorkforceError(res: import('express').Response, error: unknown) {
  if (error instanceof MobileWorkforceError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}

function handleTechnicianError(res: import('express').Response, error: unknown) {
  if (error instanceof TechnicianWorkflowError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}
