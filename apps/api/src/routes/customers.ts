import { Router } from 'express';
import { z } from 'zod';
import { CUSTOMER_VALUE_CLASSIFICATION_FILTER_KEYS } from '@titan/shared';
import {
  CustomerValueClassificationError,
  type CustomerValueClassificationService,
} from '../services/customer-value-classification.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

type RouterDeps = {
  customerValueClassificationService: CustomerValueClassificationService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

const classificationFilterSchema = z.enum(CUSTOMER_VALUE_CLASSIFICATION_FILTER_KEYS);

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof CustomerValueClassificationError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'VALIDATION_ERROR'
            ? 400
            : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createCustomersRouter({
  customerValueClassificationService,
  jwtSecret,
  authService,
}: RouterDeps): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware({ jwtSecret, authService });

  router.use(requireAuth);

  router.get(
    '/value-metrics',
    requireAnyPermission('customers:read', 'customers:write', 'finance:read', 'finance:write'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const metrics = await customerValueClassificationService.getValueMetrics(companyId);
        res.json({ data: metrics });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    '/',
    requireAnyPermission('customers:read', 'customers:write'),
    async (req, res) => {
      try {
        const { companyId } = getAuth(req);
        const classification =
          typeof req.query.classification === 'string' ? req.query.classification : null;
        const search = typeof req.query.q === 'string' ? req.query.q : null;

        if (classification) {
          const parsed = classificationFilterSchema.safeParse(classification);
          if (!parsed.success) {
            res.status(400).json({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid classification filter',
                details: parsed.error.flatten(),
              },
            });
            return;
          }
        }

        const customers = await customerValueClassificationService.listCustomersWithClassification(
          companyId,
          { classification, search },
        );
        res.json({ data: { customers } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  return router;
}
