import { Router } from 'express';
import { z } from 'zod';
import type { TeamService } from '../services/team.service.js';
import { TeamError } from '../services/team.service.js';
import type { TechnicianPayrollService } from '../services/technician-payroll.service.js';
import { TechnicianPayrollError } from '../services/technician-payroll.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const payrollSetupSchema = z.object({
  monthlySalaryCents: z.number().int().positive(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workingDaysPerWeek: z.number().positive().max(7).optional(),
  workingHoursPerDay: z.number().positive().max(24).optional(),
  overtimeDailyThresholdHours: z.number().positive().max(24).optional(),
  overtimeMultiplierBps: z.number().int().min(10000).max(50000).optional(),
  payrollReference: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const createInviteSchema = z.object({
  email: z.string().trim().email(),
  roleId: z.string().uuid(),
  payrollSetup: payrollSetupSchema.nullable().optional(),
});

const updateMemberRoleSchema = z.object({
  roleId: z.string().uuid(),
});

const updateMemberStatusSchema = z.object({
  isActive: z.boolean(),
});

const hardDeleteMemberSchema = z.object({
  confirmation: z.string().trim().min(1),
});

type TeamRouterDeps = {
  teamService: TeamService;
  technicianPayrollService: TechnicianPayrollService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

export function createTeamRouter({
  teamService,
  technicianPayrollService,
  jwtSecret,
  authService,
}: TeamRouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get('/members', requireAnyPermission('users:read', 'users:manage'), async (req, res) => {
    const auth = getAuth(req);
    const members = await teamService.listMembers(auth.companyId, {
      companyId: auth.companyId,
      userId: auth.userId,
      roleName: auth.roleName,
      permissions: auth.permissions,
    });
    res.json({ data: { members } });
  });

  router.get('/roles', requireAnyPermission('users:read', 'users:manage'), async (req, res) => {
    const auth = getAuth(req);
    const roles = await teamService.listRoles(auth.companyId);
    const actor = {
      roleName: auth.roleName,
      permissions: auth.permissions,
    };
    res.json({
      data: {
        roles,
        assignableRoles: teamService.getAssignableRoles(roles),
        manuallyAssignableRoles: teamService.getManuallyAssignableRoles(roles, actor),
      },
    });
  });

  router.get('/invites', requireAnyPermission('users:manage'), async (req, res) => {
    const { companyId } = getAuth(req);
    const invites = await teamService.listInvites(companyId);
    res.json({ data: { invites } });
  });

  router.post('/invites', requireAnyPermission('users:manage'), async (req, res) => {
    const auth = getAuth(req);
    const parsed = createInviteSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid invite payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      const result = await teamService.createInvite(
        { companyId: auth.companyId, userId: auth.userId },
        parsed.data.email,
        parsed.data.roleId,
        parsed.data.payrollSetup,
      );

      res.status(201).json({ data: result });
    } catch (error) {
      handleTeamError(res, error);
    }
  });

  router.get(
    '/members/:memberId/payroll',
    requireAnyPermission('users:manage', 'finance:write', 'finance:read'),
    async (req, res) => {
      const auth = getAuth(req);
      try {
        const profile = await technicianPayrollService.listTermsForUser(
          {
            companyId: auth.companyId,
            userId: auth.userId,
            roleName: auth.roleName,
            permissions: auth.permissions,
          },
          req.params.memberId as string,
        );
        res.json({ data: { profile } });
      } catch (error) {
        handlePayrollError(res, error);
      }
    },
  );

  router.post(
    '/members/:memberId/payroll/terms',
    requireAnyPermission('users:manage', 'finance:write'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = payrollSetupSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payroll term payload' },
        });
        return;
      }
      try {
        const term = await technicianPayrollService.createEffectiveTerm(
          {
            companyId: auth.companyId,
            userId: auth.userId,
            roleName: auth.roleName,
            permissions: auth.permissions,
          },
          req.params.memberId as string,
          parsed.data,
        );
        res.status(201).json({ data: { term } });
      } catch (error) {
        handlePayrollError(res, error);
      }
    },
  );

  router.get(
    '/members/:memberId/payroll/period-wages',
    requireAnyPermission('users:manage', 'finance:write', 'finance:read'),
    async (req, res) => {
      const auth = getAuth(req);
      const periodStart = String(req.query.periodStart ?? '');
      const periodEnd = String(req.query.periodEnd ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'periodStart and periodEnd are required (YYYY-MM-DD)',
          },
        });
        return;
      }
      try {
        const wages = await technicianPayrollService.computePeriodWages(
          {
            companyId: auth.companyId,
            userId: auth.userId,
            roleName: auth.roleName,
            permissions: auth.permissions,
          },
          req.params.memberId as string,
          periodStart,
          periodEnd,
        );
        res.json({ data: { wages } });
      } catch (error) {
        handlePayrollError(res, error);
      }
    },
  );

  router.delete('/invites/:inviteId', requireAnyPermission('users:manage'), async (req, res) => {
    const auth = getAuth(req);

    try {
      await teamService.revokeInvite(
        { companyId: auth.companyId, userId: auth.userId },
        req.params.inviteId as string,
      );
      res.json({ data: { success: true } });
    } catch (error) {
      handleTeamError(res, error);
    }
  });

  router.patch(
    '/members/:memberId/status',
    requireAnyPermission('users:manage'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = updateMemberStatusSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid member status payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const member = await teamService.updateMemberStatus(
          { companyId: auth.companyId, userId: auth.userId },
          req.params.memberId as string,
          parsed.data.isActive,
        );
        res.json({ data: { member } });
      } catch (error) {
        handleTeamError(res, error);
      }
    },
  );

  router.post(
    '/members/:memberId/remove-access',
    requireAnyPermission('users:manage'),
    async (req, res) => {
      const auth = getAuth(req);

      try {
        const member = await teamService.removeMemberAccess(
          { companyId: auth.companyId, userId: auth.userId },
          req.params.memberId as string,
        );
        res.json({ data: { member } });
      } catch (error) {
        handleTeamError(res, error);
      }
    },
  );

  router.get(
    '/members/:memberId/delete-eligibility',
    requireAnyPermission('users:manage'),
    async (req, res) => {
      const auth = getAuth(req);

      try {
        const eligibility = await teamService.getMemberDeleteEligibility(
          { companyId: auth.companyId, userId: auth.userId },
          req.params.memberId as string,
        );
        res.json({ data: { eligibility } });
      } catch (error) {
        handleTeamError(res, error);
      }
    },
  );

  router.delete(
    '/members/:memberId',
    requireAnyPermission('users:manage'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = hardDeleteMemberSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Confirmation is required to permanently delete a user',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const result = await teamService.hardDeleteMember(
          { companyId: auth.companyId, userId: auth.userId },
          req.params.memberId as string,
          parsed.data.confirmation,
        );
        res.json({ data: result });
      } catch (error) {
        handleTeamError(res, error);
      }
    },
  );

  router.patch(
    '/members/:memberId/role',
    requireAnyPermission('users:manage', '*'),
    async (req, res) => {
      const auth = getAuth(req);
      const parsed = updateMemberRoleSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid member role payload',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const member = await teamService.updateMemberRole(
          {
            companyId: auth.companyId,
            userId: auth.userId,
            roleName: auth.roleName,
            permissions: auth.permissions,
          },
          req.params.memberId as string,
          parsed.data.roleId,
        );
        res.json({ data: { member } });
      } catch (error) {
        handleTeamError(res, error);
      }
    },
  );

  return router;
}

function handleTeamError(res: import('express').Response, error: unknown) {
  if (error instanceof TeamError) {
    const status =
      error.code === 'ROLE_NOT_FOUND' || error.code === 'ROLE_NOT_ASSIGNABLE'
        ? 400
        : error.code === 'EMAIL_IN_USE'
          ? 409
          : error.code === 'INVITE_NOT_FOUND' || error.code === 'MEMBER_NOT_FOUND'
            ? 404
            : error.code === 'SELF_LOCKOUT' ||
                error.code === 'LAST_OWNER' ||
                error.code === 'SELF_PROMOTION' ||
                error.code === 'SELF_DELETE' ||
                error.code === 'ROLE_ASSIGN_FORBIDDEN'
              ? 403
              : error.code === 'HARD_DELETE_REFUSED' || error.code === 'SEAT_LIMIT_REACHED'
                ? 409
                : error.code === 'CONFIRMATION_MISMATCH'
                  ? 400
                  : error.code === 'FORBIDDEN' || error.code === 'PAYROLL_SETUP_INCOMPLETE'
                    ? 403
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

function handlePayrollError(res: import('express').Response, error: unknown) {
  if (error instanceof TechnicianPayrollError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'NOT_TECHNICIAN'
            ? 400
            : error.code === 'PAYROLL_SETUP_INCOMPLETE'
              ? 422
              : 400;
    res.status(status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  handleTeamError(res, error);
}
