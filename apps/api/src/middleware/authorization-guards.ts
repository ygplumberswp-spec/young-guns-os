import type { NextFunction, Request, Response } from 'express';
import {
  isPlatformOwner,
  isTechnicianRole,
  type StaffIdentity,
} from '@titan/auth';
import type { DatabaseClient } from '@titan/db';
import { jobs, securityAuditLogs } from '@titan/db';
import { and, eq } from 'drizzle-orm';
import type { AuthenticatedRequest } from './auth.js';
import type { PortalAuthenticatedRequest } from './portal-auth.js';
import { getActiveEnRouteTracking } from '../lib/tracking-privacy.js';

type GuardIdentity = StaffIdentity & {
  userId: string;
  companyId: string;
  sessionId?: string;
};

function getStaffIdentity(req: Request): GuardIdentity | null {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) return null;
  return {
    userId: auth.userId,
    companyId: auth.companyId,
    sessionId: auth.sessionId,
    roleName: auth.roleName,
    permissions: auth.permissions,
  };
}

export async function recordAuthorizationFailure(
  db: DatabaseClient,
  input: {
    companyId: string;
    userId?: string;
    sessionId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<void> {
  await db.insert(securityAuditLogs).values({
    companyId: input.companyId,
    category: 'authorization',
    action: input.action,
    userId: input.userId,
    sessionId: input.sessionId,
    entityType: input.entityType,
    entityId: input.entityId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: input.metadata ?? {},
  });
}

function forbidden(res: Response, message = 'You do not have permission to perform this action') {
  res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message,
    },
  });
}

export function createRequirePlatformOwner(db: DatabaseClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = getStaffIdentity(req);
    if (!identity) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }
    if (!isPlatformOwner(identity)) {
      await recordAuthorizationFailure(db, {
        companyId: identity.companyId,
        userId: identity.userId,
        sessionId: identity.sessionId,
        action: 'platform_owner_required',
        metadata: { path: req.path, roleName: identity.roleName },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      forbidden(res, 'Platform owner access required');
      return;
    }
    next();
  };
}

export function createDenyTechnicianFromOwnerModules(db: DatabaseClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = getStaffIdentity(req);
    if (!identity) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }
    if (isPlatformOwner(identity)) {
      next();
      return;
    }
    if (isTechnicianRole(identity)) {
      await recordAuthorizationFailure(db, {
        companyId: identity.companyId,
        userId: identity.userId,
        sessionId: identity.sessionId,
        action: 'technician_owner_module_denied',
        metadata: { path: req.path, roleName: identity.roleName },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      forbidden(res, 'Technicians cannot access owner modules');
      return;
    }
    next();
  };
}

export function createRequireAssignedJob(db: DatabaseClient, resolveJobId: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = getStaffIdentity(req);
    if (!identity) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }
    if (isPlatformOwner(identity)) {
      next();
      return;
    }
    if (!isTechnicianRole(identity)) {
      next();
      return;
    }

    const jobId = resolveJobId(req);
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, identity.companyId)),
      columns: { id: true, assignedUserId: true },
    });

    if (!job || job.assignedUserId !== identity.userId) {
      await recordAuthorizationFailure(db, {
        companyId: identity.companyId,
        userId: identity.userId,
        sessionId: identity.sessionId,
        action: 'assigned_job_required',
        entityType: 'job',
        entityId: jobId,
        metadata: { path: req.path },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      forbidden(res, 'Job is not assigned to you');
      return;
    }

    next();
  };
}

export function createRequireCustomerOwnership(db: DatabaseClient, resolveCustomerId: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const portalAuth = (req as PortalAuthenticatedRequest).portalAuth;
    if (!portalAuth) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Portal authentication required' } });
      return;
    }

    const customerId = resolveCustomerId(req);
    if (customerId && customerId !== portalAuth.customerId) {
      await recordAuthorizationFailure(db, {
        companyId: portalAuth.companyId,
        userId: portalAuth.portalUserId,
        action: 'customer_ownership_required',
        entityType: 'customer',
        entityId: customerId,
        metadata: { path: req.path, portalCustomerId: portalAuth.customerId },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      forbidden(res, 'You can only access your own customer records');
      return;
    }

    next();
  };
}

export async function assertAssignedTechnician(
  db: DatabaseClient,
  identity: GuardIdentity,
  jobId: string,
): Promise<void> {
  if (isPlatformOwner(identity)) return;
  if (!isTechnicianRole(identity)) return;

  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.companyId, identity.companyId)),
    columns: { assignedUserId: true },
  });

  if (!job || job.assignedUserId !== identity.userId) {
    throw new AuthorizationGuardError('FORBIDDEN', 'Job is not assigned to you');
  }
}

export class AuthorizationGuardError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthorizationGuardError';
  }
}

export { getActiveEnRouteTracking };
