import type { NextFunction, Request, Response } from 'express';
import { saasAccessStatusChip } from '@titan/shared';
import type { EnterpriseSaasPlatformService } from '../services/enterprise-saas-platform.service.js';
import type { AuthenticatedRequest } from './auth.js';

let accessService: EnterpriseSaasPlatformService | null = null;

/** Wire once at API boot — evaluates paid-through entitlement after authentication. */
export function configureSaasTenantAccessGate(service: EnterpriseSaasPlatformService): void {
  accessService = service;
}

export function getSaasTenantAccessGateService(): EnterpriseSaasPlatformService | null {
  return accessService;
}

/**
 * Paths that remain reachable when a customer tenant is access-suspended.
 * Auth + access-status only — no operational business APIs.
 */
export function isSaasAccessAllowlistedPath(path: string): boolean {
  const normalized = path.split('?')[0] ?? path;
  if (
    normalized === '/health' ||
    normalized === '/api/health' ||
    normalized === '/api/v1/health' ||
    normalized.startsWith('/api/v1/auth')
  ) {
    return true;
  }
  if (
    normalized === '/api/v1/platform/access-status' ||
    normalized.endsWith('/platform/access-status')
  ) {
    return true;
  }
  return false;
}

/**
 * After staff auth is established, enforce SaaS entitlement for customer tenants.
 * Platform-owner (Young Guns) tenants are never blocked.
 * Paid-through remaining after payment failure keeps access allowed.
 */
export async function enforceSaasTenantAccessGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!accessService) {
    next();
    return;
  }

  const auth = (req as AuthenticatedRequest).auth;
  if (!auth?.companyId) {
    next();
    return;
  }

  const path = req.originalUrl || req.url || req.path;
  if (isSaasAccessAllowlistedPath(path)) {
    next();
    return;
  }

  try {
    const decision = await accessService.syncAccessFromEntitlement(auth.companyId);
    if (decision.allowed) {
      next();
      return;
    }

    res.status(402).json({
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: decision.customerMessage || 'TITAN subscription requires attention.',
        accessState: decision.accessState,
        accountStatus: decision.accountStatus,
        subscriptionStatus: decision.subscriptionStatus,
        paidThroughAt: decision.paidThroughAt,
        statusChip: saasAccessStatusChip(decision),
        blockReason: decision.blockReason,
      },
    });
  } catch {
    // Fail open on evaluator/DB errors so Young Guns staging is never bricked by the gate.
    next();
  }
}
