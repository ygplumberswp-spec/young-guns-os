import { Router } from 'express';
import type { CorporateDepartmentId, DepartmentRoutineTaskStatus } from '@titan/shared';
import { getCorporateDepartmentById } from '@titan/shared';
import type { CorporateDepartmentHubService } from '../services/corporate-department-hub.service.js';
import type { DepartmentRoutineTaskService } from '../services/department-routine-task.service.js';
import { DepartmentRoutineTaskError } from '../services/department-routine-task.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

type CorporateDepartmentsRouterDeps = {
  corporateDepartmentHubService: CorporateDepartmentHubService;
  departmentRoutineTaskService: DepartmentRoutineTaskService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function taskIdParam(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? '';
  return '';
}

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function handleTaskError(res: import('express').Response, err: unknown): void {
  if (err instanceof DepartmentRoutineTaskError) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  throw err;
}

export function createCorporateDepartmentsRouter({
  corporateDepartmentHubService,
  departmentRoutineTaskService,
  jwtSecret,
  authService,
}: CorporateDepartmentsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get(
    '/hub',
    requireAnyPermission('executive:read', 'analytics:read', 'ops:read', '*'),
    async (req, res) => {
      const auth = getAuth(req);
      const hub = await corporateDepartmentHubService.getHub(auth.companyId, auth.permissions);
      res.json({ data: hub });
    },
  );

  router.post(
    '/tasks/generate',
    requireAnyPermission('executive:read', '*'),
    async (req, res) => {
      const auth = getAuth(req);
      const created = await departmentRoutineTaskService.ensureCurrentPeriodTasks(auth.companyId);
      const total = await departmentRoutineTaskService.countCompanyTasks(auth.companyId);
      res.json({ data: { created, total } });
    },
  );

  router.get('/tasks/:taskId/audit', requireAnyPermission('executive:read', 'ops:read', '*'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const audit = await departmentRoutineTaskService.listTaskAudit(
        { companyId: auth.companyId, userId: auth.userId, permissions: auth.permissions },
        taskIdParam(req.params.taskId),
      );
      res.json({ data: audit });
    } catch (err) {
      handleTaskError(res, err);
    }
  });

  router.post('/tasks/:taskId/complete', requireAnyPermission('executive:read', 'ops:read', '*'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const task = await departmentRoutineTaskService.completeTask(
        { companyId: auth.companyId, userId: auth.userId, permissions: auth.permissions },
        taskIdParam(req.params.taskId),
      );
      res.json({ data: task });
    } catch (err) {
      handleTaskError(res, err);
    }
  });

  router.post('/tasks/:taskId/skip', requireAnyPermission('executive:read', 'ops:read', '*'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const task = await departmentRoutineTaskService.skipTask(
        { companyId: auth.companyId, userId: auth.userId, permissions: auth.permissions },
        taskIdParam(req.params.taskId),
        typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      );
      res.json({ data: task });
    } catch (err) {
      handleTaskError(res, err);
    }
  });

  router.post('/tasks/:taskId/approve', requireAnyPermission('executive:read', '*'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const task = await departmentRoutineTaskService.approveTask(
        { companyId: auth.companyId, userId: auth.userId, permissions: auth.permissions },
        taskIdParam(req.params.taskId),
      );
      res.json({ data: task });
    } catch (err) {
      handleTaskError(res, err);
    }
  });

  router.post('/tasks/:taskId/handoff', requireAnyPermission('executive:read', 'ops:read', '*'), async (req, res) => {
    const auth = getAuth(req);
    try {
      const task = await departmentRoutineTaskService.handoffTask(
        { companyId: auth.companyId, userId: auth.userId, permissions: auth.permissions },
        taskIdParam(req.params.taskId),
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      );
      res.json({ data: task });
    } catch (err) {
      handleTaskError(res, err);
    }
  });

  router.patch('/tasks/:taskId/status', requireAnyPermission('executive:read', 'ops:read', '*'), async (req, res) => {
    const auth = getAuth(req);
    const status = req.body?.status as DepartmentRoutineTaskStatus | undefined;
    if (!status) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'status required' } });
      return;
    }
    try {
      const task = await departmentRoutineTaskService.updateStatus(
        { companyId: auth.companyId, userId: auth.userId, permissions: auth.permissions },
        taskIdParam(req.params.taskId),
        status,
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      );
      res.json({ data: task });
    } catch (err) {
      handleTaskError(res, err);
    }
  });

  router.get(
    '/:departmentId/tasks',
    requireAnyPermission('executive:read', 'analytics:read', 'ops:read', '*'),
    async (req, res) => {
      const auth = getAuth(req);
      const departmentId = req.params.departmentId as CorporateDepartmentId;
      if (!getCorporateDepartmentById(departmentId)) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown department' } });
        return;
      }
      try {
        const tasks = await departmentRoutineTaskService.listTasksForDepartment(
          { companyId: auth.companyId, userId: auth.userId, permissions: auth.permissions },
          departmentId,
        );
        res.json({
          data: {
            generatedAt: new Date().toISOString(),
            departmentId,
            tasks,
            auditAvailable: true,
          },
        });
      } catch (err) {
        handleTaskError(res, err);
      }
    },
  );

  router.get(
    '/:departmentId',
    requireAnyPermission('executive:read', 'analytics:read', 'ops:read', '*'),
    async (req, res) => {
      const auth = getAuth(req);
      const departmentId = req.params.departmentId as CorporateDepartmentId;
      if (!getCorporateDepartmentById(departmentId)) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Unknown department' },
        });
        return;
      }
      const detail = await corporateDepartmentHubService.getDepartmentDetail(
        auth.companyId,
        departmentId,
        auth.permissions,
      );
      res.json({ data: detail });
    },
  );

  return router;
}
