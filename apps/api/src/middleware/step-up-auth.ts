import type { NextFunction, Request, Response } from 'express';
import { verifyStepUpToken } from '@titan/auth';
import type { AuthenticatedRequest } from './auth.js';

type StepUpDeps = {
  jwtSecret: string;
};

/**
 * Requires a recent password/MFA step-up token for sensitive mutations.
 * User stays logged in; only the sensitive action needs re-confirmation.
 */
export function createStepUpMiddleware({ jwtSecret }: StepUpDeps) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      next();
      return;
    }

    const header = req.headers['x-titan-step-up'];
    const token = typeof header === 'string' ? header : undefined;

    if (!token || !verifyStepUpToken(token, jwtSecret, {
      userId: auth.userId,
      companyId: auth.companyId,
      sessionId: auth.sessionId,
    })) {
      res.status(403).json({
        error: {
          code: 'STEP_UP_REQUIRED',
          message: 'Recent password confirmation is required for this action',
        },
      });
      return;
    }

    next();
  };
}

/** Route prefixes that require step-up re-auth before mutation. */
export const SENSITIVE_MUTATION_PREFIXES = [
  '/enterprise-security/policy',
  '/team/members',
  '/integrations/xero/credentials',
  '/release/production',
  '/finance/payments',
  '/finance/invoices/void',
] as const;

export function isSensitiveMutationPath(method: string, path: string): boolean {
  const upper = method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(upper)) {
    return false;
  }

  return SENSITIVE_MUTATION_PREFIXES.some((prefix) => path.startsWith(prefix));
}
