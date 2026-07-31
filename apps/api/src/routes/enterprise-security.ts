import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseSecurityService } from '../services/enterprise-security.service.js';
import { EnterpriseSecurityError } from '../services/enterprise-security.service.js';
import type { TeamService } from '../services/team.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { createZeroTrustMiddleware } from '../middleware/zero-trust.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const actionTypeSchema = z.enum([
  'security_action',
  'permission_change',
  'integration_lockdown',
  'session_revocation',
  'privacy_request',
]);
const actionStatusSchema = z.enum([
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);
const grantTypeSchema = z.enum(['temporary', 'delegated', 'executive_override']);
const privacyTypeSchema = z.enum(['data_export', 'data_deletion', 'consent_update']);

const actionSchema = z.object({
  actionType: actionTypeSchema,
  subject: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(5000),
  payload: z.record(z.unknown()).optional(),
});

const policySchema = z.object({
  mfaRequired: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().int().min(15).max(1440).optional(),
  passwordExpiryDays: z.number().int().min(30).max(365).nullable().optional(),
  passwordHistoryCount: z.number().int().min(1).max(24).optional(),
  maxFailedLoginAttempts: z.number().int().min(3).max(20).optional(),
  trustedDeviceRequired: z.boolean().optional(),
  personalWorkspaceIsolation: z.boolean().optional(),
  auditRetentionDays: z.number().int().min(30).max(3650).optional(),
  popiaReady: z.boolean().optional(),
  gdprReady: z.boolean().optional(),
});

const grantSchema = z.object({
  grantType: grantTypeSchema,
  permissions: z.array(z.string()).min(1),
  grantedToUserId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
  requiresApproval: z.boolean().optional(),
});

const privacySchema = z.object({
  requestType: privacyTypeSchema,
  subject: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(5000).optional(),
});

const deviceSchema = z.object({
  deviceLabel: z.string().trim().min(1).max(200),
  deviceFingerprint: z.string().trim().min(8).max(256),
});

const mfaVerifySchema = z.object({
  verificationCode: z.string().trim().min(6).max(10),
});

const webauthnSchema = z.object({
  credentialId: z.string().trim().min(1),
  publicKey: z.string().trim().min(1),
  deviceLabel: z.string().trim().max(200).optional(),
});

type RouterDeps = {
  enterpriseSecurityService: EnterpriseSecurityService;
  teamService: TeamService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function createEnterpriseSecurityRouter({
  enterpriseSecurityService,
  teamService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });
  const requireZeroTrust = createZeroTrustMiddleware({ enterpriseSecurityService });
  const requireRateLimit = createRateLimitMiddleware({ enterpriseSecurityService });
  const requireRead = requireAnyPermission(
    'security:read',
    'security:write',
    'settings:manage',
    'agents:read',
  );
  const requireWrite = requireAnyPermission('security:write', 'settings:manage');

  router.use(requireAuth);
  router.use(requireZeroTrust);
  router.use(requireRateLimit);
  router.use(async (req, _res, next) => {
    await teamService.ensureDefaultRoles(getAuth(req).companyId);
    next();
  });

  router.get('/dashboard', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const dashboard = await enterpriseSecurityService.getExecutiveDashboard(companyId);
    res.json({ data: { dashboard } });
  });

  router.get('/policy', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const policy = await enterpriseSecurityService.getTenantPolicy(companyId);
    res.json({ data: { policy } });
  });

  router.patch('/policy', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = policySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid security policy payload' } });
      return;
    }

    try {
      const policy = await enterpriseSecurityService.updateTenantPolicy(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.json({ data: { policy } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const auditLogs = await enterpriseSecurityService.listAuditLogs(companyId);
    res.json({ data: { auditLogs } });
  });

  router.get('/login-events', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const loginEvents = await enterpriseSecurityService.listLoginEvents(companyId);
    res.json({ data: { loginEvents } });
  });

  router.get('/sessions', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const sessions = await enterpriseSecurityService.listActiveSessions(
      auth.companyId,
      auth.sessionId,
    );
    res.json({ data: { sessions } });
  });

  router.post('/sessions/:sessionId/revoke', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    try {
      await enterpriseSecurityService.revokeSession(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.sessionId),
      );
      res.json({ data: { success: true } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/sessions/revoke-others', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    try {
      const revokedCount = await enterpriseSecurityService.revokeAllOtherSessions(
        { companyId: auth.companyId, userId: auth.userId },
        auth.sessionId,
      );
      res.json({ data: { success: true, revokedCount } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/mfa', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const mfa = await enterpriseSecurityService.getMfaSettings({
      companyId: auth.companyId,
      userId: auth.userId,
    });
    res.json({ data: { mfa } });
  });

  router.post('/mfa/setup', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const user = await authService.getUserById(auth.userId);
    if (!user) {
      res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    try {
      const setup = await enterpriseSecurityService.beginMfaSetup(
        { companyId: auth.companyId, userId: auth.userId },
        user.email,
      );
      res.status(201).json({ data: { setup } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/mfa/verify', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = mfaVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid MFA verification payload' } });
      return;
    }

    try {
      const mfa = await enterpriseSecurityService.verifyMfaSetup(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data.verificationCode,
      );
      res.json({ data: { mfa } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/trusted-devices', requireRead, async (req, res) => {
    const auth = getAuth(req);
    const trustedDevices = await enterpriseSecurityService.listTrustedDevices(auth.companyId);
    res.json({ data: { trustedDevices } });
  });

  router.post('/trusted-devices', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = deviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid trusted device payload' } });
      return;
    }

    try {
      const trustedDevice = await enterpriseSecurityService.registerTrustedDevice(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { trustedDevice } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/trusted-devices/:deviceId/approve', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    try {
      const trustedDevice = await enterpriseSecurityService.approveTrustedDevice(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.deviceId),
      );
      res.json({ data: { trustedDevice } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/permission-grants', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const permissionGrants = await enterpriseSecurityService.listPermissionGrants(companyId);
    res.json({ data: { permissionGrants } });
  });

  router.post('/permission-grants', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid permission grant payload' } });
      return;
    }

    try {
      const permissionGrant = await enterpriseSecurityService.createPermissionGrant(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { permissionGrant } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/risk-alerts', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const riskAlerts = await enterpriseSecurityService.listRiskAlerts(companyId);
    res.json({ data: { riskAlerts } });
  });

  router.post('/risk-alerts/:alertId/resolve', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    try {
      const riskAlert = await enterpriseSecurityService.resolveRiskAlert(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.alertId),
      );
      res.json({ data: { riskAlert } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/actions', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const actions = await enterpriseSecurityService.listActions(companyId);
    res.json({ data: { actions } });
  });

  router.post('/actions', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid security action payload' } });
      return;
    }

    try {
      const action = await enterpriseSecurityService.createAction(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { action } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.patch('/actions/:actionId/status', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = z.object({ status: actionStatusSchema }).safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action status payload' } });
      return;
    }

    try {
      const action = await enterpriseSecurityService.updateActionStatus(
        { companyId: auth.companyId, userId: auth.userId },
        getRouteParam(req.params.actionId),
        parsed.data.status,
      );
      res.json({ data: { action } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/privacy-requests', requireRead, async (req, res) => {
    const { companyId } = getAuth(req);
    const privacyRequests = await enterpriseSecurityService.listPrivacyRequests(companyId);
    res.json({ data: { privacyRequests } });
  });

  router.post('/privacy-requests', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = privacySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid privacy request payload' } });
      return;
    }

    try {
      const privacyRequest = await enterpriseSecurityService.createPrivacyRequest(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { privacyRequest } });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/webauthn/credentials', requireWrite, async (req, res) => {
    const auth = getAuth(req);
    const parsed = webauthnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid WebAuthn credential payload' },
      });
      return;
    }

    try {
      const credential = await enterpriseSecurityService.registerWebauthnCredential(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data,
      );
      res.status(201).json({ data: { credential } });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof EnterpriseSecurityError) {
    res.status(400).json({ error: { code: error.code, message: error.message } });
    return;
  }

  throw error;
}
