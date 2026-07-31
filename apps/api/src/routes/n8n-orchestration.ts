import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { hasPermission, isCompanyOwnerRole } from '@titan/auth';
import type { N8nOrchestrationService } from '../services/n8n-orchestration.service.js';
import { N8nOrchestrationError } from '../services/n8n-orchestration.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

function assertOwnerConfigAccess(auth: AuthenticatedRequest['auth'], res: import('express').Response) {
  const allowed = isCompanyOwnerRole({
    roleName: auth.roleName,
    permissions: auth.permissions,
  });
  if (!allowed) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Only Company Owner may configure or administer n8n orchestration',
      },
    });
    return false;
  }
  return true;
}

const configureSchema = z.object({
  baseUrl: z.string().trim().url().max(500),
  apiKey: z.string().trim().min(8).max(500),
  webhookSecret: z.string().trim().min(16).max(500),
});

const registerWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().max(2000).nullable().optional(),
  externalWorkflowKey: z.string().trim().min(1).max(120),
  triggerEvent: z.string().trim().min(1).max(120),
  requiresApproval: z.boolean().optional(),
  nativeWorkflowId: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'disabled']).optional(),
});

const dispatchSchema = z.object({
  externalWorkflowKey: z.string().trim().min(1).max(120),
  triggerEvent: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().trim().min(1).max(200),
  payload: z.record(z.unknown()).default({}),
});

type Deps = {
  n8nOrchestrationService: N8nOrchestrationService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: Request) {
  return (req as AuthenticatedRequest).auth;
}

function routeId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? '');
  return String(value ?? '');
}

function handleError(res: Response, error: unknown) {
  if (error instanceof N8nOrchestrationError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN' ||
            error.code === 'INVALID_SIGNATURE' ||
            error.code === 'STALE_TIMESTAMP'
          ? 403
          : error.code === 'VALIDATION_ERROR' || error.code === 'NOT_CONFIGURED'
            ? 400
            : error.code === 'DISPATCH_BLOCKED' || error.code === 'INVALID_STATE'
              ? 409
              : 400;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Unexpected n8n orchestration error' },
  });
}

/**
 * Public callback router — no JWT; HMAC signature required.
 * Mounted separately from authenticated Automations routes.
 */
export function createN8nCallbackRouter({
  n8nOrchestrationService,
}: {
  n8nOrchestrationService: N8nOrchestrationService;
}): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const rawBody =
        (req as { rawBody?: string }).rawBody ??
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
      const headers: Record<string, string | undefined> = {
        'x-titan-signature':
          (req.header('x-titan-signature') ?? undefined) || undefined,
        'x-titan-timestamp':
          (req.header('x-titan-timestamp') ?? undefined) || undefined,
        'x-titan-company-id':
          (req.header('x-titan-company-id') ?? undefined) || undefined,
        'x-titan-correlation-id':
          (req.header('x-titan-correlation-id') ?? undefined) || undefined,
      };
      const result = await n8nOrchestrationService.handleCallback(rawBody, headers);
      res.json({ data: result });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

export function createN8nOrchestrationRouter({
  n8nOrchestrationService,
  jwtSecret,
  authService,
}: Deps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get(
    '/connection',
    requireAnyPermission('automation:read', 'automation:write', 'company:manage'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const connection = await n8nOrchestrationService.getConnectionSummary(companyId);
        res.json({ data: { connection } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.put(
    '/connection',
    requireAnyPermission('company:manage', 'automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        if (!assertOwnerConfigAccess(auth, res)) return;
        const parsed = configureSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid n8n connection payload',
              details: parsed.error.flatten(),
            },
          });
          return;
        }
        const connection = await n8nOrchestrationService.configureConnection(
          { companyId: auth.companyId, userId: auth.userId },
          parsed.data,
        );
        res.json({ data: { connection } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/connection/verify',
    requireAnyPermission('company:manage', 'automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        if (!assertOwnerConfigAccess(auth, res)) return;
        const connection = await n8nOrchestrationService.verifyConnection({
          companyId: auth.companyId,
          userId: auth.userId,
        });
        res.json({ data: { connection } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/connection/disconnect',
    requireAnyPermission('company:manage', 'automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        if (!assertOwnerConfigAccess(auth, res)) return;
        const connection = await n8nOrchestrationService.disconnect({
          companyId: auth.companyId,
          userId: auth.userId,
        });
        res.json({ data: { connection } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/workflows',
    requireAnyPermission('automation:read', 'automation:write', 'company:manage'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const workflows = await n8nOrchestrationService.listWorkflowRegistrations(companyId);
        res.json({ data: { workflows } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/workflows',
    requireAnyPermission('company:manage', 'automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        if (!assertOwnerConfigAccess(auth, res)) return;
        const parsed = registerWorkflowSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid workflow registration',
              details: parsed.error.flatten(),
            },
          });
          return;
        }
        const workflow = await n8nOrchestrationService.registerWorkflow(
          { companyId: auth.companyId, userId: auth.userId },
          parsed.data,
        );
        res.status(201).json({ data: { workflow } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/executions',
    requireAnyPermission('automation:read', 'automation:write', 'company:manage'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const executions = await n8nOrchestrationService.listExecutions(companyId);
        res.json({ data: { executions } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/executions/dispatch',
    requireAnyPermission('company:manage', 'automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        if (
          !hasPermission(auth.permissions, 'company:manage') &&
          !hasPermission(auth.permissions, 'automation:write')
        ) {
          res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not permitted' } });
          return;
        }
        const parsed = dispatchSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid dispatch payload',
              details: parsed.error.flatten(),
            },
          });
          return;
        }
        const execution = await n8nOrchestrationService.dispatchExecution(
          { companyId: auth.companyId, userId: auth.userId },
          parsed.data,
        );
        res.status(201).json({ data: { execution } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/executions/:id/approve',
    requireAnyPermission('company:manage', 'automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        if (!assertOwnerConfigAccess(auth, res)) return;
        const execution = await n8nOrchestrationService.approveExecution(
          { companyId: auth.companyId, userId: auth.userId },
          routeId(req.params.id),
        );
        res.json({ data: { execution } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/executions/:id/cancel',
    requireAnyPermission('company:manage', 'automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const execution = await n8nOrchestrationService.cancelExecution(
          { companyId: auth.companyId, userId: auth.userId },
          routeId(req.params.id),
        );
        res.json({ data: { execution } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.post(
    '/executions/:id/retry',
    requireAnyPermission('company:manage', 'automation:write'),
    async (req, res) => {
      try {
        const auth = getAuth(req);
        const execution = await n8nOrchestrationService.retryExecution(
          { companyId: auth.companyId, userId: auth.userId },
          routeId(req.params.id),
        );
        res.json({ data: { execution } });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  router.get(
    '/native-continuity',
    requireAnyPermission('automation:read', 'company:manage'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const continuity =
          await n8nOrchestrationService.nativeWorkflowsContinueWithoutN8n(companyId);
        res.json({ data: continuity });
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  return router;
}
