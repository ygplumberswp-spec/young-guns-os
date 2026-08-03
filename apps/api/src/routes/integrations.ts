import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { isCompanyOwnerRole } from '@titan/auth';
import type { IntegrationsService } from '../services/integrations.service.js';
import { IntegrationsError } from '../services/integrations.service.js';
import type { XeroSyncService } from '../services/xero-sync.service.js';
import { XeroSyncError } from '../services/xero-sync.service.js';
import type { XeroWriteApprovalWorkflowService } from '../services/xero-write-approval-workflow.service.js';
import { XeroWriteApprovalWorkflowError } from '../services/xero-write-approval-workflow.service.js';
import type { BusinessIntegrationsService } from '../services/business-integrations.service.js';
import { BusinessIntegrationsError } from '../services/business-integrations.service.js';
import type { IntegrationHubService } from '../services/integration-hub.service.js';
import { IntegrationHubError } from '../services/integration-hub.service.js';
import type { IntegrationApiManagementService } from '../services/integration-api-management.service.js';
import { IntegrationApiManagementError } from '../services/integration-api-management.service.js';
import type { WhatsappService } from '../services/whatsapp.service.js';
import { WhatsappServiceError } from '../services/whatsapp.service.js';
import type { XeroOAuthService } from '../services/xero-oauth.service.js';
import { XeroOAuthError } from '../services/xero-oauth.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { invalidateIntegrationReadCaches } from '../services/api-read-cache.js';

const saveCartrackSchema = z.object({
  baseUrl: z.string().trim().url().max(500),
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
});

const updateMappingSchema = z.object({
  vehicleId: z.string().uuid().optional().nullable(),
  status: z.enum(['unmapped', 'mapped', 'ignored']).optional(),
});

const createWebhookEndpointSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateWebhookEndpointSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const startXeroOAuthSchema = z.object({
  returnPath: z.string().trim().max(500).optional().nullable(),
});

const saveEmailSchema = z.object({
  host: z.string().trim().min(1).max(200),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
  fromEmail: z.string().trim().email(),
  fromName: z.string().trim().max(200).optional().nullable(),
});

const saveYocoSchema = z.object({
  secretKey: z.string().trim().min(1).max(500),
  environment: z.enum(['test', 'live']).optional(),
});

const saveWhatsappSchema = z.object({
  accessToken: z.string().trim().max(2000).optional(),
  phoneNumberId: z.string().trim().min(1).max(200),
  businessAccountId: z.string().trim().min(1).max(200),
  webhookVerifyToken: z.string().trim().max(200).optional().nullable(),
});

const createWhatsappTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  externalTemplateId: z.string().trim().max(200).optional().nullable(),
  category: z
    .enum([
      'job_booked_confirmation',
      'technician_assigned',
      'technician_on_the_way',
      'job_completed',
      'invoice_sent',
      'payment_reminder',
      'utility',
      'marketing',
    ])
    .optional(),
  language: z.string().trim().max(20).optional(),
  body: z.string().trim().min(1).max(4096),
  variables: z.array(z.string()).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

const updateWhatsappTemplateSchema = createWhatsappTemplateSchema.partial();

const sendWhatsappTestSchema = z.object({
  phoneNumber: z.string().trim().min(5).max(30),
  messageContent: z.string().trim().min(1).max(4096),
});

const updateRegistrySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  version: z.string().trim().max(50).optional().nullable(),
  nextSyncAt: z.string().datetime().optional().nullable(),
});

const createDeveloperApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string().trim().min(1).max(80)).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const createOutboundWebhookDeliverySchema = z.object({
  webhookEndpointId: z.string().uuid().optional().nullable(),
  eventType: z.string().trim().min(1).max(120),
  payloadSummary: z.string().trim().max(500).optional().nullable(),
});

const requestXeroWriteSchema = z.object({
  writeOperation: z.enum(['invoice_create', 'payment_create', 'contact_update']),
  entityId: z.string().uuid(),
  payloadVersion: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const rejectXeroWriteSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

const resolveXeroConflictSchema = z.object({
  entityType: z.enum(['invoice', 'contact', 'payment']),
  entityId: z.string().uuid(),
  resolution: z.enum(['keep_local', 'accept_remote', 'dismiss']),
});

type IntegrationsRouterDeps = {
  integrationsService: IntegrationsService;
  businessIntegrationsService: BusinessIntegrationsService;
  xeroSyncService: XeroSyncService;
  xeroWriteApprovalWorkflowService?: XeroWriteApprovalWorkflowService;
  integrationHubService: IntegrationHubService;
  integrationApiManagementService: IntegrationApiManagementService;
  whatsappService: WhatsappService;
  xeroOAuthService: XeroOAuthService;
  teamService: TeamService;
  appUrl: string;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeQueryValue(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value as string[];
  }

  return undefined;
}

export function createIntegrationsRouter({
  integrationsService,
  businessIntegrationsService,
  xeroSyncService,
  xeroWriteApprovalWorkflowService,
  integrationHubService,
  integrationApiManagementService,
  whatsappService,
  xeroOAuthService,
  teamService,
  appUrl,
  jwtSecret,
  authService,
}: IntegrationsRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  function requireWriteWorkflow(
    res: Response,
  ): XeroWriteApprovalWorkflowService | null {
    if (!xeroWriteApprovalWorkflowService) {
      res.status(503).json({
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Xero write approval workflow is not configured',
        },
      });
      return null;
    }
    return xeroWriteApprovalWorkflowService;
  }

  function actorFromAuth(auth: ReturnType<typeof getAuth>) {
    return {
      userId: auth.userId,
      companyId: auth.companyId,
      roleName: auth.roleName,
      permissions: auth.permissions,
    };
  }

  router.get('/xero/oauth/callback', async (req, res) => {
    try {
      const redirectUrl = await xeroOAuthService.handleOAuthCallback({
        code: normalizeQueryValue(req.query.code),
        state: normalizeQueryValue(req.query.state),
        error: normalizeQueryValue(req.query.error),
        errorDescription: normalizeQueryValue(req.query.error_description),
      });
      res.redirect(redirectUrl);
    } catch (error) {
      const message =
        error instanceof XeroOAuthError
          ? error.message
          : 'Unable to complete Xero sign-in. Try again from Integrations.';
      const fallback = new URL('/integrations/xero', appUrl);
      fallback.searchParams.set('xero', 'error');
      fallback.searchParams.set('message', message);
      res.redirect(fallback.toString());
    }
  });

  router.use(requireAuth);
  router.use(async (req, _res, next) => {
    const { companyId } = getAuth(req);
    await teamService.ensureDefaultRoles(companyId);
    next();
  });

  router.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      next();
      return;
    }

    res.on('finish', () => {
      if (res.statusCode >= 400) {
        return;
      }
      try {
        invalidateIntegrationReadCaches(getAuth(req).companyId);
      } catch {
        // Unauthenticated mutation paths are ignored.
      }
    });
    next();
  });

  router.get(
    '/cartrack',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const connection = await integrationsService.getCartrackConnection(companyId);
      res.json({ data: { connection } });
    },
  );

  router.put('/cartrack', requireAnyPermission('integrations:manage'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = saveCartrackSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid Cartrack connection payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const connection = await integrationsService.saveCartrackConnection(
        auth.companyId,
        parsed.data,
        { userId: auth.userId },
      );
      res.json({ data: { connection } });
    } catch (error) {
      handleIntegrationsError(res, error);
    }
  });

  router.post(
    '/cartrack/credentials/validate',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const parsed = saveCartrackSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Cartrack credential payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      const result = await integrationsService.validateCartrackCredentials(parsed.data);
      res.json({ data: { result } });
    },
  );

  router.put('/cartrack/credentials', requireOwnerForCredentialReplace, async (req, res) => {
    const auth = getAuth(req);
    const parsed = saveCartrackSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid Cartrack credential payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const connection = await integrationsService.replaceCartrackCredentials(
        auth.companyId,
        parsed.data,
        { userId: auth.userId },
      );
      res.json({ data: { connection } });
    } catch (error) {
      handleIntegrationsError(res, error);
    }
  });

  router.post(
    '/cartrack/verify-stored',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const connection = await integrationsService.verifyStoredCartrackConnection(companyId);
        res.json({ data: { connection } });
      } catch (error) {
        handleIntegrationsError(res, error);
      }
    },
  );

  router.delete('/cartrack', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const connection = await integrationsService.disconnectCartrack(companyId);
    res.json({ data: { connection } });
  });

  router.get(
    '/cartrack/mappings',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const mappings = await integrationsService.listCartrackMappings(companyId);
      res.json({ data: { mappings } });
    },
  );

  router.get(
    '/cartrack/tracking',
    requireAnyPermission('integrations:read', 'integrations:manage', 'dispatch:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const tracking = await integrationsService.buildFleetTrackingContext(companyId);
      res.json({ data: { tracking } });
    },
  );

  router.patch(
    '/cartrack/mappings/:mappingId',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = updateMappingSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid mapping payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const mapping = await integrationsService.updateCartrackMapping(
          companyId,
          getRouteParam(req.params.mappingId),
          parsed.data,
        );
        res.json({ data: { mapping } });
      } catch (error) {
        handleIntegrationsError(res, error);
      }
    },
  );

  router.post('/cartrack/sync', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      const result = await integrationsService.syncCartrack(companyId);
      res.json({ data: { result } });
    } catch (error) {
      handleIntegrationsError(res, error);
    }
  });

  router.get(
    '/cartrack/tracking',
    requireAnyPermission('integrations:read', 'integrations:manage', 'dispatch:read', 'fleet:read'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const tracking = await integrationsService.buildFleetTrackingContext(companyId);
      res.json({ data: { tracking } });
    },
  );

  router.get(
    '/xero',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const connection = await businessIntegrationsService.getXeroConnection(companyId);
      res.json({ data: { connection } });
    },
  );

  router.post(
    '/xero/oauth/start',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId, userId } = getAuth(req);
      const parsed = startXeroOAuthSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Xero OAuth start payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const result = await xeroOAuthService.startOAuth({
          companyId,
          userId,
          returnPath: parsed.data.returnPath,
        });
        res.json({ data: result });
      } catch (error) {
        handleXeroOAuthError(res, error);
      }
    },
  );

  router.post('/xero/test', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      const result = await xeroOAuthService.testConnection(companyId);
      res.json({ data: { result } });
    } catch (error) {
      handleXeroOAuthError(res, error);
    }
  });

  router.put('/xero', requireAnyPermission('integrations:manage'), async (_req, res) => {
    res.status(410).json({
      error: {
        code: 'DEPRECATED',
        message: 'Manual Xero credentials are no longer supported. Use Sign in with Xero instead.',
      },
    });
  });

  router.delete('/xero', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId, userId } = getAuth(req);

    try {
      const connection = await businessIntegrationsService.disconnectXero(companyId, userId);
      res.json({ data: { connection } });
    } catch (error) {
      handleXeroOAuthError(res, error);
    }
  });

  router.post('/xero/sync', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      const result = await businessIntegrationsService.syncXero(companyId);
      res.json({ data: { result } });
    } catch (error) {
      handleBusinessIntegrationsError(res, error);
    }
  });

  router.get(
    '/xero/sync/status',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const status = await xeroSyncService.getSyncStatus(companyId);
      res.json({ data: { status } });
    },
  );

  router.get(
    '/xero/sync/logs',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const logs = await xeroSyncService.listSyncLogs(companyId);
      res.json({ data: { logs } });
    },
  );

  router.post(
    '/xero/sync/customers',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const result = await xeroSyncService.syncCustomers(companyId);
        res.json({ data: { result } });
      } catch (error) {
        handleXeroSyncError(res, error);
      }
    },
  );

  router.post(
    '/xero/sync/quotes',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const result = await xeroSyncService.syncQuotes(companyId);
        res.json({ data: { result } });
      } catch (error) {
        handleXeroSyncError(res, error);
      }
    },
  );

  router.post(
    '/xero/sync/invoices',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const result = await xeroSyncService.syncInvoices(companyId);
        res.json({ data: { result } });
      } catch (error) {
        handleXeroSyncError(res, error);
      }
    },
  );

  router.post(
    '/xero/sync/payments',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const result = await xeroSyncService.syncPayments(companyId);
        res.json({ data: { result } });
      } catch (error) {
        handleXeroSyncError(res, error);
      }
    },
  );

  router.post(
    '/xero/sync/retry/:syncJobId',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const result = await xeroSyncService.retrySyncJob(
          companyId,
          getRouteParam(req.params.syncJobId),
        );
        res.json({ data: { result } });
      } catch (error) {
        handleXeroSyncError(res, error);
      }
    },
  );

  // --- Xero two-way write approval queue (Draft → Approve → Execute) ---
  router.get(
    '/xero/write-approvals',
    requireAnyPermission('integrations:read', 'integrations:manage', 'finance:read', 'finance:write'),
    async (req, res) => {
      const workflow = requireWriteWorkflow(res);
      if (!workflow) return;
      try {
        const statusParam = normalizeQueryValue(req.query.status);
        const status =
          typeof statusParam === 'string'
            ? (statusParam as 'pending' | 'approved' | 'rejected' | 'executed' | 'expired')
            : undefined;
        const items = await workflow.listApprovals(actorFromAuth(getAuth(req)), { status });
        res.json({ data: { items } });
      } catch (error) {
        handleXeroWriteWorkflowError(res, error);
      }
    },
  );

  router.get(
    '/xero/write-approvals/:approvalId',
    requireAnyPermission('integrations:read', 'integrations:manage', 'finance:read', 'finance:write'),
    async (req, res) => {
      const workflow = requireWriteWorkflow(res);
      if (!workflow) return;
      try {
        const item = await workflow.getApproval(
          actorFromAuth(getAuth(req)),
          getRouteParam(req.params.approvalId),
        );
        res.json({ data: { item } });
      } catch (error) {
        handleXeroWriteWorkflowError(res, error);
      }
    },
  );

  router.post(
    '/xero/write-approvals',
    requireAnyPermission('integrations:manage', 'finance:write'),
    async (req, res) => {
      const workflow = requireWriteWorkflow(res);
      if (!workflow) return;
      const parsed = requestXeroWriteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Xero write approval request',
            details: parsed.error.flatten(),
          },
        });
        return;
      }
      try {
        const item = await workflow.requestApproval(actorFromAuth(getAuth(req)), parsed.data);
        res.status(201).json({ data: { item } });
      } catch (error) {
        handleXeroWriteWorkflowError(res, error);
      }
    },
  );

  router.post(
    '/xero/write-approvals/:approvalId/approve',
    requireAnyPermission('integrations:manage', 'finance:write'),
    async (req, res) => {
      const workflow = requireWriteWorkflow(res);
      if (!workflow) return;
      try {
        const item = await workflow.approve(
          actorFromAuth(getAuth(req)),
          getRouteParam(req.params.approvalId),
        );
        res.json({ data: { item } });
      } catch (error) {
        handleXeroWriteWorkflowError(res, error);
      }
    },
  );

  router.post(
    '/xero/write-approvals/:approvalId/reject',
    requireAnyPermission('integrations:manage', 'finance:write'),
    async (req, res) => {
      const workflow = requireWriteWorkflow(res);
      if (!workflow) return;
      const parsed = rejectXeroWriteSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid reject payload' },
        });
        return;
      }
      try {
        const item = await workflow.reject(
          actorFromAuth(getAuth(req)),
          getRouteParam(req.params.approvalId),
          parsed.data.reason,
        );
        res.json({ data: { item } });
      } catch (error) {
        handleXeroWriteWorkflowError(res, error);
      }
    },
  );

  router.post(
    '/xero/write-approvals/:approvalId/cancel',
    requireAnyPermission('integrations:manage', 'finance:write'),
    async (req, res) => {
      const workflow = requireWriteWorkflow(res);
      if (!workflow) return;
      try {
        const item = await workflow.cancel(
          actorFromAuth(getAuth(req)),
          getRouteParam(req.params.approvalId),
        );
        res.json({ data: { item } });
      } catch (error) {
        handleXeroWriteWorkflowError(res, error);
      }
    },
  );

  router.post(
    '/xero/write-approvals/:approvalId/execute',
    requireAnyPermission('integrations:manage', 'finance:write'),
    async (req, res) => {
      const workflow = requireWriteWorkflow(res);
      if (!workflow) return;
      try {
        const result = await workflow.execute(
          actorFromAuth(getAuth(req)),
          getRouteParam(req.params.approvalId),
        );
        res.json({ data: result });
      } catch (error) {
        handleXeroWriteWorkflowError(res, error);
      }
    },
  );

  router.post(
    '/xero/write-approvals/conflicts/resolve',
    requireAnyPermission('integrations:manage', 'finance:write'),
    async (req, res) => {
      const workflow = requireWriteWorkflow(res);
      if (!workflow) return;
      const parsed = resolveXeroConflictSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid conflict resolution payload' },
        });
        return;
      }
      try {
        const result = await workflow.resolveConflict(actorFromAuth(getAuth(req)), parsed.data);
        res.json({ data: result });
      } catch (error) {
        handleXeroWriteWorkflowError(res, error);
      }
    },
  );

  router.get(
    '/email',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const connection = await businessIntegrationsService.getEmailConnection(companyId);
      res.json({ data: { connection } });
    },
  );

  router.put('/email', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = saveEmailSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email connection payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const connection = await businessIntegrationsService.saveEmailConnection(
        companyId,
        parsed.data,
      );
      res.json({ data: { connection } });
    } catch (error) {
      handleBusinessIntegrationsError(res, error);
    }
  });

  router.delete('/email', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const connection = await businessIntegrationsService.disconnectEmail(companyId);
    res.json({ data: { connection } });
  });

  router.post('/email/sync', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      const result = await businessIntegrationsService.syncEmail(companyId);
      res.json({ data: { result } });
    } catch (error) {
      handleBusinessIntegrationsError(res, error);
    }
  });

  router.get(
    '/yoco',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const connection = await businessIntegrationsService.getYocoConnection(companyId);
      res.json({ data: { connection } });
    },
  );

  router.put('/yoco', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = saveYocoSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid Yoco connection payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const connection = await businessIntegrationsService.saveYocoConnection(
        companyId,
        parsed.data,
      );
      res.json({ data: { connection } });
    } catch (error) {
      handleBusinessIntegrationsError(res, error);
    }
  });

  router.delete('/yoco', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const connection = await businessIntegrationsService.disconnectYoco(companyId);
    res.json({ data: { connection } });
  });

  router.post('/yoco/sync', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);

    try {
      const result = await businessIntegrationsService.syncYoco(companyId);
      res.json({ data: { result } });
    } catch (error) {
      handleBusinessIntegrationsError(res, error);
    }
  });

  router.get(
    '/whatsapp',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const [connection, stats, templates] = await Promise.all([
        whatsappService.getConnection(companyId),
        whatsappService.getStats(companyId),
        whatsappService.listTemplates(companyId),
      ]);
      res.json({ data: { connection, stats, templates } });
    },
  );

  router.put('/whatsapp', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId, userId } = getAuth(req);
    const parsed = saveWhatsappSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid WhatsApp connection payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const connection = await whatsappService.saveConnection(companyId, parsed.data, userId);
      res.json({ data: { connection } });
    } catch (error) {
      handleWhatsappError(res, error);
    }
  });

  router.delete('/whatsapp', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId, userId } = getAuth(req);

    try {
      const connection = await whatsappService.disconnect(companyId, userId);
      res.json({ data: { connection } });
    } catch (error) {
      handleWhatsappError(res, error);
    }
  });

  router.post('/whatsapp/test', requireAnyPermission('integrations:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const parsed = sendWhatsappTestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid WhatsApp test message payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const result = await whatsappService.sendTestMessage(companyId, parsed.data);
      res.json({ data: { result } });
    } catch (error) {
      handleWhatsappError(res, error);
    }
  });

  router.post(
    '/whatsapp/templates',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = createWhatsappTemplateSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid WhatsApp template payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const template = await whatsappService.createTemplate(companyId, parsed.data);
        res.status(201).json({ data: { template } });
      } catch (error) {
        handleWhatsappError(res, error);
      }
    },
  );

  router.patch(
    '/whatsapp/templates/:templateId',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = updateWhatsappTemplateSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid WhatsApp template payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const template = await whatsappService.updateTemplate(
          companyId,
          getRouteParam(req.params.templateId),
          parsed.data,
        );
        res.json({ data: { template } });
      } catch (error) {
        handleWhatsappError(res, error);
      }
    },
  );

  router.delete(
    '/whatsapp/templates/:templateId',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        await whatsappService.deleteTemplate(companyId, getRouteParam(req.params.templateId));
        res.status(204).send();
      } catch (error) {
        handleWhatsappError(res, error);
      }
    },
  );

  router.get(
    '/hub/dashboard',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const startedAt = Date.now();
      const simple = req.query.simple === 'true' || req.query.view === 'simple';
      const dashboard = await integrationHubService.getDashboard(companyId, { simple });
      const durationMs = Date.now() - startedAt;
      const existingTiming = res.getHeader('Server-Timing');
      const hubTiming = `hub;dur=${durationMs}`;
      res.setHeader(
        'Server-Timing',
        existingTiming ? `${existingTiming}, ${hubTiming}` : hubTiming,
      );
      res.json({ data: { dashboard } });
    },
  );

  router.get(
    '/hub/providers',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const providers = await integrationHubService.listProviderStatuses(companyId);
      res.json({ data: { providers } });
    },
  );

  router.get(
    '/hub/sync-jobs',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const syncJobs = await integrationHubService.listSyncJobs(companyId);
      res.json({ data: { syncJobs } });
    },
  );

  router.get(
    '/hub/sync-jobs/:syncJobId',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const syncJob = await integrationHubService.getSyncJob(
        companyId,
        getRouteParam(req.params.syncJobId),
      );

      if (!syncJob) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Sync job not found',
          },
        });
        return;
      }

      res.json({ data: { syncJob } });
    },
  );

  router.get(
    '/hub/webhooks/endpoints',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const endpoints = await integrationHubService.listWebhookEndpoints(companyId);
      res.json({ data: { endpoints } });
    },
  );

  router.post(
    '/hub/webhooks/endpoints',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = createWebhookEndpointSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid webhook endpoint payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const endpoint = await integrationHubService.createWebhookEndpoint(companyId, parsed.data);
        res.status(201).json({ data: { endpoint } });
      } catch (error) {
        handleIntegrationHubError(res, error);
      }
    },
  );

  router.patch(
    '/hub/webhooks/endpoints/:endpointId',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = updateWebhookEndpointSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid webhook endpoint payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const endpoint = await integrationHubService.updateWebhookEndpoint(
          companyId,
          getRouteParam(req.params.endpointId),
          parsed.data,
        );
        res.json({ data: { endpoint } });
      } catch (error) {
        handleIntegrationHubError(res, error);
      }
    },
  );

  router.delete(
    '/hub/webhooks/endpoints/:endpointId',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        await integrationHubService.deleteWebhookEndpoint(
          companyId,
          getRouteParam(req.params.endpointId),
        );
        res.status(204).send();
      } catch (error) {
        handleIntegrationHubError(res, error);
      }
    },
  );

  router.get(
    '/hub/webhooks/events',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const events = await integrationHubService.listWebhookEvents(companyId);
      res.json({ data: { events } });
    },
  );

  router.get(
    '/hub/management/registry',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const registry = await integrationApiManagementService.listRegistry(companyId);
      res.json({ data: { registry } });
    },
  );

  router.patch(
    '/hub/management/registry/:provider',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = updateRegistrySettingsSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid registry settings payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const entry = await integrationApiManagementService.updateRegistrySettings(
          companyId,
          getRouteParam(req.params.provider),
          parsed.data,
        );
        res.json({ data: { entry } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  router.get(
    '/hub/management/credentials',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const credentials = await integrationApiManagementService.listCredentialMetadata(companyId);
      res.json({ data: { credentials } });
    },
  );

  router.post(
    '/hub/management/credentials/:metadataId/rotate',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const credential = await integrationApiManagementService.markCredentialRotationRequired(
          companyId,
          getRouteParam(req.params.metadataId),
        );
        res.json({ data: { credential } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  router.get(
    '/hub/management/usage',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const usage = await integrationApiManagementService.listApiUsage(companyId);
      res.json({ data: { usage } });
    },
  );

  router.get(
    '/hub/management/health',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const health = await integrationApiManagementService.getApiHealth(companyId);
      res.json({ data: { health } });
    },
  );

  router.post(
    '/hub/management/health/recommendations',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const recommendations =
          await integrationApiManagementService.generateHealthRecommendations(companyId);
        res.json({ data: { recommendations } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  router.get(
    '/hub/management/recommendations',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const recommendations = await integrationApiManagementService.listRecommendations(companyId);
      res.json({ data: { recommendations } });
    },
  );

  router.get(
    '/hub/management/logs',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const logs = await integrationApiManagementService.listIntegrationLogs(companyId);
      res.json({ data: { logs } });
    },
  );

  router.get(
    '/hub/management/webhooks/deliveries',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const deliveries = await integrationApiManagementService.listWebhookDeliveries(companyId);
      res.json({ data: { deliveries } });
    },
  );

  router.post(
    '/hub/management/webhooks/deliveries',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const parsed = createOutboundWebhookDeliverySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid webhook delivery payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const delivery = await integrationApiManagementService.createOutboundWebhookDelivery(
          companyId,
          parsed.data,
        );
        res.status(201).json({ data: { delivery } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  router.post(
    '/hub/management/webhooks/deliveries/:deliveryId/replay',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const delivery = await integrationApiManagementService.replayWebhookDelivery(
          companyId,
          getRouteParam(req.params.deliveryId),
        );
        res.json({ data: { delivery } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  router.get(
    '/hub/management/sync',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const sync = await integrationApiManagementService.getSyncManagerStatus(companyId);
      res.json({ data: { sync } });
    },
  );

  router.post(
    '/hub/management/sync-jobs/:syncJobId/retry',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const result = await integrationApiManagementService.retrySyncJob(
          companyId,
          getRouteParam(req.params.syncJobId),
        );
        res.json({ data: { result } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  router.post(
    '/hub/management/validate/:provider',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const validation = await integrationApiManagementService.validateIntegration(
          companyId,
          getRouteParam(req.params.provider),
        );
        res.json({ data: { validation } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  router.get(
    '/hub/management/developer-keys',
    requireAnyPermission('integrations:read', 'integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);
      const keys = await integrationApiManagementService.listDeveloperApiKeys(companyId);
      res.json({ data: { keys } });
    },
  );

  router.post(
    '/hub/management/developer-keys',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = createDeveloperApiKeySchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid developer API key payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const key = await integrationApiManagementService.createDeveloperApiKey(
          { companyId: auth.companyId, userId: auth.userId },
          parsed.data,
        );
        res.status(201).json({ data: { key } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  router.post(
    '/hub/management/developer-keys/:keyId/revoke',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const { companyId } = getAuth(req);

      try {
        const key = await integrationApiManagementService.revokeDeveloperApiKey(
          companyId,
          getRouteParam(req.params.keyId),
        );
        res.json({ data: { key } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  router.post(
    '/hub/management/developer-keys/:keyId/rotate',
    requireAnyPermission('integrations:manage'),
    async (req, res) => {
      const auth = getAuth(req);

      try {
        const key = await integrationApiManagementService.rotateDeveloperApiKey(
          { companyId: auth.companyId, userId: auth.userId },
          getRouteParam(req.params.keyId),
        );
        res.json({ data: { key } });
      } catch (error) {
        handleIntegrationApiManagementError(res, error);
      }
    },
  );

  return router;
}

function requireOwnerForCredentialReplace(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);

  if (
    !isCompanyOwnerRole({
      roleName: auth.roleName,
      permissions: auth.permissions,
    })
  ) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Only the company Owner can replace integration credentials.',
      },
    });
    return;
  }

  if (!auth.permissions.includes('integrations:manage')) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'integrations:manage permission is required.',
      },
    });
    return;
  }

  next();
}

function handleWhatsappError(res: import('express').Response, error: unknown) {
  if (error instanceof WhatsappServiceError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FEATURE_DISABLED' || error.code === 'ENCRYPTION_NOT_CONFIGURED'
          ? 503
          : error.code === 'NOT_CONNECTED' ||
              error.code === 'VALIDATION_ERROR' ||
              error.code === 'CONNECTION_FAILED'
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

function handleXeroOAuthError(res: import('express').Response, error: unknown) {
  if (error instanceof XeroOAuthError) {
    const status =
      error.code === 'NOT_CONNECTED' ||
      error.code === 'RECONNECT_REQUIRED' ||
      error.code === 'OAUTH_NOT_CONFIGURED' ||
      error.code === 'CONFIG_ERROR'
        ? 400
        : error.code === 'ENCRYPTION_NOT_CONFIGURED'
          ? 503
          : 400;

    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  if (error instanceof BusinessIntegrationsError) {
    handleBusinessIntegrationsError(res, error);
    return;
  }

  throw error;
}

function handleXeroSyncError(res: import('express').Response, error: unknown) {
  if (error instanceof XeroSyncError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'NOT_CONNECTED' ||
            error.code === 'INVALID_STATE' ||
            error.code === 'INVALID_SCOPE'
          ? 400
          : error.code === 'ENCRYPTION_NOT_CONFIGURED'
            ? 503
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

function handleXeroWriteWorkflowError(res: import('express').Response, error: unknown) {
  if (error instanceof XeroWriteApprovalWorkflowError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'ALREADY_EXECUTED'
            ? 409
            : error.code === 'AUTH'
              ? 401
              : 400;
    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  if (error instanceof XeroSyncError) {
    handleXeroSyncError(res, error);
    return;
  }

  throw error;
}

function handleBusinessIntegrationsError(res: import('express').Response, error: unknown) {
  if (error instanceof BusinessIntegrationsError) {
    const status =
      error.code === 'NOT_CONNECTED' ||
      error.code === 'CONNECTION_FAILED' ||
      error.code === 'VALIDATION_ERROR'
        ? 400
        : error.code === 'ENCRYPTION_NOT_CONFIGURED'
          ? 503
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

function handleIntegrationHubError(res: import('express').Response, error: unknown) {
  if (error instanceof IntegrationHubError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'DUPLICATE_NAME' || error.code === 'VALIDATION_ERROR'
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

function handleIntegrationApiManagementError(res: import('express').Response, error: unknown) {
  if (error instanceof IntegrationApiManagementError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR' || error.code === 'UNSUPPORTED'
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

function handleIntegrationsError(res: import('express').Response, error: unknown) {
  if (error instanceof IntegrationsError) {
    const status =
      error.code === 'NOT_FOUND' || error.code === 'VEHICLE_NOT_FOUND'
        ? 404
        : error.code === 'NOT_CONNECTED' || error.code === 'CONNECTION_FAILED'
          ? 400
          : error.code === 'ENCRYPTION_NOT_CONFIGURED'
            ? 503
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
